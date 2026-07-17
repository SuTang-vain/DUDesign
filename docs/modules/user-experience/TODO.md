# 用户前端交互层 TODO

> 模块：User Experience Layer
> 面向对象：最终用户
> 上游依赖：Application Service User API、DUDesign 标准事件流、Artifact Preview API
> 下游输出：用户交互、prompt、annotation、导出/分享请求

## Phase UX-0：信息架构与路由骨架

- [x] 建立 M1 用户端 Next.js 应用骨架。
- [x] 确认 M1 用户端路由结构：`/`、`/jobs/:jobId`。
- [x] 增加 `/variations/:variationId` 和 `/share/:token` 用户端路由。
- [x] 定义 M1 用户端应用壳：品牌、workspace、生成入口。
- [x] 建立用户端右上角全局操作区：用户头像、设置、更多入口。
- [x] 在全局设置入口中支持中英文语言切换，并跨页面持久化。
- [x] 定义统一 API client，只调用 DUDesign User API。
- [x] 定义统一 `DesignEventClient` 的事件契约基础，只消费 DUDesign 标准事件。
- [x] 建立用户端错误展示规范：用户可理解错误、可重试状态、runtime 降级提示。

验收：

- 用户端不出现 BabeL-O 原始 endpoint、`NexusEvent`、runtime 内部 id 的直接引用。
- 所有页面可以基于 mock API 渲染空态和基础布局。

## Phase UX-1：登录后工作台与会话列表

- [x] 新增 `/login` 登录/注册页。
- [x] 登录页支持邮箱密码登录、邮箱密码注册。
- [x] 登录页支持 Google/GitHub OAuth provider 入口。
- [x] 登录页在 OAuth provider 未配置时禁用对应按钮，并提示用户使用邮箱密码。
- [x] API client 切换到 `/api/auth/me` 获取当前用户 bootstrap，并对私有 API 使用 `credentials: include`。
- [x] 未登录访问工作台时跳转到 `/login`。
- [x] 建立真实浏览器 auth E2E：注册 -> 进入工作台 -> 用户菜单登出 -> 匿名访问重定向。
- [x] 实现登录后工作台页面。
- [x] 展示最近会话。
- [x] 会话侧栏支持搜索、清空搜索和更早会话折叠/展开。
- [x] 支持创建新会话。
- [x] 支持恢复历史会话。
- [x] 支持 workspace 选择，MVP 默认个人 hosted workspace。

验收：

- 用户刷新页面后可以重新看到历史会话。
- 会话列表只展示当前用户可访问资源。
- session auth 模式下真实浏览器能完成注册、进入工作台、登出和匿名重定向。

## Phase UX-2：交互首页

- [x] 实现 prompt composer。
- [x] 首页第一屏和 prompt composer 核心文案接入全局中英文语言切换。
- [x] 实现新建 HTML / 基于已有 HTML 模式选择。
- [x] 实现已有 HTML 上传或历史 artifact 选择入口。
- [x] 实现变体数量选择，MVP 上限默认 6。
- [x] 实现模板风格/要求输入。
- [x] 接入 Capability Distribution 选择：领域模板、审美 profile、颜色方案、loop profile。
- [x] 将 Capability Distribution 模板入口从“风格 / 领域 / 审美 / 配色”收敛为“场景 / 视觉 / 高级”。
- [x] 将多个模板小菜单收敛为单个“设计方向”选择器。
- [x] “设计方向”选择器使用 tabs：场景、视觉、高级。
- [x] 场景/视觉选择支持搜索、分类和右侧详情预览。
- [x] 将色板、补充风格词、参考品牌、负面要求移动到高级入口。
- [x] 高级入口预留 Design System / 参考品牌升级路径。
- [x] 在结果墙和单变体详情页展示本次生成使用的 Capability Snapshot。
- [x] 支持用户默认 Capability 偏好恢复：优先本地体验兜底，并通过用户偏好 API 保存。
- [x] 增加模板库入口：官方模板 / 我的模板 / 最近使用 / 收藏。
- [x] 支持上传或粘贴 `DESIGN.md` 创建用户私有模板。
- [x] 支持从 variation 编辑页保存当前版本为“我的模板”。
- [x] 模板卡片展示 color swatch、字体摘要、适用场景和 preview artifact。
- [x] 支持选择一个或多个 Design Template Pack，并支持“自动分配模板”生成多个 variation。
- [x] 增加官方 safe skill 多选入口，写入 `capabilityRequirements.plugins.skillIds`。
- [x] 插件/skill 卡片展示适用场景、规则摘要、负向约束和安全等级。
- [x] “我的偏好”支持保存默认模板、默认 skill、默认 loop 和高级约束。
- [x] 展示用户可用模型列表并支持选择生成模型。
- [x] 胶囊下拉菜单支持向下展开、切换互斥、点击外部/Esc 自动收起。
- [x] 调用 `POST /api/design-jobs` 创建生成任务。

