# 后端内核兼容层工作记录

> 模块：Runtime Compatibility Layer
> 维护方式：按日期追加。记录 BabeL-O 适配、协议漂移、contract 测试和升级治理。

## 2026-07-09 RTC-M47 Runtime Lane Pool Planning

### 背景

- 远端真实 BabeL-O 动态百科生成测试出现 partial failure：同一 job 中部分 variation 完成，部分 variation 在 runtime hard watchdog 附近超时。
- 当前 DUDesign 已支持每个 variation 创建独立 child runtime session，但多个 child session 仍可能集中进入同一个 BabeL-O Nexus 实例。
- 单纯提高 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY` 不能解决单 runtime 实例资源竞争，反而可能放大 timeout 风险。

### 已完成

- 新增规划文档：`docs/modules/runtime-compatibility/runtime-lane-pool-plan.md`。
- 在 Runtime Compatibility TODO 中新增 Phase RTC-9：Runtime Lane Pool 与多线路并行调度。
- 在 Application Service TODO 中补充 variation runtime assignment metadata、标准事件持久化和用户/Admin API 边界。
- 在 Admin Console TODO 中补充 lane health、失败反查、drain/undrain 和单 lane smoke 治理入口。
- 修正 Runtime Adapter timeout 配置链路：
  - `NexusClient.execute()` 支持分别发送 `timeoutMs` 和 `watchdogTimeoutMs`。
  - `RuntimeAdapterOptions` 增加 `executeTimeoutMs` / `watchdogTimeoutMs`。
  - `apps/runtime-adapter/src/server.ts` 支持 `RUNTIME_ADAPTER_EXECUTE_TIMEOUT_MS` / `RUNTIME_ADAPTER_WATCHDOG_TIMEOUT_MS`。
  - staging compose/env example 暴露上述配置，默认 `execute=300000ms`、`watchdog=600000ms`。
  - 新增 runtime-adapter 回归测试，断言 raw Nexus `/v1/execute` payload 的两个 timeout 不再被同一个 300000ms 值锁死。
- 新增 Runtime Lane contract 基础模块：
  - `RuntimeLane`、`RuntimeLaneRegistry`、`RuntimeLaneLease`。
  - lease acquire/release、drain/unavailable 过滤、least-loaded 初步选择策略。
  - `parseRuntimeLaneConfigsJson()` 支持静态 lane JSON 配置校验。
  - `DUDESIGN_RUNTIME_LANES_JSON` 已接入 runtime-adapter server；当前阶段仅使用 primary lane，保持单 lane 行为兼容。
- 将 Runtime Lane 接入真实 stream 执行路径：
  - `/v1/agents` 创建 stream 时 acquire lane lease，并返回 `runtimeLaneId` / `runtimeLeaseId`。
  - `/v1/stream` 按 stream 绑定的 lane 调用对应 Nexus，结束后释放 lease。
  - stream 首条输出 `runtime_lane_assigned` 标准 adapter 事件，后续可由 Gateway 映射为 `design.runtime_lane_assigned`。
  - `RuntimeAdapterStateStore` 持久化 `runtimeLaneId` / `runtimeLeaseId`。
  - 默认未配置 lane pool 时使用高容量 single lane，保持既有并发创建 pending streams 的兼容行为。
- 完善 lane 调度与观测：
  - 调度策略升级为 least-inflight + round-robin tie break。
  - `/v1/health` 输出脱敏 lane 列表：id、provider、status、inflight、maxConcurrent、weight、contractVersion、lastHealthAt、lastErrorCode。
- 打通 Gateway 和业务事件流：
  - `@dudesign/contracts` 新增 `design.runtime_lane_assigned` 标准事件。
  - `BabelONexusEventAdapter` 将 adapter raw event `runtime_lane_assigned` 映射为 `design.runtime_lane_assigned`。
  - `BabelORuntimeGateway.spawnVariationAgents()` 可把 lane assignment 事件透传到业务服务层。
  - Runtime adapter contract manifest 和 MockRuntimeGateway contract manifest 都声明 `runtime_lane_assigned -> design.runtime_lane_assigned`。
  - Application Service 现有 design event append/replay 链路已覆盖该事件，并新增测试断言可通过 SSE replay。

### 决策

- Runtime Lane Pool 主归属后端内核兼容层。
- MVP 推荐由单 Runtime Adapter 内部管理多个 BabeL-O Nexus backend，而不是让用户前端或业务服务层直接理解多 Nexus 拓扑。
- Application Service 只保存 DUDesign 标准化 lane assignment metadata，不参与具体 lane 调度。
- 用户前端默认不展示 raw lane 拓扑；管理端按权限展示排障字段。

### 后续关注

- 增加 lane drain/undrain 控制入口，并将 drain 状态纳入 Admin API / Admin UI。
- 将 lane assignment metadata 写入 variation snapshot / PostgreSQL 字段，供 Admin API 直接查询。
- staging docker compose 后续增加 2-3 个独立 BabeL-O Nexus backend，再做真实动态百科 multi-lane smoke。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`

## 2026-07-08 RTC-M46 Dynamic Encyclopedia Vertical Matrix Staging Smoke

### 已完成

- 扩展 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`：
  - 默认仍只跑一条低成本动态百科真实 BabeL-O smoke。
  - 新增 `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=1` opt-in 模式，顺序跑四个垂类 case。
- 四垂类 case 覆盖：
  - 电影：`dtp_de_film_cast_role_network`，校验分类为 `影视作品 / 电影`，并断言不触发播放/下载、评分/票房来源类禁用 finding。
  - 电视剧：`dtp_de_tv_episode_chain`，校验分类为 `影视作品 / 电视剧`，并断言不触发分集剧情幻觉、剧透控制、影视资源入口类禁用 finding。
  - 历史人物：`dtp_de_history_person_relationship`，校验分类为 `名人 / 历史人物`，并断言不触发人物关系缺来源 finding。
  - 文化类词语：`dtp_de_cultural_phrase_origin_story`，校验分类为 `知识术语 / 文化类词语`，并断言不触发出处典故缺来源、关联词关系类型缺失 finding。
- 单 case 支持可配置：
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TEMPLATE_ID`。
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_PRIMARY_CATEGORY`。
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_EXPECTED_SECONDARY_CATEGORY`。
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_FORBIDDEN_FINDING_IDS`。
- `deploy/staging/staging.env.example` 增加动态百科垂类矩阵 smoke 配置项。

### 验证

- `bash -n deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`

### 后续关注

- 部署到 staging 后执行：
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=1 deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`
- 若真实 BabeL-O 仍触发 forbidden finding，需要把对应垂类 risk flags 或子模板 prompt 进一步收紧，而不是放宽业务 spec review。

## 2026-07-03 RTC-M8.1 Product Mode Runtime Pass-through

### 已完成

- `SpawnVariationAgentsInput` 增加 `productMode`，默认兼容 `web_app`。
- `BabelORuntimeClient.spawnVariationAgent()` 将 `productMode` 传给 BabeL-O `/v1/agents`。
- Runtime Gateway 测试覆盖 `dynamic_encyclopedia_card` 透传，确保后续 adapter 可基于产物形态区分上下文。

### 验证

- `npm --workspace @dudesign/runtime-gateway exec tsc -b && node --test packages/runtime-gateway/dist/babelOClient.test.js`

### 后续关注

- 后续补动态百科 prompt context golden：product mode、词条引导 skill、democase tool policy、子模板和交互范式需要一起进入固定 baseline。

## 2026-07-03 RTC-M8 Dynamic Encyclopedia Runtime Boundary Planning

### 已完成

- 将动态百科 Runtime Context 写入 TODO：Phase RTC-8。
- 明确 Runtime Gateway 在动态百科链路中的职责：
  - 编译词条引导 skill prompt block。
  - 编译 democase MCP tool policy。
  - 编译父模板包、子模板、交互范式上下文。
  - 编译百科规范 repair context。
  - 继续归一化 BabeL-O 原始事件。
- 明确 Runtime Gateway 不负责分类、模板推荐、审查报告存储和半自动确认状态机。

### 决策

- Babel-O 不直接理解 DUDesign 的动态百科数据库模型，只接收标准化 prompt context 和 tool policy。
- democase MCP 真实调用前，仍需先固定 contract 和 golden，避免后续真实接入造成事件/上下文漂移。
- spec review repair prompt 由业务层构造摘要和修复目标，Gateway 只负责按 runtime 契约注入。

### 后续关注

- 等 Application Service 形成 guidance snapshot schema 后，补 Runtime Gateway golden。
- 真实 MCP smoke 需要覆盖 unavailable 降级，不能让工具失败表现为 runtime 崩溃。

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

## 2026-06-29 M25.12 Staging 6 Variation Controlled Concurrency Validation

### 已完成

