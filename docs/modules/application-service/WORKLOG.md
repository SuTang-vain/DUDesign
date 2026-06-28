# 后端业务服务层工作记录

> 模块：Application Service Layer
> 维护方式：按日期追加。记录业务模型、API、状态机、权限和数据迁移。

## 2026-06-28 Model Governance PostgreSQL and Runtime Context

### 已完成

- 确认 `Runtime unavailable` 降级测试已实现并通过；修正 application-service TODO 中 Phase APP-7 的残留未勾选项。
- 新增 `0004_model_governance.sql`，为 `model_services` 和 `user_model_access` 建立 PostgreSQL migration。
- `PostgresRepository` 增加 SQL-native 模型治理方法：
  - 用户可选模型列表与默认模型解析。
  - 模型服务基础查找和用户权限判定。
  - 管理端模型列表、启停、默认模型设置。
  - 用户级模型访问配置与 usage 聚合。
- PostgreSQL seed/hydrate 覆盖模型服务和用户模型访问映射。
- Postgres opt-in integration smoke 增加模型治理断言，覆盖 migration、hydrate、SQL query、default model 切换、用户禁用模型。
- `ApplicationService` 将 `modelServiceId/modelId/modelProvider` 从 create job 传入 Runtime Gateway；refine 会从 job 快照恢复同一模型上下文。
- admin retry 会保留原 job 的 `modelServiceId`，避免重试回落到当前默认模型。
- Runtime Gateway 的 generation/refine payload 增加模型上下文字段。
- BabeL-O runtime adapter 将模型上下文写入 Nexus agent metadata，并注入 prompt 的 Model selection 段；同时保留可选顶层 `modelId/modelProvider` 字段，为未来 BabeL-O per-agent model contract 做兼容入口。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 使用本机 `initdb/pg_ctl` 创建临时 PostgreSQL 数据目录。
  - 临时端口：`55432`。
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://127.0.0.1:55432/dudesign_test`。
  - 执行 `npm --workspace @dudesign/api run test` 通过。
  - 覆盖 shared API flow、no-hydrate API flow、PostgresRepository integration、model governance API。
  - 测试后已停止 PostgreSQL 并清理临时数据目录。

### 决策

- DUDesign 不通过全局 runtime config mutation 临时切换 BabeL-O 默认模型，避免 SaaS 并发下不同用户/任务互相串模型。
- 当前 BabeL-O `/v1/agents` contract 未正式声明 per-agent `modelId`；DUDesign 先以 metadata/prompt 透传并保留 adapter 字段，后续需要 BabeL-O 内核提供稳定的 per-request model contract 才能强制真实 provider 切换。

### 下一步

- 推进 BabeL-O runtime contract：正式定义 agent spawn/refine 的 `modelId/providerId` 字段及 contract test。
- 在 DUDesign 管理端继续补模型服务新增/编辑密钥引用、provider health 和用户 usage limit enforcement。
- 将用户侧模型选择与 job/detail 页面联动展示，便于回看每个 variation 使用的模型。

## 2026-06-28 Export Artifact Reuse

### 已完成

- Repository interface 新增 `getExportArtifactForSource()`。
- InMemoryStore 和 PostgresRepository 均支持按 `variationId + sourceArtifactId + export_zip` 查找已有导出 artifact。
- `ApplicationService.exportVariation()` 在同一 source artifact 重复导出时复用已有 `export_zip` artifact。
- `ExportVariationResponse.exportArtifact` 新增可选 `reused` 标记。
- BabeL-O runtime API flow 增加重复导出断言，确认第二次导出复用第一次的 artifact id 和 download url。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- 导出 artifact 绑定 source artifact version；同一 version 重复导出应复用，避免重复写 zip 和重复生成不必要用量。
- refine 生成新 source artifact version 后，后续导出仍会创建新的 export artifact，不影响版本可追溯性。

### 下一步

- 后续如 export zip 逻辑支持更多资产格式，继续保持 source artifact version 作为复用边界。

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

## 2026-06-26 M11 Annotation Prompt Contract

### 已完成

- 将 annotation prompt suffix 生成逻辑从 `ApplicationService` 提取为 `annotationPrompt.ts`。
- 新增 `annotationPrompt.test.ts`，锁定 rect/text 归一化坐标序列化格式。
- `annotateVariation()` 继续通过同一函数生成 prompt suffix，保证浏览器标注和 API smoke 使用同一个契约。

### 验证

- `npm --workspace @dudesign/api run test`
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

## 2026-06-26 M11 LocalArtifactStore

### 已完成