验收：

- 用户可以从空白需求创建 design job。
- 用户可以基于上传的已有 HTML artifact 创建 design job。
- 用户可以选择场景、视觉、高级约束和自动化强度创建 design job。
- 用户可以选择官方/私有模板和官方 safe skill 创建 design job。
- 请求体中不包含本地 cwd，只包含 workspace/session/artifact 引用。

## Phase UX-3：并行生成页

- [x] 实现 job progress header。
- [x] 实现 variation generation grid。
- [x] 展示 queued、running、streaming、rendering_preview、completed、failed、cancelled 状态。
- [x] 展示每个 variation 的流式摘要、token、成本估算。
- [x] 在 preview 尚未 ready 时，卡片内展示 per-variation `index.html` 代码流。
- [x] preview ready 后保留轻量 code trace，方便用户确认刚才的生成过程。
- [x] 支持 Code / Preview 手动切换，允许用户在结果墙阶段展开查看完整代码。
- [x] Code 视图支持多文件列表，覆盖 `index.html`、`styles.css`、`script.js`、`assets.json`。
- [x] 对长代码流做更严格的虚拟滚动或 tail buffer 策略。
- [x] 将 Runtime stream 从原始 delta 列表升级为结构化 Activity Stream，明确展示每个 variation agent 的阶段、动作和文件。
- [x] 默认隐藏 raw assistant delta，仅在 debug/详情模式中展示。
- [x] 支持单个 variation 先完成先预览。
- [x] 支持 job 失败和部分失败状态。
- [x] 结果墙质量提示支持紧凑展示，详细问题通过 tooltip/title 保留。

验收：

- 3 个和 6 个 variation 的 mock stream 都能正确渲染。
- 每个 variation 的代码流只显示自身内容，不和其他 variation 混流。
- 代码展示作为文本渲染，不执行生成代码；真实预览继续使用 sandbox iframe。
- Runtime stream 能直接说明“第几个画面的 agent 做了什么”，而不是展示模型碎片文本。
- 单个 variation 失败不阻断其他 variation 的结果展示。

## Phase UX-4：结果墙

- [x] 实现多变体结果墙。
- [x] 展示 preview iframe。
- [x] 结果墙优先展示 screenshot artifact，缺失时 fallback 到 preview iframe。
- [x] 支持进入单变体编辑。
- [x] 支持锁定当前版本。
- [x] 支持导出入口。
- [x] 支持分享入口。

验收：

- 所有 completed variation 都有可打开的预览。
- failed variation 有清晰错误摘要和重试入口。

## Phase UX-5：单变体编辑页

- [x] 实现 `DevicePreviewFrame`，支持 Desktop、Tablet、Mobile。
- [x] 实现 iframe sandbox preview。
- [x] 支持 Preview / Code 切换，Code 视图可从当前 artifact 恢复文件内容。
- [x] 实现 refine panel。
- [x] 实现 artifact version menu。
- [x] version menu 展示 artifact kind、current 标记和 export source。
- [x] 支持将历史 HTML artifact 恢复为当前版本。
- [x] 非 HTML artifact 在 version menu 中只读展示，避免误选 `asset` / `export_zip` 作为页面预览入口。
- [x] 实现 cost/runtime summary panel。
- [x] 实现 artifact-backed ZIP 导出。
- [x] 导出按钮支持 loading、success、error 状态。
- [x] 导出后展示 ZIP 文件数量、大小、hash 摘要。
- [x] 实现 mock share link 创建。
- [x] 实现只读分享页。
- [x] 分享页展示 preview asset 加载状态。
- [x] 分享页预留只读 ZIP 入口，MVP 暂不开放下载。

