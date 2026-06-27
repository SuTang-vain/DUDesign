# DUDesign 开发测试与发布流程治理规范

> 版本：v0.1
> 日期：2026-06-27
> 定位：定义 DUDesign 从本地开发到服务器上线的工程流程、测试门禁、环境治理、发布回滚和文档维护规则
> 关联文档：
> - `docs/online-design-platform-plan.md`
> - `docs/architecture-governance-plan.md`
> - `docs/modules/README.md`
> - `docs/manual-browser-qa-checklist.md`
> - `docs/staging-server-deployment-plan.md`

## 1. 治理目标

DUDesign 是未来需要部署到服务器的在线前端设计平台，不是一次性本地 demo。开发流程必须保证：

- 本地开发可快速迭代。
- 测试结果可复现。
- 数据库变更可迁移、可审计、可回滚。
- 预发环境尽量接近生产环境。
- 生产发布可观测、可灰度、可回滚。
- BabeL-O 内核不可用或升级时，DUDesign 核心业务数据和已生成 artifact 不受破坏。

流程治理的核心原则是：

```text
小步变更 -> 明确归属 -> 自动验证 -> 文档同步 -> 可追溯提交 -> 预发验证 -> 生产发布 -> 观测回滚
```

## 2. 环境分层

DUDesign 至少维护四类环境。

| 环境 | 目的 | 数据策略 | 外部依赖 |
| --- | --- | --- | --- |
| Local | 日常开发和快速验证 | 本地 mock、本地 PostgreSQL、本地 artifact 目录 | 可使用 MockRuntimeGateway |
| Test / CI | 自动化门禁 | 临时数据库、临时 schema、临时 artifact root | 默认不依赖真实 BabeL-O |
| Staging | 上线前验证 | 类生产配置、隔离测试数据 | 尽量使用真实 PostgreSQL、对象存储、runtime gateway |
| Production | 正式用户访问 | 正式数据库、正式对象存储、审计日志 | 严格配置、监控、备份、回滚 |

推荐环境变量约定：

```bash
DUDESIGN_REPOSITORY=memory
DUDESIGN_REPOSITORY=postgres
DATABASE_URL=postgresql://...
DUDESIGN_ARTIFACT_ROOT=.dudesign/artifacts
DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test
```

后续 production repository mode 可引入：

```bash
DUDESIGN_REPOSITORY_HYDRATE=false
```

用于控制 `PostgresRepository` 是否在启动时 hydrate cache。

## 3. 四层模块归属

任何开发任务必须先归属到四层之一，跨层任务需要在所有受影响模块中记录依赖。

| 层级 | 模块 | 典型工作 |
| --- | --- | --- |
| 1 | 用户前端交互层 | 工作台、会话、生成页、结果墙、变体编辑、预览、导出、分享 |
| 2 | 管理员/开发者前端交互层 | 管理控制台、任务治理、成本观测、审计查看、runtime 健康面板 |
| 3 | 后端业务服务层 | 账号、workspace、session、job、variation、artifact、share、repository、migration、API |
| 4 | 后端内核兼容层 | BabeL-O Gateway、contract adapter、runtime events、resume 兼容、内核升级测试 |

任务归属示例：

| 任务 | 主归属 | 协同 |
| --- | --- | --- |
| PostgreSQL Repository | 第 3 层 | 管理端读取、用户端恢复 |
| preview/export/share artifact-backed | 第 3 层 | 第 1 层展示 |
| Runtime unavailable 降级测试 | 第 3 层 | 第 4 层提供 runtime 错误信号 |
| BabeL-O Contract Adapter | 第 4 层 | 第 3 层消费标准事件 |
| 管理端成本统计页面 | 第 2 层 | 第 3 层 Admin API |

## 4. 标准开发流程

每个里程碑或功能分支按以下流程推进：

```text
1. 明确需求和模块归属
2. 更新对应模块 TODO
3. 实现代码
4. 更新或新增测试
5. 更新 WORKLOG
6. 运行本地门禁
7. 提交 commit
8. push 到远端
9. CI / Staging 验证
10. 发布或进入下一里程碑
```

如果任务涉及数据库、对象存储、runtime、权限、计费或分享，必须额外补充：

