# 多模块需求抽样与受控探索治理规划

> 模块：Capability Distribution System
> 关联层：用户前端、管理员/开发者前端、业务服务层、Runtime Compatibility
> 文档状态：已准入并实施中；Stage 4 本地 provider 编译已完成，真实 staging 验证待发布
> 上游规划：`template-skill-authoring-governance-plan.md`
> 准入案例：`明星组合动态百科功能设计文档.md`
> 用户端专项：`../user-experience/dynamic-encyclopedia-capability-drawer-plan.md`
> 更新日期：2026-07-14

### 当前实施状态

- Stage 1：核心 Requirement Module、Exploration Profile 和 Batch Plan 契约已落地；通用 Capability Spec Importer 仍需继续完善。
- Stage 2：确定性 planner、计划预览、job/variation snapshot、resume/retry 固定计划已落地。
- Stage 3：右侧抽屉、slider、review gate、locked/excluded module、plan preview、coverage 详情和浏览器 E2E 已接入动态百科业务线。
- Stage 4：`RuntimeExplorationContextV1`、BabeL-O、Mock 和可执行 CLI Agent provider 已完成本地 contract/API flow 验证；真实 staging BabeL-O 3/6 variation smoke 待部署本阶段 build 后执行。
- Stage 5：管理指标、策略灰度和回滚仍未开始。

## 1. 文档准入结论

本方案建议正式进入 DUDesign 文档库，并作为 Capability Distribution 的专项规划推进。

方案解决的不是简单的“模型 temperature 调节”，而是一个可治理的批量设计规划问题：

- 一份功能设计文档可以包含多个可组合的需求模块。
- 用户一次生成多个 variation 时，系统应在整批结果中有计划地覆盖这些模块。
- 每个 variation 应拥有明确的主叙事、模块组合、视觉方向和交互侧重点。
- 用户可以通过“探索度”决定结果更贴近原始能力包，还是允许更大范围的结构与设计发散。
- 事实、权限、安全、必需模块和数据契约不能随探索度升高而放宽。
- 最终探索计划必须进入 job snapshot，保证 resume、refine、share 和历史回放不漂移。

本规划不新增第五层架构。它属于 Capability Distribution 的跨层能力，并由现有四层分别承担交互、治理、业务编排和运行时编译职责。

## 2. 背景与问题定义

“明星组合动态百科功能设计文档”不是单一视觉模板。它同时包含：

- 组合基础身份信息。
- 当前成员信息。
- 前成员与成员变动。
- 成员时间轴。
- 代表作品。
- Unit 或子组合关系。
- 组合、成员、作品之间的关系网络。
- 响应式、交互、事实表达和风险约束。

如果把整份文档原样塞入每一个 variation，会出现以下问题：

- 每个结果都试图实现全部模块，信息密度过高。
- 多个 variation 只有颜色差异，没有产品方向差异。
- 模型可能随机遗漏重要模块，整批结果没有覆盖保证。
- 用户无法理解“发散”具体改变了什么。
- resume 或 refine 时重新随机采样，导致设计主线漂移。
- 高发散可能错误地扩大到事实、工具权限或安全约束。

因此必须先把功能文档规范化为可组合模块，再在创建 job 时生成确定性的批量探索计划。

## 3. 产品目标

### 3.1 核心目标

- 支持一份能力文档拆成多个 `RequirementModule`。
- 支持必选、条件必选、可抽样和全局规则四种模块语义。
- 支持根据 variation 数量生成整批覆盖计划。
- 支持用户通过 `0..100` 的探索度控制保真与发散平衡。
- 支持同一输入在不同模板、模块组合和设计主线间形成真实差异。
- 支持计划预览、快照、审计、回放和质量评估。
- 保持 BabeL-O、CLI Agent 或其他 provider 的实现中立。

### 3.2 非目标

- 不直接向普通用户暴露模型 temperature、top-p 等 provider 参数。
- 不允许探索度改变用户明确输入的事实。
- 不允许探索度扩大 MCP、文件系统、网络或脚本执行权限。
- 不保证单个 variation 覆盖文档全部功能。
- 不在 MVP 内实现自动在线学习或无审核的全局策略调优。
- 不把原始 Markdown 直接交给 runtime 自行决定抽样。

