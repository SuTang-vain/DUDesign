# 管理员/开发者前端交互层工作记录

> 模块：Admin & Developer Console Layer
> 维护方式：按日期追加。记录治理能力、权限变更、审计要求和排障经验。

## 2026-06-26

### 已完成

- 确定管理端是独立治理层，不与用户端混用职责。
- 确定管理端必须通过 Admin API 操作，不得绕过业务服务层。
- 确定管理端首批模块：Job Monitor、Runtime Health、Artifact Explorer、User Support、Cost Dashboard、Memory Governance、Audit Log。
- 确定管理端角色初稿：support、operator、developer。
- 创建 `apps/admin` 独立应用骨架，后续管理端与用户端分离治理。

### 决策

- 管理端不是后门，所有写操作必须审计。
- 管理端可展示更多诊断信息，但仍不能泄漏密钥、敏感 env、内部路径和未经授权的用户 HTML 全文。

### 风险

- 如果管理端过早直接读 runtime 或数据库，会破坏四层治理边界。
- support 场景需要平衡排障效率和用户内容隐私。

### 下一步

- 在 Admin API 初稿确定后，细化 Job Monitor 和 Runtime Health 的字段。
- 尽早定义审计日志 schema。

## 2026-06-26 ADM-M1 Runtime Health and Audit Console

### 已完成

- 将 `apps/admin` 从 TypeScript 空壳升级为独立 Next.js 应用，端口 `3002`。
- 新增 Admin API client：
  - `getRuntimeHealth()`
  - `getAuditLogs()`
  - `cancelJob()`
- 新增管理端首页，包含：
  - Runtime Health 面板。
  - Required Endpoints 面板。
  - Cancel Job 操作面板。
  - Audit Log 面板。
  - support/operator/developer 角色切换。
- 页面遵守管理端边界：只调用 Application Service Admin API，不直连 runtime、数据库或队列。
- `support` 角色只能查看 runtime health，audit log 面板显示 restricted。
- `operator/developer` 可以 cancel job 和查看 audit logs。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `next start --port 3002` 后访问首页返回 200。

### 决策

- 管理端采用安静、信息密度较高的控制台风格，不沿用用户端的大型 hero 构图。
- 管理端 M1 先聚焦 runtime health、job cancel、audit log；完整 Job Monitor 列表后续需要后端提供 admin job listing API。

### 风险

- 当前管理端 role 由请求 header 模拟，后续必须接真实 auth/role。
- 目前没有 job listing，只能手动输入 job id 取消。

### 下一步

- 后端补 `GET /api/admin/jobs` 后，管理端实现 Job Monitor 列表和筛选。
- 增加 artifact explorer 的只读视图。

## 2026-06-26 ADM-M2 Job Monitor and Cost Console

### 已完成

- 新增管理端 Job Monitor 面板：
  - 展示 design job 列表。
  - 展示 job 状态、variation 完成/失败数量、artifact 数量、token 和成本摘要。
  - 支持 status 筛选。
  - 支持从列表直接 cancel job。
  - 支持从列表发起 job retry。
- 新增 Cost Summary 面板：
  - 展示 job、variation、token、cost 聚合。
  - 展示按用户聚合的成本基础数据。
- 管理端继续只调用 Application Service Admin API。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- M2 先实现 job 级运维动作，variation 级 retry 留到后续 runtime child session 控制能力更明确后推进。
- 成本治理先做全局和用户维度聚合，workspace、模型、时间范围筛选留到持久化数据库阶段。

### 风险

- 当前 in-memory store 只能验证业务形态，真实成本统计需要 PostgreSQL 查询和账单口径校准。
- 角色仍由 header 模拟，生产实现必须接入真实登录态和权限系统。

### 下一步

- 增加 Artifact Explorer 的只读元数据视图，用于排查预览、导出和分享问题。

## 2026-06-26 ADM-M3 Artifact Explorer Metadata

### 已完成

- 后端新增 `GET /api/admin/artifacts`：
  - 支持按 `jobId`、`variationId`、`kind` 过滤。
  - 返回 artifact 元数据：version、hash、size、storage_key、entry_path、preview_url、share_count。
  - 不返回 HTML 全文，保持 support/debug 场景的最小暴露原则。
- 管理端新增 Artifact Explorer 面板：
  - 支持输入 job id 过滤。
  - 支持按 artifact kind 过滤。
  - 展示 storage key、hash、版本、大小、分享数量和预览入口。