验收：

- 用户可以针对某个 variation 继续提交 prompt。
- 后续 refine 不影响同 job 下其他 variation。

## Phase UX-6：圈画批改

- [x] 实现 annotation overlay 最小版本。
- [x] 支持 rect、circle、arrow、pen、text。
- [x] 支持 rect 和 text。
- [x] 实现批注管理列表，支持选中、高亮、单条删除。
- [x] 支持 text 批注二次编辑。
- [x] 使用 `0..1` 归一化坐标。
- [x] 支持批注计数和清空。
- [x] 把批注转换为 `POST /api/variations/:id/annotations` 请求。

验收：

- Desktop、Tablet、Mobile 切换后批注定位仍合理。
- annotation payload 不包含 iframe 内部绝对像素依赖。

## Phase UX-7：用户端质量门禁

- [x] 建立 UX-M1 mock product flow smoke test。
- [x] 建立页面级 Playwright smoke test。
- [ ] 建立设计事件 stream mock test。
- [x] 建立 annotation browser E2E。
- [x] 建立 annotation serialization unit test。
- [x] 建立 preview iframe sandbox test。
- [x] 建立 artifact preview 可见性检查，识别全黑/空白/加载壳页面。
- [x] Playwright 浏览器缺失时，将质量门禁基础设施错误转译为用户可理解的视觉检查不可用提示。
- [x] 建立用户端可访问性基础检查。

验收：

- 登录 -> 新建任务 -> 并行生成 -> 结果墙 -> 单变体精修 -> 导出 的 mock E2E 通过。

## Phase UX-8：动态百科卡片模式

> 业务规划详见 `docs/dynamic-encyclopedia-card-business-logic-plan.md`（v0.2）。
> 实现前需钉死的决策见该文档第 12 节。UX-8 任务已与 12.1–12.6 对齐：productMode/sourceMode 正交、半自动审查 UI 含确认修复/跳过/手动修改。

- [x] 在首页 composer 增加产品模式切换：`Web&App / 动态百科卡片`。
- [x] 保留“新建 HTML / 基于已有 HTML”输入来源语义，不用产品模式替换 source mode。
- [x] 动态百科卡片模式下，将主输入文案切换为词条名称/词条内容输入。
- [x] 切换到动态百科卡片模式后自动勾选：
  - [x] 词条引导 skill。
  - [x] 动态百科词条卡片模板包。
  - [x] 自动审查 loop。
- [x] 自动勾选结果必须可见、可调整，并写入最终 job snapshot；required 能力保持锁定，可选模板/Skill/MCP/Loop 可在能力抽屉原地调整。
- [x] 展示词条引导返回的分类结果、置信度、推荐子模板和推荐理由。
- [x] 展示 democase references 的命中分、命中关键词和摘要说明。
- [x] 低置信度时支持用户确认或改选分类/子模板后再生成。
- [x] 首页将 guidance 结果、模板确认、自动审查和生成预览串成动态百科流程条。
- [x] 动态百科模式采用两阶段提交：首次提交只做词条引导，确认后再次提交才创建生成任务。
- [~] 半自动审查模式下展示审查报告，并支持确认修复、跳过、手动修改；当前结果墙已展示 Review pending，确认修复/跳过已调用后端 review action API，刷新后可从 job snapshot 恢复已确认/已跳过状态，完整结构化审查报告待补。
- [x] E2E：切换动态百科卡片模式 -> 自动勾选三件套 -> 输入词条 -> 确认推荐 -> 创建 job。

验收：

- 用户不需要理解 prompt 工程即可走完词条到动态百科卡片生成流程。
- 用户端不直接调用 democase MCP，不直接拼接 BabeL-O 私有 prompt。
## Phase UX-9：能力降级与外部工具状态

