# 动态百科模板系统深度分析报告

> 版本：v1.0
> 日期：2026-07-15
> 文档类型：架构分析
> 适用对象：产品、开发、业务负责人
> 数据来源：源码分析（officialDesignTemplatePacks.ts 1624 行、capabilities.ts、encyclopediaSpecReview.ts、service.ts、capabilityI18n.ts、encyclopediaDemocase.ts）、WORKLOG 文档、垂类模板迭代规划文档
> 说明：本文档对动态百科模板系统的三层架构、交互范式、后端推荐逻辑、规范审查、前端集成、i18n 覆盖、垂类模板注册与调试记录进行全面分析，识别完整性缺口与数据一致性风险。

---

## 一、整体架构概览

动态百科模板系统是一个**三层结构**：

```
父模板包 (dtp_dynamic_encyclopedia_card)
├── 通用子模板 (5个)
│   ├── dtp_dynamic_encyclopedia_summary_card    ← 摘要卡
│   ├── dtp_dynamic_encyclopedia_timeline_card   ← 时间线卡
│   ├── dtp_dynamic_encyclopedia_relation_card   ← 关系图谱卡
│   ├── dtp_dynamic_encyclopedia_compare_card    ← 对比辨析卡
│   └── dtp_dynamic_encyclopedia_expandable_card ← 可展开事实卡
├── 垂直子模板 (10个)
│   ├── dtp_de_history_person_relationship       ← 历史人物·关系图谱
│   ├── dtp_de_history_person_event_chain        ← 历史人物·事件链
│   ├── dtp_de_film_cast_role_network            ← 电影·演员角色网
│   ├── dtp_de_film_series_navigation            ← 电影·系列导航
│   ├── dtp_de_tv_character_relation             ← 电视剧·角色关系
│   ├── dtp_de_tv_episode_chain                  ← 电视剧·剧集链
│   ├── dtp_de_cultural_phrase_relation_graph    ← 文化词语·关系图谱
│   ├── dtp_de_cultural_phrase_origin_story      ← 文化词语·起源故事
│   ├── dtp_de_scenic_spot_route_guide           ← 景区·路线导览
│   └── dtp_de_scenic_spot_map_poi               ← 景区·地图POI
```

**数据来源**：[officialDesignTemplatePacks.ts](apps/api/src/officialDesignTemplatePacks.ts) 共 1624 行，动态百科相关 pack 占 600+ 行。

---

## 二、各层详细分析

### 2.1 父模板包 `dtp_dynamic_encyclopedia_card`

**文件位置**：[officialDesignTemplatePacks.ts:453-540](apps/api/src/officialDesignTemplatePacks.ts)

**核心设计令牌**：

| 组件 | PC 尺寸 | WISE 标准尺寸 |
|---|---|---|
| 卡片框架 | 788×492 | 380×456 |
| 宽高比 | — | 1:1.2 |

**硬性归束（v0.4 新增，2026-07-08 落地）**：

1. **禁内部滚动**：`overflow: hidden` 强制单屏交付，溢出内容必须走 `.tab-bar` / `.page-switcher` / `.modal-overlay`
2. **中文优先**：默认正文为简体中文，禁用 `View More`/`Read More` 等英文 UI 短语，必须用 `查看更多`/`阅读更多`
3. **交付安全**：无外部脚本、无视频资源、无跳转链接

**rationale.sections.packageChildren** 明确声明了 5 个通用子模板 + 10 个垂直子模板的规划。

### 2.2 通用子模板（已注册 5 个）

