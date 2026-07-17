# DUDesign 动态百科能力配置抽屉推进规划

> 文档状态：规划准入，Stage 1～4 已实施，Stage 5 浏览器与生产快照恢复已收口，系统化可访问性门禁仍在推进
> 日期：2026-07-15
> 主责模块：User Experience
> 关联模块：Capability Distribution System、Application Service
> 边界确认：Runtime Compatibility 只消费标准能力快照，不感知抽屉 UI
> 上游文档：
> - `docs/dynamic-encyclopedia-card-business-logic-plan.md`
> - `docs/modules/capability-distribution/controlled-exploration-governance-plan.md`
> - `docs/modules/capability-distribution/README.md`

当前实施状态：

- Stage 1：动态百科 preset selection policy、guidance exploration recommendation、服务端准入校验和 `CapabilitySelectionSnapshotV1` 已落地。
- Stage 2：右侧只读能力抽屉、自动打开、稳定重开入口、模板/插件/Loop 跳转、左侧 Session 栏互斥隐藏和非模态推入布局已落地；1440/1280/1024/768/390 已验证输入框不被抽屉覆盖。
- Stage 3：模板、官方 safe 插件、白名单 Loop、review mode、exploration slider、source enum 和 experimental 确认已接入。
- Stage 4：草稿 Session plan preview、focus、locked/excluded module、required/sampled coverage、模板与交互方向及正式创建前准入状态已接入。
- Stage 5：结果墙展示 variation focus，单变体方向页展示固定 variation plan，刷新 Job 与 Session resume 后从 snapshot 恢复；词条变化后的旧 guidance/plan 失效与兼容用户覆盖迁移、Runtime unavailable 计划可读回归、真实 PostgreSQL hydrate/no-hydrate 重连、320px 全屏 Sheet 和核心浏览器 E2E 已完成。系统化可访问性审计仍待环境门禁。

## 1. 文档准入结论

本规划允许进入 DUDesign 文档库，并作为动态百科模式后续用户体验收口、受控探索接入和能力选择治理的实施基线。

准入原因：

- 动态百科模式已经能自动选择词条引导 Skill、动态百科模板包、MCP 工具和百科规范审查 Loop。
- 词条引导已经能返回分类、置信度、推荐子模板和 democase references。
- 历史上选择入口分散在模板、插件、自动化等 composer 浮层中；当前已由右侧能力抽屉统一承载，旧浮层仍作为兼容入口保留。
- 当前前端已接入 `ExplorationRequestV1.level`、locked/excluded 和 exploration plan preview；剩余问题是恢复场景的完整浏览器验收和更细的用户化准入错误说明。
- 自动推荐、官方预设和用户手动调整目前共用若干数组状态，但没有统一展示选择来源、锁定原因和覆盖关系。
- 动态百科属于事实敏感业务，必须让用户清楚知道“什么可以变化”和“什么绝不能随着探索度变化”。

准入后的边界要求：

- 右侧抽屉属于第 1 层用户前端交互层，不新增第五层架构。
- 抽屉是统一检查和编辑视图，不能维护第二份独立能力配置状态。
- Capability Preset、词条引导推荐、用户覆盖和 job snapshot 的合并规则由 DUDesign 标准契约表达。
- Exploration 只改变受控设计维度，不改变事实、安全、权限、数据契约和必选模块。
- 用户端不展示 temperature、top-p、原始 Runtime prompt、MCP server 私有配置或 BabeL-O 内部状态。
- Runtime Gateway 只接收服务端验证并快照化的模板、插件、Loop 和 exploration context。

## 2. 当前问题

### 2.1 配置入口分散

动态百科模式当前涉及：

- 产品模式。
- 词条分类与置信度。
- 父模板包和推荐子模板。
- Design Skill。
- MCP tool binding。
- Automation Loop。
- 自动审查模式。
- 未来的探索度、锁定模块和排除模块。

这些内容分别位于 composer、模板选择器、插件选择器、自动化选择器、词条引导卡片和 capability summary 中。用户需要反复打开不同浮层，才能理解最终任务配置。

