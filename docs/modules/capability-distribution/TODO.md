# Capability Distribution System TODO

> 模块：Capability Distribution System
> 类型：跨层产品能力治理模块
> 上游依赖：用户、workspace、artifact、memory namespace、Runtime Gateway、MCP/skill registry
> 下游输出：template context、plugin/tool policy、automation loop plan、user preference context

## Phase CAP-0：概念边界与文档治理

- [x] 将 Template & Skill System 重命名为 Capability Distribution System。
- [x] 明确能力分发系统不新增第五层架构。
- [x] 拆分三个子模块：
  - [x] Templates。
  - [x] Plugins。
  - [x] Automation Loop。
- [x] 明确 template、plugin、automation loop 的职责边界。
- [x] 同步修正非历史引用中的 Template & Skill System 命名。

验收：

- 文档库中能力分发相关概念统一为 Capability Distribution System。

## Phase CAP-1：Templates

- [x] 定义 `DomainTemplate` domain model。
- [x] 定义 `AestheticProfile` domain model。
- [x] 定义 `ColorPalette` domain model。
- [ ] 定义 `BrandStyleReference` domain model。
- [x] 设计首批官方领域模板。
- [x] 设计首批官方审美 profile。
- [ ] 支持用户从 variation 保存私有模板。
- [x] 支持用户保存默认审美偏好。
- [ ] 模板选择写入 job snapshot，保证 resume 不漂移。

验收：

- 用户可以表达“在某个领域下，按某种审美风格生成页面”。

## Phase CAP-2：Plugins

- [ ] 定义 `CapabilityPlugin` domain model。
- [ ] 定义 `DesignSkill` domain model。
- [ ] 定义 `McpToolBinding` domain model。
- [ ] 定义 `PluginPermissionPolicy`。
- [ ] Skill 只支持声明式规则，不支持任意代码执行。
- [ ] MCP 插件支持只读/写入/验证等 scope。
- [ ] Application Service 校验插件可见性和授权。
- [ ] Runtime Gateway 将 skill 编译为受控 prompt block。
- [ ] Runtime Gateway 将 MCP 插件编译为 tool policy。

验收：

- 用户可以选择受控插件辅助生成，插件不能突破 runtime 和 workspace 安全边界。

## Phase CAP-3：Automation Loop

- [ ] 定义 `AutomationLoopProfile` domain model。
- [ ] 支持 loop profile：fast、standard、deep repair。
- [ ] 定义 loop stop conditions：
  - [ ] max attempts。
  - [ ] max cost。
  - [ ] max duration。
  - [ ] quality pass/fail。
- [ ] 定义 loop event contract。
- [ ] 支持生成后自动静态质量检查。
- [ ] 支持生成后 preview/pixel gate 检查。
- [ ] 支持最小自动修复 prompt。
- [ ] 支持 loop 失败时输出用户可理解原因。

验收：

- Agent 可以在人最少介入下执行“生成-验证-修复”闭环，但不会无限重试。

## Phase CAP-4：业务服务层接入

- [x] 扩展 `CreateDesignJobRequest.templateRequirements` 或新增 `capabilityRequirements`。
- [x] job 创建时保存 capability snapshot。
- [x] 新增官方能力 registry seed。
- [x] 新增 PostgreSQL migration。
- [x] 新增用户偏好 API。
- [ ] 新增保存 variation 为模板 API。
- [ ] 新增 capability usage events。

验收：

- 无 capability 的旧 job 流程保持兼容。
- 有 capability 的 job 可以恢复创建时的版本快照。

## Phase CAP-5：用户前端接入

- [ ] 工作台 composer 增加领域模板选择。
- [ ] 工作台 composer 增加审美 profile/颜色方案选择。
- [ ] 工作台 composer 增加插件/skill 选择。
- [ ] 工作台 composer 增加 automation loop 强度选择。
- [ ] 增加“保存为我的模板”入口。
- [ ] 增加“我的偏好”入口。
- [ ] Activity Stream 展示 loop 阶段和修复动作。

验收：

- 用户无需理解 prompt 工程，也能选择领域、审美、插件和自动化强度完成生成。

## Phase CAP-6：管理端治理

- [ ] 管理官方领域模板。
- [ ] 管理官方审美 profile。
- [ ] 管理官方 skill。
- [ ] 管理 MCP 插件可见性和权限。
- [ ] 展示 automation loop 成功率和成本。
- [ ] 展示模板/插件质量指标。
- [ ] 支持禁用风险插件。
- [ ] 记录能力治理审计日志。

验收：

- 管理员可以治理能力分发配置，不需要直接访问数据库或 runtime。

## Phase CAP-7：测试与上线门禁

- [ ] 模板 schema 单元测试。
- [ ] skill safety validator 单元测试。
- [ ] MCP permission policy 单元测试。
- [ ] automation loop stop condition 单元测试。
- [x] API smoke：官方模板创建 job。
- [ ] API smoke：插件授权失败不能创建 job。
- [ ] API smoke：保存 variation 为模板。
- [x] Runtime Gateway golden：capability context 编译稳定。
- [ ] E2E：模板 + 插件 + standard loop 生成。
- [x] E2E：用户偏好恢复。

验收：

- 能力分发系统不破坏现有无模板/无插件 job 流程。
- 旧 job/session 在能力配置升级后仍可 resume。