| ID | 中文名 | 适用词条分类 |
|---|---|---|
| `dtp_dynamic_encyclopedia_summary_card` | 动态百科·摘要卡 | 名人、机构组织、企业、学校、物品产品、知识术语 |
| `dtp_dynamic_encyclopedia_timeline_card` | 动态百科·时间线卡 | 历史人物、影视作品、文学著作、企业、文化活动、游戏 |
| `dtp_dynamic_encyclopedia_relation_card` | 动态百科·关系图谱卡 | 名人、历史人物、企业、机构组织、影视作品、文学著作、游戏 |
| `dtp_dynamic_encyclopedia_compare_card` | 动态百科·对比辨析卡 | — |
| `dtp_dynamic_encyclopedia_expandable_card` | 动态百科·可展开事实卡 | — |

**子模板字段**：
- `parentPackId: 'dtp_dynamic_encyclopedia_card'`
- `templateRole: 'child_template'`
- `supportedProductModes: ['dynamic_encyclopedia_card']`
- `supportedEntryCategories`: 垂类适用范围

**HTML 示例**：只有 `summary_card` 有完整的 few-shot HTML（[officialDesignTemplatePacks.ts:17-60](apps/api/src/officialDesignTemplatePacks.ts)），其余 4 个子模板 `htmlExamples` 字段目前为空。

### 2.3 垂直子模板（已注册 10 个）

**命名规则**：`dtp_de_{垂类}_{交互类型}`

| ID | 垂类 | 交互类型 | 是否有 HTML 示例 |
|---|---|---|---|
| `dtp_de_history_person_relationship` | 历史人物 | 关系图谱 | ❌ |
| `dtp_de_history_person_event_chain` | 历史人物 | 事件链 | ❌ |
| `dtp_de_film_cast_role_network` | 电影 | 演员角色网 | ❌ |
| `dtp_de_film_series_navigation` | 电影 | 系列导航 | ❌ |
| `dtp_de_tv_character_relation` | 电视剧 | 角色关系 | ❌ |
| `dtp_de_tv_episode_chain` | 电视剧 | 剧集链 | ❌ |
| `dtp_de_cultural_phrase_relation_graph` | 文化词语 | 关系图谱 | ❌ |
| `dtp_de_cultural_phrase_origin_story` | 文化词语 | 起源故事 | ❌ |
| `dtp_de_scenic_spot_route_guide` | 景区 | 路线导览 | ❌ |
| `dtp_de_scenic_spot_map_poi` | 景区 | 地图POI | ❌ |

**特点**：继承父包约束（固定尺寸、禁滚动、中文优先），同时具备垂类特定的 `rationale.sections.dataShape`。所有 10 个垂直子模板**均无 HTML 示例**。

---

## 三、交互范式层

### 3.1 已注册的交互范式

**文件位置**：[capabilities.ts:256-340](apps/api/src/capabilities.ts)

| ID | 中文名 | bestFor | compatibleTemplatePackIds |
|---|---|---|---|
| `ip_entity_summary` | 实体摘要 | 名人、机构组织、企业、学校、物品产品、知识术语 | `dtp_dynamic_encyclopedia_summary_card` |
| `ip_timeline_story` | 时间线叙事 | 历史人物、影视作品、文学著作、企业、文化活动、游戏 | `dtp_dynamic_encyclopedia_timeline_card` |
| `ip_relation_map` | 关系图谱 | 名人、历史人物、企业、机构组织、影视作品、文学著作、游戏 | 10 个垂直子模板 |
| `ip_fact_compare` | 事实对比 | — | `dtp_dynamic_encyclopedia_summary_card`, `compare_card`, `expandable_card` |
| `ip_expandable_facts` | 可展开事实 | — | `dtp_dynamic_encyclopedia_expandable_card` |
| `ip_causal_event_chain` | 因果事件链 | — | 垂直子模板（event_chain 类） |
| `ip_series_navigation` | 系列导航 | — | 垂直子模板（series/chain 类） |
| `ip_route_guide` | 路线导览 | 景区 | `dtp_de_scenic_spot_route_guide`, `dtp_de_scenic_spot_map_poi` |

**关键设计**：`compatibleTemplatePackIds` 是**唯一事实来源**（符合第 12.6 节决策），子模板侧不再冗余 `supportedInteractionParadigms`。

