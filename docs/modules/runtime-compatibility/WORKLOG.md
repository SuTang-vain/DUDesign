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
