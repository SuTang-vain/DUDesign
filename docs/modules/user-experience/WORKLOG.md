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
