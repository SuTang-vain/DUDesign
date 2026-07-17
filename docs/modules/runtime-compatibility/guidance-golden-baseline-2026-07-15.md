# BabeL-O Guidance Golden Baseline（2026-07-15）

> 模块：后端内核兼容层（RTC-14）
> 环境：staging，BabeL-O 0.4.0，MiniMax-M3，3 条 static runtime lane，受控并发 3。
> 最终报告：`/app/.dudesign/artifacts/reports/guidance-golden-baseline-v5-2026-07-15.json`
> SHA-256：`40a77aa4f3c11cbb84ee9dc9c00e9f9d5410fc98bc91b720d4b849a704afc3d6`

## 结论

2026-07-15 的第五轮 100 条真实模型评测通过全部 staging 准入阈值。词条引导已确认由真实 BabeL-O AI 推理完成，并通过 DUDesign Runtime Adapter 归一化为 provider-neutral contract。

准入通过后，staging 已将 `DUDESIGN_GUIDANCE_ANALYSIS_PROVIDER` 从 `legacy` 切换为 `babel-o`。真实用户 API smoke 使用“庆余年人物关系与剧情脉络”，返回 `ai_guidance_v2`、电视剧/古装历史剧、`character_relationship_exploration`、关系图与剧情链模板，状态为 `completed`。

| 指标 | 最终结果 | 阈值 | 结论 |
| --- | ---: | ---: | --- |
| Coverage | 99.0% | 98% | 通过 |
| L1 Accuracy | 98.0% | 90% | 通过 |
| L2 Accuracy | 92.9% | 82% | 通过 |
| Taxonomy Node Accuracy | 85.9% | 78% | 通过 |
| Primary Intent Accuracy | 94.9% | 75% | 通过 |
| Top-3 Template Recall | 100% | 85% | 通过 |
| Clarification Precision | 87.5% | 70% | 通过 |
| Clarification Recall | 70.0% | 70% | 通过 |

## 迭代记录

| Baseline | Coverage | L2 | Intent | Template | Clarification P/R | 主要改进 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| v1 | 86% | 87.2% | 0% | 100% | 36.4% / 88.9% | 首次真实模型基线 |
| v2 | 93% | 90.3% | 92.5% | 98.9% | 88.9% / 80% | intent allowlist、结构归一化、60s timeout |
| v3 | 97% | 90.7% | 91.8% | 99.0% | 100% / 30% | timeout 单次 retry |
| v4 | 99% | 91.9% | 93.9% | 99.0% | 35.7% / 100% | 歧义 prompt 强化，发现过度阻断 |
| v5 | 99% | 92.9% | 94.9% | 100% | 87.5% / 70% | 阻断性澄清语义过滤与 fixture 治理 |

## 兼容层决策

- guidance 调用使用独立 session、workspace 和 memory namespace，并显式禁止工具调用。
- Provider 输出必须通过 schema、taxonomy、template、interaction 和 primary intent allowlist。
- 允许一次 bounded JSON repair；初次 `/v1/execute` timeout 允许一次重试，repair 阶段不重试。
- 安全归一化范围包括 status 方言、缺省数组、非完整 alternatives、clarification 和 evidence 引用。
- `clarification.required` 只表示阻断性实体身份/类型歧义；范围、版本、深度、剧透、路线入口等偏好问题保留文本但不阻断。
- 原始 thinking、lane/session id 和 Provider 私有事件不进入用户 guidance snapshot。

## 延迟

- P50：21.9s。
- P90：47.3s。
- P95：56.6s。
- P99：108.8s。
- 最大值：115.5s。
- 平均值：27.3s。

高分位延迟主要来自单次 60s timeout 后的一次受控重试。上线前应继续记录 retry rate、repair rate 和 Provider cost，不能只观察平均耗时。

## 剩余问题

- 唯一未预测样本：`贝多芬第五交响曲创作时间线`，两次执行均超时；Coverage 仍满足 98% 准入线。
- 稳定混淆集中在：电影/电视剧、城市/行政区划、自然科学/工程技术、消费品/工程技术、消费品/企业公司。
- `朝阳地区介绍`、`场的概念是什么`、`代理是什么意思` 仍可能出现澄清漏报，需要后续扩充 hard ambiguity fixtures。
- Taxonomy 源文档声明 44 个 L2，但当前只明确 41 个；不得由模型或工程侧自行补造剩余 3 个定义。
- BM25-style lexical retrieval 已可用，向量检索仍未完成。

## Fixture 治理

- `中山公园游览顺序` 调整为需要澄清：缺少城市会直接影响路线事实和 POI。
- `龙井的植物特征` 调整为无需阻断：输入已经明确植物语境，品种范围属于后续偏好。
- Fixture 调整必须依据产品阻断语义和真实模型问题记录，不得为了通过阈值任意降低标准。
