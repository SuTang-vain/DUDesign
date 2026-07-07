# Capability Distribution System 工作记录

> 模块：Capability Distribution System
> 维护方式：按日期追加。记录模板、插件、自动化 loop、能力编译策略和跨层治理决策。

## 2026-07-03 CAP-M8 Dynamic Encyclopedia Card Planning

### 已完成

- 新增业务规划文档：`docs/dynamic-encyclopedia-card-business-logic-plan.md`。
- 明确动态百科卡片是 `ProductMode + Capability Preset + Business Wizard`，不替代现有 `sourceMode`。
- 明确“词条引导”对用户可表现为一个能力，但系统内部必须拆成：
  - democase 只读 MCP Tool Binding。
  - 百科词条分类与模板匹配 Design Skill。
  - Application Service 词条引导向导。
- 明确“动态百科词条卡片模板包”需要拆出父模板包、子模板和交互范式三层，避免把交互玩法和视觉 token 混在同一模板实体。
- 明确“自动审查”复用 Automation Loop，但需要新增 `loop_encyclopedia_spec_review`、百科规范审查器，以及自动/半自动/关闭三种 review mode。
- CAP-8 已加入 TODO，作为动态百科能力包的准入阶段。

### 决策

- `ProductMode` 与 `SourceMode` 正交：动态百科卡片也应支持从零生成和基于已有 HTML 修改。
- Capability Distribution 只管理模板、插件、MCP、loop profile 和 preset；分类、模板匹配、半自动确认状态机由 Application Service 编排。
- Runtime Gateway 只消费业务层解析后的标准上下文和 tool policy，不直接读取 democase 数据库或用户上传原文。

### 后续关注

- 先补 DesignTemplatePack 父子关系与 InteractionParadigm 契约，再做用户端模式切换。
- `mcp_encyclopedia_democase_readonly` 初期可 mock，但 contract 要按真实 MCP 调用设计。
- 自动审查规则需要与 `dtp_dynamic_encyclopedia_card` rationale 和 KeDU 分类体系对齐。

## 2026-07-03 CAP-M8.1 Dynamic Encyclopedia Capability Registry Foundation

### 已完成

- 新建功能分支：`feature/dynamic-encyclopedia-card`。
- Contracts 增加动态百科能力地基：
  - `ProductMode = web_app | dynamic_encyclopedia_card`。
  - `DesignTemplatePack` 父子元数据：`parentPackId`、`templateRole`、`supportedProductModes`、`supportedEntryCategories`。
  - `InteractionParadigm`。
  - `AutomationLoopProfile.qualityGates` 兼容字段和 `spec_review_refine` repair strategy。
- Capability registry 增加动态百科入口：
  - `tpl_dynamic_encyclopedia_entry`。
  - `plug_encyclopedia_entry_guidance`。
  - `sk_encyclopedia_entry_guidance`。
  - `plug_encyclopedia_democase_readonly`。
  - `mcp_encyclopedia_democase_readonly`。
  - `loop_encyclopedia_spec_review`。
  - `DYNAMIC_ENCYCLOPEDIA_PRESET`。
- 官方模板包增加动态百科子模板：
  - `dtp_dynamic_encyclopedia_summary_card`。
  - `dtp_dynamic_encyclopedia_timeline_card`。
- 交互范式增加首批映射：
  - `ip_entity_summary -> dtp_dynamic_encyclopedia_summary_card`。
  - `ip_timeline_story -> dtp_dynamic_encyclopedia_timeline_card`。
- 单测覆盖动态百科 preset snapshot、交互范式映射、父子模板元数据和官方模板合规约束。

### 验证

- `npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js`
- `npx tsc -b apps/api packages/contracts packages/domain packages/runtime-gateway`

### 决策

- 本分支第一步只注册能力地基，不一次性改穿 productMode 顶层化、数据库迁移、entry guidance API 和用户端模式切换。
- `qualityGates` 先作为兼容字段引入，保留既有 `qualityGate` / `enablePixelGate`，避免一次改动影响 Automation Loop 事件、前端 Activity Stream 和旧测试。
- 交互范式与模板包关联以 `InteractionParadigm.compatibleTemplatePackIds` 为事实来源，模板包不持久化反向引用。

### 后续关注

- `productMode` 顶层化已在 CAP-M8.2 / APP-M32 / RTC-M8.1 推进；下一步进入 entry guidance mock flow。
- 再下一步实现 `POST /api/encyclopedia/entry-guidance` mock flow。

## 2026-07-03 CAP-M8.2 Dynamic Encyclopedia Product Mode Contract

### 已完成

- `ProductMode` 从规划字段推进为 job 顶层业务字段：
  - contracts `CreateDesignJobRequest.productMode`。
  - domain `DesignJob.productMode`。
  - InMemoryStore / PostgresRepository job 创建与读取。
  - PostgreSQL migration `0011_product_mode.sql`。
  - Runtime Gateway `SpawnVariationAgentsInput.productMode`。
  - BabeL-O `/v1/agents` request body。
- 默认值保持 `web_app`，旧请求不传 `productMode` 时不改变现有 Web&App 生成流程。
- API flow smoke 增加断言：
  - 旧 `from_existing_html` job 默认 `web_app`。
  - 显式 `dynamic_encyclopedia_card` job 可进入 job snapshot。
- Runtime Gateway 测试覆盖 `productMode` 透传到 BabeL-O agent request。

### 验证

- `npx tsc -b packages/contracts packages/domain packages/runtime-gateway && npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway exec tsc -b && node --test packages/runtime-gateway/dist/babelOClient.test.js`

### 决策

- 本轮只将 `productMode` 顶层化到 job，不把 session 改成 product-mode session。原因是生成任务才是动态百科业务事实来源，session 仍可承载同一会话下的多类任务。
- `productMode` 不进入 `templateRequirements`，避免污染 capability snapshot。

### 后续关注

- 下一步实现 entry guidance mock API，让动态百科模式可以在创建 job 前产生分类与推荐。
- 用户端模式切换后再开始传 `productMode=dynamic_encyclopedia_card`。

## 2026-07-03 CAP-M5.1 DESIGN.md Private Template Browser E2E

### 已完成

- 用户端模板导入闭环增加浏览器 E2E：
  - 打开模板库。
  - 切换到“我的模板”。
  - 粘贴 `DESIGN.md`。
  - 创建用户私有 `DesignTemplatePack`。
  - 自动选中新导入模板。
  - 使用该模板创建 design job。
  - 通过 job snapshot 验证 `designTemplatePacks` 和 variation assignment 均指向该私有模板。
- 首页导入成功后自动切换到 template pack 模式，并将新模板设为唯一选中模板，减少用户导入后忘记选择的误操作。
- CAP-7 中 `DESIGN.md -> 私有模板 -> 生成` 的 E2E 门禁已标记完成。

### 验证

- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts -g "import DESIGN.md"`
- `npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts -g "capability distribution|import DESIGN.md"`

### 后续关注

- 继续补 `选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot` 的专门 E2E。
- 结果页/详情页后续可显式展示本次使用的 Design Template Pack 名称，避免用户只能从 API snapshot 验证。

## 2026-07-03 CAP-M5 User-Facing Capability Library

### 已完成

- 用户前端接入 Design Template Pack 库：
  - 官方模板。
  - 我的模板。
  - 最近使用。
  - 收藏。
- 模板卡片展示能力治理需要的核心摘要：
  - color swatch。
  - display/body 字体摘要。
  - rationale / 适用场景。
  - preview artifact 状态。
- 用户私有模板入口接入 `DESIGN.md` import：
  - 前端支持粘贴 `DESIGN.md` 内容。
  - 调用 `POST /api/design-templates/import-design-md`。
  - import 成功后刷新模板库并自动选中新模板。
- Job 创建接入 Design Template Pack 选择：
  - `capabilityRequirements.template.designTemplatePackIds`。
  - `capabilityRequirements.template.autoDistributeTemplatePacks`。
- 用户端插件入口接入 Capability Plugin / Design Skill / MCP Tool Binding registry：
  - MVP 只展示官方 active plugin。
  - skill 写入 `capabilityRequirements.plugins.skillIds`。
  - MCP tool binding 写入 `capabilityRequirements.plugins.mcpToolBindingIds`，仍保持 `policy_only` 治理语义。
  - 插件卡展示类型、scope、规则摘要和安全等级。
- 用户偏好入口扩展：
  - 默认 Design Template Pack。
  - 默认 skill。
  - 默认 loop。
  - 色板、参考品牌、负面要求等高级约束。
- 单变体页接入保存当前版本为模板：
  - 调用 `POST /api/variations/:id/save-template`。
  - 保持来源 artifact/version 由后端记录。

### 验证

- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e`

### 决策

- 用户端负责选择和展示能力，不在浏览器侧拼接 BabeL-O 私有 prompt。
- Capability 选择继续通过 Application Service 授权和快照化，再由 Runtime Gateway 编译为受控 prompt/tool policy。
- `DESIGN.md` 是导入格式，DUDesign 内部仍以 `DesignTemplatePack` 作为稳定契约。

### 后续关注

- CAP-7 仍需补专门 E2E：
  - 上传或粘贴 `DESIGN.md` -> 保存私有模板 -> 用该模板生成。
  - 选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- Runtime Gateway golden 仍需覆盖 safe skill 选择后的 prompt block 和 tool policy。
- 管理端 Capability Governance 仍未实现，后续需要展示模板、skill、MCP policy 和 usage events。

## 2026-06-29 TPL-M0 Template & Skill Module Planning

### 背景

- 产品需要提供官方模板，帮助用户更快生成规范、多样的设计方案。
- 产品也需要允许用户保存自己的模板和设计偏好，降低重复 prompt 成本。
- Skill 能力需要谨慎设计：它应该表达设计规则和工作方法，而不是执行任意代码。

### 已完成

- 新建独立模块：
  - `docs/modules/template-skill-system/README.md`
  - `docs/modules/template-skill-system/TODO.md`
  - `docs/modules/template-skill-system/WORKLOG.md`
- 明确 Template & Skill System 是跨层产品能力模块，不是新增第五层架构。
- 明确 MVP 阶段 skill 只支持声明式规则，不支持可执行插件。
- 明确模板/skill 必须通过 Application Service 授权，再由 Runtime Gateway 编译成受控 prompt context。
- 明确用户模板偏好与 memory 的关系：
  - 显式选择优先于偏好。
  - 偏好优先于 memory 推断。
  - memory 只能作为提示，不能作为事实来源。

### 决策

- 官方模板必须版本化，避免旧 session resume 时语义漂移。
- 用户模板默认 `private`，后续团队协作阶段再扩展 workspace/team visibility。
- 用户 skill 不允许直接控制 runtime cwd、工具权限、BabeL-O 私有参数或文件系统路径。
- 保存 variation 为模板时必须记录来源 artifact id/version，避免 refine 后模板来源漂移。

## 2026-06-30 CAP-M1 Capability Distribution Rename And Split

### 背景

- 重新梳理后，原 Template & Skill System 概念仍然偏窄。
- 新规划将能力分发拆为：
  - 模板：领域模板、审美偏好、颜色方案、品牌/IP 风格。
  - 插件：Skill、MCP tool、权限策略、工具 scope。
  - 自动化 loop：生成、调试、验证、修复、再验证。

### 已完成

- 将模块从 Template & Skill System 重命名为 Capability Distribution System。
- 将目录迁移为：
  - `docs/modules/capability-distribution/README.md`
  - `docs/modules/capability-distribution/TODO.md`
  - `docs/modules/capability-distribution/WORKLOG.md`
- 新增三个子模块文档：
  - `templates.md`
  - `plugins.md`
  - `automation-loop.md`
- 在 `docs/modules/README.md` 中更新模块名称和引用。
- 在 `docs/online-design-platform-plan.md` 中更新能力分发章节。

### 决策

- Capability Distribution System 仍不是第五层架构，而是跨四层的产品能力治理模块。
- Templates 决定领域、结构、审美和颜色方案。
- Plugins 决定可用 skill、MCP 工具和权限策略。
- Automation Loop 决定如何自动修正、调试、验证和停止。
- 三个子模块都必须通过 Application Service 授权，并由 Runtime Gateway 做最终安全编译。

### 下一步

- 设计首批领域模板和审美 profile registry。
- 设计插件权限策略和 MCP tool binding schema。
- 设计 automation loop profile 和 loop event contract。

## 2026-06-30 CAP-M2 Official Capability Registry And Job Snapshot

### 已完成

- contracts 新增能力分发最小契约：
  - `DomainTemplate`
  - `AestheticProfile`
  - `ColorPalette`
  - `AutomationLoopProfile`
  - `CapabilityRequirements`
  - `CapabilitySnapshot`
  - `ListCapabilitiesResponse`
- API 新增官方 registry：
  - 6 个领域模板。
  - 4 个审美 profile。
  - 4 个颜色方案。
  - 3 个 loop profile：fast、standard、deep repair。
