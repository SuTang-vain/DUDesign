# 后端内核兼容层工作记录

> 模块：Runtime Compatibility Layer
> 维护方式：按日期追加。记录 BabeL-O 适配、协议漂移、contract 测试和升级治理。

## 2026-06-26

### 已完成

- 确定后端内核兼容层作为 BabeL-O 防腐层。
- 确定只有该层允许理解 BabeL-O 协议细节。
- 确定 Gateway 对业务层暴露 DUDesign 稳定接口。
- 确定前端和业务层不直接消费 `NexusEvent`。
- 确定 runtime contract manifest、golden event replay、smoke test 是 BabeL-O 升级门禁。
- 创建 `@dudesign/runtime-gateway` 包。
- 定义 `RuntimeGateway`、`RuntimeContract`、`RuntimeHealth`、`RuntimeResumeResult` 等接口。
- 定义 `MockRuntimeGateway`，可支撑业务层和前端先用 mock runtime 跑通流程。
- 创建 runtime contract manifest 初稿，包含 BabeL-O 必需端点、必需事件和 DUDesign 事件映射。

### 决策

- BabeL-O 作为独立 runtime service/image 接入，不作为 DUDesign 源码依赖。
- Gateway 输出 `DesignRuntimeEvent`，不透传原始 `NexusEvent`。
- Runtime id 只作为外部引用返回给业务层。
- contract mismatch 必须阻断 runtime 默认切换。

### 风险

- BabeL-O 当前能力较强，但面向产品 SaaS 还需要 Adapter 明确收敛事件面。
- 如果 Artifact Bridge 做得不稳，生成结果和业务 artifact 可能不同步。
- 并行 child session 的部分失败和取消语义需要单独测试。

### 下一步

- 定义 `RuntimeGateway` interface 和 `DesignRuntimeEvent` 初稿。
- 基于当前 BabeL-O Nexus endpoints 写 runtime contract manifest v0。
- 准备第一组 golden events，覆盖 session_started、assistant_delta、workspace_dirty、result、error。

## 2026-06-26 M1 Mock Runtime 接入

### 已完成

- `MockRuntimeGateway` 已接入 `apps/api` 的 M1 业务流程。
- `spawnVariationAgents()` 事件可驱动 job/variation 状态更新。
- API 层已通过 DUDesign 标准事件输出 SSE，不透传 `NexusEvent`。

### 后续关注

- 下一步需要实现真实 BabeL-O Adapter 前，先补 golden event replay 的 fixture 格式。
- mock preview URL 已改为 DUDesign variation id，避免 mock runtime id 泄漏到业务 URL。

## 2026-06-26 M2 Mock Refine

### 已完成

- `MockRuntimeGateway.refineVariation()` 已接入 Application Service。
- refine 输出 `design.variation_streaming` 和 `design.variation_completed` 标准事件。
- Application Service 可将 refine completed 事件转换为新 artifact version。

### 后续关注

- 真实 BabeL-O Adapter 需要把当前 artifact 内容和 annotation prompt suffix 注入 runtime 上下文。
- 后续要增加 refine golden event fixture。

## 2026-06-26 M3 Annotation-to-Refine Path

### 已完成

- Application Service 已能把 annotation batch 转换为 `refineVariation()` 输入。
- Runtime Gateway 不需要理解 UI 标注细节，只消费整理后的 prompt。

### 后续关注

- 真实 adapter 需要保留 annotation 原始 shapes 作为 metadata，同时只把整理后的 prompt 暴露给模型。

## 2026-06-26 M4 Mock Contract Regression

### 已完成

- 通过 API smoke 将 `spawnVariationAgents()`、`refineVariation()` 和 annotation-to-refine 路径纳入自动化验证。
- 收紧 mock artifact id 规则：初始 generation artifact id 带 `jobId`，refine artifact id 带 `jobId`、`variationId` 和递增序列，避免跨 job 或同 variation 多轮 refine 时覆盖 artifact。
- 验证已完成 job 的 SSE replay 可以作为前端刷新恢复的事件来源。

### 后续关注

- 真实 BabeL-O Adapter 必须保证每次 materialized artifact 都有稳定且唯一的业务 artifact 引用。
- golden event replay 需要覆盖“同一 variation 连续 refine 两次”的场景。

## 2026-06-27 M5 BabeL-O Event Adapter Golden Replay

### 已完成

- 新增 `BabelONexusEventAdapter`：
  - 输入 BabeL-O/Nexus 原始事件。
  - 输出 DUDesign 标准 `DesignEvent`。
  - 业务层不需要理解 `NexusEvent`。
- 已覆盖事件映射：
  - `session_started` -> `design.session_started`
  - `assistant_delta` -> `design.variation_streaming`
  - `thinking_delta` -> `design.variation_streaming`
  - `workspace_dirty` / `workspace_dirty_detected` -> `design.variation_artifact_updated`
  - `permission_request` -> `design.permission_required`
  - `result` -> `design.variation_completed`
  - `error` -> `design.variation_failed`
  - unknown event -> `design.runtime_warning`
- Adapter 对 runtime 输入做安全字段读取：
  - 不信任外部事件字段类型。
  - 非法字段降级为默认值或忽略。
  - unknown event 不阻断主流程。
- 新增 golden replay 测试：
  - `babelOAdapter.test.ts`
  - 覆盖正常事件、错误事件、权限事件和未来未知事件。
- runtime-gateway 包加入默认测试脚本。
- 根 `npm test` 纳入 `test:runtime-gateway`，确保 adapter drift 进入默认门禁。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm test`

### 决策

- 本轮只实现纯事件 adapter，不直接接 BabeL-O 网络端点。
- 真实 `/v1/stream` client 后续只负责连接、鉴权、重连和把原始事件喂给 adapter。
- DUDesign 标准事件仍以 `@dudesign/contracts` 为唯一输出契约。

### 下一步

- 实现 BabeL-O runtime health check/client 配置骨架。
- 定义 Gateway 错误码。
- 继续补真实 `/v1/stream` client 的连接超时、重连和取消策略。

## 2026-06-27 M6 BabeL-O Runtime Client Health Contract

### 已完成

- 新增 `BabelORuntimeClient`：
  - 统一配置 `baseUrl`、`apiKey`、`authHeaderName`、`timeoutMs`、`expectedContractVersion`。
  - 实现 `/v1/health` 只读探针。
  - 实现 `/v1/contract` contract manifest 读取。
  - 对外输出 DUDesign `RuntimeHealth` / `RuntimeContract`，不泄露 BabeL-O 原始响应结构。
- 新增 Gateway 错误码：
  - `RUNTIME_UNAVAILABLE`
  - `RUNTIME_CONTRACT_MISMATCH`
  - `RUNTIME_BAD_RESPONSE`
  - `RUNTIME_REQUEST_TIMEOUT`
- health/contract 状态归一化：
  - contract version 匹配 -> `compatible`
  - runtime 显式 degraded -> `degraded`
  - contract version 漂移 -> `contract_mismatch`
  - 连接失败/非正常响应 -> `unavailable`
- 新增 client 测试：
  - compatible health + contract。
  - contract mismatch。
  - runtime unavailable。
  - API key header 注入。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm test`

### 决策

- 本轮仍不实现 session 创建和 stream 连接，先把 runtime 可用性与契约读取作为独立治理探针。
- contract mismatch 先以状态返回，不在 client 内直接抛错，便于管理端展示和业务层选择降级策略。
- BabeL-O 原始 manifest 中未知或非法 event mapping 会被过滤，避免污染 DUDesign 标准事件契约。

### 下一步

- 实现 `/v1/sessions` 创建 client。
- 实现 `/v1/sessions/:id/resume` client。
- 将 health/contract 结果接入管理端 runtime diagnostics API。
- 继续设计 `/v1/stream` 的 timeout、reconnect、cancel 语义。

## 2026-06-27 M7 BabeL-O Runtime Session Client

### 已完成

- `BabelORuntimeClient` 新增 `/v1/sessions` 创建能力：
  - 使用 `POST /v1/sessions`。
  - 请求体包含 `userId`、`workspaceId`、`sessionId`、`workspaceRoot`、`memoryNamespace`。
  - 返回值归一化为 DUDesign `RuntimeSessionRef`。
  - runtime 未返回 session id 时抛 `RUNTIME_BAD_RESPONSE`。
- `BabelORuntimeClient` 新增 `/v1/sessions/:id/resume` 能力：
  - 有 `runtimeSessionId` 时调用 resume。
  - 无 `runtimeSessionId` 时走 rebuild create session。
  - resume 失败时返回 `{ status: 'unavailable' }`，让业务服务继续使用 DUDesign snapshot。
