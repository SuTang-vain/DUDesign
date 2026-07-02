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
- [ ] 定义真实 MCP 调用 contract：tool id、server、scope、auth、input/output envelope、audit metadata。
- [ ] 实现 MCP 调用前授权校验，不允许 runtime 直接绕过 DUDesign Application Service。
- [ ] 实现 MCP 结果注入规范：标注来源、摘要、引用 id，避免把外部结果当作事实直接写入 memory。
- [ ] 实现 MCP 调用审计和 replay payload，支持问题排查与合规回放。
- [ ] 增加 MCP unavailable 降级事件，用户端显示为能力不可用而不是 runtime 崩溃。
- [ ] 增加真实 MCP smoke：授权、调用、结果注入、审计、回放。

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