- API 新增 `GET /api/capabilities`。
- `POST /api/design-jobs` 支持 `capabilityRequirements`。
- 创建 job 时将 resolved `capabilitySnapshot` 写入：
  - session message metadata。
  - job `templateRequirements.capabilitySnapshot`。
  - runtime spawn input。
- Runtime Gateway 将 capability snapshot 编译为 prompt block：
  - domain context。
  - recommended sections。
  - aesthetic context。
  - color palette usage。
  - automation loop preference。
- 用户端 API client 新增 `getCapabilities()`。
- API flow smoke 覆盖：
  - capabilities registry 可读取。
  - 用官方模板创建 job。
  - job snapshot 保存 domain/aesthetic/palette/loop 选择。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/runtime-gateway run test`

### 决策

- MVP 先使用官方 registry + job snapshot，不立即引入 PostgreSQL migration。
- 旧的无 capability 请求继续兼容，系统使用默认 domain/aesthetic/palette/loop。
- capability snapshot 仍复用 `templateRequirements` 持久化入口，后续 schema 稳定后再迁移到独立表或独立 `capability_requirements` 字段。

### 下一步

- 将工作台 composer 接入 `GET /api/capabilities`，支持用户选择领域模板、审美 profile 和颜色方案。
- 设计插件权限策略和 MCP tool binding schema。
- 将 automation loop profile 从 snapshot 升级为可执行 loop plan。

## 2026-07-01 CAP-M3 Template IA Consolidation

### 背景

- 当前用户端模板菜单将 `Styles / Domain / Aesthetic / Palette` 并列展示。
- 从用户心智看，这四项都会被理解为“风格”，其中：
  - `Styles` 与 `Aesthetic` 重叠。
  - `Palette` 是视觉风格的高级覆盖项，不应与场景并列。
  - `Premium Product Page` 这类条目混合了页面场景、视觉气质和品牌参考。

### 已完成

- 将模板产品信息架构明确为三层：
  - 场景：用户要做什么类型的网站或页面。
  - 视觉：用户希望页面呈现什么视觉气质。
  - 高级：色板、补充风格词、参考品牌、负面要求。
- 更新 `templates.md`：
  - 明确 UI label 建议：`Scene / Visual / Advanced`。
  - 明确底层契约仍保留 `DomainTemplate / AestheticProfile / ColorPalette`。
  - 新增 `BrandStyleReference` 草案。
  - 明确参考品牌只能作为 inspiration，不得复制品牌资产、文案、商标或造成官方背书误解。
- 更新 `README.md` 和 `TODO.md`，将后续前端接入任务调整为“场景 / 视觉 / 高级”。

### 决策

- 产品展示层不再使用“风格 / 领域 / 审美 / 配色”四个并列入口。
- 工程契约层暂不重命名已落地字段，避免破坏 `capabilitySnapshot`、用户偏好和 runtime prompt 编译。
- `ColorPalette` 作为 `AestheticProfile` 的高级覆盖项展示。
- 自由 `Styles` 输入改为高级入口内的补充风格词，不进入官方 registry。
- `BrandStyleReference` 是后续扩展项，必须带有 `inspiration_only` 和 forbidden rules。

### 下一步

- 更新用户前端工作台 composer：
  - `Domain` 改为 `Scene`。
  - `Aesthetic` 改为 `Visual`。
  - `Palette` 和 `Styles` 移入 `Advanced`。
  - 预留参考品牌和负面要求字段。
- 梳理官方 registry，将混合场景/视觉/品牌参考的条目拆分。

## 2026-07-01 CAP-M3.1 Open Design Reference Mapping

### 背景

- 参考 `/Users/tangyaoyue/DEV/open-design` 的模板、设计系统和前端选择器实现，重新校准 DUDesign 的模板 UI 规划。
- Open Design 的价值不在于“更多模板分类”，而在于把生成能力拆成多个独立平面：
  - Mode / Surface。
  - Scenario。
  - Design System。
  - Skill / Design Template。
  - Prompt Template Gallery。

### 已完成

- 在 `templates.md` 新增 Open Design 参考映射。
- 明确 DUDesign 短期仍采用“场景 / 视觉 / 高级”。
- 明确中期应预留 Open Design 式 Design System 能力，用于承载品牌 token、组件、排版、动效、语气和反模式。
- 将 Open Design `template.json` 的字段纳入后续 `AestheticProfile` 扩展参考：
  - `mood`
  - `occasion`
  - `tone`
  - `formality`
  - `density`
  - `palette`
  - `typography`
  - `best_for`
  - `avoid_for`
- 将前端选择器建议写入文档：
  - 单个“设计方向”选择器。
  - 内部 tabs：场景、视觉、高级。
  - 搜索、分类、右侧详情预览。

### 决策

- 不把 Open Design 的 `Design System` 直接等同于 DUDesign 当前的 `BrandStyleReference`。
- `BrandStyleReference` 是高级入口中的轻量 inspiration-only 参考。
- `DesignSystem` 是中期更完整的品牌契约能力，未来可以从已有 HTML、用户上传素材或历史 variation 中提取。
- Prompt Template Gallery 应定位为灵感库/brief starter，不进入正式 capability snapshot，除非用户显式选择保存为模板。

### 下一步

- 用户前端先做轻量 `DesignDirectionPicker`。
- 后端 registry 后续扩展视觉 profile 元数据。
- 中期新增 Design System 文档和数据模型时，再决定是否从 Capability Distribution 中拆成独立子模块。

## 2026-07-01 CAP-M3.2 Design Direction Picker Implementation

### 已完成

- 用户端首页 composer 将原 `Styles / Domain / Aesthetic / Palette` 并列入口替换为单个 Design Direction 入口。
- Design Direction 内部 tabs：
  - Scene。
  - Visual。
  - Advanced。
- Advanced 已承载：
  - Palette。
  - Style notes。
  - Reference brand。
  - Negative requirements。
- 参考品牌和负面要求复用现有 `templateRequirements.notes`，避免新增后端契约。
- Runtime Gateway 将 `templateRequirements.notes` 注入 variation runtime prompt，确保高级约束进入实际生成上下文。

### 决策

- 本阶段只做前端信息架构和 runtime prompt 闭环。
- `BrandStyleReference`、`DesignSystem`、视觉 profile 扩展字段暂不进入代码模型，继续按 TODO 推进。
- 旧 `DomainTemplate / AestheticProfile / ColorPalette` 契约保持不变，确保历史 job snapshot 和用户偏好兼容。

### 下一步

- 增加 runtime-gateway 单测覆盖 `templateRequirements.notes` 注入。
- 扩展 registry 元数据后，再升级视觉卡片内容。

## 2026-07-01 CAP-M3.3 DESIGN.md Ecosystem Reference

### 背景

- 调研 `google-labs-code/design.md`：
  - 重点是 DESIGN.md 规范、lint、diff、export 和 token/prose 双层结构。
  - YAML front matter 存机器可读 token。
  - Markdown 正文存设计意图、组件规则和 Do / Don't。
- 调研 `VoltAgent/awesome-design-md`：
  - 重点是大量品牌设计系统样例的组织方式。
  - 对 DUDesign 的价值是模板库分发、分类和预览方式，而不是直接复制品牌视觉。

### 已完成

- 更新 `README.md`：
  - 增加 Design Template / Design Skill / Capability Profile 三分法。
  - 明确 `DESIGN.md` 是导入/导出兼容格式，不是 DUDesign 唯一内部格式。
  - 增加 `design_template_versions` 和 `capability_profiles` 数据对象建议。
- 更新 `templates.md`：
  - 增加 `DESIGN.md` 与 Template Pack 治理章节。
  - 定义 `DesignTemplatePack` 草案。
  - 明确官方模板应抽象为通用启发式模板，而不是品牌克隆。
  - 明确用户模板来源：上传 `DESIGN.md`、从已有 HTML/variation 提取、手动编辑。
  - 明确多 variation 可以按不同 template pack 自动分配。
- 更新 `plugins.md`：
  - 明确 Design Skill 与 Design Template 的边界。
  - Skill 管生成方法，Template 管视觉系统。
- 更新 `TODO.md`：
  - 增加 `DESIGN.md` import/lint/export。
  - 增加 Design Template Pack adapter。
  - 增加官方模板、用户模板、模板卡片、管理端 lint/diff/preview smoke 任务。
- 更新 `online-design-platform-plan.md`：
  - 将 `DESIGN.md` 生态启发写入总规划。

### 决策

- DUDesign 可以兼容 `DESIGN.md`，但内部必须保留 stable contract。
- 官方模板不能直接复制公开品牌名称、logo、专有字体、商标元素或明显 trade dress。
- 用户偏好只保存 template/skill/profile id；真实生成依据随 job snapshot 保存完整版本。
- 多变体生成应支持“单模板多方向”和“多模板分配”两种模式。

### 下一步

- 先做 `DesignTemplatePack` 文档定稿和 schema 单测。
- 再做 `DESIGN.md` import/lint 的后端基础能力。
- 然后补 6-8 个 DUDesign 官方启发式模板。

## 2026-07-01 CAP-M3.4 DesignTemplatePack Import Contract

### 已完成

- 在 `@dudesign/contracts` 增加内部稳定模板包契约：
  - `DesignTemplatePack`
  - `DesignTemplatePackImportResult`
  - `DesignTemplatePackLintFinding`
  - token、source、format、visibility、status、lint status 等枚举类型。
- 新增 API 层 `DESIGN.md` adapter：
  - 解析 YAML front matter。
  - 解析 Markdown `##` sections。
  - 规范化 colors、typography、spacing、rounded、components。
  - 保留 unknown sections，方便后续兼容外部扩展。
  - 生成稳定 `dtp_` id。
- 新增 lint 初版：
  - missing front matter。
  - invalid YAML。
  - duplicate section。
  - missing primary。
  - missing typography。
  - broken token reference。
  - component background/text contrast ratio。
  - dangerous instruction 过滤。
- 新增单元测试覆盖：
  - 正常 `DESIGN.md` 导入为 DUDesign Template Pack。
  - broken ref 和低对比 warning。
  - 越权/危险 prompt 指令拦截。
  - unknown section 保留。
- 增加 `yaml` 依赖，避免手写 YAML 缩进解析。
- 修复 InMemoryStore 最近 job/artifact 排序在同毫秒下不稳定的问题：
  - 增加 `compareRecent`，按 updatedAt、createdAt、id 兜底排序。
  - 防止新增测试改变执行顺序后 admin support smoke 偶发拿到错误 latest job。

### 决策

- `DESIGN.md` 只作为导入兼容格式，内部使用 `DesignTemplatePack` stable contract。
- `DESIGN.md` export 暂未实现，保留在 TODO 中后续补齐。
- Runtime Gateway 仍不直接读取用户上传 markdown；后续必须由 Application Service 解析、校验、授权和 snapshot 后再注入。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 下一步

- 增加 Design Template Pack 持久化表或 capability table。
- 增加 `POST /api/design-templates/import-design-md` 草案 API。
- 补 6-8 个 DUDesign 官方启发式模板 seed。

## 2026-07-01 CAP-M3.5 Template Contract Split

### 已完成

- 扩展 `@dudesign/contracts` 模板契约：
  - 新增 `BrandStyleReference`。
  - 新增 `AdvancedTemplateConstraints`。
  - 扩展 `AestheticProfile`：`mood`、`occasion`、`tone`、`formality`、`density`、`bestFor`、`avoidFor`。
  - `CapabilitySnapshot.template` 增加 `brandStyleReference`。
- 升级 capability schema 到 `2026-07-01.dudesign-capabilities.v2`。
- 拆分官方 registry 中混合品牌/视觉/场景的过渡条目：
  - `Apple-like Product Page` -> `Premium Product Page` 场景。
  - `Apple-like Minimal` -> `Premium Minimal` 视觉。
  - `Apple-inspired` 进入 `BrandStyleReference`，并补充 inspiration-only 和 forbidden rules。
- 新增官方品牌参考：
  - `Apple-inspired`
  - `Stripe-inspired`
  - `Linear-inspired`
- 用户端 Design Direction picker：
  - Visual 卡片展示 mood、density、formality、bestFor 摘要。
  - Advanced 增加官方 brand reference chips。
  - 色板、补充风格词、参考品牌、负面要求写入结构化 `advancedConstraints`。
  - 本地保存高级偏好，刷新后创建 job 不丢 brand reference。
- Runtime Gateway：
  - 将 `AdvancedTemplateConstraints` 编译为独立 prompt block。
  - `CapabilitySnapshot` 中的 `BrandStyleReference` 进入 runtime capability context。
- Job snapshot：
  - 继续把完整 `capabilitySnapshot` 写入 `templateRequirements`。
  - `CapabilitySummary` 显示 `Brand reference`，用于确认 resume/replay 不漂移。

### 决策

