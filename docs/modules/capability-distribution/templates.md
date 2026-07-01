# Templates

> 子模块：Templates
> 所属模块：Capability Distribution System
> 目标：为用户提供场景模板、视觉风格和高级约束，让用户无需理解 prompt 工程也能稳定表达生成方向

## 1. 定位

Templates 解决的是：

> 为用户在某个使用场景下，按某种视觉方向，并带着必要的高级约束进行开发。

它不直接调用工具，不直接执行自动修复，也不直接控制 runtime。模板只提供结构化设计上下文。

## 2. 面向用户的三层心智

用户端不再把“风格 / 领域 / 审美 / 配色”作为四个并列入口，因为这些概念在用户心智里都会被理解为“风格”，容易产生冗余和重叠。

推荐的用户端入口为：

```text
场景 -> 视觉 -> 高级
```

### 2.1 场景

场景回答“我要做什么类型的网站或页面”。

它对应底层契约里的 `DomainTemplate`，但 UI 上建议使用“场景”而不是“领域”，因为“场景”更接近用户任务表达。

场景示例：

- 创意与艺术。
- 金融科技。
- 专业企业。
- 汽车。
- SaaS Landing Page。
- Admin Console。
- Portfolio。
- Product Launch Page。

场景包含：

- 推荐页面结构。
- 常见信息架构。
- 默认模块顺序。
- 适合的 CTA 类型。
- 行业禁忌和合规提示。
- 推荐 variation directions。

场景不应该包含品牌模仿或强视觉审美。例如 `Premium Product Page` 应拆成：

- 场景：Product Launch Page / Product Detail Page。
- 参考品牌：Apple-inspired。
- 视觉：Premium Minimal。

### 2.2 视觉

视觉回答“它看起来是什么视觉气质”。

它对应底层契约里的 `AestheticProfile`，但 UI 上建议使用“视觉”或“视觉风格”，避免“审美”显得抽象。

示例：

- Premium Minimal。
- Calm Trust。
- Warm Commercial。
- Bold Editorial。
- Futuristic Neon。
- Soft Pastel。
- High Contrast Editorial。

视觉包含：

- 背景策略。
- 排版气质。
- 按钮与控件风格。
- 图片/素材倾向。
- 动效克制程度。
- 可用色板集合。
- 负面视觉规则。

视觉不应该包含具体业务场景。例如 `Trustworthy SaaS` 更适合拆成：

- 场景：SaaS Landing Page。
- 视觉：Calm Trust。

### 2.3 高级

高级回答“是否需要覆盖默认视觉参数，或补充更细的约束”。

高级入口不应该成为用户第一步必选项，MVP 可默认折叠。

高级包含：

- 色板：对应 `ColorPalette`，作为视觉风格下的可选覆盖。
- 补充风格词：自由文本或标签，例如 `glassmorphism`、`more editorial`、`less card-heavy`。
- 参考品牌：未来对应 `BrandStyleReference`，例如 Apple-inspired、Stripe-like、Linear-like。
- 负面要求：例如不要深色背景、不要大面积渐变、不要卡片堆叠。

高级中的自由文本只作为 prompt modifier，不等同于官方模板，不应污染 `DomainTemplate` 或 `AestheticProfile` registry。

## 3. 底层契约映射

产品展示层和底层契约层保持分离：

| 用户端展示 | 底层对象 | 说明 |
| --- | --- | --- |
| 场景 | `DomainTemplate` | 页面类型、信息架构、行业约束、默认 section |
| 视觉 | `AestheticProfile` | 排版、布局、密度、动效、控件气质、负面视觉规则 |
| 高级 / 色板 | `ColorPalette` | 颜色 token 和使用建议，作为视觉的覆盖项 |
| 高级 / 参考品牌 | `BrandStyleReference` | 只提取抽象设计特征，不复制品牌资产或文案 |
| 高级 / 补充风格词 | `templateRequirements.styles` 或后续 `styleModifiers` | 用户临时补充，不作为官方 registry |
| 高级 / 负面要求 | 后续 `negativeRequirements` | 用户临时约束，Runtime Gateway 编译时作为 safety-aware prompt block |

## 4. 推荐数据模型

### DomainTemplate

