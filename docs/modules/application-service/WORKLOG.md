# 后端业务服务层工作记录

> 模块：Application Service Layer
> 维护方式：按日期追加。记录业务模型、API、状态机、权限和数据迁移。

## 2026-06-26

### 已完成

- 确定后端业务服务层是 DUDesign 的业务事实来源。
- 确定用户、workspace、session、message、design_job、design_variation、artifact、share、memory_note 为首批核心模型。
- 确定 BabeL-O id 只能作为 `runtime_*` 外部引用。
- 确定业务服务层对前端输出 DUDesign 标准 API 和标准事件。
- 确定 runtime 不可用时，已完成 artifact 仍需可预览、导出、分享。
- 创建 `apps/api` 骨架。
- 创建 `@dudesign/domain`，沉淀用户、workspace、session、job、variation、artifact、share 等领域模型。
- 创建 `@dudesign/artifact-store`，定义 artifact 存储抽象接口。
- 创建 `@dudesign/contracts` 的 User API 基础请求/响应类型。

### 决策

- MVP 使用 hosted workspace，不接受本地 cwd。
- 业务服务层不 import BabeL-O 源码。
- User API 和 Admin API 权限边界分开。
- 队列 worker 归业务服务层治理，但调用 runtime 必须经过 Gateway。

### 风险

- 如果没有稳定状态机，job 和 variation 的部分失败会变得难以恢复。
- 如果 artifact 版本管理过弱，refine 后无法回滚和审计。

### 下一步

- 先设计数据库迁移草案。
- 先定义 job/variation 状态机，再写 API。
- 尽早实现 mock Runtime Gateway，支撑前后端并行开发。

## 2026-06-26 M1 Mock API

### 已完成

- 在 `apps/api` 实现 Node 原生 HTTP 服务。
- 新增 `InMemoryStore`，支持 dev user、dev workspace、sessions、messages、jobs、variations、artifacts。
- 新增 `JobEventBus`，支持按 job 缓冲和回放 DUDesign 标准事件。
- 实现 `POST /api/sessions`、`GET /api/sessions`、`POST /api/sessions/:id/resume`。
- 实现 `POST /api/design-jobs`、`GET /api/design-jobs/:id`、`GET /api/design-jobs/:id/stream`。
- 接入 `MockRuntimeGateway.spawnVariationAgents()`，可生成 3/6 个 mock variations。
- 实现 mock artifact 记录和 `GET /api/variations/:id/preview` HTML 预览。
- 验证 `npm run typecheck` 通过。

### 决策

- M1 阶段先使用 Node 原生 HTTP，避免过早绑定生产框架。
- 业务层通过 `MockRuntimeGateway` 驱动状态变化，而不是在 API handler 中硬编码假结果。
- SSE stream 支持事件 buffer 回放，便于页面刷新后恢复生成进度。

### 风险

- 当前 store 是进程内存，服务重启后数据丢失；这是 M1 可接受限制。
- 当前 mock runtime 同步完成很快，后续前端调试可能需要增加事件延迟来模拟真实流式生成。
- 当前尚未覆盖部分失败、取消、retry。

### 下一步

- 为 M1 API 增加 smoke script 或 node:test 集成测试。
- 增加 mock runtime 延迟配置，方便前端观察流式状态。
- 开始用户前端 mock 页面接入这些 API。

## 2026-06-26 M2 Refine API

### 已完成

- 新增 `GET /api/variations/:id`，返回 variation、job、currentArtifact 和 artifact versions。
- 新增 `POST /api/variations/:id/refine`。
- `InMemoryStore.createMockArtifact()` 支持按 variation 递增 version，并记录 parent artifact。
- mock preview HTML 显示当前 artifact version。
- refine smoke 通过：variation 从 artifact v1 生成 v2，预览显示 version 2。

### 下一步

- 将 refine 事件也纳入独立 variation stream 或 job stream 回放策略。
- 增加部分失败和 retry 测试。
- 增加 node:test smoke，避免靠手动 curl 验证。

## 2026-06-26 M3 Annotation API

### 已完成

- 新增 `POST /api/variations/:id/annotations`。
- 新增内存版 `annotationBatches`。
- annotation payload 会被转换成 normalized-coordinate prompt suffix。
- annotation 提交后复用 `refineVariation()` 生成新 artifact version。
- API smoke 通过：提交 rectangle annotation 后 artifact 从 v1 变为 v2，并返回 annotationBatch。

### 下一步

- 增加 annotation schema validation。
- 后续接真实 BabeL-O 时，将 annotation prompt suffix 和当前 artifact 一起注入 runtime context。

