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
