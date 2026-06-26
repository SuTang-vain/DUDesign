# DUDesign 模块推进索引

> 日期：2026-06-26
> 关联文档：
> - `docs/online-design-platform-plan.md`
> - `docs/architecture-governance-plan.md`

本目录按四层架构拆分模块级推进文档。每个模块维护两类文件：

- `TODO.md`：模块待办清单、阶段目标、验收标准和依赖关系。
- `WORKLOG.md`：模块工作记录、关键决策、变更历史和风险跟踪。

## 模块列表

| 模块 | 职责 | TODO | 工作记录 |
| --- | --- | --- | --- |
| 用户前端交互层 | 面向最终用户的设计工作台、生成页、结果墙、变体编辑页 | `user-experience/TODO.md` | `user-experience/WORKLOG.md` |
| 管理员/开发者前端交互层 | 面向治理、排障、观测和运营的管理控制台 | `admin-console/TODO.md` | `admin-console/WORKLOG.md` |
| 后端业务服务层 | DUDesign 业务事实来源，管理用户、工作区、会话、任务、资产、分享 | `application-service/TODO.md` | `application-service/WORKLOG.md` |
| 后端内核兼容层 | BabeL-O 防腐层，处理 runtime contract、事件映射、兼容升级 | `runtime-compatibility/TODO.md` | `runtime-compatibility/WORKLOG.md` |

## 当前代码骨架

```text
apps/
  web/
  admin/
  api/

packages/
  contracts/
  domain/
  runtime-gateway/
  artifact-store/
```

## 维护规则

- 新增功能必须先落到对应模块 `TODO.md`。
- 完成或调整重要工作时，同步更新对应模块 `WORKLOG.md`。
- 跨模块任务必须在所有受影响模块中标注依赖。
- 与 BabeL-O 相关的协议、事件、兼容性变更只记录在 `runtime-compatibility`，其他模块只记录 DUDesign 标准契约。
- 管理端治理能力不得绕过 `application-service` 和 `runtime-compatibility` 的边界。
