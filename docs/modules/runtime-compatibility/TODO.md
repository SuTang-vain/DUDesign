# 后端内核兼容层 TODO

> 模块：Runtime Compatibility Layer
> 别名：Design Runtime Gateway
> 面向对象：Application Service Layer
> 上游依赖：BabeL-O Nexus Runtime
> 下游输出：DUDesign DesignRuntimeEvent、runtime health、contract status

## Phase RTC-0：Gateway Interface 与 Contract

- [x] 定义 `RuntimeGateway` TypeScript interface。
- [x] 定义 `DesignRuntimeEvent`。
- [x] 定义 `RuntimeContract`。
- [x] 定义 `RuntimeHealth`。
- [x] 定义 contract status：compatible、degraded、unavailable、contract_mismatch。
- [x] 定义 Gateway 错误码。
- [x] 实现 `BabelORuntimeGateway` 真实 gateway 骨架。

验收：

- Application Service 可以只依赖 Gateway interface 和 mock 实现开发。

## Phase RTC-1：BabeL-O Adapter 基础连接

- [x] 实现 runtime health check。
- [x] 定义并实现 runtime model discovery contract：`GET /v1/models` 或等价 adapter 端点。
- [x] 从 BabeL-O/provider 真实模型列表归一化为 DUDesign `RuntimeModel`。
- [x] 对不支持模型发现的 BabeL-O 版本返回明确 `unsupported`，由业务层保留 seed/config 模型。
- [x] 实现 `/v1/sessions` 创建。
- [x] 实现 `/v1/sessions/:id/resume`。
- [x] 实现 `/v1/stream` 最小 NDJSON/SSE client。
- [x] 实现 stream idle timeout。
- [x] 实现 stream 连接前失败重连。
- [x] 实现 cancel。
- [x] 实现 API key / auth header 配置。
- [x] 实现 API 服务层 runtime mode 环境切换。
- [x] 支持 staging 环境变量 `DUDESIGN_RUNTIME_PROVIDER`、`BABELO_BASE_URL`、`BABELO_API_KEY`。
- [x] 实现 DUDesign/BabeL-O runtime adapter service，补齐 `/v1/contract`、DUDesign 语义的 `/v1/agents`、`/v1/agents/refine`、`/v1/agents/cancel`。
- [x] 将 runtime adapter service 纳入 staging docker compose。
- [x] 将 raw BabeL-O Nexus 纳入 staging docker compose profile。
- [x] 提供 BabeL-O source remote deploy helper。
- [x] 完成云端 raw BabeL-O Nexus + runtime adapter health/contract smoke。
- [x] 持久化 runtime adapter session/stream 映射，支持 adapter 重启后继续消费未完成 stream。
- [x] staging 真实内核 prompt smoke：确认 variation 由 BabeL-O child session 生成。

验收：

- 可以通过 Gateway 创建 runtime session 并流式接收事件。

## Phase RTC-2：事件映射

- [x] 映射 `session_started` -> `design.session_started`。
- [x] 映射 `assistant_delta` / `thinking_delta` -> `design.variation_streaming`。
- [x] 映射 `code_delta` / `file_delta` -> `design.variation_code_delta`。
- [x] 映射 `workspace_dirty` / `workspace_dirty_detected` -> `design.variation_artifact_updated`。
- [x] 映射 `permission_request` -> `design.permission_required`。
- [x] 映射 `result` -> `design.variation_completed`。
- [x] 映射 `error` -> `design.variation_failed`。
- [x] 对 unknown event 做 debug 记录，不影响主流程。
- [x] 将真实 Babel-O adapter service 的最终 workspace artifact bundle 输出为多条 `file_delta`。
- [x] 将真实 Babel-O adapter service 的 transcript/workspace 文件变化升级为近实时 `code_delta`。
- [x] 将 raw assistant/thinking transcript 归一化为可读 activity 摘要，避免用户端直接展示碎片文本。
- [x] 为 `variation_code_delta` 增加 golden replay 覆盖真实文件增量和恢复场景。

验收：

