# DUDesign 模板与 Skill 自助创作治理规划

> 文档状态：规划准入
> 日期：2026-07-13
> 主责模块：Capability Distribution System
> 关联模块：User Experience、Admin Console、Application Service、Runtime Compatibility
> 输入案例：`明星组合动态百科功能设计文档.md`
> 目标版本：Template Draft v2 / Capability Authoring v1

## 1. 文档准入结论

本规划允许进入 DUDesign 文档库，并作为 Capability Distribution System 后续推进基线。

准入原因：

- 当前产品已经具备 `DESIGN.md` 导入、私有模板持久化、模板选择、variation 保存模板和官方 safe skill 选择能力。
- 当前“保存为模板”主要保存原模板快照和 `previewArtifactId`，尚不能从 HTML 中提取可稳定复用的视觉、结构和交互约束。
- 普通业务功能文档可以被现有 `DESIGN.md` importer 粗粒度保存，但不会自动拆分为 Template、Skill、Interaction Paradigm、Data Contract 和 Review Profile。
- 用户端只能选择官方 Skill，无法创建和维护声明式私有 Skill。
- 管理端可以查看模板和 Skill 治理摘要、禁用风险插件，但模板/Skill 编辑、审核、发布、归档和贡献晋级仍未形成闭环。
- 这些缺口直接影响“用户沉淀自己的设计方法”和“运营人员持续建设官方业务模板”的核心产品价值。

准入后的边界要求：

- 本能力属于 Capability Distribution System，不新增第五层架构。
- Template 继续负责视觉系统和页面结构。
- Skill 继续负责生成方法、负向约束和质量检查。
- Interaction Paradigm 继续作为独立契约，不塞入视觉模板字段。
- 普通功能文档不能未经结构化、lint 和人工确认直接发布为模板或 Skill。
- HTML 不能自动推导出事实治理、业务规则和工具权限。
- 用户 Skill 首版只允许声明式规则，不允许代码、shell、绝对路径和权限提升。
- Runtime Gateway 只消费已授权、已快照化的标准能力上下文，不读取用户原始 Markdown 或任意 HTML 文件。

## 2. 背景与问题定义

DUDesign 当前存在两条看似可用、实际能力不足的链路。

### 2.1 功能文档导入链路

用户可以把文本粘贴到 `DESIGN.md` 导入入口，但现有 importer 主要识别：

- YAML front matter。
- colors、typography、spacing、rounded、components。
- Overview、Colors、Typography、Layout、Components。
- Do's and Don'ts。
- broken reference、颜色对比度和危险指令。

以“明星组合动态百科功能设计文档”为例，直接导入的实际结果是：

- 模板名回退为 `Imported Design Template`。
- 所有设计 token 为空。
- 标准 Overview、Layout、Components、Do/Don't 为空。
- 八个业务章节仅作为 unknown sections 原样保存。
- importer 不理解成员模型、Unit、小分队、作品归属、时间线、双向同步和事实治理。

因此，现有入口只能做到“保存文本”，不能做到“把产品设计文档规范化为可执行能力”。

### 2.2 HTML 保存模板链路

用户可以在 variation 页面把当前 HTML 保存为“我的模板”，但当前实现主要是：

- 若 variation 使用过 Design Template Pack，则复制该模板快照。
- 保存当前 HTML artifact id 为 `previewArtifactId`。
- 若没有原模板，则创建一个 tokens 为空的 fallback pack。

Runtime Gateway 创建新任务时实际消费：

- designTokens。
- rationale。
- dos / donts。
- sections。
- htmlExamples。
- Interaction Paradigm。
- Skill prompt blocks。

`previewArtifactId` 当前主要用于预览和 usage 关联，不会自动把源 HTML 注入新任务。因此当前能力更接近“收藏设计方向”，尚不是高保真模板复用。

## 3. 建设目标

### 3.1 产品目标

让用户和运营人员可以通过三种来源创建可复用能力：

1. 标准 `DESIGN.md`。
2. 普通业务功能设计文档。
3. 已完成的 HTML variation/artifact。

创作结果可以包含：

