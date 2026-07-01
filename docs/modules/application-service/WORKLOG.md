# 后端业务服务层工作记录

> 模块：Application Service Layer
> 维护方式：按日期追加。记录业务模型、API、状态机、权限和数据迁移。

## 2026-07-01 APP-M28 Admin Auth Session Role

### 已完成

- 收口 MU-3 Admin Auth：
  - `users` 增加 `metadata jsonb` migration，MVP 使用 `metadata.adminRole` 作为 Admin role 来源。
  - domain / contracts 的 `User` 增加 `metadata` 字段。
  - `ApplicationRepository` 增加 `updateUserMetadata()`。
  - `InMemoryStore` / `PostgresRepository` 实现用户 metadata 更新；Postgres 使用 SQL-first `update users set metadata = ...`。
  - `createRequestContext()` 在 `session` / `production` mode 下从真实 session user 的 `metadata.adminRole` 解析 `support` / `operator` / `developer`。
  - `x-dudesign-admin-role` 只在 dev mode 生效；session/production mode 下伪造 admin header 不会授予权限。
- 新增 session-mode Admin Auth 测试：
  - 普通登录用户携带伪造 `x-dudesign-admin-role: developer` 访问 Admin API 返回 403。
  - 写入 `metadata.adminRole=operator` 后，同一 session 可访问 Admin API。
  - Admin 写操作 audit log 记录真实 session user id 和 operator role。

### 验证

- `npm run typecheck`
- `npx tsc -b apps/api packages/contracts packages/domain && node --test apps/api/dist/auth-flow.test.js apps/api/dist/admin-runtime-health.test.js apps/api/dist/model-governance.test.js`
- `npm --workspace @dudesign/api run test`

### 决策

- MVP 不新增独立 `admin_roles` 表，先用 `users.metadata.adminRole` 快速建立真实 session RBAC 边界。
- 独立 `admin_roles` 表、授予/撤销 API、审批和审计历史作为后续管理治理增强项。
- 现有 dev header role 保留，便于本地 Admin Console 和默认 smoke；生产/session 模式不会信任该 header。

## 2026-07-01 APP-M27 Disabled User and Postgres No-hydrate Multi-user Smoke

### 已完成

- 收口 MU-4 多用户隔离 smoke 的剩余项：
  - 抽出 `multiUserAccessSmoke.ts`，让 InMemory 默认门禁和 PostgreSQL integration 可以复用同一套 HTTP/session-cookie 多用户隔离流程。
  - 覆盖 disabled user 场景：已禁用用户的旧 cookie 调用 `/api/auth/me` 返回 403，重新登录也返回 403。
  - `postgres-api-flow.test.ts` 在 `hydrateOnStart:false` harness 中复用同一套 multi-user smoke，用于真实 PostgreSQL opt-in 环境验证 no-hydrate 多用户访问隔离链路。
- Repository 补齐用户状态更新能力：
  - `ApplicationRepository.updateUserStatus()`。
  - `InMemoryStore.updateUserStatus()`。
  - `PostgresRepository.updateUserStatus()` SQL-first 更新 `users.status` 与 `updated_at`。
- 保持 public share 的 artifact-pinned 语义：owner 后续切换 current artifact 后，旧 share 仍固定读取创建时 artifact。

### 验证

- `npm run typecheck`
- `npx tsc -b apps/api packages/contracts packages/domain && node --test apps/api/dist/multi-user-access-flow.test.js apps/api/dist/postgres-api-flow.test.js`
- `npm --workspace @dudesign/api run test`

> 本轮本机未配置 `DUDESIGN_POSTGRES_TEST_URL`，PostgreSQL integration suite 按既有规则跳过；no-hydrate 多用户 smoke 已接入该 suite，配置真实 PostgreSQL URL 后会执行。

### 决策

- disabled user 测试通过 Repository 更新状态，不直接改内部 Map，避免 no-hydrate / SQL-first 模式下测试语义漂移。
- PostgreSQL no-hydrate smoke 作为 opt-in integration 保持在 `DUDESIGN_POSTGRES_TEST_URL` 存在时运行；默认测试门禁继续无外部数据库依赖。
- MU-4 至此完成，下一步应进入 MU-3 Admin Auth 收口或继续补 PostgreSQL/Redis 真实环境组合 smoke。

## 2026-07-01 APP-M26 Multi-user Access HTTP Smoke

### 已完成

- 推进 MU-4 多用户隔离 smoke 的 HTTP/session-cookie 主路径：
  - 新增 `multi-user-access-flow.test.ts`。
  - 在 `DUDESIGN_AUTH_MODE=session` 下通过真实 HTTP API 注册 user A / user B。
  - user A 创建 session/job，并绑定一份稳定 HTML artifact。
  - user B 访问 user A 的 job、variation detail、preview 均返回 403。
  - user A 创建 public share 后，匿名访问和 user B cookie 访问均只能通过 share token 读取固定 artifact。
  - user A 后续切换 current artifact 后，旧 share 仍固定指向创建 share 时的 artifact，不随版本漂移。
  - user B 不能对 user A variation 创建 share。
- 加固 `babel-runtime-api-flow.test.ts`：
  - quality gate 测试不再假设失败 artifact 永远是 current artifact v1。
  - 自动修复可能生成新 current artifact，因此测试改为检查 job artifacts 中存在带质量失败的 artifact，并继续验证 SSE runtime warning。

### 验证

- `npm run typecheck`
- `npx tsc -b apps/api packages/contracts packages/domain && node --test apps/api/dist/multi-user-access-flow.test.js apps/api/dist/workspace-membership.test.js apps/api/dist/auth-flow.test.js`
- `npx tsc -b apps/api packages/contracts packages/domain && node --test apps/api/dist/babel-runtime-api-flow.test.js`
- `npm --workspace @dudesign/api run test`

### 决策

- MU-4 HTTP smoke 先覆盖 InMemory/session-cookie 主路径，保证默认门禁稳定。
- PostgreSQL no-hydrate 多用户隔离 smoke 仍保留为后续独立项，避免一次改动同时扩大 DB 环境依赖。
- share 的安全语义继续保持 artifact-pinned：用户后续 refine/restore 不影响已创建 public share。

## 2026-07-01 APP-M25 Workspace Membership Guard

### 已完成

- 落地 MU-2 Workspace Membership Guard：
  - 在 domain 增加 `WorkspaceMember`、`WorkspaceMemberRole`、`WorkspaceMemberStatus`。
  - `ApplicationRepository` 增加 `workspaceMembers`、`getWorkspaceMember()`、`upsertWorkspaceMember()`。
  - `InMemoryStore` seed user / 注册用户时写入 owner membership。
  - `PostgresRepository` hydrate `workspace_members`，seed / 注册用户时 SQL-first 写入 owner membership。
  - `PostgresRepository` 增加 SQL-native `getWorkspaceMember()` 和 `upsertWorkspaceMember()`。
- 权限 guard 从 owner-only 迁移到 membership-aware：
  - `requireWorkspaceAccess(workspaceId, userId, minRole)`。
  - `requireSessionAccess()`、`requireJobAccess()`、`requireVariationAccess()` 通过 workspace membership 判断。
  - viewer 可读详情/预览/files/export zip 下载。
  - editor 可创建 session/job、refine、annotation、restore、repair、export、share。
  - owner 字段保留为旧数据兼容兜底；缺少 member 行但 owner 匹配时仍视作 owner。
- `listSessions()` 改为按 workspace viewer 可见性过滤，支持后续协作用户看到同 workspace 会话。
- 新增 `workspace-membership.test.ts`：
  - viewer 可读 job，但不能创建 job。
  - editor 可创建 job。
  - non-member / removed member 无法 resume 私有 session。
- 更新 API flow smoke 断言，保持资源级 forbidden code：job 访问失败返回 `JOB_FORBIDDEN`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 决策

- MVP 暂不开放团队协作 UI，但后端权限模型已从 owner-only 过渡到 role-based membership。
- `viewer/editor/admin/owner` 采用单调角色等级；后续邀请、移除、团队 UI 和 audit 可直接复用该 guard。
- 资源级 forbidden code 继续保留，避免前端和 smoke 对错误类型的判断漂移。

## 2026-07-01 APP-M24 Auth Repository and Session Cookie MVP

### 已完成

- 落地 MU-1 Auth Repository 与 Session Cookie：
  - 新增 `auth_identities` / `auth_sessions` PostgreSQL migration。
  - `InMemoryStore` / `PostgresRepository` 增加 auth identity、auth session、按 email 查 user、注册时创建个人 workspace 的 repository methods。
  - `PostgresRepository` 对 auth identity/session 使用 SQL-first 读写，并纳入 startup hydrate。
- `createRequestContext()` 支持两种 auth mode：
  - `DUDESIGN_AUTH_MODE=dev` 保留 header-based dev user。
  - `DUDESIGN_AUTH_MODE=session|production` 从 `dudesign_session` HttpOnly cookie 解析真实 user，并忽略 user/admin dev header。
- 新增认证 API：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
- 新增密码与 session 工具：
  - email normalize。
  - scrypt password hash / verify。
  - session token 生成、hash 存储、cookie set/clear。
  - IP hash 记录，避免存明文 IP。
- 新增 `auth-flow.test.ts`：
  - session mode 下 dev header 无法通过 `/api/dev/bootstrap`。
  - register 返回 cookie。
  - cookie 可访问 `/api/auth/me` 和创建 session。
  - logout 后旧 cookie 失效。
  - login 可重新签发 cookie。
- 修复 `designJobEvents.test.ts`：
  - 使用 no-op screenshot queue，避免 SSE/event persistence 测试拉起 screenshot worker/browser 池导致测试进程不退出。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 决策

- MVP 先采用 server-side session cookie，不在业务库中保存明文 token。
- 生产/session mode 下禁用 header-based user/admin spoofing；真实 admin role 归属留到 MU-3。
- 注册时已创建个人 hosted workspace；owner membership 写入和 membership-aware guard 放入 MU-2 继续推进。

## 2026-07-01 APP-M23 Real Multi-user Access Planning

### 已完成

- 新增 `multi-user-access-plan.md`，将真实多用户访问从零散方向拆成可执行治理规划。
- 明确当前状态：
  - 已有 `users`、`workspaces`、`workspace_members` 数据底座。
  - 已有 owner guard 和用户级 memory namespace。
  - 当前仍依赖 header-based dev user context，不适合真实用户开放。
- 明确真实多用户访问 MVP 范围：
  - 注册、登录、登出。
  - server-side session cookie。
  - 个人 hosted workspace。
  - membership-aware workspace guard。
  - production 禁用 dev header auth/admin role。
- 在 `application-service/TODO.md` 增加 `Phase APP-1.5：真实多用户访问`：
  - MU-1 Auth Repository 与 Session Cookie。
  - MU-2 Workspace Membership Guard。
  - MU-3 Admin Auth 收口。
  - MU-4 多用户隔离 Smoke。

### 决策

- 优先推进 MU-1，而不是先做团队协作 UI；真实身份来源是对外开放的第一道门。
- MVP 默认采用 server-side session cookie，Bearer token 作为后续 API client / automation 扩展。
- `workspace_members` 先落 owner membership 和 guard 抽象，邀请、移除、团队 UI 延后。
- Dev header fallback 只允许在 `DUDESIGN_AUTH_MODE=dev` 下启用，production mode 必须无效。