- 修正 `ResumeRuntimeSessionInput`：
  - 新增 `workspaceId`。
  - 新增 `memoryNamespace`。
  - 避免 runtime session rebuild 时丢失用户级 memory 隔离。
- Application Service resume 调用同步传入：
  - workspace id。
  - 用户 memory namespace。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm run typecheck`

### 决策

- `createSession` 失败继续抛错，由 Application Service 已有降级逻辑处理。
- `resumeSession` 失败返回 unavailable 快照，不阻断用户恢复历史会话。
- runtime client 仍只负责 BabeL-O HTTP 契约转换，不直接处理 DUDesign 数据库状态。

### 下一步

- 补根 `npm test` 全量门禁。
- 实现 `BabelORuntimeGateway`，把 client + adapter 组合成 `RuntimeGateway` interface 的真实实现。
- 接入 runtime diagnostics API，给管理端查询 health/contract/status。
- 开始设计 `/v1/stream` client 与 `spawnVariationAgents` 的事件流适配。

## 2026-06-27 M8 BabeL-O Runtime Gateway Switch

### 已完成

- 新增 `BabelORuntimeGateway`：
  - 实现 DUDesign `RuntimeGateway` interface。
  - 组合 `BabelORuntimeClient` 与 `BabelONexusEventAdapter`。
  - `getRuntimeHealth()` / `getRuntimeContract()` 直接走 BabeL-O client。
  - `createSession()` 在创建前检查 contract status。
  - `resumeSession()` 在 contract mismatch/unavailable 时返回 unavailable snapshot，不阻断业务恢复。
  - `mapRuntimeEvent()` 暴露受控事件适配入口，业务层仍不接触 `NexusEvent`。
- 在 stream 未接入前，`spawnVariationAgents()` / `refineVariation()` 输出明确 runtime warning 后抛出 `RUNTIME_STREAM_NOT_IMPLEMENTED`。
- 新增环境化 runtime gateway 工厂：
  - 默认 `MockRuntimeGateway`。
  - `DUDESIGN_RUNTIME_MODE=babel-o` 时启用 `BabelORuntimeGateway`。
  - `DUDESIGN_BABELO_BASE_URL` 缺失时启动失败。
  - 支持 `DUDESIGN_BABELO_API_KEY`、`DUDESIGN_BABELO_AUTH_HEADER`、`DUDESIGN_BABELO_TIMEOUT_MS`、`DUDESIGN_BABELO_CONTRACT_VERSION`。
- 新增测试：
  - compatible contract 下真实 gateway 可创建 runtime session。
  - contract mismatch 阻断 session create，且不会继续调用 `/v1/sessions`。
  - resume 在 mismatch 下返回 unavailable。
  - gateway 通过 adapter 输出 DUDesign 标准事件。
  - API service factory runtime mode 环境切换。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm run typecheck`

### 决策

- 默认仍保持 mock runtime，避免未完成 stream 影响本地开发与默认测试。
- `BabelORuntimeGateway` 已建立真实 BabeL-O 接入边界，但并行生成/refine 仍需等 `/v1/stream` client 完成后启用。
- contract mismatch 是硬阻断：不会让新任务创建 runtime session。

### 下一步

- 补根 `npm test` 全量门禁。
- 实现 `/v1/stream` client 的最小 SSE/NDJSON 读取能力。
- 将 `spawnVariationAgents()` 接入 `/v1/agents` + stream event adapter。
- 为 `DUDESIGN_RUNTIME_MODE=babel-o` 增加 API smoke，使用 mocked HTTP runtime。

## 2026-06-27 M9 BabeL-O Stream Client Smoke

### 已完成

- `BabelORuntimeClient` 新增 agent/stream 能力：
  - `spawnVariationAgent()` 调用 `POST /v1/agents`。
  - `createRefineAgent()` 调用 `POST /v1/agents/refine`。
  - `streamRuntimeEvents()` 调用 `GET /v1/stream`。
  - 支持 NDJSON 行流。
  - 支持 SSE `data:` 行。
  - 忽略 SSE 注释、`event:` 元信息和 `[DONE]`。
- `BabelORuntimeGateway.spawnVariationAgents()` 接入最小真实流：
  - 先输出 `design.job_started`。
  - 为每个 variation 输出 `design.variation_queued`。
  - 每个 variation 调用 `/v1/agents` 获取 stream ref。
  - 读取 `/v1/stream` 原始事件。
  - 通过 `BabelONexusEventAdapter` 转换为 DUDesign 标准事件。
  - 最后输出 `design.job_completed`。
- `BabelORuntimeGateway.refineVariation()` 接入 `/v1/agents/refine` + `/v1/stream` 最小路径。
- Application Service variation id rewrite 从 mock 专用扩展为 runtime 通用：
  - 支持 `mock_variation_N`。
  - 支持 `runtime_variation_N`。
  - 真实 stream 事件可以落到业务库中的 `design_variations.id`。
- 新增 API 层 mocked BabeL-O runtime smoke：
  - 使用真实 `BabelORuntimeGateway`。
  - 用 mocked HTTP runtime 返回 contract、session、agents、stream。
  - 验证 create session、create job、stream events、variation completed、artifact 生成。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 当前 `/v1/stream` 是 HTTP streaming 最小实现，支持 NDJSON/SSE；WebSocket、重连、idle timeout 后续再补。
- 并行 variation 目前在 gateway 内串行启动/消费，先保证契约和 side effects 正确；真实并发调度留到下一阶段。
- Artifact Bridge 尚未接真实 BabeL-O workspace 文件，`result.artifactId` 仍由业务服务转成过渡 mock artifact。

### 下一步

- 补根 `npm test` 全量门禁。
- 实现 variation 并行 stream 聚合，避免 3/6 个 variation 串行执行。
- 实现 stream idle timeout / retry / reconnect 策略。
- 推进 Artifact Bridge，把 BabeL-O workspace 产物同步成真实 DUDesign artifact。

## 2026-06-27 M10 Parallel Variation Stream Merge

### 已完成

- `BabelORuntimeGateway.spawnVariationAgents()` 改为并行聚合：
  - 先输出所有 `design.variation_queued`。
  - 为每个 variation 创建独立 child stream。
  - 使用 async iterator merge 同时消费多个 child stream。
  - 子流事件到达即输出为 DUDesign 标准事件。
- 增加单 child failure 隔离：
  - 某个 child stream 抛错时，只输出该 variation 的 `design.variation_failed`。
  - 其他 child stream 继续消费，不被失败 variation 打断。
  - `design.job_completed` 汇总 completed/failed variation 数量。
- 增加 stream 无 terminal event 保护：
  - 如果 child stream 结束但没有 `result` 或 `error`，输出 `RUNTIME_STREAM_ENDED_WITHOUT_RESULT`。
- API mocked BabeL-O smoke 增加并发断言：
  - 记录 active stream 数量。
  - 验证 2 个 variation stream 同时处于 active。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 本轮不做并发数限制；MVP 变体数量上限 6，先直接并发。
- child failure 作为 variation 级失败进入标准事件，不抛出为 job 级异常。
- job 级状态由业务服务根据 `job_completed` 和 variation side effects 收口；当前已能保持部分成功、部分失败。

### 下一步

- 补根 `npm test` 全量门禁。
- 实现 stream idle timeout，避免 child stream 长时间无事件挂住 job。
- 增加 retry/reconnect 策略，区分可恢复网络中断和 runtime terminal error。
- 推进 Artifact Bridge，将 BabeL-O workspace 文件同步成真实 DUDesign artifact。

## 2026-06-27 M11 Stream Idle Timeout And Reconnect

### 已完成

- `BabelORuntimeClient` 新增 stream 稳定性配置：
  - `streamIdleTimeoutMs`
  - `streamReconnectAttempts`
- `streamRuntimeEvents()` 增加 idle timeout：
  - stream 已连接后，超过 `streamIdleTimeoutMs` 没有新 chunk，会抛 `RUNTIME_STREAM_IDLE_TIMEOUT`。
  - 使用 reader-level timeout race，避免只 abort fetch signal 无法中断已连接 stream 的问题。
- `streamRuntimeEvents()` 增加有限重连：
  - 仅在 stream 尚未产出任何事件前重试。
  - 支持 `RUNTIME_UNAVAILABLE`、`RUNTIME_REQUEST_TIMEOUT`、`RUNTIME_STREAM_IDLE_TIMEOUT` 作为 retryable stream error。
  - 一旦 stream 已产出事件，不自动重连，避免 runtime replay 导致重复 usage 或重复 artifact。
