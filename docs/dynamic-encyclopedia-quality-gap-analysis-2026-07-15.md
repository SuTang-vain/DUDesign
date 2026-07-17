# 动态百科产物与 Democase 质量差距专项分析

日期：2026-07-15

> 产品语义校正：本文中的“动态百科”是历史技术命名。产品目标不是生成传统百科页面，而是生成“词条主题动态交互卡”。详见 `dynamic-topic-interactive-card-product-semantics.md`。

## 1. 现象

- 远端动态百科生成结果与模板库 democase 在结构完整度、视觉节奏、中文信息组织和交互完整性上差距明显。
- 用户提交文字 refine 或圈画修改后，浏览器可能显示“修改失败”，但后台稍后生成了新 artifact。
- 部分 refine 虽然完成，但质量状态从 `pass` 退化为 `warn`，并出现与当前词条不匹配的模板审查要求。

## 2. 远端证据

样本 job：`job_5a69e65d05a1492f`，词条 `BLACKPINK`，6 个 variation。

- variation 1 因 `RUNTIME_REQUEST_TIMEOUT` 失败。
- variation 2～6 完成，但实际模板分配包含：明星组合、时间线、摘要、通用关系、历史人物事件链、历史人物关系。
- guidance 原本只确认了明星组合、时间线、摘要 3 个模板；后 3 个模板是自动补位产生，并非用户确认结果。
- annotation refine `refine-1784103647649-gg34nh` 实际完成，耗时约 220 秒，生成新 artifact；浏览器链路存在 60 秒 Nginx 默认超时。
- refine 前 artifact quality 为 `pass`；refine 后被“历史人物事件链”规则要求补充起因/经过/结果/影响，说明错误模板身份持续污染质量门。
- PostgreSQL 中已发布官方模板快照缺少 `htmlExamples`，生产生成没有获得源码中已有的 few-shot HTML。

## 3. 根因

### 3.1 PostgreSQL 官方模板版本不刷新

`design_template_versions` 使用同版本冲突后 `DO NOTHING`。官方 `1.0.0` 后续增加 democase/htmlExamples 时，数据库仍保留旧 pack。

### 3.2 HTML example 路径和体积不适合直接进入运行时

- file ref 曾以 runtime package 目录作为解析基准，生产路径不稳定。
- 示例原始大小约 68KB～386KB，部分包含完整 React bundle；原样注入会占用约 2 万～12 万 token。

### 3.3 垂类模板没有结构示例

通用 summary/timeline/relation/compare/expandable 有示例，`dtp_de_*` 垂类模板没有示例。明星组合模板因此只有 tokens/rationale，没有 democase 级结构骨架。

### 3.4 自动分配引入未确认模板

guidance 返回 3 个已确认模板，但 `autoDistributeTemplatePacks=true` 会从全局 registry 继续补足到 variationCount，导致 BLACKPINK 被分配历史人物模板。

### 3.5 Refine 未继承生成时模板契约

spawn prompt 会注入当前 variation 模板，refine 过去只包含 current HTML、用户请求和 exploration context。模型无法稳定判断必须保留哪个模板、viewport 和 interaction paradigm。

### 3.6 语言判定把外文专有名词当作英文正文请求

context 为空时，`BLACKPINK` 的纯拉丁标题被判为 `entryContentLanguage=en`。中文产品中的非语言类词条应保留原文标题，但正文默认中文。

### 3.7 Refine HTTP 同步等待超过反向代理超时

API 已有 refine operation、polling、reconciler 和 queue，但 POST refine 仍同步等待 runtime。Nginx 未配置超时，默认约 60 秒；真实运行 220 秒时浏览器先失败、后台继续完成。

## 4. 本批修复

- 官方同版本模板仅在 `created_by_user_id is null` 时允许刷新 pack、tokens、rationale 和 content hash，不覆盖用户模板不可变版本。
- HTML example 从项目根可靠解析；进入 prompt 前移除 script/bundle、注释和外链，提取 CSS/静态 body，并设置约 24KB 单示例预算。
- 垂类模板继承 relation/timeline 等通用交互范式示例。
- guidance 默认 `autoDistributeTemplatePacks=false`；variation 数量超过推荐模板数时，只在已确认模板中轮转。
- refine 重新注入 variation assignment、模板 rationale、HTML example、业务上下文和高级约束，并要求局部修改。
- 无正文 context 的外文专有名词默认 `entryContentLanguage=zh`。
- staging Nginx API read/send timeout 提升到 600 秒，避免同步 refine 的假失败。
- `300×360` 不再只做尺寸压缩：共享体验 profile、Runtime prompt、Automation Loop、few-shot 和 Pixel Gate 统一要求一个主要交互组、最多 `3+2` 个可见控件，并保留主题身份与核心文字。
- relation、expandable、series、route、map 和 member 的极小屏示例已移除重复导航；分页、节点详情和“更多视图”保证被延后的内容仍可访问。

## 5. 后续治理

### P0

- 部署后验证 PostgreSQL 官方模板 pack 已包含 `htmlExamples`。
- 使用同一 BLACKPINK 输入重新生成 6 个 variation，断言模板集合只来自已确认推荐。
- 对 1 个 variation 连续执行文字 refine、圈画 refine，验证模板 ID 不变、artifact 版本递增、浏览器不提前失败。
- 在远端真实 generation/refine 矩阵中保存 desktop 与 `300×360` 截图，确认模型产物遵守单一主交互、核心文字保留和局部披露规则，而不只是官方 few-shot 通过。
- 证据固定写入 `shared/smoke-evidence/dynamic-encyclopedia/<jobId>`，至少包含 manifest、job detail、artifact quality、preview HTML、双视口 PNG、交互指标以及 refine 前后快照；只有这些真实产物证据齐全后才可勾选远端矩阵验收。

### P1

- 将 refine POST 改成真正异步：创建 operation 后返回 `202 + requestId`，队列执行，前端轮询或 SSE 获取终态。
- refine operation 增加 `resultArtifactId`、quality summary、运行阶段和预计等待提示。
- reconciler 只 claim 超过心跳阈值的 operation，避免正常运行期间每 2 秒重复 lease/poll。

### P2

- 为每个垂类模板制作经过静态化和 spec review 的专属 compact few-shot，不长期依赖通用关系/时间线示例。
- 建立 democase-to-generation 视觉回归：结构覆盖率、模块匹配、截图相似度只作为参考指标，禁止复制具体内容和品牌 trade dress。
- 将模板 prompt 字符预算、实际 token、生成耗时和 quality finding 纳入 Admin 可观测面板。

## 6. 验收标准

- 生产数据库中所有已发布动态百科模板均能解析到有效、受预算约束的 prompt example。
- 6 variation 不出现 guidance 未确认的模板。
- 外文专有名词词条在无外文正文要求时保持中文正文。
- refine 保持原模板身份；用户未要求切换模板时，质量门不得切换到其他模板规则。
- 5 分钟内完成的 refine 不因 Nginx 超时显示失败。
- 最终目标为异步 refine，浏览器刷新、断网重连后仍可恢复任务状态。
- `300×360` 首态最多只有一个主要导航/控制组；必要标题、核心文字和继续探索入口同时可见，所有延后内容都有可点击且可验证的本地访问路径。