### 3.2 前端 i18n 映射

**文件位置**：[capabilityI18n.ts:113-128](apps/web/src/lib/capabilityI18n.ts)

**已覆盖**：
- 5 个通用子模板的中文名/描述 ✅
- 5 个交互范式的中文名/描述（`ip_entity_summary`、`ip_timeline_story`、`ip_relation_map`、`ip_fact_compare`、`ip_expandable_facts`）✅

**未覆盖**：
- 10 个垂直子模板的中文名/描述 ❌
- 3 个交互范式的中文名/描述（`ip_causal_event_chain`、`ip_series_navigation`、`ip_route_guide`）❌

---

## 四、后端推荐逻辑

### 4.1 词条引导向导 API

**路由**：
- `POST /api/encyclopedia/entry-guidance` — 创建引导
- `GET /api/encyclopedia/entry-guidance/:id` — 查询结果
- `POST /api/encyclopedia/entry-guidance/:id/confirm` — 确认推荐

**server.ts 位置**：[server.ts:133-147](apps/api/src/server.ts)

### 4.2 推荐算法 `recommendDynamicEncyclopediaTemplates`

**文件位置**：[service.ts:2513-2550](apps/api/src/service.ts)

**流程**：
1. 从 democase 匹配收集 `preferredTemplateIds`
2. 按分类规则补充默认推荐（如"历史"→ timeline + summary）
3. 去重后从存储层加载实际模版对象
4. 构建 `recommendedTemplates` 输出（含 `name`、`interactionParadigmId`、`reason`、`confidence`）

**关键代码**：
```typescript
// service.ts:2535
interactionParadigmId: interactionParadigmIdForTemplatePack(template.id)
  ?? recommendedInteractionParadigmId(primaryCategory, secondaryCategory)
```

### 4.3 democase 模拟数据

**文件位置**：[encyclopediaDemocase.ts](apps/api/src/encyclopediaDemocase.ts)

**数据结构**：
```typescript
type EncyclopediaDemocase = {
  id: string
  title: string
  aliases: string[]
  primaryCategory: string
  secondaryCategory: string
  interactionParadigmId: string      // 决定推荐哪个范式
  preferredTemplateIds: string[]     // 决定推荐哪些子模板
  keywords: string[]
  summary: string
}
```

**当前 mock 数据覆盖**：企业、知识术语、游戏、历史人物、电影、电视剧、文化词语、景区 8 类。

---

## 五、百科规范审查器

### 5.1 规则表

**文件位置**：[encyclopediaSpecReview.ts:51-85](apps/api/src/encyclopediaSpecReview.ts)

**规则统计**：共 27 条规则，其中 Stage 0（既有）11 条、Stage 1（新增）16 条。

**规则分类**：

| 类别 | 规则 ID 示例 | 当前 severity |
|---|---|---|
| Stage 0（既有） | `viewport_meta_missing`, `external_script_blocked`, `scroll_container_missing` | error |
| Stage 1（新增-禁滚动） | `no_scroll_frame_required`, `overflow_scroll_blocked`, `scroll_container_class_blocked` | **warning** |
| Stage 1（新增-中文优先） | `chinese_only_required`, `english_ui_phrase_blocked`, `excessive_english_phrases` | **warning** |
| Stage 1（新增-垂类业务） | `media_fact_source_required`, `spoiler_control_required`, `history_relation_source_required` | **warning** |

**两阶段发布策略**（2026-07-08 落地）：
- Stage 1：新规则以 warning 形态生效，收集真实分布，避免误伤存量生成结果
- Stage 2：规则成熟后升级为 error，触发 loop repair；入口：调整 `ENFORCEMENT` 表中的 severity 即可，调用方无需改代码

### 5.2 调试记录（WORKLOG 摘要）

根据 WORKLOG 记录，spec review 的调试与迭代包括：