- Design Template Pack。
- Declarative Design Skill。
- Interaction Paradigm。
- Data Contract。
- Review Profile。
- HTML reference examples。
- Capability Bundle。

### 3.2 治理目标

- 每个候选能力都有明确来源、版本、所有者和许可信息。
- 自动提取结果必须携带 confidence 和 evidence。
- 用户必须确认系统无法可靠推断的字段。
- 私有模板和私有 Skill 不影响其他用户。
- 官方发布必须经过 lint、diff、preview smoke、风险审查和审计。
- 旧 job/session 始终使用创建时 capability snapshot。
- BabeL-O 或其他 Runtime Provider 的更新不改变 DUDesign 内部能力契约。

### 3.3 非目标

首版不实现：

- 从任意 HTML 自动推导完整业务事实模型。
- 从 HTML 自动生成可执行插件代码。
- 用户上传任意 JavaScript 作为 Skill。
- 用户自行授予 MCP、网络、文件系统或模型权限。
- 自动把用户模板发布到官方 registry。
- 自动复制第三方品牌、专有字体、Logo 或明显 trade dress。
- 用大模型输出直接覆盖现有官方模板。

## 4. 核心概念

### 4.1 Authoring Source

能力创作输入来源：

```ts
type CapabilityAuthoringSource =
  | { type: 'design_md'; artifactId?: string; contentHash: string }
  | { type: 'product_spec_markdown'; artifactId?: string; contentHash: string }
  | { type: 'variation_artifact'; variationId: string; artifactId: string; artifactVersion: number }
  | { type: 'manual'; createdByUserId: string }
```

来源必须固定到 artifact/version 或 content hash，避免后续内容变化导致候选能力漂移。

### 4.2 Capability Authoring Draft

统一承载创作过程：

```ts
type CapabilityAuthoringDraft = {
  id: string
  ownerUserId: string
  workspaceId: string
  source: CapabilityAuthoringSource
  status:
    | 'analyzing'
    | 'needs_confirmation'
    | 'lint_failed'
    | 'preview_pending'
    | 'ready'
    | 'published_private'
    | 'submitted_for_review'
    | 'rejected'
    | 'archived'
  candidateBundle: CapabilityBundleDraft
  findings: CapabilityAuthoringFinding[]
  createdAt: string
  updatedAt: string
}
```

### 4.3 Template Draft v2

Template Draft v2 是从 HTML、`DESIGN.md` 或普通文档形成的候选模板，不直接等同于已发布 `DesignTemplatePack`。

```ts
type DesignTemplateDraftV2 = {
  schemaVersion: 'dudesign-template-draft.v2'
  name: string
  description: string | null
  designTokens: DesignTemplatePack['designTokens']
  rationale: DesignTemplatePack['rationale']
  responsiveRules: ResponsiveRule[]
  sectionBlueprints: SectionBlueprint[]
  componentBlueprints: ComponentBlueprint[]
  interactionParadigmIds: string[]
  htmlExamples: HtmlExampleReference[]
  sourceEvidence: ExtractionEvidence[]
  confidence: Record<string, number>
}
```

### 4.4 Declarative Skill Draft

```ts
type DesignSkillDraft = {
  schemaVersion: 'dudesign-skill-draft.v1'
  name: string
  description: string
  category: string
  rules: string[]
  promptBlocks: string[]
  negativeRules: string[]
  qualityChecklist: string[]
  allowedTemplateCategories: string[]
  requestedScopes: PluginPermissionScope[]
  safetyLevel: 'safe' | 'review_required'
}
```

首版 `requestedScopes` 只能由系统展示和管理员裁决，用户不能自行提升权限。

### 4.5 Capability Bundle Draft

业务功能文档通常不是单一 Template，因此需要 Bundle：

```ts
type CapabilityBundleDraft = {
  templatePacks: DesignTemplateDraftV2[]
  skills: DesignSkillDraft[]
  interactionParadigms: InteractionParadigmDraft[]
  dataContracts: DataContractDraft[]
  reviewProfiles: ReviewProfileDraft[]
  recommendedCapabilityProfile: CapabilityProfileDraft
}
```

## 5. 输入模式

### 5.1 标准 DESIGN.md 导入

