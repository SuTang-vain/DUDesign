# Automation Loop

> 子模块：Automation Loop
> 所属模块：Capability Distribution System
> 目标：在人最少介入的情况下，让 agent 最大程度、最小阻力地完成修正、调试、验证和再修正

## 1. 定位

Automation Loop 解决的是：

> 生成结果不稳定时，系统如何自动推进到可用 artifact。

Loop 不定义领域风格，不决定插件权限，也不能无限重试。它只负责任务推进和质量闭环。

## 2. 基础流程

```text
Generate
  -> Inspect files
  -> Static quality check
  -> Preview render
  -> Pixel / visual check
  -> Diagnose
  -> Repair prompt
  -> Re-run or refine
  -> Stop
```

## 3. Loop Profile

### fast

- 尽快生成。
- 最少检查。
- 不自动修复或最多 1 次轻量修复。

### standard

- 默认模式。
- 静态质量检查。
- preview smoke。
- 最多 2 次自动修复。

### deep repair

- 更高质量，但成本更高。
- 启用 pixel gate。
- 多轮诊断和修复。
- 需要明确成本和时间提示。

## 4. Stop Conditions

Loop 必须有停止条件：

- 最大修复次数。
- 最大运行时间。
- 最大成本。
- 用户取消。
- runtime unavailable。
- artifact quality pass。
- 重复失败原因。
- contract mismatch。

## 5. Loop Event Contract

建议标准事件：

- `design.loop_started`
- `design.loop_step_started`
- `design.loop_quality_checked`
- `design.loop_repair_planned`
- `design.loop_repair_started`
- `design.loop_retry_scheduled`
- `design.loop_completed`
- `design.loop_stopped`

事件必须能被用户端 Activity Stream 和管理端观测消费。

## 6. 与现有能力关系

当前 DUDesign 已具备 loop 的部分基础：

- artifact quality gate。
- 可选 Playwright pixel gate。
- runtime warning。
- Activity Stream。
- refine。
- variation 状态机。
- 受控 runtime 并发。

下一步需要把这些能力编排为显式 loop profile。

## 7. Runtime 编译

Automation Loop 编译为：

- loop profile。
- validation plan。
- repair policy。
- retry/backoff policy。
- event publishing policy。

Loop 不应该直接拼用户不可见的任意 prompt。自动修复 prompt 必须由 Runtime Gateway 使用受控模板生成。

## 8. MVP 验收

- standard loop 可识别明显空壳/黑屏/外部依赖问题。
- standard loop 可自动生成一次修复 prompt。
- loop 状态出现在 Activity Stream。
- loop 停止原因用户可理解。
- 管理端可看到 loop 成功率和失败原因。