- 业务服务层不需要判断任何 `NexusEvent.type`。
- 用户前端不消费 Babel-O 私有代码流事件，只消费 DUDesign 标准事件。

## Phase RTC-3：并行 Variation Orchestration

- [x] 实现 `spawnVariationAgents` 最小真实 stream 适配。
- [x] 为每个 variation 创建独立 child session。
- [x] 为每个并行 variation 派生独立 runtime workspace root，避免多个子任务同时写同一个 `index.html`。
- [x] 注入 variation index 和风格差异 prompt。
- [x] 聚合多个 child session 的事件。
- [x] 支持单个 child failed，不影响其他 child。
- [x] 返回并持久化每个 variation 的 runtime_child_session_id / runtime_agent_job_id。
- [x] 增加 Gateway 侧 variation 并发阀：`DUDESIGN_RUNTIME_VARIATION_CONCURRENCY`。
- [x] 增加 raw BabeL-O `/v1/execute` HTTP 429 retry/backoff。
- [x] 在 staging 以受控并发重新验证 6 variation 上限。

验收：

- 3 variation 真实并发 smoke test 通过。
- 6 variation 在受控并发和 429 retry/backoff 下 smoke test 通过。

## Phase RTC-4：Artifact Bridge

- [x] 定义 workspace root 安全策略。
- [x] 检测 runtime 写入的 HTML/CSS/JS。
- [x] 解析入口 `index.html`。
- [x] 支持 runtime result inline HTML 同步为业务 artifact。
- [x] 把 workspace 文件同步为业务 artifact。
- [x] 通过 DUDesign API 提供 workspace asset serving。
- [x] preview HTML 相对资源 URL 改写到稳定 asset endpoint。
- [x] `artifact_updated` 事件落成增量 artifact snapshot。
- [x] 增加最小静态 artifact quality gate，识别空 body、纯加载壳、外部脚本依赖、大面积全黑/空白风险等不合格产物。
- [x] 增加可选 Playwright screenshot pixel gate，识别真实渲染后的全黑/空白页面。
- [x] 将 Playwright pixel gate 池化或拆到 preview quality worker，避免生成链路被浏览器启动成本拖慢。
- [ ] 将 Playwright pixel gate 拆到独立 preview quality worker。
- [x] 防止 path traversal。
- [x] 防止 symlink escape。

验收：

- runtime 写盘后，业务服务层能得到稳定 artifact 引用。

## Phase RTC-4.5：Capability Tool Policy 与 MCP 调用

- [x] Runtime Gateway 将 MCP 插件编译为 `toolPolicy`，MVP 标记为 `policy_only`。
- [x] Runtime Gateway 将声明式 skill 编译为受控 prompt block。
- [x] 定义真实 MCP 调用 contract：tool id、server、scope、auth、input/output envelope、audit metadata。
- [x] 实现 MCP 调用前授权校验，不允许 runtime 直接绕过 DUDesign Application Service。
- [x] 实现 MCP 结果注入规范：标注来源、摘要、引用 id，避免把外部结果当作事实直接写入 memory。
- [x] 实现 MCP 调用审计和 replay payload，支持问题排查与合规回放。
- [x] 增加 MCP unavailable 降级事件，用户端显示为能力不可用而不是 runtime 崩溃。
- [x] 增加真实 MCP opt-in smoke：授权、调用、结果注入、审计、回放、unavailable 降级。默认仍使用 mock MCP server，设置 `DUDESIGN_STAGING_MCP_REAL_SMOKE=1` 时验证真实外部 MCP server。

验收：

- `policy_only` 升级到真实调用后，插件仍不能突破 workspace、模型、文件路径和用户权限边界。
- BabeL-O 只能消费 DUDesign 标准化 tool policy 和 tool result，不直接读取 DUDesign 数据库或用户私有资产。

## Phase RTC-5：Refine 与 Resume

- [x] 实现 `resumeSession`。
- [x] 实现 mock `refineVariation`。
- [x] 把当前 artifact 内容注入 refine 上下文。
- [x] 把 annotation prompt suffix 注入 refine 上下文。
- [x] 支持 runtime session 不可恢复时重建 session。

