# Plugins

> 子模块：Plugins
> 所属模块：Capability Distribution System
> 目标：通过 skill、MCP tool 和权限策略辅助 agent 完成单次 prompt 的任务开发

## 1. 定位

Plugins 解决的是：

> 在某个模板领域/背景下，通过 skill 指导，并通过 MCP 协作辅助 agent 完成用户单次 prompt 的任务开发。

插件不是单纯 UI 扩展。它是受控能力编排：

- Skill 提供方法论和生成规则。
- MCP Tool 提供外部数据、资产、检索和验证能力。
- Permission Policy 控制工具权限、scope 和审计。

## 2. Skill

Skill 是声明式规则包，不是可执行代码插件。

Skill 可以包含：

- 设计原则。
- 输出约束。
- 负向约束。
- prompt block。
- quality checklist。
- domain heuristics。

示例：

- Static Export Safe。
- Fintech Conversion Copy。
- Premium Minimal Product Story。
- Accessibility First。
- Mobile-first Landing。

### 2.1 Design Skill 与 Design Template 的区别

Design Template 回答“页面看起来是什么样”，Design Skill 回答“生成时应该怎么做”。

| 类型 | 关注点 | 示例 |
| --- | --- | --- |
| Design Template | 视觉 token、布局气质、组件风格、品牌氛围 | Minimal SaaS、Dark Developer Tool、Editorial Landing |
| Design Skill | 信息架构方法、响应式策略、质量检查、特定页面生成流程 | High-conversion SaaS Landing、Mobile-first HTML、Static Export Safe |

Skill 可以引用或限制模板适用范围，但不能修改模板 registry，也不能覆盖模板 snapshot。创建 job 时，Application Service 负责把用户选择的 template + skill + loop 合成为 `Capability Profile`，Runtime Gateway 再把它编译为受控 prompt block。

MVP 阶段用户自定义 skill 只允许声明式内容：

- 生成策略。
- 质量 checklist。
- 响应式要求。
- 不可违反的负向规则。
- 可选 prompt block。

不允许：

- 任意脚本。
- shell 命令。
- 绝对路径。
- runtime cwd 修改。
- 工具权限提升。

## 3. MCP Tool

MCP Tool 是外部能力连接。

示例：

- 品牌资产库读取。
- 文档/知识库检索。
- 图片素材搜索。
- Figma/设计系统读取。
- GitHub 文件读取。
- 可访问性/性能检查工具。

MCP 必须明确：

- tool id。
- provider。
- scope：readonly/write/validate/search。
- user authorization。
- allowed template categories。
- audit policy。

## 4. Permission Policy

插件权限默认最小化。

建议 scope：

- `readonly_context`：只读上下文。
- `asset_readonly`：只读资产。
- `validation_only`：只做检查。
- `artifact_write`：允许写入生成产物，MVP 慎用。
- `external_network`：外部网络能力，需要显式授权。

MVP 默认只开放 readonly 和 validation。

## 5. 推荐数据模型

### CapabilityPlugin

```ts
type CapabilityPlugin = {
  id: string
  type: 'skill' | 'mcp_tool'
  visibility: 'official' | 'private' | 'workspace' | 'team'
  name: string
  description: string
  category: string
  safetyLevel: 'safe' | 'review_required' | 'disabled'
  status: 'active' | 'archived' | 'disabled'
}
```

### DesignSkill

```ts
type DesignSkill = {
  id: string
  pluginId: string
  schemaVersion: string
  rules: string[]
  promptBlocks: string[]
  negativeRules: string[]
  qualityChecklist: string[]
}
```

### McpToolBinding

```ts
type McpToolBinding = {
  id: string
  pluginId: string
  serverName: string
  toolName: string
  scopes: string[]
  requiresUserAuth: boolean
  allowedTemplateCategories: string[]
}
```

## 6. Runtime 编译

Plugins 编译为两类上下文：

- Skill context：进入 prompt。
- Tool policy：进入 Runtime Gateway / Adapter 工具权限配置。

Skill prompt block 可以影响 agent 的工作方法，但不能覆盖：

- runtime cwd。
- 文件写入路径。
- 工具权限。
- 模型选择。
- 用户权限。

## 7. 安全约束

- 用户 skill 不允许任意代码执行。
- 用户 skill 不允许系统命令。
- MCP 插件必须授权和审计。
- MCP 结果进入 prompt 前需要标注来源。
- 插件不能跨用户读取私有资产。
- 管理端必须能禁用风险插件。

## 8. CAP-9 外部能力规划

CAP-9 目标是把外部检索、素材生成和领域数据分析纳入受控能力分发，而不是让 runtime 或模板 skill 直接拼接外部 API 调用。

### 8.1 网络信息搜索 MCP

推荐能力命名：

- `plug_research_context`
- `sk_research_brief_builder`
- `mcp_agent_reach_search`
- `mcp_agent_reach_page_read`
- `mcp_agent_reach_social_scan`