## 4. 核心设计原则

### 4.1 先规划整批，再生成单项

系统先生成 `BatchExplorationPlan`，然后为每个 variation 生成独立的 `VariationExplorationPlan`。不能让各 child session 独立随机选择需求，否则无法保证覆盖率和差异性。

### 4.2 探索度是业务语义，不是模型参数

前端字段命名为“探索度”或“设计开放度”，内部字段使用 `explorationLevel`。它表达系统可以在模块组合、布局、视觉、叙事和交互方式上走多远。

Runtime Adapter 可以在 provider 支持时将部分语义映射到 sampling 参数，但该映射属于 adapter 私有实现，不能成为稳定 API 契约。

### 4.3 内容保真与设计发散分轴治理

建议内部至少拆成以下维度：

| 维度 | 默认是否受探索度影响 | 说明 |
| --- | --- | --- |
| `factCreativity` | 否，固定为 0 | 不创造成员、时间、作品和关系事实 |
| `moduleBreadth` | 是 | 控制可选模块覆盖广度 |
| `moduleNovelty` | 是 | 控制非典型模块组合概率 |
| `layoutDivergence` | 是 | 控制布局与信息架构差异 |
| `visualDivergence` | 是 | 控制颜色、字体、层级和氛围差异 |
| `interactionDivergence` | 是 | 控制 tab、timeline、network、filter 等交互差异 |
| `copyToneDivergence` | 有限 | 可改变语气，不改变事实含义 |
| `toolFreedom` | 否 | 始终由 tool policy 决定 |

### 4.4 必需约束永不被抽样淘汰

以下内容属于 invariant：

- 用户明确要求。
- 必选功能模块。
- 数据字段和 schema。
- 安全与权限策略。
- 品牌禁用项和危险指令过滤。
- 事实来源、未知值和争议内容表达规则。
- 响应式、可访问性和导出约束。

## 5. 需求模块契约

建议在 Capability Authoring 的普通功能文档规范化阶段增加：

```ts
type RequirementModuleMode =
  | "always"
  | "conditional"
  | "sampled"
  | "global_rule";

interface RequirementModuleV1 {
  id: string;
  title: string;
  description: string;
  mode: RequirementModuleMode;
  priority: "critical" | "high" | "medium" | "low";
  minBatchCoverage: number;
  maxBatchCoverage?: number;
  conditions?: RequirementConditionV1[];
  dependencies?: string[];
  conflicts?: string[];
  compatibleWith?: string[];
  requiredDataFields?: string[];
  interactionCandidates?: string[];
  evidenceRefs: SourceEvidenceRefV1[];
  confidence: number;
}
```

### 5.1 四种模块模式

`always`：每个 variation 必须包含，例如组合身份和当前成员。

`conditional`：满足输入条件时必须包含，例如存在 Unit 数据时展示 Unit 树。

`sampled`：整批结果需要覆盖，但不要求每个 variation 都包含，例如前成员时间轴、作品专题和关系网络。

`global_rule`：不渲染为独立页面模块，但约束所有 variation，例如争议内容保持中性、作品与成员事实不可混写。

### 5.2 模块关系

模块不能只是一组标签，还需要表达：

- `dependencies`：选择关系网络时可能依赖成员与作品基础数据。
- `conflicts`：首屏沉浸大图和超高密度百科表格不宜同时作为唯一主叙事。
- `compatibleWith`：时间轴与前成员模块天然适配。
- `conditions`：没有 Unit 数据时禁止生成虚构 Unit。
- `requiredDataFields`：缺字段时应降级或显示未知，而不是补造事实。

## 6. 探索度产品语义

### 6.1 用户可见分段

| 数值 | 模式 | 用户理解 | 系统行为 |
| --- | --- | --- | --- |
| 0-20 | 忠实 | 尽量贴合原模板 | 保留主结构，只做有限视觉变化 |
| 21-45 | 均衡 | 保留规范，同时产生不同方向 | 默认值建议 40；稳定覆盖与适度差异并重 |
| 46-70 | 探索 | 允许重组内容与交互主线 | 增加模块组合、布局和交互差异 |
| 71-100 | 实验 | 鼓励明显不同的设计提案 | 允许非常规叙事，但仍服从事实与硬约束 |