- API runtime env factory 增加配置：
  - `DUDESIGN_BABELO_STREAM_IDLE_TIMEOUT_MS`
  - `DUDESIGN_BABELO_STREAM_RECONNECT_ATTEMPTS`
- 新增测试：
  - connected stream idle timeout。
  - 首次 stream 连接失败后重连成功。
  - API service factory 清理/接受新增 env key。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 本轮只做“产出事件前”的安全重连。
- 产出事件后的断线不自动重连，后续需要结合 runtime event id / resume cursor / usage idempotency 再做。
- cancel 仍未实现，保留 TODO；后续需要 BabeL-O 侧明确 cancel endpoint 或 stream close 语义。

### 下一步

- 补根 `npm test` 全量门禁。
- 推进 Artifact Bridge，将 BabeL-O workspace 文件同步成真实 DUDesign artifact。
- 或者先补 runtime stream resume cursor contract，为“产出事件后断线重连”做契约准备。

## 2026-06-27 M12 Inline Runtime Artifact Bridge

### 已完成

- 扩展 DUDesign 标准事件 payload：
  - `design.variation_completed.payload.html`
  - `design.variation_completed.payload.entryPath`
  - `design.variation_completed.payload.changedPaths`
  - `design.variation_artifact_updated.payload.html`
- `BabelONexusEventAdapter` 支持从 BabeL-O `result` / `workspace_dirty` 事件安全读取 HTML 产物字段。
- Application Service 新增 runtime HTML materialize 路径：
  - 当 completed event 携带 `html` 时，写入 `ArtifactStore`。
  - 创建 DUDesign 业务 artifact 记录。
  - metadata 保存 `source=babel-o-runtime` 与 `runtimeArtifactId`。
  - preview/export/share 后续读取真实 artifact HTML，不再使用 mock preview。
- 保留 fallback：
  - 如果 runtime event 没有 `html`，继续走 mock artifact body，保证当前 mock/dev 流程不破坏。
- API BabeL-O mocked flow 增加断言：
  - stream result 返回 inline HTML。
  - variation preview 可读取 runtime HTML。
  - preview 不再包含 mock preview 文案。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 本轮先实现 inline HTML bridge，不直接扫描 BabeL-O workspace 目录。
- 不把 BabeL-O 外部 artifact id 直接作为 DUDesign artifact 主键；外部 id 存入 artifact metadata。
- workspace 文件同步、CSS/JS asset 同步、path traversal/symlink escape 仍保留在 Artifact Bridge 后续任务。

### 下一步

- 补根 `npm test` 全量门禁。
- 实现 workspace 文件 Artifact Bridge：
  - 解析 runtime workspace 中的 `index.html`。
  - 同步 CSS/JS/assets。
  - 加入 path traversal 与 symlink escape 防护。
  - 输出稳定 DUDesign artifact 引用。

## 2026-06-27 M13 Runtime Workspace File Bundle Bridge

### 已完成

- 扩展 DUDesign 标准事件 payload：
  - `design.variation_completed.payload.files`
  - `design.variation_artifact_updated.payload.files`
  - 文件结构：`{ path, content, contentType? }`
- `BabelONexusEventAdapter` 支持读取 BabeL-O result/workspace_dirty 中的 files bundle。
- Application Service 支持 runtime workspace bundle materialize：
  - 读取 `files`。
  - 校验并归一化相对路径。
  - 解析入口文件，优先使用 `entryPath`，否则使用 `index.html`。
  - 将入口 HTML 写入 `ArtifactStore` 并创建 `html` artifact。
  - 将 CSS/JS/assets 写入 `ArtifactStore` 并创建 `asset` artifact。
  - 入口 HTML artifact 作为 variation 当前 artifact。
- 安全防护：
  - 拒绝空路径。
  - 拒绝绝对路径。
  - 拒绝 Windows drive path。
  - 拒绝 `..` path traversal。
  - 拒绝重复文件路径。
- API BabeL-O mocked flow 增加覆盖：
  - runtime stream 返回 `index.html` + `styles.css` bundle。
  - preview 读取 workspace bundle 中的 HTML。
  - artifact 数量包含 html + asset。
  - 非法 `../escape.html` bundle 会导致 variation/job 失败，且不生成 artifact。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 当前实现处理的是 runtime stream 携带的 files bundle，而不是直接扫描 BabeL-O 文件系统目录。
- 因为尚未直接读 runtime workspace 目录，symlink escape 防护仍保留在后续任务。
- CSS/JS/assets 已入库为 `asset` artifact，但 preview HTML 仍按原始引用返回；独立 asset serving/rewrite 后续再做。

### 下一步

- 补根 `npm test` 全量门禁。
- 增加 asset serving/rewrite，让 preview 中的 CSS/JS/assets 可以通过 DUDesign API 读取。
- 如果要直接扫描 BabeL-O workspace 目录，再补 symlink escape 防护。

## 2026-06-27 M14 Runtime Asset Serving And Preview Rewrite

### 已完成

- Repository contract 增加 variation asset 查询能力：
  - `getVariationAssetArtifacts(variationId, parentArtifactId)`
  - `getVariationAssetArtifact(variationId, parentArtifactId, assetPath)`
- `InMemoryStore` 支持按当前 HTML artifact 查找子 asset artifact。
- `PostgresRepository` 增加 SQL-first asset 查询方法，避免 production no-hydrate 模式依赖内存缓存。
- API Service 增加 asset serving：
  - `getVariationAsset(ctx, variationId, assetPath)`
  - 复用 runtime artifact path 校验，拒绝反斜杠/`..` 等路径穿越。
  - 从 `ArtifactStore` 读取真实 CSS/JS/assets 内容和 content type。
- API Server 增加：
  - `GET /api/variations/:id/assets/*`
  - 二进制 asset response。
- preview HTML 增加相对资源 URL 改写：
  - 将命中的 `src` / `href` 本地相对路径改写为 `/api/variations/:id/assets/...`。
  - 外链、data/blob、锚点、绝对路径不改写。
  - 支持嵌套路径，例如 `scripts/app.js`。
- Preview CSP 调整为允许同源 CSS/JS/图片资源，保证 runtime 多文件页面可以在 iframe 中完整加载。
- API BabeL-O mocked flow 增加覆盖：
  - runtime 返回 `index.html` + `styles.css` + `scripts/app.js`。
  - preview 中相对链接被改写为 asset endpoint。
  - CSS/JS asset endpoint 可读取真实内容。
  - 编码反斜杠路径穿越会返回 400。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 决策

- 当前只改写明确存在于当前 HTML artifact 子 asset 列表中的相对 `src`/`href`。
- 不解析 CSS 内部 `url(...)`，也不重写外部 URL；后续可根据真实 BabeL-O 输出再补。
- Asset serving 以当前 variation artifact 为边界，旧 share 的 asset 固定版本访问还未单独建 endpoint。

### 下一步

- 跑根 `npm test` 全量门禁。
- 补 share artifact asset serving，保证公开分享链接也能加载对应版本的 CSS/JS/assets 且不随当前 variation 漂移。
- 推进 runtime `artifact_updated` 增量事件落库，减少 completed 前预览空窗。

## 2026-06-27 M15 Runtime Artifact Updated Incremental Snapshot

### 已完成

- Application Service 支持 `design.variation_artifact_updated` side effects：
  - 当 runtime update 携带 `files` 或 `html` 时，立即 materialize 为 DUDesign artifact。
  - variation 状态更新为 `rendering_preview`。
  - variation `currentArtifactId` 指向最新增量 snapshot。
  - preview URL 提前写入 `/api/variations/:id/preview`。
- 将 runtime artifact materialize 逻辑从 completed 专用改为 updated/completed 共用：
  - `files` bundle 继续生成 HTML artifact + asset artifacts。
  - inline HTML 继续生成 HTML artifact。
  - artifact metadata 记录 `sourceEventType=artifact_updated|completed`。
- 对只包含 `changedPaths`、不包含 `html/files` 的 update 做非破坏性处理：
  - 不生成 artifact。
  - 不让 job 失败。
  - variation 保持 streaming。
- API BabeL-O mocked flow 增加覆盖：
  - stream 先返回 `workspace_dirty` partial bundle。
  - partial snapshot 可在 job 完成前通过 preview 读取。
  - partial preview 的 CSS 相对路径会被改写为 variation asset endpoint。
  - stream 后续返回 final `result` bundle，并生成最终 artifact。

### 验证

- `npm --workspace @dudesign/api run test`

