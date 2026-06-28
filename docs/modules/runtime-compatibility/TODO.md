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
- [ ] staging 真实内核 prompt smoke：确认 variation 由 BabeL-O child session 生成。

验收：

- 可以通过 Gateway 创建 runtime session 并流式接收事件。

## Phase RTC-2：事件映射

- [x] 映射 `session_started` -> `design.session_started`。
- [x] 映射 `assistant_delta` / `thinking_delta` -> `design.variation_streaming`。
- [x] 映射 `workspace_dirty` / `workspace_dirty_detected` -> `design.variation_artifact_updated`。
- [x] 映射 `permission_request` -> `design.permission_required`。
- [x] 映射 `result` -> `design.variation_completed`。
- [x] 映射 `error` -> `design.variation_failed`。
- [x] 对 unknown event 做 debug 记录，不影响主流程。

验收：

- 业务服务层不需要判断任何 `NexusEvent.type`。

## Phase RTC-3：并行 Variation Orchestration

- [x] 实现 `spawnVariationAgents` 最小真实 stream 适配。
- [x] 为每个 variation 创建独立 child session。
- [ ] 注入 variation index 和风格差异 prompt。
- [x] 聚合多个 child session 的事件。
- [x] 支持单个 child failed，不影响其他 child。
- [x] 返回并持久化每个 variation 的 runtime_child_session_id / runtime_agent_job_id。

验收：

- 3/6 variation 并发 smoke test 通过。

## Phase RTC-4：Artifact Bridge

- [ ] 定义 workspace root 安全策略。
- [x] 检测 runtime 写入的 HTML/CSS/JS。
- [x] 解析入口 `index.html`。
- [x] 支持 runtime result inline HTML 同步为业务 artifact。
- [x] 把 workspace 文件同步为业务 artifact。
- [x] 通过 DUDesign API 提供 workspace asset serving。
- [x] preview HTML 相对资源 URL 改写到稳定 asset endpoint。
- [x] `artifact_updated` 事件落成增量 artifact snapshot。
- [x] 防止 path traversal。
- [ ] 防止 symlink escape。

验收：

- runtime 写盘后，业务服务层能得到稳定 artifact 引用。

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
- [ ] 建立 contract tests。
- [x] 建立 golden event replay。
- [x] 建立 mock parallel generation smoke test。
- [x] 建立 resume smoke test。
- [x] 建立 mock refine smoke test。
- [ ] 将测试结果暴露给管理端。

验收：

- BabeL-O 升级不需要修改用户前端和业务核心。
- contract mismatch 会阻断 runtime 切换。

## Phase RTC-7：可观测性与降级

- [ ] 记录 runtime latency。
- [ ] 记录 drift 事件。
- [ ] 记录 runtime unavailable。
- [ ] 记录 contract mismatch。
- [ ] 支持 degraded 模式。
- [ ] 支持切回上一 runtime 配置。

验收：

- 管理端可以定位 runtime 层失败。
- 用户端看到的是可理解降级提示。