### 6.2 推荐默认值

- 默认 `explorationLevel = 40`。
- 只有一个 variation 时，最高建议值为 70，避免“发散”退化为不可比较的偶然结果。
- 三个及以上 variation 时，系统才能较好地执行批量覆盖和对照。
- 动态百科等高事实敏感场景可以保留 0-100 UI，但内部限制事实和信息架构发散上限。

### 6.3 前端呈现

滑块需要同时显示：

- 当前模式名称。
- 一句可理解的结果说明。
- “始终保持”的约束摘要。
- 对本次 N 个 variation 的预计变化说明。

示例：

> 探索 65：保留必需信息与事实约束，允许各方案采用不同模块重点、布局和交互方式。

不建议显示：

- `temperature = 0.8`。
- `top_p = 0.95`。
- “模型更敢编”。

## 7. 明星组合动态百科模块化示例

| 模块 | 模式 | 优先级 | 推荐覆盖 | 备注 |
| --- | --- | --- | --- | --- |
| 组合身份摘要 | always | critical | 每个 variation | 名称、定位、状态等基础信息 |
| 当前成员 | always | critical | 每个 variation | 不允许因发散被移除 |
| 前成员 | sampled | high | 整批至少 1 个 | 与时间轴组合效果较好 |
| 成员变动时间轴 | sampled | high | N>=3 时至少 1 个 | 数据不足时降级为简表 |
| 代表作品 | sampled | high | 整批至少 1 个 | 不能杜撰作品或成绩 |
| Unit/子组合 | conditional | high | 有数据时至少 1 个 | 无数据时禁止虚构 |
| 双向关系网络 | sampled | medium | 高探索时优先 | 依赖成员和作品数据 |
| 中性事实表达 | global_rule | critical | 每个 variation | 争议、解散、离队等须中性 |
| 未知值治理 | global_rule | critical | 每个 variation | 不确定内容显示未知或省略 |
| 移动端可读性 | global_rule | high | 每个 variation | 禁止内部滚动和拥挤表格 |

### 7.1 三变体、探索度 40 示例

| Variation | 主方向 | 模块组合 |
| --- | --- | --- |
| A | 组合总览 | 身份、当前成员、作品摘要 |
| B | 成员历程 | 身份、当前成员、前成员、变动时间轴 |
| C | 关系探索 | 身份、当前成员、Unit、关系网络 |

### 7.2 六变体、探索度 70 示例

| Variation | 主方向 | 允许的设计发散 |
| --- | --- | --- |
| A | 权威百科总览 | 高密度索引、清晰字段分组 |
| B | 成员档案 | 人物卡片、成员筛选、详情切换 |
| C | 历史时间轴 | 纵向时间轴、阶段性叙事 |
| D | 作品宇宙 | 作品分类、关联成员、年份导航 |
| E | Unit 关系图 | 节点关系、双向导航、可访问降级列表 |
| F | 移动故事流 | 单列章节、轻交互、阅读优先 |

六个方案仍共享身份、当前成员、事实规则和安全约束，但不再共享同一种页面骨架。

## 8. 批量探索规划算法

### 8.1 输入冻结

创建 job 前冻结：

- Capability Bundle version。
- Requirement Module graph version。
- 用户 prompt 和附件。
- variation 数量。
- 探索度。
- 选中的模板、Skill、插件和 loop profile。
- 用户明确锁定或排除的模块。
- planner version 和 deterministic seed。

### 8.2 资格过滤

先计算模块是否 eligible：

- 条件是否满足。
- 所需数据是否存在。
- 依赖模块是否可用。
- 是否与用户排除项冲突。
- 是否涉及未授权工具。

资格过滤失败的模块必须记录原因，不能静默换成虚构内容。

### 8.3 覆盖目标

对整批 variation 计算：