- 官方 registry 不再把品牌、场景、视觉混在同一个 `DomainTemplate` 名称里。
- 参考品牌必须是 inspiration-only 抽象约束，不作为品牌克隆模板。
- 高级偏好先做用户端 localStorage 持久化；后端用户偏好表暂不扩字段，避免引入数据库迁移。
- `BrandStyleReference` 进入 contracts/API/runtime，但“从 variation 保存私有模板”仍需要单独的用户模板存储/API/UI。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`
- `DUDESIGN_WEB_URL=http://localhost:3301 npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts`

### 下一步

- 进入 CAP-1 私有模板保存：
  - `POST /api/variations/:id/save-template` 或 `POST /api/design-templates/from-variation`。
  - 增加 `design_templates` / `design_template_versions` 存储。
  - 用户端 variation 页面增加“保存为模板”入口。
  - 模板选择器合并官方模板与用户私有模板。

## 2026-07-01 CAP-M3.6 DesignSystem Plan and Official Heuristic Templates

### 已完成

- 补齐中期 `DesignSystem` 能力规划：
  - Brand Tokens
  - Typography
  - Components
  - Motion
  - Voice
  - Anti-patterns
- 明确 `DesignSystem`、`DesignTemplatePack`、高级字段之间的层级：
  - 高级字段是一次 job 的轻量约束。
  - `DesignTemplatePack` 是可保存、可 import/export 的模板资产。
  - `DesignSystem` 是长期可复用、可治理、可版本化的品牌/产品设计系统。
- 新增 `exportDesignTemplatePackToDesignMd`：
  - 将 DUDesign stable `DesignTemplatePack` 导出为 `DESIGN.md` front matter + Markdown sections。
  - 支持 colors、typography、spacing、rounded、components。
  - 支持 Overview、Colors、Typography、Layout、Elevation、Shapes、Components、Do's and Don'ts 以及 unknown sections。
- 新增 8 个 DUDesign 官方启发式模板 seed：
  - Premium Product Launch
  - Trust-Centered Fintech
  - Editorial Creative Portfolio
  - Enterprise Clarity
  - Mobility Launch
  - Developer Workflow
  - Warm Commerce
  - Data-Dense Operations
- 新增单元测试：
  - `DesignTemplatePack -> DESIGN.md -> DesignTemplatePack` round-trip。
  - 官方模板数量限制为 6-8 个。
  - 官方模板不包含公开品牌名称。
  - 官方模板必须带有反克隆约束。
  - 官方模板都能 export/import 为有效 `DESIGN.md`。

### 决策

- 官方模板使用通用场景/产品语言，不使用公开品牌名称作为模板身份。
- 公开品牌只能作为 inspiration-only `BrandStyleReference` 或用户高级约束，不进入官方模板 seed 名称。
- 官方模板必须通过 lint/export/import round-trip，再进入用户端可选 UI。
- `DesignSystem` 暂不直接进入数据库模型；下一步先完善私有模板保存和 Template Pack 持久化。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 下一步

- 增加 `design_templates` / `design_template_versions` 存储。
- 增加 `POST /api/design-templates/import-design-md` 和 `POST /api/design-templates/from-variation`。
- 将官方 Template Pack seed 接入 capability listing 或独立 template listing API。
- 用户端模板选择器合并官方模板、用户私有模板和当前轻量 Scene / Visual / Advanced 选择。

## 2026-07-01 CAP-M3.7 Private Templates and Template Pack Snapshot

### 已完成

- 新增用户私有模板 API MVP：
  - `GET /api/design-templates`
  - `POST /api/design-templates/import-design-md`
  - `POST /api/variations/:id/save-template`
- `DESIGN.md` 上传/粘贴导入：
  - 继续复用 `importDesignMd` lint。
  - 导入结果保存为 `source=user`、`visibility=private`、`status=published` 的 `DesignTemplatePack`。
  - 私有模板按 `createdByUserId` 隔离。
- 从 variation 保存私有模板：
  - 使用当前 variation 已分配的 `DesignTemplatePack` 作为基础。
  - 将当前 artifact 写入 `previewArtifactId`。
  - 如果没有已分配模板，则生成 fallback private pack。
- 多 variation 自动分配：
  - 创建 job 时解析显式 `designTemplatePackIds`。
  - 当 `autoDistributeTemplatePacks=true` 或未显式选择模板时，从官方/用户模板 registry 补足 variation 数量。
  - 每个 variation 保存 `{ variationIndex, designTemplatePackId, designTemplatePack }` assignment。
- Snapshot 不漂移：
  - `templateRequirements.designTemplatePacks` 保存完整 pack snapshot。
  - `templateRequirements.variationTemplateAssignments` 保存每个 variation 的 pack snapshot。
  - `GET /api/design-jobs/:id` 和 `GET /api/variations/:id` 返回固定 snapshot，不依赖 registry latest。
- Runtime Gateway：
  - 将当前 variation 分配到的 Template Pack 编译进 BabeL-O prompt。
  - Prompt 只传摘要化 token、rationale、dos/donts，避免泄露无关内部对象。
- API smoke：
  - 覆盖导入私有 `DESIGN.md` 模板。
  - 覆盖 3 variation 自动分配不同 Template Pack。
  - 覆盖 job snapshot 中的 template assignment 不漂移。
  - 覆盖从 variation 保存私有模板。

### 决策

- 本阶段先做 API + InMemoryRepository MVP，确保产品语义跑通。
- Postgres 真实持久化表仍作为后续 M：需要新增 `design_templates` / `design_template_versions` migration。
- 用户端 UI 暂未接入保存/导入按钮；后续需要接入模板选择器和 variation 页保存入口。
- Runtime 只消费标准化后的 Template Pack snapshot，不直接读取用户原始 `DESIGN.md`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test -- designTemplatePack.test.js officialDesignTemplatePacks.test.js mock-flow.test.js`

说明：本次曾启动一次完整 `npm --workspace @dudesign/api run test`，但环境中已有另一个旧的 `babel-runtime-api-flow.test.js` 进程挂起；为避免混淆，已停止本次完整测试并改跑相关测试集。

### 下一步

- 增加 Postgres `design_templates` / `design_template_versions` migration 与 repository 实现。
- 用户端接入：
  - 设计首页模板选择器读取 `GET /api/design-templates`。
  - Advanced/Template Pack 选择写入 `designTemplatePackIds`。
  - Variation 页增加“保存为模板”入口。
  - DESIGN.md 粘贴/上传入口。
- 增加 resume/regression 测试：registry 中模板被修改后，旧 job 仍使用 job snapshot。

## 2026-07-01 CAP-2.1 Plugin Registry and Runtime Policy

### 已完成

- 扩展 contracts：
  - `CapabilityPlugin`
  - `DesignSkill`
  - `McpToolBinding`
  - `PluginPermissionPolicy`
  - `CapabilityPluginSnapshot`
- 新增官方 CAP-2 registry seed：
  - `Static Export Safe`
  - `Mobile-first Landing`
  - `Accessibility First`
  - `Asset Library Readonly`
  - `Accessibility Validate`
- 明确 MVP 安全边界：
  - Skill 只允许声明式规则、prompt block、负向规则和 checklist。
  - Skill 不允许 shell、安装命令、绝对路径、runtime/system override。
  - MCP tool binding MVP 只允许 `readonly_context`、`asset_readonly`、`validation_only`。
  - `artifact_write` 和 `external_network` 暂不开放。
- Application Service / capability resolver：
  - 校验 skill / MCP id 是否存在。
  - 校验插件 active / safety 状态。
  - 校验 template category 适配范围。
  - 生成 `plugins.pluginSnapshot` 并写入 job capability snapshot。
- Runtime Gateway：
  - 将 selected skills 编译为 `DUDesign plugin context` prompt block。
  - 将 MCP binding 编译为 `toolPolicy`，以 `policy_only` 形式传给 runtime。
  - 明确插件不能覆盖 runtime guardrails、workspace path、model choice 和 artifact 输出要求。
- API smoke：
  - job 创建时选择 `sk_static_export_safe`、`sk_accessibility_first`、`mcp_accessibility_validate`。
  - job snapshot 保留完整 plugin snapshot 和 tool policy。

### 决策

- CAP-2 第一版只做声明式 plugin，不做任意代码插件。
- MCP 当前只做 tool policy 编译，不在 DUDesign API 层直接执行外部 MCP 调用。
- `CapabilityProfile` 先内嵌在 job `CapabilitySnapshot`，暂不新增持久化 profile table。
- 管理端 skill/MCP 治理和用户自定义 skill 留到后续阶段。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- capabilities.test.js mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- 用户端 composer 增加插件/skill 选择入口。
- 管理端增加官方 skill/MCP registry 管理页。
- 增加真实 MCP authorization / audit 记录。
- 增加 plugin usage events，用于统计采用率、失败率和成本。

## 2026-07-01 CAP-3.1 Automation Loop Planning and Test Baseline

### 已完成

- 系统梳理 CAP-3 与 BabeL-O 的测试关系：
  - Loop profile、stop condition、event contract、quality gate、repair prompt builder 属于 DUDesign 后端服务层，可用 mock runtime 测试。
  - 真实 refine 修复、BabeL-O event drift、runtime unavailable、resume 需要 staging BabeL-O smoke。
- 重写 `automation-loop.md` 为可开发规格：
  - 定义 `fast / standard / deep repair` 目标配置。
  - 定义 stop conditions：
    - max attempts
    - max cost
    - max duration
    - quality pass/fail
    - runtime unavailable
    - contract mismatch
    - repeated failure
    - cancelled
  - 定义 loop event contract 草案：
    - `design.loop_started`
    - `design.loop_quality_checked`
    - `design.loop_repair_planned`
    - `design.loop_repair_started`
    - `design.loop_completed`
    - `design.loop_stopped`
  - 定义最小自动修复 prompt 模板。
  - 定义 mock integration、Runtime Gateway contract、BabeL-O staging smoke 测试矩阵。
- 明确现有可复用底座：
  - `AutomationLoopProfile` 初版。
  - 静态 artifact quality gate。
  - 可选 Playwright pixel gate。
  - `design.runtime_warning` artifact quality warning。
  - `refineVariation` current artifact context。
  - 事件持久化和 SSE replay。

### 决策

- CAP-3 不应把所有测试绑定真实 BabeL-O；默认 CI 先使用 unit/mock/contract。
- BabeL-O staging smoke 是上线门禁，不作为默认本地测试。
- MVP 先实现 `maxRepairAttempts`、`maxDurationMs`、`quality pass/fail`、`runtime unavailable`；`maxCostCents` 先预留，待真实计费稳定后启用硬门禁。
- Pixel gate 应由 loop profile 控制，后续逐步替代纯 env 开关。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- runtime-unavailable.test.js babel-runtime-api-flow.test.js designJobEvents.test.js mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- CAP-3.2：扩展 `AutomationLoopProfile` contract，加入 `maxCostCents`、`maxDurationMs`、`repairStrategy`。
- CAP-3.2：实现 stop condition evaluator 和 user-facing stop reason mapper。
- CAP-3.2：将 loop event contract 写入 `packages/contracts/src/events.ts`。
- CAP-3.3：实现 mock runtime repair loop：static fail -> repair -> pass / stopped。

## 2026-07-01 CAP-3.2 Loop Domain Contract and Stop Conditions

### 已完成

- 扩展 `AutomationLoopProfile`：
  - `maxCostCents`
  - `maxDurationMs`
  - `repairStrategy`
- 更新官方 loop profile：
  - `loop_fast`：不自动修复，120s，静态 gate。
  - `loop_standard`：1 次 minimal refine，200 cents，300s，静态 gate。
  - `loop_deep_repair`：2 次 deep refine，500 cents，720s，pixel gate。
- 扩展 `CapabilitySnapshot.automation`：
  - 保存 `maxRepairAttempts`
  - 保存 `maxCostCents`
  - 保存 `maxDurationMs`
- 新增 DUDesign loop event contract：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - `design.loop_completed`
  - `design.loop_stopped`
- 新增 `automationLoop.ts`：
  - `evaluateAutomationLoopStop`
  - `automationLoopUserMessage`
  - `automationIssueFingerprint`
  - `buildAutomationRepairPrompt`
- 覆盖 stop conditions：
  - quality pass
  - max attempts
  - max cost
  - max duration
  - runtime unavailable
  - runtime contract mismatch
  - repeated failure
  - cancelled
- 新增单元测试：
  - loop profile 默认字段。
  - loop override clamp。
  - stop condition evaluator。
  - user-facing reason mapper。
  - minimal repair prompt builder。

### 决策

- 本阶段只落 domain/evaluator/event contract，不自动触发 refine。
- `maxCostCents` 现在进入 snapshot 和 evaluator，真实费用硬门禁后续接 usage/cost 数据。
- repair prompt builder 只生成受控修复请求，不允许 shell、安装命令、绝对路径或外部依赖。
- `quality_passed` 作为 stop reason 保留在 evaluator，但 loop event 中会映射为 `design.loop_completed`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/capabilities.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 补充修复

- `apiFlowSmoke` 关闭测试 harness 时同步关闭 pooled Chromium browser，避免 mock API flow 输出全绿后因为浏览器池 handle 未释放而悬挂。

### 下一步

- CAP-3.3：生成后发布 loop events。
- CAP-3.3：standard loop 自动调用一次 refine repair。
- CAP-3.3：mock runtime 覆盖 static fail -> repair -> pass / stopped。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。

## 2026-07-01 CAP-3.3 Automation Loop Events and Static Gate Planning

### 已完成

- 将生成后的 HTML artifact 质量检查接入 Automation Loop：
  - runtime HTML artifact。
  - runtime workspace artifact。
- 生成后发布标准 loop events：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_completed`
  - `design.loop_stopped`
  - `design.loop_repair_planned`