### 决策

- `artifact_updated` 不记录 usage event，避免 runtime 高频增量事件造成成本统计膨胀；usage 仍在 completed/refined/export/share 处记录。
- 增量 snapshot 会创建新 artifact version；如果 BabeL-O 高频输出，后续需要节流或按 runtime artifact id 做合并策略。
- 当前仍基于 stream 携带的 `html/files`，不直接扫描 runtime workspace 文件系统。

### 下一步

- 跑根 `npm test` 全量门禁。
- 推进 runtime child session / agent id 持久化，支撑 resume、cancel、debug。
- 为 artifact_updated 高频场景补节流/去重策略设计。

## 2026-06-27 M16 Runtime Child Session And Agent Id Persistence

### 已完成

- 扩展 DUDesign 标准事件：
  - `design.variation_queued.payload.runtimeChildSessionId`
  - `design.variation_queued.payload.runtimeAgentJobId`
- `BabelORuntimeGateway` 在 `/v1/agents` 返回后发送第二条 `design.variation_queued` 事件：
  - 保留原始 queued 事件用于 UI 立即展示排队状态。
  - 新 queued 事件携带 BabeL-O child session / agent job 句柄。
- Application Service 在 `variation_queued` side effect 中持久化 runtime 句柄。
- Repository contract 增加 `ApplyVariationEventInput` 的 runtime id 字段。
- `InMemoryStore` 与 `PostgresRepository` 均支持写入：
  - `runtimeChildSessionId`
  - `runtimeAgentJobId`
- API mocked BabeL-O flow 增加断言：
  - 每个 variation 最终保存对应 `rt_child_N`。
  - 每个 variation 最终保存对应 `agent_N`。
- PostgreSQL integration smoke 增加 runtime id 持久化断言：
  - cache hydrate 后可读。
  - SQL-first `getVariationById()` 可读。
- Runtime gateway 单测覆盖 queued 事件携带 runtime ids。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- 不新增新的 runtime metadata event，复用 `design.variation_queued` 携带可选 runtime ids，避免前端/业务层增加事件类型分支。
- 允许同一个 variation 收到两次 queued：
  - 第一次表示业务排队。
  - 第二次表示 runtime child session/agent 已分配。
- 句柄只作为 runtime resume/cancel/debug 的内部能力，不暴露 BabeL-O 私有事件结构。

### 下一步

- 跑根 `npm test` 全量门禁。
- 推进 runtime cancel，把 DUDesign job cancel 映射到 BabeL-O agent/job cancel。
- 或先补 runtime diagnostics，把 child session / agent id 暴露到管理端排障视图。

## 2026-06-27 M17 Runtime Cancel

### 已完成

- 扩展 runtime cancel contract：
  - `CancelRuntimeJobInput.variations`
  - 每个 variation 携带 `variationId`、`runtimeChildSessionId`、`runtimeAgentJobId`。
  - `CancelRuntimeJobResult` 支持 `cancelledVariationCount` 与 `failedVariationCount`。
- Application Service 的 admin cancel 会把未完成 variation 的 runtime 句柄传入 runtime gateway。
- `BabelORuntimeClient` 新增 cancel 调用：
  - `POST /v1/agents/cancel`
  - 请求体包含 `jobId`、`reason`、`variations`。
- `BabelORuntimeGateway.cancelRuntimeJob()` 增加 contract check：
  - compatible/degraded 时调用 BabeL-O cancel endpoint。
  - contract mismatch/unavailable 时返回 `cancelled=false`，但不阻断 DUDesign 本地 cancel 收口。
- `MockRuntimeGateway` 返回 cancelled variation 数量，便于 API smoke 断言。
- 测试覆盖：
  - client cancel request body。
  - gateway compatible cancel 转发。
  - gateway contract mismatch 不调用 cancel endpoint。
  - API smoke 校验 runtime cancel 被调用并返回 cancelled variation count。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`

### 决策

- Cancel 采用“best effort runtime cancel + DUDesign 本地状态收口”策略：
  - runtime 不可用时，仍允许管理端把 DUDesign job 标记为 cancelled。
  - audit log 记录 runtime cancel 是否成功。
- BabeL-O 私有 cancel 细节不泄露给业务层；业务层只依赖 `RuntimeGateway.cancelRuntimeJob()`。
- 当前 cancel endpoint 命名为 `/v1/agents/cancel`，后续若 BabeL-O 提供 job-level endpoint，只需要改 adapter/client。

### 下一步

- 跑根 `npm test` 全量门禁。
- 推进 share/export 多文件 zip 化，让 HTML/CSS/JS/assets 可完整导出。
- 或补 runtime diagnostics，把 cancel 结果、child session、agent id 展示给管理端。

## 2026-06-27 M18 Runtime Refine Context And Resume Smoke

### 已完成

- Runtime refine 请求新增当前 artifact 上下文：
  - `baseArtifactHtml`
  - `baseArtifactEntryPath`
  - `baseArtifactVersion`
- Application Service 在 refine 前从 Artifact Store 读取当前 HTML artifact，并注入 `RuntimeGateway.refineVariation()`。
- Annotation-to-refine 路径把整理后的 annotation prompt suffix 传入 runtime refine 请求。
- `BabelORuntimeClient.createRefineAgent()` 将 HTML artifact context 和 annotation suffix 转发到 `/v1/agents/refine`。
- Runtime resume 增加不可恢复重建策略：
  - 有旧 `runtimeSessionId` 时优先调用 `/v1/sessions/:id/resume`。
  - resume HTTP 失败时尝试重新 `POST /v1/sessions`。
  - 返回 `status=rebuilt` 和新的 `runtimeSessionId`。
- Application Service 在 resume 返回新 runtime id 后回写业务 session，避免后续继续使用失效 runtime id。
- API BabeL-O mocked flow 新增 smoke：
  - annotation refine 会携带当前 HTML artifact。
  - annotation prompt suffix 会进入 `/v1/agents/refine` 请求体。
  - runtime resume 成功可恢复已有 session。
  - runtime resume 失败后可 rebuild，并继续创建后续 design job。
- Runtime client 单测新增：
  - resume 失败后 rebuild。
  - refine agent 请求体包含当前 artifact context。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`
- `npm test`

### 决策

- 当前 refine 只注入 HTML artifact 内容，不直接把 CSS/JS/assets 展开进 prompt；后续如 BabeL-O 需要完整 workspace bundle，可在 Gateway contract 内新增 `baseArtifactFiles`，不影响前端和业务 API。
- Resume fallback 采用“先恢复，失败后重建”的策略；重建成功后持久化新 runtime id。
- Annotation 原始 shapes 继续存业务侧 annotation batch；runtime 只消费整理后的 prompt suffix，避免把 UI 内部结构绑定给 BabeL-O。

### 下一步

- 推进 share/export 多文件 zip 化，让 HTML/CSS/JS/assets 可完整导出和分享。
- 增加 runtime diagnostics，把 resume/rebuild/refine context 状态暴露给管理端排障。
- 后续根据真实 BabeL-O 能力决定是否把完整 artifact file bundle 注入 refine。

## 2026-06-28 M19 Staging Runtime Provider Probe

### 已完成

- DUDesign API runtime factory 支持新的 staging 变量命名：
  - `DUDESIGN_RUNTIME_PROVIDER=babel-o`
  - `BABELO_BASE_URL`
  - `BABELO_API_KEY`
  - `BABELO_AUTH_HEADER`
  - `BABELO_TIMEOUT_MS`
  - `BABELO_STREAM_IDLE_TIMEOUT_MS`
  - `BABELO_STREAM_RECONNECT_ATTEMPTS`
  - `BABELO_CONTRACT_VERSION`
- 保留旧变量兼容：
  - `DUDESIGN_RUNTIME_MODE=babel-o`
  - `DUDESIGN_BABELO_*`
- Staging docker compose 已把 runtime provider/env 透传给 API 容器。
- `staging.env.example` 增加真实 runtime 配置说明。
- `smoke-remote.sh` 增加 admin runtime health 检查：
  - 请求 `GET /api/admin/runtime/health`。
  - 当 staging env 启用 `babel-o` 时，若仍返回 `runtimeVersion=mock` 则失败。
