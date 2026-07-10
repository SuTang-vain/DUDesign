# DUDesign Runtime Lane Pool 与 BabeL-O 多线路并行调度规划

> 模块归属：后端内核兼容层（Runtime Compatibility Layer）
> 关联模块：后端业务服务层、管理员/开发者前端交互层
> 日期：2026-07-09
> 状态：规划准入

## 1. 背景

当前 DUDesign 已经具备“一个 design job 创建多个 variation，并为每个 variation 创建独立 Babel-O child session”的并行生成能力。这个并行能力是在同一个 Runtime Gateway / Runtime Adapter 后面调用同一个 BabeL-O Nexus 实例完成的。

在动态百科卡片等高复杂度任务中，单个 job 的多个 variation 会同时竞争同一条 runtime 线路的 CPU、浏览器、文件系统和模型执行资源。远端测试中已经出现过典型现象：

- 同一 job 的部分 variation 完成，部分 variation 在 runtime hard watchdog 处超时。
- DUDesign 业务层能够记录 partial failure，但用户感知仍是“生成失败”或“等待过久”。
- `DUDESIGN_RUNTIME_VARIATION_CONCURRENCY` 只能控制业务侧同时发起多少 variation，不能把压力拆到多条独立 BabeL-O 运行线路。
- timeout 配置存在多层：API、Runtime Gateway、Runtime Adapter、BabeL-O Nexus、queue worker、preview quality worker。任一层短板都会成为真实生成的上限。

因此，需要把“并行 variation”从单 runtime 实例内并发，升级为“Runtime Lane Pool 多线路调度”。

## 2. 问题定义

### 2.1 当前单线路并行的限制

当前形态可以理解为：

```text
DUDesign Job
  -> Variation 01 -> Runtime Adapter -> BabeL-O Nexus A
  -> Variation 02 -> Runtime Adapter -> BabeL-O Nexus A
  -> Variation 03 -> Runtime Adapter -> BabeL-O Nexus A
```

这解决了业务状态和 child session 隔离，但没有解决 runtime 资源隔离。多个重任务同时进入同一个 Nexus 时，仍可能出现：

- workspace IO 竞争。
- Nexus execute 队列或 watchdog 超时。
- 浏览器/截图质量门禁资源冲突。
- 单实例异常导致多个 variation 同时受影响。
- 远端排障时无法判断失败来自哪个 runtime 实例、哪个执行线路。

### 2.2 目标形态

目标形态是：

```text
DUDesign Job
  -> Variation 01 -> Runtime Lane A -> BabeL-O Nexus A
  -> Variation 02 -> Runtime Lane B -> BabeL-O Nexus B
  -> Variation 03 -> Runtime Lane C -> BabeL-O Nexus C
```

Runtime Lane 是 DUDesign 对一条可调度 runtime 执行线路的抽象。它可以是一组 `runtime-adapter + babel-o-nexus`，也可以是一个 runtime-adapter 内部管理的多个 Babel-O Nexus backend。

## 3. 目标

- 支持一个 job 的多个 variation 动态分配到多条 runtime lane。
- 每条 lane 拥有独立并发阀、健康状态、contract status、timeout policy 和工作区隔离策略。
- 单 lane 超时、崩溃或 contract mismatch 不拖垮整个 job。
- 对 Application Service 暴露 DUDesign 标准 runtime contract，不泄露 Babel-O 私有事件和 Nexus 内部细节。
- 管理端可以看到 lane 健康、负载、失败率、超时原因和最近 contract drift。
- 支持从静态配置起步，后续再扩展到动态扩缩容。

## 4. 非目标

- MVP 不做 Kubernetes/HPA 级别的自动扩缩容。
- MVP 不允许用户前端直接选择或访问具体 BabeL-O Nexus。
- MVP 不开放 raw Nexus HTTP 端口给公网。
- MVP 不把 lane 调度逻辑放进用户前端。
- MVP 不通过降低 artifact quality/spec review 标准来规避 runtime 失败。

## 5. 分层边界