## 2026-07-01 APP-M22.10 Test Gate Closure For Screenshot Queue

### 已完成

- 修复默认 `npm run typecheck` 中 screenshot queue contract 引发的测试门禁噪音：
  - `DesignJobQueueConsumer` 测试 mock 补齐 `runScreenshotJob()`。
  - `QueuedDesignJobProcessor` 测试 mock 补齐 `processQueuedScreenshotJob()`。
  - Redis queue integration synthetic failure mock 补齐 screenshot consumer。
- 收紧 queue/worker 单元测试：
  - `InMemoryDesignJobQueue` 覆盖 screenshot job 幂等去重。
  - `ApplicationDesignJobWorker` 覆盖 screenshot job delegation。
- 修正 runtime gateway client 测试中的 capability snapshot mock，使其符合完整 contract 类型，并将请求断言从整对象 deepEqual 调整为关键字段 + capability snapshot 局部断言。

### 验证

- `npm run typecheck`
- `npx tsc -b apps/api packages/runtime-gateway apps/runtime-adapter && node --test apps/api/dist/designJobQueue.test.js apps/api/dist/designJobWorker.test.js packages/runtime-gateway/dist/babelOClient.test.js packages/runtime-gateway/dist/babelOAdapter.test.js apps/runtime-adapter/dist/app.test.js`

### 决策

- Queue consumer interface 增加新 job kind 后，默认测试 mock 必须同步补齐，避免“生产逻辑已可用但类型门禁失败”的噪音。
- Runtime gateway 测试不再复制完整 capability snapshot 作为 expected object，避免 contract 对象变完整后测试过度脆弱。

## 2026-07-01 APP-M22.9 Screenshot Queue Worker and Preview Repair

### 已完成

- 将 screenshot 生成从当前 API 进程内 `trackBackgroundTask()` 迁移到 queue worker：
  - 新增 `screenshot_job` 队列任务类型。
  - 新增 `ScreenshotJobQueuePayload`。
  - `DesignJobQueue` 增加 `enqueueScreenshotJob()`。
  - `DesignJobQueueConsumer` 增加 `runScreenshotJob()`。
  - `ApplicationDesignJobWorker` 增加 screenshot job 分发。
  - `RedisDesignJobQueue` 支持 screenshot job 入队、消费和状态归一。
- HTML artifact 创建、runtime HTML artifact 创建、runtime workspace artifact 创建后，不再直接在当前调用栈生成截图，而是入队 screenshot job。
- `ApplicationService.processQueuedScreenshotJob()` 作为 worker 消费入口：
  - 校验 variation / artifact 归属。
  - 读取 HTML artifact。
  - 复用既有 `createScreenshotArtifacts()` 生成 desktop/tablet/mobile screenshot artifacts。
  - 更新 `design_variations.screenshot_artifact_id` 指向 desktop screenshot。
- 新增 artifact preview repair/rebuild API：
  - `POST /api/variations/:id/preview/repair`
  - 支持指定 `artifactId` 修复历史/当前 HTML artifact 的 screenshot preview。
  - 返回目标 HTML artifact、preview URL、当前 screenshot URL 和 screenshot queue job 状态。
- restore 历史 HTML artifact 后，自动入队 `restore_requested` screenshot rebuild，避免恢复版本后仍沿用旧截图。
- 新增/扩展测试：
  - `InMemoryDesignJobQueue` 覆盖 screenshot job dedupe。
  - `ApplicationDesignJobWorker` 覆盖 screenshot job delegation。
  - Redis queue stable job names 覆盖 `screenshot_job`。
  - API smoke 覆盖 `POST /api/variations/:id/preview/repair` 并等待 screenshot artifact 可读。
- `application-service/TODO.md` 将 screenshot queue worker 和 artifact repair/rebuild preview 标记完成。

### 决策

- 自动 artifact-created / restore-requested screenshot job 使用稳定 idempotency key，避免同一 artifact 重复入队。
- 手动 repair-requested screenshot job 使用带 repair run id 的 idempotency key，允许用户或管理端多次触发重建。
- repair API 不直接重新生成 HTML artifact；它校验并重建 preview/screenshot 产物，保持 HTML artifact version 不变。

## 2026-07-01 APP-M22.8 Persisted Job Events and Partial Failure State

### 已完成

- 新增 design job event ledger：
  - `ApplicationRepository.appendDesignEvent()`
  - `ApplicationRepository.listDesignEvents()`
  - `InMemoryStore.designEvents`
  - PostgreSQL migration `0006_design_events.sql`
  - `PostgresRepository` SQL-native design event append/list。
- `ApplicationService` 将 runtime event side effects 与 event publish 收敛为：
  - 先写业务快照 side effect。
  - 再 append persisted event。
  - 最后 publish 到当前进程 `JobEventBus`。
- `GET /api/design-jobs/:id/stream` 改为聚合：
  - persisted events 初始 replay。
  - 当前进程 event bus 低延迟推送。
  - persisted events 短轮询兜底，支持 API 与 Redis worker 分进程部署。
- 生成任务支持部分失败：
  - runtime 正常返回 `variation_failed` 时，失败 variation 保持 failed。
  - 其它 variation 完成时，job 以 `completed` 收尾，并通过 `design.job_completed` 输出 completed/failed count。
  - runtime 抛错或提前结束时，仅将未进入 terminal 状态的 variation 标记失败，避免覆盖已完成成果。
- 新增 `designJobEvents.test.ts`：
  - 验证 producing event bus 消失后，SSE 仍可通过 persisted events replay。
  - 验证 1 个 completed + 1 个 failed variation 时 job 进入 completed，且 SSE 输出 failed count。
- `application-service/TODO.md` 将队列入队、SSE persisted/event bus 聚合、部分失败状态标记完成。

### 决策

- `design.job_completed` 是当前 SSE 终止事件，即便 job 快照状态为 `failed`，也会输出 completed/failed count 让客户端收口连接。
- MVP 暂不新增 `partial_completed` job status；部分失败由 job `completed` + `failedVariationCount > 0` 表达，避免扩大 domain enum 和前端状态面。
- 事件账本不是计费来源；计费仍以 immutable `usage_events` 为准。design events 用于 UI 进度恢复、worker 跨进程状态聚合和 runtime replay 排查。

## 2026-07-01 APP-M22.7 Queue Reliability Policy and Redis Degradation Coverage

### 已完成

- `RedisDesignJobQueue` 增加显式可靠性策略：
  - retry attempts：`DUDESIGN_QUEUE_ATTEMPTS`
  - fixed backoff：`DUDESIGN_QUEUE_BACKOFF_MS`
  - job timeout：`DUDESIGN_QUEUE_JOB_TIMEOUT_MS`
  - dedupe：使用 `idempotencyKey` 作为 BullMQ `jobId`
  - dead-letter：最终失败保留在 BullMQ failed set
- 新增 `createRedisQueueReliabilityPolicy()`，将 retry / timeout / DLQ 策略作为可单测的纯函数，避免无 Redis 环境下单元测试误开连接。
- Redis worker consumer 增加 timeout wrapper：
  - 超时抛出稳定 `QUEUE_JOB_TIMEOUT`。
  - BullMQ attempts/backoff 决定是否重试。
  - 耗尽重试后进入 failed set。
- `queueStateFromBullJob()` 增强：
  - timeout failure 归一为 `QUEUE_JOB_TIMEOUT`。
  - consumer failure 归一为 `QUEUE_CONSUMER_FAILED`。
  - attempts 对 pending/running/completed/failed 做稳定归一。
- `RedisDesignJobQueue` 增加 `getDeadLetterJobs()`，将 BullMQ failed set 暴露为 DUDesign `QueueJobState[]`，为后续 Admin repair/requeue 做准备。
- Redis opt-in integration smoke 补充：
  - runtime unavailable 时，通过 Redis worker 消费后业务 job / variation 明确进入 failed，variation `errorCode=RUNTIME_UNAVAILABLE`。
  - 业务可处理的 runtime unavailable 不进入 queue DLQ，避免把“业务失败”误判为“队列失败”。
  - synthetic queue consumer failure 进入 dead-letter view，验证真正队列消费异常可被运维发现。
- `application-service/TODO.md` 将 Redis/Queue 抽象、retry/dedupe/timeout/DLQ、Redis runtime unavailable 降级测试标记完成。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- `npm run test:redis`

### 决策

- DUDesign 区分两类失败：
  - runtime unavailable 属于业务执行失败：Application Service 将 job/variation 标记 failed，队列 job 本身可 completed。
  - queue consumer crash/timeout 属于队列执行失败：BullMQ failed set 作为 DLQ。
- 默认门禁仍不依赖真实 Redis；`DUDESIGN_REDIS_TEST_URL=... npm run test:redis` 用于 CI/staging 的真实 Redis smoke。

## 2026-06-30 APP-M22.6 Redis Queue Integration Smoke

### 已完成

- 新增 `redisDesignJobQueue.integration.test.ts`，作为真实 Redis opt-in integration smoke。
- 通过 `DUDESIGN_REDIS_TEST_URL` 控制是否启用；默认无 Redis 环境时自动 skip，不影响本地默认门禁。
- smoke 覆盖 API producer-only 与 worker consumer 分离链路：
  - producer `ApplicationService` 使用 `consumeQueue: false`，只负责创建 session / job 并入队。
  - worker `ApplicationService` 使用另一份 `RedisDesignJobQueue` 连接并消费同一个 queue。
  - 两个 service 共享 repository / artifact store，用于模拟生产 PostgreSQL + 对象存储共享事实源。
  - 验证 job 从 `queued` 推进到 `completed`，variation 完成，并生成 HTML artifact。
- `RedisDesignJobQueue` 增加 `obliterate()` 生命周期辅助方法，便于 integration smoke 清理测试队列。
- 新增脚本：
  - `npm --workspace @dudesign/api run test:redis`
  - `npm run test:redis`

### 验证

- 默认无 Redis 环境：
  - `npm --workspace @dudesign/api run test`
- 当前机器未安装 `redis-server` / `redis-cli`，真实 Redis smoke 已作为 opt-in 测试入口保留，未在本轮本机执行。

### 决策

- Redis smoke 暂不进入默认 `npm test`，避免开发机和 CI 在没有 Redis 服务时失败。
- 后续 CI / staging 可通过 `DUDESIGN_REDIS_TEST_URL=redis://... npm run test:redis` 显式开启。
- 下一阶段继续补 Redis queue runtime unavailable 降级与 retry/DLQ 策略。

## 2026-06-30 APP-M22.5 Design Job Worker Process Entrypoint

### 已完成

- 新增 `apps/api/src/worker.ts`，作为独立 design job worker process entrypoint。
- 新增 API workspace scripts：
  - `npm --workspace @dudesign/api run dev:worker`
  - `npm --workspace @dudesign/api run start:worker`
- 根 workspace 新增：
  - `npm run dev:worker`
  - `npm run start:worker`
- `ApplicationService` 新增 `consumeQueue` 构造选项：
  - 默认 `new ApplicationService()` 仍消费队列，保持本地/dev/test 行为不变。
  - factory 可传入 producer-only API 服务，避免生产 API 进程和 worker 进程同时抢任务。
