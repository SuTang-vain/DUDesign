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
- [x] 直接参考 Open Design `template.json` / `design-systems` 资产结构，扩展 DUDesign 模板资产与视觉 profile 元数据：`mood`、`occasion`、`tone`、`formality`、`density`、`bestFor`、`avoidFor`。
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
- [x] 增加官方模板 / 我的模板 / 最近使用 / 收藏的选择入口。
- [x] 模板卡片展示 color swatch、字体摘要、适用场景、preview artifact。
- [x] 支持上传或粘贴 `DESIGN.md` 创建用户私有模板。
- [x] 支持选择一个或多个 Design Template Pack，并写入 `capabilityRequirements.template.designTemplatePackIds`。
- [x] 支持“自动分配模板”，让 N 个 variation 自动使用不同官方/用户模板。
- [x] 工作台 composer 增加插件/skill 选择。
- [x] 插件/skill 选择 MVP 先只开放官方 safe skill，并写入 `capabilityRequirements.plugins.skillIds`。
- [x] 插件面板展示每个 skill 的适用场景、规则摘要、负向约束和安全等级。
- [x] 工作台 composer 增加 automation loop 强度选择。
- [x] 增加“保存为我的模板”入口。
- [x] 增加“我的偏好”入口。
- [x] Activity Stream 展示 loop 阶段和修复动作。

验收：

- 用户无需理解 prompt 工程，也能选择场景、视觉、插件和自动化强度完成生成。

## Phase CAP-6：管理端治理

- [x] 管理官方场景模板。
- [x] 管理官方视觉 profile。
- [x] 管理官方色板和参考品牌。
- [x] 管理官方 Design Template Pack。
- [x] 管理业务模板包及其子模板，例如“动态百科词条卡片”。
- [x] 增加模板治理 lint：尺寸约束、颜色 token、禁止项、source/license 预留、runtime prompt block 覆盖度。
- [x] 管理端 CAP-6 只读治理面板展示官方模板、业务模板包、lint 状态、子模板草案和 prompt block coverage。
- [ ] 管理端模板编辑 / 发布 / 禁用写操作与审计流。

> 用户前端模板列表已确认保持当前页面形态，本阶段不再推进“官方 / 我的 / 业务模板包 / 最近使用”分组和模板详情页改造。
- [x] 展示 `DESIGN.md` lint / diff / preview smoke 结果。
- [x] 展示官方 skill 治理信息：schema、prompt block、rules、checklist、安全等级、使用指标。
- [x] 展示 MCP 插件可见性和权限：scope、auth、audit level、policy mode、rollout state。
- [x] 展示 MCP tool policy，从 `policy_only` 到真实调用能力的灰度状态。
- [x] 展示 automation loop 成功率和成本。
- [x] 展示模板/插件质量指标。
- [x] 展示模板/插件使用量、成功率、平均成本、失败原因和最近 drift。
- [x] 支持禁用风险插件。（治理覆盖层已接入 list capabilities、job snapshot 解析、Admin PATCH API，并通过 PostgreSQL governance override 持久化）
- [x] 记录能力治理审计日志的管理端可见性：展示 audit mode、write audit action 和 drift/audit 汇总；风险插件禁用/启用已写入 `capability.governance.change`。

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
- [x] Runtime Gateway golden：safe skill 选择后 prompt block 和 tool policy 稳定。
- [x] E2E：模板 + 插件 + standard loop 生成。
- [x] E2E：上传或粘贴 `DESIGN.md` -> 保存私有模板 -> 用该模板生成。
- [x] E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- [x] E2E：用户偏好恢复。
- [ ] MCP smoke：从 `policy_only` 升级到真实调用后，覆盖授权、审计、结果注入和回放。

验收：

- 能力分发系统不破坏现有无模板/无插件 job 流程。
- 旧 job/session 在能力配置升级后仍可 resume。

## Phase CAP-8：动态百科卡片能力包

> 业务规划详见 `docs/dynamic-encyclopedia-card-business-logic-plan.md`（v0.2）。
> 实现前需钉死的决策见该文档第 12 节；以下任务已对齐 12.1–12.6。

- [x] 定义 `ProductMode = web_app | dynamic_encyclopedia_card` 与 Capability Preset 的关系，明确不替代 `sourceMode`（12.4：`productMode` 作为 `DesignJob` 顶层字段，不进 `templateRequirements`，由 application-service 落地）。
- [x] 将“动态百科词条卡片”建模为父模板包，保留固定 viewport、iframe、touch/scroll、交付安全约束。
- [x] 为 `DesignTemplatePack` 增加父子关系字段：`parentPackId`、`templateRole`、`supportedProductModes`、`supportedEntryCategories`（12.6：删除 `supportedInteractionParadigms`，交互范式关联以 `InteractionParadigm.compatibleTemplatePackIds` 为唯一事实来源，反向查询由服务层派生）。
- [x] 注册首批动态百科子模板，对齐父包 `packageChildren` 声明（12.5）：
  - [x] 摘要事实卡 `dtp_dynamic_encyclopedia_summary_card`。
  - [x] 时间线叙事卡 `dtp_dynamic_encyclopedia_timeline_card`。
  - [x] 关系图谱卡 `dtp_dynamic_encyclopedia_relation_card`。
  - [x] 对比辨析卡 `dtp_dynamic_encyclopedia_compare_card`。
  - [x] 可展开事实卡 `dtp_dynamic_encyclopedia_expandable_card`。