验收：

- 单变体可连续多轮 refine。
- 旧 session 在 runtime 恢复失败时有明确降级。

## Phase RTC-6：Contract Tests 与升级治理

- [x] 建立 runtime contract manifest 初稿。
- [x] 建立 contract tests。
- [x] 将 model discovery 能力纳入 contract manifest 和 contract tests。
- [x] 建立 golden event replay。
- [x] 建立 mock parallel generation smoke test。
- [x] 建立 resume smoke test。
- [x] 建立 mock refine smoke test。
- [ ] 将测试结果暴露给管理端。

验收：

- BabeL-O 升级不需要修改用户前端和业务核心。
- contract mismatch 会阻断 runtime 切换。

## Phase RTC-7：可观测性与降级

- [x] 记录 runtime latency。
- [x] 记录 drift 事件。
- [x] 记录 runtime unavailable。
- [x] 记录 contract mismatch。
- [x] 支持 degraded 模式。
- [x] 支持切回上一 runtime 配置请求记录。
- [ ] 支持由 DUDesign 控制面直接切换上一 runtime 配置。

验收：

- 管理端可以定位 runtime 层失败。
- 用户端看到的是可理解降级提示。

## Phase RTC-8：动态百科 Runtime Context

> 业务规划详见 `docs/dynamic-encyclopedia-card-business-logic-plan.md`（v0.2）。
> 实现前需钉死的决策见该文档第 12 节；以下任务已对齐 12.1–12.6。

- [x] Runtime Gateway 支持接收 `productMode=dynamic_encyclopedia_card` 的标准上下文，并透传到 BabeL-O `/v1/agents`。
- [x] 将词条引导 skill 编译为受控 prompt block。
- [x] 将 democase MCP binding 编译为只读 tool policy，初期可保持 `policy_only` 或 mock result（12.1：只服务生成期 agent；12.6：scope 显式 `readonly_context`，通过 `isMvpSafePluginPolicy`）。词条引导向导的分类查询不经此 binding。
- [x] 将父模板包、子模板和交互范式编译为分层 prompt context。
- [x] 将动态百科 `classificationVector` 编译为 BabeL-O prompt context：L1/L2/L3、推荐模块优先级、preferred template、risk flags、selected child templates。
- [x] 将百科规范 repair context 编译为 refine prompt block。
- [x] 增加 golden replay：
  - [x] 词条引导 skill prompt block。
  - [x] democase MCP tool policy。
  - [x] 动态百科子模板 prompt context。
  - [x] 父模板包、子模板和交互范式分层 prompt context。
  - [x] 动态百科 classification vector prompt context。
  - [x] spec review repair context golden replay。
- [x] 增加 BabeL-O staging smoke：动态百科卡片模式端到端生成。
  - [x] 默认单 case 覆盖 entry guidance -> job -> runtime -> artifact quality -> preview/export。
  - [x] Opt-in 四垂类矩阵 smoke：设置 `DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_VERTICAL_MATRIX=1` 后顺序覆盖电影、电视剧、历史人物、文化类词语。

验收：

- Babel-O 只消费 DUDesign 标准化上下文和 tool policy，不直接读取 DUDesign 数据库或 democase 数据库。
- Runtime event drift 不影响动态百科业务层的 guidance、snapshot 和 review report。

## Phase RTC-9：Runtime Lane Pool 与多线路并行调度

> 规划详见 `docs/modules/runtime-compatibility/runtime-lane-pool-plan.md`。
> 目标：将当前“单 BabeL-O Nexus 内并行 child session”升级为“多 Runtime Lane 可调度并行”，降低复杂生成任务的单线路 timeout 风险。