- [x] 增加 `CapabilityNotice` 用户端组件，统一展示 MCP / plugin / provider 降级状态。
- [x] Variation 详情页接入 capability notice 展示位，可复用 `UserFacingError`。
- [x] 图片生成 provider unavailable 对应动作：继续无图、重试图片、切换 provider。
- [x] 将 variation detail API 扩展为返回最近 capability notice / MCP invocation result，让真实 provider 降级能自动显示在用户端。
- [x] Variation Inspect 面板接入能力活动列表，展示最近 provider/tool 降级、来源和恢复动作。
- [x] 首页生成过程 Activity Stream 接入 `mcpInvocationToUserError()`，展示工具调用失败和恢复动作。

## v0.4 硬性归束（2026-07-08 落地）

- [x] entryGuidance 卡片加"中文优先 / 语言类"标签 + 语种徽章
- [x] 5 个新翻译键（en + zh）：`languageCategoryBadge` / `languageCategoryHint` / `chineseFirstBadge` / `chineseFirstHint` / `nonLanguageEntry`
- [x] E2E `mock-product-flow.spec.ts` 断言 `entry-guidance-chinese-first` 标签可见 + `entry-guidance-content-language` 文本

验收：
- 词条引导完成后，用户能在卡片上看到"中文优先"或"语言类"标识
- 标识提示会解释约束含义（中文优先：默认简体中文 / 语言类：豁免外语正文约束）

## Phase UX-10：Runtime 诊断信息收口

- [x] Job Snapshot 改为消费产品化 `execution` 状态。
- [x] Activity Stream 不再展示 runtime child session id / agent job id。
- [x] 用户端继续展示 queued/generating/rendering/retrying/degraded/completed/failed 产品状态。
- [x] 增加架构 smoke，禁止用户源码出现 BabeL-O endpoint、env 和 NexusEvent。

验收：

- Runtime Lane Pool 或 provider 切换不要求修改用户端诊断展示。
- 最终用户不会看到 Runtime 内部引用。

## Phase UX-11：Capability Authoring Studio

> 上游规划：`../capability-distribution/template-skill-authoring-governance-plan.md`

- [x] 在模板库“我的模板”入口增加 Capability Bundle ZIP 工作台；创建能力的独立路由仍待后续拆分。
- [ ] 支持上传/粘贴 `DESIGN.md`、普通功能文档、variation/artifact 和手工创建。
- [ ] 新增 Draft Review 页面：Source / Template / Skill / Data / Review / Preview / Findings。
- [ ] 自动提取字段展示 confidence、source evidence 和确认状态。
- [ ] Variation“保存为模板”升级为快速收藏、高保真模板提取和能力包创建。
- [ ] 增加私有声明式 Skill 编辑器。
- [x] 增加 Capability Bundle ZIP 下载/上传入口、license declaration、导入摘要确认和 preview gate；DESIGN.md/Template Pack JSON 既有入口继续保留。
- [x] E2E：ready draft -> 下载 Capability Bundle ZIP -> 上传 -> 查看能力摘要 -> 确认 -> preview passed。
- [ ] E2E：明星组合文档 -> Bundle Draft -> 用户确认。

验收：

- 用户无需手写内部 JSON，即可完成模板/Skill 私有创作与复用。

## Phase UX-12：探索度与批量方向预览

> 上游规划：`../capability-distribution/controlled-exploration-governance-plan.md`

- [ ] 在 job composer 增加 `0..100` 探索度滑块，默认值 40。
- [ ] 提供忠实、均衡、探索、实验四档语义和动态说明。
- [ ] 明确显示事实、必需模块、安全和权限不随探索度改变。
- [ ] 支持预览 N 个 variation 的主方向、模块摘要和模板分配。
- [ ] 支持锁定、排除或重新分配非必选模块，不能移除 invariant。
- [ ] 结果墙展示每个 variation 的 focus 和模块摘要，不展示内部 prompt 或 temperature。
- [ ] refine、retry 和刷新后恢复原 variation plan；“换一个方向”创建新计划版本。
- [ ] 保存用户默认探索档位到独立偏好 scope，不写入事实记忆。
- [~] 补键盘、屏幕阅读器、移动端和窄屏滑块可访问性；抽屉焦点进入/返回、手机 Tab 循环、Slider 方向键和 accessible name 已通过，真实屏幕阅读器人工验证与颜色对比度审计待补。
- [ ] E2E：探索度调整 -> 计划预览 -> 6 variation -> 结果墙 -> refine -> 刷新恢复。