- API mock flow 增加 admin artifact listing 断言。
- 修复 admin 表格在移动端的单列降级样式。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- Artifact Explorer 的 MVP 只做只读元数据，不开放 HTML 正文查看。
- Preview 链接复用业务服务已有预览 URL；后续如需重建截图、修复导出、撤销分享，仍必须走 Admin API 并写审计日志。

### 风险

- 当前 artifact share_count 来自内存扫描；数据库阶段需要索引和分页。
- revoke share、export repair、rebuild screenshot 尚未实现，排障闭环还不完整。

### 下一步

- 推进 User Support 面板：按用户查询 sessions、查看 resume 状态和失败摘要。
- 推进敏感信息脱敏规则与测试，避免管理端日志或 artifact metadata 泄漏内部路径/用户内容。

## 2026-06-26 ADM-M4 User Support Summary

### 已完成

- 后端新增 `GET /api/admin/support/users`：
  - 支持按 `userId` 或 `email` 查询用户。
  - 返回用户、workspace、session 的排障摘要。
  - 返回 session resume 状态：`runtime_session_available` / `runtime_session_missing`。
  - 返回 latest job、variation 状态聚合、失败数量和失败示例。
  - 只返回 prompt preview，不返回 session messages 全文或 HTML 全文。
- 管理端新增 User Support 面板：
  - 支持输入 user id 或 email 查询。
  - 展示用户状态、workspace 数量、session 列表。
  - 展示 resumable/missing runtime、latest job 状态、variation 完成/失败计数。
  - 展示客服可读的 severity 和失败摘要。
- API mock flow 增加 user support summary 断言。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- User Support 首版只做排障摘要，不展示用户聊天全文和 HTML 正文。
- support/operator/developer 都可以读取该只读摘要；后续接真实 RBAC 后再细分字段级权限。
- 用户问题说明暂不自动生成，先保留为后续能力，避免在缺少真实错误分类前生成误导性结论。

### 风险

- 当前失败摘要来自 in-memory 状态聚合，生产阶段需要按数据库索引和事件日志生成。
- 目前 prompt preview 仍属于用户内容摘要，后续需要补敏感信息脱敏规则和字段级权限。

### 下一步

- 定义并实现管理端敏感信息脱敏规则。
- 增加 Memory Governance 只读视图，验证 memory namespace 不跨用户。

## 2026-06-28 ADM-M5 Model Governance Console

### 已完成

- Admin API client 新增：
  - `getAdminModels()`
  - `updateAdminModel()`
  - `getUserModelAccess()`
  - `updateUserModelAccess()`
- 管理端首页新增 Model Services 面板：
  - 展示 provider、model id、display name、description。
  - 展示 enabled/default 状态。
  - 展示 capabilities、context window 和 token cost 配置。
  - 支持开启/关闭模型服务。
  - 支持设置默认模型。
- 管理端首页新增 User Model Access 面板：
  - 按 user id 查询模型访问权限。
  - 展示 allow/block 状态。
  - 展示 daily token limit、monthly cost cap。
  - 展示该用户在对应模型上的 usage 摘要。
  - 支持 allow/block 单个用户的单个模型。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- 模型治理属于管理端治理面，不允许前端用户绕过业务服务层启用不可用模型。
- 管理端写操作继续走 Admin API，并写入 audit log。
- 当前只实现 enabled/default/access 这类安全开关；provider secret、API key 等敏感配置不进入前端明文展示。

### 下一步

- 增加模型治理管理端 E2E。
- 在真实 RBAC 接入后拆分 support/operator/developer 对模型治理字段的权限。
- 后续补模型成本按时间范围、workspace、model 的聚合过滤。

## 2026-06-28 ADM-M5.1 Model Discovery Planning

### 现状确认

- 当前 Model Services 面板展示的是 DUDesign 后端 `model_services` 治理配置。
- 现有 `BabeL-O Default`、`BabeL-O Fast`、`Mock Design Runtime` 来自 seed/config，并不是从 BabeL-O 或模型供应商动态发现的真实模型列表。
- `Refresh models` 当前语义是重新读取 Admin API 的模型治理表，不会触发 runtime/provider 模型同步。

### 规划调整

- Model Services 后续需要同时展示两类信息：
  - DUDesign 治理配置：enabled/default、用户访问权限、限额、成本配置。
  - 真实模型发现结果：runtime/provider 返回的 model id、上下文窗口、能力、价格、可用状态、最近同步时间。