- migration 或数据兼容说明。
- 降级行为说明。
- 回滚风险说明。
- 安全影响说明。

## 5. 本地开发规范

本地开发优先保证启动简单、反馈快。

推荐命令：

```bash
npm run typecheck
npm test
npm run dev:api
npm run dev:web
npm run dev:admin
```

本地默认可以使用：

- `DUDESIGN_REPOSITORY=memory`
- `MockRuntimeGateway`
- `LocalArtifactStore`
- 本地 `.dudesign/artifacts`

涉及 PostgreSQL 的功能必须至少手动跑一次真实 PostgreSQL smoke：

```bash
DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test \
npm --workspace @dudesign/api run test
```

## 6. 测试分层

DUDesign 测试分为六层。

| 测试类型 | 目标 | 默认门禁 |
| --- | --- | --- |
| Typecheck | TypeScript 契约正确 | 是 |
| Unit Test | 纯函数、store、artifact-store、prompt serialization | 是 |
| API Smoke | 核心 HTTP API 主链路 | 是 |
| PostgreSQL Integration | migration、SQL-native read/write、双实现 API smoke | 否，opt-in |
| Browser E2E | 用户前端真实浏览器流程 | 否，单独运行 |
| Staging Smoke | 类生产环境上线前验证 | 发布前必须 |

默认门禁必须不依赖外部服务：

```bash
npm run typecheck
npm test
```

PostgreSQL 测试使用 opt-in 环境变量：

```bash
DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test \
npm --workspace @dudesign/api run test
```

浏览器 E2E 单独运行，不放入默认 `npm test`：

```bash
npm run test:ux:e2e
```

## 7. API Smoke 规范

核心 API smoke 应覆盖：

- dev bootstrap。
- session 创建。
- design job 创建。
- variation 生成。
- SSE replay。
- variation detail。
- refine。
- annotation refine。
- preview。
- export。
- share。
- share 不漂移。
- share revoke / expired / forbidden。
- owner guard。
- admin runtime health。
- admin jobs / artifacts / support / cost summary。
- admin cancel / retry。

同一套 API smoke 必须支持：

- `InMemoryStore`
- `PostgresRepository`

PostgreSQL 版本可以 opt-in，但不能复制一套不同断言。共享 API flow 是防止双实现行为漂移的核心门禁。

## 8. 数据库迁移规范

所有数据库结构变化必须通过 migration。

规则：

- migration 文件只追加，不改已发布 migration。
- 命名使用递增编号，例如：
  - `0001_initial_schema.sql`
  - `0002_usage_event_idempotency.sql`
- migration 必须在本地和 staging 跑通。
- migration 应尽量向前兼容。
- 删除字段必须分阶段：
  1. 停止代码读取/写入旧字段。
  2. 观察一个发布周期。
  3. 再删除字段。
- 生产 migration 前必须备份。

PostgreSQL 多 schema 测试需要避免 constraint/index 名称跨 schema 冲突。涉及 `pg_constraint` 判断时必须限定 schema。

## 9. Repository 生产模式规范

Repository 是 DUDesign 业务数据访问边界。

当前治理方向：

- `InMemoryStore` 用于本地快速开发和无外部依赖测试。
- `PostgresRepository` 用于 staging / production。
- 业务服务层只依赖 `ApplicationRepository` 契约。
- Postgres 读写逐步以 SQL source-of-truth 为准。
- hydrated cache 仅作为过渡、dev/test warm cache 或兼容 fallback。

后续 M28 需要明确：

- `PostgresRepository.connect()` 是否支持 `hydrateOnStart`。
- production 是否默认关闭 startup hydrate。
- 无 hydrate 时 API smoke 是否通过。
- 是否引入：

```bash
DUDESIGN_REPOSITORY_HYDRATE=false
```

## 10. Runtime 降级规范

BabeL-O 或 runtime gateway 不可用时，业务服务必须区分两类能力。

仍应可用：

- 读取已创建 session。
- resume session snapshot。
- 查看已完成 job / variation。
- preview 已生成 artifact。
- export 已生成 artifact。
- share 已生成 artifact。
- admin 查看历史 job / cost / audit。

可能降级：