### 2.2 自动推荐和用户选择难以区分

目前 `selectedTemplatePackIds`、`selectedSkillIds`、`selectedMcpToolIds` 和 `loopProfileId` 能表达最终选择，但不能直接回答：

- 这是官方预设自动添加的吗？
- 这是词条引导根据分类推荐的吗？
- 这是用户手动覆盖的吗？
- 这个能力能否移除？
- 修改后是否需要重新执行词条引导？

### 2.3 探索能力已接入，恢复门禁仍需收口

后端已定义：

```ts
type ExplorationRequestV1 = {
  level: number
  lockedModuleIds?: string[]
  excludedModuleIds?: string[]
}
```

并已支持：

- `0..100` 探索等级。
- faithful / balanced / exploratory / experimental 四档语义。
- requirement module graph。
- deterministic batch planner。
- locked / excluded module。
- plan preview。
- job snapshot、resume 和 refine 沿用。

当前首页已具备探索等级、模块选择和 plan preview；job/resume/refine 的后端 snapshot、真实 PostgreSQL 双模式重连和浏览器恢复链路已验收，仍需补系统化可访问性审计。

## 3. 产品目标

### 3.1 核心目标

当用户选择“动态百科卡片”模式后，提供一个从页面最右侧向内展开的“能力配置抽屉”，让用户能够：

1. 直观看到当前生效的模板、插件、Loop 和探索等级。
2. 理解每一项配置的来源和锁定原因。
3. 在允许范围内重新选择模板、可选插件、审查模式和探索等级。
4. 在生成前预览批量 variation 的计划方向和治理准入结果。
5. 确认最终配置将被写入 job snapshot，刷新和恢复后不会漂移。

### 3.2 非目标

首版不做：

- 在抽屉中编辑模板或 Skill 内容。
- 展示 Runtime endpoint、child session、agent job、tool call envelope。
- 直接编辑 provider sampling 参数。
- 允许关闭事实、安全、权限和数据契约 invariant。
- 自动修改官方 registry。
- 在抽屉内实现管理端插件授权。

## 4. 命名与定位

用户端名称建议：

- 中文：`能力配置`
- 英文：`Capability setup`

内部组件建议：

```text
DynamicEncyclopediaCapabilityDrawer
```

产品定位：

```text
动态百科能力配置抽屉
  = 当前配置检查器
  + 允许范围内的选择器
  + 受控探索入口
  + 生成前准入摘要
```

不建议命名为“高级设置”或“Runtime 设置”，避免用户误解为模型底层参数。

## 5. 用户流程

### 5.1 模式切换

用户从 `Web & App` 切换到 `动态百科卡片`：

1. 应用官方 Capability Preset。
2. 自动选择词条引导 Skill、动态百科父模板包、只读 democase MCP 和百科规范审查 Loop。
3. 初始化推荐探索等级。
4. 第一次进入该模式时自动打开能力配置抽屉。
5. 用户关闭后，页面保留稳定的“能力配置”按钮和选择数量徽标。

同一 session 内重复切换时不反复强制打开。可以记录 session 级 `hasSeenCapabilityDrawer`，不能写入长期用户偏好强制状态。

### 5.2 词条输入前

抽屉展示官方预设：

- 父模板包。
- 必选 Skill / MCP。
- 默认 Loop。
- 默认探索等级。
- 尚未分类状态。

此阶段可调整探索等级和可选插件，但子模板推荐区域显示“等待词条引导”。

### 5.3 词条引导完成后

Application Service 返回 classification 和推荐后：

1. 抽屉更新分类、置信度和推荐原因。
2. 推荐的 1～3 个子模板进入选中状态。
3. 新增或替换的选择标记为“词条引导推荐”。
4. 低置信度时，抽屉显示待确认状态。
5. 抽屉按钮显示更新提示，但不强制抢占用户当前输入焦点。

### 5.4 用户手动调整

用户可以：

- 重新选择推荐子模板。
- 添加或移除可选安全插件。
- 在允许的 Loop / 审查模式中切换。
- 调整探索等级。
- 锁定或排除非必选 requirement module。