- [x] 完成 Runtime Lane Pool 规划准入文档。
- [x] 修正 Runtime Adapter timeout 配置链路，避免 hard watchdog 继续被硬编码为 300000ms。
- [x] 定义 `RuntimeLane` / `RuntimeLaneRegistry` / `RuntimeLaneLease` contract。
- [x] 支持静态 lane registry 环境变量配置，默认兼容单 lane。
- [x] 实现 lane health / contract status 探测。
- [x] 实现 least-inflight + round-robin 调度策略。
- [x] 为每个 variation 记录 lane assignment 标准事件。
- [x] 将 variation lane assignment metadata 持久化到 Application Service / PostgreSQL：
  - [x] `runtime_lane_id`。
  - [x] `runtime_backend_id`（字段预留）。
  - [x] `runtime_lease_id`。
  - [x] `runtime_attempt`。
  - [x] `runtime_last_error_code`。
- [x] 支持 lane drain，drain 后不再接收新任务。
- [x] 支持 lane unavailable / stream idle timeout 的换 lane retry：
  - [x] lane unavailable / 5xx 可换 lane retry。
  - [x] 换 lane retry 输出标准 `runtime_lane_retry_started` / `runtime_lane_retry_exhausted` 事件。
  - [x] 换 lane retry 创建新 runtime child session，不复用不确定状态旧 session。
  - [x] raw Nexus execute idle / long-hang 由 Adapter 自身 watchdog 触发换 lane retry。
- [x] docker compose staging 增加 2-3 个独立 BabeL-O Nexus backend。
- [x] refine follow-up 绑定原 variation runtime lane，避免多 lane workspace 漂移。
- [x] 增加 multi-lane fake Nexus integration test。
- [x] `execute.success=false` 且无 artifact 时触发 runtime lane retry，避免单条 BabeL-O lane 的软失败直接打断 variation。
- [x] 动态百科显式选择模板时循环显式模板，不自动补入其它动态子模板，避免 multi-variation smoke 因垂类模板漂移变脆。
- [x] Runtime Adapter spawn 阶段只规划 lane，不提前占用 lane lease；stream 消费时再 acquire lease，避免未消费 stream 把 lane 容量锁死。
- [x] retry 换 lane 时复用 lane acquire 等待窗口，不再只做一次瞬时 acquire。
- [x] staging 暴露 `RUNTIME_ADAPTER_LANE_ACQUIRE_TIMEOUT_MS` / `RUNTIME_ADAPTER_LANE_ACQUIRE_POLL_MS` 配置。
- [x] 远端 `babel-o-multilane` 部署后基础 smoke 通过，`lane-a`、`lane-b`、`lane-c` 均 healthy，真实 BabeL-O 单 variation 可完成。
- [x] staging 真实动态百科 3 variation 已证明能分配/重试到多条 lane：
  - [x] `job_01d1ef141ead45ee` 中 variation 使用过 `lane-a`、`lane-b`、`lane-c`。
  - [x] 至少一个 variation 在 retry 后生成 artifact 并通过 quality gate。
