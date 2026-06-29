# 后端业务服务层 TODO

> 模块：Application Service Layer
> 面向对象：用户前端、管理端、队列 worker、Runtime Gateway
> 上游依赖：数据库、对象存储、队列、鉴权系统
> 下游输出：User API、Admin API、DesignEvent stream、业务状态快照

## Phase APP-0：服务骨架与基础设施

- [x] 建立 M1 阶段 Node 原生 HTTP API 服务；后续再确认生产框架是 Fastify 还是 Next.js Route Handlers。
- [x] 建立 PostgreSQL schema 草案。
- [x] 建立 PostgreSQL 连接和迁移机制。
  - [x] `PostgresRepository.connect()` 支持 `DATABASE_URL` 连接。
  - [x] `schema_migrations` 记录已应用 SQL migration。
  - [x] `apps/api/db/migrations/*.sql` 作为 SQL-first migration source。
  - [x] `DUDESIGN_REPOSITORY=postgres` 接入应用服务工厂。
  - [x] `DUDESIGN_REPOSITORY_HYDRATE=false` 支持 production no-hydrate mode。
  - [x] 真实 PostgreSQL opt-in smoke 覆盖 hydrate / no-hydrate 双路径。
- [x] 建立对象存储抽象。
- [x] 实现本地 `LocalArtifactStore`，用于 MVP/dev 环境 artifact body 存储。
- [ ] 建立 Redis/Queue 抽象。
  - [ ] 定义 `DesignJobQueue` 接口：`enqueueDesignJob`、`enqueueRefineJob`、`cancelJob`、`getJobState`。
  - [ ] 定义 queue payload schema：`jobId`、`sessionId`、`variationIds`、`sourceArtifactId`、`runtimeSessionId`、`modelServiceId`、`idempotencyKey`。
  - [ ] 实现 dev/test `InMemoryDesignJobQueue`，保持无外部依赖的默认测试门禁。
  - [ ] 实现 production `RedisDesignJobQueue` 或 BullMQ adapter。
  - [ ] 建立 worker entrypoint，统一从队列调用 `ApplicationService` / Runtime Gateway。
  - [ ] 增加 queue retry、dedupe、timeout、dead-letter 策略。
  - [ ] 增加 queue worker 测试和 runtime unavailable 降级测试。
- [x] 建立 M1 阶段统一错误 envelope 和基础错误码。
- [x] 建立 M1 request id 传递；trace id 后续接观测系统。
- [x] 支持 User API CORS preflight。

验收：

- 服务可启动，健康检查可用。
- 本地开发可使用最小依赖跑通用户/workspace CRUD。

## Phase APP-1：Auth、User、Workspace

- [x] 定义用户、workspace、session、job、variation、artifact、share 领域模型。
- [x] 实现用户表。
  - [x] `users` migration 覆盖 `id`、`email`、`name`、`avatar_url`、`status`、`memory_namespace`、`created_at`、`updated_at`。
  - [x] PostgreSQL seed 写入 dev/alt 用户。
  - [x] `getUserById()` 已提供 SQL-native lookup。
  - [x] `memory_namespace` 唯一约束用于用户级 memory 隔离。
- [x] 实现 M1 header-based dev user context。
- [x] 实现个人 hosted workspace 默认创建。
- [x] 实现 workspace owner 校验。
- [x] 预留 `team_id`、workspace member、role。
  - [x] `workspaces.team_id` 已在 baseline migration 中预留。
  - [x] `workspace_members` 表已在 baseline migration 中预留。
  - [x] `workspace_members.role` 已预留 `owner` / `admin` / `editor` / `viewer`。
  - [x] MVP 仍以 owner workspace guard 为主，不开放团队协作 UI。
  - [ ] 后续团队协作阶段再实现 workspace member 写入、邀请、移除和 role-based access guard。

验收：

- 所有 workspace 查询都按当前用户隔离。
- MVP 不暴露团队 UI，但数据模型支持后续扩展。

## Phase APP-2：Session 与 Message

- [x] 实现 `POST /api/sessions`。
- [x] 实现 `GET /api/sessions`。
- [x] 实现 `POST /api/sessions/:id/resume`。
- [x] 实现 M1 内存版 session messages 持久化。
- [x] 实现 runtime unavailable 时的业务快照恢复。

验收：

- 不依赖 BabeL-O 时，也能读取会话和历史消息。
- session resume 返回 jobs、variations、artifacts 关联快照。

## Phase APP-3：Design Job 与 Variation

- [x] 实现 `POST /api/design-jobs`。
- [x] 实现 `GET /api/design-jobs/:id`。
- [x] 实现 M1 内存版 job/variation 状态机。
- [ ] 实现队列入队。
  - [ ] `POST /api/design-jobs` 从直接执行 runtime 改为创建 job 后 enqueue。
  - [ ] worker 消费队列并驱动 variation runtime sessions。
  - [ ] SSE 继续通过 persisted events / event bus 聚合状态。
- [x] 实现 `GET /api/design-jobs/:id/stream`。
- [ ] 实现部分失败状态。

验收：

- 创建 job 时写入 N 个 variation。
- 3/6 variation 并发任务可以被正确追踪。
- 真实 runtime 并行执行时，不同 variation 不共享同一个写入目录。

## Phase APP-4：Artifact、Preview、Export、Share

