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

- [x] 明确用户端模板入口从“风格 / 领域 / 审美 / 配色”收敛为“场景 / 视觉 / 高级”。
- [x] 定义 `DomainTemplate` domain model。
- [x] 定义 `AestheticProfile` domain model。
- [x] 定义 `ColorPalette` domain model。
- [x] 定义 `BrandStyleReference` domain model。
- [x] 定义高级约束契约：色板、补充风格词、参考品牌、负面要求。
- [x] 参考 Open Design `template.json`，扩展视觉 profile 元数据：`mood`、`occasion`、`tone`、`formality`、`density`、`bestFor`、`avoidFor`。
- [x] 规划中期 `DesignSystem` 能力：品牌 token、排版、组件、动效、语气和反模式。
- [x] 定义 `DesignTemplatePack` 内部稳定契约，兼容但不绑定外部 `DESIGN.md` alpha schema。
- [x] 支持 `DESIGN.md` import/lint 初版：
  - [x] YAML front matter token 解析。
  - [x] Markdown section 解析。
  - [x] broken token reference 检查。
  - [x] 颜色对比度检查。
  - [x] 危险 prompt 指令过滤。
  - [x] export 回 `DESIGN.md`。
- [x] 规划 6-8 个 DUDesign 官方启发式模板，避免直接复制公开品牌 trade dress。
- [x] 设计首批官方领域模板。
- [x] 设计首批官方审美 profile。
- [x] 将官方 registry 中混合了品牌/视觉/场景的条目拆分，例如 `Premium Product Page`。
- [x] 支持用户从 variation 保存私有模板。
- [x] 支持用户上传或粘贴 `DESIGN.md` 保存为私有模板。
- [x] 支持多 variation 自动分配不同 Design Template Pack。
- [x] 支持用户保存默认审美偏好。
- [x] 模板选择写入 job snapshot，保证 resume 不漂移。

验收：

- 用户可以表达“在某个场景下，按某种视觉风格，并带着必要高级约束生成页面”。

## Phase CAP-2：Plugins

- [x] 定义 `CapabilityPlugin` domain model。
- [x] 定义 `DesignSkill` domain model。
- [x] 定义 `McpToolBinding` domain model。
- [x] 定义 `PluginPermissionPolicy`。
- [x] 明确 Design Skill 与 Design Template 的边界：skill 管生成方法，template 管视觉系统。
- [x] 定义 `CapabilityProfile`：template + skill + loop + 用户偏好组合快照。
- [x] Skill 只支持声明式规则，不支持任意代码执行。
- [x] MCP 插件支持只读/写入/验证等 scope。
- [x] Application Service 校验插件可见性和授权。
- [x] Runtime Gateway 将 skill 编译为受控 prompt block。
- [x] Runtime Gateway 将 MCP 插件编译为 tool policy。

验收：

- 用户可以选择受控插件辅助生成，插件不能突破 runtime 和 workspace 安全边界。

## Phase CAP-3：Automation Loop

- [x] 定义 `AutomationLoopProfile` domain model。
- [x] 支持 loop profile：fast、standard、deep repair。
- [x] 细化 CAP-3 测试分层：unit、mock integration、runtime contract、BabeL-O staging smoke。
- [x] 定义 loop stop conditions：
  - [x] max attempts。
  - [x] max cost。
  - [x] max duration。
  - [x] quality pass/fail。
- [x] 定义 loop event contract。
- [x] 支持生成后自动静态质量检查。
- [x] 支持生成后 preview/pixel gate 检查。
- [x] 支持最小自动修复 prompt。
- [x] 支持 loop 失败时输出用户可理解原因。

验收：

- Agent 可以在人最少介入下执行“生成-验证-修复”闭环，但不会无限重试。

## Phase CAP-4：业务服务层接入

- [x] 扩展 `CreateDesignJobRequest.templateRequirements` 或新增 `capabilityRequirements`。
- [x] job 创建时保存 capability snapshot。
- [x] 新增官方能力 registry seed。
- [x] 新增用户 Capability 偏好 PostgreSQL migration：`user_preferences`。
- [x] 新增用户偏好 API。
- [x] 新增保存 variation 为模板 API：`POST /api/variations/:id/save-template`。
- [x] 新增 `DESIGN.md` 导入 API：`POST /api/design-templates/import-design-md`。
- [x] 新增模板列表 API：`GET /api/design-templates`。
- [x] 新增 `design_templates` / `design_template_versions` PostgreSQL migration。
- [x] 新增 `ApplicationRepository` 模板持久化方法，覆盖 list/get/save/version lookup。
- [x] 实现 `PostgresRepository` SQL-native 模板读写，支持 no-hydrate production mode。
- [x] 官方模板 seed 与用户私有模板合并读取时保持权限隔离和稳定排序。
- [x] 用户模板更新时写入新 version，不覆盖历史 job snapshot。
- [x] 新增 `capability_profiles` 或在 job snapshot 中显式保存 profile version。
- [x] 新增 capability usage events。
- [x] 用户偏好扩展保存默认 Design Template Pack、默认 skill、默认 MCP tool、品牌参考和高级约束。