- [x] 增加 staging 真实动态百科 3 variation multi-lane smoke。
  - [x] 部署 `success=false lane retry`、`explicit dynamic template loop`、deferred lease 与 waiting retry acquire 后重新复测。
  - [x] 将 staging retry acquire timeout 从 120s 提升到 300s 后重新复测，避免复杂动态百科生成在可用 lane 即将释放前被误判 exhausted。
  - [x] 复测确认 3 个 variation 均 completed 并生成 artifact；当前剩余失败来自 artifact quality gate，而非 lane 调度。
  - [x] 修复 `touch-action:none` 注释被误判为全局触控禁用的问题。
  - [x] 调整 pixel white-screen gate，避免极简白底但有可见内容的动态百科卡片被误判为空白白屏。
  - [x] 将 quality gate 修复部署到 staging 后重新运行动态百科 3 variation multi-lane smoke。
  - [x] 复测确认至少两条 variation 有 completed artifact 且 quality pass/warn；剩余失败回到 raw BabeL-O `EXECUTION_FAILED`。
  - [x] 增加 raw BabeL-O `execute.success=false` 失败 detail 采集，避免只显示 “without a detailed runtime error”。
  - [x] 部署 transcript fallback detail 采集后复测；最新 3 variation 均 completed，未复现 timeline `EXECUTION_FAILED`。
  - [x] 最新复测 artifact quality 达到 2 pass + 1 warn，说明 quality gate 不再误杀动态百科结果。
  - [x] 将 multi-lane smoke 验收拆成两档：
    - 调度通路：job 事件中至少使用/重试过两条 lane。
    - 完成分布：completed artifacts 至少来自两条 lane；如果未满足，标记 lane 完成率风险而不是混同为生成失败。
  - [x] 部署拆分后的 smoke 断言并完成远端复测：
    - `job_d88f73b483994681`：3 variation completed。
    - smoke 输出 `dynamic-encyclopedia-smoke:multilane-warning completed_lanes=lane-a completion_lane_required=0` 后通过。
  - [x] 为 staging smoke 增加 lane event 诊断输出，避免只看最终 variation metadata 丢失历史 lane 使用轨迹。
  - [x] 初步分析 lane-b / lane-c 动态百科完成率偏低：
    - 调度路径正常，最新 smoke 初始分配覆盖 `lane-a,lane-b,lane-c`。
    - `lane-b` / `lane-c` 主要因 `runtime_execution_failed` 触发 retry，最终回流到 `lane-a` 完成。
  - [x] 深入排查 lane-b / lane-c 真实执行失败原因：
    - 根因是 `BABELO_NEXUS_CONFIG_FILE=/data/config.json` 指向每条 Nexus lane 各自独立的 `/data` volume。
    - `lane-a` 有 MiniMax provider config，`lane-b` / `lane-c` 缺少 `/data/config.json`，因此回落到 `local/coding-runtime` 并快速 `runtime_execution_failed`。
    - 已增加 `sync-babelo-lane-config-remote.sh`，部署时将 lane-a provider config 同步到 lane-b/c 并重启 runtime services。
    - 基础 smoke 已增加 raw BabeL-O lane config drift 检查。
  - [x] 修复 API 到 Runtime Adapter stream connect 窗口偏短：
    - staging `BABELO_TIMEOUT_MS` 从 30000 提升到 120000。
    - 最新动态百科 smoke `job_18caa8d5963e4e35` 中 `lane-a` / `lane-b` / `lane-c` 各自 completed 1 个 variation。
  - [x] 确认 multi-lane 动态百科 smoke 已以全部 variation completed 作为 hard gate，避免 job 级 `completed` 掩盖 failed variation。
  - [x] 治理重复 `design.job_completed` 事件，确保 job stream 只输出一次 terminal event。

验收：

- 3 variation job 在多条 lane 可用时能分配到至少两条不同 lane。
- 单 lane timeout 不影响其他 lane 已完成 variation 的 artifact preview/export/share。
- Application Service 和用户前端仍只消费 DUDesign 标准 runtime event。
- BabeL-O 升级仍只影响 Runtime Adapter / Gateway contract tests。

## v0.4 硬性归束（2026-07-08 落地）

- [x] 父包 `dtp_dynamic_encyclopedia_card` 重写：components 替换 `scroll-container` 为 `no-scroll-frame` + `tab-bar` + `page-switcher` + `modal-overlay`
- [x] 5 个子模板（summary/timeline/relation/compare/expandable）改造：
  - summary — facts ≤ 4 + "更多事实" tab
  - timeline — 每页 3-4 节点 + `.page-switcher` 底部分页
  - relation — `maxNodes: 6` + "查看更多关系" → `.modal-overlay`
  - compare — `maxColumns: 2` + 移动端 `.tab-bar`（每对象一个 tab）
  - expandable — accordion + `maxExpandedHeight: 280` 兜底
- [x] `sk_enc...ance` skill prompt block 升级 v2：
  - rules: 默认简体中文 + 禁英文 UI 短语 + 禁滚动 + tab/page-switcher/modal
  - promptBlocks: 溢出策略指引
  - negativeRules: 禁 overflow / 禁 .scroll-container / 禁英文 UI 短语 / 禁翻译专有名词
  - qualityChecklist: 5 条新增（尺寸/结构/滚动约束/中文优先/短语禁词）
