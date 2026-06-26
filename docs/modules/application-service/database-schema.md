# 后端业务服务层数据库 Schema 草案

> 模块：Application Service Layer
> 目标：把当前内存模型迁移到 PostgreSQL 前，先固定业务事实表、外部 runtime 引用、权限隔离和账本口径。
> 状态：MVP 草案。字段命名采用 PostgreSQL `snake_case`，代码领域模型继续使用 TypeScript `camelCase`。

## 设计原则

- DUDesign 数据库是业务事实来源；BabeL-O 只通过 `runtime_*` 外部引用关联。
- 所有用户侧查询必须以 `user_id` 或 `workspace_id` 做权限收敛。
- artifact 采用不可变版本；refine 生成新 artifact，不覆盖旧版本。
- share 固定到创建时的 `artifact_id`，后续 refine 不改变已分享内容。
- usage/cost 使用不可变 `usage_events`，不从当前 variation 快照反推账单。
- MVP 保留 `team_id`、workspace member、role 字段和表结构，但不开放团队协作 UI。

## 核心表

### users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | 用户 id |
| email | text unique not null | 登录邮箱 |
| name | text | 展示名 |
| avatar_url | text | 头像 |
| status | text not null | `active` / `disabled` |
| memory_namespace | text not null unique | 用户独立记忆命名空间 |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

索引：

- `users_email_idx(email)`
- `users_memory_namespace_idx(memory_namespace)`

### workspaces

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | workspace id |
| owner_id | text not null references users(id) | 所有者 |
| team_id | text | 预留团队协作 |
| name | text not null | workspace 名称 |
| mode | text not null | MVP 固定 `hosted` |
| visibility | text not null | `private` / `team` / `public` |
| storage_key | text not null unique | 对象存储前缀 |
| status | text not null | `active` / `archived` |
| metadata | jsonb not null default '{}' | 扩展信息 |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

索引：

- `workspaces_owner_id_idx(owner_id)`
- `workspaces_team_id_idx(team_id)`，MVP 可为空。

### workspace_members

MVP 不开放 UI，但建议提前建表，避免后续团队协作重写权限模型。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| workspace_id | text references workspaces(id) | workspace |
| user_id | text references users(id) | 成员 |
| role | text not null | `owner` / `admin` / `editor` / `viewer` |
| status | text not null | `active` / `invited` / `removed` |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

约束：

- primary key `(workspace_id, user_id)`

### design_sessions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | 会话 id |
| user_id | text not null references users(id) | 所属用户 |
| workspace_id | text not null references workspaces(id) | 所属 workspace |
| title | text not null | 会话标题 |
| mode | text not null | `new_html` / `from_existing_html` |
| source_artifact_id | text references artifacts(id) | 基于已有 HTML 时使用 |
| runtime_session_id | text | BabeL-O 外部 session id |
| memory_scope | text | session 级记忆 scope |
| last_prompt | text | 最近 prompt |
| status | text not null | `active` / `archived` |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

索引：

- `design_sessions_user_updated_idx(user_id, updated_at desc)`
- `design_sessions_workspace_idx(workspace_id)`
- `design_sessions_runtime_session_idx(runtime_session_id)`

### session_messages

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | 消息 id |
| session_id | text not null references design_sessions(id) | 会话 |
| role | text not null | `user` / `assistant` / `system` / `tool` |
| content | text not null | 消息正文 |
| runtime_event_id | text | 对应 runtime 事件 |
| metadata | jsonb not null default '{}' | 附加上下文 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `session_messages_session_created_idx(session_id, created_at)`

### design_jobs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | job id |
| user_id | text not null references users(id) | 所属用户 |
| workspace_id | text not null references workspaces(id) | 所属 workspace |
| session_id | text not null references design_sessions(id) | 父会话 |
| prompt | text not null | 用户需求 |
| source_mode | text not null | `new_html` / `from_existing_html` |
| source_artifact_id | text references artifacts(id) | 输入 HTML artifact |
| variation_count | integer not null | 1 到 6 |
| template_requirements | jsonb not null default '{}' | 风格、端尺寸、备注 |
| status | text not null | `queued` / `running` / `completed` / `failed` / `cancelled` |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

索引：

- `design_jobs_session_created_idx(session_id, created_at desc)`
- `design_jobs_user_updated_idx(user_id, updated_at desc)`
- `design_jobs_status_idx(status)`

### design_variations

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | variation id |
| job_id | text not null references design_jobs(id) | 父 job |
| session_id | text not null references design_sessions(id) | 所属会话 |
| runtime_session_id | text | child runtime session id |
| runtime_agent_id | text | child agent id |
| index | integer not null | 变体序号 |
| title | text | 展示标题 |
| status | text not null | `queued` / `running` / `streaming` / `rendering_preview` / `completed` / `failed` / `cancelled` |
| current_artifact_id | text references artifacts(id) | 当前 HTML artifact |
| preview_url | text | iframe preview URL |
| input_tokens | integer not null default 0 | 当前快照输入 token |
| output_tokens | integer not null default 0 | 当前快照输出 token |
| cost_cents | integer not null default 0 | 当前快照成本 |
| error_code | text | 错误码 |
| error_message | text | 错误说明 |
| created_at | timestamptz not null | 创建时间 |
| updated_at | timestamptz not null | 更新时间 |

约束：

- unique `(job_id, index)`

索引：

- `design_variations_job_idx(job_id)`
- `design_variations_runtime_session_idx(runtime_session_id)`