用户不能：

- 移除动态百科父模板包的硬性规范。
- 移除词条引导必选 Skill。
- 把 democase MCP 权限提升到写权限或外部网络权限。
- 把 `factCreativity` 改为非 0。
- 排除 always/global_rule/critical invariant。

### 5.5 生成前预览

配置变化后，前端调用：

```text
POST /api/design-jobs/exploration-plan/preview
```

抽屉展示：

- 探索模式。
- 计划 variation 数量。
- 每个 variation 的 focus 摘要。
- required / sampled module 覆盖。
- warning。
- 是否满足生成准入。

计划预览不能创建 Runtime session，不能写正式 job snapshot。

### 5.6 创建任务与恢复

用户确认生成后：

- 前端提交最终 capability requirements 和 exploration request。
- Application Service 重新校验，不信任前端 preview 结果。
- 服务端生成正式 plan 和 capability selection snapshot。
- job 页面和 resume 页面读取 snapshot，而不是重新应用最新官方预设。

## 6. 抽屉信息架构

建议从上到下分为五个区域。

### 6.1 概览

展示：

- 动态百科卡片模式。
- 当前词条。
- 一级/二级分类。
- 分类置信度。
- 配置状态：默认、待引导、待确认、已确认、已快照。

### 6.2 模板

展示：

- 父模板包。
- 已选子模板。
- 推荐分数和适用原因。
- 选择来源。
- 是否锁定。

允许：

- 在 guidance 推荐和兼容模板范围内多选 1～3 个子模板。
- 查看模板颜色、字体、交互范式和适用分类摘要。
- 恢复词条引导推荐。

不允许：

- 选择与当前 product mode 不兼容的模板。
- 直接移除父模板包的固定 viewport、iframe、touch/scroll 和交付安全约束。

### 6.3 插件

按类型分组：

- Skill。
- MCP 工具。
- 混合插件。

每项展示：

- 中文名称和简要作用。
- 官方安全状态。
- 选择来源。
- 权限摘要。
- 必选/可选/锁定状态。

用户端不展示 MCP serverName、toolName、replay key 和私有 policy JSON。

### 6.4 自动审查

建议以业务模式为主控：

```text
关闭 | 半自动 | 自动
```

同时展示实际 Loop Profile：

- quality gates。
- repair strategy。
- 最大修复次数。
- 成本或时间上限摘要。

在 experimental 探索档位下，不允许关闭规范审查；用户降档后才能关闭。

### 6.5 发散与收敛

使用 `0..100` 滑杆和四档分段语义：

| 范围 | 模式 | 用户文案 | 行为 |
| --- | --- | --- | --- |
| 0～20 | faithful | 严格遵循 | 最小模块变化，保持模板与交互稳定 |
| 21～45 | balanced | 平衡变化 | 默认值建议 40，覆盖主要设计方向 |
| 46～70 | exploratory | 多方向探索 | 增加布局、视觉和交互差异 |
| 71～100 | experimental | 高度实验 | 需要明确确认，强制开启规范审查 |

动态百科推荐默认值：

```text
40 / balanced
```

展示但不可编辑：

- `factCreativity = 0`。
- 事实、安全、权限、数据契约 invariant 已锁定。
- always / global_rule module 不参与排除。

可以显示服务端计算后的设计维度摘要，但不直接暴露浮点参数：

```text
模块覆盖：中
布局变化：中
视觉变化：中
交互变化：低
文案语气变化：低
事实创造：关闭
```

## 7. 编辑权限矩阵