- `createApplicationServiceFromEnv()` 支持 process role：
  - `api`：默认角色；Redis/BullMQ queue 下只入队不消费，InMemory queue 下继续 inline 消费。
  - `worker`：独立 worker 角色；绑定 queue consumer 并消费任务。
  - `inline`：显式单进程部署角色；API/worker 合并消费。
- 新增 `applicationProcessRoleFromEnv()` / `shouldConsumeQueue()`，支持：
  - `DUDESIGN_PROCESS_ROLE=worker|inline`
  - legacy alias：`DUDESIGN_SERVICE_ROLE`
- worker 进程启动后等待 queue ready，并监听 `SIGINT` / `SIGTERM`，关闭前 flush background tasks 和 queue connection。
- 补充 process role 单元测试，覆盖：
  - 默认 API role。
  - worker / inline env role。
  - API + InMemory 继续消费。
  - API + Redis producer-only。
  - worker / inline 始终消费。

### 决策

- 生产推荐部署为 API process + worker process：
  - API：`DUDESIGN_QUEUE=redis npm run start:api`
  - Worker：`DUDESIGN_QUEUE=redis DUDESIGN_PROCESS_ROLE=worker npm run start:worker`
- 本轮不强制 worker 只能搭配 Redis；InMemory worker 仍可启动，主要用于本地调试。
- Retry、timeout、DLQ、真实 Redis smoke 继续作为下一阶段队列可靠性任务。

## 2026-06-30 APP-M22.4 Redis/BullMQ Queue Adapter

### 已完成

- 新增 `RedisDesignJobQueue`，作为 `DesignJobQueue` 的 production adapter 初版。
- 接入 BullMQ，支持：
  - `enqueueDesignJob`
  - `enqueueRefineJob`
  - `cancelJob`
  - `getJobState`
  - `setConsumer`
  - `flush`
  - `close`
- 使用 `idempotencyKey` 作为 BullMQ `jobId`，保持跨进程生产者的幂等入队语义。
- 新增 `createRedisDesignJobQueueFromEnv()`：
  - `DUDESIGN_QUEUE=redis` 或 `DUDESIGN_QUEUE_PROVIDER=bullmq` 启用。
  - `REDIS_URL` / `DUDESIGN_REDIS_URL` 指定连接。
  - 预留 `DUDESIGN_QUEUE_NAME`、`DUDESIGN_QUEUE_PREFIX`、`DUDESIGN_QUEUE_CONCURRENCY`、`DUDESIGN_QUEUE_ATTEMPTS`、`DUDESIGN_QUEUE_BACKOFF_MS`。
- `createApplicationServiceFromEnv()` 增加 queue provider 选择；默认仍使用 `InMemoryDesignJobQueue`，保证 dev/test 无 Redis 依赖。
- 新增 BullMQ state 到 DUDesign `QueueJobState` 的归一化逻辑，避免业务层泄漏 BullMQ 内部状态。
- active job 取消采用保守语义：只有当前进程 worker 可取消时才返回 cancelled；跨进程 active job 返回 running + `QUEUE_CANCEL_UNAVAILABLE`。
- 补充 Redis adapter configuration 单元测试，覆盖：
  - BullMQ 状态映射。
  - job snapshot 归一化。
  - 默认 provider 仍为 InMemory。
  - Redis provider 缺少 Redis URL 时明确报错。
  - 跨进程 job name 稳定。

### 决策

- 本轮不让默认测试启动真实 Redis；真实 Redis integration smoke 下一阶段单独做 opt-in。
- Redis adapter 先承担 production queue contract，独立 worker process entrypoint 和 DLQ/retry 策略继续后置。
- BullMQ job name 固定为 `design_job` / `refine_job`，为未来独立 worker 进程和运维队列观察保持稳定。

## 2026-06-30 APP-M22.3 Queue Worker Handler Boundary

### 已完成

- 新增 `ApplicationDesignJobWorker`，作为 queue consumer 到业务处理器之间的 worker handler boundary。
- 新增 `attachDesignJobWorker()`，统一绑定 `DesignJobQueue` 和 queued job processor。
- `ApplicationService` 构造函数不再内联 `setConsumer` 回调，改为通过 worker handler 注册队列消费。
- 将 queued design/refine 处理方法显式暴露为 `processQueuedDesignJob()` / `processQueuedRefineJob()`，为后续独立 worker process 复用同一处理入口做准备。
- `InMemoryDesignJobQueue.setConsumer()` 支持消费 consumer 绑定前已经入队且仍处于 `queued` 的 job，更贴近后续 worker 启动后拉取积压任务的语义。
- 补充 worker handler 单元测试，覆盖：
  - design/refine payload 委托到 processor。
  - 先入队、后绑定 worker 时 pending job 可被消费。
  - 绑定 worker 前已取消的 job 不会被错误消费。

### 决策

- 本轮只拆 handler boundary，不引入 Redis/BullMQ，也不创建独立 worker 进程，避免提前增加部署依赖。
- production worker entrypoint 将在 `RedisDesignJobQueue` / BullMQ adapter 落地后推进。

## 2026-06-30 APP-M22 Queue Contract and InMemory Design Job Queue

### 已完成

- 新增 `DesignJobQueue` 接口：
  - `enqueueDesignJob`
  - `enqueueRefineJob`
  - `cancelJob`
  - `getJobState`
- 定义 queue payload schema：
  - `jobId`
  - `sessionId`
  - `variationIds`
  - `sourceArtifactId`
  - `runtimeSessionId`
  - `modelServiceId`
  - `idempotencyKey`
  - `userId`
  - `workspaceId`
  - `createdAt`
- 新增 `InMemoryDesignJobQueue`：
  - 按 `idempotencyKey` 去重。
  - 记录 queued / running / completed / failed / cancelled 状态。
  - 支持 `flush()`，用于测试和服务关闭前等待队列任务完成。
- `ApplicationService` 注入 queue，并注册 queue consumer。
- `POST /api/design-jobs` 创建 job/variations 后改为 `enqueueDesignJob()`。
- 队列 consumer 通过 `jobId/sessionId/variationIds` 从 Repository 反查 prompt、workspace、model、variation index，再调用原 runtime 执行链路。
- `refine` 仍保持同步执行；本轮只预留 `enqueueRefineJob` contract，避免破坏单变体编辑页交互。
- 补充 `InMemoryDesignJobQueue` 单元测试，覆盖幂等入队、消费、取消和状态查询。
- 修复前端 `annotationSummary` 缺失导致的全量 typecheck 阻断。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- `npm test`

### 决策

- MVP 当前先做 queue contract + InMemory queue，暂不上 Redis/BullMQ。
- design job 已进入队列边界；refine 异步化需要前端先支持 queued/running/refine status。
- 后续 Screenshot Worker、Runtime Worker、Retry/DLQ 可以复用同一 queue contract。

## 2026-06-29 APP-M21 Screenshot Artifact Rendering

### 已完成

- 新增 `screenshotRenderer`，基于 Playwright 为 HTML artifact 渲染 desktop / tablet / mobile PNG。
- HTML artifact 固化后异步生成 screenshot artifacts，避免截图耗时阻塞 job/refine 主状态机。
- screenshot artifact 使用 `parentArtifactId` 绑定来源 HTML artifact version，后续 refine 不会污染旧版本截图。
- variation 的 `screenshotArtifactId` 指向 desktop screenshot。
- `DesignJobSnapshotResponse` / `VariationDetailResponse` 暴露：
  - `screenshotUrl`
  - `screenshotDevice`
  - screenshot artifact `url`
  - artifact `parentArtifactId`
- 新增读取端点：`GET /api/variations/:id/screenshots/:artifactId`。
- 多文件 runtime artifact 截图前会把同版本 asset 内联成 data URL，保证 CSS/图片参与截图渲染。
- 截图生成失败不阻断主流程，错误落入 HTML artifact metadata，后续可接 Admin repair。
- `ApplicationService` 增加 background task tracking 和 `flushBackgroundTasks()`，避免测试/进程关闭时截断异步截图写入。
- source artifact 上传改为创建内部 source session，满足 PostgreSQL `artifacts.session_id` 外键约束。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm test`
- `npm --workspace @dudesign/web run build`
- 真实 PostgreSQL integration smoke：`DUDESIGN_POSTGRES_TEST_URL=... npm --workspace @dudesign/api run test`

### 决策

- MVP 先用进程内异步截图任务建立数据契约和 UI 路径。
- 后续 Redis/Queue 建好后，将截图生成迁移到 worker；API contract 和 artifact schema 不变。

## 2026-06-29 APP-M20 Artifact Snapshot Version Restore

### 已完成

- `VariationDetailResponse` 扩展 artifact snapshot 字段：
  - `kind`
  - `parentArtifactId`
  - `isCurrent`
  - `exportedFromArtifactId`
- `getVariationDetailSnapshot()` 从只返回 HTML artifact 升级为返回同 variation 下的 `html` / `asset` / `export_zip` artifact 列表。
- 新增 Repository mutation：`setVariationCurrentArtifact()`。
- 新增恢复历史版本接口：`POST /api/variations/:id/versions/:artifactId/restore`。
- restore 仅允许 HTML artifact，并更新 variation 当前 artifact 与 preview URL。
- restore 写入系统 session message，metadata 标记 `variation_restore`，便于后续审计和会话回放。
- export/share 继续基于当前 HTML artifact，历史 restore 后导出会回到被恢复的版本；已有 share 仍锁定原 artifact，不随 restore/refine 漂移。
- PostgreSQL Repository 增加 SQL-first `setVariationCurrentArtifact()`，真实 PostgreSQL smoke 覆盖 hydrate / no-hydrate 双路径。

### 验证

- `npm run typecheck`
- `npm test`
- `npm --workspace @dudesign/web run build`
- 真实 PostgreSQL integration smoke：`DUDESIGN_POSTGRES_TEST_URL=... npm --workspace @dudesign/api run test`

### 决策

- 当前只允许恢复 `html` artifact；`asset` 和 `export_zip` 作为版本上下文展示，不可设为 variation 当前预览入口。
- share token 保持 artifact-lock 语义；restore/refine 不会改变已生成分享链接指向的 artifact。
- 历史 preview URL 显式绑定 `artifactId` 暂不在本轮实现，下一步可和 screenshot/version preview 一起收口。

## 2026-06-29 APP API Variation Files Artifact Smoke

### 已完成

- `runApiFlowSmoke()` 增加 `GET /api/variations/:id/files?artifactId=...` 覆盖。
- Smoke 在 annotation 生成 v3 后分别读取：
  - v1 历史 artifact files
  - v3 当前 artifact files
- 验证历史 `index.html` 保持 version 1，不被当前 v3 artifact 或后续 share/refine 流程污染。
- 验证当前 v3 files 包含入口 HTML 与同版本 CSS code asset。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- `npm test`

### 决策

- `VariationFilesResponse` 只服务 Code view，因此继续过滤 SVG/图片等非代码 asset；图片类资源仍由 preview/share asset serving smoke 覆盖。

## 2026-06-28 Model Governance PostgreSQL and Runtime Context

### 已完成

- 确认 `Runtime unavailable` 降级测试已实现并通过；修正 application-service TODO 中 Phase APP-7 的残留未勾选项。
- 新增 `0004_model_governance.sql`，为 `model_services` 和 `user_model_access` 建立 PostgreSQL migration。
- `PostgresRepository` 增加 SQL-native 模型治理方法：
  - 用户可选模型列表与默认模型解析。
  - 模型服务基础查找和用户权限判定。
  - 管理端模型列表、启停、默认模型设置。
  - 用户级模型访问配置与 usage 聚合。
- PostgreSQL seed/hydrate 覆盖模型服务和用户模型访问映射。
- Postgres opt-in integration smoke 增加模型治理断言，覆盖 migration、hydrate、SQL query、default model 切换、用户禁用模型。
- `ApplicationService` 将 `modelServiceId/modelId/modelProvider` 从 create job 传入 Runtime Gateway；refine 会从 job 快照恢复同一模型上下文。
- admin retry 会保留原 job 的 `modelServiceId`，避免重试回落到当前默认模型。
- Runtime Gateway 的 generation/refine payload 增加模型上下文字段。
- BabeL-O runtime adapter 将模型上下文写入 Nexus agent metadata，并注入 prompt 的 Model selection 段；同时保留可选顶层 `modelId/modelProvider` 字段，为未来 BabeL-O per-agent model contract 做兼容入口。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 使用本机 `initdb/pg_ctl` 创建临时 PostgreSQL 数据目录。
  - 临时端口：`55432`。
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://127.0.0.1:55432/dudesign_test`。
  - 执行 `npm --workspace @dudesign/api run test` 通过。
  - 覆盖 shared API flow、no-hydrate API flow、PostgresRepository integration、model governance API。
  - 测试后已停止 PostgreSQL 并清理临时数据目录。

