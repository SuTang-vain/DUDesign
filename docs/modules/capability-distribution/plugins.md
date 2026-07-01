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