| 层级 | 职责 |
| --- | --- |
| 用户前端交互层 | 只展示 job/variation 状态，不感知 raw lane 拓扑；必要时展示“系统繁忙/自动重试中”。 |
| 管理员/开发者前端交互层 | 展示 runtime lane 健康、负载、失败率、drain/retry/cancel 治理入口。 |
| 后端业务服务层 | 创建 job/variation、入队、记录 runtime lane assignment metadata、输出标准 DesignEvent。 |
| 后端内核兼容层 | 定义 lane pool、调度策略、BabeL-O backend 适配、contract/health/timeout/事件归一化。 |

核心原则：只有后端内核兼容层理解 BabeL-O backend 和 Nexus 细节；业务层只保存 DUDesign 标准化 metadata。

## 6. 推荐架构

### 6.1 推荐方案：单 Runtime Adapter 内部管理多 Nexus backend

```text
Application Service
  -> Runtime Gateway Client
    -> Runtime Adapter
      -> Lane Registry
      -> Lane Scheduler
      -> Lane A: BabeL-O Nexus A
      -> Lane B: BabeL-O Nexus B
      -> Lane C: BabeL-O Nexus C
```

优点：

- Application Service 仍只配置一个 `BABELO_BASE_URL`。
- Gateway contract 不需要暴露 raw Nexus 列表。
- lane health、retry、contract negotiation 可以集中在 adapter 内完成。
- 远端部署可以先用 docker compose 固定 2-3 条 lane，后续平滑升级为服务发现。

### 6.2 备选方案：多个 Runtime Adapter 由 Gateway 调度

```text
Application Service
  -> Runtime Gateway
    -> Runtime Adapter A -> BabeL-O Nexus A
    -> Runtime Adapter B -> BabeL-O Nexus B
    -> Runtime Adapter C -> BabeL-O Nexus C
```

这个方案隔离度更高，但会让 Gateway 侧承载更多拓扑和健康检查逻辑。MVP 不优先采用，除非后续发现单 adapter 管理多 backend 的故障隔离不足。

## 7. Lane Registry

MVP 先使用静态配置，避免过早引入服务发现系统。

建议配置：

```bash
DUDESIGN_RUNTIME_LANE_MODE=static
DUDESIGN_RUNTIME_LANES_JSON='[
  {
    "id": "lane-a",
    "backendId": "nexus-a",
    "provider": "babel-o",
    "baseUrl": "http://babel-o-nexus:3000",
    "workspaceRoot": "/workspace",
    "maxConcurrent": 1,
    "weight": 1,
    "contractVersion": "2026-06-26.dudesign-runtime.v1"
  },
  {
    "id": "lane-b",
    "backendId": "nexus-b",
    "provider": "babel-o",
    "baseUrl": "http://babel-o-nexus-b:3000",
    "workspaceRoot": "/runtime-workspaces/lane-b",
    "maxConcurrent": 1,
    "weight": 1,
    "contractVersion": "2026-06-26.dudesign-runtime.v1"
  },
  {
    "id": "lane-c",
    "backendId": "nexus-c",
    "provider": "babel-o",
    "baseUrl": "http://babel-o-nexus-c:3000",
    "workspaceRoot": "/runtime-workspaces/lane-c",
    "maxConcurrent": 1,
    "weight": 1,
    "contractVersion": "2026-06-26.dudesign-runtime.v1"
  }
]'
```

后续可演进为数据库配置：

- `runtime_lanes.id`
- `runtime_lanes.provider`
- `runtime_lanes.base_url`
- `runtime_lanes.status`
- `runtime_lanes.contract_version`
- `runtime_lanes.max_concurrent`
- `runtime_lanes.current_inflight`
- `runtime_lanes.workspace_root`
- `runtime_lanes.drain_requested_at`
- `runtime_lanes.last_health_at`
- `runtime_lanes.last_error_code`

## 8. Lane Scheduler

MVP 调度策略：

1. 过滤不可用 lane：
   - health != healthy/degraded。
   - contract status == contract_mismatch。
   - drain mode 已开启。
   - inflight >= maxConcurrent。
2. 根据策略选择 lane：
   - 默认 least-inflight。
   - inflight 相同按 round-robin。
   - 可选 weight，用于给高规格实例更多任务。
3. 为 variation 创建 lease：
   - `leaseId`
   - `runtimeLaneId`
   - `runtimeBackendId`
   - `runtimeChildSessionId`
   - `runtimeAgentJobId`
4. stream 完成、失败、取消或 timeout 后释放 lease。