当前能力保留并升级。

升级项：

- 支持文件上传和粘贴文本。
- 导入结果先进入 draft，不再无条件直接成为 `published` 私有模板。
- lint error 时禁止发布。
- lint warning 时要求用户确认或修复。
- 提供 token、section、Do/Don't 可视化编辑。
- 支持预览 smoke。
- 支持导出回 `DESIGN.md`。

### 5.2 普通功能设计文档导入

新增 `Capability Spec Importer`。

处理流程：

```text
上传/粘贴 Markdown
  -> 文档类型识别
  -> 章节和表格结构化
  -> 业务实体/字段/状态提取
  -> 页面模块提取
  -> 交互策略提取
  -> 视觉信息识别
  -> 生成策略与质量规则提取
  -> 风险/事实治理提取
  -> 形成 Capability Bundle Draft
  -> 用户逐项确认
```

系统必须明确标记：

- 原文直接证据。
- 系统推断内容。
- 缺失且需要用户补充的字段。
- 不能转换为 Template 的内容。
- 不能自动授予的权限和 MCP 能力。

### 5.3 HTML 反向模板化

新增 `HTML -> Template Draft v2`。

处理对象必须是固定的 HTML artifact version。

提取内容：

- CSS 颜色和语义色角色。
- 字体族、字号、字重、行高。
- spacing scale。
- border radius。
- 阴影和层级。
- 页面 section 顺序和主要容器。
- 常见组件类型。
- Grid/Flex 布局。
- 响应式 media query。
- Desktop/Tablet/Mobile 差异。
- Tab、Accordion、Modal、Page Switcher 等本地交互。
- 资源依赖。
- 可访问性基础状态。
- HTML reference example。

不能自动推断：

- 业务事实真实性。
- 页面模块背后的业务优先级。
- 成员状态、作品归属等领域语义。
- 用户授权、工具权限和外部数据源。
- 争议内容治理规则。

这些字段必须通过 Skill、Data Contract 或 Review Profile 补充。

### 5.4 手工创作

为高级用户和运营人员提供结构化编辑器：

- Template tokens。
- Section blueprints。
- Component rules。
- Do/Don't。
- Skill rules。
- Negative rules。
- Quality checklist。
- 适用模板分类。
- Interaction Paradigm 选择。
- Preview example。

不提供自由脚本编辑器。

## 6. 明星组合动态百科案例拆分

该文档应形成一个业务 Capability Bundle，而不是直接导入为单一视觉模板。

### 6.1 Parent Business Template Package

建议：

```text
dtp_de_celebrity_group
```

职责：

- 组合身份。
- 当前成员。
- 历任成员。
- 成员变动。
- Unit。
- 团体作品。
- 团体与成员互跳。

### 6.2 Child Templates

建议候选：

```text
dtp_de_celebrity_group_overview
dtp_de_celebrity_group_current_members
dtp_de_celebrity_group_member_timeline
dtp_de_celebrity_group_unit_tree
dtp_de_celebrity_group_works
```

这些模板只负责页面模块结构、视觉密度和组件表达。

### 6.3 Design Skills

建议：

```text
sk_celebrity_group_information_architecture
sk_celebrity_group_fact_governance
```

生成方法：

- 成员体系优先于普通简介。
- 首屏必须呈现当前成员。
- 当前成员和历任成员分开。
- 团体作品和个人作品分开。
- Unit 支持多重归属。
- 所有成员变化保留时间维度。

事实治理：

- 离开原因只能使用公开中性表述。
- 不确定信息必须标注待核实。
- 已故成员保留历史身份并避免娱乐化表达。
- 团体页与成员页冲突时不得静默覆盖。

### 6.4 Interaction Paradigms

建议复用或扩展：

- Tab navigation。
- Member matrix。
- Timeline。
- Hierarchical tree。
- Relationship graph。
- Local sort/filter。

### 6.5 Data Contract