验收：

- 用户能够理解探索度影响的是设计方向和模块组合，而不是事实可信度。
- 低探索与高探索结果有可感知差异，同时所有硬约束保持一致。

## Phase UX-13：动态百科能力配置抽屉

> 详细规划：`dynamic-encyclopedia-capability-drawer-plan.md`
> 依赖：UX-8 动态百科业务线、UX-12 受控探索、CAP-8 Capability Preset、APP-13 Exploration Planning

### UX-13.1 状态与入口

- [ ] 首页增加统一 `DynamicCapabilityConfiguration` 状态/reducer，抽屉不得复制 selected template/plugin/loop ids。
- [x] 增加 `explorationLevel`、`lockedModuleIds`、`excludedModuleIds` 状态并写入创建 job 请求。
- [x] 动态百科模式首次进入当前 session 时自动打开一次，后续通过稳定“能力配置”按钮重新打开。
- [x] 抽屉按钮展示模板数、插件数、Loop 和探索档位摘要。
- [ ] 打开抽屉时关闭 composer 其它浮层，避免多个配置面板叠加。

### UX-13.2 只读能力抽屉

- [x] 展示产品模式、词条分类、置信度和配置状态。
- [x] 展示父模板包、推荐子模板、插件/Skill/MCP、Loop 和探索等级。
- [x] 使用 `official_preset / entry_guidance / user_override / job_snapshot` 标签区分来源。
- [x] 必选项展示锁图标和可理解原因，不暴露 MCP server/tool 私有字段。
- [x] 展示事实创造固定关闭、事实/安全/权限/数据契约 invariant 锁定说明。

### UX-13.3 可编辑配置

- [x] 支持在兼容范围内选择 1～3 个动态百科子模板并恢复 guidance 推荐。
- [x] 支持添加/移除官方 safe 可选插件，required 插件不可删除。
- [x] 支持 `关闭 / 半自动 / 自动` 审查模式和白名单 Loop 选择。
- [x] 支持 `0..100` 探索等级和 faithful / balanced / exploratory / experimental 四档文案。
- [x] experimental 档阻止关闭规范审查，并要求明确确认。
- [x] Requirement Module 支持自动/锁定/排除互斥选择；always/global rule/critical 不允许排除。
- [x] 词条变化后清除旧 guidance 推荐和 plan preview，提示重新匹配，并允许保留仍兼容的用户覆盖；不兼容选择明确移除。

### UX-13.4 Plan Preview 与准入

- [x] 200～300ms debounce 调用 exploration plan preview，使用 request revision 防止旧响应覆盖新配置。
- [x] 展示每个 variation 的 focus、模板/交互方向和 required/sampled 覆盖摘要。
- [x] 展示 loading、warning、error 和准入通过状态。
- [x] plan preview 只解释计划，不在前端当作正式授权结果。

### UX-13.5 响应式与恢复

- [x] 右侧能力抽屉打开时临时隐藏左侧 Session 会话栏，关闭/ESC 后恢复，不清除会话状态。
- [x] `>=1280px` 使用 380～420px 右侧推入式抽屉，主工作区同步缩窄，输入框不得与抽屉重叠。
- [x] `768～1279px` 使用 360px 非模态推入式抽屉，优先保证中心输入框完整可见和可继续输入。
- [x] `<768px` 使用单列全屏 Sheet，禁止详情区覆盖选择按钮。
- [x] job/resume 页面读取 capability selection snapshot，不重新应用最新 preset（Job detail、刷新与 Session resume 浏览器验收已通过）。
- [x] 结果墙展示 variation focus；refine 沿用原 variation exploration plan。