- `always` 模块覆盖率必须为 100%。
- `conditional` 模块在条件成立时达到配置的最小覆盖。
- `sampled` 模块按优先级、N 和探索度分配覆盖次数。
- 每个 variation 至少有一个清晰 focus module 或 focus narrative。
- 高优先级 sampled 模块优先于低优先级装饰模块。

### 8.4 多样性约束

规划器同时约束：

- 两个 variation 的 focus module 不应完全相同。
- 模块集合的 Jaccard 相似度不宜全部过高。
- 视觉模板和布局方向应与内容主线匹配。
- 不能只通过换颜色满足“不同方案”。
- 探索度较低时，差异主要来自表现方式。
- 探索度较高时，可增加模块重组和非典型叙事。

### 8.5 确定性与重试

推荐 seed：

```text
hash(userId + sessionId + jobId + capabilityVersion + explorationLevel)
```

同一 snapshot 的 resume 必须恢复原计划。单 variation retry 默认沿用该 variation plan；只有用户明确点击“换一个方向”时才创建新计划版本。

## 9. 规划结果契约

```ts
interface ExplorationProfileV1 {
  level: number;
  mode: "faithful" | "balanced" | "exploratory" | "experimental";
  moduleBreadth: number;
  moduleNovelty: number;
  layoutDivergence: number;
  visualDivergence: number;
  interactionDivergence: number;
  copyToneDivergence: number;
  factCreativity: 0;
}

interface VariationExplorationPlanV1 {
  variationIndex: number;
  focusId: string;
  requiredModuleIds: string[];
  sampledModuleIds: string[];
  excludedModuleIds: string[];
  templatePackId?: string;
  styleDirectionId?: string;
  interactionDirectionIds: string[];
  rationale: string;
}

interface BatchExplorationPlanV1 {
  plannerVersion: string;
  seed: string;
  capabilitySnapshotId: string;
  profile: ExplorationProfileV1;
  moduleGraphVersion: string;
  variations: VariationExplorationPlanV1[];
  coverageSummary: Record<string, number>;
  warnings: string[];
}
```

## 10. API 与持久化建议

### 10.1 创建任务

`POST /api/design-jobs` 增加：

```json
{
  "variationCount": 6,
  "exploration": {
    "level": 65,
    "lockedModuleIds": ["group_identity", "current_members"],
    "excludedModuleIds": []
  }
}
```

### 10.2 计划预览

建议增加：

```text
POST /api/design-jobs/exploration-plan/preview
```

用途：

- 在不创建 runtime job 的情况下预览批量方向。
- 返回每个 variation 的主方向和覆盖模块。
- 用户可以重新分配或锁定某个方向。
- 预览结果不是最终事实，正式创建时必须重新校验 capability version 和权限。

### 10.3 数据存储

MVP 可以先把完整计划写入 `design_jobs.capability_snapshot` 或独立 JSONB 字段。生产化后建议增加：

- `exploration_plan_versions`。
- `variation_exploration_assignments`。
- `exploration_plan_events`。
- `exploration_quality_metrics`。

关键字段包括 planner version、seed、输入 hash、module graph version、计划状态、覆盖摘要和人工调整记录。

## 11. 四层架构职责

### 11.1 用户前端交互层

- 提供探索度滑块和四档语义。
- 展示“更贴合 / 更开放”的动态说明。
- 可选展示整批 variation 方向预览。
- 支持锁定、排除或重新分配非必选模块。
- 结果墙展示每个 variation 的设计主线，而非内部 prompt。
- refine 默认继承 variation plan。

### 11.2 管理员/开发者前端交互层

- 查看不同 capability 的探索度使用分布。
- 查看必选覆盖失败、过度同质化和事实风险。
- 管理 Requirement Module registry 和探索策略版本。
- 支持策略灰度、禁用、回滚和审计。
- 不能直接修改已创建 job 的 snapshot。

### 11.3 后端业务服务层

- 实现 `ExplorationPlanningApplicationService`。
- 校验用户、workspace、capability 和 module 权限。
- 生成确定性 batch plan。
- 把计划写入 job/variation snapshot。
- 负责 preview、create、resume、retry 和 refine 的计划语义。
- 聚合覆盖、多样性、成本和质量指标。

### 11.4 后端内核兼容层