- 在 `@dudesign/artifact-store` 实现 `LocalArtifactStore`。
- 支持 `put()`、`get()`、`getSignedReadUrl()`、`delete()`。
- 本地存储会写入 artifact body 和旁路 metadata JSON，记录 content type、metadata、sha256 hash、size。
- 增加 storage key 规范化和路径逃逸防护，避免 `../` 写出 artifact root。
- API 服务接入 `ArtifactStore`：
  - 默认 artifact root 为 `.dudesign/artifacts`，可通过 `DUDESIGN_ARTIFACT_ROOT` 覆盖。
  - mock variation 生成/refine 时，业务 store 创建 artifact metadata，`LocalArtifactStore` 写入 HTML body。
  - preview、export、share detail 改为从 artifact store 读取 HTML，而不是临时拼接。
- 根测试链路新增 `test:artifact-store`，并在 `npm test` 中先执行。
- `.gitignore` 增加 `.dudesign/`，避免本地 artifact 输出进入版本控制。

### 验证

- `npm test`

### 决策

- 当前阶段保持“业务 metadata 在 Application Service store，artifact body 在 ArtifactStore”边界。
- `LocalArtifactStore` 是 dev/MVP 实现，后续 S3/R2/OSS 实现应复用相同 `ArtifactStore` 接口。
- preview/export/share 都读取同一个 artifact body，保证分享固定 artifact version 时内容不漂移。

### 下一步

- 为 `ArtifactStore` 增加 `copy()` 或 `putMany()`，支撑 export zip 和多文件 HTML 产物。
- 增加 artifact content type 校验与最大文件大小限制。
- 开始设计 S3-compatible ArtifactStore，作为线上部署实现。

## 2026-06-26 M12 Export Zip and Share Controls

### 已完成

- `POST /api/variations/:id/export` 保持原 HTML 返回兼容，同时新增 `exportArtifact`。
- 导出时创建 `export_zip` artifact metadata，并将 mock zip body 写入 `ArtifactStore`。
- `Share` 领域模型新增 `revokedAt`。
- 新增 `POST /api/shares/:token/revoke`：
  - 仅 share owner 可撤销。
  - 撤销后公开读取返回 `SHARE_REVOKED`。
- `GET /api/shares/:token` 增加：
  - revoked 检查。
  - expired 检查。
  - MVP 阶段 `private` / `password` share 公开读取返回 `SHARE_FORBIDDEN`。
- API smoke 覆盖：
  - export zip artifact metadata。
  - share detail 固定 artifact HTML。
  - expired share。
  - private/password share forbidden。
  - 非 owner revoke forbidden。
  - owner revoke 后链接不可读。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- `export_zip` 目前是 mock package body，不是真正 ZIP 二进制；但已经打通 artifact kind、storage、metadata 和 API contract。
- 第一版 MVP 的 private/password share 不做公开鉴权 UI，先返回明确禁止状态，后续由真实登录和 password flow 接管。
- share revoke 是业务状态，不删除 artifact body，保证审计和 owner 历史可恢复。

### 下一步

- 将 mock zip 替换为真实 ZIP 生成。
- 为 share revoke 写入 audit log。
- 为 share 增加 password hash 和一次性访问校验流程。

## 2026-06-26 M13 Share Drift Regression

### 已完成

- API smoke 增加 share 不漂移回归：
  - 创建 public share 时固定 artifact v3。
  - share 创建后继续 refine 当前 variation 到 v4。
  - variation preview 显示 v4。
  - 原 share detail 仍返回创建时 artifact id、artifact v3 和 v3 HTML。
- 调整 admin artifact smoke 断言，不再假设后续 share 都绑定同一个 artifact version。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- share 的事实来源是 `shares.artifactId`，不是 variation 当前 `previewUrl`。
- admin artifact explorer 的 `shareCount` 是每个 artifact version 的引用数，不能用 variation 总分享数做断言。

## 2026-06-26 M14 Repository Contract and PostgreSQL Baseline

### 已完成

- 新增 `ApplicationRepository` 接口，明确业务服务层需要的 repository surface。
- `InMemoryStore` 改为实现 `ApplicationRepository`，继续作为测试/dev fake。
- `ApplicationService` 构造参数从 `InMemoryStore` 收敛为 `ApplicationRepository`。
- `apps/api/src/index.ts` 导出 `ApplicationRepository` 类型。
- 新增 SQL-first PostgreSQL baseline migration：
  - `apps/api/db/migrations/0001_initial_schema.sql`
  - 覆盖 users、workspaces、workspace_members、design_sessions、session_messages、design_jobs、design_variations、artifacts、annotation_batches、shares、usage_events、audit_logs。
  - 包含关键 check constraints、外键、唯一约束和查询索引。

### 验证

- `npm run typecheck`

### 决策