```ts
type DomainTemplate = {
  id: string
  visibility: 'official' | 'private' | 'workspace' | 'team'
  ownerUserId?: string | null
  name: string
  category: string
  description: string
  schemaVersion: string
  contentVersion: string
  structure: {
    sections: string[]
    requiredElements: string[]
    optionalElements: string[]
  }
  constraints: string[]
  variationDirections: string[]
  status: 'active' | 'archived' | 'disabled'
}
```

建议 UI label：`场景` / `Scene`。

### AestheticProfile

```ts
type AestheticProfile = {
  id: string
  name: string
  description: string
  colorPaletteIds: string[]
  mood: string[]
  occasion: string[]
  tone: string[]
  formality: string
  density: string
  bestFor: string[]
  avoidFor: string[]
  typographyTone: string
  layoutTone: string
  motionTone: string
  negativeRules: string[]
}
```

建议 UI label：`视觉` / `Visual`。

### ColorPalette

```ts
type ColorPalette = {
  id: string
  name: string
  colors: string[]
  usage: Record<string, string>
  accessibilityNotes: string[]
}
```

建议 UI label：`色板` / `Palette`，放入高级入口。

### BrandStyleReference

```ts
type BrandStyleReference = {
  id: string
  name: string
  description: string
  brandFamily: string
  inspirationOnly: true
  visualPrinciples: string[]
  tokenHints: {
    color?: string[]
    typography?: string[]
    layout?: string[]
    motion?: string[]
    voice?: string[]
  }
  forbiddenRules: string[]
}
```

参考品牌必须只作为 inspiration，不得复制受保护 logo、品牌文案、商标元素或造成官方背书误解。

## 5. Runtime 编译

Templates 编译为 Runtime Gateway prompt context，而不是前端直接拼 prompt。

编译结果包括：

- Scene/domain context。
- Information architecture hint。
- Visual/aesthetic context。
- Color palette rules。
- Brand reference abstraction rules。
- Supplemental style modifiers。
- Negative style rules。
- Variation direction seed。

Runtime Gateway 必须把参考品牌编译为抽象规则，例如“large product moments、restrained copy、generous spacing”，不能编译为“复制 Apple 官网”。

## 6. MVP 官方模板建议

首批已落地 registry：

- Fintech Trust Landing。
- Creative Studio Portfolio。
- Professional Enterprise Home。
- Automotive Product Launch。
- Premium Product Page。
- AI Tool Dashboard。

其中 `Premium Product Page` 是当前 MVP registry 的过渡项，后续建议拆分为：

- `Product Launch Page` 或 `Product Detail Page` 场景。
- `Premium Minimal` 视觉。
- `Apple-inspired` 参考品牌。

后续候选：

- SaaS Conversion Landing。
- Product Detail Page。
- Campaign Page。

## 7. 安全与版本

- 官方模板必须版本化。
- 用户模板必须记录来源 artifact id/version。
- 模板不能包含 runtime 路径指令。
- 模板不能覆盖安全 guardrails。
- 创建 job 时保存模板 snapshot，避免旧 session resume 读取新版本模板。
- 参考品牌必须有 `inspiration_only` 语义和 forbidden rules。
- 用户自由补充风格词不能提升工具权限、不能覆盖 runtime cwd、不能声明绝对路径。

## 8. UI 迁移建议

当前工作台 composer 中的四项入口：

```text
风格 / 领域 / 审美 / 配色
```

建议迁移为：

```text
场景 / 视觉 / 高级
```

迁移规则：

- 原 `Domain` 面板改名为 `Scene`。
- 原 `Aesthetic` 面板改名为 `Visual`。
- 原 `Palette` 面板移动到 `Advanced` 内部。
- 原 `Styles` 面板改名为 `Supplement` 或 `Style notes`，移动到 `Advanced` 内部。
- 新增 `Reference brand` 和 `Negative requirements` 的文档与契约预留。
- Capability summary 默认展示场景、视觉、loop；色板可作为次级摘要展示，避免主摘要过满。

## 9. Open Design 参考映射

Open Design 的模板体系对 DUDesign 有参考价值，但不建议直接照搬成更多并列分类。它真正值得借鉴的是把“生成方向”拆成多个独立平面：