- 接收标准化 `RuntimeExplorationContextV1`。
- 将单 variation plan 编译为 provider 可消费的 context。
- 不读取原始功能文档做二次随机抽样。
- 不直接理解 DUDesign 前端滑块。
- provider sampling 参数映射只能是可选适配行为。
- 通过 golden replay 保证 BabeL-O 与 CLI Agent 结果契约兼容。

## 12. Runtime 编译边界

业务层传给 Gateway 的内容应类似：

```json
{
  "explorationContext": {
    "planVersion": "exp-plan-v1",
    "variationIndex": 2,
    "focus": "membership_timeline",
    "requiredModules": ["group_identity", "current_members"],
    "sampledModules": ["former_members", "membership_timeline"],
    "layoutDivergence": 0.55,
    "visualDivergence": 0.6,
    "interactionDivergence": 0.45,
    "factCreativity": 0
  }
}
```

Gateway 可以把它编译成结构化 prompt context，但不得：

- 重新选择模块。
- 移除 required module。
- 增加未授权工具。
- 把 `level=100` 翻译成“可以编造事实”。
- 把 provider 私有参数返回给用户端作为稳定字段。

## 13. 质量与治理指标

### 13.1 覆盖指标

- Required Module Coverage：目标 100%。
- Conditional Module Coverage：条件成立时达到配置阈值。
- Sampled Module Batch Coverage：整批是否覆盖目标模块。
- Focus Uniqueness：variation 主方向唯一率。

### 13.2 多样性指标

- Module Set Jaccard Similarity。
- Layout Structure Similarity。
- Template Pack Distribution。
- Interaction Paradigm Distribution。
- Screenshot visual embedding distance，可在后续阶段引入。

### 13.3 风险指标

- Factual Constraint Violation。
- Required Module Missing。
- Unauthorized Tool Request。
- Unsupported Data Fabrication。
- High Exploration Failure Rate。
- Plan-to-Artifact Drift。

### 13.4 成本指标

- 每档探索度平均 token、时长和修复次数。
- 每个 variation 的有效差异收益。
- 高探索导致的失败、重试和人工回退比例。

## 14. 安全与事实治理

探索度必须被以下规则硬限制：

- 事实敏感字段只能来自用户输入、授权数据源或明确的检索结果。
- 不确定内容标记 unknown、unverified 或省略。
- 人物关系、成员状态、时间和作品归属不得基于样式发散补造。
- 高探索可以改变视觉化方式，不能改变事实图谱。
- 用户文档中的危险 prompt、shell、路径和权限提升内容仍由 Capability lint 拦截。
- 模块 planner 不能绕过 MCP policy。
- 管理策略更新不能改变已有 job snapshot。

## 15. 用户记忆与偏好

探索度可以成为用户偏好，但必须与事实记忆分开：

- 记录最近使用和默认探索档位。
- 记录用户常选的模块主线和模板方向。
- 不把一次高探索输出当成用户事实偏好。
- 每个用户使用独立 memory namespace。
- workspace/session 可以作为二级 scope。
- 系统推荐必须可被用户覆盖，并显示本次实际生效值。

## 16. 测试计划

### 16.1 单元测试

- `0 / 20 / 40 / 70 / 100` 映射到稳定 profile。
- `always` 模块始终覆盖全部 variation。
- conditional 条件不成立时不进入计划。
- sampled 模块达到最小批量覆盖。
- dependency、conflict 和 exclusion 生效。
- 同 seed 生成同计划。
- `factCreativity` 永远为 0。

### 16.2 Application Service 集成测试

- 创建 3/6 variation 时写入完整 batch snapshot。
- preview plan 与正式 create 在输入未变化时一致。
- capability version 变化时 preview 失效并提示重新确认。
- resume 恢复原计划。
- retry 沿用原 variation plan。
- “换一个方向”创建新 plan version。
- 用户不能访问其他用户的 exploration plan。

### 16.3 Runtime Contract 测试

- BabeL-O adapter 正确注入 required/sampled/focus context。
- CLI Agent adapter 消费同一标准 context。
- provider 不支持 sampling 参数时核心流程仍可用。
- event drift 不改变 DUDesign exploration snapshot。
- Runtime unavailable 时仍可读取历史计划和 artifact。