- `loop_standard` 在质量未通过且仍有修复次数时，会生成最小自动修复 prompt preview，并发布 `design.loop_repair_planned`。
- job event persistence / SSE replay 已覆盖 loop events，刷新或重连后仍能看到自动化状态。
- mock API flow 更新：
  - 兼容 workspace membership guard 返回 `WORKSPACE_FORBIDDEN`。
  - support failure smoke 使用微小时间间隔避免 latest job 排序同毫秒抖动。

### 决策

- 本阶段只做 loop eventization 和 repair planning，不自动调用 runtime refine。
- loop events 作为 job event 旁路持久化，不改变 variation/job 的完成状态。
- `quality_passed` 映射为 `design.loop_completed`；质量失败但未触发修复时映射为 `design.loop_stopped`。
- `design.loop_repair_planned` 的 prompt 只暴露 preview，供后续 worker/refine 执行阶段消费。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`

### 下一步

- CAP-3.3：standard loop 自动调用一次 refine repair，并发布 `design.loop_repair_started`。
- CAP-3.3：mock runtime 覆盖 static fail -> repair -> pass / max attempts stopped。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。

## 2026-07-01 CAP-3.3 Standard Loop Automatic Repair

### 已完成

- `loop_standard` 在质量检查失败且仍有修复次数时，自动执行一次 runtime refine repair。
- 发布完整自动修复事件链：
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - runtime `design.variation_streaming`
  - runtime `design.variation_completed`
  - 新 artifact 的 `design.loop_quality_checked`
  - 新 artifact 通过时 `design.loop_completed`
- 自动修复使用内部 system message 记录，不伪装成用户手动 prompt。
- 自动修复复用当前 variation runtime session、当前 artifact HTML、workspace root、model context。
- 通过 artifact version 作为 attempts 边界，避免 standard loop 在同一任务中无限递归。
- mock runtime 测试覆盖 `static fail -> automatic repair -> pass`，并断言 current artifact 升级到 v2。

### 决策

- MVP 先以内联后台任务执行 automatic repair，不新增队列表；后续 Queue/Redis worker 化时可把同一逻辑迁移到 worker。
- 自动 repair 不改变 job completed 的定义；它通过 artifact、variation current version 和 loop events 表达修复结果。
- runtime 异常会发布 `design.loop_stopped`，reason 为 `runtime_unavailable`，当前 artifact 保留。
- `deep_repair` 暂不增加更多策略差异；先复用 attempts/quality gate 决策，后续再扩展。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- CAP-3.3：补 max attempts stopped 的 mock test。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。
- 后端服务层：将 automatic repair 从 inline background task 迁移到 queue worker，支持恢复、限流和观测。

## 2026-07-01 CAP-3.4 Max Attempts and Profile-Controlled Pixel Gate

### 已完成

- 补充 mock integration：`static fail -> automatic repair -> fail -> max_attempts_reached`。
- 验证 standard loop 只启动一次 automatic repair，不会继续递归。
- 验证修复失败后保留 v2 artifact，并发布 `design.loop_stopped`：
  - `reason = max_attempts_reached`
  - `attempts = 1`
- Artifact quality gate 改为优先读取 job capability snapshot：
  - `loop_standard` 使用 static gate。
  - `loop_deep_repair` 通过 `enablePixelGate=true` / `qualityGate=pixel` 启用 pixel gate。
  - 没有 job/capability snapshot 的路径继续使用 `DUDESIGN_ARTIFACT_PIXEL_GATE` env fallback。

### 决策

- Pixel gate 的产品开关归属 CAP-3 loop profile，不再只依赖进程环境变量。
- `DUDESIGN_ARTIFACT_PIXEL_GATE` 保留为无 job 上下文或运维强制开启的 fallback。
- 当前 pixel gate 仍复用现有 Playwright screenshot / pixel analysis；后续可以继续增加更细的视觉规则和阈值配置。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- 后端服务层：将 automatic repair 从 inline background task 迁移到 queue worker。
- 前端交互层：在 job/variation 页面展示 loop event timeline、repair attempt 和 stopped reason。
- Runtime Compatibility：真实 BabeL-O staging smoke 覆盖 automatic refine repair。

## 2026-07-01 CAP-3.5 Queue-backed Automatic Repair

### 已完成

- 将 Automation Loop automatic repair 从 inline background task 迁移到 `refine_job` queue worker。
- 扩展 `RefineJobQueuePayload`，支持：
  - `prompt`
  - `annotationPromptSuffix`
  - `deviceContext`
  - `source = automation_loop | manual`
  - `attempt`
- `processQueuedRefineJob()` 从 501 占位变为真实执行路径：
  - 校验 job/session/workspace/variation/artifact 归属。
  - 读取 base HTML artifact。
  - 调用 runtime `refineVariation()`。
  - 应用并持久化标准 runtime events。
- Automation Loop 在 `design.loop_repair_planned` 后只 enqueue repair，不直接调用 runtime。
- worker 消费 repair 时发布 `design.loop_repair_started`，runtime 不可用时发布 `design.loop_stopped`。
- 自动修复队列使用稳定幂等键：
  - `queue:refine:automation-loop:{artifactId}:attempt:{attempt}`
- `flushBackgroundTasks()` 更新为循环 flush queue/background tasks，确保后台 task 入队的新任务也会在测试和 smoke 中完成。
- 补充 runtime unavailable 回归测试：
  - 初始 artifact 质量失败后成功 enqueue automatic repair。
  - worker 消费 repair 时 runtime refine 抛错。
  - 发布 `design.loop_stopped`，`reason = runtime_unavailable`。
  - 对应 `refine_job` queue state 标记为 `failed`。
  - current artifact 保持在原始版本，不产生漂移。

### 决策

- 用户手动 refine API 暂时保持同步执行，避免在本阶段同时改造前端交互和用户等待语义。
- Automation repair 先复用 `refine_job` 队列，不新增单独 `automation_repair_job` 类型；后续如果需要更细 observability，再拆分 job kind。
- `design.loop_repair_started` 表示 worker 开始消费，而不是 planner 入队成功。
- 队列 payload 中只保存执行上下文，业务事实仍以 job/variation/artifact/event 为准。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/designJobQueue.test.js apps/api/dist/designJobWorker.test.js apps/api/dist/mock-flow.test.js apps/api/dist/redisDesignJobQueue.test.js`

### 下一步

- 后端服务层：将手动 refine API 也可选切到 queue-backed 模式，用于长任务和跨进程 worker。
- Runtime Compatibility：真实 BabeL-O staging smoke 覆盖 automatic refine repair。
- 后端服务层：Redis worker staging smoke 覆盖 automatic repair failed/completed 两条路径。
- 前端交互层：展示 loop timeline、repair queue status、stopped reason。

## 2026-07-02 CAP-4 Design Template Persistence and Capability Governance Events

### 已完成

- 新增 PostgreSQL migration `0010_design_templates.sql`：
  - `design_templates`
  - `design_template_versions`
  - `user_preferences` 扩展字段
  - `usage_events.kind` capability 事件扩展
- `ApplicationRepository` 增加模板版本 lookup：
  - `getDesignTemplatePackVersion(templateId, version, userId, workspaceId)`
- `InMemoryStore` 增加不可变模板版本缓存：
  - 当前模板保存在 `designTemplatePacks`
  - 历史版本保存在 `designTemplatePackVersions`
  - 同一 `templateId/version` 不覆盖历史内容
- `PostgresRepository` 实现 SQL-native 模板读写：
  - 官方模板 seed 入库
  - list/get 通过 SQL 权限过滤，不依赖 hydrate cache
  - save 写当前模板，并为新 version 写入 `design_template_versions`
  - version lookup 支持 no-hydrate production mode
- 官方模板与用户私有模板合并读取保持稳定排序：
  - official 在前
  - user/private 在后
  - sort_key/name/id 稳定排序
- 用户私有模板权限隔离：
  - owner 可读
  - 其它用户不可读 private template
  - workspace template 预留 workspace_id 过滤
- job snapshot 显式保存：
  - `capabilityProfileVersion`
  - `designTemplatePackVersions`
- capability usage events 接入：
  - `capability.template.selected`
  - `capability.plugin.selected`
  - `capability.preference.updated`
- 用户偏好扩展保存：
  - 默认 Design Template Pack
  - 默认 skill
  - 默认 MCP tool
  - brand style reference
  - advanced constraints

### 决策

- 本阶段不新增单独 `capability_profiles` 表，先在 job snapshot 中显式保存 profile version，满足 resume 不漂移。
- `DesignTemplatePack` API contract 暂保持前端兼容，版本历史由 repository/table 管理。
- capability usage events 复用 `usage_events`，成本为 0，用于治理统计和后续管理端分析。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/capabilities.test.js apps/api/dist/designTemplatePack.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/apiFlowSmoke.test.js apps/api/dist/postgresRepository.test.js`
- 真实 PostgreSQL opt-in：
  - 临时端口：`55432`
  - `DUDESIGN_POSTGRES_TEST_URL=postgresql://127.0.0.1:55432/dudesign_test`
  - `node --test --test-concurrency=1 apps/api/dist/postgresRepository.test.js apps/api/dist/postgres-api-flow.test.js`
  - 覆盖 migration、hydrate、production no-hydrate API flow、多用户隔离、私有模板隔离、版本 lookup 和 capability usage events。

> 本轮使用本机临时 PostgreSQL 实例完成 opt-in 验证；测试后已停止并清理临时数据目录。

### 下一步

- 管理端治理：展示模板版本、usage 统计和 lint/drift 状态。
- 用户前端：官方模板 / 我的模板 / 最近使用 / 收藏入口。
- PostgreSQL 真实环境：后续在 CI/staging 增加固定 opt-in job，避免本地手动验证成为唯一门禁。

## 2026-07-03 CAP-5/6 Loop Activity and Dynamic Encyclopedia Template Pack

### 已完成

- 用户端 Activity Stream 接入 automation loop 标准事件：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - `design.loop_completed`
  - `design.loop_stopped`
- Activity Stream 现在展示 loop 检查、质量结果、自动修复计划、修复开始、完成和停止原因。
- 直接参考 `/Users/tangyaoyue/DEV/open-design` 的模板资产结构：
  - `plugins/_official/*-templates/*/template.json`
  - `design-systems/<id>/manifest.json`
  - `design-systems/<id>/DESIGN.md`
  - `design-systems/<id>/design-tokens.json` / `tokens.css`
  - DUDesign 保持模板治理与 skill/plugin 治理分离，但模板字段、资产包组织和中期 Design System 规划直接对齐上述资产形态。
- 新增官方业务模板包：
  - `dtp_dynamic_encyclopedia_card`
  - 名称：`Dynamic Encyclopedia Entry Card`
  - 定位：动态百科词条卡片模板包，后续可继续拆 summary、timeline、relation、comparison、expandable fact-card 等子模板。
- 模板包内固化首版基础约束：
  - 主色 `#6487FA`
  - 内容背景 `#FFFFFF` / `#F8F8F8`
  - 文本色 `#1E1F24` / `#848691` / `#B7B9C1`
  - PC 固定 `788x492`
  - WISE 标准 `380x456`
  - WISE 兼容 `396x475` / `300x360`
  - 移动端 iframe / touch / scroll 交互约束
  - 避免视频、下载和跳链作为核心交互
- CAP-6 增加“管理业务模板包及其子模板”治理项。
- Runtime Gateway 的 `DesignTemplatePack` prompt block 已强化：
  - 输出 component token 详情，而不是只输出组件名。
  - 输出 `rationale.sections`，确保尺寸、滚动、iframe/touch 等业务约束能进入 BabeL-O 子 session prompt。

### 决策