- 云端服务器探测结果：
  - 当前 DUDesign staging 仍为 mock runtime。
  - 宿主机无 Node，DUDesign 通过 Docker 运行。
  - 使用源码临时 Docker 容器成功启动 BabeL-O Nexus 0.3.9。
  - BabeL-O 原生 `/health` 返回 `runtime=babel-o`、`version=0.3.9`。
  - BabeL-O 原生 `/v1/runtime/version` 返回 `serverVersion=0.3.9`、`schemaVersion=2026-05-21.babel-o.v1`。
  - BabeL-O 原生 `/v1/contract` 返回 404。
  - BabeL-O 原生 `/v1/sessions` 可创建 session。
  - BabeL-O 原生 `/v1/agents` 返回 `agent_jobs` 列表，语义不是 DUDesign 当前期望的 `{ streamId, runtimeChildSessionId, agentJobId }`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- 云端临时容器探测：
  - `GET /health`
  - `GET /v1/runtime/version`
  - `GET /v1/contract`
  - `POST /v1/sessions`
  - `GET /v1/agents`

### 决策

- 不能把 DUDesign API 直接指向原生 BabeL-O Nexus。
- 当前需要一个 DUDesign/BabeL-O runtime adapter service：
  - 向 DUDesign 暴露稳定的 `/v1/contract`、`/v1/agents`、`/v1/agents/refine`、`/v1/agents/cancel`、`/v1/stream`。
  - 向下游调用原生 BabeL-O Nexus `/v1/sessions`、`/v1/agents`、transcript/stream/execute 能力。
  - 将原生 `agent_job` / transcript events 转成 DUDesign 标准 runtime contract。
- Adapter service 是内核解耦边界的一部分，应该放在第 4 层，而不是让 API 业务层直接理解 BabeL-O 原生 agent job 结构。

### 下一步

- 实现最小 `babel-o-runtime-adapter` 服务。
- 在 staging compose 中新增 `babel-o`/adapter 服务，API 的 `BABELO_BASE_URL` 指向 adapter。
- 给 adapter 增加真实 contract smoke：
  - `/v1/contract` compatible。
  - `POST /v1/sessions` 创建 runtime session。
  - `POST /v1/agents` spawn child session。
  - `/v1/stream` 输出 DUDesign 可映射事件。
- adapter smoke 通过后，再把 staging env 改为 `DUDESIGN_RUNTIME_PROVIDER=babel-o` 并跑真实 prompt。

## 2026-06-28 M20 BabeL-O Runtime Adapter MVP

### 已完成

- 新增 `@dudesign/runtime-adapter` workspace app。
- Adapter 对 DUDesign 暴露稳定 runtime contract：
  - `GET /v1/health`
  - `GET /v1/contract`
  - `POST /v1/sessions`
  - `POST /v1/sessions/:id/resume`
  - `POST /v1/agents`
  - `POST /v1/agents/refine`
  - `POST /v1/agents/cancel`
  - `GET /v1/stream`
- Adapter 向下游调用原生 BabeL-O Nexus：
  - `/health`
  - `/v1/runtime/version`
  - `/v1/sessions`
  - `/v1/sessions/:id/resume`
  - `/v1/agents`
  - `/v1/agents/:jobId/wait`
  - `/v1/agents/:jobId/transcript`
  - `/v1/agents/:jobId/cancel`
- Adapter 维护 DUDesign session id 到 raw Nexus session id 的内存映射，避免业务 API 直接理解原生 Nexus session。
- Adapter 将 DUDesign generation/refine 请求转换为 BabeL-O child agent prompt。
- Adapter stream 会：
  - 等待 raw Nexus agent 完成。
  - 将 transcript 中的 `thinking_delta` / `assistant_delta` / `error` 转为 DUDesign runtime stream。
  - 从 workspace 读取 `index.html` 并输出 `result` 事件，交给 DUDesign artifact bridge 落库。
- Staging Dockerfile 增加 `runtime-adapter` target。
- Staging compose 增加 `runtime-adapter` profile service。
- `deploy-remote.sh` 和 `smoke-remote.sh` 会在 `DUDESIGN_RUNTIME_PROVIDER=babel-o` 时启用 `--profile babel-o`。
- 云端临时镜像 build 已通过。
- 云端临时 raw BabeL-O Nexus + runtime adapter health/contract smoke 已通过：
  - Adapter `/v1/health` 返回 `runtimeVersion=0.3.9`。
  - Adapter `/v1/contract` 返回 DUDesign contract `2026-06-26.dudesign-runtime.v1`。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `npm run typecheck`
- `npm test`
- 云端 Docker build：`deploy/staging/Dockerfile --target runtime-adapter`
- 云端 adapter smoke：
  - raw Nexus container -> adapter container -> `/v1/health`
  - raw Nexus container -> adapter container -> `/v1/contract`

### 决策

- Adapter 是第 4 层内核兼容层的一部分，不进入 API 业务服务层。
- MVP adapter 采用内存 session/job 映射，适合单进程 staging smoke；后续 production 需要持久化或可恢复映射。
- MVP stream 先采用 wait + transcript + workspace artifact 方式，暂不实现真正的实时 WS bridge。
- Raw Nexus 仍需要独立部署；DUDesign API 只指向 adapter，不直接指向 raw Nexus。

### 下一步

- 在 staging 中稳定部署 raw BabeL-O Nexus 服务。
- 配置 provider/API key，确保 BabeL-O agent 能真实生成 `index.html`。
- 将 staging env 切到 `DUDESIGN_RUNTIME_PROVIDER=babel-o`，跑真实 prompt smoke。
- 将 adapter 的 session/job 映射持久化，支持 adapter 重启后的 resume/cancel。
- 将 `/v1/stream` 从 wait-after-complete 升级为近实时转发。

## 2026-06-28 M21 Stable Raw Nexus Compose Smoke

### 已完成

- 新增 raw BabeL-O Nexus staging compose profile：
  - `babel-o-nexus` 作为独立 runtime service。
  - `runtime-adapter` 通过 `BABELO_NEXUS_BASE_URL=http://babel-o-nexus:3000` 调用 raw Nexus。
  - API 仍只指向 DUDesign runtime adapter，不直接依赖 raw Nexus 私有协议。
- 新增 `deploy/staging/babelo-nexus.Dockerfile`：
  - 从 BabeL-O 源码构建 runtime image。
  - 暴露 `NEXUS_HOST`、`NEXUS_PORT`、`NEXUS_API_KEY`、workspace/data 等运行时配置。
- 新增 `deploy/staging/scripts/deploy-babelo-source-remote.sh`：
  - 将本地 BabeL-O source 发布到服务器 `/home/ubuntu/deployments/babel-o/current`。
  - 供 staging compose 的 `BABELO_NEXUS_CONTEXT` 使用。
- `deploy-remote.sh` 在 `DUDESIGN_RUNTIME_PROVIDER=babel-o` 时：
  - 自动复制 BabeL-O Nexus Dockerfile 到远端 `/tmp/dudesign-babelo-nexus.Dockerfile`。
  - 校验 `BABELO_NEXUS_CONTEXT/package.json` 存在。
  - 启用 `--profile babel-o`。
- `smoke-remote.sh` 在 `babel-o` provider 下新增：
  - raw BabeL-O Nexus `/health` smoke。
  - runtime adapter `/v1/health` smoke。
  - admin runtime health 非 mock 校验。
- 修复真实 compose 环境暴露的空鉴权头问题：
  - `BABELO_AUTH_HEADER=` / `BABELO_NEXUS_AUTH_HEADER=` 为空时，Gateway/Adapter 会回退到 `authorization: Bearer ...`。
  - 为 runtime gateway 和 runtime adapter 分别增加回归测试。
- Adapter `/v1/contract` 会读取 raw Nexus `/v1/runtime/version`，让 contract payload 也携带 `runtimeVersion=0.3.9`。

### 云端验证

- 已将 BabeL-O source 发布到服务器：
  - `/home/ubuntu/deployments/babel-o/current`
- 使用临时 compose project 启动：
  - raw BabeL-O Nexus
  - DUDesign runtime adapter
- 云端 smoke 结果：
  - raw Nexus `/health` 返回 `runtime=babel-o`、`version=0.3.9`。
  - adapter `/v1/health` 返回 `runtimeVersion=0.3.9`、`status=compatible`。
  - adapter `/v1/contract` 返回 DUDesign contract `2026-06-26.dudesign-runtime.v1`。
