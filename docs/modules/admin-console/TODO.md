# 管理员/开发者前端交互层 TODO

> 模块：Admin & Developer Console Layer
> 面向对象：运营、管理员、开发者、排障人员
> 上游依赖：Application Service Admin API、审计日志、Runtime Gateway health/contract 信息
> 下游输出：治理操作、审计记录、任务重试/取消请求

## Phase ADM-0：管理端边界与权限

- [x] 确认管理端是否独立 app，或与用户端共用同一前端工程。
- [x] 管理端按治理模块 tag/section 切换展示，避免所有能力堆成单页长列表。
- [x] 定义 admin roles：support、operator、developer。
- [x] 定义 Admin API client。
- [x] 定义 M1 管理操作审计字段：operator、action、target、reason、created_at。
- [x] 定义敏感信息脱敏规则。

验收：

- 管理端所有写操作都有明确权限和审计要求。
- 管理端不直连 BabeL-O、数据库或队列。

## Phase ADM-1：Job Monitor

- [x] 展示 design job 列表。
- [x] 展示 variation 状态、token、成本、错误数量摘要。
- [x] 支持按用户、workspace、session、status、时间筛选。
- [x] 支持 job cancel。
- [x] 支持 job retry。
- [x] 支持 variation retry。

验收：

- 管理员可以定位一次失败来自 queued、runtime、artifact、preview 还是 export。

## Phase ADM-2：Runtime Health

- [x] 展示 Runtime Gateway 健康状态。
- [x] 展示 BabeL-O runtime 基础状态。
- [x] 展示 runtime contract version。
- [x] 展示 compatible、degraded、unavailable、contract_mismatch 状态。
- [ ] 展示最近 drift 事件。
- [ ] 配合 Runtime Lane Pool 展示 lane 列表、inflight/maxConcurrent、contract status 和最近错误。
- [ ] 支持按 lane 反查最近失败 job/variation。
- [ ] 支持 operator 对 lane 执行 drain / undrain，并写入 audit log。
- [ ] 支持 developer 触发单 lane smoke / contract check。

验收：

- 开发者可以判断当前 runtime 是否适合接收新任务。

## Phase ADM-3：Artifact Explorer

- [x] 按 job 查看 artifact。
- [x] 查看 artifact version、hash、size、storage_key、preview_url。
- [x] 支持 rebuild screenshot。
- [x] 支持 export repair。
- [x] 支持 revoke share。

验收：

- 已完成 artifact 在 runtime 不可用时仍可排查、预览、导出。

## Phase ADM-4：User Support

- [x] 支持按用户查询 sessions。
- [x] 支持查看 session resume 状态。
- [x] 支持查看 job/variation 失败摘要。
- [ ] 支持生成用户可理解的问题说明。
- [x] 严格控制 HTML 全文查看权限。

验收：

- support 角色能处理常见用户问题，但不能读取敏感全文。

## Phase ADM-5：Cost 与 Memory Governance

- [x] 展示 token/cost 聚合。
- [x] 按用户聚合成本。
- [x] 展示模型服务列表。
- [x] 支持开启/关闭具体模型服务。
- [x] 支持设置默认模型。
- [x] 支持查看和调整单用户模型访问权限。
- [x] 展示单用户按模型的使用摘要。
- [x] 在 Model Services 中明确标识 `source=seed/config/runtime_discovery/provider_discovery`。
- [x] 支持管理员触发模型发现同步 `Refresh models`，而不是只刷新当前治理表。
- [x] 展示模型发现差异：新增、缺失、已停用、成本/上下文窗口变化。
- [x] 展示模型同步审计记录和最近同步时间。
- [ ] 按 workspace、模型、时间范围筛选成本。
- [x] 展示 memory namespace。
- [x] 展示 memory ref 观测能力状态。
- [ ] 支持查看 memory 审批记录。

验收：

- 管理端可观察 memory 是否跨用户隔离。
- 可按用户维度评估成本。

## Phase ADM-5.5：Capability Governance