### UX-13.6 测试

- [x] 单测覆盖 preset/guidance/user override 合并、锁定项、词条变化和 experimental 准入。
- [x] 浏览器 E2E：切换模式 -> 自动打开 -> guidance -> 调探索度 -> preview plan -> 创建 job -> 刷新/Session resume 恢复。
- [x] E2E：required Skill 不可移除、experimental 不可关闭审查、旧 guidance 推荐失效、兼容用户覆盖迁移和旧 plan preview 清空。
- [x] 桌面 1440、平板 1024、手机 390/320 视口无重叠、无水平滚动、控制台无错误（已验证 1440/1280/1024/768/390/320）。

验收：

- 用户能在一个统一入口理解并调整动态百科最终能力配置。
- 抽屉显示内容与正式 job snapshot 一致，高探索不改变事实和安全 invariant。

## Phase UX-14：Variation 连续修改反馈

- [x] 将 variation 状态、当前版本和 refine 对话聚合为连续修改工作区，减少独立卡片层级。
- [x] refine 提交后立即进入对话反馈流并清空输入；失败时恢复原需求和重试入口。
- [x] 固定模型反馈流高度，新增自动滚动、执行状态和“当前预览尚未更新”提示。
- [x] 标注工具点击即进入绘制模式，再次点击或按 `Esc` 退出，去除重复绘制开关。
- [x] 没有暂存标注时隐藏清空/提交操作；存在标注时展示待提交数量。
- [x] 标注请求继续复用统一 refine feedback stream，不创建第二套任务反馈。
- [x] 接入 runtime cancel contract，让执行中的发送按钮支持真实停止，不做前端假取消。
- [x] 完成后增加新旧版本视觉对比、撤销和恢复入口。
- [x] 将 Inspect/成本/runtime 详情降级到次级入口，保持标注和设计方向为主要工具。
- [ ] 补 refine 失败、重试、预览刷新和键盘提交的专项浏览器 E2E。

验收：

- 用户始终知道修改基于哪个版本、任务是否正在执行，以及当前预览是否已经更新。
- 标注和文字修改进入同一反馈流，失败不会覆盖当前预览或丢失用户输入。

## Phase UX-15：AI 词条引导体验

> 依赖：APP-15、CAP-12、RTC-14。

- [ ] 将“分析词条”与“生成设计”拆成清晰的两阶段动作，避免同一发送按钮语义前后变化却无说明。
- [ ] 将词条标题、希望呈现的内容/交互和补充资料分区输入，同时保留自然语言快速输入。
- [ ] 展示真实分析进度：识别词条、检索相似 case、理解用户意图、匹配模板、检查数据缺口。
- [ ] guidance 结果展示 canonical title、L1/L2/L3、备选分类、置信度来源和分析模式。
- [ ] 单独展示 user intent、推荐交互、需要呈现的模块、可用资料、缺失资料和事实风险。
- [ ] 模板推荐展示 score、推荐原因、证据 case 和为何适合当前意图，而不只是模板名称标签。
- [ ] AI 判断存在歧义时展示 1～3 个最小澄清问题，回答后重新分析并保留 version history。
- [ ] provider unavailable 时展示可重试、手工选择分类或稍后继续，不显示伪造的 52% 通用分类。
- [ ] 用户可以确认分类、意图和模板，也可以修改；所有修改明确标记为 user override。
- [ ] 词条变化时旧 guidance 标记 stale，用户可选择重新分析或保留仍兼容的 override。
- [ ] 结果墙与 Job snapshot 展示最终确认的 guidance 摘要和版本，不暴露模型原始推理文本。
- [ ] 浏览器 E2E：AI 分析 -> 澄清 -> 模板确认 -> 创建 job -> 刷新/resume 恢复。
- [ ] 浏览器 E2E：provider unavailable -> retry/manual fallback，不误创建 job。

验收：

- 用户能理解系统识别了什么、为什么推荐这些模板、还缺什么信息，以及下一步会发生什么。
- guidance 是可交互的业务向导，不再只是生成前出现一次的分类百分比和模板标签。