- [x] democase 4 条 summary 字段汉化
- [x] Runtime prompt 允许受控 self-contained inline JS，用于 tab、page-switcher、accordion、modal 等本地交互；禁止外部脚本、网络 API 和未打包资源。
- [x] private variation preview 放开受控脚本执行，share preview 继续禁脚本只读展示。
- [x] 增加浏览器级 smoke，验证动态百科 tab 控件在 private preview 中可真实点击切换。
- [x] 动态百科 staging smoke 增加 opt-in 浏览器交互断言：`DUDESIGN_STAGING_DYNAMIC_ENCYCLOPEDIA_INTERACTION_SMOKE=1` 时在 API 容器内打开真实 preview 并验证 tab 可点击切换。

验收：
- runtime prompt 注入后，LLM 不会引入英文 UI 短语或内部滚动容器。
- 动态百科卡片中可见 tab、分页、展开、弹层控件不能只是静态装饰，必须在 private preview 中执行本地交互。

## Phase RTC-10：Runtime Provider 边界基线

- [x] `RuntimeHealth.runtime` / `RuntimeContract.runtime` 泛化为 `RuntimeProviderId`。
- [x] Mock Runtime 使用 `runtime=mock`，不再伪装为 BabeL-O。
- [x] Runtime factory 对 unknown provider fail fast。
- [x] 增加 unknown provider 单测和架构边界 smoke。
- [ ] 定义正式 `RuntimeCapabilities`。
- [ ] 定义 `RuntimeDesignContextV1`。
- [x] 增加可执行 CLI Agent provider，并通过统一 Runtime Gateway contract/API flow 测试。

验收：

- BabeL-O 是真实 provider，不再是 Runtime Contract 唯一允许的类型。
- 显式 provider 配置不会静默回退到 Mock。

## Phase RTC-11：Provider-neutral Admin Governance

- [x] Admin Runtime health/rollback 使用 provider-neutral service。
- [x] Runtime observation audit `targetId` 使用实际 provider id。
- [x] rollback request metadata 记录 `runtimeProviderId`。
- [x] Mock Runtime 独立治理测试覆盖。

验收：

- Admin Runtime 治理不再把所有 provider 记录成 `babel-o`。

## Phase RTC-12：Runtime Design Context v1

> 上游规划：`../capability-distribution/template-skill-authoring-governance-plan.md`

- [ ] 定义 `RuntimeDesignContextV1`：template、skill、interaction、data contract 和 review profile context。
- [ ] Gateway 只消费已发布或 job snapshot 固定的 capability。
- [ ] 禁止原始 Markdown 直接进入 Runtime。
- [ ] 禁止把 `previewArtifactId` 隐式当成生成上下文。
- [ ] HTML example 经过安全处理后显式注入。
- [ ] 私有 Skill 编译不得扩大 MCP/tool policy。
- [ ] 增加 BabeL-O golden replay。
- [ ] 增加 CLI Agent fixture provider contract。
- [ ] event drift 不影响 DUDesign 标准 capability snapshot。

验收：

- 同一 Capability Bundle 可被 BabeL-O 和 CLI Agent provider 消费，而不改变用户/API 数据模型。

## Phase RTC-13：Runtime Exploration Context v1

> 上游规划：`../capability-distribution/controlled-exploration-governance-plan.md`

- [x] 定义 `RuntimeExplorationContextV1`，只包含单 variation 的既定计划。
- [x] Gateway 编译 focus、required modules、sampled modules 和设计发散维度。
- [x] Runtime 不重新读取原始功能文档，不自主改写模块分配。
- [x] Runtime 不接收用户端原始滑块 level，也不能把探索语义解释为事实创造权限。
- [x] provider sampling 参数不进入稳定 DUDesign API；本阶段不绑定任何 temperature/top-p 映射。
- [x] BabeL-O adapter 增加结构化 context、prompt golden 和最终 Nexus execute prompt 测试。
- [x] 可执行 CLI Agent provider 消费相同 context，并验证 provider-neutral prompt、artifact、refine、timeout 和 cancel。
- [x] `factCreativity=0`、required module、module reassignment 和 tool policy 建立 contract assertions。
- [x] event drift、resume、refine、runtime unavailable 不改变 exploration snapshot。
- [~] 真实 staging BabeL-O 3/6 variation exploration smoke；脚本与断言已完成，远端当前部署尚未包含本阶段 build，待发布后执行。

