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

> 产品语义声明：`../../dynamic-topic-interactive-card-product-semantics.md`。本阶段保留历史技术 ID，但产品目标是“词条主题动态交互卡”，不是传统百科页面。

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
- [x] 基于 `/Users/tangyaoyue/DEV/Baidu/case垂类分类` case 标准回灌垂类模板：
  - [x] 历史人物：强化“如果没有这 N 件事”“史实 / 如果没发生”因果链要求。
  - [x] 影视：强化“关系图谱 / 剧情因果 / 作品推荐”三视图要求。
  - [x] 文化类词语：强化“关联词详解 / 出处典故 / 近义反义易混”要求。
  - [x] 景区景点：新增导览路线和 POI 地图子模板。
- [x] 注册景区景点动态百科子模板：
  - [x] 路线导览卡 `dtp_de_scenic_spot_route_guide`。
  - [x] 地图 POI 卡 `dtp_de_scenic_spot_map_poi`。
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
- [x] 沉淀动态百科垂类模板迭代规划：`docs/dynamic-encyclopedia-vertical-template-roadmap.md`。
- [x] 注册首批高优垂类子模板：
  - [x] 历史人物关系图谱 `dtp_de_history_person_relationship`。
  - [x] 历史人物事件因果链 `dtp_de_history_person_event_chain`。
  - [x] 电影演员-角色网络 `dtp_de_film_cast_role_network`。
  - [x] 电影系列/IP 导航 `dtp_de_film_series_navigation`。
  - [x] 电视剧角色关系 `dtp_de_tv_character_relation`。
  - [x] 电视剧分集剧情链 `dtp_de_tv_episode_chain`。
  - [x] 文化词语关联图谱 `dtp_de_cultural_phrase_relation_graph`。
  - [x] 文化词语出处典故 `dtp_de_cultural_phrase_origin_story`。
- [x] 扩展 `InteractionParadigm` 映射：`ip_causal_event_chain`、`ip_series_navigation`，并把垂类子模板接入 `compatibleTemplatePackIds`。
- [x] 扩展 entry guidance mock 分类与 democase，让历史人物、电影、电视剧、文化类词语可以自动推荐垂类子模板。
- [x] 将 `metadata.classificationVector` 明确写入 guidance 持久化，表达 L1/L2/L3+、推荐模块优先级和分类信号。
- [x] 扩展 spec review（Stage 1 warning）：影视禁止盗版资源入口、剧情/集数不得幻觉；历史关系/事件不得编造；文化典故缺可靠出处时隐藏。
- [x] 扩展 spec review（Stage 1 warning）：tab、page-switcher、modal 不得只做静态视觉状态；出现可点击控件时必须具备本地面板、状态切换脚本和可访问性状态更新。
- [ ] 将垂类 spec review 从 Stage 1 warning 升级策略沉淀到管理端治理面板，支持按规则查看命中率与误伤率。

验收：

- 动态百科模式可以通过能力分发系统表达，不新增第五层架构。
- “词条引导”被拆为 MCP、skill、业务向导，而不是塞进单一插件。
- 父模板包、子模板、交互范式有明确边界和版本化路径。
- `AutomationLoopProfile` 契约改造不破坏现有 `loop_fast`/`standard`/`deep_repair` 行为。
- 动态百科卡片的 tab、分页、展开、弹层等交互必须在 private preview 中真实可用；share preview 仍保持只读安全边界。

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

## v0.4 硬性归束（2026-07-08 落地）

- [x] `loop_encyclopedia_spec_review` 自动引入 spec gate（4 条新规则全部以 warning 生效）
- [x] `loop_standard` / `loop_fast` / `loop_deep_repair` 行为不变
- [x] Stage 1→Stage 2 升级路径：`ENFORCEMENT` 表中规则 severity 从 `'warning'` 改为 `'error'`
- [ ] 1-2 周后根据真实分布触发 Stage 2 升级

验收：
- 全部现有 loop profile 行为不变（仅 spec review 增加了 8 条新 finding 收集）

## Phase CAP-10：模板与 Skill 自助创作

> 详细规划：`template-skill-authoring-governance-plan.md`
> 准入案例：明星组合动态百科功能设计文档

### CAP-10.1 HTML -> Template Draft v2

- [x] 定义 `CapabilityAuthoringSource` 和 `DesignTemplateDraftV2` 契约。
- [x] 固定 source variation/artifact/version/content hash：Application Service 从 repository artifact 事实补齐 version/hash，并校验 variation、artifact 和 workspace 归属。
- [x] 使用 parse5 DOM / PostCSS AST 提取 colors、typography、spacing、radius 和 elevation。
- [x] 提取 sections、repeated components、layout 和 responsive rules。
- [x] 识别 tab、accordion、modal、page-switcher、carousel、local filter 等本地交互候选；仅已有 registry id 可写入 `interactionParadigmIds`，其余保留为 component role/state。
- [x] 定义 extraction evidence 和字段 confidence 契约，并校验 evidence path 与 `0..1` confidence。
- [x] 将源 HTML 固定为 `htmlExamples` 候选，并生成独立 sanitized artifact：移除 active/external content，脱敏 email/secret/path，保留品牌风险 warning 和完整审计 finding。
- [ ] 当前“保存为模板”拆成快速收藏和高保真提取两种模式。