优先参考 `Agent-Reach` 作为网络检索路由能力，覆盖网页、GitHub、社媒、视频和社区资料读取。DUDesign 不直接把 Agent-Reach 原始结果透传给 BabeL-O，而是先在业务服务层生成 `ResearchContextArtifact`。

```ts
type ResearchContextArtifact = {
  id: string
  query: string
  sources: Array<{
    url: string
    title?: string
    platform?: string
    retrievedAt: string
    licenseHint?: string
  }>
  summary: string
  citations: Array<{ sourceUrl: string; quote?: string; note: string }>
  confidence: 'low' | 'medium' | 'high'
  freshness: 'unknown' | 'stale' | 'recent'
  riskFlags: string[]
  rawPayloadHash: string
  reviewStatus: 'auto_reviewed' | 'human_review_required' | 'rejected'
}
```

治理要求：

- 搜索结果必须带来源和获取时间。
- 输出给 Runtime Gateway 的是审核后的摘要与引用，不是无限制原文。
- 社媒/社区内容需要标注可信度和主观性。
- 进入 job snapshot 时记录 artifact id、query、source hash 和 review status。

### 8.2 生成图片 MCP

推荐能力命名：

- `plug_image_generation`
- `sk_visual_asset_brief`
- `mcp_image_generation_ark_seedream`

图片生成 provider 可先支持火山方舟 `doubao-seedream-5-0-260128`，但 provider 调用必须由 DUDesign 后端服务执行，不允许 skill 或 prompt 内嵌 curl、API key 或 provider 私有参数。

```ts
type ImageGenerationRequest = {
  prompt: string
  negativePrompt?: string
  model: string
  size: '1K' | '2K' | '4K' | string
  responseFormat: 'url' | 'b64_json'
  watermark: boolean
  usageContext: 'hero' | 'background' | 'card_illustration' | 'icon_asset' | 'reference_only'
}
```

治理要求：

- `ARK_API_KEY` 只存在于服务端 secret，不进入 job snapshot 和 runtime prompt。
- 图片结果必须写入 artifact store，后续预览和导出使用 artifact id。
- 记录模型、prompt hash、size、watermark、cost 和内容安全结果。
- 若 provider 不可用，应返回标准降级事件，允许用户继续无图生成或替换素材。

### 8.3 双端差异化生产策略 Skill

推荐能力命名：

- `sk_dual_surface_strategy`

该 skill 用于把同一个用户需求拆成 PC / WISE / mobile 等端的差异化生成策略，尤其适合“动态百科词条卡片”这类固定尺寸和移动端 iframe 兼容要求强的业务模板。

输出建议：

- 每个端的 viewport、比例、关键交互和禁止项。
- PC 与 WISE 的信息密度差异。
- 移动端 touch/scroll/iframe 兼容要求。
- 每个 variation 的 template assignment 说明。

该 skill 应在模板选择环节作为推荐能力出现，并写入 capability snapshot。

### 8.4 数据输入获取分析 Skill

推荐能力命名：

- `sk_data_intake_analysis`

该 skill 用于把用户 prompt、URL、粘贴文本、表格、JSON、上传文件、democase 和搜索结果整理为结构化 brief。

```ts
type DataIntakeAnalysis = {
  inputSources: string[]
  topicSummary: string
  entities: Array<{ name: string; type: string; confidence: number }>
  fields: Array<{ name: string; value?: string; missing?: boolean }>
  recommendedScenarioTemplateIds: string[]
  recommendedDesignTemplatePackIds: string[]
  recommendedSkillIds: string[]
  riskFlags: string[]
}
```

治理要求：

- 原始输入与分析结果分离存储。
- 私有文件和用户 memory 不能跨用户/workspace 共享。
- 推荐模板必须能解释原因，不能静默覆盖用户选择。

### 8.5 模板融合与迭代更新机制

模板融合不是一个普通 plugin，而是 Templates 与 Automation Loop 的组合能力。

推荐流程：

```text
Source Templates + Variation Artifact + User Feedback
        ↓
Template Merge Plan
        ↓
Candidate DesignTemplatePack Version
        ↓
Lint + Diff + Preview Smoke
        ↓
Human/Admin Review
        ↓
Publish / Private Save / Reject
```

治理要求：

- 每次融合生成新 version，不覆盖历史版本。
- job snapshot 继续指向当时版本，resume 不漂移。
- 生成候选版本前必须保留来源模板和用户授权。
- 官方模板更新必须经过 CAP-6 管理端审核。

### 8.6 用户开发模板贡献机制

用户模板生命周期建议：

```text
private template
  -> workspace shared template
  -> contribution candidate
  -> reviewed community template
  -> official template
```

首版建议只实现 private -> contribution candidate，不直接开放社区市场。

治理要求：

- 用户提交时必须声明来源、许可、是否包含品牌 trade dress。
- 管理端可查看 lint、diff、preview smoke 和历史 usage。
- 被禁用模板不能再创建新 job，但旧 job/session 可以继续 resume snapshot。