- “动态百科词条卡片”先作为官方 Design Template Pack 根模板入库，不在本轮创建子模板表；子模板先记录在 pack rationale sections 中。
- 管理官方场景模板、视觉 profile、色板和参考品牌仍归 CAP-6/Admin Console 治理，不混入用户端 Activity Stream 改造。
- 官方模板数量上限从 8 放宽到 9，用于容纳第一个真实业务模板包。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/capabilities.test.js`
- `npm --workspace @dudesign/runtime-gateway test`

### 下一步

- 管理端治理：官方场景模板、视觉 profile、色板、参考品牌、Design Template Pack CRUD。
- 用户端：在模板选择器中强化官方模板 / 我的模板 / 业务模板包的分组展示。
- Runtime Gateway：继续把模板包 prompt block 纳入真实 BabeL-O golden event / prompt contract 回放。

## 2026-07-03 CAP-6 Template Governance Closure

### 已完成

- 新增管理端模板治理只读 API：
  - `GET /api/admin/capabilities/templates`
  - 返回官方模板、用户/工作区模板、业务模板包的治理摘要。
  - 返回 lint 状态、required actions、prompt block coverage 和子模板草案。
- 新增 CAP-6 模板治理 lint：
  - schema version。
  - official visibility/status。
  - primary/surface color token。
  - typography/component token。
  - negative rules / anti-clone trade dress guardrail。
  - `rationale.sections` 是否足以进入 runtime prompt block。
  - “动态百科词条卡片”专属检查：
    - PC `788x492`。
    - WISE `380x456`。
    - explicit `scroll-container`。
    - iframe/touchmove 兼容约束。
    - 子模板草案覆盖 summary/timeline/relation/comparison/expandable。
- “动态百科词条卡片”业务模板包子模板草案已结构化：
  - `summary-card`
  - `timeline-card`
  - `relation-card`
  - `comparison-card`
  - `expandable-fact-card`
- 管理端新增 `Templates` section：
  - 展示 total / official / business packs / lint warnings。
  - 展示 write mode、publish 权限、registry edit 权限。
  - 展示每个模板包的 lint、token 数、section 数、prompt block coverage 和子模板草案。

### 决策

- 用户前端模板列表保持当前页面形态，本阶段不推进：
  - 官方 / 我的 / 业务模板包 / 最近使用分组改造。
  - 业务模板包详情页。
  - 动态百科模板选择后的 composer summary 额外文案。
- CAP-6 当前先做只读治理面板和 lint，编辑 / 发布 / 禁用写操作后续单独做审计流，不在没有审核链路时直接开放。
- 子模板先作为业务模板包的草案 metadata/rationale 展示，后续当需要独立编辑、发布、统计时再拆成独立表。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/mock-flow.test.js apps/api/dist/officialDesignTemplatePacks.test.js`
- `npm --workspace @dudesign/admin run build`

### 下一步

- 管理端模板编辑 / 发布 / 禁用写操作：
  - developer 可编辑 registry 草案。
  - operator 可发布/禁用。
  - 所有写操作进入 audit log。
- 增加 CAP-6 source/license 字段的真实 schema，而不是仅 lint 预留。
- 将模板治理结果接入 staging smoke dashboard。

## 2026-07-03 CAP-6 Official Registry Governance

### 已完成

- 管理端 CAP-6 治理范围从 Design Template Pack 扩展到完整官方 registry：
  - 官方场景模板 / `DomainTemplate`
  - 官方视觉 profile / `AestheticProfile`
  - 官方色板 / `ColorPalette`
  - 官方参考品牌 / `BrandStyleReference`
  - 官方 Design Template Pack
  - 业务模板包 / `Business Template Package`
- `GET /api/admin/capabilities/templates` 新增：
  - `registryAssets`
  - `registryTotals`
- registry asset 统一治理字段：
  - `id`
  - `name`
  - `type`
  - `status`
  - `version`
  - `description`
  - `summary`
  - `requiredActions`
  - `linkedAssetIds`
- 管理端 `Templates` section 增加官方 registry 分组：
  - `Official Scene Templates`
  - `Official Visual Profiles`
  - `Official Palettes`
  - `Official Brand References`
  - `Official Design Template Packs`
  - `Business Template Packages`
- API smoke 增加断言，确保 CAP-6 返回至少一个 scene、visual、palette、brand reference，并能定位：
  - `tpl_fintech_trust`
  - `aes_trustworthy_saas`
  - `pal_blue_white_trust`
  - `brand_apple_inspired`

### 决策

- 本阶段“管理”定义为只读治理、lint、关联完整性和状态可视化。
- 编辑 / 发布 / 禁用仍保留为下一阶段写操作，不在本阶段混入，以免缺少 audit/approval 链路。
- 用户前端模板选择器继续保持当前 UI，不受 CAP-6 管理端治理扩展影响。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/admin run build`

## 2026-07-03 CAP-M8.3 Dynamic Encyclopedia Guidance Snapshot

### 已完成

- `POST /api/encyclopedia/entry-guidance` 输出动态百科 capability preset：
  - `tpl_dynamic_encyclopedia_entry`
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- guidance 结果返回动态百科 child template 推荐，并通过 `designTemplatePackIds` 进入 job 创建流程。
- guidance 结果把业务上下文写入 `templateRequirements.businessContext`：
  - guidance id
  - entry title
  - L1/L2 分类
  - recommended template ids
  - automation mode

### 决策

- 本阶段只做 mock guidance 和 snapshot 注入，不把 guidance 持久化为正式 capability entity。
- 动态百科模式的自动勾选仍通过标准 `CapabilityRequirements` 表达，不新增第五层架构。
- 词条引导向导的业务分类先在 application-service 内实现；生成期 democase 访问仍保留为 MCP binding / Runtime 兼容层职责。

### 验证

- `node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.4 Confirmed Guidance Capability Snapshot

### 已完成

- guidance 持久化后，confirmed response 可作为创建 dynamic encyclopedia job 的能力输入。
- confirmation 阶段可以覆盖 selected child template 和 automation mode。
- API smoke 验证：
  - 选择 `dtp_dynamic_encyclopedia_timeline_card`
  - 切换 `semi_auto`
  - job snapshot 保留 `loop_encyclopedia_spec_review`
  - max repair attempts 固定为 1
  - variation 使用 confirmed child template

### 决策

- capability snapshot 仍只记录标准能力选择；业务上下文进入 `templateRequirements.businessContext`。
- interaction paradigm 仍待显式持久化，不从 child template id 反推作为最终事实。

### 验证

- `node --test apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.5 Interaction Paradigm as Snapshot Fact

### 已完成

- guidance response 显式返回 `interactionParadigm`。
- 每个 recommended template 明确标注 `interactionParadigmId`。
- confirmed guidance 将 interaction paradigm 写入 `templateRequirements.businessContext`。
- API smoke 覆盖：
  - 默认企业词条先推荐 `ip_entity_summary`
  - 用户确认 timeline child template 后切换为 `ip_timeline_story`
  - job 创建后 business context 保持该 interaction paradigm，不依赖模板 id 反推。

### 决策

- `InteractionParadigm.compatibleTemplatePackIds` 仍是 template -> paradigm 映射来源。
- 生成任务的事实快照以 guidance/job `businessContext.interactionParadigmId` 为准。
- 未来增加新 child template 时，只需更新 interaction paradigm 兼容关系和推荐规则，不需要改变 Runtime Gateway 契约。

### 验证

- `node --test apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.6 Dynamic Encyclopedia Parent/Child Template Pack

### 已完成

- 将 `dtp_dynamic_encyclopedia_card` 固化为动态百科父模板包：
  - `templateRole = parent_pack`
  - `supportedProductModes = ['dynamic_encyclopedia_card']`
  - `supportedEntryCategories = ['encyclopedia']`
  - 保留 PC `788x492`、WISE `380x456`、iframe/touch/scroll、交付安全约束。
- `DesignTemplatePack` 父子关系字段已作为契约事实使用：
  - `parentPackId`
  - `templateRole`
  - `supportedProductModes`
  - `supportedEntryCategories`
- 删除/避免 pack 侧 `supportedInteractionParadigms`，以 `InteractionParadigm.compatibleTemplatePackIds` 为唯一事实来源。
- 注册首批 5 个动态百科子模板，并与父包 `packageChildren` 声明对齐：
  - `dtp_dynamic_encyclopedia_summary_card`
  - `dtp_dynamic_encyclopedia_timeline_card`
  - `dtp_dynamic_encyclopedia_relation_card`
  - `dtp_dynamic_encyclopedia_compare_card`
  - `dtp_dynamic_encyclopedia_expandable_card`
- 扩展 `InteractionParadigm`：
  - `ip_entity_summary`
  - `ip_timeline_story`
  - `ip_relation_map`
  - `ip_fact_compare`
  - `ip_expandable_facts`
- guidance 推荐逻辑从摘要/时间线二选一升级为按词条类别和 democase 信号推荐 1-3 个动态百科子模板。
- 用户端 capability i18n 增加新增模板和交互范式中文名/描述。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`

### 后续建议

- 将 `dynamicEncyclopediaRuleTemplateIds` 从硬编码规则迁移到真实分类体系/模板适配表。
- 补 API smoke：关系图谱卡、对比辨析卡、可展开事实卡分别被 guidance 推荐并进入 job snapshot。

## 2026-07-04 CAP-M8.7 Variation Assignment as Spec Review Source

### 发现

- 动态百科 job 可以包含多个候选 child template，并通过 `variationTemplateAssignments` 分配给不同 variation。
- 远端 `牛顿摆` 任务显示，job 级候选模板集合包含 timeline 时，非 timeline variation 也可能被 timeline 审查规则误伤。

### 决策

- job 级 `designTemplatePackIds` 表示候选/可用模板集合，不代表每个 artifact 必须满足全部模板规则。
- `variationTemplateAssignments` 是单个 variation 的 child template 事实来源，spec review、automation repair prompt 和后续 refine 都应使用该 variation 的实际 assignment。
- 管理端展示审查失败原因时，需要同时展示 job 候选模板和 variation 实际模板，以便排查规则误伤。

### 后续建议

- 后端服务层实现 variation-scoped spec review context。
- Runtime Gateway prompt block 已按 variation 注入模板上下文，后端 quality gate 需要与该语义保持一致。

## 2026-07-04 CAP-M8.8 Entry Guidance Plugin Trio and Loop Contract

### 已完成

- 注册并收口词条引导插件三件：
  - `plug_encyclopedia_entry_guidance`
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
- `sk_encyclopedia_entry_guidance.pluginId` 和 `mcp_encyclopedia_democase_readonly.pluginId` 均指向 `plug_encyclopedia_entry_guidance`。
- `plug_encyclopedia_entry_guidance` 标记为 `mixed` 类型，表示同一个能力插件同时承载 declarative skill 和 MCP binding。
- democase MCP binding 显式声明 `scopes = ['readonly_context']`，通过 MVP safe policy。
- 明确 democase MCP binding 只服务生成期 agent；首页词条引导向导的分类查询仍由 application-service 直连 democase 只读服务，不经过 runtime MCP binding。
- `AutomationLoopProfile` 契约移除 legacy 字段：
  - 删除 `qualityGate`
  - 删除 `enablePixelGate`
  - 固化 `qualityGates: ('static' | 'pixel' | 'spec')[]`
  - 保留 `repairStrategy`
- loop profile 迁移：
  - `loop_fast` -> `['static']`
  - `loop_standard` -> `['static']`
  - `loop_deep_repair` -> `['static', 'pixel']`
  - `loop_encyclopedia_spec_review` -> `['static', 'spec', 'pixel']`
- loop events 改为输出多门禁字段：
  - `design.loop_started.payload.qualityGates`
  - `design.loop_quality_checked.payload.gates`
- 用户端插件选择器支持 `mixed` 插件，选择时同时切换对应 skill 与 MCP binding。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="capabilities|Automation Loop|api flow"`

### 后续建议

- Runtime Gateway golden 继续验证 `sk_encyclopedia_entry_guidance` 与 `mcp_encyclopedia_democase_readonly` prompt/tool policy 注入稳定。
- 若后续支持真实 MCP 调用，需要把 `allowRuntimeToolUse` 从 policy-only 灰度到可授权、可审计、可回放链路。

## 2026-07-04 CAP-M8.9 Dynamic Encyclopedia Capability Preset

### 已完成

- 新增标准 `CapabilityPreset` 契约，并通过 `ListCapabilitiesResponse.capabilityPresets` 暴露。
- 将 `preset_dynamic_encyclopedia_card` 从后端内部常量升级为 API 可查询的能力事实：
  - `productMode = dynamic_encyclopedia_card`
  - `domainTemplateId = tpl_dynamic_encyclopedia_entry`
  - `designTemplatePackIds = ['dtp_dynamic_encyclopedia_card']`
  - `skillIds = ['sk_encyclopedia_entry_guidance']`
  - `mcpToolIds = ['mcp_encyclopedia_democase_readonly']`
  - `loopProfileId = loop_encyclopedia_spec_review`