验收：

- 无原 Design Template Pack 的 HTML variation 也能提取非空 tokens、sections 和 HTML example。

### CAP-10.2 Draft 编辑、预览与导出

- [x] 定义 `CapabilityAuthoringDraft` 状态机和显式合法迁移。
- [x] lint error 禁止发布，warning 和 extraction evidence 要求用户确认；仅 sanitizer/preview 全通过的 `ready` draft 可 private publish。
- [x] 增加 `capability_authoring_drafts` PostgreSQL migration、SQL-native repository 和 hydrate/no-hydrate 查询基础。
- [x] 增加 Draft create/list/get/update/lint 用户 API，并保持 owner/workspace 隔离。
- [x] 增加 draft preview smoke：强制 static quality gate，可通过 `DUDESIGN_CAPABILITY_AUTHORING_PIXEL_GATE=1` opt-in 真实 Playwright pixel gate；仅 preview pass 进入 `ready`。
- [x] 支持 `ready -> published_private`，创建 `1.0.0` 私有模板和不可覆盖历史版本。
- [x] 支持用户私有模板回滚：读取历史 version，恢复内容但生成新的 patch version，旧版本保持不变。
- [x] private publish / rollback 写入 capability governance audit。
- [~] 开放 `DESIGN.md` 和 Template Pack JSON 导出：API 与下载响应已完成，用户端 UI 待接入。
- [x] 定义 Capability Bundle ZIP manifest 和 privacy-safe provenance；携带 Template Draft、Skill、Interaction Paradigm、Data Contract、Review Profile 与 HTML examples。
- [x] Capability Bundle ZIP 导入执行文件数/大小、路径、重复 entry、manifest、hash、orphan example 与 provenance 校验。
- [x] ZIP HTML examples 导入后重新 sanitizer，并持久化到独立 `capability_authoring_assets`，不依赖原环境 artifact/session id。
- [x] Capability Bundle 导出/导入 API、用户端 Authoring Studio 下载/上传、license declaration、导入摘要确认和 preview gate 已完成。
- [x] 用户端只列出 `ready` / `published_private` 草稿供导出；ZIP 导入后必须人工确认 evidence/warning path 并运行 preview，不直接发布。
- [x] `DESIGN.md` 和 portable Template Pack JSON 支持重新导入为 governed draft；JSON 使用稳定 content hash 校验，篡改文档被拒绝。

### CAP-10.3 普通功能文档规范化

- [ ] 定义 `Capability Spec Importer`。
- [ ] 确定性解析标题、表格、列表、字段、风险和验收。
- [ ] Agent-assisted decomposition 只生成符合 schema 的 draft。
- [ ] 输出 source evidence、confidence 和 unresolved questions。
- [ ] 拆分 Template Pack、Declarative Skill、Interaction Paradigm、Data Contract 和 Review Profile。
- [ ] 建立“明星组合动态百科”golden fixture。

验收：

- 明星组合文档不再导入为 token 全空的单一模板。

### CAP-10.4 用户私有声明式 Skill

- [ ] 增加 `design_skills` / `design_skill_versions` 持久化。
- [ ] 用户 Skill CRUD。
- [x] Skill dangerous instruction、长度、路径、shell、可执行内容和权限提升 lint。
- [ ] 私有 Skill 可进入 capability snapshot。
- [ ] Runtime Gateway 编译私有 Skill 时不扩大 tool policy。

### CAP-10.5 用户贡献与官方发布

- [ ] 定义 `capability_contributions` 生命周期。
- [ ] 首版开放 private -> contribution candidate。
- [ ] 提交包含 source/license、品牌风险、lint 和 preview artifact。
- [ ] 管理端支持 request changes / reject / approve / promote official。
- [ ] 官方模板和 Skill 支持 disable / archive / rollback。
- [ ] 所有写操作记录 `capability.governance.change`。

### CAP-10.6 Runtime Provider 兼容

- [ ] 定义 `RuntimeDesignContextV1`。
- [ ] 原始 Markdown 不进入 Runtime。
- [ ] `previewArtifactId` 不作为隐式生成上下文。
- [ ] HTML example 通过显式标准字段注入。
- [ ] 增加 BabeL-O golden 和 CLI Agent fixture。

### CAP-10.7 HTML Example 文件边界