- **2026-07-08**：硬性归束 v0.4 落地——中文优先 + 禁内部滚动 + 禁英文 UI 短语，spec review / 父包子模板 / skill prompt / democase summary / 持久化 / Web UI / Admin 摘要全部对齐
- **2026-07-06**：`loop_encyclopedia_spec_review` 注册，`qualityGates: ['static', 'spec', 'pixel']`，`repairStrategy: spec_review_refine`
- **2026-07-03**：spec review 保持确定性静态规则，不引入 LLM 审查，避免自动修复链路不可复现
- **2026-07-01**：`AutomationLoopProfile.qualityGates` 兼容字段和 `spec_review_refine` repair strategy 落地
- **2026-06-30**：`variationTemplateAssignments` 成为 spec review 的 child template 事实来源，job 级 `designTemplatePackIds` 仅作为无 assignment 时的兼容回退

---

## 六、前端集成

### 6.1 模板库排序

**文件位置**：[TemplateLibraryPicker.tsx:99-104](apps/web/src/components/TemplateLibraryPicker.tsx)

```typescript
const officialPacks = useMemo(() => {
  const isEncyclopedia = (pack: DesignTemplatePack) => pack.id.startsWith('dtp_dynamic_encyclopedia')
  return props.packs
    .filter(pack => pack.source === 'official')
    .sort((a, b) => Number(isEncyclopedia(b)) - Number(isEncyclopedia(a)))
}, [props.packs])
```

**效果**：动态百科模板排在官方列表最上方。

### 6.2 entryGuidance 渲染

**文件位置**：[page.tsx:965-1005](apps/web/src/app/page.tsx)

**渲染内容**：
- 分类结果：`primaryCategory / secondaryCategory`
- 置信度：`confidence * 100%`
- 交互范式名：`c18n.interactionParadigmName(...)`
- 推荐子模板列表：`c18n.templatePackName(template.designTemplatePackId, template.name)`

### 6.3 产品模式切换

**状态**：`productMode = 'web_app' | 'dynamic_encyclopedia_card'`

**自动勾选三件套**（动态百科模式）：
- 词条引导 skill
- 动态百科词条卡片模板包
- 自动审查 loop

---

## 七、文档与进度

### 7.1 业务规划文档

**文件**：`docs/dynamic-encyclopedia-card-business-logic-plan.md`
**版本**：v0.4（2026-07-08）
**状态**：实施中，Stage 1-5 已完成，Stage 6-7 推进中

**第 12 节**：钉死的 6 项决策（democase 双路径、qualityGates 数组、llm_review Phase 2、productMode 顶层化、子模板清单对齐、交互范式单向关联）
**第 17 节（新增）**：硬性归束约束（中文优先 + 禁内部滚动）

### 7.2 垂类模板迭代规划文档

**文件**：`docs/dynamic-encyclopedia-vertical-template-roadmap.md`
**版本**：v0.1（2026-07-09）
**状态**：规划准入
**内容**：垂类优先级（历史人物/电影/电视剧/文化词语/景区）、模板升级方向、分类升级至 11 个一级类、审查重点

### 7.3 各模块 TODO 进度

| 模块 | 已完成 [x] | 待办 [ ] | 完成率 |
|---|---|---|---|
| capability-distribution | 260 | 40 | 87% |
| application-service | 278 | 27 | 91% |
| user-experience | 153 | 20 | 88% |
| runtime-compatibility | 180 | 14 | 93% |
| admin-console | 69 | 42 | 62% |

**动态百科相关 phase**：
- CAP-8：动态百科卡片能力包
- APP-9：动态百科业务编排
- UX-8：动态百科卡片模式
- RTC-8：动态百科 Runtime Context

---

## 八、关键发现与建议

### 8.1 完整性缺口