| 配置 | 用户行为 | 修改后的处理 |
| --- | --- | --- |
| 词条分类 | 可修改 | 必须重新确认模板推荐 |
| 推荐子模板 | 可修改 | 标记 user override，重新预览 plan |
| 动态百科父模板包 | 锁定 | 只读展示锁定原因 |
| 词条引导 Skill | 锁定 | 只读展示“动态百科模式必需” |
| democase 只读 MCP | 默认锁定 | 只允许停用整个词条引导流程时移除 |
| 可选官方安全 Skill | 可添加/移除 | 重新编译 capability snapshot |
| 高风险/需审核插件 | 不在普通用户抽屉开放 | 跳转管理员治理流程 |
| 审查模式 | 可选 | experimental 档强制 semi_auto 或 auto |
| Loop Profile | 在白名单内可选 | 重新预览 stop conditions 和成本摘要 |
| exploration level | 可修改 | 重新生成 plan preview |
| locked sampled module | 可修改 | 服务端验证后写入 request |
| always / critical invariant | 锁定 | 不允许排除 |

## 8. 选择来源和覆盖规则

### 8.1 来源类型

建议新增标准来源枚举：

```ts
type CapabilitySelectionSource =
  | 'official_preset'
  | 'entry_guidance'
  | 'user_override'
  | 'job_snapshot'
```

优先级：

```text
job_snapshot
  > user_override
  > entry_guidance
  > official_preset
```

### 8.2 合并规则

- 官方预设提供基础选择和锁定策略。
- 词条引导只能在 preset 允许的范围内推荐和补充。
- 用户覆盖可以修改可编辑项，但不能突破 required/locked policy。
- job 创建后，snapshot 成为恢复和 refine 的唯一事实来源。
- registry 更新不能改变历史 job。

### 8.3 词条变化

用户修改词条后：

- [x] 清除旧 guidance id、分类置信度、guidance 推荐子模板和旧 plan preview。
- [x] 通过 request revision 阻止已在途的旧 plan preview 晚到回写。
- [x] 保留明确的用户模板/插件/Loop 调整，但标记为“待重新校验”。
- [x] 重新执行词条引导后，提示用户：
  - 使用新推荐。
  - 保留兼容的用户覆盖。
  - 移除不兼容选择。
- [x] 用户可以在重新匹配前关闭“保留仍兼容的用户调整”，完全采用新 guidance。

不能静默把旧分类的子模板用于新词条。

## 9. 前端状态治理

### 9.1 单一事实来源

抽屉直接读写当前页面统一状态：

```text
selectedTemplatePackIds
selectedSkillIds
selectedMcpToolIds
loopProfileId
entryGuidanceClassification
entryGuidanceTemplateIds
```

新增：

```text
explorationLevel
lockedModuleIds
excludedModuleIds
capabilitySelectionSources
capabilitySelectionLocks
```

抽屉组件内部只允许保存 UI 临时状态：

- 是否展开。
- 当前 accordion section。
- 搜索词。
- hover/focus。

不得在抽屉内部复制 selected ids。

### 9.2 推荐状态结构

首版可使用 reducer 收敛状态：

```ts
type DynamicCapabilityConfiguration = {
  productMode: 'dynamic_encyclopedia_card'
  presetId: string
  guidanceId: string | null
  classification: {
    primaryCategory: string
    secondaryCategory: string
    confidence: number
    confirmed: boolean
  } | null
  templatePackIds: string[]
  skillIds: string[]
  mcpToolIds: string[]
  loopProfileId: string
  reviewMode: 'off' | 'semi_auto' | 'auto'
  exploration: {
    level: number
    lockedModuleIds: string[]
    excludedModuleIds: string[]
  }
  sourceByCapabilityId: Record<string, CapabilitySelectionSource>
  lockByCapabilityId: Record<string, { locked: boolean; reasonCode: string }>
}
```

该结构是创建 job 前的表单状态，不直接作为后端事实。Application Service 必须重新解析和验证。

## 10. Capability Preset 契约扩展

当前 `CapabilityPreset` 已包含 template、Skill、MCP 和 Loop 默认值。建议增加：

```ts
type CapabilityPresetSelectionPolicy = {
  requiredTemplatePackIds: string[]
  requiredSkillIds: string[]
  requiredMcpToolIds: string[]
  allowedLoopProfileIds: string[]
}

type CapabilityPresetExplorationDefaults = {
  level: number
  experimentalConfirmationThreshold: number
  forceReviewAtOrAbove: number
}

type CapabilityPreset = {
  // existing fields
  selectionPolicy: CapabilityPresetSelectionPolicy
  explorationDefaults: CapabilityPresetExplorationDefaults
}
```

