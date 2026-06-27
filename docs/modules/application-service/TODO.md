# 后端业务服务层 TODO

> 模块：Application Service Layer
> 面向对象：用户前端、管理端、队列 worker、Runtime Gateway
> 上游依赖：数据库、对象存储、队列、鉴权系统
> 下游输出：User API、Admin API、DesignEvent stream、业务状态快照

## Phase APP-0：服务骨架与基础设施

- [x] 建立 M1 阶段 Node 原生 HTTP API 服务；后续再确认生产框架是 Fastify 还是 Next.js Route Handlers。
- [x] 建立 PostgreSQL schema 草案。
- [ ] 建立 PostgreSQL 连接和迁移机制。
- [x] 建立对象存储抽象。
- [x] 实现本地 `LocalArtifactStore`，用于 MVP/dev 环境 artifact body 存储。
- [ ] 建立 Redis/Queue 抽象。
- [x] 建立 M1 阶段统一错误 envelope 和基础错误码。
- [x] 建立 M1 request id 传递；trace id 后续接观测系统。
- [x] 支持 User API CORS preflight。

验收：

- 服务可启动，健康检查可用。
- 本地开发可使用最小依赖跑通用户/workspace CRUD。

## Phase APP-1：Auth、User、Workspace

- [x] 定义用户、workspace、session、job、variation、artifact、share 领域模型。
- [ ] 实现用户表。
- [x] 实现 M1 header-based dev user context。
- [x] 实现个人 hosted workspace 默认创建。
- [x] 实现 workspace owner 校验。
- [ ] 预留 `team_id`、workspace member、role。

验收：

- 所有 workspace 查询都按当前用户隔离。
- MVP 不暴露团队 UI，但数据模型支持后续扩展。

## Phase APP-2：Session 与 Message

- [x] 实现 `POST /api/sessions`。
- [x] 实现 `GET /api/sessions`。
- [x] 实现 `POST /api/sessions/:id/resume`。
- [x] 实现 M1 内存版 session messages 持久化。
- [ ] 实现 runtime unavailable 时的业务快照恢复。

验收：

- 不依赖 BabeL-O 时，也能读取会话和历史消息。
- session resume 返回 jobs、variations、artifacts 关联快照。

## Phase APP-3：Design Job 与 Variation

- [x] 实现 `POST /api/design-jobs`。
- [x] 实现 `GET /api/design-jobs/:id`。
- [x] 实现 M1 内存版 job/variation 状态机。
- [ ] 实现队列入队。
- [x] 实现 `GET /api/design-jobs/:id/stream`。
- [ ] 实现部分失败状态。

验收：

- 创建 job 时写入 N 个 variation。
- 3/6 variation 并发任务可以被正确追踪。

## Phase APP-4：Artifact、Preview、Export、Share

- [x] 实现 M1 mock artifact 存储记录。
- [x] 将 mock HTML artifact body 写入 `ArtifactStore`，metadata 继续由业务 store 管理。
- [x] 实现 artifact version。
- [x] 实现 mock preview URL 和 HTML preview endpoint。
- [ ] 实现 screenshot artifact。
- [x] 实现 mock HTML export。
- [x] 实现 mock `export_zip` artifact。
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
- [x] Owner 权限测试。
- [x] Share token 权限测试。
- [ ] Queue worker 测试。
- [ ] Runtime unavailable 降级测试。
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
- [ ] 将 session/job/detail/share 等剩余 `ApplicationService` 直接 Map 读取逐步替换为 repository query methods。
- [ ] 为 PostgreSQL Repository 实现 SQL-native Admin query methods。
- [ ] 将 PostgreSQL Repository 从 hydrated/write-through 过渡到 async source-of-truth。
- [ ] 增加 usage event 幂等键，避免 runtime event replay 重复计费。
- [ ] 使用同一套 API smoke 对 InMemoryStore 与 PostgreSQL Repository 跑双实现测试。

验收：

- 应用服务不直接依赖内存 Map。
- 业务服务重启后，session resume、artifact preview、share link 和 cost summary 可恢复。