- 管理端需要把 `source` 显示出来，避免把 seed/config 模型误认为真实 provider 模型。
- `Refresh models` 后续应升级为显式同步动作，调用 Admin API 触发 runtime/provider discovery，并写入 audit log。

### 下一步

- 等后端提供 `/api/admin/models/sync` 后，把按钮语义从本地 refresh 改成同步真实模型。
- 在模型行中展示 `source`、`lastSyncedAt`、`runtimeStatus`、`drift`。
- 增加模型同步成功、失败、权限不足的管理端 E2E。

## 2026-06-29 ADM-M6 Admin Redaction Guardrails

### 已完成

- 新增共享脱敏模块 `apps/api/src/adminRedaction.ts`：
  - 邮箱替换为 `[redacted-email]`。
  - `api_key`、`secret`、`token`、`password`、Bearer token、常见 key 前缀替换为 `[redacted-secret]`。
  - 本地绝对路径替换为 `[redacted-path]`。
- Admin API 输出接入脱敏：
  - Job Monitor 的 prompt 摘要脱敏。
  - User Support 的 `lastPromptPreview` 脱敏。
  - User Support 的失败示例 error message 脱敏。
  - Artifact Explorer 的 `storageKey` 统一经过路径脱敏。
- InMemoryStore 和 PostgresRepository 两条 repository 路径都接入同一套脱敏 helper，避免 mock 与生产路径行为分叉。
- API flow smoke 增加端到端脱敏断言，覆盖邮箱、secret token、本地绝对路径。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- 管理端只展示排障摘要，不展示用户聊天全文和 HTML 全文。
- 脱敏放在 Admin API 输出路径，而不是前端展示层，避免非浏览器消费者绕过保护。
- 当前规则优先覆盖高风险明文：邮箱、密钥样式值、本地路径。后续可以继续扩充手机号、URL query secret、公司内部域名等规则。

### 风险

- 正则脱敏无法证明覆盖所有隐私数据，后续需要引入结构化敏感字段标记和审计采样。
- prompt preview 仍是用户内容摘要，真实 RBAC 接入后应进一步限制 support/operator/developer 字段可见性。

### 下一步

- 增加 Memory Governance 只读视图，验证每个用户的 memory namespace 隔离。
- 增加 runtime contract mismatch 展示测试，补齐管理端兼容性质量门禁。

## 2026-06-29 ADM-M7 Memory Governance Readonly

### 已完成

- 后端新增 `GET /api/admin/memory`：
  - 支持按 `userId` 或 `email` 过滤。
  - 返回用户 memory namespace。
  - 返回 `isolated`、`namespace_conflict`、`missing_namespace` 隔离状态。
  - 返回 workspace、session、runtime session、job 关联计数。
  - 返回 memory refs / memory notes 能力状态，不伪造未落库的 memory note 数据。
- `ApplicationRepository` 新增 `getAdminMemoryGovernance()`。
- InMemoryStore 和 PostgresRepository 均实现 memory governance 只读查询。
- 管理端新增 Memory Governance 面板：
  - 展示用户级 namespace。
  - 展示全局 isolated/conflict/missing 统计。
  - 展示 runtime session 覆盖率和 memory refs/notes capability。
- API flow smoke 增加 memory namespace isolation 断言，覆盖 `usr_dev` 与 `usr_alt` 独立 namespace。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- MVP 阶段先做“可观测隔离”，不展示 memory 正文。
- 当前系统还没有 memory note 表，因此 approval record 明确保留为 `not_configured`，避免管理端展示虚假的审批数据。
- memory refs 目前主要来自 runtime event stream，治理面先标记为 `event_stream_only`。

### 风险

- 如果 BabeL-O 后续返回 memoryRefs 但事件不带 jobId，当前 JobEventBus 不会持久缓存，需要补 session-level memory event sink。
- 真正的 memory hit/candidate、审批记录、跨用户泄漏检测，需要落 memory_notes / memory_events 表后再完善。

### 下一步

- 增加 runtime contract mismatch 展示测试，补齐管理端兼容性质量门禁。
- 设计 memory_notes / memory_events 持久化 schema，再升级 Memory Governance 面板的 hit/candidate/approval 视图。

## 2026-06-29 ADM-M8 Runtime Contract Mismatch Gate

### 已完成

- 新增 `apps/api/src/admin-runtime-health.test.ts`：
  - 注入 `ContractMismatchRuntimeGateway`。
  - 请求 `GET /api/admin/runtime/health`。
  - 断言 Admin API 返回 `runtime.status = contract_mismatch`。
  - 断言 Admin API 返回 `contract.status = contract_mismatch`。
  - 断言 mismatch message 和 required endpoint 仍可被管理端消费。