### 决策

- DUDesign 不通过全局 runtime config mutation 临时切换 BabeL-O 默认模型，避免 SaaS 并发下不同用户/任务互相串模型。
- 当前 BabeL-O `/v1/agents` contract 未正式声明 per-agent `modelId`；DUDesign 先以 metadata/prompt 透传并保留 adapter 字段，后续需要 BabeL-O 内核提供稳定的 per-request model contract 才能强制真实 provider 切换。

### 下一步

- 推进 BabeL-O runtime contract：正式定义 agent spawn/refine 的 `modelId/providerId` 字段及 contract test。
- 在 DUDesign 管理端继续补模型服务新增/编辑密钥引用、provider health 和用户 usage limit enforcement。
- 将用户侧模型选择与 job/detail 页面联动展示，便于回看每个 variation 使用的模型。

## 2026-06-28 Export Artifact Reuse

### 已完成

- Repository interface 新增 `getExportArtifactForSource()`。
- InMemoryStore 和 PostgresRepository 均支持按 `variationId + sourceArtifactId + export_zip` 查找已有导出 artifact。
- `ApplicationService.exportVariation()` 在同一 source artifact 重复导出时复用已有 `export_zip` artifact。
- `ExportVariationResponse.exportArtifact` 新增可选 `reused` 标记。
- BabeL-O runtime API flow 增加重复导出断言，确认第二次导出复用第一次的 artifact id 和 download url。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- 导出 artifact 绑定 source artifact version；同一 version 重复导出应复用，避免重复写 zip 和重复生成不必要用量。
- refine 生成新 source artifact version 后，后续导出仍会创建新的 export artifact，不影响版本可追溯性。

### 下一步

- 后续如 export zip 逻辑支持更多资产格式，继续保持 source artifact version 作为复用边界。

## 2026-06-26

### 已完成

- 确定后端业务服务层是 DUDesign 的业务事实来源。
- 确定用户、workspace、session、message、design_job、design_variation、artifact、share、memory_note 为首批核心模型。
- 确定 BabeL-O id 只能作为 `runtime_*` 外部引用。
- 确定业务服务层对前端输出 DUDesign 标准 API 和标准事件。
- 确定 runtime 不可用时，已完成 artifact 仍需可预览、导出、分享。
- 创建 `apps/api` 骨架。
- 创建 `@dudesign/domain`，沉淀用户、workspace、session、job、variation、artifact、share 等领域模型。
- 创建 `@dudesign/artifact-store`，定义 artifact 存储抽象接口。
- 创建 `@dudesign/contracts` 的 User API 基础请求/响应类型。

### 决策

- MVP 使用 hosted workspace，不接受本地 cwd。
- 业务服务层不 import BabeL-O 源码。
- User API 和 Admin API 权限边界分开。
- 队列 worker 归业务服务层治理，但调用 runtime 必须经过 Gateway。

### 风险

- 如果没有稳定状态机，job 和 variation 的部分失败会变得难以恢复。
- 如果 artifact 版本管理过弱，refine 后无法回滚和审计。

### 下一步

- 先设计数据库迁移草案。
- 先定义 job/variation 状态机，再写 API。
- 尽早实现 mock Runtime Gateway，支撑前后端并行开发。

## 2026-06-26 M1 Mock API

### 已完成

- 在 `apps/api` 实现 Node 原生 HTTP 服务。
- 新增 `InMemoryStore`，支持 dev user、dev workspace、sessions、messages、jobs、variations、artifacts。
- 新增 `JobEventBus`，支持按 job 缓冲和回放 DUDesign 标准事件。
- 实现 `POST /api/sessions`、`GET /api/sessions`、`POST /api/sessions/:id/resume`。
- 实现 `POST /api/design-jobs`、`GET /api/design-jobs/:id`、`GET /api/design-jobs/:id/stream`。
- 接入 `MockRuntimeGateway.spawnVariationAgents()`，可生成 3/6 个 mock variations。
- 实现 mock artifact 记录和 `GET /api/variations/:id/preview` HTML 预览。
- 验证 `npm run typecheck` 通过。

### 决策

- M1 阶段先使用 Node 原生 HTTP，避免过早绑定生产框架。
- 业务层通过 `MockRuntimeGateway` 驱动状态变化，而不是在 API handler 中硬编码假结果。
- SSE stream 支持事件 buffer 回放，便于页面刷新后恢复生成进度。

### 风险

- 当前 store 是进程内存，服务重启后数据丢失；这是 M1 可接受限制。
- 当前 mock runtime 同步完成很快，后续前端调试可能需要增加事件延迟来模拟真实流式生成。
- 当前尚未覆盖部分失败、取消、retry。

### 下一步

- 为 M1 API 增加 smoke script 或 node:test 集成测试。
- 增加 mock runtime 延迟配置，方便前端观察流式状态。
- 开始用户前端 mock 页面接入这些 API。

## 2026-06-26 M2 Refine API

### 已完成

- 新增 `GET /api/variations/:id`，返回 variation、job、currentArtifact 和 artifact versions。
- 新增 `POST /api/variations/:id/refine`。
- `InMemoryStore.createMockArtifact()` 支持按 variation 递增 version，并记录 parent artifact。
- mock preview HTML 显示当前 artifact version。
- refine smoke 通过：variation 从 artifact v1 生成 v2，预览显示 version 2。

### 下一步

- 将 refine 事件也纳入独立 variation stream 或 job stream 回放策略。
- 增加部分失败和 retry 测试。
- 增加 node:test smoke，避免靠手动 curl 验证。

## 2026-06-26 M3 Annotation API

### 已完成

- 新增 `POST /api/variations/:id/annotations`。
- 新增内存版 `annotationBatches`。
- annotation payload 会被转换成 normalized-coordinate prompt suffix。
- annotation 提交后复用 `refineVariation()` 生成新 artifact version。
- API smoke 通过：提交 rectangle annotation 后 artifact 从 v1 变为 v2，并返回 annotationBatch。

### 下一步

- 增加 annotation schema validation。
- 后续接真实 BabeL-O 时，将 annotation prompt suffix 和当前 artifact 一起注入 runtime context。

## 2026-06-26 M4 API Smoke Regression

### 已完成

- 将 `apps/api/src/server.ts` 拆成 `createApiServer()` 和 `startApiServer()`，避免导入模块时自动监听端口，支持测试环境注入独立 `ApplicationService`。
- 修复已完成 job 的 SSE replay 行为：如果 buffer 中已经存在 `design.job_completed`，回放后立即结束连接。
- 新增 `apps/api/src/mock-flow.test.ts`，覆盖 dev bootstrap、session 创建、3 variation 生成、SSE replay、variation detail、refine、annotation refine、preview HTML。
- 新增根脚本 `npm run test:api` 和 `npm test`。
- 修复 `MockRuntimeGateway` refine artifact id 固定导致同一 variation 第二次 refine 无法递增 artifact version 的问题；mock artifact id 现在带 `jobId` 和递增序列。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`

### 下一步

- 为 annotation payload 增加更严格的 runtime schema validation。
- 增加权限隔离测试，确保 workspace/session/variation 不能跨用户访问。
- 将 API smoke 扩展到 share/export 接口落地后的只读访问链路。

## 2026-06-26 M5 Export and Share API

### 已完成

- 新增 `POST /api/variations/:id/export`，返回当前 mock HTML artifact 内容、版本和下载文件名。
- 新增 `POST /api/variations/:id/share`，创建内存版 share token。
- 新增 `GET /api/shares/:token`，返回只读分享页需要的 variation、artifact、share 信息。
- `InMemoryStore` 增加 `shares` map、`createShare()` 和 `getShareByToken()`。
- API smoke 扩展到 export/share/share detail。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/web run build`
- 本地 HTTP 验证 export/share/share detail 通过。

### 下一步

- 将 export 从单 HTML mock 升级为 zip artifact。
- 将 share token 持久化并支持 revoke、expiresAt、owner 权限校验。
- 分享接口后续应固定 artifact version，避免 share 创建后继续 refine 导致只读页内容漂移。

## 2026-06-26 M6 User Context and Ownership Guard

### 当前情况分析

- 后端业务服务层已推进到 M5，核心 mock 闭环、refine、annotation、export/share 和 smoke regression 已经完成。
- 剩余关键地基是权限隔离、request id、Admin API/审计、runtime unavailable 降级、队列抽象。
- 本轮优先处理权限隔离和 request id，因为它们会影响后续 PostgreSQL、真实登录、Admin API 和管理端治理。

### 已完成

- 新增 `RequestContext` 和 `createRequestContext()`。
- API 从 `x-dudesign-user-id` 解析当前用户，默认仍为 `usr_dev`，便于本地开发。
- API 从 `x-request-id` 解析 request id；没有传入时自动生成 `req_*`。
- 所有响应写入 `x-request-id` header。
- `InMemoryStore` 新增第二个种子用户 `usr_alt` 和工作区 `ws_alt`，用于隔离测试。
- `ApplicationService` 增加用户、workspace、session、job、variation 访问校验。
- session、job、variation、preview、refine、annotation、export、share 均接入 owner guard。
- artifact 创建不再默认写入 dev workspace，而是从 job/variation 反查真实 workspace。
- API smoke 增加：
  - request id 回传断言。
  - `usr_alt` 访问 `usr_dev` job 返回 `JOB_FORBIDDEN`。
  - `usr_alt` bootstrap 返回 `ws_alt`。
  - `usr_alt` session 列表不包含 `usr_dev` 数据。

### 验证

- `npm test`

### 决策

- M1/M2 阶段先使用 header-based dev user context，不引入真实 auth provider。
- 权限校验放在 Application Service 层，而不是只在 HTTP handler 做。

### 下一步

- 增加 share token 权限测试，明确 public/private/password 的 MVP 行为。
- 增加 request log / audit log 基础结构，为管理端操作做准备。
- 设计 PostgreSQL migration 草案，把当前内存模型映射到持久化表。

## 2026-06-26 M7 Admin API and Audit Log

### 已完成