| 缺口 | 现状 | 建议 |
|---|---|---|
| **timeline/relation/compare/expandable 子模板无 htmlExamples** | 只有 `summary_card` 有 few-shot HTML（约 40 行） | 补齐其余 4 个子模板的 HTML 示例（与 Stage 6 收尾对齐） |
| **10 个垂直子模板无 htmlExamples** | 全部为空 | 新增首批 HTML 示例，优先覆盖历史人物类和电影类 |
| **democase 数据覆盖不足** | 仅 8 类 mock，无 L3 细分垂类 | 接入真实 democase 数据库或扩展 mock 至更多垂类 |
| **交互范式 i18n 不完整** | 8 个范式中仅 5 个有中文映射 | 补 `ip_causal_event_chain`、`ip_series_navigation`、`ip_route_guide` |
| **垂类子模板 i18n 缺失** | 10 个垂直子模板无中文名/描述 | 按 `dtp_de_history_person_relationship` → `历史人物·关系图谱` 格式补全 |
| **spec review Stage 1→Stage 2 升级路径未执行** | 新规则仍为 warning | 根据真实分布数据决定升级时机，升级规则时需跑回归测试 |

### 8.2 数据一致性风险

**风险**：`packageChildren` 字符串与实际注册子模板数量不一致。

**现状**：`packageChildren` 声明 5 通用 + 10 垂直 = 15 个，代码中实际注册 15 个。

**一致性**：✅ 当前一致。但未来新增子模板时需同步更新 `packageChildren` 文案，否则会不一致。

**建议**：在子模板注册流程中增加一条检查规则：`packageChildren` 中列出的子模板 ID 必须与实际注册的子模板 ID 集合一致。

### 8.3 规则升级路径

**建议**：当"硬性归束"规则从 warning 升级到 error 时，需：
1. 更新 `ENFORCEMENT` 表的 severity
2. 跑一遍全量回归测试，确保存量生成结果不误伤
3. 在管理端展示规则版本与生效时间

### 8.4 垂类模板迭代建议

基于垂类模板迭代规划文档（`docs/dynamic-encyclopedia-vertical-template-roadmap.md`）的优先级排序：

1. **第一优先级**：补齐 5 个通用子模板的 HTML 示例（summary 已有，timeline/relation/compare/expandable 缺）
2. **第二优先级**：补齐 10 个垂直子模板的 i18n 中文映射（当前全缺，影响前端渲染）
3. **第三优先级**：补齐 3 个缺失的交互范式 i18n 映射
4. **第四优先级**：扩展 democase mock 数据至更多垂类细分
5. **第五优先级**：基于垂类迭代规划中的 `case 垂类分类` 参考目录（20 个可运行 HTML case），为历史人物、电影、电视剧、文化词语、景区五类垂类生成首批 HTML 示例并纳入 spec review

---

## 九、模板更新与调试记录汇总

> 以下记录基于 `docs/modules/capability-distribution/WORKLOG.md` 及相关提交记录整理。

### 2026-07-08：硬性归束 v0.4 落地

- **变更**：中文优先 + 禁内部滚动 + 禁英文 UI 短语 三条硬性归束全部落地
- **涉及范围**：spec review、父包子模板、skill prompt、democase summary、持久化、Web UI、Admin 摘要
- **两阶段策略**：新规则以 warning 形态生效，`ENFORCEMENT` 表统一控制 severity
- **验证**：`npm run typecheck`、`npm test`、API smoke

### 2026-07-06：spec review loop profile 注册

- **变更**：注册 `loop_encyclopedia_spec_review`
- **配置**：`qualityGates: ['static', 'spec', 'pixel']`、`maxRepairAttempts: 2`、`repairStrategy: spec_review_refine`
- **验证**：`npm run typecheck`、`npm test`、runtime-gateway test

### 2026-07-03：确定性规则决策

- **决策**：spec review 保持确定性静态规则，不引入 LLM 审查
- **原因**：避免自动修复链路不可复现
- **影响**：finding source 保留 `llm_review` 但标注 Phase 2，MVP 不启用

