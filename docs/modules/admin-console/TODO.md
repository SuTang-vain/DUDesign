# 管理员/开发者前端交互层 TODO

> 模块：Admin & Developer Console Layer
> 面向对象：运营、管理员、开发者、排障人员
> 上游依赖：Application Service Admin API、审计日志、Runtime Gateway health/contract 信息
> 下游输出：治理操作、审计记录、任务重试/取消请求

## Phase ADM-0：管理端边界与权限

- [x] 确认管理端是否独立 app，或与用户端共用同一前端工程。
- [ ] 定义 admin roles：support、operator、developer。
- [ ] 定义 Admin API client。
- [ ] 定义管理操作审计字段：operator、action、target、reason、before、after、created_at。
- [ ] 定义敏感信息脱敏规则。

验收：

- 管理端所有写操作都有明确权限和审计要求。
- 管理端不直连 BabeL-O、数据库或队列。

## Phase ADM-1：Job Monitor

- [ ] 展示 design job 列表。
- [ ] 展示 variation 状态、耗时、token、成本、错误摘要。
- [ ] 支持按用户、workspace、session、status、时间筛选。
- [ ] 支持 job cancel。
- [ ] 支持 variation retry。

验收：

- 管理员可以定位一次失败来自 queued、runtime、artifact、preview 还是 export。

## Phase ADM-2：Runtime Health

- [ ] 展示 Runtime Gateway 健康状态。
- [ ] 展示 BabeL-O runtime pool 状态。
- [ ] 展示 runtime contract version。
- [ ] 展示 compatible、degraded、unavailable、contract_mismatch 状态。
- [ ] 展示最近 drift 事件。

验收：

- 开发者可以判断当前 runtime 是否适合接收新任务。

## Phase ADM-3：Artifact Explorer

- [ ] 按 session/job/variation 查看 artifact。
- [ ] 查看 artifact version、hash、size、storage_key、preview_url。
- [ ] 支持 rebuild screenshot。
- [ ] 支持 export repair。
- [ ] 支持 revoke share。

验收：

- 已完成 artifact 在 runtime 不可用时仍可排查、预览、导出。

## Phase ADM-4：User Support

- [ ] 支持按用户查询 sessions。
- [ ] 支持查看 session resume 状态。
- [ ] 支持查看 job/variation 失败摘要。
- [ ] 支持生成用户可理解的问题说明。
- [ ] 严格控制 HTML 全文查看权限。

验收：

- support 角色能处理常见用户问题，但不能读取敏感全文。

## Phase ADM-5：Cost 与 Memory Governance

- [ ] 展示 token/cost 聚合。
- [ ] 按用户、workspace、模型、时间范围筛选成本。
- [ ] 展示 memory namespace。
- [ ] 展示 memory hit 和 candidate 状态。
- [ ] 支持查看 memory 审批记录。

验收：

- 管理端可观察 memory 是否跨用户隔离。
- 可按用户维度评估成本。

## Phase ADM-6：管理端质量门禁

- [ ] Admin API 权限测试。
- [ ] 审计日志写入测试。
- [ ] 管理端页面 smoke test。
- [ ] 敏感字段脱敏测试。
- [ ] runtime contract mismatch 展示测试。

验收：

- 管理端写操作不会绕过业务层。
- 权限不足时不可执行治理动作。