- `RequestContext` 增加 `adminRole`，从 `x-dudesign-admin-role` 解析，支持 `support`、`operator`、`developer`。
- `InMemoryStore` 增加 `auditLogs`、`createAuditLog()`、`listAuditLogs()`。
- 新增 `GET /api/admin/runtime/health`：
  - `support`、`operator`、`developer` 可访问。
  - 返回 Runtime Gateway health 和 contract。
- 新增 `POST /api/admin/jobs/:id/cancel`：
  - 仅 `operator`、`developer` 可访问。
  - 调用 `RuntimeGateway.cancelRuntimeJob()`。
  - 将 job 和未完成 variation 标记为 `cancelled`。
  - 写入 audit log。
- 新增 `GET /api/admin/audit-logs`：
  - 仅 `operator`、`developer` 可访问。
- API smoke 增加：
  - support 可读 runtime health。
  - support 不能 cancel job。
  - operator 可以 cancel queued job。
  - cancel 操作写入 audit log。

### 验证

- `npm test`

### 决策

- M1 管理端权限继续使用 header-based role，后续真实 auth 接入时替换来源，不改变 service 权限边界。
- 管理操作必须经过 Application Service 并写 audit log，不允许管理端绕过业务层。

### 下一步

- 实现 job retry。
- 增加 cost 聚合 Admin API。
- 设计 audit log PostgreSQL 表结构。

## 2026-06-26 M8 Job Retry and Cost Aggregation

### 已完成

- 新增 `GET /api/admin/costs/summary`：
  - `support`、`operator`、`developer` 可访问。
  - 返回全局 job/variation/token/cost 汇总。
  - 返回按 user 聚合的 job/variation/token/cost 统计。
- 新增 `POST /api/admin/jobs/:id/retry`：
  - 仅 `operator`、`developer` 可访问。
  - 基于原 job 的 session、prompt、sourceMode、variationCount、templateRequirements 创建新 job。
  - 复用现有 `createDesignJob()` 流程，确保 retry 仍通过业务服务层和 Runtime Gateway。
  - 写入 `job.retry` audit log，记录原 job 和新 job id。
- API smoke 增加：
  - support 可读取 cost summary。
  - operator 可 retry completed job。
  - retry 生成的新 job 与原 job id 不同，variationCount 一致。
  - retry audit log 记录 `retriedJobId`。

### 验证

- `npm test`

### 决策

- 当前 cost summary 统计的是“当前 variation 快照成本”，不是完整历史账单流水；后续如果需要计费，需要新增 immutable usage events。
- retry 不原地复用旧 job，而是创建新 job，旧 job 保持可审计。

### 下一步

- 设计 immutable usage event / billing event 模型，避免 refine 覆盖 variation 成本导致历史用量不可追溯。
- 设计 PostgreSQL migration 草案，包括 audit log、usage events、shares 固定 artifact version。

## 2026-06-26 M9 Browser CORS Preflight

### 已完成

- 在 UX-M1 真实浏览器 E2E 中发现用户前端跨端口调用 API 时出现 `Failed to fetch`。
- 根因是 `application/json` POST 触发浏览器 CORS preflight，而 API server 没有处理 `OPTIONS`。
- API server 已新增 `OPTIONS` preflight 响应。
- JSON/HTML 响应已补充 `access-control-allow-methods` 和 `access-control-allow-headers`。

### 验证

- `npm run test:ux:e2e`
- `npm test`
- `npm --workspace @dudesign/web run build`

### 下一步

- 后续接入真实鉴权后，CORS 需要从通配 `*` 收敛为环境配置的允许 origin。

## 2026-06-26 M10 API Test Build Freshness

### 已完成

- API workspace 的 `test` 脚本改为 `tsc -b && node --test dist/*.test.js`。
- 根 `test:api` 改为直接调用 API workspace test，避免旧 `dist` 影响单独运行测试。

### 验证

- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

## 2026-06-26 M11 Annotation Prompt Contract

### 已完成

- 将 annotation prompt suffix 生成逻辑从 `ApplicationService` 提取为 `annotationPrompt.ts`。
- 新增 `annotationPrompt.test.ts`，锁定 rect/text 归一化坐标序列化格式。
- `annotateVariation()` 继续通过同一函数生成 prompt suffix，保证浏览器标注和 API smoke 使用同一个契约。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm test`
- `npm run test:ux:e2e`
- `npm --workspace @dudesign/web run build`

## 2026-06-26 M10 Immutable Usage Events and Schema Draft

### 已完成

- 新增 `UsageEvent` 领域模型，覆盖 `variation.completed`、`variation.refined`、`export.created`、`share.created`。
- `InMemoryStore` 新增 usage event 写入与查询能力。
- variation 生成完成、refine 完成、HTML export、share 创建都会写入不可变 usage event。
- `GET /api/admin/costs/summary` 从“当前 variation 快照成本”切换为“usage event 账本聚合”。
- 管理端 cost summary 类型和展示文案同步切换为 usage events。
- API smoke 增加 usage event count 断言，确保 generation/refine/export/share 都进入账本。
- 新增 `docs/modules/application-service/database-schema.md`，沉淀 PostgreSQL 表草案、索引、迁移顺序和 Repository 切分建议。

### 验证

- `npm test`

### 决策

- variation 上的 token/cost 字段继续保留为 UX 快照，方便结果墙和管理端快速展示。
- 成本统计、后续计费和额度扣减只使用 immutable usage events。
- PostgreSQL 迁移前先抽象 Repository 接口，保留 `InMemoryStore` 作为测试 fake。

### 下一步

- 为 usage event 增加幂等键，避免 runtime event replay 或服务重试导致重复计费。
- 抽象 `ApplicationRepository`，把当前 `InMemoryStore` 从 `ApplicationService` 中剥离。
- 选择 SQL-first migration 工具，并开始落地 PostgreSQL repository。

## 2026-06-26 M11 LocalArtifactStore

### 已完成

- 在 `@dudesign/artifact-store` 实现 `LocalArtifactStore`。
- 支持 `put()`、`get()`、`getSignedReadUrl()`、`delete()`。
- 本地存储会写入 artifact body 和旁路 metadata JSON，记录 content type、metadata、sha256 hash、size。
- 增加 storage key 规范化和路径逃逸防护，避免 `../` 写出 artifact root。
- API 服务接入 `ArtifactStore`：
  - 默认 artifact root 为 `.dudesign/artifacts`，可通过 `DUDESIGN_ARTIFACT_ROOT` 覆盖。
  - mock variation 生成/refine 时，业务 store 创建 artifact metadata，`LocalArtifactStore` 写入 HTML body。
  - preview、export、share detail 改为从 artifact store 读取 HTML，而不是临时拼接。
- 根测试链路新增 `test:artifact-store`，并在 `npm test` 中先执行。
- `.gitignore` 增加 `.dudesign/`，避免本地 artifact 输出进入版本控制。

### 验证

- `npm test`

### 决策

- 当前阶段保持“业务 metadata 在 Application Service store，artifact body 在 ArtifactStore”边界。
- `LocalArtifactStore` 是 dev/MVP 实现，后续 S3/R2/OSS 实现应复用相同 `ArtifactStore` 接口。
- preview/export/share 都读取同一个 artifact body，保证分享固定 artifact version 时内容不漂移。

### 下一步

- 为 `ArtifactStore` 增加 `copy()` 或 `putMany()`，支撑 export zip 和多文件 HTML 产物。
- 增加 artifact content type 校验与最大文件大小限制。
- 开始设计 S3-compatible ArtifactStore，作为线上部署实现。

## 2026-06-26 M12 Export Zip and Share Controls

### 已完成

- `POST /api/variations/:id/export` 保持原 HTML 返回兼容，同时新增 `exportArtifact`。
- 导出时创建 `export_zip` artifact metadata，并将 mock zip body 写入 `ArtifactStore`。
- `Share` 领域模型新增 `revokedAt`。
- 新增 `POST /api/shares/:token/revoke`：
  - 仅 share owner 可撤销。
  - 撤销后公开读取返回 `SHARE_REVOKED`。
- `GET /api/shares/:token` 增加：
  - revoked 检查。
  - expired 检查。
  - MVP 阶段 `private` / `password` share 公开读取返回 `SHARE_FORBIDDEN`。
- API smoke 覆盖：
  - export zip artifact metadata。
  - share detail 固定 artifact HTML。
  - expired share。
  - private/password share forbidden。
  - 非 owner revoke forbidden。
  - owner revoke 后链接不可读。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- `export_zip` 目前是 mock package body，不是真正 ZIP 二进制；但已经打通 artifact kind、storage、metadata 和 API contract。
- 第一版 MVP 的 private/password share 不做公开鉴权 UI，先返回明确禁止状态，后续由真实登录和 password flow 接管。
- share revoke 是业务状态，不删除 artifact body，保证审计和 owner 历史可恢复。

### 下一步

- 将 mock zip 替换为真实 ZIP 生成。
- 为 share revoke 写入 audit log。
- 为 share 增加 password hash 和一次性访问校验流程。

## 2026-06-26 M13 Share Drift Regression

### 已完成

- API smoke 增加 share 不漂移回归：
  - 创建 public share 时固定 artifact v3。
  - share 创建后继续 refine 当前 variation 到 v4。
  - variation preview 显示 v4。
  - 原 share detail 仍返回创建时 artifact id、artifact v3 和 v3 HTML。
- 调整 admin artifact smoke 断言，不再假设后续 share 都绑定同一个 artifact version。

### 验证

- `npm run typecheck`
- `npm test`

### 决策

- share 的事实来源是 `shares.artifactId`，不是 variation 当前 `previewUrl`。
- admin artifact explorer 的 `shareCount` 是每个 artifact version 的引用数，不能用 variation 总分享数做断言。

## 2026-06-26 M14 Repository Contract and PostgreSQL Baseline

### 已完成

- 新增 `ApplicationRepository` 接口，明确业务服务层需要的 repository surface。
- `InMemoryStore` 改为实现 `ApplicationRepository`，继续作为测试/dev fake。
- `ApplicationService` 构造参数从 `InMemoryStore` 收敛为 `ApplicationRepository`。
- `apps/api/src/index.ts` 导出 `ApplicationRepository` 类型。
- 新增 SQL-first PostgreSQL baseline migration：
  - `apps/api/db/migrations/0001_initial_schema.sql`
  - 覆盖 users、workspaces、workspace_members、design_sessions、session_messages、design_jobs、design_variations、artifacts、annotation_batches、shares、usage_events、audit_logs。
  - 包含关键 check constraints、外键、唯一约束和查询索引。

### 验证

- `npm run typecheck`

### 决策

- 本阶段只做 repository contract 与 migration baseline，不引入 PostgreSQL runtime dependency。
- `ApplicationService` 仍可直接访问 repository maps，作为从内存实现迁移到 repository method 的过渡形态。
- 后续 PostgreSQL repository 应先跑与 `InMemoryStore` 相同 API smoke，再替换生产 wiring。

### 下一步

- 把 `ApplicationService` 中直接遍历 Map 的查询逐步下沉到 repository methods。
- 增加 usage event 幂等键和唯一约束。
- 选择 migration runner，并实现 PostgreSQL repository 的连接、事务和 seed bootstrap。

## 2026-06-26 M15 PostgreSQL Repository Bootstrap

### 已完成

- 新增 `PostgresRepository` 初版。
- 支持：
  - `pg` connection pool。
  - `schema_migrations` 表。
  - 按文件顺序执行 SQL migrations。
  - seed 默认 dev/alt user 和 workspace。
  - 从 PostgreSQL hydrate users、workspaces、sessions、messages、jobs、variations、artifacts、shares、annotation_batches、usage_events、audit_logs 到 repository maps。
  - 对 session/message/job/variation/artifact/share/annotation/usage/audit 写操作做 write-through 持久化。
- 新增 `createApplicationServiceFromEnv()`：
  - 默认使用内存 repository。
  - `DUDESIGN_REPOSITORY=postgres` 时要求 `DATABASE_URL` 并启用 `PostgresRepository`。
- `startApiServer()` 改为 async，生产启动会通过 env factory 创建 service。
- API 包新增 `migrate:postgres` 脚本。

### 验证

- `npm run typecheck`

### 决策

- 当前 `PostgresRepository` 是过渡实现：启动时 hydrate 到 Map，写操作 write-through 到 PostgreSQL。
- 这样可以在不大规模重写同步 `ApplicationService` 的前提下，先验证迁移、seed、hydration 和持久化路径。
- 后续正式生产形态应让 PostgreSQL 成为 async source-of-truth，并把 service 中的直接 Map 查询下沉为 repository query methods。

### 下一步

- 用本地 PostgreSQL 跑一条独立 integration smoke，验证重启后 session/job/artifact/share 可恢复。
- 增加 migration runner 测试或 dry-run 校验。
- 逐步替换 `ApplicationService` 中的直接 Map 遍历。

## 2026-06-27 M16 PostgreSQL Integration Smoke

### 已完成

- 新增 `apps/api/src/postgresRepository.test.ts`。
- 使用 `DUDESIGN_POSTGRES_TEST_URL` 作为 opt-in integration test 开关；未配置时自动 skip，不阻塞默认本地测试。
- 测试每次创建独立 PostgreSQL schema，并在结束时 drop schema，避免污染开发库。
- baseline migration 的后置 artifact 外键约束改为幂等 `do` block。
- 真实 PostgreSQL 验证中发现 `close()` 被重复调用时会触发 `Called end on pool more than once`，已修复为幂等 close。
- `PostgresRepository.connect()` 支持 `schema` 参数：
  - 自动创建 schema。
  - 通过 `search_path` 将 migrations、seed、hydrate、write-through 限定到该 schema。
- `PostgresRepository` 增加串行 write queue 和 `flush()`：
  - 保证 session -> job -> variation -> artifact 等外键写入顺序稳定。
  - integration smoke 可以在 close/hydrate 前等待 write-through 全部完成。
- integration smoke 覆盖：
  - migrations + seed。
  - session runtime id 持久化。
  - message/job/variation/artifact/share/usage event 写入。
  - 关闭 repository 后重新 connect + hydrate。
  - session snapshot 恢复。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- 真实 PostgreSQL smoke：
  - 使用 Homebrew PostgreSQL 16 临时数据目录。
  - 临时端口：`55432`。
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`。
  - 执行 `npm --workspace @dudesign/api run test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 使用方式

```bash
DUDESIGN_POSTGRES_TEST_URL=postgres://user:pass@localhost:5432/dudesign_test npm --workspace @dudesign/api run test
```

### 下一步

- 后续把 service 查询逐步下沉到 repository query methods。

## 2026-06-27 M17 Repository Query Methods Baseline

### 已完成

- 将 Admin 查询从 `ApplicationService` 下沉到 `ApplicationRepository` 契约：
  - `listAdminJobs()`
  - `listAdminArtifacts()`
  - `getAdminUserSupport()`
  - `getAdminCostSummary()`
- 为 Admin 查询定义明确 DTO 类型，避免服务层和未来 PostgreSQL SQL-native 实现之间用弱类型传递。
- `InMemoryStore` 实现上述 query methods；`PostgresRepository` 当前通过 hydrate 后的统一 repository 查询路径复用该实现。
- `ApplicationService` 保留鉴权与入口编排，不再直接承载 Admin jobs/artifacts/support/cost 的 Map 聚合逻辑。
- PostgreSQL integration smoke 扩展覆盖：
  - Admin jobs summary。
  - Admin artifacts summary。
  - Admin support user/session summary。
  - Admin cost summary。
- baseline migration 的 artifact 后置外键 guard 增加 schema 限定，避免多 schema 测试或未来隔离 schema 中同名 constraint 互相影响。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- M17 先完成 repository query methods 的契约边界，不立刻把 Admin 查询改写为 PostgreSQL 原生 SQL。
- 当前 `PostgresRepository` 仍是 hydrated/write-through 过渡形态；等 service 直接 Map 读取进一步收敛后，再逐步将高频查询替换为 SQL-native methods。

### 下一步

- 继续把 session/job/detail/share 等非 Admin 读取路径下沉到 repository methods。
- 为 `PostgresRepository` 增加 SQL-native Admin query methods，优先覆盖 jobs/artifacts/cost summary。
- 增加同一套 API smoke 对 InMemoryStore 与 PostgresRepository 的双实现测试。

## 2026-06-27 M18 User-facing Repository Read Models

### 已完成

- 新增用户侧读模型 repository methods：
  - `getVariationDetailSnapshot()`
  - `getCurrentVariationArtifactSnapshot()`
  - `getSharedVariationSnapshot()`
- `InMemoryStore` 实现上述 snapshot 查询。
- `ApplicationService` 的用户侧 variation/share/export 读取路径改为消费 repository snapshots：
  - `GET /api/variations/:id`
  - `POST /api/variations/:id/export`
  - `POST /api/variations/:id/share`
  - `GET /api/shares/:token`
- 保持 API 响应结构、权限校验和错误码语义不变。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api test`

