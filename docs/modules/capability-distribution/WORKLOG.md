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
