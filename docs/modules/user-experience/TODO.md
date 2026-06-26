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
- [x] 定义统一 API client，只调用 DUDesign User API。
- [x] 定义统一 `DesignEventClient` 的事件契约基础，只消费 DUDesign 标准事件。
- [ ] 建立用户端错误展示规范：用户可理解错误、可重试状态、runtime 降级提示。

验收：

- 用户端不出现 BabeL-O 原始 endpoint、`NexusEvent`、runtime 内部 id 的直接引用。
- 所有页面可以基于 mock API 渲染空态和基础布局。

## Phase UX-1：登录后工作台与会话列表

- [ ] 实现登录后工作台页面。
- [x] 展示最近会话。
- [x] 支持创建新会话。
- [x] 支持恢复历史会话。
- [ ] 支持 workspace 选择，MVP 默认个人 hosted workspace。

验收：

- 用户刷新页面后可以重新看到历史会话。
- 会话列表只展示当前用户可访问资源。

## Phase UX-2：交互首页

- [x] 实现 prompt composer。
- [x] 实现新建 HTML / 基于已有 HTML 模式选择。
- [ ] 实现已有 HTML 上传或历史 artifact 选择入口。
- [x] 实现变体数量选择，MVP 上限默认 6。
- [x] 实现模板风格/要求输入。
- [x] 调用 `POST /api/design-jobs` 创建生成任务。

验收：

- 用户可以从空白需求创建 design job。
- 用户可以基于已有 artifact 创建 design job。
- 请求体中不包含本地 cwd，只包含 workspace/session/artifact 引用。

## Phase UX-3：并行生成页

- [x] 实现 job progress header。
- [x] 实现 variation generation grid。
- [x] 展示 queued、running、streaming、rendering_preview、completed、failed、cancelled 状态。
- [x] 展示每个 variation 的流式摘要、token、成本估算。
- [x] 支持单个 variation 先完成先预览。
- [ ] 支持 job 失败和部分失败状态。

验收：

- 3 个和 6 个 variation 的 mock stream 都能正确渲染。
- 单个 variation 失败不阻断其他 variation 的结果展示。

## Phase UX-4：结果墙

- [x] 实现多变体结果墙。
- [x] 展示 preview iframe。
- [x] 支持进入单变体编辑。
- [ ] 支持锁定当前版本。
- [x] 支持导出入口。
- [x] 支持分享入口。

验收：

- 所有 completed variation 都有可打开的预览。
- failed variation 有清晰错误摘要和重试入口。

## Phase UX-5：单变体编辑页

- [x] 实现 `DevicePreviewFrame`，支持 Desktop、Tablet、Mobile。
- [x] 实现 iframe sandbox preview。
- [x] 实现 refine panel。
- [x] 实现 artifact version menu。
- [ ] 实现 cost/runtime summary panel。
- [x] 实现 mock HTML 导出。
- [x] 实现 mock share link 创建。
- [x] 实现只读分享页。

验收：

- 用户可以针对某个 variation 继续提交 prompt。
- 后续 refine 不影响同 job 下其他 variation。

## Phase UX-6：圈画批改

- [x] 实现 annotation overlay 最小版本。
- [ ] 支持 rect、circle、arrow、pen、text。
- [x] 支持 rect 和 text。
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
- [ ] 建立用户端可访问性基础检查。

验收：

- 登录 -> 新建任务 -> 并行生成 -> 结果墙 -> 单变体精修 -> 导出 的 mock E2E 通过。