### 决策

- snapshot methods 暂时仍在 hydrated repository 数据上实现，主要目标是先切断 `ApplicationService` 对 Map 聚合结构的直接依赖。
- 后续 `PostgresRepository` 可以优先把这些 snapshot methods 改写为 SQL join 查询，而无需改动 service 层。

### 下一步

- 将 session/workspace/job/variation/artifact 的基础查找和权限上下文继续下沉到 repository methods。
- 为 `getVariationDetailSnapshot()` 和 `getSharedVariationSnapshot()` 增加 PostgreSQL SQL-native 实现。

## 2026-06-27 M19 Repository Lookup Contexts

### 已完成

- 新增基础 lookup/context repository methods：
  - `getUserById()`
  - `getWorkspaceById()`
  - `getPrimaryWorkspaceForUser()`
  - `getSessionById()`
  - `getJobById()`
  - `getVariationById()`
  - `getArtifactById()`
  - `getSessionWorkspaceContext()`
  - `getVariationJobContext()`
  - `getVariationRefineContext()`
  - `getVariationArtifactContext()`
  - `getRuntimeSessionContext()`
- `ApplicationService` 中对 repository 内部 Map 的直接读取已清零。
- 替换范围覆盖：
  - bootstrap workspace 查询。
  - session 创建和恢复。
  - design job 创建。
  - variation refine/annotation/preview。
  - export usage metadata。
  - admin cancel/retry。
  - 权限 helper。
  - mock runtime spawn memory namespace。
  - runtime event side effects。
  - artifact body 写入。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- M19 先完成 service 到 repository 的读边界治理，仍保持 `PostgresRepository` hydrated/write-through 过渡形态。
- 后续 SQL-native 化可以逐个覆盖这些 context methods，不再需要修改 service 层调用点。

### 下一步

- 为高频读模型增加 `PostgresRepository` SQL-native 实现：
  - Admin jobs/artifacts/cost summary。
  - Variation detail/current artifact/shared variation snapshots。
  - Session workspace/refine/runtime contexts。
- 增加同一套 API smoke 对 InMemoryStore 与 PostgresRepository 的双实现测试。

## 2026-06-27 M20 PostgreSQL SQL-native Query Methods

### 已完成

- Repository 读模型契约支持 `MaybePromise`，为 PostgreSQL async SQL-native queries 打开接口空间。
- `ApplicationService` 和 API server 对以下读路径改为 await：
  - Admin jobs/artifacts/support/cost。
  - Variation detail。
  - Current variation artifact。
  - Share variation。
  - Shared variation。
- `PostgresRepository` 新增 SQL-native query methods：
  - `getVariationDetailSnapshot()`
  - `getCurrentVariationArtifactSnapshot()`
  - `getSharedVariationSnapshot()`
  - `listAdminJobs()`
  - `listAdminArtifacts()`
  - `getAdminUserSupport()`
  - `getAdminCostSummary()`
- PostgreSQL integration smoke 增强：
  - hydrate 后先验证 cache 可恢复。
  - 随后清空 hydrated cache。
  - 再调用 SQL-native methods，确保这些查询真实来自 PostgreSQL，而不是继承的内存 Map。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 第一批 SQL-native 查询优先覆盖管理端聚合和用户侧 variation/share 快照，因为这些路径最容易受数据量影响，也最适合用 SQL join/aggregate 表达。
- `getAdminUserSupport()` 暂时采用少量分步 SQL 查询，保持实现清晰；后续可以根据性能再合并为更复杂的聚合 SQL。

### 下一步

- 为 session/job snapshot 与 context methods 增加 SQL-native 实现。
- 建立 API smoke 双实现测试：同一套服务流程分别跑 InMemoryStore 和 PostgresRepository。
- 逐步减少 `PostgresRepository` 对 startup hydrate 的生产依赖。

## 2026-06-27 M21 PostgreSQL SQL-native Session/Job Contexts

### 已完成

- Repository session/job/context 读模型契约支持 `MaybePromise`。
- `ApplicationService` 和 API server 对 job/session/context 读路径改为 await：
  - `resumeSession()`
  - `createDesignJob()`
  - `getDesignJob()`
  - `cancelJobAsAdmin()`
  - `runMockJob()`
  - runtime event side effects。
- `PostgresRepository` 新增 SQL-native methods：
  - `getSessionSnapshot()`
  - `getJobSnapshot()`
  - `getSessionWorkspaceContext()`
  - `getVariationJobContext()`
  - `getVariationRefineContext()`
  - `getVariationArtifactContext()`
  - `getRuntimeSessionContext()`
- PostgreSQL integration smoke 扩展为清空 hydrated cache 后继续验证 session/job/context SQL-native 查询。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- `PostgresRepository` 的核心读模型已基本具备 SQL-native 能力；startup hydrate 仍保留作为过渡和 fallback，但 service 层已经不需要知道 Map 存在。

### 下一步

- 建立同一套 API smoke 双实现测试：InMemoryStore + PostgresRepository。
- 将 `ApplicationService` 的基础 `getUserById/getWorkspaceById/...` 权限查找继续评估是否需要 SQL-native override。
- 梳理生产模式下是否可以关闭 startup hydrate 或改为按需 warm cache。

## 2026-06-27 M22 Dual Repository API Smoke

### 已完成

- 将 API 主链路 smoke 抽成可复用 helper：
  - `apiFlowSmoke.ts`
  - `startApiFlowHarness()`
  - `runApiFlowSmoke()`
- 默认内存实现继续通过 `mock-flow.test.ts` 跑同一套 API flow。
- 新增 `postgres-api-flow.test.ts`：
  - 使用 `DUDESIGN_POSTGRES_TEST_URL` opt-in。
  - 每次创建独立 schema。
  - 用 `PostgresRepository` 注入 `ApplicationService`。
  - 复用同一套 HTTP API flow。