- 用户端切换“动态百科卡片”模式时优先读取 API preset，缺失时才使用本地 fallback id。
- capabilities 单测验证 preset 引用的 domain template、skill、MCP binding、loop profile 都存在。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/api apps/web`
- 已通过：`npm --workspace @dudesign/api run test -- --test-name-pattern="capabilities|api flow"`

### 后续建议

- 管理端展示 `capabilityPresets`，作为业务能力包治理入口。
- 后续若新增 `dtp_dynamic_encyclopedia_explore_card`，需要同步更新 preset 版本策略和父包 `packageChildren`。

### 落地状态

- 后端服务层已在 APP-M44 中实现 variation-scoped spec review context。
- `variationTemplateAssignments` 已作为 spec review 的 child template 事实来源，job 级 `designTemplatePackIds` 仅作为无 assignment 时的兼容回退。

## 2026-07-04 CAP-M8.10 Runtime Gateway Safe Skill Golden

### 已完成

- 补充 Runtime Gateway golden，覆盖动态百科 preset 对应的 safe skill 组合选择：
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
- 断言 Babel-O `/v1/agents` payload 中的 `DUDesign plugin context` 稳定包含：
  - 词条引导 skill 的 rules、prompt guidance、avoid、checklist。
  - democase MCP binding 的 policy-only 映射说明。
  - 插件不能覆盖 runtime guardrails、workspace path、model choice、artifact output requirements。
- 断言 `templateRequirements.toolPolicy` 保持 DUDesign 标准形式：
  - `allowedMcpToolIds = ['mcp_encyclopedia_democase_readonly']`
  - `scopes = ['readonly_context']`
  - `requiresUserAuth = false`
  - `auditLevel = usage`
  - `mode = policy_only`
- 将 CAP-7 `Runtime Gateway golden：safe skill 选择后 prompt block 和 tool policy 稳定` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts packages/runtime-gateway`
- 已通过：`npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="safe skill|dynamic encyclopedia|capability|tool policy|prompt"`

### 后续建议

- 继续补 E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- 后续真实 MCP 调用开启前，保持 democase binding 为 `policy_only`，避免 application-service 直连 guidance 查询和生成期 agent tool policy 混淆。

## 2026-07-05 CAP-M8.11 Safe Skill E2E Snapshot

### 已完成

- 补充用户端 E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- 首页 capability summary 增加插件 chip，让用户在生成前能看到已选官方插件/skill。
- Job 结果页增加 job 级 `CapabilitySummary`，不再只在单 variation 页面展示能力快照。
- `CapabilitySummary` 中的 skill 展示名改为优先使用所属 `CapabilityPlugin.name`，避免用户看到 `sk_*` 内部 ID。
- E2E 同时断言后端 job snapshot 中：
  - `plugins.skillIds` 包含 `sk_static_export_safe`。
  - `plugins.mcpToolIds` 为空。
  - `pluginSnapshot.skills` 包含 `sk_static_export_safe`。
  - `pluginSnapshot.toolPolicy.allowedMcpToolIds` 为空。
- 将 CAP-7 `E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/web`
- 已通过：`npm --workspace @dudesign/web run test:e2e -- --grep "official safe skill"`

### 后续建议

- 继续补 E2E：模板 + 插件 + standard loop 生成，覆盖多能力组合快照。
- 管理端后续展示 `capabilityPresets` 时，应复用同一套用户可读名称规则，避免泄露内部能力 ID。

## 2026-07-05 CAP-M8.12 Template + Plugin + Standard Loop E2E

### 已完成

- 升级用户端 capability distribution E2E，覆盖模板包 + 官方 safe skill + standard loop 组合生成。
- 测试链路：
  - 选择 `tpl_premium_product_page` 场景。
  - 选择 custom 方向并验证偏好恢复。
  - 回到 template pack 模式，选择 `dtp_premium_product_launch`。
  - 选择官方 safe skill：`sk_static_export_safe`。
  - 选择 `loop_standard`。
  - 创建 job 并在结果页展示 job 级 capability snapshot。
  - 打开单 variation 并展示 variation 级 capability snapshot。
- E2E 同时校验后端 job snapshot：
  - `designTemplatePacks` 包含 `dtp_premium_product_launch`。
  - `capabilitySnapshot.template.domainTemplate.id = tpl_premium_product_page`。
  - 模板包模式下 snapshot 使用模板包默认视觉基线：`aes_trustworthy_saas` / `pal_blue_white_trust`。
  - `capabilitySnapshot.plugins.skillIds` 包含 `sk_static_export_safe`。
  - `capabilitySnapshot.plugins.mcpToolIds` 为空。
  - `capabilitySnapshot.automation.loopProfile.id = loop_standard`。
- 将 CAP-7 `E2E：模板 + 插件 + standard loop 生成` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/web`
- 已通过：`npm --workspace @dudesign/web run test:e2e -- --grep "capability distribution options"`

### 后续建议

- CAP-7 剩余主要门禁是 MCP smoke：从 `policy_only` 升级到真实调用后，覆盖授权、审计、结果注入和回放。
- 在进入真实 MCP 调用前，建议先整理 MCP invocation contract，明确 application-service guidance 查询与 runtime agent tool policy 的边界。

## 2026-07-05 CAP-M8.13 MCP Smoke Prerequisite Contract

### 已完成

- MCP smoke 前置 contract 已落到第 4 层 Runtime Compatibility：
  - `docs/modules/runtime-compatibility/mcp-invocation-contract.md`
  - `McpInvocationRequest`
  - `McpInvocationResult`
  - `McpInvocationAuditRecord`
- Runtime Gateway 已补 contract helper 和测试，用于固定：
  - `policy_only` 输出稳定。
  - selected MCP tool / tool policy / binding target / scope 必须匹配。
  - user auth required 时必须拒绝未授权调用。
  - MCP unavailable 必须转成标准降级 result。

### 当前状态

- CAP-7 的 `MCP smoke：从 policy_only 升级到真实调用后，覆盖授权、审计、结果注入和回放` 仍未完成。
- 本轮完成的是 smoke 前的 contract 地基，避免后续真实 MCP 接入时突破 capability/plugin 权限边界。

### 后续建议

- 下一步进入 Application Service：实现 MCP 调用前授权校验入口和 audit record 持久化。
- 再进入真实 MCP smoke：授权、调用、结果注入、审计、回放。

## 2026-07-06 CAP-9 External Capability Expansion Planning

### 背景

- 新增规划需求：
  - 网络信息搜索 MCP，参考 `Agent-Reach`，用于 skill 输出与审核。
  - 生成图片 MCP，优先考虑火山方舟 `doubao-seedream-5-0-260128` 作为 provider。
  - 双端差异化生产策略 skill，需进入模板选择环节。
  - 模板融合/迭代更新机制，并与 automation loop 协同。
  - 数据输入获取分析 skill。
  - 用户开发模板贡献机制。

### 已更新

- 在 `README.md` 增加“外部能力扩展规划”，明确 CAP-9 不新增第五层架构，而是分摊到 Templates、Plugins、Automation Loop 和 CAP-6 管理端治理。
- 在 `plugins.md` 增加 CAP-9 外部能力细化：
  - `ResearchContextArtifact`。
  - `ImageGenerationRequest`。
  - `sk_dual_surface_strategy`。
  - `sk_data_intake_analysis`。
  - 模板融合/迭代流程。
  - 用户模板贡献生命周期。
- 在 `TODO.md` 增加 Phase CAP-9：
  - CAP-9.1 网络信息搜索 MCP。
  - CAP-9.2 生成图片 MCP。
  - CAP-9.3 双端差异化生产策略 skill。
  - CAP-9.4 数据输入获取分析 skill。
  - CAP-9.5 模板融合与迭代更新机制。
  - CAP-9.6 用户开发模板贡献机制。

### 治理决策

- 外部 MCP 结果不能直接成为事实来源，必须先形成带 source、confidence、freshness、reviewStatus 的 artifact。
- 图片生成不能由 skill 内嵌 curl 或 API key；provider 调用必须由后端服务执行，结果写入 artifact store。
- 双端策略属于 Design Skill，不属于视觉模板；它指导 PC / WISE / mobile 的差异化生成方法。
- 数据输入分析属于前置 brief 能力，推荐模板/skill 时必须解释原因，不能静默覆盖用户显式选择。
- 模板融合和用户贡献必须生成新 version，不覆盖历史 job snapshot。

### 后续建议

- 第一优先级：实现 CAP-9.3 `sk_dual_surface_strategy`，因为它能直接增强动态百科和固定尺寸业务模板。
- 第二优先级：实现 CAP-9.4 `sk_data_intake_analysis`，为 Agent-Reach 和 democase 输入统一结构化 brief。
- 第三优先级：接 CAP-9.1 Agent-Reach research MCP，并补授权、审核、结果注入、审计和回放 smoke。
- 第四优先级：接 CAP-9.2 图片生成 MCP，先走 artifact-backed mock，再接真实 provider。

## 2026-07-06 CAP-9.3 Dual-surface Strategy Skill

### 已完成

- 新增官方插件 `plug_dual_surface_strategy`：
  - `type = skill`
  - `category = responsive`
  - `safetyLevel = safe`
  - 权限保持 `readonly_context` + `validation_only`，不允许 runtime tool use。
- 新增官方 skill `sk_dual_surface_strategy`：
  - 明确 PC / WISE / mobile / embedded iframe 是不同产品端，不是简单 responsive 缩放。
  - 固定尺寸业务模板优先满足标准 viewport，再兼容次级尺寸。
  - 移动和 iframe 场景要求显式滚动容器、稳定控件和 touch-safe interaction。
  - 负向约束禁止全局 `touchmove` 阻断、全局 `touch-action:none`、视频、下载和跳转作为核心移动交互。
- 动态百科 preset 默认选择：
  - `sk_encyclopedia_entry_guidance`
  - `sk_dual_surface_strategy`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- 用户端 dynamic encyclopedia fallback skillIds 同步为词条引导 + 双端策略。
- 补充中文能力文案，插件选择器和 capability summary 可展示用户可读名称。
- Runtime Gateway golden 覆盖 dual-surface prompt block，确保进入 BabeL-O 的 prompt 内容稳定且不覆盖 runtime guardrails。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/api packages/runtime-gateway apps/web`
- 已通过：`npm --workspace @dudesign/api run test -- --test-name-pattern="capability plugin registry|api flow"`
- 已通过：`npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="dual-surface|dynamic encyclopedia|capability|tool policy|prompt"`

### 后续建议

- 下一步进入 CAP-9.4：实现 `sk_data_intake_analysis`，把 prompt、URL、粘贴文本、JSON/table、democase 和后续 Agent-Reach research artifact 统一成结构化 brief。
- 然后再做 CAP-9.1 Agent-Reach research MCP；这样检索结果有稳定的 brief 容器，不会直接污染 runtime prompt。

## 2026-07-06 CAP-9.4 Data Intake Analysis Skill Baseline

### 已完成

- 新增 `DataIntakeAnalysis` contract：
  - `inputSources`
  - `topicSummary`
  - `entities`
  - `fields`
  - `missingFields`
  - `recommendedScenarioTemplates`
  - `recommendedDesignTemplatePacks`
  - `recommendedSkills`
  - `riskFlags`
  - `reviewStatus`
- 新增官方插件 `plug_data_intake_analysis`：
  - `type = skill`
  - `category = research`
  - 权限保持 `readonly_context` + `validation_only`
  - 不允许 runtime tool use
- 新增官方 skill `sk_data_intake_analysis`：
  - 要求把松散输入整理为结构化 brief。
  - 要求保留 prompt、URL、粘贴文本、表格、JSON、上传资产、democase、research artifact、existing HTML 和 memory 的来源边界。
  - 推荐模板/skill 时必须说明 reason 和 confidence。
  - memory、democase、research artifact 只能作为 context hints，不作为未经确认的事实。
- 动态百科 preset 默认加入 `sk_data_intake_analysis`，形成：
  - `sk_encyclopedia_entry_guidance`
  - `sk_dual_surface_strategy`
  - `sk_data_intake_analysis`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- 用户端中文能力文案新增“数据输入分析”。
- Runtime Gateway golden 覆盖 data-intake prompt block，确保该 skill 进入 BabeL-O prompt 且不能覆盖 runtime guardrails。

### 当前边界

- 已完成 contract + official skill + snapshot/golden baseline。
- 已实现 `POST /api/capabilities/data-intake/analyze`，可生成 deterministic `DataIntakeAnalysis`。
- 分析结果已写入 artifact store，作为 `data_intake_analysis` preflight artifact 返回。
- 已实现创建 job 时引用 data-intake preflight artifact，并把 artifact id、storageKey、contentHash、sizeBytes、schemaVersion、reviewStatus 固化到 job snapshot。
- Agent-Reach research MCP 尚未接入；后续 research result 应先进入 `ResearchContextArtifact`，再被 data-intake 分析吸收。

### 后续建议

- 下一步推进 CAP-9.1 Agent-Reach research MCP，让搜索结果经过 `ResearchContextArtifact -> DataIntakeAnalysis -> Runtime prompt` 的链路。

## 2026-07-06 CAP-9.1 Agent-Reach Research MCP Contract Baseline

### 已完成

- 新增 `ResearchContextArtifact` 合约：
  - `query`。
  - `sources`。
  - `summary`。
  - `citations`。
  - `confidence`。
  - `freshness`。
  - `riskFlags`。
  - `rawPayloadHash`。
  - `reviewStatus`。
- 注册官方网络检索能力族：
  - `plug_research_context`。
  - `sk_research_brief_builder`。
  - `mcp_agent_reach_search`。
  - `mcp_agent_reach_page_read`。
  - `mcp_agent_reach_social_scan`。