动态百科建议：

```json
{
  "explorationDefaults": {
    "level": 40,
    "experimentalConfirmationThreshold": 71,
    "forceReviewAtOrAbove": 71
  }
}
```

阈值必须来自 capability contract，不应散落在前端常量中。

## 11. 词条引导响应扩展

建议在 `EncyclopediaEntryGuidanceResponse` 中增加：

```ts
type ExplorationRecommendation = {
  level: number
  reason: string
  confidence: number
}

type CapabilitySelectionRecommendation = {
  templatePackIds: string[]
  skillIds: string[]
  mcpToolIds: string[]
  loopProfileId: string
  exploration: ExplorationRecommendation
}
```

推荐值只作为 recommendation。用户修改后必须标记为 `user_override`，不能在第二次 render 时被 effect 自动覆盖。

## 12. Job 创建与快照

创建任务请求必须包含：

```ts
{
  productMode: 'dynamic_encyclopedia_card',
  capabilityRequirements: {
    template: { designTemplatePackIds: [...] },
    plugins: { skillIds: [...], mcpToolIds: [...] },
    automation: { loopProfileId: '...' }
  },
  exploration: {
    level: 40,
    lockedModuleIds: [],
    excludedModuleIds: []
  }
}
```

建议新增审计快照：

```ts
type CapabilitySelectionSnapshotV1 = {
  schemaVersion: '2026-07-14.dudesign-capability-selection.v1'
  presetId: string
  guidanceId: string | null
  confirmedAt: string
  selectedTemplatePackIds: string[]
  selectedSkillIds: string[]
  selectedMcpToolIds: string[]
  loopProfileId: string
  reviewMode: 'off' | 'semi_auto' | 'auto'
  explorationRequest: ExplorationRequestV1
  sourceByCapabilityId: Record<string, CapabilitySelectionSource>
}
```

服务端 snapshot 只保存已授权标准 id 和来源，不保存前端布局、drawer open state 或 hover state。

## 13. 服务端校验规则

Application Service 必须重新校验：

- product mode 与 Capability Preset 是否匹配。
- 模板是否支持动态百科模式和当前 entry category。
- 子模板是否属于动态百科父模板包。
- Interaction Paradigm 与模板是否兼容。
- required Skill / MCP 是否存在且未禁用。
- MCP scopes 是否仍为允许的最小权限。
- Loop Profile 是否在 preset 白名单内。
- experimental 档是否满足强制审查要求。
- locked/excluded module 是否冲突。
- always / critical invariant 是否被非法排除。
- variation count 与 plan coverage 是否满足约束。

前端 preview 成功不代表正式创建一定成功；创建时必须使用当前 registry/version 再验证一次。

## 14. 计划预览表现

抽屉不展示完整 requirement graph。首版只展示可理解摘要：

```text
变体 1：身份摘要 + 核心事实
变体 2：时间线叙事 + 关键节点
变体 3：关系网络 + 关联对象
```

同时显示：

- 必选模块覆盖数量。
- 探索模块覆盖数量。
- 不重复 focus 数量。
- 模板和交互方向。
- warning 数量。

详细 module graph 以后可放入高级详情，不进入首版默认视图。

## 15. 抽屉开合与响应式规则

### 15.1 桌面宽屏

视口宽度建议 `>= 1280px`：

- 抽屉宽度 `380～420px`。
- 优先采用推入式布局，主 composer 保持可见。
- 页面不能因打开抽屉产生水平滚动。
- 主输入焦点不自动丢失。

### 15.2 中等屏幕

视口宽度 `768～1279px`：

- 使用右侧 overlay drawer。
- 提供半透明遮罩。
- Escape 和点击遮罩可关闭。
- 打开时锁定页面背景滚动。

### 15.3 手机端

视口宽度 `< 768px`：

