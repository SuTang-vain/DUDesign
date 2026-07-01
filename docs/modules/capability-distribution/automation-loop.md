# Automation Loop

> 子模块：Automation Loop
> 所属模块：Capability Distribution System
> 目标：在人最少介入的情况下，让 agent 最大程度、最小阻力地完成修正、调试、验证和再修正。

## 1. 定位

Automation Loop 解决的是：

> 生成结果不稳定时，DUDesign 如何自动推进到可用 artifact，并在无法继续时给用户明确原因。

Loop 不定义领域风格，不决定插件权限，也不能无限重试。它只负责任务推进、质量闭环、停止条件和可观测事件。

分层归属：

| 能力 | 所属层 | 是否依赖真实 BabeL-O |
|---|---|---|
| Profile、stop condition、事件契约 | 后端服务层 | 否 |
| 静态质量检查、pixel gate、失败归因 | 后端服务层 | 否 |
| repair prompt builder | 后端服务层 / Runtime Gateway 边界 | 否，先 mock 验证 |
| refine repair 执行 | 后端服务层调用 Runtime Gateway | mock + staging BabeL-O |
| BabeL-O event drift / resume / unavailable | 后端内核兼容层 | 是 |

## 2. 现有基础

当前 DUDesign 已具备 CAP-3 可复用底座：

- `AutomationLoopProfile` 初版：`fast`、`standard`、`deep repair`。
- `CapabilitySnapshot.automation` 已保存 loop profile 和 `maxRepairAttempts`。
- 静态 artifact quality gate：
  - 完整 HTML 检查。
  - 空 body / loading shell / hydration shell 检查。
  - 外部 script / stylesheet 检查。
  - 黑屏风险检查。
- 可选 Playwright pixel gate：
  - blank transparent / black / white。
  - 极低视觉变化。
- `design.runtime_warning` 已用于发布 artifact quality warning。
- `refineVariation` 已能携带当前 HTML、base artifact、annotation suffix。
- `repairVariationPreview` 已能重排 preview screenshot job。
- 事件持久化和 SSE replay 已存在。

因此 CAP-3 不是从零构建，而是把这些底座编排成显式 loop。

## 3. Profile

### 3.1 fast

用途：快速草稿。

建议配置：

- `maxRepairAttempts = 0`
- `maxCostCents = null`
- `maxDurationMs = 120000`
- `qualityGate = static`
- `enablePixelGate = false`
- 只发布质量 warning，不自动 refine。

### 3.2 standard

用途：默认 MVP 体验。

建议配置：

- `maxRepairAttempts = 1`
- `maxCostCents = 200`
- `maxDurationMs = 300000`
- `qualityGate = static`
- `enablePixelGate = false`
- 静态质量失败后自动生成一次最小 repair prompt 并调用 refine。

### 3.3 deep repair

用途：高质量预览或用户显式要求。

建议配置：

- `maxRepairAttempts = 2`
- `maxCostCents = 500`
- `maxDurationMs = 720000`
- `qualityGate = pixel`
- `enablePixelGate = true`
- 静态 + pixel gate 都参与诊断。
- 需要 UI 明确成本/耗时更高。

## 4. Stop Conditions

Loop 必须在每一步检查停止条件。

| 条件 | 字段 | 停止原因 | 用户文案方向 |
|---|---|---|---|
| 最大修复次数 | `maxRepairAttempts` | `max_attempts_reached` | 已完成可用检查，但自动修复次数已用完 |
| 最大成本 | `maxCostCents` | `max_cost_reached` | 为避免继续产生费用，系统已停止自动修复 |
| 最大时长 | `maxDurationMs` | `max_duration_reached` | 自动修复耗时过长，已停止并保留当前版本 |
| 质量通过 | `quality.status=pass` | `quality_passed` | 生成结果已通过质量检查 |
| 静态/像素失败 | `quality.status=fail` | `quality_failed` | 当前结果仍有质量问题 |
| Runtime 不可用 | runtime error | `runtime_unavailable` | 运行时暂不可用，稍后可继续 |
| Contract mismatch | runtime health | `runtime_contract_mismatch` | 内核兼容层版本不匹配，已停止保护任务 |
| 重复失败 | issue fingerprint | `repeated_failure` | 多次修复遇到相同问题，等待人工指令 |
| 用户取消 | cancellation | `cancelled` | 用户已取消自动修复 |