### 2026-07-01：qualityGates 契约改造

- **变更**：`qualityGate` 改为 `qualityGates` 数组，删除 `enablePixelGate`
- **迁移**：`loop_fast`/`loop_standard` → `['static']`、`loop_deep_repair` → `['static', 'pixel']`
- **验证**：全量 API smoke + runtime-gateway golden

### 2026-06-30：variation-scoped spec review context

- **变更**：`variationTemplateAssignments` 成为 spec review 的 child template 事实来源
- **修复**：job 级 `designTemplatePackIds` 仅作为无 assignment 时的兼容回退，避免非 timeline variation 触发 timeline mismatch
- **验证**：mock integration 覆盖 static fail → repair → pass 路径

### 2026-06-28：动态百科子模板注册

- **变更**：注册首批 5 个动态百科子模板（summary/timeline/relation/compare/expandable），与父包 `packageChildren` 声明对齐
- **推荐逻辑升级**：从摘要/时间线二选一升级为按词条类别和 democase 信号推荐 1-3 个子模板
- **验证**：API smoke + E2E

### 2026-06-27：动态百科父模板包注册

- **变更**：`dtp_dynamic_encyclopedia_card` 作为官方 Design Template Pack 根模板入库
- **子模板状态**：先记录在 pack rationale sections 中，待后续拆成独立表
- **验证**：能力注册 + 模板列表 API

### 待办调试项

1. **pc预览问题**：动态百科卡片在 PC 全屏预览时，如果 iframe 尺寸不等于 788×492，可能导致布局错乱。需要确认 preview iframe 是否强制锁定了 788×492 尺寸。
2. **WISE 兼容性**：WISE 端 380×456 的标准尺寸在更低分辨率（如 300×360）下的行为尚未验证。需要补充 `@media` 查询的调试。
3. **tab-bar 溢出策略**：部分子模板生成结果可能超出 `.tab-bar` 可承载的标签数量，需要验证 `tab-bar` 的溢出行为（滚动的 tab-bar 是否违反禁滚动归束）。
4. **page-switcher 高度适配**：`page-switcher` 切换页面时，如果内容高度不一致，可能导致页面跳动或内容溢出。需要测试多页切换的稳定性。
5. **modal-overlay 点击穿透**：`modal-overlay` 关闭后，可能存在点击穿透到下层页面的问题。需要验证 overlay 关闭后的事件处理。
6. **垂直子模板 HTML 示例生成**：10 个垂直子模板无 HTML 示例，生成阶段依赖 BabeL-O 自主理解 `dataShape` 和 `rationale`。需要基于 `case 垂类分类` 参考目录生成首批 vertical HTML 示例。

---

## 总结

动态百科模板系统**架构清晰、三层解耦合理**：
- 父包负责硬约束（尺寸、禁滚动、中文优先、交付安全）
- 子模板负责垂类适配（dataShape、适用词条分类）
- 交互范式负责推荐逻辑（bestFor、compatibleTemplatePackIds）

**主要缺口**：
- 4 个通用子模板 + 10 个垂直子模板无 few-shot HTML（仅 summary 有）
- 10 个垂直子模板 + 3 个交互范式缺少 i18n 中文映射
- democase mock 数据有限（仅 8 类）
- spec review 新规则仍处于 Stage 1（warning）阶段，需根据真实分布决定升级时机

**建议优先级**：
1. 补齐 `ip_causal_event_chain`/`ip_series_navigation`/`ip_route_guide` 的 i18n 映射
2. 为 timeline/relation/compare/expandable 子模板补 HTML 示例
3. 为 10 个垂直子模板补 i18n 中文映射
4. 基于垂类迭代规划中的 case 参考目录，生成首批垂直子模板 HTML 示例
5. 接入真实 democase 数据或扩展 mock 数据覆盖更多垂类