验收：

- 无 capability 的旧 job 流程保持兼容。
- 有 capability 的 job 可以恢复创建时的版本快照。
- PostgreSQL 重启后，官方模板和用户私有模板仍可读取、授权和参与多 variation 分配。

## Phase CAP-5：用户前端接入

- [x] 工作台 composer 将模板入口调整为“场景 / 视觉 / 高级”。
- [x] 工作台 composer 将多个小菜单收敛为单个“设计方向”选择器。
- [x] 工作台 composer 增加场景选择，底层继续映射 `DomainTemplate`。
- [x] 工作台 composer 增加视觉选择，底层继续映射 `AestheticProfile`。
- [x] 工作台 composer 将色板、补充风格词、参考品牌、负面要求放入高级入口。
- [x] 设计方向选择器支持搜索、分类、右侧详情预览。
- [x] 视觉卡片展示 mood、density、formality、best for、avoid for 的摘要。
- [x] 预留 Design System picker 入口，MVP 可隐藏或放入高级。
- [ ] 增加官方模板 / 我的模板 / 最近使用 / 收藏的选择入口。
- [ ] 模板卡片展示 color swatch、字体摘要、适用场景、preview artifact。
- [ ] 支持上传或粘贴 `DESIGN.md` 创建用户私有模板。
- [ ] 支持选择一个或多个 Design Template Pack，并写入 `capabilityRequirements.template.designTemplatePackIds`。
- [ ] 支持“自动分配模板”，让 N 个 variation 自动使用不同官方/用户模板。
- [ ] 工作台 composer 增加插件/skill 选择。
- [ ] 插件/skill 选择 MVP 先只开放官方 safe skill，并写入 `capabilityRequirements.plugins.skillIds`。
- [ ] 插件面板展示每个 skill 的适用场景、规则摘要、负向约束和安全等级。
- [ ] 工作台 composer 增加 automation loop 强度选择。
- [ ] 增加“保存为我的模板”入口。
- [ ] 增加“我的偏好”入口。
- [ ] Activity Stream 展示 loop 阶段和修复动作。

验收：

- 用户无需理解 prompt 工程，也能选择场景、视觉、插件和自动化强度完成生成。

## Phase CAP-6：管理端治理

- [ ] 管理官方场景模板。
- [ ] 管理官方视觉 profile。
- [ ] 管理官方色板和参考品牌。
- [ ] 管理官方 Design Template Pack。
- [ ] 展示 `DESIGN.md` lint / diff / preview smoke 结果。
- [ ] 管理官方 skill。
- [ ] 管理 MCP 插件可见性和权限。
- [ ] 展示 MCP tool policy，从 `policy_only` 到真实调用能力的灰度状态。
- [ ] 展示 automation loop 成功率和成本。
- [ ] 展示模板/插件质量指标。
- [ ] 展示模板/插件使用量、成功率、平均成本、失败原因和最近 drift。
- [ ] 支持禁用风险插件。
- [ ] 记录能力治理审计日志。

验收：

- 管理员可以治理能力分发配置，不需要直接访问数据库或 runtime。

## Phase CAP-7：测试与上线门禁

- [x] 模板 schema 单元测试。
- [x] `DESIGN.md` import/lint 单元测试。
- [x] Design Template Pack adapter 单元测试。
- [x] skill safety validator 单元测试。
- [x] MCP permission policy 单元测试。
- [x] automation loop stop condition 单元测试。
- [x] API smoke：官方模板创建 job。
- [x] API smoke：插件授权失败不能创建 job。
- [x] API smoke：保存 variation 为模板。
- [x] PostgreSQL opt-in smoke：`design_templates` / `design_template_versions` migration、hydrate/no-hydrate、用户私有模板隔离。
- [x] API smoke：导入 `DESIGN.md` 后创建 job，并验证 template pack snapshot 不漂移。
- [x] API smoke：用户模板 version 更新后旧 job resume 仍使用旧 snapshot。
- [x] Runtime Gateway golden：capability context 编译稳定。
- [ ] Runtime Gateway golden：safe skill 选择后 prompt block 和 tool policy 稳定。
- [ ] E2E：模板 + 插件 + standard loop 生成。
- [ ] E2E：上传或粘贴 `DESIGN.md` -> 保存私有模板 -> 用该模板生成。
- [ ] E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- [x] E2E：用户偏好恢复。
- [ ] MCP smoke：从 `policy_only` 升级到真实调用后，覆盖授权、审计、结果注入和回放。

验收：

- 能力分发系统不破坏现有无模板/无插件 job 流程。
- 旧 job/session 在能力配置升级后仍可 resume。