- 明确当前 MVP 安全策略：
  - Agent-Reach 能力先走 `readonly_context` 和 `auditLevel=full`。
  - 不直接开放 `external_network` 给 Runtime Gateway。
  - 真实网络访问后续通过管理端灰度和环境配置开启。
- `MockMcpExecutor` 增加 Agent-Reach mock：
  - 搜索、页面读取、社媒扫描统一归一化为 `ResearchContextArtifact`。
  - MCP result 只暴露 reviewed summary、references 和 research context。
  - 不把原始外部 payload 注入 runtime prompt。
- 用户端 skill 本地化增加“网络检索摘要”，插件面板可展示中文名称、规则、负向约束和 checklist。

### 验证

- `ResearchContextArtifact` contract 单测。
- capability registry 单测：
  - 官方插件、skill、MCP binding 可列出。
  - Agent-Reach binding 进入 full audit readonly tool policy。
- MCP executor 单测：
  - mock Agent-Reach search 返回 reviewed research context。

### 决策

- 本阶段先完成离线契约、registry、mock 和审计策略，不直接依赖真实 Agent-Reach 进程或外网搜索结果。
- 后续真实联调必须保持 `Agent-Reach -> ResearchContextArtifact -> DataIntakeAnalysis -> Runtime prompt` 链路，不允许 Runtime Gateway 直接消费 Agent-Reach 原始结果。

### 后续关注

- 将 MCP 调用结果写入 artifact store 或 capability artifact 表，并把 artifact reference 写入 job snapshot。
- 增加网络搜索 MCP API smoke：授权、调用、审核、结果注入、审计和回放。
- 接入真实 Agent-Reach staging route 后补 golden replay，验证事件 drift 不破坏 DUDesign 标准 research context。

## 2026-07-06 CAP-9.1 Research Context Artifact Snapshot Flow

### 已完成

- 扩展 contracts：
  - 新增 `ResearchContextArtifactReference`。
  - `CreateDesignJobRequest.templateRequirements` 支持 `researchContextArtifactIds`。
  - `CreateDesignJobRequest.templateRequirements` 支持 `researchContexts` snapshot。
- Application Service 执行 MCP 调用后自动识别 `result.data.researchContext`：
  - 写入 artifact store：`capabilities/research/context.json`。
  - artifact metadata 记录 `kind=research_context`、`invocationId`、`mcpToolId`、`schemaVersion`、`reviewStatus`、`query`。
  - MCP result 回填 `data.researchContextArtifact`。
- 创建 design job 时支持固定 research context：
  - 从 `researchContextArtifactIds` 或 `researchContexts[].artifactId` 读取 artifact store。
  - 校验 artifact kind 与 JSON schema。
  - 将轻量 reference 写入 job `templateRequirements.researchContexts`。
  - 将 artifact id 列表写入 `templateRequirements.researchContextArtifactIds`。
- API flow smoke 增加 mock Agent-Reach 链路：
  - 创建带 `sk_research_brief_builder` 和 `mcp_agent_reach_search` 的 job。
  - 执行 MCP search。
  - 验证 `ResearchContextArtifact` 被写入 artifact store。
  - 使用该 artifact 创建后续 job。
  - 断言后续 job snapshot 固定 artifact id、storage key、content hash、schema version、review status、query 和 source count。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|capability plugin registry|MockMcpExecutor|HttpMcpExecutor"`

### 决策

- Research context 先复用 artifact store，不新增 PostgreSQL capability artifact 表。
- Job snapshot 只保存轻量 reference，不把完整 research context JSON 展开到 job record，降低 snapshot 膨胀和隐私扩散风险。
- 当前 smoke 使用 mock Agent-Reach；真实 Agent-Reach staging smoke 仍需单独接入，避免本地测试依赖外网和账号状态。

### 后续关注

- 接入真实 Agent-Reach HTTP/CLI route，输出仍必须归一化为 `ResearchContextArtifact`。
- Runtime Gateway prompt 编译阶段需要将 `researchContexts` 与 `dataIntake` 组合成受控上下文，不允许直接传原始 MCP payload。
- 管理端后续展示 research artifact 的来源、reviewStatus、query、sourceCount 和 replay key。

## 2026-07-06 CAP-9.1 Agent-Reach Staging Smoke Scaffold

### 已完成

- 新增 `deploy/staging/scripts/agent-reach-mcp-adapter.py`：
  - 暴露 DUDesign 标准 MCP HTTP endpoint：`POST /v1/mcp/invocations`。
  - 当前支持 `agent-reach.search`。
  - 默认通过 `mcporter call 'exa.web_search_exa(...)'` 调 Agent-Reach web search。
  - 可通过 `AGENT_REACH_SEARCH_COMMAND` 替换搜索命令，便于不同服务器安装方式。
  - 将真实搜索 payload 归一化为 `ResearchContextArtifact`，不把原始 payload 透传给 DUDesign runtime。
  - 外部调用失败时返回标准 MCP `unavailable` result。
- 新增 `deploy/staging/scripts/smoke-agent-reach-remote.sh`：
  - 远端启动 Agent-Reach MCP adapter。
  - 将 staging API 的 `DUDESIGN_MCP_EXECUTOR` 临时切换为 `http`。
  - 创建带 `sk_research_brief_builder` 和 `mcp_agent_reach_search` 的 job。
  - 执行 Agent-Reach search MCP invocation。
  - 验证 DUDesign 写入 `researchContextArtifact`。
  - 创建后续 pinned job，验证 `researchContextArtifactIds` 和 `researchContexts` 写入 job snapshot。
  - 退出时恢复 staging `.env` 并重启 API。
- `deploy/staging/staging.env.example` 增加 Agent-Reach staging smoke env：
  - `DUDESIGN_STAGING_AGENT_REACH_MCP_PORT`。
  - `DUDESIGN_STAGING_AGENT_REACH_QUERY`。

### 本地检查

- 本机执行 `agent-reach doctor --json` 返回 `command not found`，说明当前本机尚未安装 Agent-Reach CLI；因此本轮只做脚手架和静态检查，不声称真实搜索已跑通。

### 决策

- DUDesign API 不直接 shell 调 Agent-Reach，不直接绑定 Agent-Reach CLI 或 `mcporter` 输出格式。
- 真实检索能力通过标准 MCP HTTP adapter 隔离；API 只看 DUDesign MCP result envelope 和 `ResearchContextArtifact`。
- Staging smoke 仍保持 opt-in，不让默认部署依赖外部搜索服务、账号或网络状态。

### 后续关注

- 在 staging 主机安装/配置 Agent-Reach 或 `mcporter` 后运行：
  - `DUDESIGN_STAGING_AGENT_REACH_QUERY="..." deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 若实际 Agent-Reach payload 结构与预期差异较大，更新 adapter 的 `collect_sources()`，但不改变 DUDesign API contract。

## 2026-07-06 CAP-9.1 Agent-Reach Staging Preflight

### 已完成

- 新增 `deploy/staging/scripts/preflight-agent-reach-remote.sh`：
  - 检查远端 SSH 可达。
  - 检查 `python3`。
  - 检查 `docker`。
  - 检查 DUDesign current 部署目录。
  - 检查已部署的 `agent-reach-mcp-adapter.py`。
  - 检查已部署的 `smoke-agent-reach-remote.sh`。
  - 检查 `mcporter` 或 `AGENT_REACH_SEARCH_COMMAND`。
  - 可选运行 `agent-reach doctor --json`。
- 给 Agent-Reach staging 脚本增加执行权限：
  - `agent-reach-mcp-adapter.py`。
  - `smoke-agent-reach-remote.sh`。
  - `preflight-agent-reach-remote.sh`。

### 当前远端检查结果

- `ssh tyy` 可达。
- 远端存在：
  - `/usr/bin/python3`
  - `/usr/bin/docker`
  - `/home/ubuntu/deployments/dudesign/current`
- 远端当前缺少：
  - `deploy/staging/scripts/agent-reach-mcp-adapter.py`
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 因此真实 smoke 尚未运行；需要先提交并部署包含这两个脚本的新版本。

### 本地检查

- `bash -n deploy/staging/scripts/preflight-agent-reach-remote.sh deploy/staging/scripts/smoke-agent-reach-remote.sh`
- `python3 -m py_compile deploy/staging/scripts/agent-reach-mcp-adapter.py`

### 后续顺序

1. 提交并部署当前 DUDesign 改动到 staging。
2. 在 staging 主机安装 `mcporter` / Agent-Reach，或提供 `AGENT_REACH_SEARCH_COMMAND`。
3. 运行 `deploy/staging/scripts/preflight-agent-reach-remote.sh`，直到输出 `agent-reach-preflight:ready`。
4. 运行 `deploy/staging/scripts/smoke-agent-reach-remote.sh`。

## 2026-07-06 CAP-9.1 Staging Deploy And Smoke Stabilization

### 已完成

- 已将包含 Agent-Reach MCP adapter 与 staging smoke 脚本的版本部署到 staging。
- 修复 `deploy/staging/scripts/smoke-mcp-http-remote.sh`：
  - 增加 executable 权限，避免 `smoke-remote.sh` 调用时报 `Permission denied`。
  - API 重启后等待 `/api/dev/bootstrap` 返回可用 JSON，避免刚启动时 502/空响应导致误判。
  - MCP invocation payload 不再依赖 `/api/design-jobs` 返回完整 `userId/workspaceId/sessionId`，改为从 bootstrap 与 session 上下文取值。
  - mock MCP server 从 `127.0.0.1` 改为 `0.0.0.0` 绑定，兼容 Linux Docker 容器通过 `host.docker.internal` 访问宿主机端口。
- 修复 `deploy/staging/scripts/agent-reach-mcp-adapter.py`：
  - adapter 从 `127.0.0.1` 改为 `0.0.0.0` 绑定，支持 staging API 容器访问。
- 修复 `deploy/staging/scripts/smoke-agent-reach-remote.sh`：
  - API 重启后校验 bootstrap user/workspace。
  - Agent-Reach invocation payload 改为使用稳定上下文，不依赖轻量 job envelope。

### 验证结果

- `deploy/staging/scripts/deploy-remote.sh` 已完成部署；基础服务、public web/api/admin、runtime adapter health 均通过。
- `deploy/staging/scripts/smoke-remote.sh` 已通过：
  - BabeL-O prompt smoke 完成。
  - MCP HTTP mock smoke 完成。
- `deploy/staging/scripts/preflight-agent-reach-remote.sh` 已运行到外部检索后端检查：
  - 远端 `python3` 已就位。
  - 远端 `docker` 已就位。
  - DUDesign current 部署目录已就位。
  - 已部署 `agent-reach-mcp-adapter.py`。
  - 已部署 `smoke-agent-reach-remote.sh`。
  - 当前阻塞：staging 主机缺少 `mcporter`，且未配置 `AGENT_REACH_SEARCH_COMMAND`。

### 决策

- 当前不把 “Agent-Reach 真实搜索 smoke” 标记完成，因为外部检索后端尚未安装或配置。
- 先确认 DUDesign 侧 HTTP MCP transport、artifact 写入、job snapshot 逻辑在 mock/staging 基础 smoke 中稳定，再接真实 provider。

### 后续关注

- 在 staging 主机安装 `mcporter` / Agent-Reach，或在远端 shell 环境提供 `AGENT_REACH_SEARCH_COMMAND`。
- 再运行：
  - `deploy/staging/scripts/preflight-agent-reach-remote.sh`
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 若真实 provider payload 和 adapter 预期不一致，只调整 adapter 的 source collection/normalization，不改变 DUDesign `ResearchContextArtifact` contract。

## 2026-07-06 CAP-9.1 Custom Search Command Bridge

### 已完成

- `preflight-agent-reach-remote.sh` 支持从本地传入 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`，并在远端映射为 `AGENT_REACH_SEARCH_COMMAND`。
- `smoke-agent-reach-remote.sh` 支持从本地传入 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`，避免要求操作者手动登录远端 export。
- `staging.env.example` 增加 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND` 说明：
  - 命令运行在 staging 主机。
  - stdin 接收 `{"query":"...","numResults":N}`。
  - stdout 需要输出可被 adapter 解析的 JSON 或文本。

### 验证结果

- 使用 fixture search command 跑通 preflight：
  - `agent-reach-preflight:custom-search-command`
  - `agent-reach-preflight:ready`
- 使用 fixture search command 跑通 smoke：
  - adapter 归一化 fixture search result。
  - API 执行 `mcp_agent_reach_search`。
  - research context 写入 artifact。
  - 后续 job snapshot 固定 `researchContextArtifactIds` 与 `researchContexts`。
  - 输出 `agent-reach-smoke:completed`。

### 决策

