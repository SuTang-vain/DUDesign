# Capability Distribution System

> 模块：Capability Distribution System
> 中文名：能力分发系统
> 定位：横跨四层架构的生成能力分发与治理模块
> 面向对象：用户前端、管理端、业务服务层、Runtime Gateway、Automation Loop
> 目标：把场景模板、视觉风格、高级约束、插件能力和自动化 loop 组合成可治理、可复用、可审计的设计生成能力

## 1. 模块边界

Capability Distribution System 不是新的第五层架构，而是一个跨层产品能力模块。它负责把“用户想做什么、偏好什么、可以调用什么能力、系统如何自动推进”分发到现有四层架构中。

| 关联层 | 职责 |
| --- | --- |
| 用户前端交互层 | 场景选择、视觉选择、高级约束、插件/skill 选择、自动化强度选择、我的模板 |
| 管理员/开发者前端交互层 | 官方模板治理、插件/MCP 权限治理、skill 审核、loop 质量与成本观测 |
| 后端业务服务层 | 模板/插件/loop 配置、权限、版本、用户偏好、usage events、任务状态机 |
| 后端内核兼容层 | 将模板/插件/loop plan 安全编译为 Runtime Gateway prompt、tool policy 和自动修复流程 |

本模块只管理能力分发的产品语义、治理策略、数据契约和推进记录。具体代码仍落在各层对应应用和包中。

## 2. 三个子模块

### Templates

模板回答“用户要做什么场景的网站、希望呈现什么视觉方向，以及是否需要高级约束”。

面向用户的模板入口分为三层：

- 场景：用户要做什么页面或网站，例如金融科技 landing、作品集、企业官网、汽车发布页。
- 视觉：用户希望它看起来是什么气质，例如 Premium Minimal、Calm Trust、Warm Commercial、Bold Editorial。
- 高级：色板、补充风格词、参考品牌、负面要求等可选覆盖项。

模板不直接执行工具，不直接控制 runtime。模板只提供结构化设计上下文。

详见 `templates.md`。

### Plugins

插件回答“在当前领域/背景下，系统可以用什么方法和外部能力辅助 agent 完成任务”。

插件由以下能力组成：

- Skill：声明式方法论、设计规则、prompt block。
- MCP Tool：外部资源、系统、检索、资产、验证工具。
- Permission Policy：工具权限、作用域、用户授权、审计策略。

MVP 阶段 skill 不支持任意代码执行。MCP 调用必须通过授权和工具策略。

详见 `plugins.md`。

### Automation Loop

自动化 loop 回答“如何在人最少介入的情况下，让 agent 修正、调试、验证、再修正直到完成目标”。

典型流程：

```text
Generate -> Inspect -> Preview -> Validate -> Repair -> Re-run -> Stop
```

Loop 不能绕过模板、插件、权限和 runtime guardrails。它只负责推进任务完成和质量闭环。

详见 `automation-loop.md`。

## 3. 三者关系

```text
Scene + Visual + Advanced constraints
        ↓
Plugin / Skill / MCP Capability
        ↓
Automation Loop Plan
        ↓
Runtime Gateway
        ↓
BabeL-O / Artifact / Preview / Export / Share
```

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Templates | 场景、结构、视觉、色板、参考品牌、负面要求 | 工具调用、自动修复、runtime 权限 |
| Plugins | skill 方法、MCP 工具、外部能力、权限策略 | 最终审美决策、无限循环 |
| Automation Loop | 调试、验证、修复、重试、停止条件 | 定义领域风格、越权调用工具 |

## 4. 设计能力三分法

参考 `DESIGN.md` 规范和开源 DESIGN.md 模板库后，DUDesign 的能力分发不应把所有内容都叫“模板”。推荐拆成三类：

| 概念 | 负责 | 典型来源 | 进入 job snapshot |
| --- | --- | --- | --- |
| Design Template | 视觉系统：颜色、字体、布局、组件风格、设计氛围 | 官方模板、用户上传 `DESIGN.md`、历史 variation 抽取 | 是 |
| Design Skill | 生成方法：如何组织页面、如何检查质量、如何处理响应式和特定页面类型 | 官方声明式 skill、用户私有 skill、MCP 只读能力 | 是 |
| Capability Profile | 组合配置：template + skill + loop + 用户偏好 | 用户选择、默认偏好、系统自动分配 | 是 |

