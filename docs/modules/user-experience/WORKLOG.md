# 用户前端交互层工作记录

> 模块：User Experience Layer
> 维护方式：按日期追加。记录已完成工作、关键决策、风险、后续动作。

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
- 根 `npm test` 现在同时执行 API smoke 和 UX-M1 mock product flow。
- flow test 验证首页、job 页、variation 页、export API、share API、share detail API、share 页路由。

### 验证记录

- `npm run test:ux`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 后续关注

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