- 临时 probe 结束后已清理容器、网络和临时文件，不影响当前正式 staging 服务。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm run typecheck`
- `npm test`
- 云端 raw Nexus + adapter compose probe。

### 决策

- Staging 真实内核接入采用“两段式”：
  - raw BabeL-O Nexus 负责内核运行能力。
  - DUDesign runtime adapter 负责协议兼容、contract 输出和事件归一化。
- 空环境变量不能破坏 runtime 鉴权头，所有 auth header name 都必须按 blank-as-unset 处理。
- 当前 probe 只验证 raw Nexus + adapter compatibility，不切换正式 staging API provider。

### 下一步

- 给 raw BabeL-O Nexus 配置真实模型 provider/API key，让 agent 能实际生成 `index.html`。
- 将 staging env 切到 `DUDESIGN_RUNTIME_PROVIDER=babel-o` 并跑端到端真实 prompt smoke。
- 将 adapter 内存 session/job 映射持久化，避免 adapter 重启后 resume/cancel 丢上下文。
- 将 `/v1/stream` 从 wait + transcript 升级为更实时的事件转发。

## 2026-06-28 M22 Runtime Adapter Persistent State

### 已完成

- 新增 runtime adapter 状态存储接口：
  - `RuntimeAdapterStateStore`
  - `NoopRuntimeAdapterStateStore`
  - `FileRuntimeAdapterStateStore`
- Adapter 状态快照包含：
  - DUDesign session id -> raw Nexus runtime session id 映射。
  - DUDesign stream id -> raw Nexus agent job / child session / workspace root 映射。
  - stream id sequence。
- Adapter 会在以下节点持久化状态：
  - 创建 runtime session 后。
  - resume session 后。
  - spawn agent 生成 stream 后。
  - stream 消费完成并删除映射后。
- `createRuntimeAdapterServer()` 支持注入 state store；默认仍使用 no-op store，保持本地测试和临时实例轻量。
- `server.ts` 支持 `RUNTIME_ADAPTER_STATE_FILE`，打开文件状态存储。
- Staging compose 为 runtime adapter 增加独立 volume：
  - `runtime-adapter-state:/app/.dudesign/runtime-adapter`
  - 默认状态文件 `/app/.dudesign/runtime-adapter/state.json`
- 新增重启恢复测试：
  - 第一个 adapter 实例 spawn agent 并写入 stream state。
  - 关闭第一个实例。
  - 第二个 adapter 实例从同一 state file 恢复 stream。
  - 恢复后的 `/v1/stream` 可以继续 wait/transcript/artifact 输出。
  - 消费完成后 state file 中对应 stream 被清理。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`

### 决策

- 当前阶段不把 runtime adapter 直接绑定 PostgreSQL，避免第 4 层依赖第 3 层业务数据访问实现。
- File store 满足 staging 单实例重启恢复；后续 production 多副本可替换为 Redis/PostgreSQL-backed store，而不改变 adapter 核心协议。
- stream 消费完成前持久化 raw agent job handle，优先保证 API 端已经拿到的 stream id 在 adapter 重启后还能继续读取。

### 下一步

- 跑全量 `npm run typecheck` 和 `npm test`。
- 做一次云端 runtime adapter state volume smoke。
- 下一阶段推进真实 prompt smoke 前，需要先配置 raw BabeL-O Nexus 的模型 provider/API key。

## 2026-06-28 M23 Runtime Adapter Execute Path

### 已完成

- Runtime adapter 从 raw Nexus `/v1/agents` + wait/transcript 路径切换到 raw BabeL-O `/v1/execute`。
- Adapter stream 会直接调用 `/v1/execute`，并把返回事件转换为 DUDesign runtime stream。
- Adapter stream state 持久化新增：
  - `prompt`
  - `modelId`
- Adapter 重启恢复 stream 时可以继续使用原 prompt 和模型上下文。
- 新增 `RUNTIME_ADAPTER_WORKSPACE_BASE`：
  - 相对 `workspaceRoot` 会解析到 runtime 容器内 workspace base。
  - 绝对 `workspaceRoot` 保持不变。
- Staging compose 将 `babel-o-workspace` volume 同时挂载到 raw Nexus 和 runtime adapter。
- 对 `babel-o-default` 这类 DUDesign 占位模型做空模型透传，让 BabeL-O 使用自身默认模型。

### 验证

- `npm run typecheck`
- `npm test`
- `npm --workspace @dudesign/runtime-adapter run test`

### 决策

- 当前 raw BabeL-O 的真实执行入口以 `/v1/execute` 为准；DUDesign adapter 继续对上游暴露稳定 `/v1/agents` / `/v1/stream` contract。
- DUDesign API 不直接理解 raw `/v1/execute`，仍只通过 Gateway/Adapter 通信。
- workspace volume 必须由 raw Nexus 和 adapter 共享，否则 adapter 无法稳定读取执行后写入的 `index.html`。

### 下一步

- 将 staging env 切到 `DUDESIGN_RUNTIME_PROVIDER=babel-o`，跑真实 prompt smoke。
- 根据真实 prompt smoke 结果补齐 contract tests。
- 继续收紧 workspace root 安全策略和 symlink escape 防护。

## 2026-06-28 M24 Staging Prompt Smoke Script

### 已完成

- 新增 `deploy/staging/scripts/smoke-babelo-prompt-remote.sh`。
- 当 staging runtime provider 不是 `babel-o` 时，prompt smoke 会明确跳过。
- 当 staging runtime provider 是 `babel-o` 时，脚本会：
  - 通过 API 读取 bootstrap workspace。
  - 创建 DUDesign session。
  - 创建 1 个 variation 的 design job。
  - 轮询 job 到 completed。
  - 读取 variation preview HTML。
  - 拒绝 mock/fallback 输出，例如 `Mock preview` 和 `BabeL-O completed without writing index.html`。
- `smoke-remote.sh` 在常规 web/api/admin/runtime health smoke 后调用 prompt smoke。

### 验证

- `bash -n deploy/staging/scripts/smoke-remote.sh`
- `bash -n deploy/staging/scripts/smoke-babelo-prompt-remote.sh`

### 决策

- Prompt smoke 放在 staging 脚本层，而不是默认 `npm test`，因为它依赖远端 compose、raw BabeL-O Nexus 和 provider/API key。
- 真实 prompt smoke 是否通过仍以实际 staging 执行为准；当前只完成自动化脚本接入。

### 下一步

- 部署最新 main 到 staging。
- 将 staging env 配置为 `DUDESIGN_RUNTIME_PROVIDER=babel-o` 并配置 raw BabeL-O 模型 provider/API key。
- 执行 `deploy/staging/scripts/smoke-remote.sh`，用自动 prompt smoke 验证真实生成链路。

## 2026-06-28 M25 Staging BabeL-O Prompt Smoke Pass

### 已完成

- 将 `e2aa1c4 Add staging BabeL-O prompt smoke` 推送到 `origin/main`。
- 部署 staging 后完成真实 BabeL-O 链路 smoke：
  - raw BabeL-O Nexus health 返回 `runtime=babel-o`、`version=0.3.9`。
  - DUDesign runtime adapter health 返回 `status=compatible`、`contractVersion=2026-06-26.dudesign-runtime.v1`。
  - API/admin/web 本地与公网 smoke 均返回 200。
  - `smoke-babelo-prompt-remote.sh` 创建真实 design job 并完成生成：
    - `job_3f368707f41a42d9`
    - `var_8a994f990d6c4bda`
- 强化 `smoke-remote.sh`：
  - raw Nexus health 增加远端重试。
  - runtime adapter health 增加远端重试。
  - 避免容器刚启动时的一次性 connection reset 误判部署失败。

### 验证

- `deploy/staging/scripts/smoke-remote.sh`

### 决策

- staging 真实 prompt smoke 已从“脚本已接入”推进到“远端真实通过”。
- 启动期健康检查允许短暂重试，但 prompt smoke 仍保持严格：不能接受 mock/fallback HTML。

### 下一步

- 补齐真实 runtime contract tests，把当前 staging 通过的事件流固化为 golden baseline。
- 注入 variation index 和风格差异 prompt，验证 3/6 variation 真实并发。
- 继续收紧 workspace root 与 symlink escape 安全策略。

## 2026-06-28 M25.1 Runtime Model Discovery Planning

### 现状确认

- Runtime Adapter 目前已经支持 health、contract、session、agent、stream、cancel、artifact bridge。
- 模型上下文已经可以从 DUDesign 业务服务层传到 adapter，再透传/注入给 BabeL-O。
- 但 adapter 尚未提供真实模型发现能力，无法确认 `babel-o-default`、`babel-o-fast` 是否对应 BabeL-O/provider 当前可用模型。

### 规划调整

- 在 Runtime Compatibility Layer 增加模型发现 contract：
  - 首选 adapter 暴露 `GET /v1/models`。
  - 如果 raw BabeL-O 后续有自身模型列表端点，adapter 做归一化透出。
  - 如果 raw BabeL-O 不支持，adapter 可从受控配置读取 provider/model metadata，并返回 `source=config`。
