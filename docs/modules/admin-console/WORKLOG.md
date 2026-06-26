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