- [x] 展示官方场景模板、视觉 profile、色板、参考品牌和 Design Template Pack。
- [x] 展示用户私有模板数量、最近创建时间、lint 状态和 preview artifact 状态。（最近创建时间当前标记为 not tracked，等待模板 created_at contract 落库后启用）
- [ ] 支持官方 Design Template Pack 发布、下线、归档和版本 diff。
- [x] 展示 `DESIGN.md` import/lint 结果、broken reference、危险指令和 preview smoke。
- [x] 展示官方 safe skill 列表、适用场景、规则摘要、负向约束和安全等级。
- [x] 支持禁用风险 skill 或插件，并写入 audit log。（ADM-M21/M22：Admin PATCH API + PostgreSQL governance override 持久化）
- [x] 展示 MCP tool policy：allowed tool、scope、auth requirement、audit level、`policy_only` / real-call 灰度状态。
- [~] 展示模板/skill/MCP 使用量、成功率、失败原因、平均成本和最近 drift。MCP 调用量、成功率、失败原因和时间范围过滤已完成首版；模板/skill/成本/drift 聚合待补。
- [ ] 支持 capability usage events 查询。
- [x] 管理动态百科父模板包、子模板和交互范式（12.5：首批子模板为 summary/timeline/relation/compare/expandable，explore 为下一批）。
- [x] 管理百科 L1/L2/L3 分类到子模板/交互范式的映射（12.6：以 `InteractionParadigm.compatibleTemplatePackIds` 为唯一事实来源）。
- [x] 展示 MCP invocation 审计摘要，支持按 job、variation、tool、status 查询 replay key。
- [x] 展示 democase MCP 健康状态、调用量、失败率和审计摘要（12.1：MCP 只服务生成期 agent；向导直连查询不计入 MCP 审计）。
- [ ] 展示动态百科词条引导命中率、低置信度比例和人工确认比例。
- [ ] 展示百科规范审查通过率、常见失败原因和自动修复成功率（12.2：按 `qualityGates` 维度展示；12.3：`llm_review` 规则标 Phase 2，MVP 不展示）。
- [ ] 百科规范审查失败原因需要展示 review context：
  - [ ] artifact id / version。
  - [ ] variation index。
  - [ ] 当前 variation 实际分配 child template。
  - [ ] job 级候选 template ids。
  - [ ] 标记疑似审查上下文错误，例如非 timeline variation 触发 timeline mismatch。
- [~] 支持禁用风险子模板、词条引导 skill、democase MCP binding 或审查规则，并写入 audit log。（官方 skill/MCP plugin 禁用已完成；子模板和审查规则禁用待补）

验收：

- 管理员可以治理模板、skill 和 MCP 权限，不需要直接访问数据库或 runtime。
- 官方能力发布、禁用和版本切换都有审计记录。

## Phase ADM-6：管理端质量门禁

- [x] Admin API 权限测试。
- [x] 审计日志写入测试。
- [x] 管理端页面 smoke test。
- [x] Admin artifact metadata listing 测试。
- [x] Admin user support summary 测试。
- [x] 敏感字段脱敏测试。
- [x] Admin memory namespace isolation 测试。
- [x] runtime contract mismatch 展示测试。
- [x] Model Services 同步 diff/audit/missing 浏览器 smoke test。
- [x] Model Services support 只读权限浏览器 smoke test。
- [x] Runtime Health contract mismatch/degraded 浏览器 smoke test。
- [x] MCP invocation audit API smoke test。
- [x] MCP invocation audit 管理端浏览器 smoke test。
- [x] Capability Governance 页面 smoke test。
- [ ] 官方模板 lint/diff/preview smoke test。
- [ ] 插件禁用后用户端创建 job 被拒绝的 Admin + API 联动测试。

验收：

- 管理端写操作不会绕过业务层。
- 权限不足时不可执行治理动作。

## v0.4 硬性归束（2026-07-08 落地）

- [x] `AdminCapabilityQualitySummary.hardConstraints` 字段：动态百科模板的硬性归束合规统计
  - `templates.total` / `compliant` / `chineseFirstMissing` / `englishUiMissing`
- [ ] Admin UI 渲染 hardConstraints 摘要（roadmap Stage 7 收尾）
- [ ] Admin UI 渲染 per-template findings 中的 `dynamic-card-chinese-first` / `dynamic-card-english-ui-blocked` 警告

验收：
- Admin GET `/api/admin/capabilities/templates` 返回的 `quality.hardConstraints` 包含正确统计