- 这一步只证明 DUDesign 自定义检索命令桥、HTTP MCP adapter、artifact 写入和 job snapshot 链路可用。
- 这一步不等同于真实 Agent-Reach provider smoke；真实 provider 仍需安装 `mcporter` / Agent-Reach，或提供调用真实 Agent-Reach 的 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`。

### 后续关注

- 将 fixture command 替换为真实 Agent-Reach/mcporter command 后，重新运行 preflight + smoke。
- 记录真实 provider payload schema，并按需调整 `agent-reach-mcp-adapter.py` 的 `collect_sources()`。

## 2026-07-06 CAP-9.1 Real Agent-Reach Staging Install

### 已完成

- 在 staging 主机 `tyy` 安装 Agent-Reach 本体：
  - 安装位置：`/home/ubuntu/.agent-reach-venv`
  - 版本：`agent-reach 1.5.0`
  - Skill 安装位置：`/home/ubuntu/.agents/skills/agent-reach`
- 按官方安装指南补齐基础依赖：
  - `python3.12-venv`
  - `pipx`
  - `nodejs`
  - `npm`
  - `mcporter`
- 配置 Exa MCP：
  - `mcporter config add exa https://mcp.exa.ai/mcp`
  - 配置文件位置：`/home/ubuntu/config/mcporter.json`
- `agent-reach doctor --json` 当前核心可用渠道：
  - `exa_search`：ok，active backend 为 `Exa via mcporter`
  - `web`：ok，active backend 为 `Jina Reader`
  - `rss`：ok，active backend 为 `feedparser`
  - `bilibili`：ok，active backend 为 `B站搜索 API`
- `agent-reach check-update` 返回当前已是最新版本。

### DUDesign 适配修复

- `agent-reach-mcp-adapter.py` 支持 `AGENT_REACH_MCPORTER_CONFIG`：
  - 当设置该变量时，adapter 调用 `mcporter --config <path> call ...`。
  - 避免 `mcporter` 依赖当前 release 目录下的 `config/mcporter.json`。
- `preflight-agent-reach-remote.sh` 自动探测：
  - `$HOME/config/mcporter.json`
  - `$HOME/.mcporter/mcporter.json`
- `smoke-agent-reach-remote.sh` 启动 adapter 时注入探测到的 `AGENT_REACH_MCPORTER_CONFIG`。
- `staging.env.example` 增加 `DUDESIGN_STAGING_AGENT_REACH_MCPORTER_CONFIG`。

### 验证结果

- 直接验证 `mcporter` + Exa：
  - `mcporter call 'exa.web_search_exa(query: "DUDesign Agent-Reach smoke test", numResults: 1)'`
  - 能返回真实搜索结果。
- DUDesign preflight：
  - `agent-reach-preflight:mcporter /usr/local/bin/mcporter`
  - `agent-reach-preflight:mcporter-config /home/ubuntu/config/mcporter.json`
  - `agent-reach-preflight:ready`
- DUDesign real smoke：
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
  - 输出 `agent-reach-smoke:completed`
  - 真实链路为 `mcporter + Exa -> Agent-Reach MCP adapter -> DUDesign MCP execute -> research context artifact -> pinned job snapshot`。

### 风险与后续关注

- `npm install -g mcporter` 在 Ubuntu apt Node 18.19.1 上出现 engine warning：
  - `mcporter@0.12.3` 声明需要 Node `>=24`
  - 当前 smoke 实测可用，但中期建议把 staging Node 升级到 LTS/新版，避免后续 mcporter 更新后不兼容。
- `preflight` 仍提示 `agent-reach-cli-not-installed`，因为 Agent-Reach 安装在 venv，不在默认 PATH；当前 DUDesign smoke 依赖 `mcporter + Exa`，不受影响。
- 可选渠道如 Twitter、Reddit、小红书等仍需登录态、代理或额外后端，不纳入本次 DUDesign 网络检索 MVP 验收。

### 本轮补充

- 新增 contracts：
  - `AnalyzeDataIntakeRequest`
  - `AnalyzeDataIntakeResponse`
- 新增 API：
  - `POST /api/capabilities/data-intake/analyze`
- deterministic analyzer 当前支持：
  - prompt / URL / pasted text / table / JSON / uploaded asset ids / democase ids / research artifact ids / existing HTML artifact id / memory note ids。
  - topic summary、entity、field、missing fields、recommendations、risk flags、review status。
- API smoke 覆盖：
  - workspace 权限路径。
  - 动态百科相关输入推荐 `tpl_dynamic_encyclopedia_entry`。
  - 时间线信息推荐 `dtp_dynamic_encyclopedia_timeline_card`。
  - external source 风险标记。
  - artifact store 可读回固化 JSON。

### 2026-07-06 补充收口

- `CreateDesignJobRequest.templateRequirements` 新增：
  - `dataIntakeArtifactId`
  - `dataIntake`
- 创建 job 时会校验 `dataIntakeArtifactId` 指向当前 workspace 下的 `data_intake_analysis` artifact。
- job snapshot 中只固化轻量引用，不复制完整 analysis，避免 job 记录膨胀：
  - `artifactId`
  - `storageKey`
  - `contentHash`
  - `sizeBytes`
  - `schemaVersion`
  - `reviewStatus`
  - `createdAt`
- API smoke 已覆盖：
  - 创建 job 引用 data-intake artifact。
  - 存储后的 job `templateRequirements.dataIntakeArtifactId` 与 `templateRequirements.dataIntake` 不漂移。

## 2026-07-06 CAP-9.2 Image Generation MCP Mock Foundation

### 已完成

- 新增图片生成能力契约：
  - `ImageGenerationRequest`
  - `ImageGenerationArtifact`
  - `ImageGenerationUsageContext`
- 官方 registry 增加图片生成插件族：
  - `plug_image_generation`
  - `sk_visual_asset_brief`
  - `mcp_image_generation_ark_seedream`
- `sk_visual_asset_brief` 明确：
  - 将视觉资产需求转为受控 image request。
  - 不请求 logo、版权角色、品牌 trade dress、受保护 UI chrome。
  - provider API key、raw provider response、临时 URL 不进入 runtime prompt 或 job snapshot。
- `MockMcpExecutor` 增加 image generation 分支：
  - 成功请求返回 mock `ImageGenerationArtifact`。
  - 命中 logo / copyrighted / celebrity / exact brand trade dress 等风险词时返回 `IMAGE_CONTENT_SAFETY_BLOCKED`。
- Application Service 的 MCP execute 阶段新增 `persistMcpCapabilityArtifacts()`：
  - 继续支持 research context artifact 固化。
  - 新增 image generation artifact 固化到 artifact store。
  - MCP result 对外只返回 `/api/capability-artifacts/:artifactId` 形式的稳定引用和 artifact metadata。
- capability registry 单测覆盖 artifact write scope 的 tool policy。
- API smoke 覆盖图片生成 MCP：
  - job snapshot 中选择 `sk_visual_asset_brief` + `mcp_image_generation_ark_seedream`。
  - 执行 mock image MCP。
  - 验证 image artifact 写入 artifact store。
  - 验证 content safety status、cost 和 metadata。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="capability plugin registry|MockMcpExecutor|MCP|api flow"`

### 决策

- 本轮不直接接入火山方舟真实 API；先稳定 DUDesign 内部契约、权限、审计和 artifact 语义。
- 图片生成产物暂不扩展 `ArtifactKind`，避免把 variation artifact 与 capability artifact 混为一层；真实图片二进制/URL 管理后续再通过 provider adapter 和 artifact resolver 收敛。

### 后续关注

- 增加 Ark Seedream provider adapter：
  - `ARK_API_KEY` 仅存在服务端 secret。
  - 支持 provider unavailable、rate limit、content safety blocked、cost usage。
- 增加真实 provider smoke，但默认 CI/staging smoke 仍使用 mock，避免依赖外部付费服务。

## 2026-07-06 CAP-9.2 Ark Seedream Provider Adapter

### 已完成

- 新增 `ArkSeedreamImageMcpExecutor`：
  - 只接管 `image-generation.generateArkSeedreamImage`。
  - 非图片 MCP tool 继续交给 fallback executor，默认 fallback 为 `MockMcpExecutor`。
  - 按火山方舟 images/generations 形态发送 `model`、`prompt`、`response_format=url`、`size`、`stream=false`、`watermark`、`sequential_image_generation=disabled`。
  - 服务端通过 `Authorization: Bearer <ARK_API_KEY>` 注入密钥，密钥不会进入 skill、runtime prompt、job snapshot 或 MCP result。
- `createMcpExecutorFromEnv()` 支持可选图片 provider：
  - `DUDESIGN_IMAGE_GENERATION_PROVIDER=ark_seedream`
  - `ARK_API_KEY` / `DUDESIGN_ARK_API_KEY`
  - `ARK_IMAGE_GENERATION_URL`
  - `ARK_IMAGE_MODEL`
  - `ARK_IMAGE_TIMEOUT_MS`
- `deploy/staging/staging.env.example` 增加 Ark provider env，但默认关闭，保持 staging/CI 不依赖外部付费服务。
- Provider adapter 单测覆盖：
  - server-side credential header。
  - provider request body。
  - provider URL result 归一化为 `ImageGenerationArtifact`。
  - provider 429 / failure 归一化为 `MCP_UNAVAILABLE`。
  - 非图片 MCP tool fallback 到基础 executor。

### 验证

- 待本轮统一执行 `npm run typecheck` 与 API 测试。

### 后续关注

- 在有 `ARK_API_KEY` 的 staging secret 环境跑真实 provider smoke。
- 增加用户端/Activity Stream 的图片 provider unavailable 细分文案。
- 决定是否为真实图片二进制引入 capability artifact read endpoint，替代当前 JSON artifact 引用。

## 2026-07-06 CAP-9.2 Ark Seedream Opt-in Staging Smoke

### 已完成

- 新增 `deploy/staging/scripts/smoke-ark-image-remote.sh`：
  - 默认在 `DUDESIGN_STAGING_ARK_REAL_SMOKE!=1` 时输出 skipped，不阻塞默认 staging deploy。
  - 有密钥时临时写入 staging `.env`，启用 `DUDESIGN_IMAGE_GENERATION_PROVIDER=ark_seedream`。
  - 通过 DUDesign 标准 `/api/mcp/invocations/execute` 触发 `mcp_image_generation_ark_seedream`，不在 smoke 中直接绑定 Ark 原始 response。
  - 断言返回 `ImageGenerationArtifact`、provider 为 `ark_seedream`、图片 URL 被替换为 artifact-backed `/api/capability-artifacts/:id`，不泄露 provider URL。
  - 断言管理端 MCP audit 能按 job/tool/status 查询到本次调用。
  - 退出时恢复原 staging `.env` 并重启 API，避免测试配置污染常驻服务。
- `smoke-remote.sh` 挂载 Ark image smoke；默认只跳过，打开开关后才跑真实付费 provider。
- `staging.env.example` 增加 opt-in Ark smoke 参数。

### 验证

- 待本轮执行 shell 静态检查、typecheck 与 API 测试。

### 后续关注

- 在具备 `ARK_API_KEY` 的 staging secret 环境运行：
  - `DUDESIGN_STAGING_ARK_REAL_SMOKE=1 deploy/staging/scripts/smoke-ark-image-remote.sh`
- 若真实 provider 返回额外成本/用量字段，继续收敛到 `ImageGenerationArtifact.costCents`，不把原始 provider payload 暴露给前端或 runtime。

## 2026-07-06 CAP-9.2 Image Provider Unavailable UX Mapping

### 已完成

- 前端 `toUserFacingError` 增加 MCP 上下文识别：
  - `MCP_UNAVAILABLE + image-generation` 映射为 “Image generation temporarily unavailable”。
  - action 固定为 “Continue without images”，强调可稍后重试或切换 provider。
  - 非图片 MCP 继续使用通用 capability unavailable 文案，避免影响 Agent-Reach、质量检查等其他工具。
- 新增 `mcpInvocationToUserError(result)` helper，供后续 Activity Stream、插件执行面板、toast 统一复用 MCP result 的用户文案。
- API client 支持透传 error payload 中的 `context`/`data`，为 HTTP 错误场景保留同一套文案映射。
- Ark Seedream provider unavailable 结果补充 `serverName`、`toolName`、`mcpToolId`、`provider`，但不泄露密钥或 provider 原始 payload。
- 增加 web mapper 测试和 API Ark unavailable 上下文断言。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="ArkSeedream"`
- `node --test apps/web/test/capability-errors.test.mjs`

### 后续关注

- 将 `mcpInvocationToUserError` 接入用户端 Activity Stream/插件执行结果 UI。
- 为图片生成失败增加可操作按钮：继续无图、重试图片、切换 provider。

### 2026-07-06 追加进展

- 用户端已新增 `CapabilityNotice` 组件，并在 Variation 详情页预留真实展示位。
- 已补充重试图片 / 切换 provider 的用户端动作文案。
- Application Service 已在 variation detail 中返回 recent MCP invocation result；Variation 页面会自动显示真实 provider 降级。
- Variation Inspect 面板已使用 `mcpInvocationToUserError()` 展示 provider/tool 降级活动。
- 首页生成过程 Activity Stream 已通过 `design.runtime_warning.context` 接入 provider/tool 降级。
