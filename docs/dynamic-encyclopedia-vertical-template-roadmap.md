# 动态百科垂类模板迭代规划

> 状态：v0.1  
> 来源：Obsidian Vault `BaiDu/动态百科/04_垂类模板与内容` 本地需求文档分析；`/Users/tangyaoyue/DEV/Baidu/case垂类分类` 本地垂类 case 参考。
> 关联模块：Capability Distribution System、Application Service、Runtime Compatibility、User Experience。

## 1. 规划目标

动态百科模式不能长期停留在一个通用“词条卡片”模板包。外部需求文档显示，真实业务需要按照词条垂类进行规模化生产：

```text
词条输入
  -> L1/L2/L3+ 分类向量
  -> 垂类模板包
  -> 子模板 / 交互范式
  -> 自动规范审查
  -> BabeL-O runtime 生成与修复
```

DUDesign 第一阶段已具备 `dtp_dynamic_encyclopedia_card` 父模板包和 5 个通用子模板。下一阶段目标是把这些通用子模板升级为垂类模板体系，让“词条引导”能够自动识别历史人物、电影作品、电视剧作品、文化类词语，并推荐更贴合业务的官方模板包。

## 2. 来源文档要点

当前输入目录包含 14 份动态百科垂类文档，核心结论如下：

- 动态百科的生产模式应从“单垂类手工打磨”升级为“统一约束 + 垂类参数 + Skill 提炼”的批量生产。
- 短期优先垂类是历史人物、电影作品、电视剧作品；文化类词语是知识术语方向的重要补充。
- 词条分类体系应从粗粒度“人物/作品/知识”升级到 11 个一级类、44 个二级类和 L3+ 特征向量。
- 模板需要同时表达基础查询效率和深度浏览承接：首屏先满足基本信息，后续通过关系图谱、事件链、系列导航、相似推荐、典故深化等模块承接二次需求。
- 动态百科卡片交付必须遵守固定 viewport、iframe、touch/scroll、中文优先、无内部滚动、安全边界等硬约束。

当前 case 参考目录包含 20 个可运行 HTML case，作为模板迭代的更具体验收标准：

- 历史人物：5 个“核心事件因果链 / 点击解锁因果链”case，稳定出现“如果没有这 N 件事”“史实 / 如果没发生”对照和事件解锁体验。
- 文化类词语：5 个“关联词详解 / 诗词解析”case，稳定出现“出处、典故、关联词、近义、反义、易混、寓意”模块。
- 景区景点：5 个“智能导览 / 路线推荐”case，稳定出现“导览、路线、景点、地图、坐标”模块。
- 电影电视剧：5 个“人物图谱与剧情脉络 / 全解析”case，稳定出现“关系图谱、剧情因果、作品推荐、同主演、同题材、同作者、系列”三视图结构。

## 3. 垂类优先级

### 3.1 历史人物

用户路径：

```text
查人 -> 看关系 -> 看事件和作品
```

核心模块：

- P0：人物关系图谱、人物列表/排名。
- P1：历史事件因果链。
- P2：文学作品关联。

模板方向：

- `dtp_de_history_person_relationship`
- `dtp_de_history_person_event_chain`
- `dtp_de_history_person_ranking`

审查重点：

- 人物关系不得编造。
- 事件链必须包含起因、经过、结果、影响。
- 排名/顺序必须标注客观顺序或综合排序依据。

### 3.2 电影作品

用户路径：

```text
查电影 -> 看演员/角色 -> 看系列/IP -> 看相似推荐
```

核心模块：

- P0：演员-角色关联网络、系列电影导航、相似推荐、口碑票房速览。
- P1：剧情脉络、角色身份速查、演员多作品关联、版本/语言导航。
- P2：AI 推荐入口、演员百科双向跳转、电影-电视剧串联。

模板方向：

- `dtp_de_film_cast_role_network`
- `dtp_de_film_series_navigation`
- `dtp_de_film_plot_chain`
- `dtp_de_film_recommendation`

审查重点：

- 不提供盗版播放、下载、网盘、磁力、泄露资源入口。
- 票房、评分、上映信息不能编造。
- 剧情/结局内容需要分级揭示，避免默认剧透。

### 3.3 电视剧作品

用户路径：

```text
查剧 -> 看角色关系 -> 看分集剧情 -> 看系列/相似剧
```

核心模块：

- P0：角色关系图谱、分集剧情因果链、系列作品导航、相似推荐。
- P1：角色身份速查、伏笔追踪链、角色-事件联动、原著-改编对照。
- P2：AI 推荐入口、搜索摘要直出、事件-角色-作品串联。

模板方向：

- `dtp_de_tv_character_relation`
- `dtp_de_tv_episode_chain`
- `dtp_de_tv_series_navigation`
- `dtp_de_tv_character_quick_answer`

审查重点：

- 分集剧情不得编造不存在的集数或情节。
- 伏笔/回收链必须绑定集数或明确“资料不足”。
- 不提供观看资源入口。

### 3.4 文化类词语

用户路径：

```text
查词义 -> 探出处/典故 -> 看关联词
```

核心模块：

- P0：关联词语图谱。
- P1：出处/典故内容深化。
- P1：词义辨析。
- P2：快捷选择题与反馈入口。

模板方向：

- `dtp_de_cultural_phrase_relation_graph`
- `dtp_de_cultural_phrase_origin_story`
- `dtp_de_cultural_phrase_meaning_compare`

审查重点：

- 基础释义必须通俗准确。
- 典故缺少可靠出处时隐藏或标注缺失，不能硬拼。
- 关联词必须说明关系类型：近义、反义、同源、同类典故、易混词等。