- API flow 不再直接写 `service.store` 创建测试数据，避免测试绑定具体 repository 内部结构。
- admin cancel smoke 对运行速度导致的 200/409 竞态做了稳定处理：
  - 支持及时取消成功。
  - 也支持 job 已完成后的 `JOB_NOT_CANCELLABLE`。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 双实现 smoke 使用同一套 HTTP 级 API flow，而不是复制断言，避免 InMemoryStore 与 PostgresRepository 后续行为漂移。
- PostgreSQL flow 仍保持 opt-in，不进入默认无外部服务门禁。

### 下一步

- 为 `PostgresRepository` 的基础 permission lookup methods 评估是否补 SQL-native override。
- 设计从 hydrated/write-through 到 async source-of-truth 的拆分步骤。
- 增加 usage event 幂等键，避免 runtime event replay 重复计费。

## 2026-06-27 M23 PostgreSQL SQL-native Permission And Share Lookups

### 已完成

- 将 `ApplicationRepository` 基础读取契约放宽为 `MaybePromise`：
  - `getUserById()`
  - `getWorkspaceById()`
  - `getPrimaryWorkspaceForUser()`
  - `getSessionById()`
  - `getJobById()`
  - `getVariationById()`
  - `getArtifactById()`
  - `listSessions()`
  - `getShareByToken()`
  - `revokeShare()`
- `ApplicationService` 权限 guard 异步化：
  - user/workspace/session/job/variation access checks。
  - admin role checks。
  - share revoke owner check。
- API server 对异步服务方法补齐 `await`：
  - `/api/dev/bootstrap`
  - `/api/sessions`
  - `/api/admin/audit-logs`
  - `/api/shares/:token/revoke`
- `PostgresRepository` 新增 SQL-native 基础 lookup：
  - user/workspace/primary workspace/session/job/variation/artifact/share。
  - session list。
  - share revoke。
- PostgreSQL integration smoke 在清空 hydrated cache 后继续验证：
  - 基础实体 lookup 不依赖内存 Map。
  - `listSessions()` 不依赖内存 Map。
  - `getShareByToken()` 和 `revokeShare()` 不依赖内存 Map。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- 读路径继续向 SQL source-of-truth 收敛；`PostgresRepository` 仍继承 `InMemoryStore` 以复用 mutation 逻辑，但业务服务不再要求基础 lookup 同步返回。
- startup hydrate 暂时保留，作为从 write-through 迁移到 SQL-first mutation 前的过渡机制。

### 下一步

- 将 PostgreSQL 写入路径拆成 SQL-first mutation methods，逐步减少对 `super.*` mutation 的依赖。
- 为 usage event 增加幂等键，避免 runtime event replay 或重试造成重复计费。
- 评估生产模式是否可以关闭 startup hydrate，或改成仅用于 dev/test 的 warm cache。

## 2026-06-27 M24 PostgreSQL SQL-first Mainline Mutations

### 已完成

- 将 `ApplicationRepository` 主链路 mutation 契约放宽为 `MaybePromise`：
  - `createSession()`
  - `saveSession()`
  - `appendMessage()`
  - `createJob()`
  - `createVariations()`
  - `setJobStatus()`
  - `applyVariationEvent()`
- `ApplicationService` 对上述 mutation 调用补齐 `await`，让 InMemoryStore 与 PostgresRepository 共用同一套服务层代码。
- `PostgresRepository` 主链路 mutation 改为 SQL-first：
  - 先构造领域对象。
  - 先写 PostgreSQL。
  - 写入成功后同步 hydrated cache 作为过渡。
- 保留 `writeTail` 串行队列，并新增 `withWrite()`，用于 create job 这类多表写入的顺序一致性。
- 修正 `getSessionWorkspaceContext()` 和 `getRuntimeSessionContext()` 的 SQL alias：
  - 不再让 `workspaces.mode = hosted` 覆盖 `design_sessions.mode = new_html/from_existing_html`。
  - 避免 SQL-first `createJob()` 回写 session 时触发 session mode check constraint。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- mutation 合约进入 async-ready 状态，后续 repository 可以继续把写入移动到 SQL source-of-truth，而不需要再次大改服务层调用方式。
- 本轮只拆 session/message/job/variation 主链路写入，artifact/share/annotation/usage/audit 仍保留 write-through 过渡，避免一次性扩大风险面。

### 下一步

- 将 artifact 写入改为 SQL-first，重点处理版本号生成和 `(variation_id, kind, version)` 唯一约束冲突。
- 将 usage event 增加幂等键并改为 SQL-first，避免 runtime replay 重复计费。
- 最后处理 share/annotation/audit 的 SQL-first 写入，并评估关闭 startup hydrate。

## 2026-06-27 M25 PostgreSQL SQL-first Artifact Mutations

### 已完成

- 将 artifact mutation 契约放宽为 `MaybePromise`：
  - `createMockArtifact()`
  - `createArtifact()`
  - `saveArtifact()`
- `ApplicationService` 对 artifact 创建和保存补齐 `await`：
  - preview-ready artifact。
  - completed/refine artifact。
  - LocalArtifactStore 写入后的 artifact metadata 回存。
  - export zip artifact 创建。
- `PostgresRepository` artifact 写入改为 SQL-first：
  - `createMockArtifact()` 通过 PostgreSQL 查询当前 variation/html 最大版本号后生成下一版本。
  - `createArtifact()` 先构造 artifact，再写入 PostgreSQL，最后同步 cache。
  - `saveArtifact()` 先写 PostgreSQL，再同步 cache。
- 保留 `(variation_id, kind, version)` 唯一约束作为最终保护，API smoke 已覆盖 version 1 到 version 4 的连续生成和分享不漂移。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- artifact 版本号由 SQL source-of-truth 生成，避免 hydrated cache 缺失时重复从 v1 开始。
- 本轮仍不处理 share/annotation/usage/audit mutation；这些会在后续拆分，usage event 需要先补幂等键。

### 下一步

- 优先为 usage event 设计并落地幂等键，再改为 SQL-first 写入。
- 继续将 share/annotation/audit 写入拆为 SQL-first。
- 最后评估关闭 startup hydrate 或改成 dev/test warm cache。

## 2026-06-27 M26 Usage Event Idempotency And SQL-first Write

### 已完成

- 为 `UsageEvent` 增加 `idempotencyKey` 领域字段。
- 新增 migration：
  - `0002_usage_event_idempotency.sql`
  - `usage_events.idempotency_key`
  - `usage_events_idempotency_key_idx` unique index。
  - 旧数据用 `id` 回填，确保迁移兼容。
- `ApplicationService` 为 usage 写入生成稳定幂等键：
  - `variation.completed/refined`：按 `kind + job + variation + artifact`。
  - `export.created`：按 `export artifact + source artifact`。
  - `share.created`：按 `share id`。
- `InMemoryStore.createUsageEvent()` 支持按 `idempotencyKey` 去重。
- `PostgresRepository.createUsageEvent()` 改为 SQL-first：
  - `insert ... on conflict (idempotency_key) do nothing returning *`
  - 冲突时读取既有 usage event 返回。
  - 同步 hydrated cache，但 PostgreSQL 是写入 source-of-truth。
- PostgreSQL integration smoke 增加重复 usage 写入，确认不会重复计费。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- usage event 是计费口径，优先保证幂等可信；runtime replay、retry、resume 触发同一业务事件时不会重复累计成本。
- 用户明确创建新的 export 或 share 会有新的业务对象 id，因此仍会生成新的 usage 记录。

### 下一步

- 继续将 share/annotation/audit 写入拆为 SQL-first。
- 在 share 写入 SQL-first 后，复查 share.created usage 的幂等键是否需要绑定 token 或 share id 即可。
- 最后评估 production 模式关闭 startup hydrate。

## 2026-06-27 M27 Share Annotation Audit SQL-first Writes

### 已完成

- 将剩余 write-through mutation 契约放宽为 `MaybePromise`：
  - `createShare()`
  - `createAnnotationBatch()`
  - `createAuditLog()`
- `ApplicationService` 对 share、annotation、audit 写入补齐 `await`。
- `PostgresRepository` 改为 SQL-first：
  - `createShare()` 先写 `shares`，再同步 cache。
  - `revokeShare()` 先更新 `shares.revoked_at`，再同步 cache。
  - `createAnnotationBatch()` 先写 `annotation_batches`，再同步 cache。
  - `createAuditLog()` 先写 `audit_logs`，再同步 cache。
- 至此业务写入主路径已经从内存 write-through 迁移为 PostgreSQL SQL-first source-of-truth；startup hydrate 仍保留为 warm cache/兼容过渡。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- share.created usage 的幂等键继续绑定 `share.id`；SQL-first share 创建后，该 id 是明确业务对象标识。
- annotation 和 audit 暂不增加独立幂等键；annotation 是用户动作，audit 是管理操作记录，后续如引入 request-level retry 再补 request id 维度去重。

### 下一步

- 评估 production 模式关闭 startup hydrate，或将 hydrate 限定为 dev/test warm cache。
- 增加 Runtime unavailable 降级测试，验证 runtime 不可用时已落库的 preview/export/share/resume 仍可用或返回明确降级提示。

## 2026-06-27 M28 Production Repository Hydrate Mode

### 已完成

- `PostgresRepository.connect()` 新增 `hydrateOnStart` option：
  - 默认 `true`，保持 dev/test 兼容。
  - `false` 时仅执行 migration + seed，不再 startup hydrate 全量业务数据。
- `createApplicationServiceFromEnv()` 支持：
  - `DUDESIGN_REPOSITORY=postgres`
  - `DATABASE_URL=...`
  - `DUDESIGN_REPOSITORY_HYDRATE=false`
- PostgreSQL API flow 增加 no-hydrate smoke：
  - 同一套 `runApiFlowSmoke()`。
  - 一个 schema 跑默认 hydrate。
  - 一个 schema 跑 `hydrateOnStart: false`。
- 验证无 startup hydrate 时，核心 API 仍通过：
  - bootstrap。
  - session create/resume。
  - parallel variation generation。
  - preview/refine/annotation。
  - export/share/revoke。
  - admin jobs/artifacts/support/cost/audit。

### Repository Mode 决策

- dev/test：默认继续 hydrate，便于调试和保留过渡期内存观测能力。
- production：推荐设置 `DUDESIGN_REPOSITORY_HYDRATE=false`，让 PostgreSQL 成为明确 source-of-truth，避免启动时全量加载业务数据。
- hydrate 后续保留为 warm cache/debug 能力，不再作为业务正确性的依赖。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 包含 startup hydrate 与 no-hydrate 两套 API smoke。
  - 测试后已停止 server 并清理临时数据目录。

### 下一步

- 推进 M29 Runtime unavailable 降级测试：
  - 已完成 session 可 resume snapshot。
  - preview/export/share 仍可读取 artifact。
  - 新生成任务返回明确 runtime unavailable 或 queued/degraded 状态。

## 2026-06-27 M29 Runtime Unavailable Degradation Test

### 已完成

- 新增 `runtime-unavailable.test.ts`。
- 增加 `UnavailableRuntimeGateway` 测试替身：
  - `createSession()` 抛出 runtime unavailable。
  - `resumeSession()` 返回 `{ status: 'unavailable' }`。
  - `spawnVariationAgents()` / `refineVariation()` 抛出 runtime unavailable。
