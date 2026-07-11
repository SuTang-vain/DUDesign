# 用户前端交互层工作记录

> 模块：User Experience Layer
> 维护方式：按日期追加。记录已完成工作、关键决策、风险、后续动作。

## 2026-07-07 UX-M57 OAuth Unconfigured Login Guard

### 已完成

- 登录页启动后读取 `GET /api/auth/oauth/providers`，恢复 Google/GitHub provider 配置状态。
- 未配置的 OAuth provider 按钮置为 disabled，并通过按钮 title 说明需要管理员配置。
- 当两个 provider 都未配置时，在登录页提示用户先使用邮箱密码登录/注册。
- 点击 OAuth provider 前增加本地 guard，避免用户进入 `/api/auth/oauth/:provider/start` 后才看到 503。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/auth-ui.test.mjs`
- 远端 staging `/login` 渲染 Google/GitHub disabled 状态，`/api/auth/oauth/providers` 返回当前 provider 配置事实。

### 后续关注

- 真实 OAuth client 配置完成后，补浏览器 E2E：Google/GitHub callback 成功后进入工作台。
- 后续可在登录页增加“联系管理员配置 OAuth”的帮助入口，但 MVP 先保持邮箱密码为可用主路径。

## 2026-07-07 UX-M55 Session Sidebar Polish

### 已完成

- 登录后工作台会话侧栏支持按标题、最近 prompt、模式、状态和 session id 搜索。
- 搜索时自动展开更早会话，并提供清空搜索按钮。
- 更早会话默认可折叠，减少首页首屏噪音。
- 补齐中英文文案：搜索结果、无匹配会话、展开/收起更早会话。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/auth-ui.test.mjs apps/web/test/capability-errors.test.mjs`

## 2026-07-07 UX-M56 Compact Quality Notice

### 已完成

- 结果墙 variation 质量提示从多行说明压缩为 pill 样式状态条。
- 详细质量问题保留在 `title` 属性中，减少 preview 卡片遮挡。
- 更新浏览器 E2E，继续验证质量问题文本不会丢失。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run test:e2e -- mock-product-flow.spec.ts --grep "result wall surfaces artifact preview visibility issues"`

## 2026-07-07 UX-M54 Session Auth Browser E2E

### 已完成

- 新增 `apps/web/e2e/auth-flow.spec.ts`，在 `DUDESIGN_AUTH_MODE=session` 下覆盖真实浏览器登录闭环：
  - 匿名访问 `/` 重定向到 `/login`。
  - 邮箱注册新用户。
  - 注册后进入工作台并看到 workspace / 用户菜单。
  - 通过用户头像菜单登出。
  - 登出后再次访问 `/` 继续重定向到 `/login`。
- 登录页增加稳定测试定位器和 hydration-ready 标记，避免 E2E 在 React 接管前点击。
- 用户操作区接入真实 `logoutUser()`，并在 profile 菜单提供登出入口。
- Playwright 默认 baseURL 切到 `127.0.0.1`，与 API cookie 域保持同站；API readiness 改用 `/health`，兼容 dev/session auth 模式。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/auth-ui.test.mjs apps/web/test/capability-errors.test.mjs`
- `DUDESIGN_AUTH_MODE=session npm --workspace @dudesign/web run test:e2e -- auth-flow.spec.ts`

### 后续关注

- 真实 Google/GitHub OAuth provider 配置完成后，补 provider callback browser smoke。
- 后续可把用户菜单浮层改为 portal，减少复杂顶部布局对菜单定位的影响。

## 2026-07-03 UX-M25 Dynamic Encyclopedia Mode Planning

### 已完成

- 将动态百科卡片业务线写入用户端 TODO：Phase UX-8。
- 明确用户端要新增的是产品模式切换 `Web&App / 动态百科卡片`，而不是删除“新建 HTML / 基于已有 HTML”。
- 明确动态百科模式下的三件套联动：
  - 词条引导。
  - 动态百科词条卡片模板包。
  - 自动审查。
- 明确用户端需要展示分类置信度、推荐子模板、推荐理由和半自动审查报告。

### 决策

- 动态百科模式下，用户端只负责展示与确认，不直接访问 democase 数据库。
- 自动勾选能力必须可撤销，避免 preset 变成不可解释的隐式行为。
- 半自动审查需要用户端新增确认修复交互，不能复用普通 refine 输入框草草处理。

### 后续关注

- 等 Application Service 提供 entry guidance API 后，再实现前端推荐确认流程。
- E2E 需要覆盖 source mode 与 product mode 正交组合，避免旧的“基于已有 HTML”能力回退。

## 2026-07-03 UX-M24 Template Library And Capability Controls

### 已完成

- 首页 composer 从单一 `DesignDirectionPicker` 拆分为更清晰的能力入口：
  - `DesignSystemPicker` 作为设计系统总入口。
  - `TemplateLibraryPicker` 管官方模板、我的模板、最近使用和收藏。
  - `PluginsPicker` 管官方 safe skill / MCP policy-only 插件展示与选择。
  - `PreferencesPanel` 管用户默认模板、默认 skill、默认 loop 和高级约束。
- 模板库入口接入 User API：
  - `GET /api/design-templates` 读取官方和用户私有模板。
  - `POST /api/design-templates/import-design-md` 支持粘贴 `DESIGN.md` 创建私有模板。
  - `POST /api/variations/:id/save-template` 支持在单变体页将当前版本保存为“我的模板”。
- 模板卡片展示：
  - color swatch。
  - 字体摘要。
  - 适用场景 / rationale。
  - preview artifact 是否存在。
- 创建 job 时将模板选择写入 `capabilityRequirements.template.designTemplatePackIds`，并支持多模板自动分配到 variation。
- Add context 菜单补齐 automation loop 和 plugins 入口，插件卡片展示类型、权限 scope、规则摘要和安全等级。
- 设置菜单接入“我的偏好”弹层，支持保存默认模板、默认 skill、默认 loop、色板和高级约束。
- 单变体页新增 `Save as my template` 入口。
- 更新浏览器 E2E 以适配新组件结构：
  - 模板库入口可见。
  - capability distribution 选择后可创建 job。
  - annotation / version / language smoke 适配新侧栏结构。

### 验证

- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e`

### 决策

- 官方模板和用户私有模板统一通过 `DesignTemplatePack` 展示，前端不区分后端存储实现。
- 最近使用和收藏在用户端先作为交互偏好保存，后续可升级为后端持久化偏好。
- `DESIGN.md` 导入先支持粘贴文本，文件上传可在后续模板库增强阶段补齐。

### 后续关注

- 补专门 E2E：粘贴 `DESIGN.md` -> 创建私有模板 -> 使用该模板生成。
- 补专门 E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- 将最近使用、收藏、锁定版本等 localStorage 状态逐步迁移到 User API，便于跨设备恢复。

## 2026-06-26

### 已完成

- 确定用户端是最终用户产品体验层，不直接接触 BabeL-O。
- 确定用户端只调用 DUDesign User API。
- 确定用户端只消费 DUDesign 标准事件，不消费 `NexusEvent`。
- 确定用户端核心页面包括工作台、交互首页、并行生成页、结果墙、单变体编辑页、分享页。
- 确定圈画批注使用归一化坐标。
- 创建 `apps/web` 骨架。
- 创建 `@dudesign/contracts` 中的 DUDesign 标准事件契约，作为后续 `DesignEventClient` 的基础。

### 决策

- 用户端不把 runtime session id 暴露为 URL 主键。
- 用户端不保存权威业务状态，只保存 UI 派生状态。
- 用户端预览使用 iframe sandbox。

### 风险

- 如果业务 API 和标准事件没有先稳定，用户端容易被 runtime 细节污染。
- 并行生成页需要支持部分完成、部分失败，不能按“全部完成后统一展示”的简单模型设计。

### 下一步

- 等 User API 与 DesignEvent envelope 初稿确定后，开始用户端 mock 页面设计。
- 先实现 mock 数据驱动的路由骨架，再接真实 API。

## 2026-06-26 UX-M1 Next.js 用户端

### 已完成

- 将 `apps/web` 升级为 Next.js 16 App Router 应用。
- 实现首页 prompt composer、source mode、variation count、style input。
- 实现 `apps/web/src/lib/api.ts`，统一调用 DUDesign API。
- 实现 `POST /api/sessions` + `POST /api/design-jobs` 的前端创建流程。
- 实现 `/jobs/[jobId]` 页面，读取 job snapshot 并订阅 SSE。
- 实现 variation grid、状态展示、token/cost 展示和 iframe preview。
- 补充用户端全局样式，形成可用的第一版产品流界面。
- `npm run typecheck` 和 `npm --workspace @dudesign/web run build` 已通过。

### 决策

- 用户端采用 Next.js，保留独立 `apps/api` 作为业务后端。
- UX-M1 暂时使用 `/` 和 `/jobs/[jobId]` 两个路由先跑主链路，后续再扩展 `/app`、variation editor 和 share 页。
- 前端只消费 DUDesign 标准事件，不消费 BabeL-O 原始事件。

### 验证记录

- API health 通过。
- Next build 通过。
- HTTP 访问首页返回 200。
- 后端 mock API 已能创建 session/job、输出 SSE、返回 iframe preview HTML。
- 当前浏览器自动化环境中页面客户端 hydration 未能完成，静态资源均为 200，未发现控制台错误；需要后续在普通浏览器或 Playwright 标准环境中继续做真实点击验收。
- 已定位到 Next dev 对 `127.0.0.1` 的 dev resource 跨源限制，并在 `next.config.ts` 增加 `allowedDevOrigins: ['127.0.0.1']`。

### 下一步

- 增加前端可运行 smoke/e2e 脚本。
- 若 hydration 问题在普通浏览器复现，优先排查 Next 16 dev runtime 与当前 app 配置。
- 开始实现 variation editor 占位页和 refine API 接入。

## 2026-06-26 UX-M2 Variation Refine

### 已完成

- 新增 `/variations/[variationId]` 单变体编辑页。
- Job variation card 增加 `Open` 入口。
- 单变体页支持 Desktop、Tablet、Mobile 预览宽度切换。
- 单变体页支持 refine prompt 提交。
- 单变体页展示当前 artifact 和版本列表。
- refine 完成后 iframe preview 使用 cache-bust 刷新。
- `npm run typecheck` 和 `npm --workspace @dudesign/web run build` 通过。

### 下一步

- 增加圈画批改 overlay。
- 增加 refine 过程中的流式事件展示。
- 增加用户端 e2e，覆盖首页 -> job -> variation -> refine。

## 2026-06-26 UX-M3 Annotation Overlay

### 已完成

- 单变体编辑页新增 annotation overlay 最小版本。
- 支持开启 Draw 模式。
- 支持 rectangle 标注，坐标归一化到 `0..1`。
- 支持 text 标注，用户输入文字后落点。
- 支持 staged annotation 计数、清空和 `Apply marks`。
- `Apply marks` 调用 `POST /api/variations/:id/annotations`，完成后刷新 iframe preview。
- `npm run typecheck` 和 `npm --workspace @dudesign/web run build` 通过。

### 后续关注

- 继续补 circle、arrow、pen。
- 标注目前覆盖 iframe 的整个显示区域，后续需要在真实页面滚动/缩放时增加坐标校正。
- 需要把 annotation 操作纳入 e2e。

## 2026-06-26 UX-M4 Export and Share Flow

### 已完成

- 首页接入 `GET /api/sessions` 和 `POST /api/sessions/:id/resume`，展示最近会话并支持恢复到最近 job。
- 单变体编辑页的 `HTML` 按钮接入 mock export API，可下载当前 HTML artifact。
- 单变体编辑页的 `Share` 按钮接入 mock share API，可生成 `/share/:token` 链接。
- 新增 `/share/[token]` 只读分享页，读取 share token 并展示 iframe preview。
- 分享页不暴露编辑、refine、annotation 操作，保持只读访问语义。

### 验证记录

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- HTTP 验证 `POST /api/variations/:id/export`、`POST /api/variations/:id/share`、`GET /api/shares/:token` 通过。
- HTTP 验证 `/share/:token` 前端路由返回 200。

### 后续关注

- 导出当前是单 HTML mock 下载，后续需要升级为 zip artifact，并纳入对象存储。
- 分享当前是内存 token，后续需要持久化、支持 revoke、expiresAt 和权限校验。
- 分享页 iframe 当前展示最新 variation preview，后续需要固定到 share 创建时的 artifact version。

## 2026-06-26 UX-M1 Mock Product Flow Gate

### 当前推进情况

- UX-M1 的主产品路径已经覆盖：`/` prompt composer -> `POST /api/sessions` -> `POST /api/design-jobs` -> `/jobs/:jobId` 结果墙 -> `/variations/:variationId` 单变体编辑 -> export/share -> `/share/:token` 只读页。
- 用户端仍只调用 DUDesign User API，不接触 BabeL-O 原始 endpoint 或 runtime 内部事件。
- 当前工作台仍是首页内的最近会话区，独立 sessions workspace 页面还未拆出。

### 已完成

- 新增 `apps/web/test/mock-product-flow.test.mjs`。
- 新增 `npm --workspace @dudesign/web run test:flow`。
- 新增根脚本 `npm run test:ux`。
- 根 `npm test` 曾同时执行 API smoke 和 UX-M1 mock product flow；后续已调整为默认门禁不依赖外部服务。
- flow test 验证首页、job 页、variation 页、export API、share API、share detail API、share 页路由。

### 验证记录

- `npm run test:ux`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 后续关注

- `npm run test:ux` 需要 API/Web server 预先运行；默认 `npm test` 不再包含该 flow，避免服务未启动导致提交门禁产生假失败。

- 当前 flow test 是 HTTP 级 mock product flow，尚未做真实浏览器点击和视觉断言。
- 下一步应补 Playwright E2E，覆盖输入 prompt、点击 Generate、打开 variation、点击 Share/HTML。
- 需要补 annotation serialization test，把 rect/text payload 的归一化坐标纳入稳定回归。

## 2026-06-26 UX-M1 Browser E2E

### 已完成

- 安装 `@playwright/test` 并下载 Chromium 测试浏览器。
- 新增 `apps/web/playwright.config.ts`。
- 新增 `apps/web/e2e/mock-product-flow.spec.ts`，覆盖真实浏览器点击路径：
  - 打开首页
  - 输入 prompt
  - 点击 Generate
  - 进入 `/jobs/:jobId`
  - 打开第一个 variation
  - 下载 HTML
  - 创建 share link
  - 打开 `/share/:token`
- 为关键交互元素增加 `data-testid`，降低 E2E 对文案和布局结构的耦合。
- 新增脚本 `npm --workspace @dudesign/web run test:e2e` 和根脚本 `npm run test:ux:e2e`。

### 验证记录

- `npm run test:ux:e2e`
- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

### 发现与修复

- 真实浏览器点击生成时发现 `Failed to fetch`，原因是跨端口 `application/json` POST 触发 CORS preflight，而 API 服务没有处理 `OPTIONS`。
- 已在 API server 中补充 `OPTIONS` preflight、`access-control-allow-methods` 和 `access-control-allow-headers`。

### 后续关注

- Playwright E2E 目前依赖本地 `4000` API 和 `3001` Web 服务已启动，后续 CI 化时需要在 Playwright config 中自动拉起服务。
- 下一步建议补 annotation browser E2E：开启 Draw、画 rect、Apply marks、确认 artifact version 增加。

## 2026-06-26 UX-M1 Annotation Browser E2E

### 已完成

- 新增 `apps/web/e2e/helpers.ts`，抽取 UI 创建 variation 的公共流程。
- 新增 `apps/web/e2e/annotation-flow.spec.ts`。
- 单变体编辑页为 annotation draw toggle、overlay、rect、Apply marks、current artifact version 增加稳定 `data-testid`。
- E2E 覆盖：
  - 打开首页并创建 mock job
  - 进入第一个 variation
  - 开启 Draw
  - 在 preview overlay 上拖拽生成 rectangle annotation
  - 确认 staged annotation 计数
  - 点击 Apply marks
  - 确认当前 artifact 从 v1 更新到 v2

### 验证记录

- `npm run test:ux:e2e`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 发现与修复

- API workspace 的 `test` 脚本原本直接执行 `dist/*.test.js`，单独运行时可能使用旧 dist；已改为 `tsc -b && node --test dist/*.test.js`。
- 根 `test:api` 改为调用 API workspace 自身 test，避免脚本职责重复。

### 后续关注

- 当前 annotation browser E2E 覆盖 rect；circle、arrow、pen 后续实现后应加入同一组 E2E。
- 仍需补 annotation serialization unit test，直接验证归一化 payload 和 prompt suffix。

## 2026-06-26 UX-M1 Annotation Serialization Unit Test

### 已完成

- 将 annotation prompt suffix 生成逻辑提取到 `apps/api/src/annotationPrompt.ts`。
- `ApplicationService.annotateVariation()` 复用 `buildAnnotationPrompt()`，保持 API 行为不变。
- 新增 `apps/api/src/annotationPrompt.test.ts`。
- 单元测试覆盖：
  - rect 坐标序列化为三位小数。
  - text annotation anchor 坐标序列化。
  - prompt 自定义前缀。
  - 默认 prompt 文案。
  - 非有限坐标值输出为 `0.000`。

### 验证记录

- `npm --workspace @dudesign/api run test`
- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

### 后续关注

- circle、arrow、pen UI 实现后，需要同步补 serialization unit cases 和 browser E2E。
- 后续接 BabeL-O Adapter 时，应该只消费 `promptSuffix` 和原始 shapes metadata，不直接理解前端临时 UI 状态。

## 2026-06-26 UX-M1 Preview Iframe Sandbox Test

### 已完成

- 为 job variation card preview iframe、variation editor preview iframe、share preview iframe 增加稳定 `data-testid`。
- 新增 `apps/web/e2e/preview-sandbox.spec.ts`。
- E2E 覆盖：
  - variation editor preview iframe 的 `sandbox` 属性为空。
  - preview iframe 不包含 `allow-scripts`、`allow-same-origin`、`allow-forms`。
  - preview API 响应包含 `default-src 'none'` 和 `script-src 'none'` CSP。
  - share preview iframe 使用同样的严格 sandbox。
  - share preview 使用 `srcDoc` 渲染固定 artifact HTML。

### 验证记录

- `npm run test:ux:e2e`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 发现与修复

- 直接通过 Playwright 在 iframe 内注入 script 不能代表真实页面脚本能力，因为自动化上下文可以操作 DOM；测试改为校验 iframe sandbox 属性和 preview API CSP header。
- 分享页依赖 `GET /api/shares/:token` 返回 `artifact.html`，测试前需要确保 API 服务加载最新代码。

### 后续关注

- 后续如果允许部分 sandbox capability，必须通过测试显式变更，不允许无意加入 `allow-scripts`。

## 2026-06-26 UX-M2 Share Fixed Artifact Rendering

### 已完成

- 分享页从使用 `variation.previewUrl` iframe 改为使用 `artifact.html` 的 `srcDoc`。
- 避免分享页在原 variation 继续 refine 后漂移到最新 preview。
- 分享页仍展示只读 artifact version 和 visibility。

### 验证记录

- `npm run typecheck`
- `npm test`

### 后续关注

- 后续 share 页面需要接入更严格 iframe sandbox 策略和 CSP。
- password/private share UI 接入前，继续遵守后端 `SHARE_FORBIDDEN` 行为。

## 2026-06-28 UX-M3 Model Selection

### 已完成

- 用户端 bootstrap 响应增加 `models`。
- 新增 `GET /api/models` API client。
- 首页 composer 增加模型选择下拉框。
- 创建 design job 时会把 `modelServiceId` 传给业务服务层。
- 模型描述展示 provider、model id 和 capability，避免用户只看到内部 id。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- 用户端只展示当前用户可用且已启用的模型，不展示管理员关闭或用户无权使用的模型。
- 模型列表来自业务服务层，不在前端写死；后续真实 provider 接入只需要更新后端配置和权限。

### 下一步

- 增加用户端模型选择的浏览器 E2E。
- 在 job/variation 页面展示本次任务使用的模型摘要。

## 2026-06-28 UX-M1 Generation Code Stream Preview

### 已完成

- 并行生成页的 variation card 增加代码流展示：
  - preview ready 前，主区域显示 `index.html` 代码逐段写入效果。
  - preview ready 后，主区域切换回 sandbox iframe，并保留轻量 code trace。
- 用户端 SSE client 订阅新增 DUDesign 标准事件 `design.variation_code_delta`。
- 前端按 `variationId` 维护独立 code buffer，避免多个并行 variation 的代码混流。
- 代码窗口使用纯文本渲染和固定高度区域，不执行生成代码，也不改变 preview iframe sandbox 策略。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

### 决策

- 代码生成可视化不直接消费 BabeL-O 私有事件；用户端只认 DUDesign 标准事件。
- MVP 先展示 tail buffer，避免 3/6 个并行卡片同时渲染完整大文件导致页面卡顿。
- 后续可在结果墙增加 `Code / Preview` 手动切换，再进入单变体页查看完整代码和文件列表。

### 下一步

- 增加单独 E2E case：job 页面在 preview 前或 preview 后都能观察到 `index.html` 代码生成痕迹。
- 接入真实 Babel-O adapter service 的文件增量事件后，将 `workspace_dirty` 中的文件快照拆分为 `variation_code_delta` 或 `file_snapshot`。

## 2026-06-28 UX-M1 Result Wall Code Toggle

### 已完成

- 并行生成结果卡片增加 `Preview / Code` 手动切换。
- preview ready 后默认展示 sandbox iframe，用户可切到 Code 查看完整 `index.html` code buffer。
- 切回 Preview 后仍保留轻量 code trace。
- 浏览器 E2E 增加 Code tab 点击断言，确认结果墙阶段可以看到完整代码开头。

### 验证

- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

### 决策

- 结果墙默认仍以 Preview 为主，避免非技术用户被代码打断。
- Code tab 使用同一份 `design.variation_code_delta` buffer，不额外请求 Babel-O 或 runtime 私有 endpoint。

### 下一步

- 将 Code tab 扩展为文件列表视图，支持 `index.html`、`styles.css`、`script.js` 多文件切换。
- 进入单变体编辑页后复用同一代码查看组件，支持 artifact version 的代码查看。

## 2026-06-28 UX-M1 Multi-file Code View

### 已完成

- 结果墙 Code tab 从单文件 buffer 升级为多文件视图。
- 前端按 `variationId + path` 聚合 `design.variation_code_delta`，每个文件独立累积内容。
- Code tab 增加文件 pill 列表，支持切换：
  - `index.html`
  - `styles.css`
  - `script.js`
  - `assets.json`
- Mock runtime 输出多文件代码流，模拟真实 artifact bundle。
- E2E 覆盖 Code tab 内切换到 `styles.css` 并确认 CSS 内容。

### 验证

- `npm run typecheck`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

### 决策

- Code tab 的文件列表继续基于 DUDesign 标准事件，不从前端访问 runtime workspace。
- `index.html` 默认排序第一，其余文件按 path 排序，方便用户快速扫视入口文件。

### 下一步

- 在单变体编辑页复用多文件代码视图。
- 后续 artifact detail API 可返回完整文件列表，用于刷新页面后恢复 Code tab。

## 2026-06-28 UX-M1 Variation Editor Code View

### 已完成

- 单变体编辑页增加 `Preview / Code` 切换。
- 新增用户 API `GET /api/variations/:id/files`，从当前 artifact 恢复入口 HTML 和同版本 code asset。
- 编辑页 Code 视图支持文件列表切换，复用结果墙的多文件阅读体验。
- Code 视图只读取 DUDesign artifact store，不访问 runtime workspace 或 Babel-O 私有 endpoint。
- E2E 覆盖进入 variation 编辑页后切到 Code，再切回 Preview。

### 验证

- `npm run typecheck`
- `npm run test:ux:e2e`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 决策

- Preview 仍是编辑页默认模式，避免影响圈画批改主流程。
- 当前 mock artifact 主要恢复 HTML；真实 runtime bundle 或后续 mock asset 落库后，会自动显示 CSS/JS/manifest。

### 下一步

- 将结果墙和编辑页的代码查看器提取为共享组件。
- 为 `GET /api/variations/:id/files` 增加 API smoke 覆盖真实 runtime bundle 文件。

## 2026-06-28 UX-M1 Shared Code File Viewer

### 已完成

- 新增共享组件 `apps/web/src/components/CodeFileViewer.tsx`。
- 结果墙 Code tab 和单变体编辑页 Code tab 统一使用同一个代码查看器。
- 共享组件集中维护：
  - 文件排序。
  - active file 选择。
  - 空态。
  - code trace tail 展示。
  - streaming cursor 展示。
- 删除页面内重复的代码查看器实现，减少后续分叉风险。

### 验证

- `npm run typecheck`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`
- `npm test`

### 下一步

- 给共享组件增加只读复制按钮和文件大小/行数摘要。
- 后续把单变体编辑页的 artifact version 切换与代码文件列表联动。

## 2026-06-28 UX-M1 Code Viewer Utilities

### 已完成

- 共享 Code viewer 增加当前文件摘要：
  - 行数。
  - UTF-8 字节大小。
- 增加只读复制按钮，复制当前文件内容。
- 复制成功后按钮短暂显示 `Copied`。
- Clipboard API 不可用时提供 textarea fallback。
- 复制被浏览器权限或环境限制拦截时，按钮短暂显示 `Copy failed`，避免静默失败。
- E2E 覆盖 Code tab 的摘要展示和复制成功/失败反馈。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm test`

### 下一步

- 给 artifact version 切换接入同一 Code viewer。

## 2026-06-29 UX-M1 Artifact Version Code View

### 已完成

- `GET /api/variations/:id/files` 增加可选 `artifactId` 查询参数，支持读取指定历史 HTML artifact 的文件列表。
- `VariationFilesResponse` 增加 artifact 摘要，前端可明确知道当前 Code viewer 对应的 artifact version。
- 单变体编辑页将 artifact 版本列表从纯文本改为可点击版本选择器。
- 点击历史版本后自动切换到 Code 视图，并复用共享 `CodeFileViewer` 展示该版本文件。
- refine 或 annotation 生成新版本后，版本选择回到最新 current artifact，避免继续停留在旧版本。
- E2E 覆盖 v2 生成后切换 v1/v2，并验证 Code viewer 展示对应版本内容。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm test`

### 发现与修复

- 首次 E2E 失败是因为本地 4000 端口仍运行旧 API 进程，`artifactId` 查询参数未生效；已重启 API/Web 服务后复跑通过。

### 后续

- `GET /api/variations/:id/files?artifactId=...` 的 API 层 smoke 已在后端业务服务层补齐，覆盖历史版本不漂移和同版本 code asset。
- 后续可进一步支持历史版本 Preview，以便 Preview / Code 都严格绑定同一 artifact。

## 2026-06-29 UX-M1 Runtime Activity Stream

### 问题定位

- 远端实时运行画面中 Runtime stream 直接展示 raw assistant delta，出现大量碎片文本，用户无法判断第几个画面的 agent 正在做什么。
- 结果墙已经有 per-variation 状态与 code stream，但底部 runtime stream 没有按 variation/阶段组织信息。
- 全黑 preview 与 Runtime stream 可读性是两个问题：前者属于 artifact quality gate，后者属于用户端活动叙事。

### 本轮目标

- 将结果页底部 Runtime stream 从原始文本列表升级为结构化 Activity Stream。
- 每条 activity 显示 variation 标签、阶段、动作摘要、文件名或状态。
- raw delta 不再作为默认用户文案；只保留经过压缩的人类可读摘要。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm test`

### 发现与修复

- E2E 暴露 SSE activity 事件可能早于 job snapshot 返回，导致 variation label 退化为 `Variation`；已增加基于 `variation_01` / `runtime_variation_1` / delta 文本的编号推断，保证活动流能稳定显示 `Variation 01/02/03`。

### 下一步

- 继续推进 artifact quality gate：识别全黑/空白/外部脚本依赖页面，避免不合格 artifact 被当作成功预览。

## 2026-06-29 UX-M1 Variation Quality Banner

### 已完成

- 结果墙 variation card 增加 artifact quality banner。
- 单变体编辑页的 Current artifact 面板增加 artifact quality summary，用户从结果墙进入精修页后仍能看到当前预览的质量风险。
- 当当前 artifact 的质量状态为 `warn` 或 `fail` 时，卡片头部下方直接展示：
  - `Quality warning`
  - `Quality failed`
  - 第一条质量问题摘要。
- Runtime warning 到达但 job snapshot 尚未刷新时，前端会先用 SSE warning 临时更新对应 variation 的质量状态。
- job snapshot 刷新后，卡片从 artifact quality metadata 读取稳定状态。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm test`

### 下一步

- 后续将质量问题接入一键修复 prompt，例如“修复黑屏/移除外部脚本依赖”。

## 2026-06-29 UX-M19 Export / Share Frontend Polish

### 已完成

- 单变体编辑页的 ZIP 导出按钮增加 loading 状态，导出中禁用重复点击。
- 导出成功后保留 `Downloaded ...` 用户反馈，并追加 ZIP 摘要：
  - 文件数量。
  - zip 大小。
  - content hash 短摘要。
- Current artifact 面板新增 Latest ZIP 区块，展示文件名、文件数、大小、hash，以及 reused / created 状态。
- Share 按钮增加 creating 状态，创建分享链接时禁用重复点击。
- 分享页新增只读 ZIP 预留按钮，明确 MVP 暂不开放共享下载。
- 分享页增加 preview asset 加载健康提示：
  - loading。
  - ready。
  - error。
- 分享页会把 `srcDoc` 中的 `/api/shares/:token/assets/...` 资源路径补成 API 绝对 URL，避免前端和 API 分域部署时 CSS/图片从错误 origin 加载。

### 验证

- `npm run typecheck`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 决策

- 保留 `download-html-button` test id，避免既有 E2E 因“HTML -> ZIP”的产品文案变化产生无意义断裂。
- 分享页本轮只做只读下载入口预留，不直接开放 ZIP 下载；真实共享下载需要后端明确 share-token scoped export download contract。

### 下一步

- 若要开放分享页 ZIP 下载，优先在后端增加 `GET /api/shares/:token/export` 或 share-scoped artifact download，避免复用需要登录权限的 `/api/artifacts/:id/download`。
- 继续推进 M20 Artifact Snapshot / Version 管理：让 preview、code、share、export 都显式绑定 artifact version。

## 2026-06-29 UX-M20 Logged-in Workbench Shell

### 已完成

- 将首页从 landing/hero 形态调整为登录后工作台页面：
  - 左侧固定最近会话栏。
  - 右侧主交互区域。
  - 顶部 hosted workspace 选择器。
- 输入框配置区从独立表单字段改为底部胶囊下拉：
  - Type：New HTML / Existing HTML。
  - Variations：1-6 个并行草稿。
  - Styles：自定义风格与 preset。
  - Model：用户可用模型列表。
- MVP workspace 选择默认使用个人 hosted workspace；`bootstrap` 已返回 `workspaces` 列表入口，后续团队 workspace 可直接扩展列表来源。
- 创建 session/job 时使用当前选中的 workspace id。
- 保留 `prompt-input`、`generate-button`、`variation-count-input` 测试契约，并更新浏览器 E2E 点击路径。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 下一步

- 增加真实 workspace 列表 API，替换 bootstrap 内的单 workspace 占位列表。
- Existing HTML 模式补充上传/选择 artifact 的完整入口。
- 最近会话栏增加按 workspace 过滤与搜索。

## 2026-06-29 UX-M21 Existing HTML Source Upload

### 已完成

- 新增用户端 source artifact 上传闭环：
  - `POST /api/source-artifacts`
  - 请求体：`workspaceId`、`filename`、`html`
  - 响应：HTML artifact id、大小、hash、quality summary。
- 后端将上传的 HTML 写入 artifact store，并创建 `kind=html` 的 source artifact。
- 上传入口限制为 `.html/.htm`，MVP 上限 2 MB，并做基础 HTML 结构校验。
- 工作台 Existing HTML 模式增加 HTML 文件选择胶囊。
- 上传成功后，创建 session/job 时会传入 `sourceArtifactId`，让 from-existing-html 模式具备真实数据来源。
- 浏览器 E2E 增加“上传 HTML -> 生成 job”的真实点击覆盖。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm run test:ux:e2e`

### 下一步

- 增加历史 artifact 选择器，让用户可以从既有 session/export 中选择 HTML，而不必须重新上传。
- 让 Runtime Gateway 在 from-existing-html 模式下显式读取 source artifact HTML，注入到 BabeL-O prompt/context。
- 后续支持 zip/html bundle 上传，补齐 CSS/JS/assets 依赖。

## 2026-06-29 UX-M22 Composer Dropdown Behavior

### 已完成

- 将工作台 composer 底部胶囊菜单从原生 `details/summary` 调整为受控菜单状态。
- 统一 `workspace`、`type`、`variations`、`styles`、`model` 的打开状态，保证同一时间只展示一个菜单。
- 点击菜单外部区域会自动收起当前菜单。
- 按 Escape 会自动收起当前菜单。
- 选择菜单项后自动收起，避免弹层停留遮挡后续操作。
- 胶囊菜单弹层改为向下展开，符合输入框底部控制区的视觉预期。
- 增加浏览器 E2E 覆盖“菜单不堆叠、点击输入框自动收起”。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/api run test`

### 下一步

- 在真实多 workspace 列表接入后，复用同一受控菜单机制，避免 workspace selector 和 composer 菜单产生弹层冲突。
- 后续可增加键盘方向键选择与焦点回收，提升可访问性。

## 2026-06-29 UX-M23 User Error / Stream Governance

### 已完成

- 建立用户端错误展示规范 helper：
  - 将 API status、error code、runtime warning、variation failure 归一成 `UserFacingError`。
  - 输出用户可理解的 title、message、action、retryable、severity。
  - 覆盖 `RUNTIME_UNAVAILABLE`、runtime timeout、`MODEL_FORBIDDEN`、`ARTIFACT_QUALITY_GATE`、share link 失效等常见状态。
- API client 不再只抛普通 `Error(message)`，而是抛带 `status/code/userError` 的 `ApiClientError`。
- 结果页接入 `UserNotice`：
  - 顶部展示 job / stream 级错误。
  - failed variation 卡片展示用户可理解错误与可重试动作。
  - Runtime stream 断连展示“Live updates paused”，提示可刷新恢复最新快照。
- 长代码流治理：
  - per-file stream 保留 6000 chars tail buffer。
  - 记录 `totalChars` / `truncatedChars`。
  - Code viewer 明确展示 `tail buffer` 与 compacted 提示，避免用户误以为看到的是完整文件。
- Runtime Activity 分层：
  - 默认展示结构化 Activity Stream，只显示 variation、阶段、动作、文件。
  - 普通 assistant delta 不再直接展示在默认活动流中。
  - raw assistant delta 放入 `Debug raw assistant stream` 折叠区。
- 补充浏览器 E2E：
  - 默认 Activity 不泄露 raw delta marker。
  - Debug 展开后可查看 raw assistant stream。
  - 长代码流触发 tail buffer notice。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 下一步

- 增加真正的 retry action contract，例如 `POST /api/design-jobs/:id/retry` 面向用户端开放，而不是只提供刷新或回到首页。
- 将单变体编辑页的 refine/export/share 错误也统一接入 `UserNotice`。
- 后续可用虚拟列表替换当前 tail buffer，支持用户查看完整历史 code stream。

## 2026-06-29 UX-M24 Global User Action Cluster

### 背景

- 结果墙、工作台、单变体编辑页已经具备完整主流程，但右上角缺少用户账户与系统设置入口。
- 参考 Stitch 风格的右上角紧凑 action cluster，DUDesign 需要补齐用户头像、设置、更多入口，为后续账号、workspace、偏好、帮助、反馈、退出登录做 UI 承载。

### 已完成

- 抽象可复用的 `UserActionCluster`。
- 在工作台、结果墙、单变体编辑页接入同一组件。
- MVP 不实现完整设置页，仅提供菜单壳和明确的预留项。
- 设置菜单包含 Account、Workspace、Model preferences。
- 更多菜单包含 Help、Feedback、Keyboard shortcuts、Sign out。
- 点击外部与 Escape 可关闭菜单，避免与 composer/menu 弹层堆叠。
- 首页使用 bootstrap 用户生成头像首字母；结果墙和单变体页暂用 fallback 用户，后续接全局 session context。
- 补充 E2E 覆盖设置/更多菜单打开与关闭。

### 验收

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 风险与决策

- 暂不引入新的图标库，先用轻量文本符号/内联图形完成 MVP，避免因为依赖引入影响当前验证链路。
- 后续若统一 UI icon system，可替换为 `lucide-react` 或现有设计系统图标。

## 2026-06-30 UX-M25 Variation Runtime Summary & Annotation Tools

### 已完成

- 单变体编辑页新增 `Cost & runtime` summary panel：
  - Total cost。
  - input/output tokens。
  - variation status。
  - HTML / screenshot artifact 数量。
  - runtime/session 关联摘要或错误摘要。
- 扩展圈画批改工具，从 `rect/text` 升级为：
  - `rect`
  - `circle`
  - `arrow`
  - `pen`
  - `text`
- annotation overlay 支持 SVG arrow 与 pen stroke 渲染。
- circle/arrow/pen 均使用 `0..1` 归一化坐标，与已有 rect/text contract 保持一致。
- 后端 annotation prompt serializer 补充 circle/arrow/pen 单测。
- 浏览器 E2E 补充 circle、arrow、pen、text 和 runtime summary 可见性覆盖。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 下一步

- 将 annotation 工具按钮替换为统一 icon button，并增加 tooltip。
- 增加 annotation list，让用户能逐条删除/编辑批注，而不是只能清空全部。
- cost/runtime summary 后续可接 runtime duration、child session id、agent job id 等更细字段。

## 2026-06-30 UX-M26 Capability Distribution Composer

### 已完成

- 工作台 composer 接入 `GET /api/capabilities`。
- 新增四个能力分发胶囊菜单：
  - Domain：领域模板。
  - Aesthetic：审美 profile。
  - Palette：颜色方案。
  - Loop：自动化 loop profile。
- 创建 design job 时传入 `capabilityRequirements`：
  - `domainTemplateId`
  - `aestheticProfileId`
  - `colorPaletteId`
  - `loopProfileId`
- 增加 capability summary，帮助用户确认当前选择。
- Palette 菜单展示颜色 swatch。
- E2E 覆盖用户选择 Premium Product Page / Premium Minimal / Minimal Mono / Standard 并创建 job。

### 验收

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 下一步

- 将 capability 选择结果展示到结果墙/单变体详情页，便于用户理解当前生成依据。
- 后续接入用户默认能力偏好，让 composer 启动时恢复用户常用领域和审美组合。

## 2026-06-30 UX-M27 Capability Snapshot Visibility

### 已完成

- `GET /api/design-jobs/:id` 和 `GET /api/variations/:id` 显式返回 `job.capabilitySnapshot`。
- 新增共享 `CapabilitySummary` 组件。
- 结果墙顶部展示本次生成方向：
  - Domain。
  - Aesthetic。
  - Palette。
  - Loop。
- 单变体详情页右侧 refine 面板展示同一组 capability snapshot，避免用户进入精修后失去上下文。
- 浏览器 E2E 覆盖默认能力组合和用户选择 Apple-like 组合后的结果墙/详情页展示。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 下一步

- 接入用户默认能力偏好，让 composer 启动时恢复用户常用领域、审美和颜色组合。
- 将 capability snapshot 纳入分享页只读摘要，便于外部访问者理解生成背景。

## 2026-06-30 UX-M28 Capability Preference Restore

### 已完成

- 新增用户偏好契约：
  - `UserCapabilityPreference`。
  - `GET /api/preferences`。
  - `PUT /api/preferences`。
- Composer 启动时恢复用户常用 capability 组合：
  - Domain。
  - Aesthetic。
  - Palette。
  - Loop。
- 选择 capability 后会保存到后端用户偏好，并写入本地兜底缓存。
- 偏好接口失败不阻断工作台核心加载，保证用户仍可创建任务。
- 修复 API CORS allow methods，支持 `PUT`。
- 修复 Runtime Activity / raw stream key 生成，避免高频事件下 React duplicate key warning。
- E2E 覆盖选择 Apple-like 组合后刷新首页仍恢复偏好。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/web run build`
- `npm run test:ux:e2e`

### 后续关注

- 后端偏好已补 `user_preferences` PostgreSQL 持久化；后续需要在真实 PostgreSQL CI/staging 中持续跑 opt-in smoke。
- 分享页可继续接入 capability snapshot 只读摘要。

## 2026-07-01 UX-M29 Capability Template IA Follow-up

### 背景

- 当前首页模板菜单展示为：
  - Styles。
  - Domain。
  - Aesthetic。
  - Palette。
- 这四项在用户心智中都接近“风格”，容易造成冗余和选择负担。

### 文档决策

- 用户端模板入口后续调整为：
  - Scene：场景，底层映射 `DomainTemplate`。
  - Visual：视觉，底层映射 `AestheticProfile`。
  - Advanced：高级，容纳 Palette、补充风格词、参考品牌、负面要求。
- Capability summary 默认优先展示 Scene、Visual、Loop；Palette 可作为次级信息展示。
- 当前底层 API 字段暂不重命名，避免破坏已落地的 preference、snapshot 和 E2E 契约。

### 下一步

- 首页 composer UI 改造为 `Scene / Visual / Advanced`。
- 更新中英文翻译：
  - `domain` 用户可见文案改为 Scene / 场景。
  - `aesthetic` 用户可见文案改为 Visual / 视觉。
  - 新增 Advanced / 高级。
- 调整 E2E：不再按 Domain/Aesthetic/Palette 三个并列按钮定位。

## 2026-07-01 UX-M29.1 Open Design Picker Reference

### 背景

- 参考 `/Users/tangyaoyue/DEV/open-design` 的 New Project、Design System Picker、Prompt Template Gallery。
- Open Design 的前端选择不是把所有能力都放进一个“模板”下拉，而是分离：
  - 输出形态。
  - 使用场景。
  - 设计系统。
  - skill / template。
  - prompt gallery。

### 对 DUDesign 的 UX 决策

- 首页 composer 不继续增加更多并列 pill。
- 将现有模板相关 pill 收敛为一个“设计方向”入口。
- “设计方向”入口打开一个轻量选择器：
  - Scene：场景。
  - Visual：视觉。
  - Advanced：色板、补充风格词、参考品牌、负面要求。
- 选择器内应支持：
  - 搜索。
  - 分类。
  - 右侧详情预览。
  - 当前选择摘要。
  - 可回退到默认值。

### 中期预留

- 参考 Open Design 的 Design System Picker，DUDesign 后续应引入 Design System picker：
  - 官方品牌参考。
  - 用户自定义设计系统。
  - 从已有 HTML / variation 中提取的设计系统。
- 参考 Open Design 的 Prompt Templates Gallery，DUDesign 后续可增加“灵感模板/brief starter”，但不应与正式 capability snapshot 混淆。

### 下一步

- 实现 `DesignDirectionPicker` 组件。
- 更新首页 composer 的 template pill 交互。
- 更新 E2E 定位和文案断言。

## 2026-07-01 UX-M30 Design Direction Picker

### 已完成

- 新增 `DesignDirectionPicker`，将首页模板相关入口收敛为单个“设计方向”选择器。
- 选择器内部使用三个 tab：
  - Scene：场景，映射 `DomainTemplate`。
  - Visual：视觉，映射 `AestheticProfile`。
  - Advanced：色板、补充风格词、参考品牌、负面要求。
- Scene / Visual 支持搜索、列表选择和右侧详情预览。
- Advanced 中：
  - 色板继续映射 `ColorPalette`。
  - 补充风格词继续写入 `templateRequirements.styles`。
  - 参考品牌和负面要求写入 `templateRequirements.notes`。
- 保留现有 `capabilityRequirements` 和用户偏好 API，不改后端契约。
- 更新浏览器 E2E，按新的 `Design direction -> Scene / Visual / Advanced` 路径选择能力分发选项。

### 决策

- 第一版不新增 `BrandStyleReference` 后端契约，参考品牌只作为 inspiration-only notes。
- 第一版不新增 Design System picker，仅在 Advanced 中预留参考品牌入口。
- Capability summary 仍展示 Scene、Visual、Palette、Loop，避免影响结果页和详情页已有 snapshot 展示。

### 下一步

- 扩展官方 registry 的视觉 profile 元数据：mood、density、formality、bestFor、avoidFor。
- 让视觉卡片展示更像 Open Design `template.json` 的摘要，而不是只展示 description。
- 将分享页接入 capability snapshot 只读摘要。

## 2026-06-30 UX-M29 Annotation Management Panel

### 已完成

- 单变体编辑页的 annotation panel 从“计数 + 清空”升级为可管理列表。
- 每条批注展示序号、类型和位置摘要。
- 支持点击列表项选中批注，并在预览 overlay 中同步高亮。
- 支持点击 overlay 中的 rect、circle、arrow、pen、text 批注反向选中列表项。
- 支持单条删除批注，删除后自动维护选中索引。
- 支持 text 批注二次编辑，更新 overlay 文案和列表摘要。
- 新增本地开发 API fallback：当用户端运行在 `localhost:3000/3001` 且未显式配置 `NEXT_PUBLIC_DUDESIGN_API_URL` 时，自动连接 `http://127.0.0.1:4000`，降低本地 E2E 对 build-time env 的脆弱依赖。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/api run test -- --test-name-pattern "buildAnnotationPrompt"`
- `npm --workspace @dudesign/web run test:e2e -- e2e/annotation-flow.spec.ts`
- `npm run test:ux:e2e`

### 下一步

- 将 annotation 工具按钮改为 icon button + tooltip。
- 增加批注 before/after review：提交 refine 后快速对比原版本和新版本。
- 支持键盘操作：`Esc` 退出绘制，`Delete` 删除当前选中批注。

## 2026-06-30 UX-M30 Job Failure States and Version Lock

### 已完成

- 结果墙支持 job 部分失败状态：
  - 当部分 variation completed、部分 failed 时，展示用户可理解的 partial results banner。
  - completed variation 仍可正常打开，failed variation 展示错误摘要并禁用不可用入口。
- 结果墙支持 job 全失败/无可用结果提示：
  - 使用统一用户端错误语义提示重新生成或调整 prompt/model。
  - 避免把 runtime 原始错误直接暴露给用户。
- 单变体编辑页支持锁定当前版本：
  - `Lock this version` 会记录当前 HTML artifact id、version、entry path 和锁定时间。
  - 当前 artifact 与锁定 artifact 一致时展示 `Current version locked`。
  - 用户恢复历史版本后，展示 `Locked version differs`，明确当前预览与已锁定方向不同。
- 锁定状态在 MVP 阶段使用浏览器 localStorage 保存，作为用户端交互验证；后续协作场景需要升级为后端持久化字段。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e -- e2e/annotation-flow.spec.ts e2e/mock-product-flow.spec.ts`

### 后续关注

- 将锁定版本从 localStorage 升级为 User API 持久化，便于跨设备恢复和后续团队协作。
- 为 failed variation 增加 retry action，支持只重跑失败的子 session。
- 后端 design job 状态需要持续输出 partial/failed 的结构化原因，避免前端依赖字符串判断。

## 2026-06-29 UX-M20 Artifact Version Restore

### 已完成

- 单变体编辑页的 version menu 从“HTML 历史版本列表”升级为完整 artifact snapshot：
  - HTML 页面版本。
  - code/image asset。
  - ZIP export artifact。
- 每个 artifact row 展示 kind、version、当前版本标记，以及 ZIP 的来源 artifact 短 id。
- HTML artifact 支持选择并恢复为当前版本。
- 非 HTML artifact 只读展示，不进入 Preview/Code 选择，避免 asset 或 ZIP 被误当作页面入口。
- restore 成功后自动刷新 variation detail、切回 Preview 模式，并重新加载 iframe。
- 导出按钮继续基于当前 artifact；恢复历史版本后再导出会拿到对应版本的 ZIP。

### 验证

- `npm run typecheck`
- `npm test`
- `npm --workspace @dudesign/web run build`
- 真实 PostgreSQL integration smoke 覆盖 restore / export / share artifact-lock 组合路径。

### 下一步

- 增加历史 artifact preview URL，让用户可以先预览历史版本再决定是否 restore。
- 结果墙接 screenshot artifact 后，version menu 可展示 desktop / tablet / mobile 缩略图。

## 2026-06-29 UX-M21.1 Result Wall Screenshot Preview

### 已完成

- 结果墙 variation card 在 Preview 模式下优先展示 screenshot artifact。
- screenshot 缺失时继续 fallback 到 sandbox iframe preview。
- 保留 `variation-card-preview-frame` 测试契约，避免 E2E 只因为 iframe -> image 变化产生无意义断裂。
- 截图使用 `object-fit: cover` 和 top-center 对齐，更接近结果墙缩略图体验。

### 验证

- `npm run typecheck`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 下一步

- 单变体页继续基于 iframe 做交互编辑，结果墙承担轻量浏览职责。
- version menu 后续可展示 desktop / tablet / mobile screenshot 缩略图。

## 2026-06-30 UX-M22 Global Language Switch

### 已完成

- 新增用户端全局语言状态：
  - `apps/web/src/components/LanguageProvider.tsx`
- 在根布局中包裹 `LanguageProvider`，使首页、生成页、单变体页共享语言状态。
- 设置菜单新增中英文切换：
  - English
  - 中文
- 语言选择持久化到 `localStorage`：
  - `dudesign.language`
- 切换语言时同步更新 `document.documentElement.lang`：
  - `en`
  - `zh-CN`
- 设置菜单、更多菜单、个人资料菜单的全局文案接入翻译。
- 新增浏览器 E2E 覆盖：
  - 在 Settings 中切换为中文。
  - 验证菜单文案切换。
  - 验证 `html lang="zh-CN"`。
  - 刷新后语言保持。
  - 切回英文。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npx playwright test --grep "settings menu switches|global user action cluster"` in `apps/web`

### 说明

- 本轮先完成全局语言状态、设置入口和全局菜单文案切换。
- 首页、结果墙、编辑页主体文案仍需后续逐页接入翻译 key，避免一次性改动过大。
- `npm run test:ux` 需要 API 服务在线；本轮只启动了 web dev server，因此该 node smoke 返回 `fetch failed`。

### 下一步

- 逐步将首页 composer、结果墙、单变体编辑页的主体文案迁移到同一套翻译上下文。
- 后续如新增独立 `/settings` 页面，应复用当前 `LanguageProvider` 和 storage key。

## 2026-06-30 UX-M22.1 Home Composer Language Coverage

### 已完成

- 首页引入 `useLanguage()`。
- 首页第一屏核心文案接入全局翻译：
  - workspace sidebar。
  - workspace selector。
  - hero eyebrow / headline。
  - 新建 HTML / 已有 HTML 模式切换。
  - prompt textarea aria-label / placeholder。
  - Add context 菜单。
  - Loop / Styles / Plugins。
  - Variations / Template / Model pill controls。
  - capability summary fallback label。
  - inspiration strip。
- `LanguageProvider` 的翻译表扩展为渐进式 key fallback：
  - 当前语言没有某 key 时 fallback 到英文。
  - 英文也没有时 fallback 到 key 本身。
- 浏览器 E2E 增强：
  - 切换中文后验证首页标题、模式按钮和 prompt placeholder。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/web run build`
- `npx playwright test --grep "settings menu switches|global user action cluster"` in `apps/web`

### 下一步

- 继续迁移结果墙 `/jobs/:jobId` 主体文案。
- 再迁移单变体编辑页 `/variations/:variationId` 主体文案。

## 2026-07-01 UX-M23 Quality And Accessibility Gates

### 已完成

- 在“设计方向 > 高级”中增加 Design System 预留入口：
  - 标记当前为 Alpha reserve。
  - 为参考品牌升级到 tokens、components、brand rules 的路径保留产品位置。
- 结果墙新增 artifact preview 可见性回归覆盖：
  - 模拟全黑、空白或 loading shell 风险的 artifact quality 结果。
  - 验证 variation 卡片必须展示用户可理解的质量失败提示。
- 用户前端新增基础可访问性 smoke：
  - 验证主 landmark、首页标题、全局设置/更多/头像按钮 accessible name。
  - 验证 prompt 输入 aria-label、生成按钮 disabled/enabled 状态。
  - 验证设计方向 tablist 和 Scene/Visual/Advanced tab 的基础语义。

### 验收

- `TODO.md` 中 UX-2 高级入口预留已完成。
- `TODO.md` 中 UX-7 artifact preview 可见性检查和用户端可访问性基础检查已完成。

### 下一步

- 将可见性检查结果接入更细分的用户动作：重新生成、查看 debug、继续 refine。
- 后续可引入 axe-core 或等价工具，把 smoke 扩展为系统化 a11y audit。

## 2026-07-03 UX-M24 Automation Loop Activity Stream

### 已完成

- 结果墙 Runtime Activity Stream 订阅 `design.loop_*` 事件。
- 将 automation loop 事件归一为用户可读 activity：
  - loop started -> `Automation loop started`
  - quality checked -> pass/warn/fail 阶段
  - repair planned -> 自动修复计划和 attempt
  - repair started -> 自动修复开始和 runtime session
  - loop completed -> 质量通过/修复完成
  - loop stopped -> 停止原因和用户可理解说明
- Runtime status cards 增加 `CHECK` 和 `REPAIR` 阶段标签。

### 验证

- `npm run typecheck`

### 下一步

- 为 Activity Stream 增加针对 loop event 的浏览器 E2E fixture。
- 在 variation 卡片上展示最近一次 loop stopped reason 和 repair attempt。

## 2026-07-03 UX-M25 Dynamic Encyclopedia Composer Entry

### 已完成

- 首页 composer 新增产品模式切换：
  - `Web & App`
  - `Dynamic encyclopedia card`
- 产品模式与 source mode 保持正交：
  - product mode 决定业务链路。
  - source mode 仍表示新建 HTML / 基于已有 HTML。
- 切换到动态百科卡片模式后自动设置：
  - `tpl_dynamic_encyclopedia_entry`
  - `dtp_dynamic_encyclopedia_card`
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- 动态百科模式提交时先调用：
  - `POST /api/encyclopedia/entry-guidance`
  - 低置信时先展示 guidance，不直接创建 job。
  - 再次提交时调用 confirm API 后创建 job。
- guidance summary 展示：
  - 分类结果。
  - 置信度。
  - interaction paradigm。
  - 推荐子模板。
  - democase references。
  - 低置信确认提示。
- create job 使用 guidance 返回的 `capabilityRequirements` 和 `templateRequirements`，避免前端拼接 BabeL-O 私有 prompt。

### 验证

- `npx tsc -b packages/contracts apps/web`
- `npm --workspace @dudesign/web run build`

### 后续建议

- 增加专门 Playwright E2E：切换动态百科卡片模式 -> 输入词条 -> guidance 展示 -> 创建 job。
- 低置信状态增加改选分类/子模板 UI。
- 将 democase references 展示升级为可展开详情。

## 2026-07-03 UX-M26 Dynamic Encyclopedia Composer E2E

### 已完成

- `mock-product-flow.spec.ts` 新增动态百科模式专项 E2E：
  - 切换到 Dynamic encyclopedia card。
  - 验证词条输入 placeholder。
  - 验证能力摘要自动切到动态百科 scene/template/loop。
  - 输入“百度百科”企业词条。
  - 等待 `POST /api/encyclopedia/entry-guidance`。
  - 验证 democase reference 命中 `demo_baidu_baike_company`。
  - 验证创建 job 后 snapshot 使用动态百科 product mode、skill、MCP 和 review loop。
- 新增低置信专项 E2E：
  - 输入 fallback 词条。
  - 页面停留在首页。
  - 展示 guidance summary 和 Low confidence 提示。

### 验证

- `npx tsc -b packages/contracts apps/web`
- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e -- --grep "dynamic encyclopedia mode"`

### 后续建议

- 为低置信状态增加子模板/分类改选控件。
- 增加 democase references 展开详情的可访问性测试。

## 2026-07-03 UX-M27 Dynamic Encyclopedia Low Confidence Template Selection

### 已完成

- 低置信 guidance card 的推荐子模板从静态标签升级为可选按钮。
- 用户可以在确认前保留或取消 1-3 个推荐子模板。
- confirm 请求使用用户当前选择的 `selectedTemplateIds`，不再固定使用 guidance 默认模板。
- Playwright E2E 覆盖：
  - 低置信词条先停留在首页展示 guidance。
  - 取消一个默认推荐子模板。
  - 再次提交后调用 confirm API。
  - 创建 job 后 snapshot 只包含用户确认保留的模板。

### 验证

- `npx tsc -b packages/contracts apps/web`
- `NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000 npm --workspace @dudesign/web run build`
- `DUDESIGN_WEB_URL=http://localhost:3002 npm --workspace @dudesign/web run test:e2e -- --grep "dynamic encyclopedia mode"`

### 后续建议

- 增加分类改选控件，让低置信词条可改 primary / secondary category。
- 增加 democase references 展开详情和可访问性测试。

## 2026-07-03 UX-M28 Dynamic Encyclopedia Classification Override

### 已完成

- 低置信 guidance card 新增分类快捷改选：
  - 企业、学校、名人、历史人物、影视作品、文学著作、游戏、产品设备、知识术语。
- 改选时间线类分类时，前端自动切换到时间线子模板。
- confirm 请求携带 `classificationOverride` 和当前模板选择。
- Playwright E2E 覆盖：
  - 低置信词条从默认“知识 / 知识术语”改选为“作品 / 游戏”。
  - 确认后创建 job。
  - job snapshot 使用 `dtp_dynamic_encyclopedia_timeline_card` 和 `ip_timeline_story`。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow"`
- `NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000 npm --workspace @dudesign/web run build`
- `DUDESIGN_WEB_URL=http://localhost:3002 npm --workspace @dudesign/web run test:e2e -- --grep "dynamic encyclopedia mode"`

### 后续建议

- 增加 democase references 展开详情和命中原因展示。
- 将分类快捷选项抽为 API 返回的可配置分类 taxonomy，避免长期写死在前端。

## 2026-07-03 UX-M29 Dynamic Encyclopedia Democase Explainability

### 已完成

- guidance card 中的 `democaseReferences` 从单行标题升级为可展开详情。
- 每个参考案例展示：
  - 案例标题。
  - 命中分。
  - 摘要说明。
  - 命中关键词。
- 低置信链路 E2E 使用弱命中 `baidu baike`：
  - 保持低置信确认态。
  - 展开 `demo_baidu_baike_company`。
  - 验证 `Score`、`Matched keywords` 和命中词可见。
- 本地 E2E 临时 `3002` 端口默认连到 `127.0.0.1:4000`，避免 production preview 测试时出现 `Model No model`。

### 验证

- `npx tsc -b packages/contracts apps/web`
- `NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000 npm --workspace @dudesign/web run build`
- `DUDESIGN_WEB_URL=http://localhost:3002 npm --workspace @dudesign/web run test:e2e -- --grep "dynamic encyclopedia mode"`

### 后续建议

- 将参考案例命中原因与真实 democase 只读 API 返回字段对齐。
- 为 details 展开状态增加可访问性检查。

## 2026-07-03 UX-M30 Semi-Auto Review Pending Panel

### 已完成

- 结果墙新增半自动审查确认面板：
  - 触发条件：动态百科 job、`loop_encyclopedia_spec_review`、`maxRepairAttempts = 1`、artifact quality 非 `pass`。
  - 展示 `Review pending`、审查失败/警告摘要和第一条质量问题。
  - 提供三个用户动作入口：
    - `Confirm repair`：当前标记为 repair queued 的前端预留状态。
    - `Skip`：收起该 variation 的审查提示。
    - `Manual edit`：进入单变体编辑页。
- E2E 扩展 `artifact preview visibility` fixture：
  - mock 动态百科半自动审查 job。
  - 验证质量失败 banner。
  - 验证 Review pending 面板。
  - 验证确认修复、跳过、手动修改入口。

### 验证

- `npx tsc -b packages/contracts apps/web`
- `NEXT_PUBLIC_DUDESIGN_API_URL=http://127.0.0.1:4000 npm --workspace @dudesign/web run build`
- `DUDESIGN_WEB_URL=http://localhost:3002 npm --workspace @dudesign/web run test:e2e -- --grep "artifact preview visibility"`
- `DUDESIGN_WEB_URL=http://localhost:3002 npm --workspace @dudesign/web run test:e2e -- --grep "dynamic encyclopedia mode"`

### 后续建议

- 将 Review pending 状态持久化，避免刷新后丢失用户已跳过/已确认状态。
- 第 4 层补 spec review finding 到 BabeL-O refine prompt 的标准注入。

## 2026-07-03 UX-M31 Semi-Auto Review Backend Actions

### 已完成

- 结果墙 Review pending 面板接入真实后端动作：
  - `Confirm repair` 调用 `POST /api/variations/:id/review-actions`，成功后显示 repair queued。
  - `Skip` 调用同一 API，成功后收起当前 variation 审查提示。
  - 提交中禁用按钮，避免重复点击。
- E2E 扩展 `artifact preview visibility` fixture：
  - mock review action API。
  - 断言 `confirm_repair` 请求体携带当前 artifact id。
  - 刷新后再次触发 `skip`，断言同样走后端 API。
- `user-experience/TODO.md` 已更新：确认修复/跳过 API 已接通，完整审查报告和持久化 pending 状态待补。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`

### 后续建议

- 当后端有结构化 spec finding 后，在面板展示多条 findings、严重级别和修复 diff 摘要。

## 2026-07-03 UX-M32 Review Action Resume State

### 已完成

- 结果墙读取 `variation.reviewAction`：
  - 当前 artifact 已 `repair_queued` 时，刷新后继续展示 queued 状态，不再显示确认按钮。
  - 当前 artifact 已 `skipped` 时，刷新后不再展示 Review pending 面板。
  - 如果 review action 指向旧 artifact，新 artifact 仍会重新进入 pending。
- E2E 扩展 `artifact preview visibility` fixture：
  - confirm repair 后刷新，断言 queued 状态从 snapshot 恢复。
  - skip 后刷新，断言 pending 面板继续隐藏。
- `user-experience/TODO.md` 已更新：刷新恢复已完成，完整结构化审查报告待补。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`

### 后续建议

- 增加 UI 说明：当前修复已排队，用户仍可进入 Manual edit。
- 结构化 spec findings 接入后，将面板从单条 quality issue 升级为 findings 列表。

## 2026-07-03 UX-M33 Dynamic Encyclopedia Flow Closure

### 已完成

- 首页动态百科模式新增流程条，将用户路径串成：
  - 词条引导。
  - 模板确认。
  - 自动审查。
  - 生成预览。
- 动态百科提交改为两阶段：
  - 第一次提交只调用 entry guidance，返回分类、democase、推荐模板和插件/loop 配置。
  - 用户确认或调整模板/分类后，第二次提交才创建 design job。
- prompt、示例卡片和新建会话入口都会清空旧 guidance，避免新词条复用旧词条推荐。
- 生成按钮根据当前阶段切换为“分析词条引导”或“生成设计变体”的可访问标签。
- Playwright 浏览器缺失导致 pixel quality gate 无法运行时，用户端不再展示原始堆栈，改为“视觉检查未启用”的可理解提示。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`

### 后续建议

- 为动态百科两阶段首页流程补 Playwright E2E：首次点击停留在首页、展示流程条 done/active 状态，二次点击创建 job。
- 将自动审查状态接入结构化 spec findings，展示规则、严重级别、建议修复和半自动 diff。
## 2026-07-06 UX-9 Capability Degradation Notice

### 已完成

- 新增用户端 `CapabilityNotice` 组件：
  - 支持直接传入 `UserFacingError`。
  - 支持传入 `McpInvocationResult` 并通过 `mcpInvocationToUserError()` 生成用户文案。
  - 默认展示主动作，并支持补充操作按钮。
- Variation 详情页在原有 error / notice 区域下方接入 capability notice 展示位。
- 增加中英文动作文案：
  - `Retry image` / `重试图片`
  - `Switch provider` / `切换 provider`
- 样式使用现有 token：`warning-soft`、`accent`、`surface`、`pill`，保持与当前工作台一致。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/capability-errors.test.mjs`

## 2026-07-06 UX-9 Job Activity Capability Warnings

### 已完成

- `design.runtime_warning` 事件契约新增可选 `context` 字段，用于携带 MCP/tool/provider 上下文。
- Job 页 Activity Stream 对 `design.runtime_warning` 使用 `toUserFacingError()` 归一化：
  - `MCP_UNAVAILABLE + image-generation` 展示为图片生成暂不可用。
  - stream line detail 展示用户恢复动作，例如继续无图、稍后重试或切换 provider。
- Runtime card 会把 warning/error 事件纳入 variation 最新状态，用户无需进入单变体即可看到能力降级。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/capability-errors.test.mjs`

### 后续关注

- 首页生成过程 Activity Stream 使用 `mcpInvocationToUserError()` 展示 provider/tool 降级。

## 2026-07-06 UX-9 Variation Detail Capability Notices

### 已完成

- `GET /api/variations/:id` 新增 `capabilityNotices`，返回最近非 `ok` 的 MCP invocation result。
- Variation 详情页自动读取 `detail.capabilityNotices[0]` 并映射为 `CapabilityNotice`。
- 返回内容只包含用户端可消费的标准 `McpInvocationResult`，不暴露 admin audit、request 原文、replay key 或 provider secret。
- API flow smoke 覆盖图片生成内容安全失败后，variation detail 能返回对应 capability notice。

## 2026-07-06 UX-9 Variation Inspect Capability Activity

### 已完成

- Variation Inspect 面板新增 `capability-activity` 区域。
- 当 `detail.capabilityNotices[0]` 存在时，展示：
  - MCP result status / notice severity。
  - provider/tool 来源。
  - 用户可执行的恢复动作。
- 没有异常时显示“暂无能力异常记录”，避免空面板。
- 增加中英文文案：`Capability activity`、`No capability issues recorded`、`Action`、`OK`。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/capability-errors.test.mjs`

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="DUDesign mock API flow"`
- `node --test apps/web/test/capability-errors.test.mjs`

## 2026-07-07 UX-10 Auth Entry UI

### 已完成

- 新增用户端 `/login` 页面：
  - 邮箱密码登录。
  - 邮箱密码注册。
  - Continue with Google。
  - Continue with GitHub。
- Web API client 从 dev bootstrap 切到真实 session endpoint：
  - `getBootstrap()` 调用 `/api/auth/me`。
  - 新增 `loginUser()`、`registerUser()`、`logoutUser()`、`startOAuthLogin()`。
  - 私有 API fetch 统一使用 `credentials: include`，让 `dudesign_session` cookie 生效。
- 首页 bootstrap 失败且错误包含 `AUTH_REQUIRED` 时跳转 `/login`。
- OAuth provider start 后，登录页将 callback `redirect_uri` 增加 `redirectTo=/`，配合后端完成 provider 回跳后的 app 首页跳转。
- 新增静态测试 `apps/web/test/auth-ui.test.mjs`，守住登录入口和 session credential fetch contract。

### 验证

- `npm run typecheck`
- `node --test apps/web/test/auth-ui.test.mjs apps/web/test/capability-errors.test.mjs`

### 后续关注

- 补真实浏览器 E2E：注册 -> 进入工作台 -> 登出 -> 未登录跳转。
- 补真实 provider staging smoke：Google/GitHub OAuth client 配置后，从 `/login` 完成完整授权回跳。
- 登录页后续可接入忘记密码、邮箱验证和登录失败节流提示。

## 2026-07-11 UX-M11 Runtime Diagnostic Redaction

### 已完成

- 用户 Job Activity Stream 不再显示 runtime child session id 和 agent job id。
- queued/repair 活动改为产品化执行状态文案。
- 用户 Job Snapshot 改为消费 `execution` 状态，不感知 lane/backend/lease 拓扑。

### 决策

- Runtime 诊断信息只进入 Admin API；用户端只表达进度、重试、降级和可恢复动作。