```ts
type CelebrityGroupData = {
  identity: {
    name: string
    aliases: string[]
    groupType: string
    formedAt?: string
    debutedAt?: string
    company?: string
    activityStatus: 'active' | 'hiatus' | 'disbanded' | 'limited_ended' | 'unknown'
  }
  currentMembers: GroupMember[]
  formerMembers: GroupMember[]
  membershipEvents: MembershipEvent[]
  units: GroupUnit[]
  groupWorks: GroupWork[]
}
```

### 6.6 Review Profile

硬性检查：

- 当前成员模块是否存在。
- 成员状态是否字段化。
- 团体作品是否混入个人作品。
- Unit 是否错误建模为互斥归属。
- 退出/争议原因是否缺少来源或中性措辞。
- 时间线是否缺少时间字段。
- 页面是否把成员体系降级成长段文本。

## 7. HTML -> Template Draft v2 技术流程

### 7.1 输入冻结

- 校验用户对 variation/artifact 的访问权限。
- 要求 artifact kind 为 HTML。
- 固定 `artifactId + version + contentHash`。
- 读取同一 parent artifact 的 CSS、JS、图片和字体资产。
- 记录 source provenance。

### 7.2 静态解析

使用结构化 parser：

- HTML：DOM parser。
- CSS：PostCSS 或等价 AST parser。
- JavaScript：只分析受控本地交互特征，不执行任意代码。
- 媒体查询：CSS AST。
- 资产引用：Artifact resolver。

禁止使用正则作为主要 HTML/CSS 解析器。

### 7.3 Token 提取

输出：

- 原始 token 候选。
- 合并后的语义 token。
- 使用次数。
- DOM/CSS 证据位置。
- confidence。

示例：

```json
{
  "colors": {
    "surface": "#ffffff",
    "textPrimary": "#171717",
    "accent": "#2454ff"
  },
  "confidence": {
    "colors.surface": 0.96,
    "colors.accent": 0.82
  }
}
```

### 7.4 结构提取

识别：

- Header。
- Hero/summary。
- Content sections。
- Repeated card/list/grid。
- Navigation。
- Footer。
- 固定尺寸画布。
- 内部滚动区域。
- 主要视觉焦点。

系统只生成候选 section blueprint，用户可以重命名和调整优先级。

### 7.5 交互识别

识别本地交互：

- Tab 与 panel 的对应关系。
- Accordion 展开。
- Modal。
- Page switcher。
- Carousel。
- 排序/筛选。

识别结果只用于推荐现有 Interaction Paradigm 或创建 draft，不直接生成任意执行代码。

### 7.6 HTML Example

源 HTML 可以作为 `htmlExamples` 候选，但必须经过：

- 移除真实隐私数据。
- 移除第三方品牌标识和受保护资产。
- 移除网络请求。
- 移除外部脚本。
- 检查绝对路径。
- 检查 iframe 和下载环境可运行性。
- 标注“仅参考结构和视觉节奏，不复制内容事实”。

### 7.7 Preview Smoke

候选模板至少生成一个新主题页面并验证：

- 不依赖源 artifact 的偶然内容。
- Desktop/Tablet/Mobile 可渲染。
- 没有空白或全黑。
- 本地交互可用。
- share/export 安全边界不被破坏。
- 新生成结果与源 HTML 有方向一致性，但不是逐字复制。

## 8. 普通文档 -> Capability Bundle 技术流程

### 8.1 Deterministic Preflight

先进行确定性解析：

- 标题层级。
- 表格。
- 列表。
- 代码块。
- 字段定义。
- 风险与治理章节。
- 指标与验收章节。

### 8.2 Agent-assisted Decomposition

可调用受控 agent 协助分类，但输出必须符合 DUDesign schema。

Agent 只生成 draft，不直接写 registry。

输出必须包含：

- source section。
- extracted statement。
- target capability type。
- confidence。
- unresolved questions。

### 8.3 Human Confirmation

前端以分步方式确认：

1. 页面模块。
2. Template 与视觉约束。
3. Skill 与生成方法。
4. Interaction Paradigm。
5. Data Contract。
6. Review Profile。
7. 权限与外部能力需求。

未确认项不能进入 private published 状态。

## 9. 用户端规划

### 9.1 Capability Authoring Studio

新增统一入口：