| Open Design 概念 | DUDesign 对应建议 | 说明 |
| --- | --- | --- |
| Mode / Surface | 暂由 DUDesign source mode 和 artifact type 承担 | Open Design 区分 prototype、deck、image、video、live artifact；DUDesign MVP 聚焦 HTML 页面，后续可扩展为 output surface |
| Scenario | 场景 / `DomainTemplate` | 用于描述任务类型和信息架构，例如 marketing、product、finance、operation |
| Design System / `DESIGN.md` | 中期 `DesignSystem` / `BrandStyleReference` | 用于沉淀品牌、色彩、字体、组件、语气和反模式，比单个“参考品牌”更稳定 |
| Skill / Design Template | Plugins / Skill 子模块 | 用于声明方法论、输入参数、检查清单和生成流程，不应与视觉模板混在一起 |
| Prompt Template Gallery | 灵感模板 / prompt starter | 用于一键填充 brief 或展示示例，不等同于正式 capability snapshot |

Open Design 的 `template.json` 字段也可作为 DUDesign 后续扩展 `AestheticProfile` 的参考：

- `mood`：视觉情绪标签。
- `occasion`：适用场景。
- `tone`：表达语气。
- `formality`：正式程度。
- `density`：信息密度。
- `palette`：色板描述。
- `typography`：字体与排版气质。
- `best_for`：适用任务。
- `avoid_for`：不适用任务。

DUDesign 不应把这些字段全部暴露给用户。推荐做法是：

- 用户端只展示精炼摘要：适合什么、视觉气质、避免什么。
- 后端 registry 保存完整字段，用于 runtime prompt 编译和管理端治理。
- 创建 job 时保存 capability snapshot，避免官方模板更新影响历史 session。

## 10. 前端选择器建议

短期 MVP 的首页 composer 仍保持轻量：

```text
Prompt
来源：新建 / 基于已有 HTML
变体数量
设计方向：场景 · 视觉 · 高级
模型
生成
```

点击“设计方向”后打开单个选择面板，而不是多个互相竞争的小菜单。

### 10.1 场景页

用于回答“我要做什么”。

推荐布局：

- 顶部搜索。
- 左侧场景列表。
- 右侧展示推荐结构、必需模块、行业限制和 variation directions。
- 支持分类筛选，例如 Marketing、Product、Business、Creative、Operations。

### 10.2 视觉页

用于回答“看起来是什么气质”。

推荐布局：

- 卡片列表展示视觉名称、mood、density、formality。
- 卡片内展示 3-5 个色彩 swatch，但不让色板抢占主选择。
- 右侧详情展示 `best_for`、`avoid_for`、typography、layout、motion。
- 视觉选择后自动选择默认色板，用户可在高级里覆盖。

### 10.3 高级页

用于覆盖默认参数，默认可折叠。

包含：

- 色板：从当前视觉允许的 `colorPaletteIds` 中选择。
- 补充风格词：自由文本或标签。
- 参考品牌：短期只做 `inspiration_only` 选择；中期升级为 Design System。
- 负面要求：自由文本，Runtime Gateway 编译为受控 negative rules。

### 10.4 中期 Design System 入口

Open Design 的 `DESIGN.md` 思路说明，品牌参考最终应升级为独立 Design System 能力，而不是永远停留在“高级字段”。

DUDesign 中期可增加：

- 官方 Design System：Apple-inspired、Stripe-like、Linear-like、Enterprise Neutral 等。
- 用户 Design System：从已有 HTML、上传素材、历史 variation 中提取。
- 工作区 Design System：团队协作阶段共享。

Design System 应记录：

- color tokens。
- typography rules。
- spacing/layout principles。
- component patterns。
- motion rules。
- voice/copy tone。
- anti-patterns。

在 UI 中，Design System 可以作为高级页里的“参考品牌”升级入口，也可以在成熟后成为 composer 的独立 pill。

## 11. DESIGN.md 与 Template Pack 治理

参考 `google-labs-code/design.md` 和 `VoltAgent/awesome-design-md` 后，DUDesign 可以吸收两类能力：