## Phase UX-16：长时 Refine 真实进度与恢复

> 专项分析：`../../dynamic-encyclopedia-quality-gap-analysis-2026-07-15.md`

- [x] staging 反向代理允许最长 600 秒 refine 请求，避免 60 秒假失败。
- [ ] refine 提交后以 operation 状态驱动 UI，不依赖单次长连接完成。
- [ ] 展示 queued、runtime connecting、generating、quality review、screenshot、completed 阶段。
- [ ] 浏览器刷新或网络中断后自动恢复 operation 和最终 artifact。
- [ ] 完成但 quality warn 时明确显示“修改已完成，需要注意”，不得显示成运行失败。

## Phase UX-17：产品语义去百科页面化

> 产品语义：`../../dynamic-topic-interactive-card-product-semantics.md`

- [x] 用户端模板名称改为“词条主题动态交互卡”。
- [x] 子模板名称强调身份、时间线、关系、对比和渐进探索。
- [ ] 首页模式说明、guidance 阶段和结果墙统一使用“主题动态交互卡”表述。
- [ ] 质量反馈区分事实风险、交互质量和主题表达，不展示“百科完整度”。
- [ ] 浏览器 E2E 验证页面没有传统百科 infobox + 目录 + 长正文结构。

## Phase UX-18：300×360 极小画布兼容

- [x] 将 `300×360` 登记为动态主题交互卡一等交付尺寸，而非从 `380×456` 或桌面画布等比压缩。
- [x] 极小画布首屏保留词条身份、最核心事实和至少一个必要页面切换或内容揭示入口。
- [x] 模板首屏减少次要事实密度，额外信息通过本地 tab、分页、折叠面板、详情面板或 modal 点击揭示，禁止依赖滚动。
- [x] summary、timeline、relation、compare、expandable、member、series、scenic route、scenic map 结构样例覆盖 `300×360` 实际点击与状态变化测试。
- [x] Pixel Gate 校验渲染外框恰为 `300×360`、主题标题和核心文字可见、控件可点击且不被遮挡、交互会真实改变内容或可访问状态。
- [x] `300×360` 首屏不得退化为“只有标题 + 导航”；必须保留至少一条可读核心事实或摘要，次级信息入口必须指向真实内容。
- [x] Automation Loop 对极小画布失败生成专项修复指令，禁止通过隐藏全部控件、缩小桌面卡片或删除主题身份绕过。
- [x] 极小画布初始态只保留一个主要导航/控制组；关系、成员、路线、POI、系列和渐进披露模板不得同时展示两套等价 Tab、节点或 accordion 导航。
- [x] 极小画布控件预算统一收紧为最多 `3` 个主 Tab/选择项加 `2` 个其他可见控件；被延后的桌面模块必须 `display:none`，不得通过裁切、透明或移出画框伪隐藏。
- [x] 系列、路线和 POI 模板增加本地分页，成员模板增加单一“更多视图”入口，确保减少首屏信息后仍能通过点击访问全部核心内容。
- [x] 远端真实任务 smoke 增加 desktop/`300×360` 初始态截图和点击状态指标归档，供人工与 democase 对照，不再只保留 pass/fail 文本。
- [ ] 在远端真实生成和 refine 任务中分别回归关系、时间线、成员、对比和渐进展开变体，并保留 `300×360` 截图证据。
- [x] 单变体编辑器增加 `300×360` 预览档位，并验证预览框固定为 `300×360`；圈画、refine、版本切换和只读分享在该档位的完整回归仍待真实任务补齐。
- [ ] 在 `300×360` 编辑器档位回归圈画、refine、版本切换和只读分享，并保留操作截图证据。

验收：

- `300×360` 首屏信息克制但不空洞，用户无需滚动即可识别主题并找到继续探索入口。
- 保留下来的 tab/按钮具备真实本地交互，不越界、不遮挡、不以不可点击的装饰控件冒充功能。
- 首屏不得出现两个竞争性的导航行；延后内容必须具有可操作、可验证且可返回的本地披露路径。