```text
模板库
  -> 创建能力
     -> 导入 DESIGN.md
     -> 导入功能设计文档
     -> 从 HTML/Variation 创建
     -> 手工创建
```

### 9.2 Draft Review 页面

建议视图：

- Source。
- Template。
- Skill。
- Data。
- Review。
- Preview。
- Findings。

每个自动提取字段展示：

- 值。
- confidence。
- source evidence。
- 是否由用户确认。

### 9.3 HTML 保存入口升级

Variation 页的“保存为模板”改为：

```text
保存为模板
  -> 快速收藏设计方向
  -> 提取为可复用模板
  -> 创建模板 + Skill 能力包
```

默认推荐“提取为可复用模板”。

### 9.4 模板导出

用户可以导出：

- `DESIGN.md`。
- DUDesign Template Pack JSON。
- Capability Bundle ZIP。

Capability Bundle v1 使用以下稳定结构；manifest 是唯一文件索引，portable draft 通过路径引用 HTML examples：

```text
manifest.json
capability/
  draft.json
  # 包含 Template Draft、Skill、Interaction Paradigm、Data Contract、Review Profile
  # 和 recommendedCapabilityProfile；环境绑定 artifact id 不进入 portable draft。
examples/
  template-001/
    example-001.html
  template-002/
    example-001.html
provenance.json
```

`manifest.json` 必须声明：

- `schemaVersion`、`bundleId`、format、创建时间和能力数量。
- 每个文件的 path、kind、media type、size 和 SHA-256。
- 固定入口 `capability/draft.json` 与 `provenance.json`。

导入门禁：

- 限制 ZIP 压缩体积、文件数、单文件大小和总解压大小。
- 拒绝绝对路径、`..`、重复路径、未声明文件、hash/size 不一致和未被模板引用的 HTML example。
- provenance 不携带 owner/workspace identity 或本地文件系统路径；evidence excerpt/path 执行脱敏。
- HTML example 必须在目标环境重新 sanitizer，写入独立 authoring asset，并重新执行 preview smoke 后才允许 private publish。

当前 API：

```text
POST /api/capability-authoring/drafts/:id/export-bundle
POST /api/capability-authoring/import-bundle
```

导出仅允许 `ready` / `published_private` draft，导入始终生成 governed draft，不直接发布。

未来可在 ZIP 中增加可选兼容视图，但不能取代 manifest 中的 stable portable draft：

```text
compatibility/
  DESIGN.md
  template-pack.json
```

原建议的按能力类型拆分文件在 v1 暂不采用，避免同一 bundle 同时存在多份事实来源：

```text
skills/
interaction-paradigms/
data-contracts/
review-profiles/
```

## 10. 管理端规划

### 10.1 Contribution Inbox

展示：

- 用户和 workspace。
- 来源类型。
- source/license 声明。
- lint。
- diff。
- preview smoke。
- HTML example 风险。
- 使用数据。
- 品牌/trade dress 风险。
- requested scopes。

### 10.2 Review Actions

允许：

- Request changes。
- Reject。
- Approve as community。
- Promote to official。
- Disable。
- Archive。
- Roll back current version。

所有操作写入：

```text
capability.governance.change
```

### 10.3 Skill Governance

管理员必须能查看：

- rules。
- prompt blocks。
- negative rules。
- checklist。
- allowed categories。
- requested scopes。
- compiled prompt preview。
- Runtime contract smoke。

用户不能通过贡献流程获得更高工具权限。

## 11. 应用服务规划

建议提取：

```text
CapabilityAuthoringApplicationService
CapabilityReviewApplicationService
```

前者负责：

- 创建 draft。
- 读取冻结 source。
- 调度提取。
- 保存用户确认。
- lint。
- preview smoke。
- private publish。
- export。

后者负责：

- contribution candidate。
- diff。
- source/license。
- risk review。
- official publish/disable/archive/rollback。
- audit。

应用服务是能力事实来源，不让 Runtime Provider 直接写模板 registry。

## 12. Runtime Compatibility 规划

新增稳定契约：

```ts
type RuntimeDesignContextV1 = {
  templates: RuntimeTemplateContext[]
  skills: RuntimeSkillContext[]
  interactionParadigms: RuntimeInteractionContext[]
  dataContracts: RuntimeDataContractContext[]
  reviewProfile: RuntimeReviewProfileContext | null
}
```