- 管理端现有 Runtime Health 面板已经支持 `contract_mismatch` status pill 样式；本轮通过 `next build` 验证类型与渲染路径未破坏。

### 验证

- `npm run test:api`
- `npm --workspace @dudesign/admin run build`

### 决策

- mismatch 场景先以 Admin API contract test 作为质量门禁，避免因为缺少真实 BabeL-O mismatch 环境而阻塞本地验证。
- 管理端继续只展示 DUDesign 标准 runtime health / contract 字段，不泄漏 BabeL-O 原始响应结构。

### 下一步

- 将 Admin Console 拆分为可测试组件后，补浏览器级/组件级 runtime mismatch 视觉断言。
- 进入下一阶段可推进 memory_notes / memory_events schema，或转向用户端前端体验完善。

## 2026-06-29 ADM-M9 Module Tag Navigation

### 已完成

- 管理端首页新增 `activeSection` 状态。
- 侧边栏导航从静态 active 样式改为真实模块切换：
  - Runtime Health
  - Model Services
  - Job Controls
  - Artifacts
  - User Support
  - Memory
  - Audit Log
- 页面主体按当前模块 tag 条件渲染对应 panel，不再一次性展示所有治理能力形成大长列表。
- 页面顶部新增 tag row，方便在主内容区直接切换模块。
- Runtime Health 模块保留 Runtime Health 与 Required Endpoints。
- Model Services 模块保留模型服务治理与单用户模型访问治理。
- Job Controls 模块保留 Job Monitor、Cancel Job 与 Cost Summary。

### 验证

- `npm --workspace @dudesign/admin run build`

### 决策

- 本轮只调整管理端前端交互组织，不改 Admin API、runtime gateway 或用户端页面。
- tag/section 仍使用同一套 admin module taxonomy，后续拆组件时可直接沿用。

### 下一步

- 增加浏览器级 admin console smoke：打开页面后切换每个 tag，断言只出现当前模块的核心标题。
- 将大型 `page.tsx` 拆为 RuntimeSection、ModelSection、JobsSection、ArtifactsSection、SupportSection、MemorySection、AuditSection 组件。

## 2026-06-30 ADM-M10 Job Filters and Variation Retry

### 已完成

- Admin Job Monitor 支持服务端筛选：
  - `userId`
  - `workspaceId`
  - `sessionId`
  - `status`
  - `createdFrom`
  - `createdTo`
- `GET /api/admin/jobs` 返回每个 job 的 variation 简表：
  - variation id/index/status。
  - token/cost。
  - preview URL。
  - 脱敏后的 error message。
- 新增 `POST /api/admin/jobs/:jobId/variations/:variationId/retry`。
- variation retry 采用“创建一个新的单变体 retry job”的方式，不覆盖原 job、原 variation 和历史 artifact。
- variation retry 写入 `variation.retry` 审计日志，记录 original job、target variation 和 retried job。
- 管理端 Job Monitor 增加 user/workspace/session/time 筛选控件。
- 管理端 job 行内展开 variation 列表，支持单个 variation retry 和 preview 入口。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `npm run test:api`

### 决策

- variation retry 不复用原 variation id，避免破坏已有 preview/export/share 的引用稳定性。
- support 角色可以读取 job/variation 摘要，但不能执行 variation retry。
- operator/developer 可以执行 variation retry，且必须留下审计记录。

### 下一步

- 增加按 variation status/errorCode 的二级筛选。
- 将 Job Monitor 拆成独立组件，给筛选表单和 variation retry 按钮补前端组件测试或 Playwright smoke。

## 2026-06-30 ADM-M11 Babel-O Runtime Model Sync Planning

### 现状确认

- BabeL-O 已有公开运行时接口 `GET /v1/runtime/models`。
- 该接口返回 `runtime_models`：
  - providers。
  - provider auth/config 状态。
  - models。
  - contextWindow。
  - defaultMaxTokens。
  - tool/json/streaming capabilities。
  - active/default model。
- BabeL-O 测试已覆盖该接口不会泄漏 provider/profile/env secrets。
- DUDesign 当前 Runtime Gateway contract 还没有模型发现方法。
- DUDesign 当前 Model Services 仍只读取 `model_services` 治理表。

### 同步方案