- [ ] 下一批扩展：探索互动卡 `dtp_dynamic_encyclopedia_explore_card`（12.5：不在首批，若提前须同步更新父包 `packageChildren` 文案）。
- [x] 建模 `InteractionParadigm`，`compatibleTemplatePackIds` 为唯一事实来源，避免把交互范式和视觉模板包混在同一个字段。
- [x] 注册词条引导插件三件（12.6），沿用 `plug_` / `sk_` / `mcp_` 三段命名：
  - [x] `plug_encyclopedia_entry_guidance`（CapabilityPlugin）。
  - [x] `sk_encyclopedia_entry_guidance`（DesignSkill，`pluginId` 指向 plug）。
  - [x] `mcp_encyclopedia_democase_readonly`（McpToolBinding，`pluginId` 指向 plug），初期允许 mock。
- [x] democase MCP binding 的 `permissionPolicy.scopes` 显式声明 `['readonly_context']`，通过 `isMvpSafePluginPolicy` 校验（12.6）。
- [x] 明确 democase MCP binding 只服务生成期 agent；词条引导向导的分类查询由 application-service 直连 democase 只读服务，不经此 binding（12.1）。
- [x] 改造 `AutomationLoopProfile` 契约（12.2）：`qualityGate` 改为 `qualityGates: ('static' | 'pixel' | 'spec')[]`，删除 `enablePixelGate`，新增 `repairStrategy: 'spec_review_refine'`；迁移 `loop_fast`/`loop_standard` → `['static']`、`loop_deep_repair` → `['static', 'pixel']`。
- [x] 注册百科规范审查 loop profile `loop_encyclopedia_spec_review`，默认 `qualityGates: ['static', 'spec', 'pixel']`、`maxRepairAttempts: 2`；finding source 保留 `llm_review` 但标注 Phase 2，MVP 不启用（12.3）。
- [x] 明确动态百科 spec review 的模版上下文来源：
  - [x] job 级 `designTemplatePackIds` 只代表本次 job 可用/候选模板集合。
  - [x] `variationTemplateAssignments` 是单个 variation 审查和 refine 的 child template 事实来源。
  - [x] 自动修复 prompt 中的 selected template 应使用当前 variation 实际分配模板，避免把 timeline 规则错误应用到 summary/compare/data 等非 timeline 变体。
- [x] 定义动态百科 Capability Preset：自动选择词条引导、动态百科模板包和自动审查。
- [x] 将分类、子模板、交互范式、review mode 写入 capability/job snapshot，保证 resume 不漂移；当前 confirmed guidance 已持久化 selected child template、interaction paradigm 和 review mode，并通过 create job 写入 `templateRequirements.businessContext`。

验收：

- 动态百科模式可以通过能力分发系统表达，不新增第五层架构。
- “词条引导”被拆为 MCP、skill、业务向导，而不是塞进单一插件。
- 父模板包、子模板、交互范式有明确边界和版本化路径。
- `AutomationLoopProfile` 契约改造不破坏现有 `loop_fast`/`standard`/`deep_repair` 行为。

## Phase CAP-9：外部能力扩展与用户贡献

> 目标：把网络检索、图片生成、双端策略、数据输入分析、模板融合和用户贡献纳入能力分发系统，并保持权限、审计、artifact、snapshot 与 runtime 解耦。

### CAP-9.1 网络信息搜索 MCP

- [x] 定义 `ResearchContextArtifact`，包含 query、sources、summary、citations、confidence、freshness、riskFlags、rawPayloadHash、reviewStatus。
- [x] 注册网络检索插件族：
  - [x] `plug_research_context`。
  - [x] `sk_research_brief_builder`。
  - [x] `mcp_agent_reach_search`。
  - [x] `mcp_agent_reach_page_read`。
  - [x] `mcp_agent_reach_social_scan`。