- [x] 大型官方 HTML example 从 TypeScript 模板 registry 迁移为独立文件引用。
- [x] 时间线、关系图谱、对比辨析和可展开事实卡示例均保留为可审计文件。
- [x] 增加文件引用存在性和 HTML 文档结构测试。
- [ ] 将示例文件纳入 license/provenance manifest 和构建产物 hash。

验收：

- BabeL-O 或其他 Agent Provider 更新只影响 compiler/adapter 和 contract tests。

## Phase CAP-11：多模块需求抽样与受控探索

> 详细规划：`controlled-exploration-governance-plan.md`
> 依赖：CAP-10.3 普通功能文档规范化

### CAP-11.1 Requirement Module 契约

- [x] 定义 `RequirementModuleV1`、模块模式、优先级、条件、依赖、冲突和 evidence 契约。
- [x] 定义 `always / conditional / sampled / global_rule` 语义和 schema 校验。
- [ ] Capability Spec Importer 输出模块图、未解决问题和置信度。
- [x] 明星组合动态百科文档建立模块图 golden fixture。
- [x] 固定事实、安全、权限、数据字段和必需模块 invariant。

### CAP-11.2 Exploration Plan 契约

- [x] 定义 `ExplorationProfileV1`、`BatchExplorationPlanV1` 和 `VariationExplorationPlanV1`。
- [x] 用户探索度为 `0..100` 业务语义，不暴露 provider temperature。
- [x] `factCreativity` 固定为 0，探索度只影响受控设计维度。
- [x] 定义 planner version、deterministic seed、coverage summary 和 warning 契约。
- [x] 计划与 Requirement Module Graph 进入 job snapshot，旧任务不随 registry 更新漂移。

### CAP-11.3 批量覆盖与差异治理

- [x] 3/6 variation 能覆盖高优先级 sampled 模块。
- [x] required 和条件成立的 conditional 模块满足最小覆盖。
- [x] 每个 variation 拥有可解释的 focus、模块组合和设计方向。
- [ ] 增加模块 Jaccard、focus uniqueness、layout/interaction diversity 指标。
- [~] 支持用户锁定、排除和重新分配非必选模块；planner 已支持 locked/excluded，重新分配 API/UI 待实现。

### CAP-11.4 安全与 Provider 中立

- [x] 探索计划不能扩大 MCP/tool policy。
- [x] Runtime 不重新读取原始文档做随机抽样。
- [x] BabeL-O、Mock 与可执行 CLI Agent provider 消费同一标准 exploration context。
- [x] 高探索仍执行事实、未知值、争议表达和能力包 invariant 门禁。
- [x] 建立旧 provider fallback、event drift、refine 和 runtime unavailable 测试。
- [~] 在真实 staging BabeL-O 环境执行 3/6 variation exploration smoke；本地脚本、计划与 artifact 断言已就绪，待发布本阶段 build。

### CAP-11.5 动态百科能力配置策略

> 用户端规划：`../user-experience/dynamic-encyclopedia-capability-drawer-plan.md`

- [x] 定义 `CapabilitySelectionSource = official_preset | entry_guidance | user_override | job_snapshot`。
- [x] 扩展 `CapabilityPreset`：`selectionPolicy` 声明 required template/skill/MCP 和 allowed Loop。
- [x] 扩展 `CapabilityPreset`：`explorationDefaults` 声明默认 level、experimental 确认阈值和强制审查阈值。
- [x] 动态百科 preset 默认 exploration level 设为 `40 / balanced`，阈值不散落在前端常量。
- [ ] 定义 capability lock reason code 和用户端安全说明。
- [x] entry guidance 返回 exploration recommendation、reason 和 confidence。
- [x] 明确合并优先级：`job_snapshot > user_override > entry_guidance > official_preset`；右栏展示候选来源，正式页面从固定 job snapshot 展示来源事实。
- [x] required capability、父模板硬约束和 invariant 不允许被用户 override 删除。
- [x] experimental 档强制 semi_auto/auto spec review，`factCreativity` 始终为 0。
- [x] 增加契约、registry、兼容模板和 policy 单测。

验收：

- 同一功能文档能够形成可解释、可回放的批量设计覆盖方案，而不是只生成颜色不同的页面。
- 探索度改变设计发散，不改变事实、安全、权限和必需业务约束。

## Phase CAP-12：词条 Taxonomy 与 Democase 检索能力

> 业务基线：`/Users/tangyaoyue/DEV/Baidu/KeDU-动态百科服务平台/动态百科服务平台_完整分类体系.md` 与 `/Users/tangyaoyue/DEV/Baidu/case垂类分类`。