后续增强：

- 按 product mode 调度，例如动态百科卡片只走 `long_context` lane。
- 按模型能力调度，例如 `html_generation`、`html_refine`、`mcp_enabled`。
- 按用户或 workspace 做公平调度，防止单用户占满所有 lane。

## 9. Timeout Policy

多线路调度前必须先收口 timeout 分层，否则 lane 扩容也会被短 watchdog 卡住。

建议配置：

```bash
BABELO_TIMEOUT_MS=120000
BABELO_STREAM_IDLE_TIMEOUT_MS=600000
DUDESIGN_RUNTIME_VARIATION_CONCURRENCY=3

RUNTIME_ADAPTER_EXECUTE_TIMEOUT_MS=300000
RUNTIME_ADAPTER_WATCHDOG_TIMEOUT_MS=600000
RUNTIME_ADAPTER_JOB_TOTAL_TIMEOUT_MS=900000
```

执行原则：

- `BABELO_TIMEOUT_MS` 是 DUDesign API 到 Runtime Adapter 的普通请求与 stream 首次连接窗口；真实多 lane 生成时不应低于 120000ms，避免 adapter 正在排队/启动 stream 时被 API 侧过早判定 `RUNTIME_REQUEST_TIMEOUT`。
- `execute timeout` 受 BabeL-O Nexus schema 约束时保持上限 300000ms。
- `watchdog timeout` 用于完整 stream 消费，可设置为 600000ms 或更高。
- queue job total timeout 必须大于单 variation watchdog timeout。
- 超时事件统一归一化为 DUDesign 标准错误码：
  - `RUNTIME_REQUEST_TIMEOUT`
  - `RUNTIME_STREAM_IDLE_TIMEOUT`
  - `RUNTIME_WATCHDOG_TIMEOUT`
  - `RUNTIME_LANE_UNAVAILABLE`

## 10. Retry 与降级

MVP retry 规则：

- 对 `RUNTIME_LANE_UNAVAILABLE` 可自动换 lane retry 一次。
- 对 `RUNTIME_STREAM_IDLE_TIMEOUT` 可自动换 lane retry 一次。
- 对 `RUNTIME_WATCHDOG_TIMEOUT` 默认不自动 retry，除非 product mode 配置允许。
- retry 必须生成新 runtime child session，不能复用已不确定状态的旧 child session。
- retry 事件需要写入：
  - 原 lane id。
  - 新 lane id。
  - retry reason。
  - retry attempt。

用户端展示：

- 单 variation retry 中：显示“系统正在切换生成线路重试”。
- job partial failure：允许用户打开已完成 variation。
- 全部失败：给出可理解错误和重试入口。

## 11. Workspace 与 Artifact 隔离

每条 lane 必须使用独立 workspace root：

```text
/runtime-workspaces/lane-a/<jobId>/<variationId>/
/runtime-workspaces/lane-b/<jobId>/<variationId>/
```

规则：

- runtime workspace 是临时执行空间，不是业务事实来源。
- 完成后由 Artifact Bridge 同步到 DUDesign Artifact Store。
- preview/export/share 只能读取业务 artifact，不直接读取 runtime workspace。
- lane retry 不能覆盖旧 artifact；只有通过 quality gate 的 artifact 才能成为当前版本。

## 12. Runtime Contract 与事件

对业务层继续输出 DUDesign 标准事件。

新增建议事件：

```ts
design.runtime_lane_assigned
design.runtime_lane_health_changed
design.runtime_lane_retry_started
design.runtime_lane_retry_exhausted
```

事件 payload 只包含标准化字段：

```ts
{
  jobId: string
  variationId?: string
  runtimeLaneId: string
  runtimeBackendId?: string
  leaseId?: string
  status?: 'assigned' | 'draining' | 'unavailable' | 'retrying'
  reason?: string
}
```

禁止向业务层和前端透传 raw `NexusEvent` 全量内容。

## 13. 后端业务服务层改动

业务服务层需要记录 lane assignment，但不负责调度细节。

建议扩展：

- `design_variations.runtime_lane_id`
- `design_variations.runtime_backend_id`
- `design_variations.runtime_lease_id`
- `design_variations.runtime_attempt`
- `design_variations.runtime_last_error_code`
- `design_events` 保存 lane assignment / retry 标准事件。