- 在 Runtime Gateway 增加 `listRuntimeModels()`。
- Babel-O adapter 通过 `GET /v1/runtime/models` 拉取 runtime model matrix。
- Admin API 新增 `POST /api/admin/models/sync`。
- 同步结果 upsert 到 DUDesign `model_services`。
- 同步只更新 discovery 字段和 metadata，保留管理员治理字段：
  - `enabled`
  - `isDefault`
  - 用户级 model access。
- `metadata.source` 标记为 `runtime_discovery`。
- `metadata.runtimeProviderId` 保存 Babel-O provider id，如 `openai`、`anthropic`、`minimax`。
- `provider` 字段 MVP 继续使用 `babel-o`，避免 DUDesign 直接耦合外部 provider enum。

### 风险与边界

- `GET /v1/runtime/models` 是 BabeL-O runtime registry/capability matrix，不等同于供应商 live `/models` 库存。
- 真实 provider live discovery 可作为后续 `provider_discovery` 层单独实现。
- 同步失败不应破坏现有 `model_services`。
- 新发现模型默认不自动启用，避免未经管理员确认进入用户可选模型池。

### 下一步

- 实现 `RuntimeGateway.listRuntimeModels()`。
- 实现 `POST /api/admin/models/sync` 和审计日志。
- 管理端 Model Services 展示 source、runtime provider、auth 状态和 lastSyncedAt。

## 2026-06-30 ADM-M12 Runtime Model Sync Governance Diff

### 已完成

- `upsertDiscoveredModelServices()` 返回同步治理结果：
  - `createdCount`
  - `updatedCount`
  - `missingCount`
  - `disabledMissingCount`
  - `diff`
- 运行时同步只自动处理 `metadata.source=runtime_discovery` 的模型。
- 当历史 runtime-discovery 模型不再出现在 Babel-O runtime model matrix 中：
  - 标记 `metadata.runtimeMissingSinceLastSync=true`。
  - 写入 `metadata.runtimeMissingAt`。
  - 自动禁用该模型，避免继续被用户选择。
- 已有模型继续保留管理员治理字段：
  - `enabled`
  - `isDefault`
  - `createdAt`
- 同步审计 `model.sync` 增加治理摘要：
  - created/updated/missing/disabled missing。
  - diff 数量。
  - runtime provider/model/default/version 信息。
- 管理端 Model Services 增加同步摘要：
  - 新增、更新、缺失、禁用数量。
  - 最近同步时间。
  - audit id。
  - 前 8 条 diff。
  - 行内 missing from runtime 标识。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `node --test dist/model-governance.test.js` in `apps/api`
- `node --test dist/mock-flow.test.js` in `apps/api`

### 已知问题

- 已在后端业务服务层 M31 将 API workspace 默认测试改为跨文件串行执行，并修正 support summary latest job 的不稳定断言。
- `npm run test:api` 已恢复通过。

### 下一步

- 将 Model Services 面板拆成组件，并补 Playwright smoke：触发 sync 后检查 diff/audit/missing 展示。

## 2026-06-30 ADM-M13 Model Services Component Smoke

### 已完成

- 将管理端 Model Services 面板从 `app/page.tsx` 拆到独立组件：
  - `apps/admin/src/components/ModelServicesPanel.tsx`
- 组件覆盖：
  - 模型服务列表。
  - source/runtime provider/auth/syncedAt 标识。
  - sync summary。
  - created/updated/missing/disabled 计数。
  - audit id。
  - diff 列表。
  - missing from runtime 行内标识。
- 管理端新增 Playwright 配置：
  - `apps/admin/playwright.config.ts`
- 管理端新增浏览器 smoke：
  - `apps/admin/e2e/model-services-sync.spec.ts`
  - 使用 route mock 拦截 Admin API，不依赖真实 API server。
  - 验证点击 `Sync from Babel-O` 后显示 diff/audit/missing 治理信息。
- 新增脚本：
  - `npm --workspace @dudesign/admin run test:e2e`
  - `npm run test:admin:e2e`

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `npm run test:admin:e2e`

### 决策

- 管理端浏览器 smoke 使用 mock API，作为 UI 契约测试；真实 API 行为仍由 `npm run test:api` 覆盖。
- 先只拆 Model Services，避免一次性拆完整 admin page 造成审查成本过高。

### 下一步

- 继续将 Job Controls / Runtime Health 拆为独立组件。
- 给 role=support 场景补一个 Model Services smoke，验证同步按钮不可执行且不会出现写操作。

## 2026-06-30 ADM-M14 Model Services Support Permission Smoke

### 已完成

- 管理端 role selector 增加稳定测试选择器：
  - `data-testid="admin-role-select"`