- [~] 将 11 个 L1、44 个 L2、40+ 个 L3 垂类转为版本化、机器可读 taxonomy registry；11 个 L1、源表实际列出的 41 个 L2 和首批高优 L3 已完成，源文档声明 44 但缺 3 个定义，待数据方确认。
- [~] taxonomy node 声明 aliases、positive/negative signals、适用模板、交互范式和风险规则；parent id、完整数据需求和 40+ L3 待补。
- [x] 建立 taxonomy lint，校验 L1/L2 数量、父子关系和重复 node id；alias/capability 全量 lint 待随 registry 扩展继续加强。
- [x] 将本地 case 资产索引为结构化 democase records；32 个主 HTML case 已索引，约 488 个图片/文档/数据文件作为 supporting assets 汇总，输出 taxonomy、模板、交互、结构特征、asset summary 和 content hash。
- [~] 建立检索接口，返回候选 case、score、matched evidence 和 index version；exact title/alias、关键词和 BM25-style lexical scorer 已完成，向量索引待补。
- [x] guidance AI 只消费裁剪后的 taxonomy/democase evidence，不把完整原始 HTML、case 事实正文或不受信 Markdown 直接注入模型。
- [x] AI 模式模板推荐使用模型语义评分 + registry hard constraints，不再由固定数组顺序决定；legacy 模式仍保留旧逻辑。
- [x] V2 contract 区分 entity classification 与 user intent，并通过“庆余年人物关系”API flow 固定电视剧实体 + 人物关系意图。
- [x] V2 contract 输出 available facts、missing facts、research requirement、risk flags 和 clarification candidates。
- [x] 建立 100 条 golden guidance fixture，覆盖 20 个高频 L2、歧义词条、纯标题和标题+意图；错误/恶意输入专项集待继续扩展。
- [x] 建立离线评测：coverage、L1/L2/taxonomy node 准确率、Top-3 模板召回率、primary intent 命中率和澄清 precision/recall。
- [x] 将 100 条 fixture 接入可并发调用真实 `GuidanceAnalysisGateway` 的 evaluation runner，生成逐 case JSON 报告并按 staging 阈值判定准入。
- [x] staging 首次真实模型 baseline 已通过；最终结果为 coverage 99%、L1 98.0%、L2 92.9%、taxonomy node 85.9%、intent 94.9%、Top-3 模板召回 100%、澄清 precision 87.5%、recall 70%。
- [ ] 真实数据上线前保留 mock registry，但响应必须明确 `analysisMode=mock`，不得继续伪装为 AI 置信度。

验收：

- taxonomy 与 democase 是可版本化、可审计、可检索的数据资产，不再散落为 `includes()` 和手写数组。
- 新增或调整垂类不需要修改 Application Service 分类分支。
- 模板推荐可以解释引用了哪些 taxonomy 节点、democase 和用户意图。

## Phase CAP-18：主题交互卡质量能力

- [x] 新增 `aes_topic_interactive_card`，明确禁止 CTA、proof block、testimonial、pricing 和 dashboard 模式。
- [x] 动态主题卡默认使用专用 aesthetic profile 与 neutral palette，不再继承 `Trustworthy SaaS`。
- [x] 新增明星组合成员体系专用 HTML democase，不再回退到通用 relation-card 示例。
- [x] 专用 democase 同时通过 pixel gate 与 topic-card spec review。
- [x] 为 timeline、summary、comparison、expandable 建立同等级 compact interaction democase。
- [x] 将 300×360 升级为所有动态主题卡模板的一等交付尺寸：保留必要 tab/主交互，首屏收缩为主题身份与核心事实，次要信息通过本地点击、弹层或 tab 渐进展示。
- [x] 六类结构原型（summary/timeline/relation/comparison/expandable/star-group）统一通过桌面与 300×360 Chromium pixel gate，并覆盖时间线切换、对比弹层、渐进展开和成员详情点击回归。
- [x] series、scenic route、scenic map 等垂直交互模板使用领域专属 `300×360` compact few-shot，不回退到通用百科页面样例。
- [x] 建立共享 `EncyclopediaDemocaseExperienceProfile` 默认契约，按 relation/timeline/compare/route/progressive/summary 阶段统一桌面与 `300×360` 的控件、内容项和文字预算。
- [x] Runtime Gateway 在 democase 证据阶段不匹配时使用官方阶段 fallback，禁止错误复用第一条 recalled profile；prompt 明确输出 profile 来源、保留项和延后项。
- [x] 官方动态卡示例按各自 dominant stage 执行 profile-aware Chromium Pixel Gate；summary、relation、compare、expandable、series、route、map 和 member 已消除极小屏重复导航和不可达隐藏内容。
- [x] 真实 democase 索引构建测试校验生成 profile 与共享契约完全一致，防止 builder、runtime 和 quality gate 的预算漂移。
- [~] staging 禁止 mock research/image artifact 被标记为可用于质量验收的真实素材；source contract 已增加 mock provenance，Runtime 已禁止把 mock 当事实或可用图片，部署配置仍需切换真实 provider。
