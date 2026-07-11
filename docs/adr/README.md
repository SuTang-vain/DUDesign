# DUDesign Architecture Decision Records

本目录记录会改变系统长期边界的架构决策。ADR 用于说明“为什么这样做”，不能代替模块 TODO、WORKLOG 或实现文档。

需要新增 ADR 的情况：

- 改变四层依赖方向。
- 新增或移除部署服务。
- 改变生产事实来源。
- 改变 User API、Admin API 或 Runtime Contract 的边界。
- 引入新的 Runtime、Artifact、Queue、Auth 或数据库 provider。
- 改变多用户隔离、权限或审计模型。

命名格式：

```text
NNNN-short-decision-title.md
```

状态：

- `proposed`
- `accepted`
- `superseded`
- `deprecated`

首个独立 ADR 从 `0001` 开始。历史治理文档内的 ADR 继续保留原编号。
