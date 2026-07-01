# 真实多用户访问推进规划

> 模块：Application Service Layer
> 状态：规划草案
> 目标：把当前 dev header user 模式推进到可对真实用户开放的账号、权限、工作区和访问隔离体系。

## 1. 背景判断

当前 DUDesign 已经具备多用户访问的部分底座：

- `users`、`workspaces`、`workspace_members` 已在 PostgreSQL baseline schema 中建模。
- `users.memory_namespace` 已唯一，用于用户级 memory 隔离。
- `ApplicationService` 已有 owner workspace guard，核心 session/job/variation/artifact/share 流程已按用户上下文校验。
- dev/staging 阶段仍使用 header-based user context 和 header-based admin role。

这说明系统已经具备“数据隔离意识”，但还没有达到“真实用户可注册、登录、长期持有会话、按角色访问工作区”的生产访问状态。

## 2. MVP 目标

真实多用户访问 MVP 只解决以下问题：

- 用户可以注册和登录。
- API 可以从可信 session 解析当前用户，而不是依赖 dev header。
- 每个用户自动拥有个人 hosted workspace。
- 用户只能访问自己拥有或被授权的 workspace、session、job、variation、artifact。
- 用户退出登录后，浏览器无法继续访问私有 API。
- 被禁用用户不能继续登录或调用私有 API。
- Admin header-based role 仅保留 dev/staging fallback，production 必须走真实 admin 权限。

MVP 暂不做：

- 完整团队协作 UI。
- 企业 SSO。
- OAuth 第三方登录。
- 复杂组织账单。
- 多 workspace 邀请审批流。
- 实时多人编辑。

## 3. 访问模型

### 3.1 用户身份

生产 API 请求的用户身份来源应按优先级解析：

1. Server-side session cookie。
2. Bearer access token，仅用于后续 API client / automation。
3. Dev header fallback，仅在 `DUDESIGN_AUTH_MODE=dev` 时启用。

建议 MVP 先采用 server-side session cookie：

- cookie 名称：`dudesign_session`
- `HttpOnly`
- `Secure` in production
- `SameSite=Lax`
- session 存储在 PostgreSQL 或 Redis；若先简化，可 PostgreSQL 落表。

### 3.2 用户状态

`users.status` 至少支持：

- `active`
- `disabled`

访问策略：

- `disabled` 用户不能登录。
- 已登录用户被禁用后，下次 API 请求应返回 `USER_DISABLED` 并清理 session。

### 3.3 Workspace 权限

MVP 继续以个人 workspace 为主，但需要把 guard 从“owner only”抽象为“membership-aware”：

| role | 能力 |
| --- | --- |
| owner | 全部读写，管理成员，归档 workspace |
| admin | 读写 workspace，管理 editor/viewer |
| editor | 创建 session/job/refine/export/share |
| viewer | 只读 session/job/artifact/share，不可生成或修改 |

MVP 第一版可以只创建 owner membership，并实现 role guard 抽象；邀请和成员 UI 后续再开放。

## 4. 数据模型补充

现有表已经覆盖大部分字段，但还需要新增或明确：

### 4.1 auth_sessions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | session id |
| user_id | text references users(id) | 登录用户 |
| token_hash | text unique not null | session token hash，不存明文 |
| user_agent | text | 浏览器摘要 |
| ip_hash | text | IP hash，避免明文 IP 默认入库 |
| expires_at | timestamptz not null | 过期时间 |
| revoked_at | timestamptz | 登出或强制失效 |
| created_at | timestamptz not null | 创建时间 |
| last_seen_at | timestamptz not null | 最近访问 |

### 4.2 auth_identities

如 MVP 使用邮箱密码：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | identity id |
| user_id | text references users(id) | 用户 |
| provider | text | `password` / `oauth_google` 等 |
| provider_subject | text | provider 内唯一标识，password 模式可为 email |
| password_hash | text | password provider 使用 |
| verified_at | timestamptz | 邮箱验证时间 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### 4.3 workspace_members

现有 baseline 已建表。需要补 Repository methods：

- `getWorkspaceMembership(userId, workspaceId)`
- `listWorkspaceMembers(workspaceId)`
- `upsertWorkspaceMember(workspaceId, userId, role)`
- `removeWorkspaceMember(workspaceId, userId)`

## 5. API 草案