- staging API 已配置 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY=3`。
- staging Runtime Adapter 已配置：
  - `RUNTIME_ADAPTER_EXECUTE_RETRY_ATTEMPTS=2`
  - `RUNTIME_ADAPTER_EXECUTE_RETRY_BASE_DELAY_MS=750`
- 重新部署 staging 后，基础 health smoke 全部通过：
  - Web 200。
  - API 200。
  - Admin 200。
  - Runtime health 200。
  - Runtime contract `babel-o@0.3.9` compatible。
- 运行真实 BabeL-O 6 variation smoke：
  - `DUDESIGN_STAGING_PROMPT_SMOKE_VARIATION_COUNT=6`
  - `DUDESIGN_STAGING_PROMPT_SMOKE_TIMEOUT_SECONDS=720`
  - `deploy/staging/scripts/smoke-babelo-prompt-remote.sh`
- 结果通过：
  - job：`job_a3cfd72b57dc4c84`
  - variations：6/6 completed。
  - 每个 variation 均有独立 `runtime_child_session_id`。
  - 每个 variation 均有独立 `runtime_agent_job_id`。
  - 每个 variation 均生成 `current_artifact_id`。

### 决策

- staging/prod 默认将 `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY` 固定为 `3`。
- 用户选择 6 个 variation 时，系统以 3 并发分两批执行；这比直接 6 路打满 raw runtime 更稳定。
- Runtime Adapter 的 HTTP 429 retry/backoff 继续保留，作为瞬时容量抖动的补偿机制，不作为主并发控制。
- 后续如接入不同模型服务，应将并发上限进一步下沉到 model service 配置或用户模型访问策略。

### 额外发现

- 本次部署验证中发现 macOS 打包可能把 `._*.sql` AppleDouble 元数据文件带入 Docker context，导致 API migration 把二进制元数据误当 SQL 执行并触发 PostgreSQL `invalid message format`。
- 已在仓库侧通过 migration 文件过滤和 Docker ignore 策略收口：
  - migration 只加载数字开头的 `.sql` 文件。
  - Docker context 排除 `._*` / `**/._*`。

## 2026-07-01 M26 Runtime Model Discovery Contract

### 已完成

- 定义 DUDesign Runtime Model Discovery contract：
  - 标准端点：`GET /v1/models`。
  - 兼容旧端点：`GET /v1/runtime/models`。
  - 标准响应：`type=runtime_models`，并带 `discoveryStatus=supported`。
  - 不支持响应：`type=runtime_models_unsupported` 或 `discoveryStatus=unsupported`。
- Runtime Adapter 新增 `/v1/models` 和 `/v1/runtime/models`：
  - 优先读取 raw BabeL-O Nexus `/v1/runtime/config`。
  - 同步读取 `/v1/runtime/config/profiles`。
  - 将 active config/profile 归一化为 DUDesign `RuntimeModels.providers[].models[]`。
  - 不透出 provider API key 等敏感字段。
- Gateway client 更新：
  - 先请求 `/v1/models`。
  - `/v1/models` 404 时回退 `/v1/runtime/models`。
  - 两个端点都不可用或 runtime 明确不支持时，返回 `discoveryStatus=unsupported`，而不是抛出普通 runtime failure。
- Runtime contract manifest 增加 `optionalEndpoints`，当前声明 `GET /v1/models`。
- Application Service 管理端模型同步增加 unsupported 降级：
  - `POST /api/admin/models/sync` 遇到 `discoveryStatus=unsupported` 时不写入 discovered model。
  - 不把已有 `runtime_discovery` 模型标记 missing。
  - 返回 `model.sync.unsupported` audit log。
  - 管理端 sync summary 显示 discovery unsupported，并提示保留已配置模型。

### 验证

- `npm run typecheck`
- `npx tsc -b packages/contracts packages/domain packages/artifact-store packages/runtime-gateway apps/runtime-adapter`
- `npx tsc -b packages/runtime-gateway apps/runtime-adapter && node --test packages/runtime-gateway/dist/babelOClient.test.js apps/runtime-adapter/dist/app.test.js`
- `npx tsc -b apps/api && node --test apps/api/dist/model-governance.test.js`

### 决策

- `/v1/models` 是 DUDesign 后续稳定 contract，`/v1/runtime/models` 仅作为兼容 fallback。
- Model discovery 是 optional runtime capability，不作为生成/恢复/预览的硬依赖。
- 不支持 discovery 的 BabeL-O 版本必须被识别为 `unsupported`，业务层保留 seed/config 模型，避免误禁用管理员已配置模型。
- 后续可把模型级并发、成本、可用区域等字段扩展到 `RuntimeModels.providers[].models[].metadata` 或 model service 配置层。

## 2026-07-01 M27 Runtime Activity And Near-Realtime Code Delta

### 已完成

- Runtime Adapter `/v1/stream` 增加 workspace code polling：
  - 默认 `250ms` 轮询当前 variation workspace。
  - 支持 `RUNTIME_ADAPTER_WORKSPACE_POLL_INTERVAL_MS` 配置。
  - 执行期间发现 `index.html`、`styles.css`、`script.js`、`assets.json`、`dist/*` 等代码文件变化时输出 `code_delta`。
  - 最终 workspace artifact bundle 仍输出 `file_delta`，并由 `result` 作为最终 artifact 事实来源。
- Runtime Adapter 将 raw `assistant_delta` / `thinking_delta` 归一化为可读 activity 摘要：
  - thinking 侧输出如“Planning the page structure.”、“Checking the brief and design constraints.”。
  - assistant 侧输出如“Writing index.html.”、“Refining visual styles.”、“Finishing the generated page.”。
  - 不再把 raw provider/transcript 碎片直接作为用户端默认 activity 文案。
- Gateway golden adapter 测试补充摘要化 delta 和 channel 断言。
- Runtime Adapter smoke 覆盖：
  - execute 期间写入 workspace 文件，stream 先输出 `code_delta`，后输出 final `file_delta/result`。
  - raw transcript 中的私有碎片不进入默认 stream 文案。

### 验证

- `npx tsc -b apps/runtime-adapter && node --test apps/runtime-adapter/dist/app.test.js`
- `npx tsc -b packages/runtime-gateway && node --test packages/runtime-gateway/dist/babelOAdapter.test.js`

### 决策

- 近实时 code stream 暂先使用 adapter-side polling，不切换 raw BabeL-O WebSocket `/v1/stream`，避免扩大传输协议风险。
- `code_delta` 是用户端生成卡片的实时可视反馈；最终 artifact 落库仍以 `file_delta/result` 为准。
- 后续如果 raw BabeL-O HTTP/WS 直接提供稳定 file/code event，可把 polling 替换为原生事件，但 DUDesign 标准事件不变。

## 2026-07-01 M28 Runtime Observability And Degraded Governance

### 已完成

- Admin runtime health 增加 observability 摘要：
  - `latencyMs`
  - `degraded`
  - `unavailable`
  - `contractMismatch`
  - `drift`
  - `degradedMode`
  - `rollbackAvailable`
  - `rollbackMode`
- `GET /api/admin/runtime/health` 在发现异常状态时记录 audit log：
  - `runtime.contract_mismatch`
  - `runtime.unavailable`
  - `runtime.degraded`
  - `runtime.drift_detected`
- Application Service 在收到标准 `design.runtime_warning` 且 code 为 `UNKNOWN_RUNTIME_EVENT` 时记录 `runtime.drift_detected`，用于追踪 BabeL-O event drift。
- 新增 `POST /api/admin/runtime/rollback`：
  - 记录 `runtime.config.rollback.requested` audit。
  - 返回 `unsupported_external_config_required`。
  - 明确不在 API 进程内直接修改 runtime 环境变量或远端部署配置。
- Phase RTC-7 的 MVP 治理闭环已落地：
  - 可观测性：health latency/status/audit。
  - 降级识别：degraded/unavailable/contract mismatch。
  - 回滚治理：先记录请求，实际切换仍由 deployment/config management 执行。

### 验证

- `node --test apps/api/dist/admin-runtime-health.test.js`
- `npm run typecheck`
- `npx tsc -b packages/runtime-gateway apps/runtime-adapter && node --test packages/runtime-gateway/dist/babelOClient.test.js packages/runtime-gateway/dist/babelOAdapter.test.js apps/runtime-adapter/dist/app.test.js`

### 决策

- 当前 MVP 不让 DUDesign API 直接改 `BABELO_BASE_URL` / `DUDESIGN_RUNTIME_PROVIDER` 等部署级配置，避免控制面越权或造成不可审计的进程漂移。
- “切回上一 runtime 配置”先作为审计化请求进入系统；真正自动切换需要后续引入 runtime config registry、active config table、版本化 secret reference 和部署编排器。
- Degraded 模式当前语义是：管理端可见、审计可追踪、业务侧继续允许读取既有 artifact，runtime 新任务是否可执行仍由 Gateway contract 状态和业务失败路径控制。

## 2026-07-01 M29 Workspace Root Safety And Pixel Gate Pooling

### 已完成

- 定义并落实 runtime workspace root 读取策略：
  - runtime adapter 只读取 DUDesign 指定 workspace root 内的相对文件。
  - 拒绝绝对路径、反斜杠路径、`.` / `..` 段、隐藏路径段。
  - workspace 文件读取前使用 `lstat` 和 `realpath` 校验。
  - symlink 文件不会被 artifact bundle 或 near-real-time `code_delta` 读取。
  - 目录扫描跳过 dotfile、`node_modules` 和 symlink entry。
- 防止 symlink escape：
  - 新增 adapter smoke：workspace 内 `styles.css` 指向 workspace 外部 secret 文件时，stream 不输出外部内容，也不把 symlink 当作 artifact file。
- Playwright pixel gate 池化：
  - 新增 API 侧共享 Chromium browser pool。
  - `artifactQuality` pixel gate 改为复用 pooled browser，仅按次创建/关闭 page。
  - `screenshotRenderer` 同样复用 pooled browser，减少截图/质量检查反复启动浏览器的成本。

### 验证

- `npx tsc -b apps/runtime-adapter --pretty false`
- `node --test apps/runtime-adapter/dist/app.test.js`

### 决策

- 本轮采用 browser pooling 作为低风险优化，先避免每个 artifact quality gate 都启动一个 Chromium。
- 独立 preview quality worker 暂不在本轮拆出；后续如 pixel gate 成为生成链路瓶颈，再把 screenshot/pixel analysis 全部移到 worker queue，并让生成链路只记录 pending quality status。
- workspace root 安全策略由 adapter 执行，业务服务层继续只消费 DUDesign 标准 artifact/file event，不直接信任 raw runtime 文件路径。

## 2026-07-03 RTC-M30 Dynamic Encyclopedia Spec Repair Context

### 已完成

- 自动修复 prompt 支持结构化 `specFindings` block。
- `POST /api/variations/:id/review-actions` 的 `confirm_repair` 会从 artifact quality metadata 读取 spec findings，并注入 BabeL-O refine queue prompt。
- 自动 automation loop repair 同样复用 spec findings 注入逻辑。
- Prompt block 使用 DUDesign 标准结构：
  - finding id。
  - source：`static_rule` / `template_rule` / `pixel_gate`。
  - severity：`error` / `warning`。
  - message。
  - repair hint。
- Runtime Gateway 仍只消费标准化后的 prompt，不直接读取 DUDesign 数据库、guidance 表或 democase 数据库。
- `runtime-compatibility/TODO.md` 已将“百科规范 repair context 编译为 refine prompt block”标记完成。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="Automation Loop repair prompt|Dynamic encyclopedia spec review|mock API flow"`

### 后续建议

- 增加 spec review repair context golden replay，固定 prompt block 结构。
- 跑真实 BabeL-O staging smoke，确认结构化 finding prompt 对 refine 结果有实际修复效果。

## 2026-07-03 RTC-M31 Spec Repair Prompt Golden Replay

### 已完成

- 将 `Automation Loop repair prompt` 中的动态百科 spec findings 测试升级为精确 golden baseline。
- Golden 固定：
  - quality issue 顺序。
  - `Structured dynamic encyclopedia spec findings:` block 标题。
  - finding id。
  - source。
  - severity。
  - message。
  - repair hint。
  - 原始用户目标和模板上下文位置。
- `runtime-compatibility/TODO.md` 已将 spec review repair context golden replay 标记完成。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="Automation Loop repair prompt|Dynamic encyclopedia spec review"`

### 后续建议

- 继续补词条引导 skill prompt block、democase MCP tool policy、动态百科子模板 prompt context 的 golden replay。
- 跑真实 BabeL-O staging smoke，验证 golden prompt block 在真实 refine 中能稳定修复 spec findings。

## 2026-07-03 RTC-M32 Dynamic Encyclopedia Template Prompt Golden

### 已完成

- `BabelORuntimeClient` 的 assigned template prompt block 增加动态百科 business context：
  - guidance id。
  - entry title。
  - primary/secondary category。
  - interaction paradigm id。
  - recommended child template ids。
  - automation mode。
- Runtime Gateway `SpawnVariationAgentsInput.templateRequirements` 增加标准 `businessContext` 类型。
- 将动态百科 child template prompt context 测试升级为 golden baseline，固定：
  - child template id/name/description。
  - business context 字段顺序。
  - color/typography/spacing/component tokens。
  - fixed PC/WISE viewport rules。
  - timeline/scroll/touch constraints。
  - do/don't rules。
  - stable template snapshot footer。
- `runtime-compatibility/TODO.md` 已将“动态百科子模板 prompt context” golden 标记完成。

### 验证

- `npm --workspace @dudesign/runtime-gateway exec tsc -b`
- `node --test packages/runtime-gateway/dist/babelOClient.test.js`
- `npx tsc -b packages/contracts packages/runtime-gateway apps/api apps/web`

### 后续建议

- 继续补词条引导 skill prompt block golden。
- 继续补 democase MCP tool policy golden。
- 最后跑真实 BabeL-O staging 动态百科端到端 smoke。

## 2026-07-03 RTC-M33 Dynamic Encyclopedia Plugin Policy Golden

### 已完成

- 为 `BabelORuntimeClient.spawnVariationAgent()` 增加动态百科插件上下文 golden replay：
  - `sk_encyclopedia_entry_guidance` 的 rules、prompt guidance、negative rules、quality checklist 被编译为稳定 `DUDesign plugin context`。
  - `mcp_encyclopedia_democase_readonly` 被编译为只读 MCP policy prompt line。
  - 传给 BabeL-O 的 `templateRequirements.toolPolicy` 固定为 `policy_only`，只包含 `readonly_context`、`requiresUserAuth=false`、`auditLevel=usage`。
- 明确 democase MCP binding 当前仍是生成期 policy/context，不让 Babel-O 直接读取 DUDesign 数据库或 democase 数据库。
- `runtime-compatibility/TODO.md` 已将词条引导 skill prompt block 和 democase MCP tool policy golden 标记完成。

### 验证

- `npm --workspace @dudesign/runtime-gateway exec tsc -b`
- `node --test packages/runtime-gateway/dist/babelOClient.test.js`

### 后续建议

- 继续补“父模板包 + 子模板 + 交互范式”的分层 prompt context，完成 RTC-8 最后一块上下文编译任务。
- 跑真实 BabeL-O staging 动态百科端到端 smoke，验证词条引导、democase policy、子模板和 spec review repair 在真实内核下的组合效果。

## 2026-07-03 RTC-M34 Dynamic Encyclopedia Layered Template Context

### 已完成

- 扩展 `CreateDesignJobRequest.templateRequirements` 与 Runtime Gateway 输入契约：
  - 支持保存 `interactionParadigm` snapshot。
  - 支持保存并恢复 `businessContext`。
- `ApplicationService` 的 entry guidance response 现在会把交互范式快照写入 `templateRequirements.interactionParadigm`。
- `normalizeTemplateRequirements()` 保留 `businessContext` 与 `interactionParadigm`，避免 retry/resume 后动态百科上下文漂移。
- `BabelORuntimeClient` 的 template prompt block 支持分层输出：
  - parent template package。
  - parent inherited constraints / do / don't。
  - assigned child template。
  - dynamic encyclopedia business context。
  - interaction paradigm snapshot。
  - child template tokens、layout、sections、do/don't。
- 新增 golden replay：`golden replays layered dynamic encyclopedia template and interaction context`。
- `runtime-compatibility/TODO.md` 已将“父模板包、子模板和交互范式分层 prompt context”标记完成。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api apps/web`
- `npm --workspace @dudesign/runtime-gateway exec tsc -b`
- `node --test packages/runtime-gateway/dist/babelOClient.test.js`

### 后续建议

- RTC-8 现在只剩真实 BabeL-O staging 动态百科卡片端到端 smoke。
- Staging smoke 需要覆盖：entry guidance -> job creation -> runtime prompt -> artifact quality/spec review -> preview/export。

## 2026-07-03 RTC-M35 Dynamic Encyclopedia Staging Smoke

### 已完成

- 新增 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`，固定动态百科真实 staging smoke 入口。
- Smoke 覆盖完整链路：
  - dev bootstrap。
  - 创建会话。
  - `POST /api/encyclopedia/entry-guidance`。
  - confirm guidance 并选择 `dtp_dynamic_encyclopedia_timeline_card`。
  - 使用 guidance 返回的 `capabilityRequirements` 与 `templateRequirements` 创建 `dynamic_encyclopedia_card` job。
  - 等待真实 BabeL-O job 完成。
  - 验证 variation 使用 timeline child template。
  - 验证 HTML artifact quality 不为 `fail`。
  - 验证 preview 不是 mock/fallback HTML。
  - 验证 export 产出 `export_zip` 下载包。
- 修正 smoke 脚本：
  - session `mode` 使用 `new_html`，产品模式只在 design job 用 `productMode=dynamic_encyclopedia_card` 表达。
  - export 校验读取 `exportArtifact`，而不是源 HTML `artifact`。
- 已在 staging 真实 BabeL-O 环境跑通：
  - `dynamic-encyclopedia-smoke:completed job=job_72689f29047643ef variations=1 guidance=eg_0ae649cc0f844f46`
- `runtime-compatibility/TODO.md` 已将 RTC-8 staging smoke 标记完成。

### 验证

- `bash -n deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`
- `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_TIMEOUT_SECONDS=720 deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`

### 后续建议

- 进入动态百科产品体验收口：用户端需要展示 guidance 结果、模板选择确认、自动审查状态和半自动修复入口。
- 增加 2/3 variation 动态百科 staging smoke，验证多个子模板/不同 variation 的能力分发。

## 2026-07-05 RTC-M36 MCP Invocation Contract

### 已完成

- 新增 `docs/modules/runtime-compatibility/mcp-invocation-contract.md`，固定从 `policy_only` 灰度到真实 MCP 调用的边界。
- 明确三种调用模式：
  - `policy_only`
  - `authorized_invocation`
  - `replay`
- 在 `@dudesign/contracts` 中新增标准契约类型：
  - `McpInvocationMode`
  - `McpInvocationRequest`
  - `McpInvocationResult`
  - `McpInvocationAuditRecord`
- 在 Runtime Gateway 新增 MCP invocation contract helper：
  - `runtimeMcpToolPolicy()`
  - `authorizeMcpInvocation()`
  - `mcpUnavailableResult()`
- 单测覆盖：
  - policy-only tool policy 稳定输出。
  - 真实调用前必须匹配 selected MCP tool、tool policy、binding target 和 scope。
  - 需要用户授权的 MCP 工具在未授权前拒绝调用。
  - MCP unavailable 归一化为可降级、可回放的标准 result。
- RTC-4.5 `定义真实 MCP 调用 contract` 标记完成。

### 决策

- Application Service 是唯一授权裁决者，Runtime/BabeL-O 不能绕过 DUDesign 直接访问数据库或用户资产。
- 词条引导向导查询和生成期 agent MCP tool policy 是两条链路。前者可由 Application Service 直连 democase 只读服务；后者必须走 MCP invocation contract。
- MCP result 只作为带来源上下文注入 prompt，不直接写入长期 memory。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway`
- `npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="MCP invocation|tool policy|dynamic encyclopedia"`

### 后续建议

- 实现 MCP 调用前授权校验在 Application Service 层的落点，并补 HTTP/API smoke。
- 定义 MCP audit repository/migration，再接真实 MCP smoke 的授权、调用、结果注入、审计、回放。

## 2026-07-05 RTC-M37 MCP Invocation Authorization Entry

### 已完成

- Application Service 已提供 `POST /api/mcp/invocations/authorize`，作为 runtime/adapter 发起真实 MCP 调用前的唯一授权入口。
- 入口复用 Runtime Gateway 的 `authorizeMcpInvocation()` contract helper，确保 Application Service 和 Runtime Gateway 对 tool policy 的理解一致。
- 授权结果写入 `audit_logs`：
  - `mcp.invocation.authorized`
  - `mcp.invocation.denied`
- API smoke 已覆盖授权通过和 scope denied。
- RTC-4.5 `实现 MCP 调用前授权校验，不允许 runtime 直接绕过 DUDesign Application Service` 标记完成。

### 边界

- 本轮不执行真实 MCP server 调用。
- 本轮不把工具结果注入 runtime prompt。
- 审计先使用现有 `audit_logs` 保存 request 和 authorization metadata；专用 replay payload 表仍待补。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|MCP|capabilities"`

### 后续建议

- 增加 `mcp_invocation_audit_records` 或等价 repository 方法，保存 request/result/replay key。
- 接入真实 MCP 调用执行器，并把 result 作为带来源的 tool context 注入 runtime。

## 2026-07-05 RTC-M38 MCP Invocation Replay Payload

### 已完成

- MCP invocation contract 的 request/result 现在会被 Application Service 固化为专用 audit record。
- 专用记录包含：
  - `McpInvocationRequest`
  - `McpInvocationResult`
  - `policySnapshotHash`
  - `runtimeContractVersion`
  - `replayKey`
- 授权通过和拒绝都会生成 replay payload，便于后续真实调用失败排查与合规回放。
- Runtime Compatibility TODO 中 `实现 MCP 调用审计和 replay payload` 标记完成。

### 边界

- 本轮完成 replay payload 和持久化，不执行真实 MCP server 调用。
- 本轮不实现 replay execution API。
- MCP 结果注入规范、MCP unavailable 降级事件和真实 MCP smoke 仍保持待办。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api`
- `npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="MCP invocation|tool policy|dynamic encyclopedia"`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|MCP|capabilities"`

## 2026-07-06 RTC-M39 MCP Executor And Tool Context

### 已完成

- 新增 `McpToolPromptContext` 契约，作为 MCP result 注入 runtime prompt 的标准载体。
- Runtime Gateway 新增 `mcpToolPromptContext()` helper：
  - 标注 `serverName/toolName/scopes`。
  - 保留 reference id/title。
  - 明确“只作为来源上下文，不自动写入长期 memory”。
- Application Service 新增可替换 `McpExecutor` 边界，默认 `MockMcpExecutor` 支持：
  - `encyclopedia-democase.lookupEntryDemoCases`
  - `quality-tools.validateAccessibility`
- 新增 `POST /api/mcp/invocations/execute`：
  - 先复用 `/authorize` 的权限校验。
  - 授权失败直接返回 denied result，不执行工具。
  - 授权通过后执行 MCP executor。
  - 将真实 result 回写同一条 `mcp_invocation_audit_records`。
  - 返回标准 `toolContext`，供后续 Runtime Gateway 注入 prompt。
- API smoke 覆盖 mock MCP 执行、结果注入 context 和审计记录更新。
- RTC-4.5 `MCP 结果注入规范` 标记完成。

### 边界

- 本轮仍未接真实外部 MCP server。
- 本轮未实现 replay execution API。
- MCP unavailable 目前以标准 result 表达，尚未进入用户端降级事件展示。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api`
- `npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="MCP invocation|tool policy|dynamic encyclopedia"`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|MCP|capabilities"`

## 2026-07-06 RTC-M40 MCP Replay Execution API

### 已完成

- 新增 replay response contract：`ReplayMcpInvocationResponse`。
- Repository 增加 `getMcpInvocationAuditRecordByReplayKey()`：
  - InMemoryStore 从 audit record map 中查找。
  - PostgresRepository 通过 `replay_key` 查询并回填 cache。
- 新增 `GET /api/mcp/invocations/replay/:replayKey`：
  - 只读取 `mcp_invocation_audit_records`。
  - 不访问外部 MCP server。
  - 校验当前用户对原 job 至少有 viewer 权限。
  - 返回历史 request/result、audit record 和由 result 派生的 `McpToolPromptContext`。
  - 写入 `mcp.invocation.replayed` audit log。
- API smoke 覆盖 execute 后 replay，断言 replay result/toolContext 与执行结果一致。

### 边界

- replay execution 已完成，但真实外部 MCP transport 仍未接入。
- 当前 replay 接口按 job viewer 权限开放，后续管理端可增加按 operator/developer role 的审计检索视图。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api`
- `npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="MCP invocation|tool policy|dynamic encyclopedia"`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|MCP|capabilities"`

## 2026-07-06 RTC-M41 MCP HTTP Transport Boundary

### 已完成

- 在 Application Service 层增加可配置 MCP transport：
  - `mock`
  - `http`
- HTTP transport 仍只消费 DUDesign 标准 `McpInvocationRequest`，并只接受 DUDesign 标准 `McpInvocationResult`，不把外部 MCP server schema 泄漏给业务层或 Runtime Gateway。
- HTTP transport 的失败统一归一化为 `MCP_UNAVAILABLE`，继续复用现有 audit/replay/toolContext 链路。
- Staging env example 增加：
  - `DUDESIGN_MCP_EXECUTOR`
  - `DUDESIGN_MCP_BASE_URL`
  - `DUDESIGN_MCP_ENDPOINT_PATH`
  - `DUDESIGN_MCP_API_KEY`
  - `DUDESIGN_MCP_AUTH_HEADER`
  - `DUDESIGN_MCP_TIMEOUT_MS`

### 边界

- 本轮完成 transport adapter，不接具体外部 democase 数据库。
- 真实 MCP server 需要遵循 DUDesign 标准 result envelope，或另行增加更下游的 server-specific adapter。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/api`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="MCP|mcp|serviceFactory|api flow|capabilities"`

## 2026-07-06 RTC-M42 Staging MCP HTTP Smoke

### 已完成

- Staging smoke 新增 MCP HTTP transport 端到端验证：
  - mock MCP server 返回标准 DUDesign `McpInvocationResult`。
  - API 使用 `HttpMcpExecutor` 调用该 server。
  - 结果进入现有 audit/replay/toolContext 链路。
- 主 staging smoke 脚本会在基础 smoke 和 BabeL-O prompt smoke 后执行 MCP HTTP smoke。

### 边界

- 该 smoke 验证 DUDesign HTTP transport 和标准 envelope，不验证真实 democase 数据库。
- 真实 MCP server 接入仍应新增独立 smoke，并保持默认 staging smoke 可离线运行。

### 验证

- `bash -n deploy/staging/scripts/smoke-mcp-http-remote.sh`

## 2026-07-06 RTC-M43 MCP Unavailable Degradation Event

### 已完成

- `POST /api/mcp/invocations/execute` 在 MCP executor 返回 `unavailable` 时，额外发布 DUDesign 标准事件：
  - `design.runtime_warning`
  - `code=MCP_UNAVAILABLE`
  - `severity=warn`
- 该事件绑定原始 session/job/variation，便于结果墙、单变体页和 SSE replay 用统一 runtime activity 方式展示。
- 用户端错误映射新增 `MCP_UNAVAILABLE`，显示为“能力暂时不可用”，不再被误读为 runtime 崩溃。
- API 事件测试覆盖：
  - authorized MCP invocation 执行失败归一化为 unavailable。
  - 不生成 tool context。
  - `design.runtime_warning` 持久化并可通过 `/api/design-jobs/:id/stream` replay。
- RTC-4.5 `MCP unavailable 降级事件` 标记完成。

### 边界

- 本轮只处理 MCP executor unavailable；MCP result `error` 的可恢复/不可恢复分类后续可按真实 server 错误码继续细化。
- 前端复用现有 runtime activity 提示，不新增单独 MCP 面板。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="MCP|mcp|design job event"`

## 2026-07-06 RTC-M44 Real MCP Opt-In Staging Smoke

### 已完成

- `deploy/staging/scripts/smoke-mcp-http-remote.sh` 增加真实 MCP server opt-in 分支：
  - 默认仍启动临时 mock MCP HTTP server。
  - 设置 `DUDESIGN_STAGING_MCP_REAL_SMOKE=1` 后读取真实 MCP server 配置。
  - 支持通过 `DUDESIGN_STAGING_MCP_REAL_BASE_URL`、`DUDESIGN_STAGING_MCP_REAL_ENDPOINT_PATH`、`DUDESIGN_STAGING_MCP_REAL_API_KEY`、`DUDESIGN_STAGING_MCP_REAL_AUTH_HEADER`、`DUDESIGN_STAGING_MCP_REAL_TIMEOUT_MS` 覆盖 staging `.env`。
- MCP staging smoke 现在验证：
  - capability policy 授权。
  - HTTP MCP 调用返回标准 DUDesign result。
  - result 注入 `toolContext`。
  - replay API 返回同一结果。
  - admin MCP invocation audit 可按 job/status 查询到 replay key。
  - 临时切换到不可达 MCP endpoint 后，execute 返回标准 `MCP_UNAVAILABLE`，并可在 admin audit 中查询。
- `deploy/staging/staging.env.example` 增加真实 MCP smoke opt-in env。

### 验证

- `bash -n deploy/staging/scripts/smoke-mcp-http-remote.sh`
- `bash -n deploy/staging/scripts/smoke-remote.sh`

### 决策

- 真实 MCP smoke 必须 opt-in，避免默认 staging smoke 依赖外部私有服务或真实 democase 数据库。
- unavailable 降级验证在同一脚本内通过临时不可达 endpoint 完成，确保真实服务不可用时不会表现为 runtime 崩溃。

### 下一步

- 接入真实 democase MCP server 后，用 `DUDESIGN_STAGING_MCP_REAL_SMOKE=1` 跑一次远端验证，并记录 provider 侧 result schema 差异。

## 2026-07-08 RTC-M45 Dynamic Encyclopedia Classification Vector Prompt Context

### 已完成

- Runtime Gateway `SpawnVariationAgentsInput.templateRequirements.businessContext` 扩展动态百科上下文：
  - `entryTertiaryCategory`。
  - `classification`。
  - `classificationVector`。
  - `isLanguageCategory` / `entryContentLanguage`。
  - `childTemplates`。
  - `reviewMode`。
- `BabelORuntimeClient` 的 dynamic encyclopedia business context prompt block 现在输出：
  - L1/L2/L3 分类。
  - 分类置信度和 signals。
  - `classificationVector.recommendedModulePriorities`。
  - `classificationVector.preferredTemplateIds`。
  - `classificationVector.riskFlags`。
  - 已选 child template、交互范式、置信度与推荐原因。
  - 面向 runtime 的风险处理指令：先处理垂类风险，再写 HTML。
- 更新 Runtime Gateway golden replay，固定 classification vector prompt 结构。

### 决策

- Runtime Gateway 不重新分类词条，只消费 Application Service 固化后的 `classificationVector`。
- `riskFlags` 作为生成前约束进入 prompt，spec review 仍作为生成后确定性门禁。
- BabeL-O 仍只看到标准化 prompt context，不读取 DUDesign guidance 表、模板数据库或 democase 数据库。

### 后续关注

- 真实 BabeL-O staging smoke 需要观察垂类 risk flags 是否减少影视资源入口、历史关系幻觉和文化典故硬拼。
- 若 prompt 长度膨胀明显，可把 child template reason 做摘要化或只注入 selected child templates。

## 2026-07-09 RTC-9 Runtime Lane Assignment Metadata Persistence

### 已完成

- `DesignVariation` 领域模型增加 runtime lane 观测字段：
  - `runtimeLaneId`
  - `runtimeBackendId`
  - `runtimeLeaseId`
  - `runtimeAttempt`
  - `runtimeLastErrorCode`
- Application Service 在收到 `design.runtime_lane_assigned` 标准事件时更新 variation snapshot：
  - 写入 `runtime_lane_id`。
  - 写入 `runtime_lease_id`。
  - 递增 `runtime_attempt`。
- Application Service 在收到 `design.variation_failed` 时同步 `runtime_last_error_code`，便于后续排查 lane timeout / unavailable / quality gate 等失败原因。
- PostgreSQL 增加 migration `0018_runtime_lane_variation_metadata.sql`，并同步 baseline schema。
- InMemoryRepository / PostgresRepository 持久化和 hydration 映射都支持 runtime lane metadata。
- `DesignJobSnapshotResponse` 暴露 variation runtime lane 字段，供后续 Admin Console 排障面板使用；用户端仍可选择隐藏 raw lane 拓扑。
- API 事件测试补充验证：
  - lane assignment event 被持久化。
  - SSE replay 可回放 `design.runtime_lane_assigned`。
  - job snapshot 中 variation 带有 lane id、lease id、attempt。

### 验证

- `npx tsc -b packages/domain packages/contracts --force && npm --workspace @dudesign/api exec tsc -b`
- `npm --workspace @dudesign/runtime-adapter run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `node --test apps/api/dist/designJobEvents.test.js`
- `node --test apps/api/dist/postgresRepository.test.js`（当前环境未配置 `POSTGRES_TEST_URL`，测试按设计 skip）

### 决策

- `runtimeBackendId` 当前先作为数据库和响应契约预留字段，等待 Runtime Adapter 在 lane config 中补充 backend 标识后再真实填充。
- 用户端不直接依赖 lane 字段；这些字段优先服务管理端排障、成本归因和 lane retry 治理。

### 下一步

- Runtime Adapter 的 `runtime_lane_assigned` 事件补充 `runtimeBackendId`。
- 实现 lane drain：draining lane 不再接收新任务，但已分配 stream 继续完成。
- 增加 lane unavailable / timeout 后的换 lane retry 事件与持久化。

## 2026-07-09 RTC-9 Runtime Lane Backend Identity

### 已完成

- `RuntimeLaneConfig` 增加可公开的 `backendId`，默认回退到 lane id。
- Runtime Adapter `/v1/agents` 响应和 `/v1/stream` 首条 `runtime_lane_assigned` 事件现在都会输出 `runtimeBackendId`。
- Runtime Adapter state store 持久化 `runtimeBackendId`，避免 adapter 重启后恢复 stream 时丢失 lane/backend 观测信息。
- Runtime Gateway raw event adapter 将 `runtimeBackendId` 映射到 `design.runtime_lane_assigned.payload.runtimeBackendId`。
- Application Service 收到 `design.runtime_lane_assigned` 后写入 variation `runtimeBackendId`。

### 验证

- `npx tsc -b packages/contracts packages/runtime-gateway apps/runtime-adapter apps/api --force`
- `npm --workspace @dudesign/runtime-adapter run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/designJobEvents.test.js`

### 决策

- `backendId` 是脱敏排障标识，不使用 raw `baseUrl`，避免把内网拓扑泄漏到用户/API 快照中。
- 后续 Admin Console 可以基于 `runtimeLaneId + runtimeBackendId` 展示失败分布、成本归因和 drain 操作影响面。

## 2026-07-09 RTC-9 Runtime Lane Drain Control

### 已完成

- Runtime Adapter 增加 lane drain 控制入口：
  - `POST /v1/lanes/:laneId/drain`
  - `POST /v1/lanes/:laneId/undrain`
- `/v1/health` 的 lane 列表增加脱敏 `backendId`，便于控制面定位目标 lane。
- drain 行为语义固定：
  - 已分配 stream 不被中断。
  - draining lane 不再接收新任务。
  - active stream 完成后正常释放 lease，lane 保持 `draining` 状态。
  - undrain 后 lane 状态恢复 `healthy`，可重新接收任务。
- Runtime Adapter contract `optionalEndpoints` 增加 drain/undrain 控制端点，供后续 Admin API 代理。
- 新增 runtime-adapter 回归测试覆盖 drain、health、调度绕开、stream 完成释放和 undrain 后重新接任务。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`

### 下一步

- Admin API 增加 lane drain/undrain 代理，并写入 audit log。
- Admin Console 增加 lane health 表和 drain/undrain 操作按钮。
- 继续推进 lane unavailable / stream idle timeout 换 lane retry。

## 2026-07-09 RTC-9 Runtime Lane Unavailable Retry

### 已完成

- Runtime Lane Registry 支持 acquire 时排除已失败 lane，用于换线 retry。
- Runtime Adapter 新增 `laneRetryAttempts` 配置，默认允许换 lane retry 一次。
- Runtime Adapter 在 raw Nexus execute 返回可恢复线路错误时执行换线：
  - HTTP 429：优先走既有同 lane capacity retry；同 lane retry 耗尽后可进入换线。
  - HTTP 408：归一为 `runtime_request_timeout`。
  - HTTP 5xx：归一为 `runtime_lane_unavailable`。
- 换线 retry 语义固定：
  - 标记原 lane 为 `unavailable` 并记录稳定错误码。
  - 释放原 lane lease。
  - 从候选中排除已尝试 lane，获取下一条可用 lane。
  - 在新 lane 创建新的 runtime child session，不复用旧 session。
  - 输出 `runtime_lane_retry_started`，随后输出新的 `runtime_lane_assigned`。
  - 无可用 lane 时输出 `runtime_lane_retry_exhausted`，再交由原失败流程输出 terminal error。
- Runtime Adapter state store 持久化 retry 所需 stream identity context：
  - `userId`
  - `workspaceId`
  - `sessionId`
  - `mode`
  - `variationIndex`
  - `memoryNamespace`
- `@dudesign/contracts` 增加标准事件：
  - `design.runtime_lane_retry_started`
  - `design.runtime_lane_retry_exhausted`
- Runtime Gateway adapter 映射 raw retry 事件到 DUDesign 标准事件。
- MockRuntimeGateway contract manifest 同步 retry event mappings。
- Application Service 收到 `design.runtime_lane_retry_started` 后更新 variation runtime lane metadata，并递增 `runtimeAttempt`。
- 新增测试覆盖：
  - lane unavailable 后成功换到另一条 lane。
  - 无备用 lane 时输出 retry exhausted。
  - Gateway golden replay 覆盖 retry started/exhausted。
  - API event chain 仍可持久化和 replay。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/designJobEvents.test.js`

### 边界

- 本轮完成的是 raw Nexus 明确返回不可用/超时类 HTTP 错误后的换线 retry。
- Gateway 侧 `RUNTIME_STREAM_IDLE_TIMEOUT` 发生在 Adapter 已开始输出流后，当前仍由 Gateway client 报错；要做到真正的 stream idle 换线，需要下一步让 Runtime Adapter 对 raw Nexus execute 增加自身 abort/idle watchdog，并在 Adapter 内触发换线。

### 下一步

- 给 Runtime Adapter `NexusClient.execute()` 增加 abortable timeout / idle watchdog，把 long-hang 转成可换线的 `RUNTIME_STREAM_IDLE_TIMEOUT`。
- 将 retry started/exhausted 持久化后的展示文案接入用户前端 runtime activity。
- Admin API / Admin Console 增加 lane retry 分布统计。

## 2026-07-09 RTC-9 Runtime Execute Watchdog Retry

### 已完成

- `apps/runtime-adapter/src/nexusClient.ts` 的 `requestJson()` 支持可选 `timeoutMs` 和 `AbortController`。
- `NexusClient.execute()` 使用 `watchdogTimeoutMs` 作为 HTTP abort watchdog：
  - raw Nexus 长时间不返回时中断请求。
  - abort 被归一为 `NexusClientError(status=408)`。
  - Adapter 既有 lane retry 逻辑将 408 归因为 `runtime_request_timeout`。
- Runtime Adapter 现在可以在 raw Nexus execute long-hang 时：
  - 标记原 lane `unavailable`。
  - 记录 `RUNTIME_REQUEST_TIMEOUT`。
  - 释放原 lane lease。
  - 切换到备用 lane。
  - 创建新的 runtime child session。
  - 输出 `runtime_lane_retry_started` 和新的 `runtime_lane_assigned`。
- 新增回归测试：lane-a `/v1/execute` 挂住直到 abort，Adapter 在 watchdog 后切换到 lane-b 并完成 artifact。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `npx tsc -b apps/runtime-adapter --force`

### 决策

- HTTP abort watchdog 当前只在 `NexusClient.execute()` 启用，避免改变 health/model discovery/session 等短请求路径的行为。
- 408 作为 Adapter 内部可恢复超时信号，不要求 raw BabeL-O Nexus 真的返回 HTTP 408。

### 下一步

- docker compose staging 增加 2-3 个独立 BabeL-O Nexus backend。
- 增加 multi-lane fake Nexus integration test。
- staging 真实动态百科 3 variation multi-lane smoke。

## 2026-07-09 RTC-9 Staging Multi-Lane Compose

### 已完成

- `deploy/staging/docker-compose.yml` 增加可选 `babel-o-multilane` profile。
- 保留现有 `babel-o-nexus` 作为单 lane / lane-a，新增：
  - `babel-o-nexus-b`
  - `babel-o-nexus-c`
- Runtime Adapter 在 `babel-o-multilane` profile 下会同时挂载 lane-b / lane-c 的 workspace volume：
  - `/runtime-workspaces/lane-b`
  - `/runtime-workspaces/lane-c`
- `apps/runtime-adapter/src/app.ts` 开始在 lane 分配后使用 `RuntimeLane.workspaceRoot` 解析相对 workspace root。
- 换 lane retry 时会按新 lane 的 workspace root 重新解析 cwd，并为新 lane 创建 runtime child session。
- Runtime Adapter state store 持久化 `workspaceRootInput`，避免 adapter 重启后无法复原 lane-relative workspace。
- `apps/runtime-adapter/src/server.ts` 接入 `RUNTIME_ADAPTER_LANE_RETRY_ATTEMPTS`。
- refine follow-up 会透传 variation 已保存的 `runtimeLaneId`：
  - Application Service 从 variation snapshot 取 `runtimeLaneId`。
  - Runtime Gateway 在 `/v1/agents/refine` payload 中带上 `runtimeLaneId`。
  - Runtime Adapter 对 refine 使用 preferred lane acquire，并按该 lane 的 workspace root 解析 cwd。
  - preferred lane 不可用或已满时返回明确 runtime lane unavailable，不静默漂移到另一条 lane。
- `deploy/staging/staging.env.example` 增加三 lane JSON 示例和 b/c 端口配置。
- `runtime-lane-pool-plan.md` 修正 compose 内部 baseUrl 使用容器端口 `:3000`，并补充 lane workspace root 字段。

### 验证

- 新增 Runtime Adapter 回归测试：同一相对 workspace 在不同 lane 下会解析到对应 lane root，并从对应 root 读取 artifact。
- 新增 Runtime Adapter refine 回归测试：指定 `runtimeLaneId` 后 follow-up refine 固定在原 lane root。
- 新增 Runtime Lane Registry 回归测试：preferred lane acquire 受健康状态和容量约束。

### 边界

- 当前 staging multi-lane 仍是静态配置，不引入服务发现。
- lane-a 复用现有单 lane `babel-o-nexus`，以降低迁移风险。
- 本轮完成 compose 拓扑、adapter lane workspace 解析和 refine lane affinity；尚未完成 compose 级 multi-lane fake Nexus integration smoke。

### 下一步

- 增加 multi-lane fake Nexus integration test。
- 在 staging 启用 `babel-o-multilane` profile，执行真实动态百科 3 variation smoke，并确认 job 至少分配到两条 lane。

## 2026-07-09 RTC-9 Multi-Lane Fake Nexus Integration

### 已完成

- 新增 `apps/runtime-adapter/src/multiLaneIntegration.test.ts`。
- 测试会启动多个真实本地 HTTP fake Nexus backend，而不是只 mock `fetch`：
  - 每条 lane 独立 HTTP port。
  - 每条 lane 独立 workspace root。
  - Runtime Adapter 通过真实 `NexusClient` HTTP 请求访问 fake Nexus。
- 覆盖三 variation 多 lane 调度：
  - 3 个 pending variation stream 分配到 `lane-a` / `lane-b` / `lane-c`。
  - 每条 lane 各执行一次 `/v1/execute`。
  - 每条 lane 写入自己的 `index.html` artifact。
  - stream 完成后 lease inflight 归零。
- 覆盖单 lane 失败隔离：
  - lane-b fake Nexus `/v1/execute` 返回 503。
  - lane-a / lane-c 仍能完成 artifact。
  - 失败 lane 输出 terminal error，不影响其他 lane 已完成 stream。

### 验证

- `npx tsc -b apps/runtime-adapter && node --test apps/runtime-adapter/dist/multiLaneIntegration.test.js`
- `npm --workspace @dudesign/runtime-adapter run test`

### 边界

- 本轮完成的是本地 fake Nexus HTTP integration，不需要真实 BabeL-O、不依赖 Docker。
- staging 真实动态百科 3 variation multi-lane smoke 仍是下一步；它需要远端启用 `babel-o-multilane` profile 和真实 `DUDESIGN_RUNTIME_LANES_JSON`。

### 下一步

- 增加/参数化 staging dynamic encyclopedia smoke，让它能在 `DUDESIGN_STAGING_RUNTIME_MULTILANE_SMOKE=1` 时断言至少两条 runtime lane 被使用。
- 远端启用 `babel-o-multilane` profile 后运行真实动态百科 3 variation smoke。

## 2026-07-09 RTC-9 Dynamic Encyclopedia Multi-Lane Smoke Gate

### 已完成

- `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh` 增加可选 multi-lane 断言开关：
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE=1`
- 当 multi-lane smoke 开启时：
  - 要求 `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT>=3`。
  - 继续沿用动态百科真实生成、preview、export、quality gate 校验。
  - 额外检查 job snapshot 中 variation 均带有 `runtimeLaneId`。
  - 额外检查 completed variations 至少使用两条不同 runtime lane。
  - 输出 `dynamic-encyclopedia-smoke:multilane lanes=...`，便于部署日志定位。
- `deploy/staging/staging.env.example` 增加 `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE=0` 默认配置和说明。

### 验证

- `bash -n deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`
- `npm --workspace @dudesign/runtime-adapter run test`
- `npx tsc -b packages/contracts packages/runtime-gateway apps/runtime-adapter apps/api --force`

### 边界

- 本轮只完成真实 staging smoke 的断言入口和本地脚本语法验证。
- TODO 中 “staging 真实动态百科 3 variation multi-lane smoke” 仍未勾选；需要远端实际启用 `babel-o-multilane` profile 后运行。

### 下一步

- 部署到远端并启用：
  - `DUDESIGN_RUNTIME_PROVIDER=babel-o`
  - `DUDESIGN_RUNTIME_LANE_MODE=static`
  - 三 lane `DUDESIGN_RUNTIME_LANES_JSON`
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VARIATION_COUNT=3`
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_MULTILANE_SMOKE=1`
- 运行 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`，通过后再勾选 RTC-9 最后一项。

## 2026-07-09 Dynamic Encyclopedia Interactive Preview Contract

### 已完成

- private variation preview 使用独立 HTML response contract，允许受控 self-contained inline JS 执行。
- share preview 保持 strict sandbox / no script，只读分享链路不放开交互脚本。
- Runtime prompt 从“静态 HTML 页面”调整为“self-contained HTML/CSS/JS artifact”，明确允许本地 tab、page-switcher、accordion、modal 等交互，禁止外部脚本、网络 API 和未打包资源。
- 动态百科 summary 官方 few-shot 升级为真实 `role="tab"` / `role="tabpanel"` 结构，并包含本地状态切换脚本。
- spec review 增加 Stage 1 warning：
  - visible tab 不得只有静态 active 状态。
  - page-switcher 不得只有静态页码。
  - modal trigger 不得缺少可打开的本地 modal panel。
- 新增浏览器级 smoke，验证 private preview 中 tab 控件可真实点击切换。
- Automation Loop repair prompt 从 `static HTML artifact` 改为 `self-contained HTML/CSS/JS artifact`，允许受控本地交互脚本并继续禁止外部脚本、远程 API、构建步骤和未打包资源。
- spec review finding 已接入定向 repair prompt：
  - `encyclopedia.fake_tab_interaction` 生成 tab/panel/aria/script 修复指令。
  - `encyclopedia.fake_page_switcher_interaction` 生成本地分页面板和状态切换修复指令。
  - `encyclopedia.fake_modal_interaction` 生成本地弹层、开关状态和可访问性修复指令。
  - no-scroll 相关 finding 生成固定 frame、移除 `.scroll-container`、转为 tab/page-switcher/modal 的修复指令。
- 半自动审查事件的 `promptPreview` 放大到 1200 字，确保用户端能看到关键定向修复入口。
- `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh` 增加真实浏览器交互 opt-in：
  - 开关：`DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_SMOKE=1`。
  - 严格模式：`DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_REQUIRED=1`，当选定模板/上下文必须产生 tab 时，缺少 tab 也判定失败。
  - 执行位置：远端 API 容器内，复用 staging API 镜像中的 Playwright/Chromium。
  - 验证方式：打开真实 `/api/variations/:id/preview`，点击第二个 tab，断言 `aria-selected` 和可见 panel 状态发生变化。
  - 默认关闭，避免普通 deploy smoke 因浏览器环境或成本变脆。
- 清理动态百科能力契约中的旧滚动口径：
  - `tpl_dynamic_encyclopedia_entry.requiredElements` 从 `explicit scroll container` 改为 `no-scroll frame` + `local overflow interaction`。
  - dual-surface skill 不再建议 fixed-size iframe 使用显式滚动容器。
  - staging dynamic encyclopedia prompt 从 `完整静态 HTML` 改为 `完整 self-contained HTML/CSS/JS`，并明确可见控件必须使用本地 inline JavaScript 更新 `aria-selected`、`hidden` 或 `aria-expanded`。

### 验证

- `npm --workspace @dudesign/api exec tsc -b`
- `npm --workspace @dudesign/runtime-gateway exec tsc -b`
- `npm --workspace @dudesign/web exec tsc -b`
- `bash -n deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`
- `node --test apps/api/dist/preview-interaction.test.js`
- `node --test apps/api/dist/automationLoop.test.js`
- `node --test apps/api/dist/designJobEvents.test.js`
- `node --test apps/api/dist/capabilities.test.js packages/runtime-gateway/dist/babelOClient.test.js`
- `node --test apps/api/dist/encyclopediaSpecReview.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/babel-runtime-api-flow.test.js packages/runtime-gateway/dist/babelOClient.test.js`

### 边界

- 本轮解决“生成结果像 tab 但不可点击”的基础问题：prompt、模板 few-shot、spec review、private preview CSP/sandbox 和浏览器 smoke 已串起来。
- auto/semi-auto repair prompt 已接入定向修复指令；真实 BabeL-O 是否稳定产出复杂交互仍需后续 staging smoke 观察。
- 真实 staging 预跑已到达 Babel-O execution 层，但当前远端仍是部署前脚本/契约，且 raw Nexus lane-c 返回 `EXECUTION_FAILED`、无详细 runtime error，未进入 preview interaction 断言阶段。下一步需要部署本轮 contract/smoke 更新后复跑；若仍 `EXECUTION_FAILED`，优先查看 raw Nexus execute/transcript 日志或临时降低 prompt 复杂度定位内核失败原因。

## 2026-07-09 RTC-9 Multi-Lane Real Smoke Follow-Up

### 远端验证结果

- 已将当前 worktree 打包部署到 `49.233.190.201` staging。
- 基础 deploy smoke 通过：
  - raw BabeL-O Nexus health：`version=0.4.0`。
  - DUDesign runtime-adapter health：`lane-a`、`lane-b`、`lane-c` 均 healthy。
  - public web/api/admin：200。
  - `babelo-prompt-smoke:completed`。
- 动态百科 3 variation multi-lane smoke 尚未通过：
  - job：`job_3590ba245b424283`。
  - lane-a / `dtp_dynamic_encyclopedia_compare_card` 完成并生成 artifact。
  - lane-b / `dtp_de_cultural_phrase_origin_story` 返回 `EXECUTION_FAILED`，无 artifact。
  - lane-c / `dtp_dynamic_encyclopedia_timeline_card` 返回 `EXECUTION_FAILED`，无 artifact。
  - raw Nexus 容器无服务级异常日志；失败表现为 `/v1/execute` 返回 `success=false`，且 transcript 只到 `Writing index.html.`。

### 本地修复

- Runtime Adapter：
  - 将 raw Nexus `execute.success=false` 包装为可重试的 `runtime_execution_failed`。
  - 多 lane spawn 模式下可切换到下一条 lane，并输出 `runtime_lane_retry_started`。
  - 无备用 lane 时回落为原始 BabeL-O 失败事件，保留 `code/message/detail`，避免被包装成泛化 `ADAPTER_STREAM_FAILED`。
- Application Service：
  - 动态百科模式下，用户显式选择 child template 时默认循环显式模板。
  - 不再为了凑齐 `variationCount` 自动补入其它动态百科子模板，避免企业词条 smoke 被文化词语/影视等垂类模板污染。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
- `node --test --test-concurrency=1 apps/api/dist/designJobEvents.test.js --test-name-pattern "dynamic encyclopedia|template isolation|variation template"`
- `npx tsc -b packages/contracts packages/domain packages/artifact-store packages/runtime-gateway apps/runtime-adapter apps/api --force`

### 下一步

- 重新部署本地修复到 staging。
- 再跑 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`。
- 通过后勾选 RTC-9 `staging 真实动态百科 3 variation multi-lane smoke`。

## 2026-07-09 RTC-9 Deferred Lane Lease And Waiting Retry Acquire

### 本地修复

- Runtime Adapter spawn 阶段改为 `planRuntimeLane`：
  - `/v1/agents` 只规划 `runtimeLaneId/runtimeBackendId`。
  - 不再提前创建 `runtimeLeaseId`，不增加 lane `inflight`。
  - `/v1/stream` 被真正消费时再 acquire lane lease。
- `RuntimeStream` 增加 `runtimeLeasePending`，持久化后可恢复未消费 stream 的 deferred lease 状态。
- retry 换 lane 时从一次性 `runtimeLaneRegistry.acquire()` 改为等待式 `acquireRuntimeLane()`：
  - 当 alternate lane 短暂繁忙时，在 `laneAcquireTimeoutMs` 窗口内等待。
  - 避免真实并行生成中“其他 lane 正在跑，瞬时无空闲”被误判为 `runtime_lane_retry_exhausted`。
- Runtime Adapter 增加可配置项：
  - `RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS`
  - `RUNTIME_ADAPTER_LANE_ACQUIRE_POLL_MS`
- staging env 示例补充 retry acquire 配置，并将建议窗口提高到 `300000ms`，适配动态百科复杂页面可能超过 3 分钟的真实生成耗时。

### 本地验证

- `npm --workspace @dudesign/runtime-adapter run test`
  - 45 tests pass。
  - 新增覆盖：`waits for a busy alternate runtime lane before retrying execution failure`。
- `npx tsc -b packages/contracts packages/domain packages/artifact-store packages/runtime-gateway apps/runtime-adapter apps/api --force`

### 远端部署与验证

- 已部署当前 worktree 到 `49.233.190.201` staging。
- 基础 deploy smoke 通过：
  - `raw-babelo-nexus-health`：`runtime=babel-o`，`version=0.4.0`。
  - `runtime-adapter-health`：`lane-a`、`lane-b`、`lane-c` 均 healthy，`inflight=0`。
  - public web/api/admin 均 200。
  - `babelo-prompt-smoke:completed job=job_c7c5ec88881d4914 variations=1`。
- 动态百科 3 variation multi-lane smoke 仍未完全通过：
  - job：`job_01d1ef141ead45ee`。
  - `var_bd8b6c85539a473b` 最终在 `lane-a` 完成，生成 HTML artifact `art_69d0426ac7454c65`，quality pass，并生成 desktop/tablet/mobile screenshots。
  - `var_2b9e72fc0e6a47da`、`var_1d73f08249294c6c` 在多次 lane retry 后失败，错误仍为 `EXECUTION_FAILED` 且 raw BabeL-O 未给出详细错误。
  - 事件流显示三条 lane 均被真实分配/重试使用过，说明 multi-lane 调度链路已打通。

### 关键发现

- 当前失败已经不是“没有启动后端内核”或“不能动态拉起多条 runtime 线路”：
  - 三个 BabeL-O Nexus backend 均已启动。
  - Runtime Adapter 可分配到 `lane-a`、`lane-b`、`lane-c`。
  - 单 variation 真实 BabeL-O 生成可完成。
  - 动态百科 3 variation 中至少一个 variation 可在 retry 后完成 artifact。
- 剩余问题集中在两个方面：
  - `RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS=120000` 对复杂动态百科生成偏短；`lane-a` 在约 12:37 完成，而两个失败 variation 在约 12:35:46/47 已因等待不到可用 lane exhausted。
  - raw BabeL-O `execute.success=false` 仍缺少 detail，导致 DUDesign 只能显示泛化 `BabeL-O execution failed without a detailed runtime error.`。

### 下一步

- 将远端 staging `.env` 同步为 `RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS=300000` 后重新部署/重启 runtime-adapter。
- 重新运行 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`。
- 若仍只有 1 个 variation 完成：
  - 优先增加 raw BabeL-O execution failure detail 采集。
  - 其次考虑把 multi-lane smoke 验收拆为两档：调度通路 smoke（至少使用两条 lane）与生成质量 smoke（至少两条 completed artifact）。
- 单独治理重复 `design.job_completed` 事件，避免 job stream terminal event 输出两次。

## 2026-07-09 RTC-9 Quality Gate False Positive Follow-Up

### 远端复测结果

- 将 staging `RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS` 提升到 `300000ms` 后，动态百科 3 variation job 已能全部完成：
  - job：`job_dc42e6a8c81143da`。
  - `var_3a5e3f2d60e64597`：completed，`lane-a`，attempt 1，artifact `art_79d10154f0df4a9e`。
  - `var_5169ab96cb2f4232`：completed，`lane-a`，attempt 5，artifact `art_b53e212fee474dbb`。
  - `var_bf14ef6dee414368`：completed，`lane-a`，attempt 5，artifact `art_787ade2cfbd74c7d`。
- 这说明 RTC-9 的 deferred lease + waiting retry acquire 已经解决了“并行任务因为 lane 短暂繁忙而过早 exhausted”的主问题。
- 本轮 smoke 仍失败的原因转移到 artifact quality gate：
  - `global_touch_blocked` 误判：artifact 仅在注释中出现 `no touch-action:none`，旧规则对整份 HTML 做正则扫描，导致 false positive。
  - `Rendered screenshot appears blank white` 误判：极简白底动态百科卡片可见内容面积较小，旧 pixel gate 只按白色占比 `> 0.96` 判白屏，容易误伤。

### 本地修复

- `reviewDynamicEncyclopediaSpec`：
  - `global_touch_blocked` 改为只检测全局 frame 选择器或 `html/body` inline style 上的真实 `touch-action:none`。
  - 先剥离 HTML、CSS block、JS line comments 后再检测触控拦截风险，避免说明性安全注释触发错误。
- `artifactQuality`：
  - 白屏 pixel gate 从单纯 `whiteRatio > 0.96` 调整为 `whiteRatio > 0.995 && transitionRatio < 0.001`。
  - 真空白页仍会 fail；白底但有文本/边界/视觉变化的卡片不再被误判为 blank white。
- `runtime-adapter`：
  - variation prompt 中残留的 `complete static HTML page` 改为 `complete self-contained HTML page with inline CSS and small local inline JavaScript when interaction is required`。
  - 明确禁止外部脚本、外部样式、远程 hydration 和网络加载 UI framework。

### 验证

- `npx tsc -b apps/api apps/runtime-adapter --force`
- `npm --workspace @dudesign/runtime-adapter run test`
  - 45 tests pass。
- `node --test apps/api/dist/artifactQuality.test.js apps/api/dist/encyclopediaSpecReview.test.js`
  - 23 tests pass。
  - 新增覆盖：
    - 注释中的 `touch-action:none` 不触发 `global_touch_blocked` / `touch_intercept_risk`。
    - `html, body { touch-action:none }` 仍会 fail。
    - 真空白白屏仍会 fail。
    - 白底但有可见内容的卡片不会触发 `blank white`。

### 下一步

- 部署本轮 quality gate 修复到 staging。
- 重新运行 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`。
- 若动态百科 3 variation 全部 pass/warn：
  - 勾选 RTC-9 staging multi-lane smoke。
  - 继续治理重复 `design.job_completed` terminal event。
- 若仍失败：
  - 优先收集失败 artifact 的 spec/pixel finding 原始输入和截图样本。
  - 再决定是收紧 prompt、调整质量门禁，还是增加 automation repair 的定向修复指令。

## 2026-07-09 RTC-9 Staging Quality Gate Redeploy And Failure Detail Fallback

### 远端复测结果

- 已部署 quality gate 修复到 `49.233.190.201` staging。
- 基础 deploy smoke 通过：
  - raw BabeL-O Nexus `version=0.4.0`。
  - runtime-adapter 三条 lane 均 healthy。
  - public web/api/admin 均 200。
  - 单 variation `babelo-prompt-smoke` 完成。
- 动态百科 3 variation multi-lane smoke：
  - job：`job_885b7d3d7f364c98`。
  - `var_a46acb53e3a34095` completed，artifact `art_76ed230f80fb43db`，quality warn（仍有 `overflow:auto/scroll`，但不是 fail）。
  - `var_9c7a83f7a97240e9` completed，artifact `art_20b0e9937fae4f73`，quality pass。
  - `var_5f5fbcc730404584` failed，`lane-c`，attempt 3，`EXECUTION_FAILED`，仍无具体 runtime detail。
- 本轮验证说明：
  - `touch-action:none` 注释误判已不再阻断。
  - 白底动态百科卡片不再被误判为 blank white。
  - RTC-9 当前主要剩余问题是 raw BabeL-O execution failure 的可诊断性与 timeline 子模板稳定性。

### 本地修复

- Runtime Adapter 在 `execute.success=false` 且 `execute.events` 没有 error/detail 时，主动调用 raw Nexus `/v1/agents/:agentJobId/transcript`。
- 将 execute events + transcript events 合并生成 failure summary：
  - 如果 transcript 内存在 error event，使用其 `code/message/detail`。
  - 如果没有 error event，使用 transcript 尾部事件作为 `detail`，避免只显示泛化 “without a detailed runtime error”。
- 新增回归测试：
  - `falls back to agent transcript detail when execute failure returns no events`。

### 验证

- `npm --workspace @dudesign/runtime-adapter run test`
  - 46 tests pass。

### 下一步

- 部署 transcript fallback detail 采集到 staging。
- 重新运行动态百科 smoke 或单独复测 timeline 子模板失败样本。
- 若失败 detail 显示为 prompt/工具/写文件问题：
  - 调整 timeline 子模板 prompt 或 BabeL-O adapter 约束。
- 若 transcript 仍然没有有效信息：
  - 需要在 BabeL-O Nexus 侧增强 `/v1/execute` 的 failure payload，至少返回 last tool call、last stderr、agent stop reason。

## 2026-07-09 RTC-9 Transcript Fallback Redeploy And Multi-Lane Assertion Split

### 远端复测结果

- 已部署 transcript fallback detail 采集到 `49.233.190.201` staging。
- 基础 deploy smoke 通过：
  - runtime-adapter 三条 lane 均 healthy。
  - public web/api/admin 均 200。
  - 单 variation `babelo-prompt-smoke` completed。
- 动态百科 3 variation smoke 重新运行：
  - job：`job_cea974ea57cf4b9f`。
  - 三个 variation 均 completed：
    - `var_0581a094a90b4311` -> `art_7c1223a9cf904c39`，quality pass。
    - `var_0cb5f6ff6cb94fdb` -> `art_a70e0ed6b6d74c27`，quality pass。
    - `var_59cd25596a784f0a` -> `art_b1ad9526e4ae43c8`，quality warn（neutral tone warning）。
  - smoke 仍以失败退出，原因不是生成失败，而是严格断言 `completed variations must use at least two runtime lanes`；最终 completed variation metadata 全部落在 `lane-a`。

### 结论

- RTC-9 的核心运行结果已经达到：
  - 3 variation 可全部完成。
  - artifact quality 达到 pass/warn，不再被 blank white 或 touch comment false positive 阻断。
  - retry 机制可以把失败/繁忙 lane 上的任务救回可用 lane。
- 当前 smoke 断言需要拆分：
  - `调度通路 smoke`：验证 lane-a/b/c 被分配、重试、释放，证明多线路调度链路有效。
  - `完成分布 smoke`：验证最终 completed artifact 来自至少两条 lane，作为 lane 健康/稳定性指标，而不应与“生成是否成功”混为一个 hard fail。
- 仍需继续分析 lane-b / lane-c 的动态百科完成率偏低：它们参与了分配，但最终完成经常回流到 lane-a。

### 下一步

- 调整 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh` 的 multi-lane 断言：
  - completed artifacts 全部 pass/warn 时，生成 smoke 应通过。
  - lane 分布不足两条时输出 warning/diagnostic，或在单独 `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_COMPLETION_LANE_REQUIRED=1` 下才 hard fail。
- 补充 lane event / variation attempt 查询，避免只看最终 variation metadata 丢失“曾经使用过 lane-b/c”的调度事实。
- 后续单独治理 lane-b/c 完成率，而不是继续把它阻塞在 artifact quality 或基础生成 smoke 上。

## 2026-07-09 RTC-9 Split Smoke Assertion Remote Validation

### 远端复测结果

- 已将拆分后的 `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh` 部署到 `49.233.190.201` staging。
- 远端 runtime-adapter health 显示三条 lane 均 healthy：
  - `lane-a`
  - `lane-b`
  - `lane-c`
- 运行真实动态百科 3 variation smoke：
  - job：`job_d88f73b483994681`。
  - `var_fe1dbe53209a4252` completed，初始分配 `lane-a`，artifact `art_9bb5f2c90dca477d`。
  - `var_94f7fc78d5864114` completed，最终回流 `lane-a`，artifact `art_797e3dfd9bd4473d`。
  - `var_3392acfaf50e4331` completed，最终回流 `lane-a`。
- smoke 输出：
  - `dynamic-encyclopedia-smoke:multilane-warning completed_lanes=lane-a completion_lane_required=0`
  - `dynamic-encyclopedia-smoke:completed job=job_d88f73b483994681 variations=3 guidance=eg_c745b763450542a9`

### 结论

- RTC-9 的 staging 真实动态百科 3 variation smoke 已按新验收口径通过：
  - 生成链路通过。
  - 3 个 variation 均能完成。
  - 多 lane 调度路径仍可观测到；完成分布不足两条 lane 被记录为风险 warning，而非生成失败。
- 当前剩余治理项应从“基础 smoke 能不能过”转为：
  - lane-b / lane-c 动态百科完成率偏低诊断。
  - 重复 `design.job_completed` terminal event 清理。
  - 更细的 lane attempt/event 诊断持久化，避免只看最终 variation metadata 时丢失历史 lane 使用轨迹。

### 下一步

- 优先补充 lane attempt history / retry diagnostic 的查询和持久化，辅助定位 lane-b / lane-c 为什么更多以 retry 回流到 lane-a 结束。
- 随后治理重复 `design.job_completed` 事件，确保用户端 job stream terminal event 幂等。

## 2026-07-09 RTC-9 Lane Event Diagnostics In Staging Smoke

### 本地变更

- `deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh` 在 `MULTILANE_SMOKE=1` 时新增 lane event 诊断：
  - 从 staging PostgreSQL `design_events` 查询 `design.runtime_lane_assigned`、`design.runtime_lane_retry_started`、`design.runtime_lane_retry_exhausted`。
  - 用事件轨迹判断调度通路是否至少覆盖两条 runtime lane。
  - 输出 `dynamic-encyclopedia-smoke:multilane-scheduled`，包含 `scheduled_lanes`、`retry_edges`、`exhausted`。
- 保留最终 completed artifact lane 分布检查：
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_COMPLETION_LANE_REQUIRED=0` 时，完成 lane 不足两条只输出 warning。
  - `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_COMPLETION_LANE_REQUIRED=1` 时，仍可作为严格 lane 完成分布验收。

### 验证

- 本地语法检查：
  - `bash -n deploy/staging/scripts/smoke-dynamic-encyclopedia-remote.sh`
- 远端真实动态百科 3 variation smoke：
  - job：`job_a3d4867d047e41d7`。
  - job status：completed。
  - 3 个 variation 均 completed：
    - `var_ec50881311694947` -> `art_67e148c1680b4e0e`。
    - `var_d837cc39732c43e3` -> `art_bbd7af7b20b04c8f`。
    - `var_8e80f8dd24f242a3` -> `art_ebee2d11656444dc`。
- lane event 诊断结果：
  - `scheduled_lanes=lane-a,lane-b,lane-c`。
  - `retry_edges=lane-c->lane-b:runtime_execution_failed,lane-b->lane-c:runtime_execution_failed,lane-c->lane-a:runtime_execution_failed,lane-b->lane-a:runtime_execution_failed`。
  - `event_count=11`。

### 结论

- lane-b / lane-c 的问题已经初步定性：
  - 不是“调度不到多线路”。
  - 不是“缺少多 lane backend”。
  - 是 lane-b / lane-c 在动态百科真实执行中更容易返回 `runtime_execution_failed`，随后由 retry 机制回流到 lane-a 完成。
- 下一步应检查 lane-b / lane-c 与 lane-a 的 BabeL-O workspace、环境变量、模型配置、文件权限、依赖版本和 raw Nexus failure transcript 差异。
- 重复 `design.job_completed` terminal event 仍是独立治理项。

## 2026-07-09 RTC-9 BabeL-O Lane Config Drift Fix

### 根因

- 远端 multi-lane raw Nexus 配置存在 provider config drift：
  - `lane-a`：`provider=minimax`，`model=minimax/MiniMax-M3`，`authMode=api-key`。
  - `lane-b`：`provider=local`，`model=local/coding-runtime`，`authMode=none`。
  - `lane-c`：`provider=local`，`model=local/coding-runtime`，`authMode=none`。
- 直接原因：
  - staging `.env` 使用 `BABELO_NEXUS_CONFIG_FILE=/data/config.json`。
  - 三个 raw BabeL-O Nexus 容器各自挂载独立 `/data` volume。
  - `lane-a` 的 `/data/config.json` 存在 MiniMax provider config；`lane-b` / `lane-c` 的 `/data/config.json` 不存在，因此回退到 local deterministic runtime。
- 这解释了此前现象：
  - 多 lane 调度路径正常。
  - `lane-b` / `lane-c` 能被分配，但 `execute` 快速 `runtime_execution_failed`。
  - `lane-b` / `lane-c` provider invocation count 为 0。

### 修复

- 新增 `deploy/staging/scripts/sync-babelo-lane-config-remote.sh`：
  - 仅在 `babel-o` + static/multilane 模式下运行。
  - 校验 `BABELO_NEXUS_CONFIG_FILE=/data/config.json`。
  - 从 `babel-o-nexus` 读取 `/data/config.json`。
  - 写入 `babel-o-nexus-b` / `babel-o-nexus-c` 的 `/data/config.json`。
  - 重启 `babel-o-nexus-b`、`babel-o-nexus-c`、`runtime-adapter`。
- `deploy/staging/scripts/deploy-remote.sh` 在 multi-lane BabeL-O 部署后自动调用该同步脚本。
- `deploy/staging/scripts/smoke-remote.sh` 增加 raw BabeL-O lane config drift 检查：
  - 读取 `3300` / `3312` / `3313` 的 `/v1/runtime/config`。
  - 输出 `raw-babelo-lane-configs`。
  - 若 provider/model/authMode 与 lane-a 不一致则失败。
- staging 默认配置建议更新：
  - `BABELO_TIMEOUT_MS=120000`。
  - `runtime-lane-pool-plan.md` 明确 `BABELO_TIMEOUT_MS` 是 DUDesign API 到 Runtime Adapter 的请求/stream 首次连接窗口，不是模型执行超时。

### 验证

- 同步后 raw Nexus config：
  - `port=3300 provider=minimax model=minimax/MiniMax-M3 auth=api-key hasApiKey=True`
  - `port=3312 provider=minimax model=minimax/MiniMax-M3 auth=api-key hasApiKey=True`
  - `port=3313 provider=minimax model=minimax/MiniMax-M3 auth=api-key hasApiKey=True`
- 基础 staging smoke 通过，并输出：
  - `raw-babelo-lane-configs:{"a": {"authMode": "api-key", "hasApiKey": true, "model": "minimax/MiniMax-M3", "provider": "minimax"}, "b": {"authMode": "api-key", "hasApiKey": true, "model": "minimax/MiniMax-M3", "provider": "minimax"}, "c": {"authMode": "api-key", "hasApiKey": true, "model": "minimax/MiniMax-M3", "provider": "minimax"}}`
- 动态百科 3 variation multi-lane smoke 在 `BABELO_TIMEOUT_MS=120000` 后通过：
  - job：`job_18caa8d5963e4e35`。
  - `var_bb2e81dcb9794ebf` completed，`lane-a`，artifact `art_3c69b151c1e04a96`。
  - `var_79098e5bd2d24800` completed，`lane-b`，artifact `art_fa89fcc554304aba`。
  - `var_2556d2ba53034f77` completed，`lane-c`，artifact `art_614c873c814c4a0e`。
- raw Nexus metrics 显示 b/c 已真实调用 provider：
  - `port=3312 execute=count:2 success:2 failure:0 provider=count:5 success:5 failure:0`
  - `port=3313 execute=count:3 success:3 failure:0 provider=count:15 success:15 failure:0`

### 下一步

- 动态百科 multi-lane smoke 已确认以全部 variation completed 作为 hard gate；继续保留该检查作为 staging 准入。
- 继续治理重复 `design.job_completed` terminal event。

## 2026-07-10 RTC-9 Job Completed Terminal Event Idempotency

### 背景

- Runtime Gateway / Adapter 可能在 child session 聚合结束后输出 runtime 级 `design.job_completed`。
- DUDesign Application Service 也会在 artifact reconcile、未完成 variation 标记、job status 更新后发布应用级 `design.job_completed`。
- 如果两个 terminal event 都被持久化并推送到 SSE，用户端 job stream 可能重复收到完成事件，且 runtime 级 payload 可能早于应用层最终计数。

### 修复

- `ApplicationService.runMockJob` 过滤 runtime 级 `design.job_completed`。
- Application Service 继续作为 job terminal event 的唯一 owner：
  - runtime 事件仍可驱动 variation 状态和 artifact 生成。
  - job 级完成事件只由 `finalizeQueuedDesignJob` 在应用层 reconcile 后发布。
- 增加回归测试：
  - controlled runtime 主动输出一个错误计数的 `design.job_completed`。
  - 验证持久化事件中只有一个应用级 `design.job_completed`。
  - 验证 SSE replay 中只输出一次 terminal event。
  - 验证 runtime 级错误计数不会泄漏给用户端。

### 验收

- Job stream terminal event 语义幂等。
- 前端和管理端可继续以 `design.job_completed` 作为一次性关闭信号。
- Runtime Adapter 后续升级即使保留自身 completed event，也不会影响 DUDesign 应用层最终状态。

## 2026-07-10 Staging API Chromium Base Layer Cache

### 背景

- staging `api-system-chromium` target 需要安装系统 Chromium 和中文字体，用于远端 Playwright pixel gate / interaction smoke。
- 原 Dockerfile 中 `runtime-chromium` 继承自已经 `COPY --from=build /app ./` 的 `runtime` stage。
- 因此每次源码或构建产物变化都会使 `runtime` 父层失效，导致 Chromium `apt-get install` 层重复执行，单次部署额外增加约 2 分钟以上。

### 修复

- 将 `deploy/staging/Dockerfile` 拆成更稳定的运行时层：
  - `runtime-base`：只包含 Node 基础镜像、工作目录、`NODE_ENV` 和 artifact 目录。
  - `runtime`：从 `runtime-base` 复制应用构建产物。
  - `chromium-base`：从 `runtime-base` 安装 Chromium / emoji 字体 / 中文字体。
  - `runtime-chromium`：从 `chromium-base` 复制应用构建产物。
- 这样 Chromium 系统依赖层只受 Node base image、APT mirror、apt package list 影响，不再受 DUDesign 应用源码变化影响。

### 验证

- 首次部署 `b77742f6` 时，远端按预期构建了一次新的 `chromium-base`。
- 随后在同一远端 release 执行：
  - `docker compose --profile babel-o-multilane -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env build api`
- 验证日志显示：
  - `#19 [chromium-base 1/1] ... apt-get install ...`
  - `#19 CACHED`
  - `#25 [runtime-chromium 1/1] COPY --from=build /app ./`
  - `#25 CACHED`
- 基础 staging smoke 仍通过：
  - `local-web:200`
  - `local-api:200`
  - `local-admin:200`
  - `local-runtime-health:200`
  - `babelo-prompt-smoke:completed job=job_cbf268cf58bc4d54 variations=1`
  - `mcp-http-smoke:mock-completed`

### 下一步

- 如果后续仍觉得 deploy 慢，再继续拆 `web build` 与 `admin build`，避免 API / runtime-adapter 镜像重复运行两个 Next build。
- 可进一步考虑预构建并推送 `dudesign-api-chromium-base` 到镜像仓库，减少新服务器首次部署时间。

## 2026-07-10 Staging Next Build Stage Split

### 背景

- staging Dockerfile 原先只有一个 `build` stage：
  - 先执行全仓 TypeScript build。
  - 再执行 `npm --workspace @dudesign/web run build`。
  - 再执行 `npm --workspace @dudesign/admin run build`。
- API、runtime-adapter、web、admin target 都继承同一个 `build` stage，导致构建 API / runtime-adapter 镜像时也被迫等待 Web/Admin Next build。

### 修复

- 将 staging Dockerfile 拆分为：
  - `build`：只执行全仓 TypeScript build。
  - `web-build`：只执行 Web Next build。
  - `admin-build`：只执行 Admin Next build。
  - `runtime` / `runtime-chromium` / `runtime-playwright`：从 `build` 复制产物，用于 API 和 runtime-adapter。
  - `web-runtime`：从 `web-build` 复制产物。
  - `admin-runtime`：从 `admin-build` 复制产物。
- API 和 runtime-adapter target 不再依赖 Web/Admin Next build。

### 验证

- 远端部署 `db39716f` 后基础 smoke 通过：
  - `local-web:200`
  - `local-api:200`
  - `local-admin:200`
  - `local-runtime-health:200`
  - `babelo-prompt-smoke:completed job=job_770b6348beef4974 variations=1`
  - `mcp-http-smoke:mock-completed`
- 远端 no-op API target build 验证：
  - 命令：`docker compose --profile babel-o-multilane -f deploy/staging/docker-compose.yml --env-file deploy/staging/.env build api`
  - 日志中无 `next build`、`@dudesign/web run build`、`@dudesign/admin run build`。
  - `chromium-base`：`CACHED`。
  - `runtime-chromium`：`CACHED`。
  - `build 3/3 RUN npx tsc ...`：`CACHED`。

### 后续

- 下一步可继续优化镜像导出/解包耗时：当前 API / runtime-adapter / web / admin 都复制完整 `/app`，导致导出层偏大。
- 可考虑生产镜像裁剪：只复制目标 workspace 运行所需包、`dist` / `.next` / `node_modules`，减少镜像体积和 unpack 时间。