MVP 必须先实现：

- `maxRepairAttempts`
- `maxDurationMs`
- `quality pass/fail`
- `runtime unavailable`

`maxCostCents` 可以先按 token/cost 统计字段预留，进入真实计费后启用硬门禁。

## 5. Loop Event Contract

CAP-3 需要新增标准事件，供 Activity Stream、管理端观测和测试回放使用。

```ts
type DesignLoopStartedEvent = {
  type: 'design.loop_started'
  variationId: string
  payload: {
    profileId: 'loop_fast' | 'loop_standard' | 'loop_deep_repair'
    maxRepairAttempts: number
    qualityGate: 'static' | 'pixel'
  }
}
```

```ts
type DesignLoopQualityCheckedEvent = {
  type: 'design.loop_quality_checked'
  variationId: string
  payload: {
    artifactId: string
    attempt: number
    gate: 'static' | 'pixel'
    status: 'pass' | 'warn' | 'fail'
    issues: string[]
  }
}
```

```ts
type DesignLoopRepairPlannedEvent = {
  type: 'design.loop_repair_planned'
  variationId: string
  payload: {
    artifactId: string
    attempt: number
    reason: string
    promptPreview: string
  }
}
```

```ts
type DesignLoopRepairStartedEvent = {
  type: 'design.loop_repair_started'
  variationId: string
  payload: {
    artifactId: string
    attempt: number
    runtimeChildSessionId: string | null
  }
}
```

```ts
type DesignLoopCompletedEvent = {
  type: 'design.loop_completed'
  variationId: string
  payload: {
    artifactId: string
    attempts: number
    reason: 'quality_passed' | 'warn_accepted'
  }
}
```

```ts
type DesignLoopStoppedEvent = {
  type: 'design.loop_stopped'
  variationId: string
  payload: {
    artifactId?: string
    attempts: number
    reason:
      | 'max_attempts_reached'
      | 'max_cost_reached'
      | 'max_duration_reached'
      | 'quality_failed'
      | 'runtime_unavailable'
      | 'runtime_contract_mismatch'
      | 'repeated_failure'
      | 'cancelled'
    message: string
    recoverable: boolean
  }
}
```

事件治理要求：

- loop 事件必须使用 DUDesign 标准事件，不暴露 BabeL-O 原始事件细节。
- 事件必须可被 `GET /api/design-jobs/:id/stream` replay。
- 同一 artifact 的 quality result 必须可复现。
- repair prompt 只能存 preview / hash，避免把过长 HTML 写入事件。

## 6. 编排流程

### 6.1 生成后自动检查

```text
variation_completed
  -> materialize artifact
  -> analyze static quality
  -> if profile.enablePixelGate: analyze pixel quality
  -> publish loop_quality_checked
  -> if pass: publish loop_completed
  -> if fail/warn: evaluate repair policy
```

### 6.2 最小自动修复

MVP repair prompt 模板：

```text
DUDesign automatic repair request.

The current HTML artifact failed quality checks:
- {issue 1}
- {issue 2}

Repair only the concrete quality issues above.
Keep the original product goal, visual direction, selected template, and user constraints.
Return a complete static HTML artifact.
Do not introduce external scripts, build steps, absolute paths, or unbundled network assets.
```

要求：

- 使用当前 artifact HTML 作为 baseArtifactHtml。
- 使用同一 variation runtime child session。
- 保留原 job `templateRequirements` / `capabilitySnapshot`。
- 修复 prompt 必须追加 loop context，但不能覆盖 runtime guardrails。

### 6.3 停止与用户原因

失败时输出用户可理解 message，例如：

