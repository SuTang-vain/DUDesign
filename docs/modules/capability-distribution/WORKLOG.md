# Capability Distribution System 工作记录

> 模块：Capability Distribution System
> 维护方式：按日期追加。记录模板、插件、自动化 loop、能力编译策略和跨层治理决策。

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