### 5.1 Auth API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/password/reset/request`
- `POST /api/auth/password/reset/confirm`

MVP 可以先不开放密码重置 UI，但 API 与 token 表设计应预留。

### 5.2 Workspace API

- `GET /api/workspaces`
- `GET /api/workspaces/:id`
- `GET /api/workspaces/:id/members`
- `POST /api/workspaces/:id/members`
- `PATCH /api/workspaces/:id/members/:userId`
- `DELETE /api/workspaces/:id/members/:userId`

MVP 用户端 UI 可只调用 `GET /api/workspaces`，成员管理先作为 Admin/dev 验证接口或后续隐藏能力。

### 5.3 Admin API

- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/sessions/revoke`

生产环境 Admin API 必须从真实用户 session 解析 admin role，不再信任普通 header。

## 6. 权限守卫改造

当前 owner guard 应升级为三层：

1. `requireUser()`
2. `requireWorkspaceAccess(workspaceId, minRole)`
3. `requireResourceAccess(resourceId, action)`

资源动作建议：

| action | 最低 role |
| --- | --- |
| `read` | viewer |
| `create_session` | editor |
| `create_job` | editor |
| `refine_variation` | editor |
| `export_artifact` | editor |
| `share_artifact` | editor |
| `manage_members` | admin |
| `archive_workspace` | owner |

## 7. 渐进实施阶段

### MU-1：Auth Repository 与 Session Cookie

- 新增 `auth_sessions` / `auth_identities` migration。
- 新增 auth repository methods。
- 新增 password hash / verify 工具。
- 新增 session token 生成、hash、cookie set/clear。
- `createRequestContext()` 从 cookie 解析 userId。
- dev header fallback 仅在 `DUDESIGN_AUTH_MODE=dev` 生效。

验收：

- 注册后自动登录。
- 登录后 `GET /api/auth/me` 返回当前用户和默认 workspace。
- 登出后私有 API 返回 401。

### MU-2：Workspace Membership Guard

- 用户注册时创建个人 workspace 和 owner membership。
- 所有 workspace/session/job/artifact 权限从 owner-only 迁移为 membership-aware。
- viewer/editor/admin/owner role guard 单测覆盖。

验收：

- owner 可创建 job。
- viewer 可读但不能 create/refine/share。
- 无 membership 用户访问 workspace 返回 403。

### MU-3：Admin Auth 收口

- MVP 阶段 Admin role 挂到用户 `metadata.adminRole`，支持 `support` / `operator` / `developer`。
- 后续治理增强可迁移到独立 `admin_roles` 表，用于授予/撤销历史、审批和更细权限策略。
- Admin API 从 session user 解析角色，不从普通请求 header 解析。
- header-based admin role 只在 dev mode 有效。
- 所有 Admin 写操作继续写 audit log。

验收：

- 普通用户访问 Admin API 返回 403。
- operator/developer 可执行对应管理操作。
- production mode 下伪造 admin header 无效。

### MU-4：多用户隔离 Smoke

- 新增 API smoke：
  - user A 注册、创建 session/job/artifact。
  - user B 注册，无法读取 A 的 session/job/artifact。
  - user A share public artifact，user B 可通过 share token 只读访问。
  - disabled user 无法继续调用私有 API。
- PostgreSQL no-hydrate 模式跑同一套 smoke。

验收：

- 默认测试门禁覆盖真实多用户访问隔离。
- staging 可以开放给非开发账号试用。

## 8. 风险与决策

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 继续依赖 dev header | 任何人可伪造用户/管理员 | production 强制禁用 dev auth |
| owner-only guard 迁移不彻底 | 团队协作阶段重构成本高 | 先抽象 membership-aware guard，再开放团队 UI |
| session token 明文入库 | 泄露后可直接冒用 | 只存 token hash |
| Admin header 进入 production | 管理端越权 | production mode 下 header role 无效 |
| 多用户测试不足 | 数据串租 | 新增 user A/B 隔离 smoke |

## 9. 建议下一步

优先推进 MU-1。原因：

- 真实用户访问的最大缺口是当前身份来源仍是 dev header。
- User/workspace/session/job/artifact 的数据底座已经较完整，适合开始切 auth boundary。
- MU-1 完成后，后续前端登录页和管理端真实权限才有稳定后端依赖。