验收：

- 切换 Runtime Provider 不需要修改用户探索度和 Application Service 数据模型。
- Provider 只能执行已确定计划，不能扩大事实、权限或模块边界。

## Phase RTC-14：Guidance Analysis Runtime Contract v1

- [x] 定义独立 `GuidanceAnalysisGateway` 和 `EncyclopediaGuidanceAnalysisV2` provider-neutral 契约。
- [x] 为 BabeL-O 实现 `analyzeEncyclopediaEntry` adapter，禁止业务层直接调用 Nexus 私有模块；Runtime Adapter 已通过 `/v1/guidance/analyze` 使用隔离 session 和无工具 `/v1/execute` 执行真实 AI 分析。
- [x] 请求只包含裁剪后的 taxonomy candidates、democase evidence、用户输入和允许的 capability ids。
- [x] 使用结构化 JSON 输出；记录 provider/model/runtime/schema/prompt version、taxonomy/democase version 和执行耗时。
- [x] 增加严格 response parser、allowlist/schema validation 和一次 bounded JSON repair；第二次失败返回 `GUIDANCE_INVALID_RESPONSE`。
- [x] 将 runtime 原始文本、thinking、内部 session/lane id 隔离在兼容层，不进入用户 guidance snapshot。
- [x] 增加 `GUIDANCE_RUNTIME_UNAVAILABLE`、`GUIDANCE_INVALID_RESPONSE`、`GUIDANCE_TIMEOUT`、`GUIDANCE_CONTRACT_MISMATCH` 标准错误，并映射稳定 HTTP 状态。
- [ ] 增加 Mock provider deterministic fixture，供 Application/UX 测试稳定运行。
- [x] 增加 100 条 BabeL-O golden evaluation runner，覆盖分类、意图、模板推荐、澄清问题、provider unavailable 和语义退化阈值。
- [x] 增加真实 staging opt-in smoke；100 条 MiniMax-M3/BabeL-O baseline 已通过全部阈值，报告见 `guidance-golden-baseline-2026-07-15.md`。
- [ ] 验证 BabeL-O 升级只影响 adapter 与 contract tests，不改变 APP guidance API。

验收：

- guidance 确实触发真实 AI 推理，而不是由应用层关键词规则生成伪置信度。
- Runtime Provider 不得返回或选择 registry 中不存在的分类、模板、交互范式和工具。
- provider unavailable 时返回明确降级状态，不自动把所有词条归为“知识术语/通用”。

## Phase RTC-15：Refine Request 精确取消

- [x] `RefineVariationInput` 增加 provider-neutral `requestId`。
- [x] BabeL-O Gateway 建立 requestId -> refine agent 映射，只向 `/v1/agents/cancel` 发送目标 agent id。
- [x] agent 尚未创建完成时暂存 cancel intent，创建完成后立即取消。
- [x] CLI Agent process key 包含 requestId，只终止匹配 refine 进程。
- [x] CLI Agent 支持 agent 启动前的 queued cancellation。
- [x] runtime contract mismatch 或 cancel 未接受时返回稳定失败，不向用户伪报已停止。
- [x] contract test 覆盖 job cancel 向后兼容和 refine request 精确取消。
- [x] Runtime Adapter 持久化 requestId、stream 和 refine operation 终态快照。
- [x] 增加 `GET /v1/refine-operations/:requestId` 可选兼容端点。
- [x] `/v1/stream?requestId=...` 支持 adapter 重启后重新消费尚未开始的 refine stream，并重放 completed/failed 终态。
- [x] Runtime Gateway 暴露 provider-neutral `getRefineOperation` / `recoverRefineOperation` 可选能力，Application Service 不读取 adapter 私有状态。
- [x] adapter 重启测试覆盖 requestId 恢复、精确取消、stream 恢复和 terminal snapshot。
- [ ] 增加真实 BabeL-O staging cancel smoke，验证 Nexus `cancelAgent` 后 stream 能及时关闭。

验收：