### 3.5 景区景点

用户路径：

```text
查景区 -> 看导览路线 -> 看 POI / 地图概览 -> 看游览提示
```

核心模块：

- P0：智能导览路线、必看景点、游览顺序。
- P1：POI 地图概览、坐标/位置资料状态、路线串联。
- P2：开放时间、门票、交通、安全提示等高变化事实的来源提示。

模板方向：

- `dtp_de_scenic_spot_route_guide`
- `dtp_de_scenic_spot_map_poi`

审查重点：

- 坐标、地图、POI 不得硬编；缺失时标注“坐标待补充 / 位置资料不足 / 示意路线”。
- 开放时间、门票、交通、客流、安全提示属于高变化事实，必须标注来源、不确定性或“以官方信息为准”。
- 不把外部导航、购票、酒店、打车、预订作为核心交互。
- 不模仿公开地图产品、旅游平台或搜索产品 trade dress。

## 4. 模板体系升级

当前父包：

- `dtp_dynamic_encyclopedia_card`

当前通用子模板：

- `dtp_dynamic_encyclopedia_summary_card`
- `dtp_dynamic_encyclopedia_timeline_card`
- `dtp_dynamic_encyclopedia_relation_card`
- `dtp_dynamic_encyclopedia_compare_card`
- `dtp_dynamic_encyclopedia_expandable_card`

下一阶段新增垂类模板时，应保持两层关系：

```text
dtp_dynamic_encyclopedia_card
  -> 通用子模板
  -> 垂类专属子模板
```

垂类专属模板继续继承父包硬约束：

- PC 788×492。
- WISE 380×456，兼容 300×360 到 396×475。
- `no-scroll-frame`。
- 禁 `overflow:auto/scroll` 和 `.scroll-container`。
- 通过 `tab-bar`、`page-switcher`、`modal-overlay` 做单屏信息分层。
- 中文优先，语言类词条除外。
- 禁英文 UI 短语。
- 禁模仿公开百科、搜索产品、浏览器或移动应用 trade dress。

## 5. 词条分类升级

当前 guidance 仍以启发式规则为主，下一阶段应向文档中的 11 个一级类靠拢：

- 名人
- 影视作品
- 物品产品
- 地域建筑
- 机构组织
- 文学著作
- 知识术语
- 文化活动
- 游戏
- 社会生活
- 音乐作品

MVP 不需要一次性覆盖 44 个二级类，但需要先支持四组高优先级：

- `名人 / 历史人物`
- `影视作品 / 电影`
- `影视作品 / 电视剧`
- `知识术语 / 文化类词语`
- `地域建筑 / 景区景点`

为了兼容旧字段，短期仍保存为：

```text
primaryCategory
secondaryCategory
tertiaryCategory
```

但 `metadata.classificationVector` 应逐步补充：

```json
{
  "l1": "影视作品",
  "l2": "电影",
  "l3": "悬疑/犯罪片",
  "signals": ["电影", "主演", "剧情", "系列"],
  "recommendedModulePriorities": ["cast_role_network", "series_navigation", "similar_recommendation"]
}
```

## 6. 自动审查升级

`loop_encyclopedia_spec_review` 应从通用审查扩展为“通用硬约束 + 垂类规则”：

- 通用硬约束：viewport、no-scroll、中文优先、禁英文 UI、禁外链核心交互、禁 trade dress 模仿。
- 历史人物：关系、事件、排名需有依据，不得编造。
- 影视作品：不提供盗版资源；剧情、角色、评分、票房不得幻觉；剧透需分级。
- 电视剧：集数、分集剧情、伏笔回收不得硬编。
- 文化词语：释义准确；典故出处缺失时不展示；关联词需标注关系。

审查产物应继续进入 `qualityGates` 的 `spec` gate，并由 `repairStrategy = spec_review_refine` 生成定向修复 prompt。

## 7. 四层架构映射

第 1 层用户前端交互：

- 动态百科模式展示词条引导结果。
- 展示分类、推荐模板、自动审查状态。
- 允许用户确认/修正分类和模板。

第 2 层管理员/开发者前端交互：

- 治理官方垂类模板包。
- 查看模板 lint、spec review、runtime drift、失败原因。
- 禁用风险模板或插件。

第 3 层后端服务：

- 维护分类、模板推荐、capability snapshot、guidance 持久化。
- 生成垂类 `businessContext`。
- 执行自动审查和修复编排。

第 4 层后端内核兼容：

- 把分类、模板、skill、审查规则编译为 BabeL-O 可消费的 prompt context。
- BabeL-O 内核不直接理解 DUDesign 数据模型。
- 内核升级只影响 Gateway/Adapter 和 contract tests。

## 8. 推进顺序

1. 文档沉淀：将外部垂类需求转成 DUDesign 项目规划文档。
2. 模板 registry：注册历史人物、电影、电视剧、文化词语首批官方子模板。
3. Guidance 升级：扩展分类规则和 democase，使推荐能落到垂类模板。
4. Spec review：增加影视安全、历史关系、文化典故等垂类审查规则。
5. Case 标准回灌：以 `/Users/tangyaoyue/DEV/Baidu/case垂类分类` 中的可运行 HTML case 为参考，持续更新模板 rationale、guidance 推荐和 spec review。
5. Runtime Gateway：把垂类上下文注入 BabeL-O prompt。
6. User UX：把分类、模板确认、自动审查状态做成顺滑业务线。
7. Admin Governance：展示垂类模板质量、使用量、失败率和 drift。