要求：

- Gateway 只消费已发布或本 job 已快照化的 capability。
- 原始 Markdown 不进入 Runtime。
- `previewArtifactId` 不作为隐式生成上下文。
- HTML example 必须显式进入标准字段。
- 不同 Runtime Provider 对同一 context 产生兼容事件。
- BabeL-O、CLI Agent 或后续 Provider 只影响 adapter/compiler。

## 13. 数据模型规划

新增或扩展：

### capability_authoring_drafts

- id。
- owner_user_id。
- workspace_id。
- source_type。
- source_artifact_id。
- source_content_hash。
- status。
- draft_bundle JSONB。
- findings JSONB。
- created_at。
- updated_at。

### capability_contributions

- id。
- draft_id。
- submitted_by_user_id。
- target_scope。
- license_declaration。
- brand_risk_declaration。
- status。
- reviewer_user_id。
- review_reason。
- created_at。
- reviewed_at。

### design_skills / design_skill_versions

- id。
- plugin_id。
- owner_user_id。
- workspace_id。
- visibility。
- status。
- current_version。
- schema_version。
- safety_level。
- created_at。
- updated_at。

版本表保存完整声明式 Skill。

### capability_bundle_versions

保存 Template、Skill、Interaction、Data Contract 和 Review Profile 的组合版本。

## 14. API 草案

### 用户侧

```text
POST /api/capability-authoring/drafts
POST /api/capability-authoring/drafts/:id/analyze
GET  /api/capability-authoring/drafts/:id
PATCH /api/capability-authoring/drafts/:id
POST /api/capability-authoring/drafts/:id/lint
POST /api/capability-authoring/drafts/:id/preview
POST /api/capability-authoring/drafts/:id/publish-private
POST /api/capability-authoring/drafts/:id/submit

GET /api/design-templates/:id/export-design-md
GET /api/capability-bundles/:id/export

POST /api/variations/:id/extract-template
POST /api/variations/:id/extract-capability-bundle

POST /api/design-skills
PATCH /api/design-skills/:id
GET /api/design-skills
```

### 管理侧

```text
GET  /api/admin/capability-contributions
GET  /api/admin/capability-contributions/:id
POST /api/admin/capability-contributions/:id/request-changes
POST /api/admin/capability-contributions/:id/reject
POST /api/admin/capability-contributions/:id/approve
POST /api/admin/capability-contributions/:id/promote-official

PATCH /api/admin/capabilities/templates/:id
PATCH /api/admin/capabilities/skills/:id
POST  /api/admin/capabilities/:id/rollback
```

## 15. 权限与隔离

### 用户

- 只能读取自己的 private draft/template/skill。
- workspace 共享能力需要 workspace member role。
- viewer 不可编辑。
- editor 可创建和编辑。
- owner/admin 可提交 contribution。

### 管理员

- support：只读。
- operator：审核、发布、禁用、归档。
- developer：registry schema、compiler 和高级回滚。

### Runtime

- 不能绕过 Application Service 读取用户草稿。
- 不能把未确认 draft 当作官方能力。
- 不能提升 MCP scope。
- 不能写 capability registry。

## 16. 安全与合规

- 保存 source artifact/content hash。
- 要求 source/license 声明。
- 检测品牌名、Logo、专有字体和明显 trade dress。
- HTML example 去除隐私信息、token、API key、绝对路径和外部脚本。
- Skill dangerous instruction lint。
- Prompt injection lint。
- 最大 prompt block 长度。
- 用户 Skill 不允许 executable content。
- 贡献内容可被禁用，但旧 job snapshot 仍可恢复。
- 官方发布必须可回滚。

## 17. 测试计划

### 单元测试

- HTML token extraction。
- DOM section extraction。
- CSS media query extraction。
- interaction detection。
- source evidence mapping。
- 普通 Markdown decomposition schema。
- Skill dangerous instruction lint。
- Capability Bundle export/import round-trip。
- DESIGN.md export API。

### 集成测试