API 响应：

- 用户 API 默认只返回用户可理解状态。
- Admin API 可返回 lane id、attempt、last runtime error。

## 14. 管理端治理能力

管理端新增 Runtime Lane 面板：

- lane 列表。
- health / contract status。
- inflight / maxConcurrent。
- 最近 10 次错误。
- p50/p95 duration。
- timeout count。
- success rate。
- drift count。
- drain / undrain 操作。
- 失败 job/variation 反查。

权限：

- support：只读查看。
- operator：可 drain / undrain。
- developer：可查看 contract drift、执行 lane smoke。

## 15. 部署规划

docker compose MVP：

```yaml
services:
  runtime-adapter:
    environment:
      DUDESIGN_RUNTIME_LANE_MODE: static
      DUDESIGN_RUNTIME_LANES_JSON: ${DUDESIGN_RUNTIME_LANES_JSON}

  babel-o-nexus:
    image: dudesign/babel-o-nexus:0.4.0
    volumes:
      - babel-o-workspace:/workspace

  babel-o-nexus-b:
    image: dudesign/babel-o-nexus:0.4.0
    environment:
      BABEL_O_WORKSPACE: /runtime-workspaces/lane-b
    volumes:
      - babel-o-workspace-b:/runtime-workspaces/lane-b

  babel-o-nexus-c:
    image: dudesign/babel-o-nexus:0.4.0
    environment:
      BABEL_O_WORKSPACE: /runtime-workspaces/lane-c
    volumes:
      - babel-o-workspace-c:/runtime-workspaces/lane-c
```

网络原则：

- `babel-o-nexus-*` 只暴露在 docker private network。
- 外部只访问 DUDesign Web/API/Admin。
- Runtime Adapter 也不直接暴露公网，除非经过受保护的内网或运维入口。

## 16. 测试计划

### 16.1 单元测试

- lane config JSON 解析。
- invalid lane config 拒绝启动或进入 degraded。
- least-inflight 调度。
- round-robin tie break。
- lease acquire/release。
- drain lane 不再接收新任务。
- contract mismatch lane 被过滤。
- timeout policy 归一化。

### 16.2 集成测试

- 两条 fake Nexus lane：一条成功，一条 timeout，job 仍 partial completed。
- 三个 variation 分配到三条 lane。
- lane A unavailable 后自动转 lane B retry。
- adapter 重启后可恢复 lease/stream 映射或给出明确降级。
- runtime lane metadata 写入 variation snapshot。

### 16.3 E2E / Staging Smoke

- `variation_count=3` 动态百科真实生成，确认三个 variation 分配到不同 lane。
- 单 lane timeout 不影响其他已完成 artifact preview/export/share。
- 管理端 Runtime Health 页面展示 lane 列表和最近错误。
- contract mismatch lane 不接收新任务。

## 17. 验收标准

- 一个 3 variation job 在三条 lane 可用时能分配到至少两条不同 lane。
- 单条 lane timeout 时，其他 lane 的 variation 仍能完成并生成 artifact。
- variation snapshot 能看到 runtime lane assignment。
- 管理端能定位失败 variation 所属 lane 和错误码。
- BabeL-O 升级仍只影响 Runtime Adapter / Runtime Gateway contract tests。

## 18. 推进顺序

1. 修正 timeout 配置链路：Runtime Adapter 不再硬编码 300000ms watchdog。
2. 增加 runtime lane planning metadata，不改变现有单 lane 行为。
3. 实现静态 lane registry 和 scheduler，默认只有一条 lane。
4. docker compose 增加 2-3 个 BabeL-O Nexus backend。
5. 增加 lane assignment event 和 variation metadata。
6. 增加 lane health/admin read API。
7. 增加 retry/drain。
8. staging 真实动态百科 3 variation smoke。

## 19. 开放问题

- lane registry MVP 是否只用环境变量，还是直接落库。
- Runtime Adapter 是否需要持久化 lease，还是由 Application Service 记录足够恢复信息。
- `RUNTIME_WATCHDOG_TIMEOUT` 是否允许按 product mode 差异化配置。
- 动态百科卡片是否默认 `maxConcurrent=1 per lane`。
- 失败 variation 自动 retry 是否需要消耗用户额度，还是系统侧吸收。