- [x] 实现 M1 mock artifact 存储记录。
- [x] 将 mock HTML artifact body 写入 `ArtifactStore`，metadata 继续由业务 store 管理。
- [x] 实现 artifact version。
- [x] 实现 mock preview URL 和 HTML preview endpoint。
- [x] 实现 screenshot artifact。
  - [x] HTML artifact 完成后异步生成 desktop / tablet / mobile PNG screenshot artifacts。
  - [x] `design_variations.screenshot_artifact_id` 指向 desktop screenshot，结果墙优先使用。
  - [x] screenshot artifact 通过 `/api/variations/:id/screenshots/:artifactId` 读取。
  - [x] screenshot 生成失败不阻断 job/refine 主流程，错误写入 HTML artifact metadata。
  - [ ] 将当前进程内异步截图生成迁移到 queue worker。
- [x] 实现 mock HTML export。
- [x] 实现 mock `export_zip` artifact。
- [x] variation detail 返回完整 artifact snapshot，并区分 `html` / `asset` / `export_zip`。
- [x] export/share 明确绑定当前 HTML artifact version，避免后续 refine 漂移。
- [x] 支持恢复历史 HTML artifact 为当前版本：`POST /api/variations/:id/versions/:artifactId/restore`。
- [ ] 支持历史 artifact preview URL 显式绑定 `artifactId`。
- [x] 实现 share token。
- [x] 实现 share revoke。
- [x] 实现 share expiresAt 测试。
- [x] 明确 MVP private/password share 行为：公开读取返回 `SHARE_FORBIDDEN`。

验收：

- BabeL-O 不可用时，已完成 artifact 仍可预览、导出、分享。
- share 页面只能只读访问被分享 artifact。

## Phase APP-5：Annotation 与 Refine

- [x] 实现 `POST /api/variations/:id/refine`。
- [x] 实现 `POST /api/variations/:id/annotations`。
- [x] 实现 M1 内存版 annotation_batches。
- [x] 实现 annotation -> prompt suffix 持久化。
- [x] 实现新 artifact version 关联。

验收：

- refine 只影响当前 variation。
- annotation payload 可回放、可审计。

## Phase APP-6：Admin API 与审计

- [x] 实现 M1 Admin API 权限中间件。
- [x] 实现 M1 audit log。
- [x] 实现 job cancel/retry。
- [x] 实现模型服务列表、启停、默认模型治理 API。
- [x] 实现用户级模型访问权限治理 API。
- [ ] 实现模型发现同步 Admin API：`POST /api/admin/models/sync`。
- [ ] 将 runtime/provider 发现结果合并进 `model_services`，保留本地 enabled/default/access 治理字段。
- [ ] 记录模型同步审计日志和最近同步快照。
- [ ] 实现 artifact repair/rebuild preview。
- [x] 实现 runtime health 读取代理。
- [x] 实现 cost 聚合接口。
- [x] 将 cost 聚合口径切换到 immutable usage events。

验收：

- 管理端所有写操作都有审计记录。
- support/operator/developer 权限区分可测试。

## Phase APP-7：业务服务质量门禁

- [ ] Repository 单元测试。
- [ ] Service 状态机测试。
- [x] API 集成 smoke：session -> job -> SSE replay -> variation detail -> refine -> annotation -> preview -> export -> share。
- [x] API 集成 smoke 覆盖 artifact snapshot、ZIP export、share 不漂移、历史版本 restore。
- [x] Owner 权限测试。
- [x] Share token 权限测试。
- [ ] Queue worker 测试。
- [x] Runtime unavailable 降级测试。
- [x] LocalArtifactStore 单元测试。

验收：

- 业务服务层可以独立于真实 BabeL-O 使用 mock Gateway 完成核心流程测试。

## Phase APP-8：持久化迁移准备

- [x] 定义 PostgreSQL 业务表草案。
- [x] 定义 immutable usage event 领域模型。
- [x] 在 generation/refine/export/share 写入 usage event。
- [x] 抽象 Repository 接口，让 `ApplicationService` 不再类型绑定 `InMemoryStore`。
- [x] 建立 PostgreSQL SQL-first baseline migration。
- [x] 实现 PostgreSQL Repository 初版：migration、seed、hydrate、write-through 持久化。
- [x] 增加 PostgreSQL Repository opt-in integration smoke。
- [x] 将 Admin jobs/artifacts/support/cost 查询下沉为 repository query methods。
- [x] 将 session/job/detail/share 等剩余 `ApplicationService` 直接 Map 读取逐步替换为 repository query methods。
- [x] 为 PostgreSQL Repository 实现 SQL-native Admin query methods。
- [x] 为 PostgreSQL Repository 实现 SQL-native user-facing variation/share snapshot methods。
- [x] 为 PostgreSQL Repository 实现 SQL-native session/job/context methods。
- [x] 为 PostgreSQL Repository 实现 SQL-native 基础权限/分享/实体 lookup methods。
- [x] 将 PostgreSQL Repository 从业务写入 write-through 过渡到 SQL-first source-of-truth。
- [x] 将 PostgreSQL Repository 主链路写入从内存 write-through 拆为 SQL-first mutation methods：session、message、job、variation。
- [x] 将 PostgreSQL Repository artifact 写入拆为 SQL-first mutation methods。
- [x] 为 usage event 增加幂等键，避免 runtime event replay 重复计费。
- [x] 将 PostgreSQL Repository usage event 写入拆为 SQL-first mutation method。
- [x] 将 PostgreSQL Repository share/annotation/audit 写入继续拆为 SQL-first mutation methods。
- [x] 梳理 production repository mode：支持关闭 startup hydrate，并验证 no-hydrate API smoke。
- [x] 使用同一套 API smoke 对 InMemoryStore 与 PostgreSQL Repository 跑双实现测试。
- [x] 增加 Runtime unavailable 降级测试。
- [x] 为 model_services / user_model_access 增加 PostgreSQL migration 和 SQL-native Repository methods。

验收：

- 应用服务不直接依赖内存 Map。
- 业务服务重启后，session resume、artifact preview、share link 和 cost summary 可恢复。