- `DESIGN.md` 规范层：用 YAML front matter 表达机器可读 token，用 Markdown 正文表达设计意图、组件规则、Do / Don't。
- 设计模板库分发层：按行业、产品类型和视觉气质组织可复用设计系统，让 agent 在生成前获得稳定的视觉上下文。

### 11.1 外部兼容格式

`DESIGN.md` 适合作为 DUDesign 的导入/导出格式：

- 用户可以上传或粘贴 `DESIGN.md`。
- 系统解析 color、typography、spacing、rounded、components。
- 系统保留正文中的 overview、colors、typography、layout、components、do/don'ts。
- 系统对 broken token reference、未知字段、重复 section、低对比度等问题给出 lint finding。
- 导入结果可保存为用户私有 Design Template。

`DESIGN.md` 当前仍是 alpha 思路，因此 DUDesign 不应把业务存储直接绑定到外部 schema。推荐做法：

```text
DESIGN.md import/export
        ↓
DesignTemplatePack adapter
        ↓
DUDesign stable capability contract
        ↓
Runtime Gateway prompt compiler
```

### 11.2 内部 Template Pack

DUDesign 内部建议定义 `DesignTemplatePack`，用于承载比 `AestheticProfile` 更完整的视觉系统。

```ts
type DesignTemplatePack = {
  id: string
  source: 'official' | 'user' | 'workspace' | 'imported'
  format: 'dudesign-template-v1' | 'design-md'
  visibility: 'private' | 'workspace' | 'public'
  status: 'draft' | 'published' | 'archived' | 'disabled'
  name: string
  description: string
  version: string
  designTokens: {
    colors: Record<string, string>
    typography: Record<string, unknown>
    spacing?: Record<string, string | number>
    rounded?: Record<string, string>
    components?: Record<string, unknown>
  }
  rationale: {
    overview?: string
    layout?: string
    components?: string
    dos?: string[]
    donts?: string[]
  }
  previewArtifactId?: string | null
  lintStatus: 'unknown' | 'passed' | 'warning' | 'failed'
  createdByUserId?: string | null
}
```

### 11.3 官方模板策略

公开品牌设计系统可以作为研究参考，但 DUDesign 官方模板不应直接复制品牌名称、logo、专有字体、品牌文案或明显 trade dress。官方模板应抽象为通用风格包，例如：

- Premium Product Launch。
- Trust-Centered Fintech。
- Editorial Creative Portfolio。
- Enterprise Clarity。
- Mobility Launch。
- Developer Workflow。
- Warm Commerce。
- Data-Dense Operations。

这些模板应表达设计特征，而不是表达“做一个 Apple / Linear / Vercel 克隆”。

官方启发式模板的治理规则：

- 名称使用通用产品/场景语言，不使用公开品牌名。
- `rationale.donts` 必须显式包含反克隆约束，例如不复制 logo、字体、页面 chrome、摄影风格、专有文案或明显 trade dress。
- 每个模板必须能 export 为 `DESIGN.md`，并能重新 import 为 `DesignTemplatePack`。
- 模板只表达设计方向，不表达任何官方背书、合作关系或品牌从属关系。
- 视觉差异通过 token、排版、布局、组件结构和反模式约束生成，不通过借用某个品牌外观生成。

首批官方模板建议作为 API seed 管理，进入 UI 前先完成 lint、DESIGN.md export/import round-trip 和预览 smoke。

| Template Pack | 适用场景 | 设计重点 | 主要反模式 |
|---|---|---|---|
| Premium Product Launch | 高价值产品、硬件、精品 SaaS 发布页 | 产品实物/界面早露出、克制高级感、强 CTA | 不复制任何公开品牌页面 chrome、摄影风格或专有文案 |
| Trust-Centered Fintech | 金融科技、支付、账单、费用管理 | 清晰费用、风险/安全说明、可审计指标 | 不模仿银行、卡组织或支付公司 trade dress |
| Editorial Creative Portfolio | 艺术家、设计师、工作室、摄影作品集 | 作品主导、杂志节奏、叙事 caption | 不用抽象背景替代作品，不堆砌徽章 |
| Enterprise Clarity | B2B、企业服务、采购决策 | 信息密度、部署/安全证据、比较表 | 不把运营/企业工具做成大幅营销空壳 |
| Mobility Launch | 汽车、交通、机器人、硬件移动产品 | 物体可检视、参数条、运动线索 | 不复制车企徽章、格栅、字体或发布页视觉 |
| Developer Workflow | API、CLI、基础设施、开发者工具 | 真实代码、quickstart、状态和集成 | 不使用不可读代码纹理，不复制开发平台页面 chrome |
| Warm Commerce | 生活方式电商、精选商品、转化页 | 商品检视、购买路径、温暖可信 | 不隐藏购买控件，不复制电商/时尚品牌 trade dress |
| Data-Dense Operations | Dashboard、admin、监控、工作流工具 | 扫描、筛选、表格、状态、重复操作 | 不把操作型工具做成 landing page，不用卡片替代表格 |