- 改为底部或全屏 Sheet，不坚持从右侧弹入。
- 顶部固定标题、状态和关闭按钮。
- 底部固定“应用配置”或“确认并预览”按钮。
- 内容区域单列滚动。
- 不允许详情栏覆盖列表按钮。

## 16. 交互细节

- 抽屉打开按钮显示选择摘要，例如 `3 模板 · 4 插件 · 平衡`。
- 自动添加项使用 `自动` 或 `推荐` 标签。
- 用户覆盖项使用 `已调整` 标签。
- 锁定项使用锁图标和 tooltip，解释业务原因。
- 删除可选项使用熟悉的关闭图标，不使用大面积文字按钮。
- 修改探索等级时 200～300ms debounce 请求 plan preview。
- 用户快速拖动滑杆时只更新本地文案，不为每个像素发请求。
- plan preview 请求使用 request revision，旧响应不能覆盖新配置。
- 抽屉关闭不等于应用配置；状态始终与 composer 表单一致。

## 17. 可观测性与事件

建议记录产品事件：

```text
capability_drawer.opened
capability_drawer.closed
capability_selection.changed
capability_selection.restored_recommendation
exploration_level.changed
exploration_plan.previewed
exploration_plan.preview_failed
capability_configuration.confirmed
```

事件 metadata 只记录标准 id、来源和档位，不记录原始 prompt、用户词条正文或 Runtime 私有参数。

## 18. 测试计划

### 18.1 单元测试

- preset + guidance + user override 合并优先级。
- required/locked capability 不能移除。
- 词条变化清除旧 guidance 推荐。
- exploration level 映射四档语义。
- experimental 档强制开启审查。
- confirmed snapshot 恢复后 registry 更新不漂移。

### 18.2 组件测试

- 动态百科模式首次进入自动打开一次。
- 抽屉关闭后可通过稳定按钮重新打开。
- 模板、插件、Loop 和探索等级展示与页面统一状态一致。
- 必选项禁用删除并显示原因。
- guidance 更新显示推荐来源。
- plan preview loading、success、warning、error 状态。

### 18.3 API 集成测试

- capability preset 返回 selection policy 和 exploration defaults。
- entry guidance 返回 exploration recommendation。
- preview exploration plan 不创建 job/runtime session。
- 正式创建重新校验非法排除和插件权限。
- job snapshot 保存 selection source 和 exploration request。
- resume 返回原 snapshot。

### 18.4 E2E

核心链路：

```text
切换动态百科
-> 抽屉自动打开
-> 查看官方预设
-> 输入词条并运行引导
-> 抽屉显示推荐模板
-> 调整探索度
-> 预览 3/6 variation 方向
-> 确认
-> 创建 job
-> 刷新后读取相同 snapshot
```

补充链路：

- 低置信度分类改选。
- 尝试移除 required Skill 被阻止。
- experimental 档关闭审查被阻止。
- 词条改变后旧模板推荐失效。
- runtime unavailable 不影响计划摘要读取。
- 桌面、平板和手机抽屉不遮挡关键操作。

## 19. 分阶段推进

### Stage 1：契约与状态基线

- 扩展 Capability Preset selection policy 和 exploration defaults。
- 定义 selection source / lock reason。
- 首页增加 exploration state。
- `POST /api/design-jobs` 真正提交 exploration request。
- 增加契约和 reducer 单测。

验收：不做抽屉也能通过请求和 snapshot 证明探索值已生效。

### Stage 2：只读能力抽屉

- 实现桌面右侧抽屉和移动端 Sheet。
- 展示模板、插件、Loop、分类、探索等级和锁定项。
- 接入首次自动打开和稳定重开入口。
- 暂不开放重新选择。

验收：抽屉内容和 capability summary/job request 完全一致。

### Stage 3：可编辑能力配置

- 接入模板重选。
- 接入可选 safe plugin 增删。
- 接入审查模式和白名单 Loop。
- 接入探索等级滑杆。
- 增加推荐/覆盖/锁定标签。

验收：所有修改只有一个事实状态，并能生成正确请求。