- 归一化字段建议：
  - `runtimeModelId`
  - `provider`
  - `providerModelId`
  - `displayName`
  - `capabilities`
  - `contextWindow`
  - `inputTokenCostCents`
  - `outputTokenCostCents`
  - `status`
  - `source`
  - `raw`

### 待实现

- 扩展 runtime contract manifest，声明是否支持 model discovery。
- 为 `GET /v1/models` 增加 adapter 单元测试和 staging smoke。
- 在不支持发现时返回明确 unsupported/degraded，而不是伪造真实 provider 列表。

## 2026-06-28 M25.3 Parallel Variation Workspace Isolation

### 问题定位

- 远端最新复杂生成任务 `job_939cc3306a254ecd` 出现 4 个 variation 中 1 个成功、3 个失败。
- BabeL-O Nexus SQLite 事件显示失败原因为 `Execution timed out.`，运行窗口约 5 分钟。
- 失败前模型持续修复同一个 `/workspace/workspaces/ws_dev/index.html`，并在结果摘要中提到文件内容被混合、旧内容残留、需要 clean rewrite。
- 根因是并行 variation 共用同一个 runtime session/workspace/output path，多个执行流竞争写 `index.html`。

### 已完成

- Gateway 在 `spawnVariationAgent()` 时为每个 variation 派生独立 runtime workspace root：
  - `workspaceRoot/runtime-jobs/{jobId}/variation_01`
  - `workspaceRoot/runtime-jobs/{jobId}/variation_02`
  - 以此类推。
- Runtime Adapter 在 spawn 模式下为每个 variation workspace 创建独立 BabeL-O runtime session。
- Runtime Adapter 会在执行前创建 variation workspace 目录。
- 保留 DUDesign 业务层 workspace/artifact 模型不变，隔离只发生在 runtime 执行目录。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/runtime-adapter run test`

### 决策

- 并行生成不能依赖同一个 runtime cwd 写同名 `index.html`。
- Refine 仍绑定单个 variation 的 runtime session/context，不走并行 workspace 派生。
- 远端服务器只有重新部署包含该源码的版本后，才会应用这项隔离修复。

## 2026-06-28 M25.2 Variation Code Delta Contract

### 已完成

- DUDesign 标准事件契约新增 `design.variation_code_delta`：
  - `path`
  - `language`
  - `delta`
  - `sequence`
  - `isFinal`
- `BabelONexusEventAdapter` 支持将 `code_delta` / `file_delta` 归一化为 `design.variation_code_delta`。
- `MockRuntimeGateway` 在每个 variation 生成期间输出 `index.html` 分段代码流，用于用户端 UX-M1 可视化和浏览器 E2E。
- runtime contract mapping 允许声明：
  - `code_delta -> design.variation_code_delta`
  - `file_delta -> design.variation_code_delta`

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`

### 决策

- `design.variation_streaming` 继续表示 assistant/thinking/tool/system 日志。
- `design.variation_code_delta` 专门表示可展示为文件内容的代码增量，避免把日志误认为最终文件。
- 旧 BabeL-O 版本只输出 `workspace_dirty/result` 时仍按原 artifact bridge 工作；`code_delta` 是增强能力，不是硬依赖。

### 下一步

- 在 runtime adapter service 中把真实 workspace 文件变化拆成近实时 `code_delta`。
- 增加 contract test：缺少 `code_delta` 能力时前端仍能展示 preview，存在能力时 card 内显示真实文件代码。
- 评估是否增加 `design.variation_file_snapshot`，用于 resume 后恢复完整代码窗口。

## 2026-06-28 M25.4 Runtime Adapter Final File Delta

### 已完成

- Runtime Adapter contract 增加 `file_delta -> design.variation_code_delta` 映射声明。
- `/v1/stream` 在读取最终 workspace artifact 后、输出 `result` 前，先输出一条 `file_delta`：
  - `path`
  - `language`
  - `delta`
  - `sequence`
  - `isFinal`