- 新 job 创建后无法启动 runtime。
- variation 无法继续生成。
- refine 无法调用 runtime。
- runtime health 显示 unavailable/degraded。

必须避免：

- runtime 不可用导致已生成 artifact 不可预览。
- runtime 错误破坏 session/job/variation 持久化状态。
- 前端看到 BabeL-O 原始内部错误或堆栈。

## 11. 提交规范

每个 commit 应该只表达一个清晰边界。

推荐命名：

```text
Add dual repository API smoke
Move PostgreSQL repository mainline mutations SQL-first
Add usage idempotency and SQL-first remaining writes
Add production repository hydrate mode
Add runtime unavailable fallback smoke
```

提交前必须确认：

```bash
git status --short
npm run typecheck
npm test
```

涉及 PostgreSQL 的提交还应尽量跑：

```bash
DUDESIGN_POSTGRES_TEST_URL=postgresql://localhost:55432/dudesign_test \
npm --workspace @dudesign/api run test
```

## 12. 文档维护规范

每个任务至少维护三个层次的文档：

1. 模块 TODO：记录阶段目标和未完成项。
2. 模块 WORKLOG：记录完成内容、验证、决策和下一步。
3. 跨模块治理文档：仅在规则、流程、架构边界变化时更新。

完成一个 M 阶段时，WORKLOG 格式建议为：

```markdown
## YYYY-MM-DD Mxx 标题

### 已完成

- ...

### 验证

- `npm run typecheck`
- `npm test`
- PostgreSQL smoke，如适用。

### 决策

- ...

### 下一步

- ...
```

## 13. Staging 发布规范

上线生产前必须先发布 staging。

Staging 检查项：

- 环境变量完整。
- migration 已执行。
- API health 正常。
- PostgreSQL 连接正常。
- artifact store 可读写。
- API smoke 通过。
- 用户前端可以创建 session/job。
- preview/export/share 可用。
- admin runtime health 可读。
- 日志中无启动错误。

详细手动浏览体验验收见：

```text
docs/manual-browser-qa-checklist.md
```

建议 staging smoke：

```text
登录/模拟用户
-> 创建 session
-> 创建 design job
-> 等待 variations 完成
-> 预览 variation
-> refine
-> export
-> share
-> 打开 share link
-> admin 查看 job/cost/audit
```

## 14. Production 发布规范

Production 发布必须满足：

- main 分支最新代码已通过 CI。
- staging 已验证。
- migration 已评估。
- 数据库已备份。
- artifact store 权限正确。
- runtime gateway health 可观测。
- 回滚版本明确。
- 发布负责人明确。

发布步骤：

```text
1. 构建镜像或发布包
2. 执行 migration
3. 部署 API
4. 部署 Web/Admin
5. 执行 health check
6. 执行 production smoke
7. 观察日志和指标
8. 标记发布完成
```

## 15. 回滚规范

回滚分为代码回滚和数据回滚。

代码回滚：

- 回滚到上一个稳定 image / commit。
- 确认 API health。
- 确认 preview/export/share。

数据库回滚：

- 尽量避免 destructive migration。
- 优先使用向前兼容 migration。
- 如必须回滚 schema，先备份，再执行人工审批。
- 删除字段必须分阶段，不允许和代码删除同一次发布直接落地。

## 16. 观测与审计

线上环境至少需要：

- request id。
- API access log。
- error log。
- job/variation 状态日志。
- runtime gateway health。
- usage/cost summary。
- audit log。
- migration log。
- artifact read/write error log。

管理端治理能力必须通过 Admin API，不允许绕过 application service 直接改数据库或 runtime。

## 17. 当前阶段推荐流程

DUDesign 当前建议按以下顺序继续：

```text
M28 Production Repository Mode
-> M29 Runtime Unavailable Fallback Tests
-> Runtime Compatibility Layer / BabeL-O Gateway Contract Adapter
```

M28 验收：

- production 可关闭 startup hydrate。
- 无 hydrate 时 API smoke 通过。
- `PostgresRepository` 行为不依赖内存 cache。

M29 验收：

- runtime 不可用时已完成 artifact 可 preview/export/share。
- session resume snapshot 可用。
- 新 job/refine 返回明确 degraded/unavailable 行为。
