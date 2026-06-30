# Capability Distribution System 工作记录

> 模块：Capability Distribution System
> 维护方式：按日期追加。记录模板、插件、自动化 loop、能力编译策略和跨层治理决策。

## 2026-06-29 TPL-M0 Template & Skill Module Planning

### 背景

- 产品需要提供官方模板，帮助用户更快生成规范、多样的设计方案。
- 产品也需要允许用户保存自己的模板和设计偏好，降低重复 prompt 成本。
- Skill 能力需要谨慎设计：它应该表达设计规则和工作方法，而不是执行任意代码。

### 已完成

- 新建独立模块：
  - `docs/modules/template-skill-system/README.md`
  - `docs/modules/template-skill-system/TODO.md`
  - `docs/modules/template-skill-system/WORKLOG.md`
- 明确 Template & Skill System 是跨层产品能力模块，不是新增第五层架构。
- 明确 MVP 阶段 skill 只支持声明式规则，不支持可执行插件。
- 明确模板/skill 必须通过 Application Service 授权，再由 Runtime Gateway 编译成受控 prompt context。
- 明确用户模板偏好与 memory 的关系：
  - 显式选择优先于偏好。
  - 偏好优先于 memory 推断。
  - memory 只能作为提示，不能作为事实来源。

### 决策

- 官方模板必须版本化，避免旧 session resume 时语义漂移。
- 用户模板默认 `private`，后续团队协作阶段再扩展 workspace/team visibility。
- 用户 skill 不允许直接控制 runtime cwd、工具权限、BabeL-O 私有参数或文件系统路径。
- 保存 variation 为模板时必须记录来源 artifact id/version，避免 refine 后模板来源漂移。

## 2026-06-30 CAP-M1 Capability Distribution Rename And Split

### 背景

- 重新梳理后，原 Template & Skill System 概念仍然偏窄。
- 新规划将能力分发拆为：
  - 模板：领域模板、审美偏好、颜色方案、品牌/IP 风格。
  - 插件：Skill、MCP tool、权限策略、工具 scope。
  - 自动化 loop：生成、调试、验证、修复、再验证。

### 已完成

- 将模块从 Template & Skill System 重命名为 Capability Distribution System。
- 将目录迁移为：
  - `docs/modules/capability-distribution/README.md`
  - `docs/modules/capability-distribution/TODO.md`
  - `docs/modules/capability-distribution/WORKLOG.md`
- 新增三个子模块文档：
  - `templates.md`
  - `plugins.md`
  - `automation-loop.md`
- 在 `docs/modules/README.md` 中更新模块名称和引用。
- 在 `docs/online-design-platform-plan.md` 中更新能力分发章节。

### 决策

- Capability Distribution System 仍不是第五层架构，而是跨四层的产品能力治理模块。
- Templates 决定领域、结构、审美和颜色方案。
- Plugins 决定可用 skill、MCP 工具和权限策略。
- Automation Loop 决定如何自动修正、调试、验证和停止。
- 三个子模块都必须通过 Application Service 授权，并由 Runtime Gateway 做最终安全编译。

### 下一步

- 设计首批领域模板和审美 profile registry。
- 设计插件权限策略和 MCP tool binding schema。
- 设计 automation loop profile 和 loop event contract。

## 2026-06-30 CAP-M2 Official Capability Registry And Job Snapshot

### 已完成

- contracts 新增能力分发最小契约：
  - `DomainTemplate`
  - `AestheticProfile`
  - `ColorPalette`
  - `AutomationLoopProfile`
  - `CapabilityRequirements`
  - `CapabilitySnapshot`
  - `ListCapabilitiesResponse`
- API 新增官方 registry：
  - 6 个领域模板。
  - 4 个审美 profile。
  - 4 个颜色方案。
  - 3 个 loop profile：fast、standard、deep repair。
- API 新增 `GET /api/capabilities`。
- `POST /api/design-jobs` 支持 `capabilityRequirements`。
- 创建 job 时将 resolved `capabilitySnapshot` 写入：
  - session message metadata。
  - job `templateRequirements.capabilitySnapshot`。
  - runtime spawn input。
- Runtime Gateway 将 capability snapshot 编译为 prompt block：
  - domain context。
  - recommended sections。
  - aesthetic context。
  - color palette usage。
  - automation loop preference。
- 用户端 API client 新增 `getCapabilities()`。
- API flow smoke 覆盖：
  - capabilities registry 可读取。
  - 用官方模板创建 job。
  - job snapshot 保存 domain/aesthetic/palette/loop 选择。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`
- `npm --workspace @dudesign/runtime-gateway run test`

### 决策

- MVP 先使用官方 registry + job snapshot，不立即引入 PostgreSQL migration。
- 旧的无 capability 请求继续兼容，系统使用默认 domain/aesthetic/palette/loop。
- capability snapshot 仍复用 `templateRequirements` 持久化入口，后续 schema 稳定后再迁移到独立表或独立 `capability_requirements` 字段。

### 下一步

- 将工作台 composer 接入 `GET /api/capabilities`，支持用户选择领域模板、审美 profile 和颜色方案。
- 设计插件权限策略和 MCP tool binding schema。
- 将 automation loop profile 从 snapshot 升级为可执行 loop plan。