- Adapter 测试覆盖：
  - `/v1/contract` 声明 `file_delta`。
  - stream 输出中包含 `file_delta` 和 `index.html`。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`

### 决策

- 本轮先接“最终文件 delta”，让真实 BabeL-O 链路可进入用户端 Code tab。
- 近实时文件变化仍需要后续基于 raw Nexus transcript/workspace watch 或更细粒度事件能力实现。
- `file_delta` 不替代 `result`；`result` 仍是 artifact bridge 的最终产物事实来源。

### 下一步

- 为 Runtime Adapter 增加 workspace watch 或 polling 策略，在执行期间发现 `index.html` 变化就输出增量 `file_delta`。
- 增加 sequence/cursor 持久化，支持 adapter 重启后避免重复发送大段代码。

## 2026-06-28 M25.5 Runtime Adapter Multi-file Delta

### 已完成

- Runtime Adapter 的 artifact reader 从单一 `index.html` 扩展为常见 bundle 文件：
  - `index.html`
  - `styles.css`
  - `script.js`
  - `assets.json`
  - `dist/*` 同名文件
- `/v1/stream` 会为读取到的每个文件输出一条 `file_delta`，再输出最终 `result`。
- `languageForPath()` 支持 `json`，便于前端正确标识 assets manifest。
- Adapter 测试覆盖 `styles.css`、`script.js`、`assets.json` 的 stream 输出。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `npm test`

### 决策

- `result.html` 仍只承载入口 HTML；多文件展示依赖 `file_delta`。
- 当前只读取受控候选文件，不扫描整个 workspace，先降低 path/security 风险。

### 下一步

- 将候选文件列表升级为 artifact manifest 或安全目录扫描。
- 对 CSS/JS/assets 与 API artifact asset serving 的版本关系做一次端到端校验。

## 2026-06-29 M25.6 Runtime Artifact Quality Gate Planning

### 问题定位

- 远端已生成文件但 preview 全黑，说明“文件存在”不等于“产物可用”。
- 当前 Adapter/API artifact bridge 主要检查文件路径和可读取性，缺少静态页面质量门禁。
- 如果 BabeL-O 生成依赖外部脚本、CDN、JS hydration、纯 loading shell 或空 body 的页面，DUDesign 仍可能把它当作成功 artifact。

### 治理方向

- 在 artifact bridge 增加质量检查：
  - HTML 是否完整。
  - body 是否有可见内容。
  - 是否依赖外部 script/CDN 才能渲染。
  - 是否存在 loading-only/root-only shell。
  - 后续通过 Playwright screenshot 做全黑/空白像素检查。
- 对不合格 artifact 输出 runtime warning 或 failed/degraded 状态，并生成可读修复提示。
- 近实时 workspace watch 输出 `file_delta/workspace_dirty` 时，也应携带 artifact quality 摘要，方便用户端解释当前状态。

### 下一步

- 先完成用户端 Activity Stream，让用户知道每个 variation agent 的动作。
- 再实现最小 HTML 静态质量检查，阻止明显空壳/外部脚本依赖页面被标记为高质量预览。

## 2026-06-29 M25.7 Minimal Artifact Quality Gate

### 已完成

- API artifact bridge 增加最小静态 HTML 质量检查。
- 检查范围包括：
  - HTML 是否完整。
  - body 是否为空。
  - 是否缺少可见内容和基本页面结构。
  - 是否是 `#root/#app` hydration-only 空壳。
  - 是否是 loading-only shell。
  - 是否依赖外部 script / stylesheet。
  - 是否存在黑屏风险。
- 质量结果写入 artifact metadata：
  - `quality.status`
  - `quality.issues`
- 对 warn/fail 结果发布 `design.runtime_warning`，并带上 `jobId/variationId`，保证 SSE replay 和用户端 Activity Stream 可见。
- `GET /api/design-jobs/:id` 现在返回 artifact quality 摘要，支持结果墙直接标记问题预览。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm test`

### 下一步

- 将 Playwright screenshot pixel gate 池化或拆到 preview quality worker，避免生成链路被浏览器启动成本拖慢。
- 在 staging/prod 需要渲染级检查时显式启用 `DUDESIGN_ARTIFACT_PIXEL_GATE=1`。

## 2026-06-29 M25.8 Real Runtime Contract Golden And Variation Style Injection

### 已完成

- 将 `BabelONexusEventAdapter` golden replay 从概念事件扩展为贴近真实 BabeL-O `/v1/execute` 的事件基线：
  - `variation_code_delta`
  - `file_delta`
  - `workspace_dirty_detected` 多文件 artifact bundle
  - `result` 最终 artifact bundle
  - resume transcript 中的未知漂移事件
- 确认未知 BabeL-O event drift 只归一化为 `design.runtime_warning`，不会泄露私有事件，也不会破坏 DUDesign 标准事件流。
- `BabelORuntimeClient.spawnVariationAgent()` 在 Gateway 层注入 per-variation style directive：
  - variation index/count
  - 确定性风格方向
  - 用户 style tags 的解释约束
  - 静态 artifact bundle 约束
- 每个 variation 请求继续保持独立 runtime workspace root，同时 prompt 与 `templateRequirements.variationStyleDirection` 也具备差异化。

### 验证

- `npm --workspace @dudesign/runtime-gateway run test`
- `npm run typecheck`
- `npm test`

### 决策

- 风格差异化放在 Runtime Gateway 层实现，业务 API 仍只表达用户需求和模板偏好，避免用户端绑定 BabeL-O 内部 prompt 结构。
- Golden replay 覆盖的是 DUDesign 标准事件稳定性；真实 BabeL-O 新事件可以先降级为 warning，再按需要升级 adapter 映射。

### 下一步

- 在 staging 真实 3/6 variation 并发任务中观察差异化 prompt 的产物质量。
- 继续推进 artifact quality gate，避免真实内核生成黑屏、空壳或强依赖外部脚本的 artifact 被当成高质量结果。

## 2026-06-29 M25.9 Staging Multi-Variation BabeL-O Smoke

### 已完成

- `deploy/staging/scripts/smoke-babelo-prompt-remote.sh` 支持参数化 variation 数量：
  - `DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=1..6`
  - 默认仍为 1，避免常规 smoke 成本突然放大。
- 真实 BabeL-O prompt smoke 现在会校验：
  - job 完成。
  - variation 数量等于期望值。
  - 每个 variation 状态为 `completed`。
  - 每个 variation 有 preview URL。
  - 每个 variation 都有 HTML artifact。
  - HTML artifact quality 不能是 `fail`。
  - 每个 variation preview 都不是 mock/fallback HTML。
- 已在 staging 真实运行 3 variation 并发 smoke：
  - `job_83409a0c75fc4c9a`
  - `variations=3`

### 验证

- `bash -n deploy/staging/scripts/smoke-babelo-prompt-remote.sh deploy/staging/scripts/smoke-remote.sh`
- `DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=3 DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS=420 deploy/staging/scripts/smoke-babelo-prompt-remote.sh`
- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- `npm test`

### 决策

- 常规 staging smoke 继续默认 1 variation；需要验证并发时通过环境变量提升到 3 或 6，避免每次部署都触发高成本真实内核运行。
- 质量门禁先以静态 HTML 检查阻断明显不合格 artifact；真实渲染级别的全黑/空白判断进入下一阶段 Playwright pixel gate。

### 下一步

- 在预算允许时运行一次 `DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=6`，作为 6 variation 上限验证。
- 将 staging smoke 的 variation count、quality status、runtime cost 输出为结构化摘要，方便管理端和部署日志追踪。

## 2026-06-29 M25.10 Playwright Pixel Quality Gate And 6-Way Limit Probe

### 已完成

- 新增 `apps/api/src/artifactQuality.ts`，将 artifact quality 分为两层：
  - 默认静态 HTML 检查。
  - 可选 Playwright screenshot pixel gate。
- Pixel gate 通过 `DUDESIGN_ARTIFACT_PIXEL_GATE=1` 开启，默认关闭。
- Pixel gate 渲染 HTML 后截图，并解析 PNG 像素：
  - 识别透明/黑/白占比过高。
  - 识别极低视觉变化。
  - 将真实渲染全黑/全白/空白页升级为 `quality.status=fail`。
- API 测试增加 pixel gate smoke，确认 visually blank HTML 会被标记为 fail。
- Staging API 镜像安装 Playwright Chromium，保证启用 pixel gate 时容器内可运行浏览器。
- Staging 多变体 smoke 增加 HTTP 429 限流诊断。

### 验证

- `npm --workspace @dudesign/api run test`

### Staging 6 路验证结果

- 执行：
  - `DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=6`
  - `DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS=720`
- 结果：失败。
- 失败 job：
  - `job_e8de4b0def4b4253`
- 失败原因：
  - Variation 02 和 Variation 06 收到 `ADAPTER_STREAM_FAILED`。
  - BabeL-O Nexus 对 `/v1/execute` 返回 HTTP 429。
- 结论：
  - 当前 staging 真实 provider/runtime 能稳定通过 3 variation 并发。
  - 6 variation 上限验证暴露 provider/runtime 并发限流，需要 Runtime Gateway 增加 concurrency throttle 或 retry/backoff 后再作为稳定验收。

### 决策

- 不把 6 variation 429 视为 artifact bridge 或 workspace isolation 回归；它属于真实 runtime/provider capacity 边界。
- Pixel gate 默认关闭，避免每次 artifact materialize 都启动浏览器；需要强质量验收的 staging/prod 环境显式开启。

### 下一步

- 为 Babel-O runtime gateway 增加并发上限配置，例如 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY=3`。
- 对 HTTP 429 增加 retry/backoff，并在用户端展示“runtime capacity limited”的可理解状态。
- 将 pixel gate 的浏览器启动改为复用 browser instance 或独立 worker。

## 2026-06-29 M25.11 BabeL-O Subagent Review And Capacity Control

### 已完成

- 检查 BabeL-O 内核 subagent/agent scheduler 能力：
  - `ExploreAgentScheduler` 会创建 child session、parent-child channel 和 agent job。
  - 默认 `maxConcurrentAgents=4`。
  - 支持 `/v1/agents`、`/v1/agents/:jobId/wait`、`/v1/agents/:jobId/cancel`、transcript 读取。
  - 超出 scheduler 容量时返回 `AGENT_SCHEDULER_CAPACITY_EXCEEDED` / HTTP 429。
- 确认当前 BabeL-O scheduler 主要面向 `explore`、`review`、`test`：
  - 默认工具偏只读/验证。
  - `implement/debug/general` 仅在类型层预留，当前 scheduler 会拒绝。
  - 该能力不适合作为 DUDesign HTML variation 生成的直接执行器。
- 确认 DUDesign 当前真实生成链路：
  - DUDesign Gateway 负责 fan-out variation。
  - Runtime adapter 对上游暴露 DUDesign 语义的 `/v1/agents`。
  - Adapter 内部最终调用 raw BabeL-O `/v1/execute`。
  - raw `/v1/execute` 共享 BabeL-O `ExecutionGate`，容量满时返回 `EXECUTION_BUSY` / HTTP 429。
- 新增 `BabelORuntimeGateway` variation 并发阀：
  - 支持构造参数 `variationConcurrency`。
  - 支持环境变量 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY`。
  - 默认保持原行为，不主动限流。
- 新增 runtime adapter 对 raw BabeL-O `/v1/execute` 的 HTTP 429 retry/backoff：
  - 仅包裹 execute 数据面调用，不影响 session/cancel 等控制面 API。
  - 默认最多重试 2 次。
  - 支持 `RUNTIME_ADAPTER_EXECUTE_RETRY_ATTEMPTS`。
  - 支持 `RUNTIME_ADAPTER_EXECUTE_RETRY_BASE_DELAY_MS`。

### 验证

- 新增 Gateway 单测：4 个 variation、并发阀为 2 时，最大活跃 stream 不超过 2，最终 4 个 variation 均完成。
- 新增 runtime adapter 单测：raw Nexus 第一次 `/v1/execute` 返回 429，adapter 退避后重试成功并输出 result。

### 决策

- 短期不直接复用 BabeL-O 内部 subagent scheduler 做 DUDesign 多变体生成。
- 短期由 DUDesign Gateway 管 variation 级并发，由 runtime adapter 处理 raw `/v1/execute` 的瞬时容量退避。
- 中期如果要利用 BabeL-O subagent，需要 BabeL-O 提供稳定 contract：
  - `dudesign-html-generation` 或可用 `implement` profile。
  - 受控写入工具权限。
  - queue mode，而不是容量满时直接 429。
  - artifact bundle 输出契约。
  - contract manifest 声明 `supportsAgentScheduler`、`supportedAgentProfiles`、`maxConcurrentAgents`、`queueMode`。

### 下一步

- 在 staging 设置 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY=3` 后重新运行 6 variation smoke。
- 根据 6 variation 结果决定是否将 staging/prod 默认并发固定为 3，或按模型服务配置差异化并发。
- 将 runtime capacity limited 状态进一步透出到用户端 Activity Stream 和管理端 runtime health/metrics。