- `max_attempts_reached`：自动修复已达到上限，当前版本仍保留，你可以继续手动描述修改。
- `runtime_unavailable`：运行时暂不可用，已保留当前产物，稍后可以继续任务。
- `quality_failed`：页面仍存在空白、黑屏或外部依赖问题，需要更具体的修改指令。
- `max_duration_reached`：自动修复耗时过长，系统已停止以避免阻塞。

## 7. 测试策略

CAP-3 必须测试 BabeL-O 对接，但不能所有测试都依赖 BabeL-O。

### 7.1 Unit

目标：DUDesign 自身逻辑稳定。

- `AutomationLoopProfile` 默认值和 override clamp。
- Stop condition evaluator：
  - max attempts。
  - max cost。
  - max duration。
  - quality pass/fail。
  - repeated failure fingerprint。
- repair prompt builder：
  - 包含 quality issues。
  - 保留用户目标和 template context。
  - 不包含绝对路径、shell、越权指令。
- loop event serializer。
- user-facing stop reason mapper。

### 7.2 Integration with Mock Runtime

目标：业务闭环可控。

场景：

1. static fail -> one repair -> pass。
2. static fail -> repair still fail -> `max_attempts_reached`。
3. pixel fail -> repair -> pass。
4. runtime unavailable during repair -> `runtime_unavailable`。
5. job refresh / SSE replay 能看到 loop events。
6. resume 后继续使用原 job snapshot，不读取 registry latest。

### 7.3 Runtime Gateway Contract

目标：内核兼容层稳定。

- BabeL-O event drift 不破坏 loop 事件判断。
- `refineVariation` 请求包含：
  - current artifact HTML。
  - loop repair prompt。
  - base artifact id/version。
  - variation index/session context。
- runtime error 映射为 DUDesign 标准 stop reason。

### 7.4 BabeL-O Staging Smoke

目标：真实内核能完成修复。

必须覆盖：

- 黑屏/空壳 HTML -> repair refine -> 生成可见 HTML。
- 外部 script/style 依赖 -> repair refine -> 内联或移除外部依赖。
- pixel gate blank -> repair refine -> pass 或明确 stopped。
- runtime unavailable -> loop stopped，用户原因明确。
- repair 后 session 可 resume。

建议脚本：

```bash
DUDESIGN_RUNTIME_MODE=babel-o \
DUDESIGN_BABELO_BASE_URL="$STAGING_BABELO_URL" \
DUDESIGN_ARTIFACT_PIXEL_GATE=1 \
npm --workspace @dudesign/api run test -- automation-loop.staging.test.js
```

Staging smoke 不进入默认 CI，作为发布门禁或手动验收。

## 8. 里程碑

### CAP-3.1 Planning and Baseline

- 固化本文档。
- 跑现有 quality/refine/event 测试作为基线。
- 明确哪些能力已存在，哪些需要新增。

### CAP-3.2 Loop Domain and Events

- 扩展 `AutomationLoopProfile`：
  - `maxCostCents`
  - `maxDurationMs`
  - `repairStrategy`
- 扩展 `DesignEvent` loop event union。
- 增加 stop condition evaluator 和 unit tests。

### CAP-3.3 Mock Runtime Repair Loop

- 生成后读取 artifact quality。
- standard loop 自动调用 refine 一次。
- 发布 loop events。
- 失败时输出 user-facing reason。

### CAP-3.4 Pixel Gate and Deep Repair

- profile 控制 pixel gate，而不是全局 env 单独决定。
- deep repair 支持最多 2 次修复。
- 增加 pixel gate integration tests。

### CAP-3.5 BabeL-O Staging

- 增加 staging smoke。
- 验证真实 refine 修复。
- 验证 runtime unavailable / contract mismatch 降级。

## 9. MVP 验收

- `fast` 不自动修复，但会输出质量结果。
- `standard` 可识别明显空壳/黑屏/外部依赖问题，并自动生成一次修复 prompt。
- `deep repair` 可启用 pixel gate。
- loop 状态出现在 Activity Stream / SSE replay。
- loop 失败原因用户可理解。
- mock runtime 测试不依赖 BabeL-O。
- staging BabeL-O smoke 可验证真实修复能力。