- 本阶段只做 repository contract 与 migration baseline，不引入 PostgreSQL runtime dependency。
- `ApplicationService` 仍可直接访问 repository maps，作为从内存实现迁移到 repository method 的过渡形态。
- 后续 PostgreSQL repository 应先跑与 `InMemoryStore` 相同 API smoke，再替换生产 wiring。

### 下一步

- 把 `ApplicationService` 中直接遍历 Map 的查询逐步下沉到 repository methods。
- 增加 usage event 幂等键和唯一约束。
- 选择 migration runner，并实现 PostgreSQL repository 的连接、事务和 seed bootstrap。

## 2026-06-26 M15 PostgreSQL Repository Bootstrap

### 已完成

- 新增 `PostgresRepository` 初版。
- 支持：
  - `pg` connection pool。
  - `schema_migrations` 表。
  - 按文件顺序执行 SQL migrations。
  - seed 默认 dev/alt user 和 workspace。
  - 从 PostgreSQL hydrate users、workspaces、sessions、messages、jobs、variations、artifacts、shares、annotation_batches、usage_events、audit_logs 到 repository maps。
  - 对 session/message/job/variation/artifact/share/annotation/usage/audit 写操作做 write-through 持久化。
- 新增 `createApplicationServiceFromEnv()`：
  - 默认使用内存 repository。
  - `DUDESIGN_REPOSITORY=postgres` 时要求 `DATABASE_URL` 并启用 `PostgresRepository`。
- `startApiServer()` 改为 async，生产启动会通过 env factory 创建 service。
- API 包新增 `migrate:postgres` 脚本。

### 验证

- `npm run typecheck`

### 决策

- 当前 `PostgresRepository` 是过渡实现：启动时 hydrate 到 Map，写操作 write-through 到 PostgreSQL。
- 这样可以在不大规模重写同步 `ApplicationService` 的前提下，先验证迁移、seed、hydration 和持久化路径。
- 后续正式生产形态应让 PostgreSQL 成为 async source-of-truth，并把 service 中的直接 Map 查询下沉为 repository query methods。

### 下一步

- 用本地 PostgreSQL 跑一条独立 integration smoke，验证重启后 session/job/artifact/share 可恢复。
- 增加 migration runner 测试或 dry-run 校验。
- 逐步替换 `ApplicationService` 中的直接 Map 遍历。

## 2026-06-27 M16 PostgreSQL Integration Smoke

### 已完成

- 新增 `apps/api/src/postgresRepository.test.ts`。
- 使用 `DUDESIGN_POSTGRES_TEST_URL` 作为 opt-in integration test 开关；未配置时自动 skip，不阻塞默认本地测试。
- 测试每次创建独立 PostgreSQL schema，并在结束时 drop schema，避免污染开发库。
- baseline migration 的后置 artifact 外键约束改为幂等 `do` block。
- 真实 PostgreSQL 验证中发现 `close()` 被重复调用时会触发 `Called end on pool more than once`，已修复为幂等 close。
- `PostgresRepository.connect()` 支持 `schema` 参数：
  - 自动创建 schema。
  - 通过 `search_path` 将 migrations、seed、hydrate、write-through 限定到该 schema。
- `PostgresRepository` 增加串行 write queue 和 `flush()`：
  - 保证 session -> job -> variation -> artifact 等外键写入顺序稳定。
  - integration smoke 可以在 close/hydrate 前等待 write-through 全部完成。
- integration smoke 覆盖：
  - migrations + seed。
  - session runtime id 持久化。
  - message/job/variation/artifact/share/usage event 写入。
  - 关闭 repository 后重新 connect + hydrate。
  - session snapshot 恢复。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- 真实 PostgreSQL smoke：
  - 使用 Homebrew PostgreSQL 16 临时数据目录。
  - 临时端口：`55432`。
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`。
  - 执行 `npm --workspace @dudesign/api run test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 使用方式

```bash
DUDESIGN_POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/dudesign_test npm --workspace @dudesign/api run test
```

### 下一步

- 后续把 service 查询逐步下沉到 repository query methods。

## 2026-06-27 M17 Repository Query Methods Baseline

### 已完成

- 将 Admin 查询从 `ApplicationService` 下沉到 `ApplicationRepository` 契约：
  - `listAdminJobs()`
  - `listAdminArtifacts()`
  - `getAdminUserSupport()`
  - `getAdminCostSummary()`