- `model-services-sync.spec.ts` 抽出 Admin API route mock helper，减少后续权限 smoke 复制成本。
- 新增 support 只读权限浏览器 smoke：
  - 切换 role 为 `support`。
  - 打开 Model Services。
  - 验证模型服务列表可读。
  - 验证 `Sync from Babel-O` 按钮 disabled。
  - 强制点击 disabled 按钮后确认没有发出 `POST /api/admin/models/sync`。
  - 验证页面不会出现 sync summary。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `npm run test:admin:e2e`

### 决策

- support 角色在管理端可以读取模型治理信息，但不能触发模型发现同步或其它写操作。
- 前端权限 smoke 只验证 UI 不发写请求；后端 403 权限仍由 API 测试覆盖。

### 下一步

- 继续拆 `Job Controls` 独立组件，并补 support 不能 cancel/retry、operator 可以 retry variation 的浏览器 smoke。

## 2026-06-30 ADM-M15 Runtime Health Component Smoke

### 已完成

- 将 Runtime Health 从 `app/page.tsx` 拆到独立组件：
  - `apps/admin/src/components/RuntimeHealthPanel.tsx`
- 组件覆盖：
  - runtime status。
  - runtime version。
  - contract version。
  - event mapping count。
  - runtime message。
  - required endpoints。
- 原本分散在页面里的 `Runtime Health` 和 `Required Endpoints` 两块统一由组件输出。
- 新增浏览器 smoke：
  - `apps/admin/e2e/runtime-health.spec.ts`
  - compatible 状态展示 contract 和 endpoint。
  - contract mismatch 状态展示红色状态和错误信息。
  - degraded 状态展示降级信息，并继续保留 required endpoints。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`
- `npm run test:admin:e2e`

### 决策

- Runtime Health 使用 mock Admin API 做浏览器契约测试，确保 UI 状态渲染独立于真实 BabeL-O 可用性。
- Required endpoints 与 runtime status 放在同一个组件边界，便于后续增加 drift/golden replay 摘要。

### 下一步

- 继续拆 `Job Controls` 独立组件。
- 给 Job Controls 补浏览器 smoke：
  - support 不能 cancel/retry。
  - operator 可以 retry variation。
  - 筛选条件 user/workspace/session/status/time 可以传到 Admin API。

## 2026-07-01 ADM-M16 Artifact Repair Actions

### 已完成

- Artifact Explorer 增加三类治理动作：
  - `Rebuild shot`：对 HTML artifact 重新入队截图任务。
  - `Repair export`：从 HTML artifact 或 export artifact 的源 HTML 重新生成导出包。
  - `Revoke shares`：撤销某个 artifact 下仍然 active 的分享链接。
- Admin API 新增：
  - `POST /api/admin/artifacts/:artifactId/rebuild-screenshot`
  - `POST /api/admin/artifacts/:artifactId/repair-export`
  - `POST /api/admin/artifacts/:artifactId/revoke-shares`
- repository 增加 `listSharesForArtifact()`，InMemoryStore 与 PostgresRepository 均实现。
- 所有 artifact 写操作继续通过 Application Service 执行，并写入审计：
  - `artifact.screenshot_rebuild`
  - `artifact.export_repair`
  - `artifact.shares_revoke`
- 管理端 UI 对 support 角色禁用这些写操作；operator/developer 可执行。
- API mock flow 增加端到端断言：
  - screenshot rebuild 返回 screenshot queue job。
  - export repair 返回新的 export zip 下载入口。
  - revoke share 后原分享 token 访问返回 `410`。

### 验证

- `npm --workspace @dudesign/api run test -- --test-name-pattern "DUDesign mock API flow"`
- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`

### 决策

- `rebuild screenshot` 不直接同步生成截图，而是入队 screenshot job，保持与现有 artifact preview 管线一致。
- `export repair` 优先解析源 HTML artifact；如果从 export artifact 发起修复，则必须能通过 metadata 或 parent artifact 找回源 HTML。
- `revoke share` 以 artifact 为治理边界，一次撤销该 artifact 的所有 active shares，避免只撤销单个 token 后仍有其它公开链接泄漏。

### 下一步

- 给 Artifact Explorer 补浏览器 smoke：
  - support 只读不可执行 repair/revoke。
  - operator 可触发 rebuild screenshot/export repair/revoke share。
- 后续可继续将 Artifact Explorer 拆成独立组件，减少 `app/page.tsx` 的治理面复杂度。