### artifacts

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | artifact id |
| workspace_id | text not null references workspaces(id) | 所属 workspace |
| session_id | text not null references design_sessions(id) | 所属会话 |
| variation_id | text references design_variations(id) | 所属 variation |
| parent_artifact_id | text references artifacts(id) | refine 前版本 |
| kind | text not null | `html` / `asset` / `screenshot` / `export_zip` |
| version | integer not null | variation 内递增版本 |
| storage_key | text not null unique | 对象存储 key |
| entry_path | text | HTML 入口路径 |
| content_hash | text not null | 内容哈希 |
| size_bytes | bigint not null default 0 | 文件大小 |
| metadata | jsonb not null default '{}' | 截图尺寸、导出参数等 |
| created_at | timestamptz not null | 创建时间 |

约束：

- unique `(variation_id, kind, version)`，`variation_id` 非空时生效。

索引：

- `artifacts_workspace_created_idx(workspace_id, created_at desc)`
- `artifacts_variation_version_idx(variation_id, version desc)`
- `artifacts_parent_idx(parent_artifact_id)`

### annotation_batches

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | annotation batch id |
| variation_id | text not null references design_variations(id) | 被批改变体 |
| artifact_id | text not null references artifacts(id) | 被批改版本 |
| user_id | text not null references users(id) | 提交用户 |
| shapes | jsonb not null | 圈画数据，使用 normalized 坐标 |
| prompt_suffix | text not null | 转换后的补充 prompt |
| created_at | timestamptz not null | 创建时间 |

索引：

- `annotation_batches_variation_created_idx(variation_id, created_at desc)`

### shares

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | share id |
| token | text not null unique | 分享 token |
| artifact_id | text not null references artifacts(id) | 固定分享 artifact |
| variation_id | text not null references design_variations(id) | 来源 variation |
| owner_id | text not null references users(id) | 创建者 |
| visibility | text not null | `public` / `private` / `password` |
| password_hash | text | password share 使用 |
| revoked_at | timestamptz | 撤销时间 |
| expires_at | timestamptz | 过期时间 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `shares_token_idx(token)`
- `shares_owner_created_idx(owner_id, created_at desc)`
- `shares_artifact_idx(artifact_id)`

### usage_events

不可变账本事件。Admin cost summary、后续计费、额度扣减都应基于该表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | usage event id |
| kind | text not null | `variation.completed` / `variation.refined` / `export.created` / `share.created` |
| user_id | text not null references users(id) | 归属用户 |
| workspace_id | text not null references workspaces(id) | 归属 workspace |
| session_id | text references design_sessions(id) | 关联 session |
| job_id | text references design_jobs(id) | 关联 job |
| variation_id | text references design_variations(id) | 关联 variation |
| artifact_id | text references artifacts(id) | 关联 artifact |
| input_tokens | integer not null default 0 | 输入 token |
| output_tokens | integer not null default 0 | 输出 token |
| cost_cents | integer not null default 0 | 成本，单位 cent |
| metadata | jsonb not null default '{}' | runtime 版本、artifact version、share id 等 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `usage_events_user_created_idx(user_id, created_at desc)`
- `usage_events_workspace_created_idx(workspace_id, created_at desc)`
- `usage_events_job_idx(job_id)`
- `usage_events_variation_idx(variation_id)`
- `usage_events_kind_created_idx(kind, created_at desc)`

### audit_logs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | text primary key | audit id |
| request_id | text not null | 请求 id |
| operator_user_id | text not null references users(id) | 操作者 |
| operator_role | text not null | `support` / `operator` / `developer` |
| action | text not null | 例如 `job.cancel`、`job.retry` |
| target_type | text not null | 目标类型 |
| target_id | text not null | 目标 id |
| reason | text | 操作原因 |
| metadata | jsonb not null default '{}' | 附加上下文 |
| created_at | timestamptz not null | 创建时间 |

索引：

- `audit_logs_created_idx(created_at desc)`
- `audit_logs_operator_created_idx(operator_user_id, created_at desc)`
- `audit_logs_target_idx(target_type, target_id)`

## 迁移顺序建议

1. 建 `users`、`workspaces`、`workspace_members`。
2. 建 `design_sessions`、`session_messages`。
3. 建 `design_jobs`、`design_variations`。
4. 建 `artifacts`，再补 `design_sessions.source_artifact_id` 和 `design_variations.current_artifact_id` 外键约束。
5. 建 `annotation_batches`、`shares`。
6. 建 `usage_events`、`audit_logs`。
7. 添加应用层 repository，并用同一套 API smoke 跑 PostgreSQL 与 InMemoryStore 双实现。

## Repository 接口切分

- `UserRepository`：用户、默认 workspace、workspace member。
- `SessionRepository`：session、message、resume snapshot。
- `DesignJobRepository`：job、variation、状态机更新。
- `ArtifactRepository`：artifact version、current artifact 解析。
- `ShareRepository`：share token、revoke、过期。
- `UsageRepository`：usage event 写入和 cost summary 聚合。
- `AuditRepository`：管理端操作审计。

## 下一步落地

- 选择迁移工具：Prisma、Drizzle、Kysely migration 或 node-pg-migrate。当前代码结构更适合先用 SQL-first migration，再封装 repository。
- 新增 `ApplicationRepository` 接口，把 `InMemoryStore` 从业务服务中抽离。
- 保留 InMemoryStore 作为测试 fake，PostgreSQL repository 作为生产实现。
- 为 `usage_events` 添加幂等键策略，避免 runtime event replay 重复计费。