- 为 Admin 查询定义明确 DTO 类型，避免服务层和未来 PostgreSQL SQL-native 实现之间用弱类型传递。
- `InMemoryStore` 实现上述 query methods；`PostgresRepository` 当前通过 hydrate 后的统一 repository 查询路径复用该实现。
- `ApplicationService` 保留鉴权与入口编排，不再直接承载 Admin jobs/artifacts/support/cost 的 Map 聚合逻辑。
- PostgreSQL integration smoke 扩展覆盖：
  - Admin jobs summary。
  - Admin artifacts summary。
  - Admin support user/session summary。
  - Admin cost summary。
- baseline migration 的 artifact 后置外键 guard 增加 schema 限定，避免多 schema 测试或未来隔离 schema 中同名 constraint 互相影响。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- M17 先完成 repository query methods 的契约边界，不立刻把 Admin 查询改写为 PostgreSQL 原生 SQL。
- 当前 `PostgresRepository` 仍是 hydrated/write-through 过渡形态；等 service 直接 Map 读取进一步收敛后，再逐步将高频查询替换为 SQL-native methods。

### 下一步

- 继续把 session/job/detail/share 等非 Admin 读取路径下沉到 repository methods。
- 为 `PostgresRepository` 增加 SQL-native Admin query methods，优先覆盖 jobs/artifacts/cost summary。
- 增加同一套 API smoke 对 InMemoryStore 与 PostgresRepository 的双实现测试。

## 2026-06-27 M18 User-facing Repository Read Models

### 已完成

- 新增用户侧读模型 repository methods：
  - `getVariationDetailSnapshot()`
  - `getCurrentVariationArtifactSnapshot()`
  - `getSharedVariationSnapshot()`
- `InMemoryStore` 实现上述 snapshot 查询。
- `ApplicationService` 的用户侧 variation/share/export 读取路径改为消费 repository snapshots：
  - `GET /api/variations/:id`
  - `POST /api/variations/:id/export`
  - `POST /api/variations/:id/share`
  - `GET /api/shares/:token`