### 11.4 用户自定义模板

用户模板来源可以包括：

- 上传 `DESIGN.md`。
- 从已有 HTML 或历史 variation 中提取。
- 从一次满意的 variation 保存为模板。
- 在模板编辑器中手动修改 token 和规则。

用户模板必须按 `userId` / `workspaceId` 隔离，可作为默认偏好，但不能污染官方 registry。用户偏好只保存 template id、skill id 和 profile id；真正生成依据仍随 job snapshot 保存完整版本。

### 11.5 多变体分配

当用户选择生成 N 个变体时，模板系统可以有两种模式：

- 单模板多方向：同一个 Design Template Pack 下生成不同 layout / copy / section 方向。
- 多模板分配：系统为 N 个 variation 分配不同官方模板或用户收藏模板，制造更明显的视觉差异。

无论哪种模式，每个 variation 都必须保存自己的 capability snapshot，确保后续 refine、share、resume 不漂移。

### 11.6 中期 DesignSystem 能力

`DesignTemplatePack` 解决的是“本次生成可用的视觉上下文”。中期 `DesignSystem` 要解决的是“长期可复用、可治理、可从作品中沉淀的品牌/产品设计系统”。

推荐将 `DesignSystem` 放在 `DesignTemplatePack` 之上：

```text
DESIGN.md / variation / user editor
        ↓
DesignTemplatePack
        ↓
DesignSystem version
        ↓
Job snapshot / Runtime prompt compiler
```

中期 `DesignSystem` 能力建议覆盖：

| 能力 | 内容 | 用途 |
|---|---|---|
| Brand Tokens | 核心色、语义色、背景/前景、边框、状态色、密度 token | 让同一用户/工作区生成结果有稳定品牌基因 |
| Typography | 字族、字号阶梯、字重、行高、标题/正文/标签/代码样式 | 避免每次 prompt 都重新发明排版体系 |
| Components | Button、Card、Nav、Table、Form、Pricing、Hero、Code Panel 等组件规则 | 让 agent 按已有组件语义生成，而不是只写散装样式 |
| Motion | 动效强度、持续时间、缓动、进入/悬停/切换规则 | 控制动效克制程度，避免无意义动画 |
| Voice | 文案语气、CTA 风格、说明文字密度、术语偏好 | 让视觉和文案保持一致 |
| Anti-patterns | 明确禁止：品牌克隆、过度渐变、低对比、信息遮挡、无关装饰等 | 将“不要做什么”结构化，降低生成漂移 |

`DesignSystem` 与当前高级字段的关系：

- 高级字段里的“色板 / 补充风格词 / 参考品牌 / 负面要求”是一次 job 的轻量约束。
- `DesignTemplatePack` 是可保存、可 import/export 的模板资产。
- `DesignSystem` 是更完整的长期资产，可以从用户选择的模板、历史 variation、上传素材和人工编辑中沉淀。

治理要求：

- `DesignSystem` 必须版本化，job 只引用 snapshot，不直接引用 mutable latest。
- 用户私有 `DesignSystem` 按 `userId / workspaceId` 隔离，不能污染官方模板。
- 官方 `DesignSystem` 不得使用公开品牌名作为模板身份，不得包含 logo、专有字体、官方文案或可识别 trade dress。
- Runtime Gateway 只能接收业务层解析后的标准设计上下文，不直接读取原始 `DESIGN.md` 或用户上传文档。