## 2026-06-26 M4 API Smoke Regression

### 已完成

- 将 `apps/api/src/server.ts` 拆成 `createApiServer()` 和 `startApiServer()`，避免导入模块时自动监听端口，支持测试环境注入独立 `ApplicationService`。
- 修复已完成 job 的 SSE replay 行为：如果 buffer 中已经存在 `design.job_completed`，回放后立即结束连接。
- 新增 `apps/api/src/mock-flow.test.ts`，覆盖 dev bootstrap、session 创建、3 variation 生成、SSE replay、variation detail、refine、annotation refine、preview HTML。
- 新增根脚本 `npm run test:api` 和 `npm test`。
- 修复 `MockRuntimeGateway` refine artifact id 固定导致同一 variation 第二次 refine 无法递增 artifact version 的问题；mock artifact id 现在带 `jobId` 和递增序列。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`

### 下一步

- 为 annotation payload 增加更严格的 runtime schema validation。
- 增加权限隔离测试，确保 workspace/session/variation 不能跨用户访问。
- 将 API smoke 扩展到 share/export 接口落地后的只读访问链路。

## 2026-06-26 M5 Export and Share API

### 已完成

- 新增 `POST /api/variations/:id/export`，返回当前 mock HTML artifact 内容、版本和下载文件名。
- 新增 `POST /api/variations/:id/share`，创建内存版 share token。
- 新增 `GET /api/shares/:token`，返回只读分享页需要的 variation、artifact、share 信息。
- `InMemoryStore` 增加 `shares` map、`createShare()` 和 `getShareByToken()`。
- API smoke 扩展到 export/share/share detail。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- 本地 HTTP 验证 export/share/share detail 通过。

### 下一步

- 将 export 从单 HTML mock 升级为 zip artifact。
- 将 share token 持久化并支持 revoke、expiresAt、owner 权限校验。
- 分享接口后续应固定 artifact version，避免 share 创建后继续 refine 导致只读页内容漂移。

## 2026-06-26 M6 User Context and Ownership Guard

### 当前情况分析

- 后端业务服务层已推进到 M5，核心 mock 闭环、refine、annotation、export/share 和 smoke regression 已经完成。
- 剩余关键地基是权限隔离、request id、Admin API/审计、runtime unavailable 降级、队列抽象。
- 本轮优先处理权限隔离和 request id，因为它们会影响后续 PostgreSQL、真实登录、Admin API 和管理端治理。

### 已完成

- 新增 `RequestContext` 和 `createRequestContext()`。
- API 从 `x-dudesign-user-id` 解析当前用户，默认仍为 `usr_dev`，便于本地开发。
- API 从 `x-request-id` 解析 request id；没有传入时自动生成 `req_*`。
- 所有响应写入 `x-request-id` header。
- `InMemoryStore` 新增第二个种子用户 `usr_alt` 和工作区 `ws_alt`，用于隔离测试。
- `ApplicationService` 增加用户、workspace、session、job、variation 访问校验。
- session、job、variation、preview、refine、annotation、export、share 均接入 owner guard。
- artifact 创建不再默认写入 dev workspace，而是从 job/variation 反查真实 workspace。
- API smoke 增加：
  - request id 回传断言。
  - `usr_alt` 访问 `usr_dev` job 返回 `JOB_FORBIDDEN`。
  - `usr_alt` bootstrap 返回 `ws_alt`。
  - `usr_alt` session 列表不包含 `usr_dev` 数据。

### 验证

- `npm test`

### 决策

- M1/M2 阶段先使用 header-based dev user context，不引入真实 auth provider。
- 权限校验放在 Application Service 层，而不是只在 HTTP handler 做。

### 下一步

- 增加 share token 权限测试，明确 public/private/password 的 MVP 行为。
- 增加 request log / audit log 基础结构，为管理端操作做准备。
- 设计 PostgreSQL migration 草案，把当前内存模型映射到持久化表。

## 2026-06-26 M7 Admin API and Audit Log

### 已完成

- `RequestContext` 增加 `adminRole`，从 `x-dudesign-admin-role` 解析，支持 `support`、`operator`、`developer`。
- `InMemoryStore` 增加 `auditLogs`、`createAuditLog()`、`listAuditLogs()`。
- 新增 `GET /api/admin/runtime/health`：
  - `support`、`operator`、`developer` 可访问。
  - 返回 Runtime Gateway health 和 contract。
- 新增 `POST /api/admin/jobs/:id/cancel`：
  - 仅 `operator`、`developer` 可访问。
  - 调用 `RuntimeGateway.cancelRuntimeJob()`。
  - 将 job 和未完成 variation 标记为 `cancelled`。
  - 写入 audit log。
- 新增 `GET /api/admin/audit-logs`：
  - 仅 `operator`、`developer` 可访问。
- API smoke 增加：
  - support 可读 runtime health。
  - support 不能 cancel job。
  - operator 可以 cancel queued job。
  - cancel 操作写入 audit log。

### 验证

- `npm test`

### 决策

- M1 管理端权限继续使用 header-based role，后续真实 auth 接入时替换来源，不改变 service 权限边界。
- 管理操作必须经过 Application Service 并写 audit log，不允许管理端绕过业务层。

### 下一步

- 实现 job retry。
- 增加 cost 聚合 Admin API。
- 设计 audit log PostgreSQL 表结构。

## 2026-06-26 M8 Job Retry and Cost Aggregation

### 已完成

- 新增 `GET /api/admin/costs/summary`：
  - `support`、`operator`、`developer` 可访问。
  - 返回全局 job/variation/token/cost 汇总。
  - 返回按 user 聚合的 job/variation/token/cost 统计。
- 新增 `POST /api/admin/jobs/:id/retry`：
  - 仅 `operator`、`developer` 可访问。
  - 基于原 job 的 session、prompt、sourceMode、variationCount、templateRequirements 创建新 job。
  - 复用现有 `createDesignJob()` 流程，确保 retry 仍通过业务服务层和 Runtime Gateway。
  - 写入 `job.retry` audit log，记录原 job 和新 job id。
- API smoke 增加：
  - support 可读取 cost summary。
  - operator 可 retry completed job。
  - retry 生成的新 job 与原 job id 不同，variationCount 一致。
  - retry audit log 记录 `retriedJobId`。

### 验证

- `npm test`

### 决策

- 当前 cost summary 统计的是“当前 variation 快照成本”，不是完整历史账单流水；后续如果需要计费，需要新增 immutable usage events。
- retry 不原地复用旧 job，而是创建新 job，旧 job 保持可审计。

### 下一步

- 设计 immutable usage event / billing event 模型，避免 refine 覆盖 variation 成本导致历史用量不可追溯。
- 设计 PostgreSQL migration 草案，包括 audit log、usage events、shares 固定 artifact version。

## 2026-06-26 M9 Browser CORS Preflight

### 已完成

- 在 UX-M1 真实浏览器 E2E 中发现用户前端跨端口调用 API 时出现 `Failed to fetch`。
- 根因是 `application/json` POST 触发浏览器 CORS preflight，而 API server 没有处理 `OPTIONS`。
- API server 已新增 `OPTIONS` preflight 响应。
- JSON/HTML 响应已补充 `access-control-allow-methods` 和 `access-control-allow-headers`。

### 验证

- `npm run test:ux:e2e`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 下一步

- 后续接入真实鉴权后，CORS 需要从通配 `*` 收敛为环境配置的允许 origin。

## 2026-06-26 M10 API Test Build Freshness

### 已完成

- API workspace 的 `test` 脚本改为 `tsc -b && node --test dist/*.test.js`。
- 根 `test:api` 改为直接调用 API workspace test，避免旧 `dist` 影响单独运行测试。

### 验证

- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

## 2026-06-26 M10 Immutable Usage Events and Schema Draft

### 已完成

- 新增 `UsageEvent` 领域模型，覆盖 `variation.completed`、`variation.refined`、`export.created`、`share.created`。
- `InMemoryStore` 新增 usage event 写入与查询能力。
- variation 生成完成、refine 完成、HTML export、share 创建都会写入不可变 usage event。
- `GET /api/admin/costs/summary` 从“当前 variation 快照成本”切换为“usage event 账本聚合”。
- 管理端 cost summary 类型和展示文案同步切换为 usage events。
- API smoke 增加 usage event count 断言，确保 generation/refine/export/share 都进入账本。
- 新增 `docs/modules/application-service/database-schema.md`，沉淀 PostgreSQL 表草案、索引、迁移顺序和 Repository 切分建议。

### 验证

- `npm test`

### 决策

- variation 上的 token/cost 字段继续保留为 UX 快照，方便结果墙和管理端快速展示。
- 成本统计、后续计费和额度扣减只使用 immutable usage events。
- PostgreSQL 迁移前先抽象 Repository 接口，保留 `InMemoryStore` 作为测试 fake。

### 下一步

- 为 usage event 增加幂等键，避免 runtime event replay 或服务重试导致重复计费。
- 抽象 `ApplicationRepository`，把当前 `InMemoryStore` 从 `ApplicationService` 中剥离。
- 选择 SQL-first migration 工具，并开始落地 PostgreSQL repository。