- variation artifact -> Template Draft v2。
- artifact assets -> HTML example package。
- draft -> lint -> preview -> private publish。
- 普通功能文档 -> Bundle Draft。
- private Skill CRUD。
- contribution submit -> admin review。
- official publish -> new job。
- old job snapshot 不漂移。

### E2E

- 从 variation 提取模板 -> 编辑 -> preview -> 保存 -> 新任务使用。
- 粘贴明星组合文档 -> 生成 Bundle Draft -> 确认模块 -> private publish。
- 用户创建声明式 Skill -> 新任务选择 -> snapshot 展示。
- 用户导出 `DESIGN.md` 和 Capability Bundle ZIP。
- 管理员审核 contribution -> 发布 -> 用户可见。

### Runtime Contract

- Template Draft 发布后编译为标准 template context。
- Skill 发布后编译为标准 skill context。
- HTML example 注入不包含真实业务事实复制指令。
- 未授权 MCP scope 不进入 tool policy。
- BabeL-O 和 CLI Agent fixture 对同一 context 保持 contract 兼容。

## 18. 里程碑

### M1：HTML -> Template Draft v2

- 冻结 source artifact/version。
- HTML/CSS parser。
- token、section、responsive、interaction 提取。
- source evidence/confidence。
- draft review API。

验收：

- 从无原模板的 HTML variation 中提取出非空 tokens、sections 和 HTML example。

### M2：模板编辑、预览与导出

- 用户端 Draft Review。
- lint 修复。
- preview smoke。
- private publish。
- `DESIGN.md` 和 Template Pack 导出。

验收：

- 导出的模板可重新导入，并用于新任务生成。

### M3：普通功能文档规范化

- Capability Spec Importer。
- Bundle Draft。
- Template/Skill/Interaction/Data/Review 拆分。
- 明星组合案例 golden fixture。

验收：

- 明星组合文档不再成为 token 全空的单一模板。
- 输出至少包含业务模板包、成员类子模板、声明式 Skill、Data Contract 和 Review Profile。

### M4：用户私有 Skill

- Skill CRUD。
- lint。
- private selection。
- snapshot。
- Runtime compilation。

验收：

- 用户可以创建安全声明式 Skill，并在新任务中复用。

### M5：管理端贡献与发布

- Contribution Inbox。
- diff/preview/risk。
- review actions。
- official publish/disable/archive/rollback。

验收：

- 用户贡献不能绕过管理审核进入官方 registry。

### M6：多 Runtime Provider 兼容

- `RuntimeDesignContextV1`。
- BabeL-O golden。
- CLI Agent fixture。
- provider drift contract tests。

验收：

- 能力创作系统不绑定 BabeL-O 私有 prompt 或事件。

## 19. 推荐实施顺序

优先级：

1. M1 HTML -> Template Draft v2。
2. M2 模板编辑、预览与导出。
3. M3 普通功能文档规范化。
4. M4 用户私有 Skill。
5. M5 管理端贡献与发布。
6. M6 多 Runtime Provider 兼容强化。

理由：

- M1/M2 可立即修复当前“保存为模板但无法高保真复用”的产品缺口。
- M3 建立后，运营人员才能把明星组合这类需求文档系统化转成能力包。
- Skill 创建依赖稳定的 draft/lint/version 基础。
- 官方发布必须建立在 private authoring 和 preview smoke 成熟之后。

## 20. 验收总标准

规划完成时应满足：

- 用户可以从标准 `DESIGN.md`、普通功能文档或 HTML 创建 draft。
- HTML 提取结果包含真实 tokens、sections、responsive rules 和 HTML example。
- 普通业务文档被拆为 Template、Skill、Interaction、Data Contract 和 Review Profile。
- 用户可以编辑并发布私有声明式 Skill。
- 用户可以导出 `DESIGN.md` 和 Capability Bundle。
- 管理端可以审核、发布、禁用、归档和回滚。
- 所有能力都版本化并写入 job snapshot。
- 旧 session resume 不受新版本影响。
- Runtime Gateway 只消费 DUDesign 标准能力上下文。
- BabeL-O 更新不影响模板/Skill 的业务数据模型和用户端契约。