### Stage 4：计划预览与准入

- 接入 exploration plan preview。
- 展示 variation focus 和 coverage 摘要。
- experimental 档确认和强制审查。
- 增加 stale response/revision 防护。

验收：用户生成前能理解不同 variation 将如何产生差异。

### Stage 5：快照恢复与体验收口

- [x] Job detail 和结果墙读取 selection snapshot 与 variation exploration plan。
- [x] 结果墙显示 variation focus；单变体方向页显示原 variation plan。
- [x] refine/runtime context 沿用原 variation exploration plan，Runtime unavailable 时历史计划仍可读取。
- [~] 完成浏览器 E2E、移动端和可访问性测试（刷新、Session resume、1440/1280/1024/768/390/320、焦点进入/返回、手机 Tab 循环、Slider 键盘操作和核心链路已通过；真实屏幕阅读器人工验证与颜色对比度审计待补）。

验收：刷新、resume 和 refine 不随官方 preset 更新漂移。

## 20. 模块映射

### 第 1 层：用户前端交互层

- 抽屉/Sheet。
- 模板、插件、Loop、探索等级展示和编辑。
- 推荐来源和锁定原因。
- plan preview 摘要。
- 响应式与可访问性。

### 第 2 层：管理员/开发者前端交互层

本阶段不新增管理端 UI。后续可治理：

- preset selection policy。
- exploration defaults。
- required capability。
- experimental threshold。

### 第 3 层：后端业务服务层

- 契约校验。
- preset/guidance/user override 合并。
- exploration plan preview。
- 正式创建二次校验。
- selection snapshot、resume 和审计。

### 第 4 层：后端内核兼容层

- 不理解抽屉、标签和用户交互。
- 继续消费标准 capability snapshot 和 runtime exploration context。
- 不新增 BabeL-O 私有字段依赖。

## 21. 风险与控制

### 风险 1：配置状态双源

控制：抽屉直接读写统一 reducer，禁止内部复制 selected ids。

### 风险 2：自动推荐覆盖用户选择

控制：来源优先级和 revision 明确；user override 不被 effect 静默覆盖。

### 风险 3：高探索被理解为可以编造事实

控制：固定显示事实创造关闭，experimental 档强制审查。

### 风险 4：抽屉信息过载

控制：默认显示摘要，分 section 展开；底层 graph 和 policy 不进入首屏。

### 风险 5：移动端遮挡

控制：手机使用 Sheet；必须建立 390px 和 320px 浏览器 E2E。

### 风险 6：preview 结果与正式计划不一致

控制：正式创建时服务端重新校验；preview 只提供解释，不作为授权依据。

## 22. MVP 验收标准

MVP 完成时必须满足：

- 动态百科模式首次进入可看到统一能力抽屉。
- 当前模板、插件、Loop 和探索等级一屏可读。
- 自动、推荐、用户覆盖和锁定来源可区分。
- required capability 不能被普通用户移除。
- 用户可以调整 1～3 个兼容子模板、可选安全插件、审查模式和探索等级。
- exploration request 进入服务端 plan 和 job snapshot。
- 高探索不改变事实、安全、权限和数据契约。
- plan preview 能解释 3/6 variation 的主要差异。
- 刷新、resume 和 refine 沿用原 snapshot。
- 桌面右侧抽屉和移动端 Sheet 均通过浏览器测试。

## 23. 推荐推进优先级

推荐顺序：

1. Stage 1：先打通 exploration 状态、preset 默认值和 job snapshot（已完成）。
2. Stage 2：实现只读抽屉，验证信息架构和移动端（已完成）。
3. Stage 3：开放模板、插件、Loop 和探索等级编辑（已完成）。
4. Stage 4：接入 plan preview 与 experimental 准入（已完成）。
5. Stage 5：完成恢复、结果墙解释和 E2E（浏览器体验与真实 PostgreSQL 快照恢复已完成，系统化可访问性门禁待补）。

不建议先做完整视觉抽屉再补后端快照，否则会形成“看起来可配置、实际任务不生效”的假功能。