### 16.4 浏览器 E2E

- 选择 6 个 variation，拖动探索度并查看方向说明。
- 预览整批模块分配后创建 job。
- 结果墙能区分各 variation 主方向。
- 刷新和重新登录后探索度及计划恢复。
- refine 后仍保持该 variation 主线。
- 移动端滑块可操作、标签不截断、键盘可访问。

### 16.5 Golden Fixture

以明星组合动态百科文档建立 golden fixture，至少覆盖：

- 3 variation + 探索度 20。
- 3 variation + 探索度 60。
- 6 variation + 探索度 40。
- 6 variation + 探索度 80。
- 无 Unit 数据。
- 缺少成员变动数据。
- 用户锁定作品模块。
- 用户排除关系网络。

## 17. 分阶段实施

### Stage 1：契约与文档规范化

- 定义 Requirement Module、Exploration Profile 和 Batch Plan 契约。
- 在 Capability Spec Importer 中输出模块图。
- 建立明星组合 golden fixture。
- 固定事实与安全 invariant。

### Stage 2：确定性业务规划器

- 实现 `ExplorationPlanningApplicationService`。
- 支持 3/6 variation 覆盖计划。
- 写入 job/variation snapshot。
- 补 preview/create/resume/retry 集成测试。

### Stage 3：用户端探索度

- 增加滑块、档位、说明和键盘操作。
- 可选增加批量方向预览。
- 结果墙展示主方向和模块摘要。
- 补浏览器 E2E。

### Stage 4：Runtime Provider 编译

- [x] 定义 `RuntimeExplorationContextV1`。
- [x] BabeL-O、Mock 与可执行 CLI Agent provider 接入。
- [x] 增加本地 prompt golden、event drift、resume/refine、runtime unavailable 和 provider fallback 测试。
- [~] 在真实 staging BabeL-O 环境完成 3/6 variation exploration smoke；脚本与断言已就绪，待发布后执行。

### Stage 5：管理治理与数据优化

- 增加覆盖、多样性、失败和成本观测。
- 支持策略版本、灰度和回滚。
- 用真实数据调整默认阈值，但不进行无审核在线学习。

## 18. 推荐推进顺序

本能力依赖 CAP-10 的普通功能文档规范化。推荐顺序：

1. 完成 `RequirementModuleV1` 和明星组合 golden fixture。
2. 实现纯函数、确定性的 batch planner，不先接 runtime。
3. 为 3/6 variation 建立覆盖与差异测试。
4. 把 plan 写入现有 capability/job snapshot。
5. 接用户端探索度与计划预览。
6. 最后由 Runtime Gateway 编译单 variation context。
7. 有真实使用数据后再建设管理端策略调优。

不建议先做的事项：

- 直接把滑块绑定到 BabeL-O temperature。
- 让每个 child session 自行阅读原文并随机抽样。
- 在没有 snapshot 前允许 resume 重新规划。
- 在没有事实门禁前开放高探索。

## 19. 验收标准

本专项可视为 MVP 闭环的条件：

- 明星组合功能文档可确定性拆出带 evidence 的模块图。
- 一次 3/6 variation 生成拥有可解释的整批覆盖计划。
- 用户可通过探索度控制设计发散，不需要理解模型参数。
- 必需模块、事实、安全和权限在所有档位保持不变。
- 每个 variation 的主方向、模块和模板选择进入 snapshot。
- resume、retry、refine、share 和历史 artifact 不发生计划漂移。
- BabeL-O 与 CLI Agent 通过同一 Runtime Exploration Context 接入。
- 管理端可观测探索策略质量，但不能改写已有任务。

## 20. 文档治理要求

- 具体实现任务同步登记到四层模块 `TODO.md`。
- 每个里程碑完成后更新对应 `WORKLOG.md`。
- 长期边界若发生变化，例如允许 runtime 自主改写计划，需要新增 ADR。
- 契约字段发生不兼容变化时升级版本，不原地改变历史 snapshot 语义。
- 本文只定义产品语义和治理边界，具体实现状态以 TODO 与 WORKLOG 为准。