- [x] 参考 `Agent-Reach` 作为搜索/读取能力路由，但 DUDesign 只消费审核后的摘要与引用，不直接把原始 payload 注入 runtime。
- [x] 增加 mock Agent-Reach executor，将 search/page/social 结果归一化为 `ResearchContextArtifact`。
- [x] MCP 调用结果进入 artifact store 或 capability artifact 表，并写入 job snapshot。
- [x] 增加来源审核规则：来源 URL、获取时间、平台类型、可信度、引用摘要、风险标记。
- [x] 增加 mock 网络搜索 MCP smoke：授权、调用、审核、artifact 写入、job snapshot 注入、审计和回放。
- [x] 增加真实 Agent-Reach staging smoke 脚手架：标准 MCP HTTP adapter、远端 smoke 脚本、env example。
- [x] 增加真实 Agent-Reach staging preflight：检查远端脚本部署、Python、Docker、mcporter / `AGENT_REACH_SEARCH_COMMAND`。
- [x] 在已部署 staging 上运行 Agent-Reach preflight，确认 DUDesign 脚本、Python、Docker 已就位，当前阻塞为检索后端未安装或未配置。
- [x] 支持从本地 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND` 转发自定义检索命令到远端，并用 fixture 命令跑通 preflight + smoke。
- [x] 在安装 `mcporter` / Agent-Reach 的 staging 主机上运行真实 Agent-Reach smoke，并记录 provider result schema 差异。

验收：

- 用户可以启用“网络信息搜索”辅助生成，Runtime Gateway 只收到审核后的 research context，旧 job resume 不受后续搜索结果变化影响。

### CAP-9.2 生成图片 MCP

- [x] 定义 `ImageGenerationRequest` / `ImageGenerationArtifact` 契约，覆盖 prompt、model、size、watermark、usageContext、contentSafety、cost、artifactId。
- [x] 注册图片生成插件族：
  - [x] `plug_image_generation`。
  - [x] `sk_visual_asset_brief`。
  - [x] `mcp_image_generation_ark_seedream`。
- [~] 支持服务端调用火山方舟图片生成 provider；API key 只存在服务端 secret，不进入 skill、prompt、job snapshot。Ark Seedream adapter、env 接入和 opt-in staging smoke 已完成；真实 smoke 待有 `ARK_API_KEY` 的 staging secret 环境执行。
- [x] 图片结果写入 artifact store，预览/导出/分享只读取 artifact id。
- [x] 增加 provider unavailable 降级事件：允许用户继续无图生成、换 provider 或稍后重试。MCP unavailable 通用事件、Ark provider unavailable 归一化和用户端 image-generation 细分文案已覆盖。
- [~] 增加图片生成 smoke：成功生成、artifact 固化、内容安全失败、provider 不可用、成本记录。mock 成功、artifact 固化、内容安全失败、成本记录、Ark provider unavailable 单测和 opt-in staging smoke 脚本已覆盖；真实 provider smoke 待有密钥环境执行。

验收：

- 模板/skill 可以请求“需要一张 hero/背景/卡片插图”，但真正图片生成由受控 MCP/provider 和 artifact store 承接。

### CAP-9.3 双端差异化生产策略 Skill

- [x] 注册 `sk_dual_surface_strategy`。
- [x] 在模板选择/Capability Preset 中支持推荐该 skill，尤其面向动态百科、固定尺寸卡片、iframe 嵌入页。
- [x] Skill 输出 PC / WISE / mobile 的 viewport、比例、信息密度、交互差异和禁止项。
- [x] 与 `variationTemplateAssignments` 结合，确保每个 variation 的端侧策略和 child template 绑定进入 snapshot。
- [x] Runtime Gateway golden 覆盖 dual-surface prompt block，不允许覆盖 workspace、tool policy 和 artifact guardrails。

验收：

- 同一需求可以按 PC 与 WISE 的差异化策略生成，而不是只做普通 responsive 缩放。

### CAP-9.4 数据输入获取分析 Skill

- [x] 注册 `sk_data_intake_analysis`。
- [x] 定义 `DataIntakeAnalysis` 契约：inputSources、topicSummary、entities、fields、missingFields、recommended templates/skills、riskFlags。
- [x] 支持 prompt、URL、粘贴文本、表格/JSON、上传资产、democase 和 research artifact 的统一分析入口。
- [x] 推荐模板/skill 时必须返回解释原因，不能静默覆盖用户显式选择。
- [x] 输入分析结果写入 preflight artifact。
- [x] 创建 job 时可引用 data-intake preflight artifact，并写入 job snapshot，保证 resume 不漂移。

验收：

- 用户给出松散资料时，系统能先形成结构化 brief，再进入模板/skill/loop 分发。

### CAP-9.5 模板融合与迭代更新机制

- [ ] 定义 `TemplateMergePlan`，记录来源模板、variation artifact、用户反馈、融合策略和候选变更。
- [ ] 支持从多个 Design Template Pack、用户私有模板和生成结果中生成 candidate version。
- [ ] Candidate version 必须经过 lint、diff、preview smoke 和权限检查。
- [ ] 官方模板更新必须进入 CAP-6 管理端审核；用户私有模板更新生成新 version，不覆盖历史 job snapshot。
- [ ] Automation Loop 支持“基于质量报告生成模板更新建议”，但不自动发布官方模板。

验收：

- 模板可以被持续迭代，但每次迭代都有来源、diff、审核和版本化记录。

### CAP-9.6 用户开发模板贡献机制

- [ ] 定义用户模板贡献生命周期：private -> workspace shared -> contribution candidate -> reviewed community -> official。
- [ ] 首版只开放 private -> contribution candidate。
- [ ] 贡献提交必须包含 source/license 声明、是否包含品牌 trade dress、预览 artifact 和 lint 结果。
- [ ] 管理端展示贡献候选的 diff、preview smoke、usage、风险标记和审核动作。
- [ ] 被禁用模板不能创建新 job；旧 job/session 继续使用 snapshot resume。

验收：

- 用户可以把自定义模板提交给平台审核，但不会绕过官方模板治理和版权/安全门禁。