- 保持 API 响应结构、权限校验和错误码语义不变。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api test`

### 决策

- snapshot methods 暂时仍在 hydrated repository 数据上实现，主要目标是先切断 `ApplicationService` 对 Map 聚合结构的直接依赖。
- 后续 `PostgresRepository` 可以优先把这些 snapshot methods 改写为 SQL join 查询，而无需改动 service 层。

### 下一步

- 将 session/workspace/job/variation/artifact 的基础查找和权限上下文继续下沉到 repository methods。
- 为 `getVariationDetailSnapshot()` 和 `getSharedVariationSnapshot()` 增加 PostgreSQL SQL-native 实现。

## 2026-06-27 M19 Repository Lookup Contexts

### 已完成

- 新增基础 lookup/context repository methods：
  - `getUserById()`
  - `getWorkspaceById()`
  - `getPrimaryWorkspaceForUser()`
  - `getSessionById()`
  - `getJobById()`
  - `getVariationById()`
  - `getArtifactById()`
  - `getSessionWorkspaceContext()`
  - `getVariationJobContext()`
  - `getVariationRefineContext()`
  - `getVariationArtifactContext()`
  - `getRuntimeSessionContext()`
- `ApplicationService` 中对 repository 内部 Map 的直接读取已清零。
- 替换范围覆盖：
  - bootstrap workspace 查询。
  - session 创建和恢复。
  - design job 创建。
  - variation refine/annotation/preview。
  - export usage metadata。
  - admin cancel/retry。
  - 权限 helper。
  - mock runtime spawn memory namespace。
  - runtime event side effects。
  - artifact body 写入。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- M19 先完成 service 到 repository 的读边界治理，仍保持 `PostgresRepository` hydrated/write-through 过渡形态。
- 后续 SQL-native 化可以逐个覆盖这些 context methods，不再需要修改 service 层调用点。

### 下一步

- 为高频读模型增加 `PostgresRepository` SQL-native 实现：
  - Admin jobs/artifacts/cost summary。
  - Variation detail/current artifact/shared variation snapshots。
  - Session workspace/refine/runtime contexts。
- 增加同一套 API smoke 对 InMemoryStore 与 PostgresRepository 的双实现测试。

## 2026-06-27 M20 PostgreSQL SQL-native Query Methods

### 已完成

- Repository 读模型契约支持 `MaybePromise`，为 PostgreSQL async SQL-native queries 打开接口空间。
- `ApplicationService` 和 API server 对以下读路径改为 await：
  - Admin jobs/artifacts/support/cost。
  - Variation detail。
  - Current variation artifact。
  - Share variation。
  - Shared variation。
- `PostgresRepository` 新增 SQL-native query methods：
  - `getVariationDetailSnapshot()`
  - `getCurrentVariationArtifactSnapshot()`
  - `getSharedVariationSnapshot()`
  - `listAdminJobs()`
  - `listAdminArtifacts()`
  - `getAdminUserSupport()`
  - `getAdminCostSummary()`
- PostgreSQL integration smoke 增强：
  - hydrate 后先验证 cache 可恢复。
  - 随后清空 hydrated cache。
  - 再调用 SQL-native methods，确保这些查询真实来自 PostgreSQL，而不是继承的内存 Map。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 第一批 SQL-native 查询优先覆盖管理端聚合和用户侧 variation/share 快照，因为这些路径最容易受数据量影响，也最适合用 SQL join/aggregate 表达。
- `getAdminUserSupport()` 暂时采用少量分步 SQL 查询，保持实现清晰；后续可以根据性能再合并为更复杂的聚合 SQL。

### 下一步

- 为 session/job snapshot 与 context methods 增加 SQL-native 实现。
- 建立 API smoke 双实现测试：同一套服务流程分别跑 InMemoryStore 和 PostgresRepository。
- 逐步减少 `PostgresRepository` 对 startup hydrate 的生产依赖。

## 2026-06-27 M21 PostgreSQL SQL-native Session/Job Contexts

### 已完成

- Repository session/job/context 读模型契约支持 `MaybePromise`。
- `ApplicationService` 和 API server 对 job/session/context 读路径改为 await：
  - `resumeSession()`
  - `createDesignJob()`
  - `getDesignJob()`
  - `cancelJobAsAdmin()`
  - `runMockJob()`
  - runtime event side effects。
- `PostgresRepository` 新增 SQL-native methods：
  - `getSessionSnapshot()`
  - `getJobSnapshot()`
  - `getSessionWorkspaceContext()`
  - `getVariationJobContext()`
  - `getVariationRefineContext()`
  - `getVariationArtifactContext()`
  - `getRuntimeSessionContext()`
- PostgreSQL integration smoke 扩展为清空 hydrated cache 后继续验证 session/job/context SQL-native 查询。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- `PostgresRepository` 的核心读模型已基本具备 SQL-native 能力；startup hydrate 仍保留作为过渡和 fallback，但 service 层已经不需要知道 Map 存在。

### 下一步

- 建立同一套 API smoke 双实现测试：InMemoryStore + PostgresRepository。
- 将 `ApplicationService` 的基础 `getUserById/getWorkspaceById/...` 权限查找继续评估是否需要 SQL-native override。
- 梳理生产模式下是否可以关闭 startup hydrate 或改为按需 warm cache。

## 2026-06-27 M22 Dual Repository API Smoke

### 已完成

- 将 API 主链路 smoke 抽成可复用 helper：
  - `apiFlowSmoke.ts`
  - `startApiFlowHarness()`
  - `runApiFlowSmoke()`
- 默认内存实现继续通过 `mock-flow.test.ts` 跑同一套 API flow。
- 新增 `postgres-api-flow.test.ts`：
  - 使用 `DUDESIGN_POSTGRES_TEST_URL` opt-in。
  - 每次创建独立 schema。
  - 用 `PostgresRepository` 注入 `ApplicationService`。
  - 复用同一套 HTTP API flow。
- API flow 不再直接写 `service.store` 创建测试数据，避免测试绑定具体 repository 内部结构。
- admin cancel smoke 对运行速度导致的 200/409 竞态做了稳定处理：
  - 支持及时取消成功。
  - 也支持 job 已完成后的 `JOB_NOT_CANCELLABLE`。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 双实现 smoke 使用同一套 HTTP 级 API flow，而不是复制断言，避免 InMemoryStore 与 PostgresRepository 后续行为漂移。
- PostgreSQL flow 仍保持 opt-in，不进入默认无外部服务门禁。

### 下一步

- 为 `PostgresRepository` 的基础 permission lookup methods 评估是否补 SQL-native override。
- 设计从 hydrated/write-through 到 async source-of-truth 的拆分步骤。
- 增加 usage event 幂等键，避免 runtime event replay 重复计费。

## 2026-06-27 M23 PostgreSQL SQL-native Permission And Share Lookups

### 已完成

- 将 `ApplicationRepository` 基础读取契约放宽为 `MaybePromise`：
  - `getUserById()`
  - `getWorkspaceById()`
  - `getPrimaryWorkspaceForUser()`
  - `getSessionById()`
  - `getJobById()`
  - `getVariationById()`
  - `getArtifactById()`
  - `listSessions()`
  - `getShareByToken()`
  - `revokeShare()`
- `ApplicationService` 权限 guard 异步化：
  - user/workspace/session/job/variation access checks。
  - admin role checks。
  - share revoke owner check。
- API server 对异步服务方法补齐 `await`：
  - `/api/dev/bootstrap`
  - `/api/sessions`
  - `/api/admin/audit-logs`
  - `/api/shares/:token/revoke`
- `PostgresRepository` 新增 SQL-native 基础 lookup：
  - user/workspace/primary workspace/session/job/variation/artifact/share。
  - session list。
  - share revoke。
- PostgreSQL integration smoke 在清空 hydrated cache 后继续验证：
  - 基础实体 lookup 不依赖内存 Map。
  - `listSessions()` 不依赖内存 Map。
  - `getShareByToken()` 和 `revokeShare()` 不依赖内存 Map。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 读路径继续向 SQL source-of-truth 收敛；`PostgresRepository` 仍继承 `InMemoryStore` 以复用 mutation 逻辑，但业务服务不再要求基础 lookup 同步返回。
- startup hydrate 暂时保留，作为从 write-through 迁移到 SQL-first mutation 前的过渡机制。

### 下一步

- 将 PostgreSQL 写入路径拆成 SQL-first mutation methods，逐步减少对 `super.*` mutation 的依赖。
- 为 usage event 增加幂等键，避免 runtime event replay 或重试造成重复计费。
- 评估生产模式是否可以关闭 startup hydrate，或改成仅用于 dev/test 的 warm cache。

## 2026-06-27 M24 PostgreSQL SQL-first Mainline Mutations

### 已完成

- 将 `ApplicationRepository` 主链路 mutation 契约放宽为 `MaybePromise`：
  - `createSession()`
  - `saveSession()`
  - `appendMessage()`
  - `createJob()`
  - `createVariations()`
  - `setJobStatus()`
  - `applyVariationEvent()`
- `ApplicationService` 对上述 mutation 调用补齐 `await`，让 InMemoryStore 与 PostgresRepository 共用同一套服务层代码。
- `PostgresRepository` 主链路 mutation 改为 SQL-first：
  - 先构造领域对象。
  - 先写 PostgreSQL。
  - 写入成功后同步 hydrated cache 作为过渡。
- 保留 `writeTail` 串行队列，并新增 `withWrite()`，用于 create job 这类多表写入的顺序一致性。
- 修正 `getSessionWorkspaceContext()` 和 `getRuntimeSessionContext()` 的 SQL alias：
  - 不再让 `workspaces.mode = hosted` 覆盖 `design_sessions.mode = new_html/from_existing_html`。
  - 避免 SQL-first `createJob()` 回写 session 时触发 session mode check constraint。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- mutation 合约进入 async-ready 状态，后续 repository 可以继续把写入移动到 SQL source-of-truth，而不需要再次大改服务层调用方式。
- 本轮只拆 session/message/job/variation 主链路写入，artifact/share/annotation/usage/audit 仍保留 write-through 过渡，避免一次性扩大风险面。

### 下一步

- 将 artifact 写入改为 SQL-first，重点处理版本号生成和 `(variation_id, kind, version)` 唯一约束冲突。
- 将 usage event 增加幂等键并改为 SQL-first，避免 runtime replay 重复计费。
- 最后处理 share/annotation/audit 的 SQL-first 写入，并评估关闭 startup hydrate。

## 2026-06-27 M25 PostgreSQL SQL-first Artifact Mutations

### 已完成

- 将 artifact mutation 契约放宽为 `MaybePromise`：
  - `createMockArtifact()`
  - `createArtifact()`
  - `saveArtifact()`
- `ApplicationService` 对 artifact 创建和保存补齐 `await`：
  - preview-ready artifact。
  - completed/refine artifact。
  - LocalArtifactStore 写入后的 artifact metadata 回存。
  - export zip artifact 创建。
- `PostgresRepository` artifact 写入改为 SQL-first：
  - `createMockArtifact()` 通过 PostgreSQL 查询当前 variation/html 最大版本号后生成下一版本。
  - `createArtifact()` 先构造 artifact，再写入 PostgreSQL，最后同步 cache。
  - `saveArtifact()` 先写 PostgreSQL，再同步 cache。
- 保留 `(variation_id, kind, version)` 唯一约束作为最终保护，API smoke 已覆盖 version 1 到 version 4 的连续生成和分享不漂移。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- artifact 版本号由 SQL source-of-truth 生成，避免 hydrated cache 缺失时重复从 v1 开始。
- 本轮仍不处理 share/annotation/usage/audit mutation；这些会在后续拆分，usage event 需要先补幂等键。

### 下一步

- 优先为 usage event 设计并落地幂等键，再改为 SQL-first 写入。
- 继续将 share/annotation/audit 写入拆为 SQL-first。
- 最后评估关闭 startup hydrate 或改成 dev/test warm cache。

## 2026-06-27 M26 Usage Event Idempotency And SQL-first Write

### 已完成

- 为 `UsageEvent` 增加 `idempotencyKey` 领域字段。
- 新增 migration：
  - `0002_usage_event_idempotency.sql`
  - `usage_events.idempotency_key`
  - `usage_events_idempotency_key_idx` unique index。
  - 旧数据用 `id` 回填，确保迁移兼容。
- `ApplicationService` 为 usage 写入生成稳定幂等键：
  - `variation.completed/refined`：按 `kind + job + variation + artifact`。
  - `export.created`：按 `export artifact + source artifact`。
  - `share.created`：按 `share id`。
- `InMemoryStore.createUsageEvent()` 支持按 `idempotencyKey` 去重。
- `PostgresRepository.createUsageEvent()` 改为 SQL-first：
  - `insert ... on conflict (idempotency_key) do nothing returning *`
  - 冲突时读取既有 usage event 返回。
  - 同步 hydrated cache，但 PostgreSQL 是写入 source-of-truth。
- PostgreSQL integration smoke 增加重复 usage 写入，确认不会重复计费。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- usage event 是计费口径，优先保证幂等可信；runtime replay、retry、resume 触发同一业务事件时不会重复累计成本。
- 用户明确创建新的 export 或 share 会有新的业务对象 id，因此仍会生成新的 usage 记录。

### 下一步

- 继续将 share/annotation/audit 写入拆为 SQL-first。
- 在 share 写入 SQL-first 后，复查 share.created usage 的幂等键是否需要绑定 token 或 share id 即可。
- 最后评估 production 模式关闭 startup hydrate。

## 2026-06-27 M27 Share Annotation Audit SQL-first Writes

### 已完成

- 将剩余 write-through mutation 契约放宽为 `MaybePromise`：
  - `createShare()`
  - `createAnnotationBatch()`
  - `createAuditLog()`
- `ApplicationService` 对 share、annotation、audit 写入补齐 `await`。
- `PostgresRepository` 改为 SQL-first：
  - `createShare()` 先写 `shares`，再同步 cache。
  - `revokeShare()` 先更新 `shares.revoked_at`，再同步 cache。
  - `createAnnotationBatch()` 先写 `annotation_batches`，再同步 cache。
  - `createAuditLog()` 先写 `audit_logs`，再同步 cache。
- 至此业务写入主路径已经从内存 write-through 迁移为 PostgreSQL SQL-first source-of-truth；startup hydrate 仍保留为 warm cache/兼容过渡。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- share.created usage 的幂等键继续绑定 `share.id`；SQL-first share 创建后，该 id 是明确业务对象标识。
- annotation 和 audit 暂不增加独立幂等键；annotation 是用户动作，audit 是管理操作记录，后续如引入 request-level retry 再补 request id 维度去重。

### 下一步

- 评估 production 模式关闭 startup hydrate，或将 hydrate 限定为 dev/test warm cache。
- 增加 Runtime unavailable 降级测试，验证 runtime 不可用时已落库的 preview/export/share/resume 仍可用或返回明确降级提示。

## 2026-06-27 M28 Production Repository Hydrate Mode

### 已完成

- `PostgresRepository.connect()` 新增 `hydrateOnStart` option：
  - 默认 `true`，保持 dev/test 兼容。
  - `false` 时仅执行 migration + seed，不再 startup hydrate 全量业务数据。
- `createApplicationServiceFromEnv()` 支持：
  - `DUDESIGN_REPOSITORY=postgres`
  - `DATABASE_URL=...`
  - `DUDESIGN_REPOSITORY_HYDRATE=false`
- PostgreSQL API flow 增加 no-hydrate smoke：
  - 同一套 `runApiFlowSmoke()`。
  - 一个 schema 跑默认 hydrate。
  - 一个 schema 跑 `hydrateOnStart: false`。
- 验证无 startup hydrate 时，核心 API 仍通过：
  - bootstrap。
  - session create/resume。
  - parallel variation generation。
  - preview/refine/annotation。
  - export/share/revoke。
  - admin jobs/artifacts/support/cost/audit。

### Repository Mode 决策

- dev/test：默认继续 hydrate，便于调试和保留过渡期内存观测能力。
- production：推荐设置 `DUDESIGN_REPOSITORY_HYDRATE=false`，让 PostgreSQL 成为明确 source-of-truth，避免启动时全量加载业务数据。
- hydrate 后续保留为 warm cache/debug 能力，不再作为业务正确性的依赖。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 包含 startup hydrate 与 no-hydrate 两套 API smoke。
  - 测试后已停止 server 并清理临时数据目录。

### 下一步

- 推进 M29 Runtime unavailable 降级测试：
  - 已完成 session 可 resume snapshot。
  - preview/export/share 仍可读取 artifact。
  - 新生成任务返回明确 runtime unavailable 或 queued/degraded 状态。

## 2026-06-27 M29 Runtime Unavailable Degradation Test

### 已完成

- 新增 `runtime-unavailable.test.ts`。
- 增加 `UnavailableRuntimeGateway` 测试替身：
  - `createSession()` 抛出 runtime unavailable。
  - `resumeSession()` 返回 `{ status: 'unavailable' }`。
  - `spawnVariationAgents()` / `refineVariation()` 抛出 runtime unavailable。
- `ApplicationService.createSession()` 支持 runtime create 降级：
  - DUDesign session 仍创建成功。
  - `runtimeSessionId` 为 `null`。
- `runMockJob()` 在 runtime spawn 失败时：
  - job 标记为 `failed`。
  - variation 标记为 `failed`。
  - errorCode 为 `RUNTIME_UNAVAILABLE`。
  - 不再让后台 promise 以未处理异常方式结束。
- 测试覆盖 runtime 不可用时：
  - 已完成 session 可 resume snapshot，runtime 状态为 unavailable。
  - preview 仍可读取已落库 artifact。
  - export 仍可读取 artifact 并生成导出。
  - share 仍可创建并只读访问。
  - 新建 session 不阻塞，但 runtimeSessionId 为 null。
  - 新生成任务最终明确 failed，并写入 RUNTIME_UNAVAILABLE。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 包含 startup hydrate、no-hydrate 与 runtime unavailable degradation 测试。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- runtime 不可用时，已完成数据读取能力不依赖 BabeL-O。
- 新任务不假装成功：当前 MVP 选择明确 failed + RUNTIME_UNAVAILABLE，后续如引入队列 worker 可扩展为 queued/degraded retry。

### 下一步

- 可以收口提交 M23-M29 后端服务层数据底座改动。
- 下一阶段建议转入 runtime gateway contract adapter / BabeL-O 兼容层联调。

## 2026-06-28 M30 Model Governance Foundation

### 已完成

- 领域模型新增：
  - `ModelService`
  - `UserModelAccess`
  - `ModelCapability`
  - `ModelServiceProvider`
- API contract 新增：
  - 用户可选模型列表响应。
  - 管理员模型服务响应。
  - 用户模型访问权限响应。
  - `CreateDesignJobRequest.modelServiceId`。
- Repository interface 新增模型治理方法：
  - `listUserModelOptions()`
  - `getModelServiceById()`
  - `canUserUseModel()`
  - `listAdminModels()`
  - `updateAdminModel()`
  - `getAdminUserModelAccess()`
  - `updateUserModelAccess()`
- InMemoryStore 新增 seed model services：
  - `mdl_babelo_default`
  - `mdl_babelo_fast`
  - `mdl_mock_design`
- 用户 API 新增：
  - `GET /api/models`
  - `GET /api/dev/bootstrap` 返回当前用户可用模型。
- 创建 design job 时：
  - 校验用户是否可使用请求的 `modelServiceId`。
  - 未传 model 时使用用户可用默认模型。
  - 将 `modelServiceId`、`modelId`、`modelProvider` 写入 `templateRequirements`。
  - usage event metadata 写入模型标识，供后续成本/用量治理聚合。
- Admin API 新增：
  - `GET /api/admin/models`
  - `PATCH /api/admin/models/:modelServiceId`
  - `GET /api/admin/users/:userId/models`
  - `PATCH /api/admin/users/:userId/models/:modelServiceId`
- 管理端模型写操作写入 audit log：
  - `model.update`
  - `user_model_access.update`
- 新增 `model-governance.test.ts`：
  - 用户可获取模型列表。
  - 禁用用户某模型后，使用该模型创建 job 返回 `MODEL_FORBIDDEN`。
  - operator 可启停模型并设置默认模型。
  - admin 可查看用户模型访问和 usage 摘要。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- `npm test`

### 决策

- 模型配置和用户授权属于后端业务服务层事实来源，用户端只消费可用模型列表。
- 当前 MVP 不在前端暴露 provider secret/API key；这些敏感配置后续应由安全配置系统或服务端 env 管理。
- 本轮先用 InMemoryStore 建立产品和 API 契约；PostgreSQL migration / SQL-native query methods 作为下一阶段收口。

### 下一步

- 增加 `model_services`、`user_model_access` PostgreSQL migration。
- 为 PostgresRepository 实现 SQL-first model governance methods。
- 将 `modelServiceId` 传入 Runtime Gateway/Adapter，使 BabeL-O child session 真正按选择模型执行。
- 增加 Admin/User 前端 E2E 覆盖模型选择和模型开关。
