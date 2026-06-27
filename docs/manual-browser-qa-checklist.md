# DUDesign 手动浏览体验 QA 清单

> 版本：v0.1
> 日期：2026-06-27
> 定位：用于本地、Staging 和 Production 发布前的真实浏览器体验验收
> 关联文档：
> - `docs/development-release-governance.md`
> - `docs/architecture-governance-plan.md`
> - `docs/modules/user-experience/TODO.md`
> - `docs/modules/admin-console/TODO.md`
> - `docs/modules/application-service/TODO.md`
> - `docs/modules/runtime-compatibility/TODO.md`

## 1. 测试目标

手动浏览体验 QA 的目标不是替代自动化测试，而是验证自动化测试难以覆盖的真实产品感受：

- 页面是否能被普通用户顺畅理解。
- 生成、预览、精修、导出、分享是否形成闭环。
- 刷新、返回、切换尺寸、打开分享链接等真实操作是否稳定。
- runtime 不可用时，用户是否仍能访问已完成成果。
- 管理端是否能帮助排障，而不是只显示数据。

## 2. 测试环境

### 2.1 Local

本地浏览器测试用于开发阶段快速体验。

```bash
npm run dev:api
npm run dev:web
npm run dev:admin
```

默认地址：

```text
用户端：http://localhost:3001
管理端：http://localhost:3002
API：http://localhost:4000
```

### 2.2 Staging

Staging 测试用于发布前验收，必须尽量接近 Production：

- 使用 PostgreSQL。
- 使用真实或类生产 artifact storage。
- 使用 `DUDESIGN_REPOSITORY=postgres`。
- 如进行真实内核联调，使用 `DUDESIGN_RUNTIME_MODE=babel-o`。
- 不依赖本地 memory store 作为唯一验收依据。

### 2.3 Production Smoke

Production 发布后只跑低风险 smoke：

- 不创建大量生成任务。
- 不破坏真实用户数据。
- 使用专用测试账号或内部 workspace。
- 确认 health、登录、只读分享、管理端观测和日志即可。

## 3. 测试前检查

开始手动 QA 前先确认：

- [ ] 当前代码已通过 `npm run typecheck`。
- [ ] 当前代码已通过 `npm test`。
- [ ] 如涉及 PostgreSQL，已跑真实 PostgreSQL smoke。
- [ ] API 服务已启动。
- [ ] 用户端 Web 服务已启动。
- [ ] 管理端服务已启动。
- [ ] artifact root / object storage 可读写。
- [ ] 浏览器 devtools console 没有启动期错误。
- [ ] 测试账号和 workspace 已准备。

## 4. 用户端主链路 QA

### 4.1 首页与会话入口

- [ ] 用户端首页可打开。
- [ ] 页面首屏不是营销页，而是可操作的设计交互入口。
- [ ] prompt 输入框可输入多行需求。
- [ ] 可选择新建 HTML。
- [ ] 可选择基于已有 HTML 继续开发。
- [ ] 可选择 variation 数量。
- [ ] 可填写模板风格要求。
- [ ] 空 prompt 提交有明确提示。
- [ ] 页面刷新后不出现白屏。

### 4.2 创建会话与生成任务

- [ ] 点击生成后成功创建 session。
- [ ] 成功创建 design job。
- [ ] variation 数量与用户选择一致。
- [ ] 生成中状态清晰可见。
- [ ] 每个 variation 有独立进度或状态。
- [ ] 失败 variation 不影响其它 variation 继续完成。
- [ ] 页面刷新后可恢复 job 状态。
- [ ] 浏览器返回上一页再进入，状态仍正确。

### 4.3 结果墙

- [ ] 结果墙展示所有 variation。
- [ ] 每个 variation 可预览大致效果。
- [ ] completed / failed / running 状态有明确区分。
- [ ] 点击 variation 可进入详情页。
- [ ] 结果墙没有明显布局重叠。
- [ ] 小屏幕下卡片不会挤压文字。

### 4.4 单 variation 详情

- [ ] 详情页能打开。
- [ ] 主预览区域显示正确 HTML。
- [ ] 右侧 refine 面板可输入修改需求。
- [ ] 可查看当前 artifact version。
- [ ] 可查看 prompt / reason / cost 等辅助信息。
- [ ] refinement 只影响当前 variation。
- [ ] refinement 后 artifact version 正确递增。
- [ ] 返回结果墙后当前 variation 状态正确更新。

### 4.5 尺寸预览

- [ ] Desktop 预览可用。
- [ ] Tablet 预览可用。
- [ ] Mobile 预览可用。
- [ ] 尺寸切换不会导致页面崩溃。
- [ ] iframe 或预览容器尺寸稳定。
- [ ] 文本不明显溢出。
- [ ] 关键按钮在移动端仍可点击。

### 4.6 圈画批改

- [ ] 可在预览上创建批注。
- [ ] 批注坐标随预览尺寸归一化，不依赖固定像素。
- [ ] 可输入批注意见。
- [ ] 提交批注后触发 refine。
- [ ] annotation payload 被保存。
- [ ] refine 后新 artifact 与批注意图相关。
- [ ] 批注失败时有明确错误提示。

### 4.7 Export

- [ ] 可导出当前 HTML。
- [ ] 导出的 HTML 对应当前 artifact version。
- [ ] refine 后再次导出，版本更新。
- [ ] 导出文件名可读。
- [ ] export 失败时有明确错误提示。

### 4.8 Share