短期可以继续复用当前 `DomainTemplate / AestheticProfile / ColorPalette / LoopProfile` 契约；中期应引入 `DesignTemplatePack` 或 `DesignSystem` 作为更完整的视觉模板载体。

`DESIGN.md` 建议定位为导入/导出兼容格式，不直接成为 DUDesign 的唯一内部格式。DUDesign 内部应保留自己的 stable contract，以便在外部 `DESIGN.md` alpha 规范变化时只影响 adapter、lint 和 import/export 流程。

## 5. MVP 原则

- 先做官方场景和视觉风格，再做高级参考品牌和用户自定义模板。
- Skill 先做声明式规则，不做脚本插件。
- MCP 插件必须明确权限、scope 和审计。
- 自动化 loop 必须有预算、次数、时间和质量停止条件。
- 所有能力配置必须通过 Application Service 授权。
- Runtime Gateway 负责能力编译，前端不能直接拼 BabeL-O 私有 prompt 或工具调用。
- 能力配置必须版本化，job 创建时保存 snapshot，保证旧 session resume 不被新版本影响。
- 官方模板可以参考公开品牌设计系统的结构方法，但不能直接复制品牌名称、logo、专有字体、商标元素或明显 trade dress。

## 6. 推荐数据对象

### capability_templates

用于存场景模板、视觉 profile、颜色方案、参考品牌、Design Template Pack 和用户自定义模板。

### capability_plugins

用于存 skill、MCP tool binding、权限策略和安全状态。

### automation_loop_profiles

用于存 loop 模式，例如 fast、standard、deep repair，以及最大重试次数、验证策略和预算。

### user_capability_preferences

用于存用户默认场景、视觉、色板、默认 skill、授权插件和 loop 强度。

### capability_usage_events

用于统计模板/插件/loop 的采用率、成功率、质量结果、成本和失败原因。

### design_template_versions

用于存 `DESIGN.md` 或 DUDesign Template Pack 的版本内容、lint 状态、preview artifact、来源和发布状态。官方模板和用户模板都必须版本化。

### capability_profiles

用于存用户或系统组合出的 template、skill、loop 和偏好快照。创建 design job 时写入 job snapshot，保证 resume 和 share 不随 registry 更新漂移。

## 7. Runtime 编译边界

业务层向 Runtime Gateway 传递结构化能力上下文：

```json
{
  "template": {
    "domainTemplateId": "tpl_fintech",
    "aestheticProfileId": "aes_premium_minimal",
    "colorPaletteId": "pal_blue_white_trust"
  },
  "plugins": {
    "skillIds": ["sk_static_export_safe"],
    "mcpToolIds": ["mcp_brand_assets_readonly"]
  },
  "automation": {
    "loopProfileId": "loop_standard",
    "maxRepairAttempts": 2
  }
}
```

Runtime Gateway 编译成：

- Scene/domain context。
- Visual/aesthetic context。
- Advanced style constraints。
- Skill context。
- Tool policy。
- Automation loop plan。
- Output constraints。
- Safety guardrails。

Design Template Pack 或 `DESIGN.md` 进入 Runtime Gateway 前必须先被业务层解析、校验、授权和快照化。Runtime Gateway 只接收标准化后的 `designContext`、`styleDirectives`、`constraints` 和 `skillContext`，不直接读取用户上传的任意 markdown 文件。

## 8. 安全约束

- 用户 skill 不允许包含任意可执行代码。
- MCP 插件默认最小权限，默认只读。
- 模板和 skill 不能声明绝对写入路径。
- 插件不能覆盖 runtime cwd、工具权限、模型选择和文件路径安全约束。
- Loop 不能无限重试，必须受成本、次数、时间和质量门禁约束。
- 官方能力发布需要 schema 校验、preview smoke 和管理端审计。
- `DESIGN.md` 导入结果必须做 lint、引用解析、颜色/对比度检查和危险指令过滤。
- 用户自定义模板只影响该用户或授权 workspace，不进入全局 registry。

## 9. 验收目标

MVP 结束时应满足：

- 用户可选择场景、视觉和自动化强度创建 design job。
- 用户可从 variation 保存为私有模板。
- 用户可选择声明式 skill 辅助生成。
- 管理端可治理官方模板、skill 和 MCP 插件权限。
- Automation Loop 可自动执行最小修复流程，并输出可理解事件。
- 旧 session resume 不受官方能力新版本影响。