- 取消一个 refine 不影响同 job 下其他 generation/refine agent。
- BabeL-O 内部 agent id 不进入用户端 API，只存在于兼容层映射中。

## Phase RTC-16：Democase Prompt 与异步 Refine 治理

> 专项分析：`../../dynamic-encyclopedia-quality-gap-analysis-2026-07-15.md`

- [x] HTML example 使用项目根可靠路径解析。
- [x] prompt 注入移除 bundle/script 并设置单示例字符预算。
- [x] refine 重新注入当前 variation 的模板契约。
- [ ] refine POST 改为 `202 + requestId`，由队列异步执行。
- [ ] 通过 SSE/polling 返回阶段、终态 artifact 和 quality summary。
- [ ] reconciler 仅 claim 超过心跳阈值的 operation。
- [ ] staging 连续 refine smoke 覆盖 3～5 分钟真实 runtime。

## Phase RTC-17：词条主题动态交互卡语义约束

> 产品语义：`../../dynamic-topic-interactive-card-product-semantics.md`

- [x] Runtime prompt 明确词条是主题入口和事实边界，不是百科文章需求。
- [x] 禁止默认生成 infobox、目录和长正文式传统百科布局。
- [x] 强制优先选择一个主要交互命题和单屏视觉叙事。
- [x] golden prompt 覆盖主题表达、内容策展和非百科页面约束。
- [ ] 真实 staging fixture 验证同一词条可生成不同交互命题，而非同构百科摘要卡。

## Phase RTC-18：Variation-local 生成契约

- [x] Gateway prompt 使用 assignment-local interaction paradigm，不再直接复用 job-global paradigm。
- [x] business context 只向当前 child session 暴露其被分配的 child template，避免兄弟模板互相污染。
- [x] 动态主题卡 style direction 按 relation/timeline/summary/comparison/spatial 语义生成，停止复用 SaaS landing 默认方向。
- [x] few-shot 支持显式 `data-dudesign-example-interaction` 受限脚本片段，保留可运行交互实现参考。
- [ ] runtime observation 记录最终组合 prompt 的 hash、字符数、assignment id、paradigm id 和 exploration focus。

## Phase RTC-19：质量修复上下文增强

- [x] Runtime-facing repair prompt 传递固定画布几何、中心命中、assigned child-template 和 topic-card 语义约束。
- [x] 允许保留 democase 中显式标记的本地交互脚本，避免修复过程退化为静态 HTML。
- [x] 对 mock research/image artifact 明确标记为占位元数据，不允许模型把 mock 来源当成事实或输出破损图片 URL。
- [ ] 在 runtime observation 中记录修复 prompt 的 issue fingerprint、base artifact version 和 repair attempt，支持远端质量回放。
- [ ] 用真实 3 lane 任务验证每条 lane 的 variation-local prompt 不发生 sibling template 泄漏。

## Phase RTC-20：极小视口生成契约与像素门禁

- [x] 动态主题卡 variation spawn/refine prompt 注入稳定的 `300×360` extreme-small contract，并由 Runtime Gateway golden 回归锁定提示内容。
- [x] 父模板和全部动态主题卡子模板注入 `wise-small-frame=300x360` 与 compact interaction 规则。
- [x] pixel gate 在独立浏览器页面中分别渲染 1280×900 与 300×360，避免同页二次注入脚本造成状态污染。
- [x] 300×360 门禁检查固定画布收缩、必要 tab/主交互可见、控件不越界且中心命中不被遮挡。
- [x] 替换 hydration 空壳和损坏构建产物型 few-shot，保证可展开与对比示例完全自包含、无外部运行依赖。
- [x] 真实 staging smoke 按 job/variation/阶段归档 desktop 与 `300×360` 截图、交互指标日志、preview HTML、job/artifact quality 快照和 refine 前后记录，宿主机统一写入 `shared/smoke-evidence/dynamic-encyclopedia/<jobId>`。
- [ ] 在真实 BabeL-O staging 上分别生成 timeline/relation/comparison/expandable 产物，确认模型产物而非只有 few-shot 可通过双视口门禁。