- [ ] 可创建 public share link。
- [ ] share link 可在新标签页打开。
- [ ] share 页面是只读体验。
- [ ] share 页面显示的是创建时 artifact。
- [ ] 创建 share 后继续 refine，旧 share 内容不漂移。
- [ ] expired share 返回明确状态。
- [ ] revoked share 返回明确状态。
- [ ] private/password share 在 MVP 下返回明确 forbidden。

## 5. Runtime-backed QA

当 `DUDESIGN_RUNTIME_MODE=babel-o` 或使用 BabeL-O mock gateway 时，额外检查：

- [ ] runtime health 显示 compatible 或 degraded。
- [ ] 创建 session 时返回 runtimeSessionId。
- [ ] 多 variation 并行 stream 可见。
- [ ] assistant/thinking delta 不泄露原始 NexusEvent 结构。
- [ ] runtime result 能生成 HTML artifact。
- [ ] runtime 返回的 CSS/JS asset 可通过 `/assets/...` 读取。
- [ ] HTML 中相对 asset 路径被重写为 API asset URL。
- [ ] runtime workspace 文件路径逃逸会被拒绝。
- [ ] 单个 variation 失败不影响其它 variation。
- [ ] contract mismatch 时不启动新任务，并显示明确降级/失败状态。

## 6. Runtime Unavailable QA

模拟 runtime 不可用时检查：

- [ ] 已完成 session 可打开。
- [ ] session resume snapshot 可用。
- [ ] 已完成 variation 可预览。
- [ ] 已完成 artifact 可 export。
- [ ] 已创建 share link 可访问。
- [ ] 管理端可看到 runtime unavailable。
- [ ] 新 job 明确失败或进入 degraded 状态。
- [ ] 错误提示不暴露内部堆栈。
- [ ] 用户不会误以为任务仍在无限生成。

## 7. 管理端 QA

### 7.1 管理端基础

- [ ] 管理端首页可打开。
- [ ] runtime health 可查看。
- [ ] contract status 可查看。
- [ ] 权限不足时显示 forbidden。
- [ ] support/operator/developer 权限行为符合预期。

### 7.2 Job 治理

- [ ] 可查看 job 列表。
- [ ] 可按 status 过滤。
- [ ] 可查看 variation 完成/失败数量。
- [ ] 可 cancel 未完成 job。
- [ ] completed job cancel 返回明确不可取消。
- [ ] 可 retry job。
- [ ] retry 生成新 job，不覆盖旧 job。

### 7.3 Artifact 与 Share

- [ ] 可查看 artifact 列表。
- [ ] 可按 job / variation / kind 过滤。
- [ ] 可看到 artifact storage key。
- [ ] 可看到 share count。
- [ ] share revoke 后状态可追踪。

### 7.4 Cost 与 Audit

- [ ] cost summary 可查看。
- [ ] usage event 不因 replay 重复计费。
- [ ] cancel/retry 有 audit log。
- [ ] audit log 包含 operator、role、target、reason。
- [ ] request id 可用于日志追踪。

## 8. 安全与隔离 QA

- [ ] 用户 A 不能访问用户 B 的 session。
- [ ] 用户 A 不能访问用户 B 的 job。
- [ ] 用户 A 不能访问用户 B 的 variation。
- [ ] 用户 A 不能 revoke 用户 B 的 share。
- [ ] preview iframe 使用 sandbox。
- [ ] share preview 只读。
- [ ] asset path 不允许 `../` 或反斜杠逃逸。
- [ ] API 错误不返回敏感堆栈。
- [ ] runtime 原始事件不直接暴露给用户前端。

## 9. 浏览器兼容与响应式

至少手动检查：

- [ ] Chrome 最新版。
- [ ] Safari 最新版。
- [ ] 桌面宽屏。
- [ ] 普通笔记本宽度。
- [ ] Tablet 宽度。
- [ ] Mobile 宽度。

重点观察：

- [ ] 按钮文字不溢出。
- [ ] 表单可点击。
- [ ] iframe 不遮挡控制区。
- [ ] 侧栏不会盖住主预览。
- [ ] loading 和 empty state 不跳动。

## 10. 发布前手动验收清单

Staging 发布前必须完成：

- [ ] 用户端主链路通过。
- [ ] 管理端主链路通过。
- [ ] Runtime-backed QA 通过，或明确本次仍使用 mock runtime。
- [ ] Runtime unavailable QA 通过。
- [ ] Share 不漂移通过。
- [ ] Export 通过。
- [ ] PostgreSQL smoke 通过。
- [ ] migration 已在 staging 执行。
- [ ] artifact storage 可读写。
- [ ] 日志无明显异常。

Production 发布后必须完成：

- [ ] API health 正常。
- [ ] 用户端可打开。
- [ ] 管理端可打开。
- [ ] 专用测试账号可创建 session。
- [ ] 已有 share link 可访问。
- [ ] runtime health 可查看。
- [ ] error log 无新增集中错误。

## 11. QA 记录模板

每次手动 QA 建议记录：

```markdown
## QA 记录 YYYY-MM-DD

环境：
- Local / Staging / Production
- commit:
- API URL:
- Web URL:
- Admin URL:
- Repository:
- Runtime mode:

结果：
- [ ] 用户端主链路
- [ ] 管理端主链路
- [ ] Runtime-backed
- [ ] Runtime unavailable
- [ ] Share/export
- [ ] 响应式

问题：
- 问题描述：
- 截图/录屏：
- 复现步骤：
- 严重级别：
- 负责人：
```