- `ApplicationService.createSession()` 支持 runtime create 降级：
  - DUDesign session 仍创建成功。
  - `runtimeSessionId` 为 `null`。
- `runMockJob()` 在 runtime spawn 失败时：
  - job 标记为 `failed`。
  - variation 标记为 `failed`。
  - errorCode 为 `RUNTIME_UNAVAILABLE`。
  - 不再让后台 promise 以未处理异常方式结束。
- 测试覆盖 runtime 不可用时：
  - 已完成 session 可 resume snapshot，runtime 状态为 unavailable。
  - preview 仍可读取已落库 artifact。
  - export 仍可读取 artifact 并生成导出。
  - share 仍可创建并只读访问。
  - 新建 session 不阻塞，但 runtimeSessionId 为 null。
  - 新生成任务最终明确 failed，并写入 RUNTIME_UNAVAILABLE。

### 验证

- `npm run typecheck`
- `npm test`
- 真实 PostgreSQL smoke：
  - 临时端口：`55432`
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test`
  - 执行 `npm --workspace @dudesign/api test` 通过。
  - 包含 startup hydrate、no-hydrate 与 runtime unavailable degradation 测试。
  - 测试后已停止 server 并清理临时数据目录。

### 决策

- runtime 不可用时，已完成数据读取能力不依赖 BabeL-O。
- 新任务不假装成功：当前 MVP 选择明确 failed + RUNTIME_UNAVAILABLE，后续如引入队列 worker 可扩展为 queued/degraded retry。

### 下一步

- 可以收口提交 M23-M29 后端服务层数据底座改动。
- 下一阶段建议转入 runtime gateway contract adapter / BabeL-O 兼容层联调。

## 2026-06-28 M30 Model Governance Foundation

### 已完成

- 领域模型新增：
  - `ModelService`
  - `UserModelAccess`
  - `ModelCapability`
  - `ModelServiceProvider`
- API contract 新增：
  - 用户可选模型列表响应。
  - 管理员模型服务响应。
  - 用户模型访问权限响应。
  - `CreateDesignJobRequest.modelServiceId`。
- Repository interface 新增模型治理方法：
  - `listUserModelOptions()`
  - `getModelServiceById()`
  - `canUserUseModel()`
  - `listAdminModels()`
  - `updateAdminModel()`
  - `getAdminUserModelAccess()`
  - `updateUserModelAccess()`
- InMemoryStore 新增 seed model services：
  - `mdl_babelo_default`
  - `mdl_babelo_fast`
  - `mdl_mock_design`
- 用户 API 新增：
  - `GET /api/models`
  - `GET /api/dev/bootstrap` 返回当前用户可用模型。
- 创建 design job 时：
  - 校验用户是否可使用请求的 `modelServiceId`。
  - 未传 model 时使用用户可用默认模型。
  - 将 `modelServiceId`、`modelId`、`modelProvider` 写入 `templateRequirements`。
  - usage event metadata 写入模型标识，供后续成本/用量治理聚合。
- Admin API 新增：
  - `GET /api/admin/models`
  - `PATCH /api/admin/models/:modelServiceId`
  - `GET /api/admin/users/:userId/models`
  - `PATCH /api/admin/users/:userId/models/:modelServiceId`
- 管理端模型写操作写入 audit log：
  - `model.update`
  - `user_model_access.update`
- 新增 `model-governance.test.ts`：
  - 用户可获取模型列表。
  - 禁用用户某模型后，使用该模型创建 job 返回 `MODEL_FORBIDDEN`。
  - operator 可启停模型并设置默认模型。
  - admin 可查看用户模型访问和 usage 摘要。

### 验证

- `npm --workspace @dudesign/api run test`
- `npm run typecheck`
- `npm test`

### 决策

- 模型配置和用户授权属于后端业务服务层事实来源，用户端只消费可用模型列表。
- 当前 MVP 不在前端暴露 provider secret/API key；这些敏感配置后续应由安全配置系统或服务端 env 管理。
- 本轮先用 InMemoryStore 建立产品和 API 契约；PostgreSQL migration / SQL-native query methods 作为下一阶段收口。

### 下一步

- 增加 `model_services`、`user_model_access` PostgreSQL migration。
- 为 PostgresRepository 实现 SQL-first model governance methods。
- 将 `modelServiceId` 传入 Runtime Gateway/Adapter，使 BabeL-O child session 真正按选择模型执行。
- 增加 Admin/User 前端 E2E 覆盖模型选择和模型开关。

## 2026-06-28 M30.1 Model Discovery Boundary Planning

### 现状确认

- `model_services` 当前是 DUDesign 业务治理配置表，首批数据来自 seed/config：
  - `mdl_babelo_default`
  - `mdl_babelo_fast`
  - `mdl_mock_design`
- 这些记录用于控制 enabled/default、用户级访问、usage metadata 和成本治理，不等于 runtime/provider 的真实模型清单。
- 当前 `GET /api/admin/models` 只返回治理表，不触发 BabeL-O 或供应商模型发现。

### 架构决策

- 后端业务服务层继续作为模型治理事实来源。
- 真实模型发现不由 Admin UI 直连 runtime/provider，而是通过 Application Service 调用 Runtime Gateway。
- 模型同步需要保留本地治理字段，不能因为 provider 暂时缺失某模型就直接删除用户配置。
- provider secret/API key 不进入 Admin API 响应；Admin API 只返回模型元数据、状态和同步摘要。

### 待实现

- 新增 `POST /api/admin/models/sync`：
  - 权限：`operator` 或 `developer`。
  - 调用 `runtime.listRuntimeModels()`。
  - upsert 发现到的模型元数据。
  - 标记缺失模型为 `metadata.discoveryStatus=missing`，不自动删除。
  - 写入 `model.sync` audit log。
- 扩展模型响应字段：
  - `metadata.source`
  - `metadata.discoveryStatus`
  - `metadata.lastSyncedAt`
  - `metadata.runtimeModelId`
  - `metadata.providerModelId`
- 增加测试覆盖：
  - runtime 返回新增模型时 upsert。
  - runtime 缺失旧模型时保留治理配置并标记 missing。
  - sync 失败时不破坏现有默认模型。

## 2026-06-28 M30.2 Parallel Runtime Isolation Boundary

### 现状确认

- 远端复杂 prompt 失败不是业务数据库或 artifact store 故障，而是 runtime 并行执行阶段的 workspace 竞争和超时。
- 业务服务层仍然正确保存了部分成功结果：同一 job 中成功 variation 的 artifact 可继续预览。

### 边界决策

- Application Service 继续以 job/variation/artifact 作为业务事实来源。
- Runtime workspace 隔离属于 Runtime Compatibility Layer 的执行细节，不要求新增业务表字段。
- 业务层接收的仍是标准 `design.variation_*` 事件和 artifact body，不关心 runtime 子目录。

### 后续建议

- Admin Job Monitor 需要展示更准确的 runtime error 摘要，例如 `REQUEST_TIMEOUT: Execution timed out after 300s`。
- Staging smoke 增加复杂 3/4 variation prompt，用于覆盖并行 workspace 隔离。

## 2026-06-30 M31 API Test Isolation Gate

### 问题

- `npm run test:api` 使用 `node --test dist/*.test.js`，Node test runner 会并发执行多个测试文件。
- 多个 API flow 测试会同时启动 HTTP harness、异步生成 screenshot、消费队列/worker 事件，导致偶发：
  - screenshot timeout。
  - admin job/support summary 读到不同阶段的 latest job。

### 已完成

- API workspace test script 改为：
  - `tsc -b && node --test --test-concurrency=1 dist/*.test.js`
- 保留单个测试文件内部的测试结构，只串行化跨文件执行。
- 修正 `apiFlowSmoke` 中 support summary 的不稳定断言：
  - 不再假设当前 session 的 `latestJob` 必然是最早创建的 generation job。
  - 改为验证 support summary 的稳定语义：session 可恢复、latest job 已完成、failure summary 正常、prompt preview 已脱敏。

### 验证

- `npm run test:api`
- `npm run typecheck`
- `npm --workspace @dudesign/admin run build`

### 决策

- API flow smoke 属于端到端级别的业务门禁，默认应优先稳定性而不是测试文件级并发速度。
- 后续如果需要加速，可以把纯单元测试和 HTTP/API smoke 拆成两个脚本：
  - unit 并发。
  - smoke 串行。

## 2026-06-30 M32 User Preference PostgreSQL Persistence

### 已完成

- 新增 PostgreSQL migration：`0005_user_preferences.sql`。
- 新增 `user_preferences` 表，持久化用户默认 capability 选择：
  - `domain_template_id`
  - `aesthetic_profile_id`
  - `color_palette_id`
  - `loop_profile_id`
- `PostgresRepository` hydrate 读取 `user_preferences` 并恢复到 repository cache。
- `PostgresRepository.saveUserCapabilityPreference()` 改为 SQL-first 写入 `user_preferences`，再同步 cache。
- `PostgresRepository.getUserCapabilityPreference()` 增加 SQL-native 读取路径，支持 production no-hydrate mode 下按需恢复用户偏好。
- PostgreSQL integration smoke 增加偏好保存、hydrate 后恢复、清 cache 后 SQL 读取验证。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- 真实 PostgreSQL opt-in smoke：
  - 使用本机 `initdb/pg_ctl` 创建临时 PostgreSQL 数据目录。
  - 临时端口：`55432`。
  - 测试连接：`DUDESIGN_POSTGRES_TEST_URL=postgresql://127.0.0.1:55432/dudesign_test`。
  - 执行 `npm --workspace @dudesign/api run test` 通过。
  - 覆盖 startup hydrate、production no-hydrate API flow、`user_preferences` migration、偏好 hydrate 恢复和 SQL-native 读取。
  - 测试后已停止 PostgreSQL 并清理临时数据目录。

### 决策

- 偏好表只保存 capability id，不保存完整 capability snapshot，避免官方 registry 更新后用户偏好持有陈旧对象。
- 完整生成依据仍继续随 job 存储在 `template_requirements.capabilitySnapshot` 中，保证历史 job 可审计。

## 2026-07-01 M33 Queue-backed Automation Repair

### 已完成

- 补齐 `processQueuedRefineJob()`，让 `refine_job` worker 能真实执行 variation refine。
- Automation Loop automatic repair 改为 enqueue `refine_job`，不再由 application background task 直接调用 runtime。
- Queue refine payload 增加 prompt、annotation、device、source、attempt 字段，供 worker 跨进程恢复执行上下文。
- Worker 执行 automation repair 时发布 `design.loop_repair_started`，runtime 失败时发布 `design.loop_stopped`。
- `flushBackgroundTasks()` 改为循环等待 queue/background task，覆盖 background task 入队后续 job 的场景。
- 补充 queued automation repair runtime unavailable 专项测试：
  - loop stopped event 与 queue failed state 同步。
  - 失败时 current artifact 保持原始版本。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/designJobQueue.test.js apps/api/dist/designJobWorker.test.js apps/api/dist/mock-flow.test.js apps/api/dist/redisDesignJobQueue.test.js`

### 后续建议

- 评估手动 refine API 是否在长任务模式下也切到 queue-backed。
- Redis worker staging smoke 覆盖 automatic repair。
