# Capability Distribution System 工作记录

> 模块：Capability Distribution System
> 维护方式：按日期追加。记录模板、插件、自动化 loop、能力编译策略和跨层治理决策。

## 2026-07-17 CAP-18.3 极小画布共享体验契约

- 新增共享 stage fallback，统一 relation、timeline、fact compare、route、progressive disclosure 与 summary 的首屏承诺、主要交互、次级披露和 attention budget。
- 修复 Runtime Gateway 与 API quality gate 在没有同阶段 democase 时错误使用 `profiles[0]` 的问题；现在只使用同阶段证据，否则回退官方 stage profile，并在 prompt 标记 `matched_evidence` 或 `official_stage_fallback`。
- `300×360` prompt 明确要求一个主要导航/控制组、最多 `3` 个主选择加 `2` 个其他控件，并禁止 relation 的 Tab+节点、compare 的对象 Tab+视图 Tab、progressive 的 accordion+Tab 双重导航。
- Pixel Gate 的交互探针补齐原生 `button[aria-selected=false]` 与 `button[aria-pressed=false]` 候选，避免点击已选中按钮造成假阴性；隐藏 Tab 在存在替代主交互时不再误报。
- 30 个真实 democase 索引重新生成，索引版本为 `2026-07-16.real-case.d8df2587721622cd`，并新增 builder 与共享 profile 完全一致的防漂移断言。
- 官方 compact examples 按 dominant stage 注入 profile 运行桌面与极小屏门禁，定向测试 `71/71` 通过。

## 2026-07-16 CAP-18.2 垂直模板 compact few-shot 收口

- series navigation、scenic route guide、scenic map POI 使用领域专属 compact HTML 示例，统一固定桌面、标准移动和 `300×360` 三类画布状态。
- 动态主题卡的极小屏规则现在同时进入模板 pack、few-shot 文件引用、Runtime Gateway variation prompt 和 Pixel Gate；减少首屏信息不是删除内容，而是通过本地 tab、分页、详情层和点击状态渐进揭示。
- 关系卡浏览器验证确认必要 Tab 与节点可见，点击 Tab 后内容发生变化；真实 BabeL-O 多模板产物仍需 staging 回放。

## 2026-07-14 CAP-M11.7 Dynamic Capability Selection Contract Implementation

- `CapabilityPreset` 增加 `selectionPolicy`、`explorationDefaults` 和 requirement module graph 引用；动态百科 preset 固定 required template/Skill/MCP、Loop 白名单、默认探索度 `40` 及实验阈值。
- `EncyclopediaEntryGuidanceResponse` 增加 exploration recommendation；服务端 job 创建前执行 required capability、模板父子关系、Loop 白名单和 experimental review 校验。
- 新增版本化 `CapabilitySelectionSnapshotV1`，记录 preset/guidance、能力选择、来源、review mode 和 exploration request，随 job snapshot 返回。
- 新增动态百科 requirement module graph，保持事实、固定交付和只读工具等 invariant；探索度只作用于受控设计发散。

### 验证

- capability contract、exploration planning、dynamic capability selection API flow 和相关动态百科回归共 55 项通过。
- 真实 BabeL-O staging exploration smoke、完整抽屉编辑器和用户 override 来源标注仍待后续阶段。

## 2026-07-14 CAP-M11.8 Selection Source and Experimental Admission UX

- 用户候选配置区分 official preset、entry guidance 和 user override；最终 job 页面以 selection snapshot 作为来源事实。
- Application Service 只为最终通过校验并实际选中的能力采用客户端来源声明，来源字段不能扩大模板、插件、MCP 或 Loop 权限。
- exploration experimental 阈值与强制审查阈值继续由 preset 下发，用户端不复制阈值常量作为授权依据。
- faithful / balanced / exploratory / experimental 只改变受控设计发散；`factCreativity`、required capability 和 invariant 保持锁定。

## 2026-07-14 CAP-M11.6 Dynamic Capability Selection Policy Planning

- 为动态百科能力抽屉登记 Capability Distribution 契约工作。
- 规划 `CapabilitySelectionSource`，区分 official preset、entry guidance、user override 和 job snapshot。
- 规划扩展 `CapabilityPreset.selectionPolicy`，声明 required template/Skill/MCP 与 allowed Loop。
- 规划扩展 `CapabilityPreset.explorationDefaults`，动态百科默认 `40 / balanced`，experimental 阈值和强制审查阈值由契约下发。
- 固定合并优先级：`job_snapshot > user_override > entry_guidance > official_preset`。
- required capability、父模板硬约束和 invariant 不允许被用户 override 删除；`factCreativity` 始终为 0。
- 本记录为规划准入，实施项登记在 CAP-11.5。

## 2026-07-14 CAP-M11.5 Provider-neutral Exploration Execution

- 可执行 CLI Agent provider 已接入标准 `RuntimeExplorationContextV1`，与 BabeL-O、Mock 使用相同 variation focus、required/sampled module 和 divergence directives。
- CLI provider 的 generate 与 refine 均沿用 job snapshot 固定计划；refine 同时读取现有 HTML，但不重新规划模块或改变 focus。
- API flow 已验证同一批两条 variation 生成不同 focus artifact，并可通过既有 preview/artifact 链路读取。
- 受控 staging smoke 已支持官方动态百科 graph、exploration level、3/6 variation focus 差异和事实不创造断言。
- 本地 provider-neutral 能力已完成；真实 staging BabeL-O exploration smoke 仍待发布本阶段 build 后执行。

## 2026-07-13 CAP-M11.4 Runtime Exploration Context Integration

- 已将 job snapshot 中的 batch/variation plan 编译为 provider-neutral `RuntimeExplorationContextV1`。
- BabeL-O、Mock Runtime 和 CLI Agent fixture 使用同一标准 context 和 prompt compiler。
- 首次生成、手工 refine 和 automation refine 均沿用固定 variation focus。
- Runtime context 不携带原始文档、authoring evidence、MCP scope 或 provider sampling 参数。
- Runtime 失败、event drift 和旧 provider fallback 不改变 exploration snapshot。
- 当时尚未完成的可执行 CLI Agent provider 已在 CAP-M11.5 补齐；真实 staging 3/6 variation smoke 仍待发布验证。

## 2026-07-14 CAP-M10.8 Authoring Studio Capability Bundle UI

### 已完成

- 在用户端“设计系统 -> 我的模板 -> 导入 DESIGN.md”区域接入紧凑 Capability Bundle 工作台，不改变现有模板库页面结构。
- Bundle 导入：
  - 选择 `.zip` 文件并显示文件名/大小。
  - 浏览器 File API 转 canonical base64，调用 governed bundle import API。
  - 展示 Template、Skill、Interaction、Data Contract、Review Profile 和 HTML example 数量。
  - 展示 error/warning 摘要和最多三项治理 finding。
  - 用户确认后一次性确认 extraction evidence 与 warning path，再运行 preview gate。
  - preview passed 后显示明确完成状态；导入仍不直接发布 private template。
- Bundle 导出：
  - 只列出当前 workspace 的 `ready` / `published_private` authoring draft。
  - 用户选择 `user_owned_or_authorized` 或 `unspecified` license declaration。
  - 支持 provenance/license notes，并下载 attachment ZIP。
- workspace 切换时重新读取 authoring drafts；导入/确认后本地列表即时更新。
- 新增中英文文案与响应式紧凑样式。

### 测试

- 全项目 typecheck 通过。
- Next.js production build 通过。
- 新增真实浏览器 E2E：API 创建 ready draft -> UI 下载 ZIP -> 原文件上传 -> 查看能力摘要 -> 确认 -> preview passed。
- 新增 E2E 在 Chromium 通过。
- 应用内浏览器 runtime 初始化遇到 `Cannot redefine property: process`，按前端测试规范使用仓库 Playwright fallback；未发现页面运行错误。

### 边界与下一步

- 当前工作台嵌在模板库现有入口，尚未拆成独立 Authoring Studio 路由。
- DESIGN.md 入口仍调用旧直接发布 API；应后续迁移到 governed draft import，统一确认/preview/private publish 流程。
- capability bundle 当前下载文件名由客户端按 draft id 生成；若需要服务端 attachment filename，应扩展 API client 读取 `content-disposition`。

## 2026-07-13 CAP-M10.7 Capability Bundle ZIP Round-trip

### 已完成

- 定义 `dudesign-capability-bundle.v1` manifest 与独立 provenance contract。
- Bundle 携带完整 portable `CapabilityBundleDraft`：Template Draft、Declarative Skill、Interaction Paradigm、Data Contract、Review Profile、recommended profile 和 HTML examples。
- portable template 使用 `htmlExamplePaths` 建立索引，不导出原环境 artifact/session/workspace/user id。
- provenance 记录 source type/hash、源 draft 状态、license declaration 和导出时间，并强制声明不包含 owner/workspace identity 或源文件系统路径。
- evidence path/excerpt 与 license notes 经过现有 redaction；owner email、secret 和绝对路径不进入 ZIP。
- 新增安全 ZIP codec：
  - 压缩体积、文件数、单文件和总解压大小上限。
  - 路径穿越、重复 entry、未声明文件、孤立/重复 HTML example 检查。
  - 每文件 SHA-256/size、manifest 入口、能力数量与 provenance schema 校验。
- 新增 `capability_authoring_assets` migration/repository，用于无设计 session 的导入 HTML example；同时补齐 authoring draft `published_template_id` PostgreSQL 持久化。
- ZIP HTML example 在目标环境重新 sanitizer 后写入 object store，preview/private publish 统一通过 reviewed HTML resolver 和 content hash 防漂移。
- 新增 API：
  - `POST /api/capability-authoring/drafts/:id/export-bundle`。
  - `POST /api/capability-authoring/import-bundle`，MVP JSON 请求使用受限 canonical base64。
- 导出/导入记录 `capability.bundle.exported` 与 `capability.bundle.imported_draft` 审计。

### 测试

- Bundle 全能力类型与 HTML example round-trip。
- provenance/evidence 隐私脱敏。
- 文件篡改 hash mismatch 与 undeclared entry 拒绝。
- ApplicationService 导出 -> 导入 -> authoring asset -> preview smoke。
- HTTP attachment 下载 -> base64 导入 -> preview smoke。
- 相关 25 项测试通过；PostgreSQL integration 因未配置 `DUDESIGN_POSTGRES_TEST_URL` 跳过。

### 边界与下一步

- 用户端 Authoring Studio 上传/下载和 license declaration UI 已在 CAP-M10.8 接入。
- v1 使用单一 `capability/draft.json` 作为能力事实来源；未来可附带 DESIGN.md/Template Pack JSON compatibility views，但不得产生双向漂移。
- 需要在真实 PostgreSQL 环境执行 `0020_capability_authoring_assets` migration smoke。

## 2026-07-13 CAP-M10.6 Portable Template Export and Round-trip

### 已完成

- 定义 `dudesign-template-pack-export.v1` portable JSON contract：
  - manifest 包含 format、稳定 content hash、导出时间、源模板 id/version。
  - portable core 包含 schema、父子角色、适用模式/分类、tokens、rationale、name/version 和 lint status。
  - content hash 基于键排序后的稳定序列化，不受 `exportedAt` 变化影响。
- portable JSON 明确排除环境绑定内容：
  - template id、owner、source、visibility、status。
  - `previewArtifactId`。
  - HTML example bodies。
  - manifest 使用 `examplesIncluded: false` 和 `omittedFields` 显式声明边界。
- HTML examples、sanitized artifacts 和其它能力资产由 CAP-M10.7 Capability Bundle ZIP 携带，避免 JSON round-trip 产生失效 artifact 引用。
- 新增导出 API：
  - `GET /api/design-templates/:id/export/design-md?workspaceId=...`。
  - `GET /api/design-templates/:id/export/template-pack-json?workspaceId=...`。
  - 使用 attachment download 响应和安全文件名。
- 新增 governed import API：
  - `POST /api/capability-authoring/import-design-md`。
  - `POST /api/capability-authoring/import-template-pack-json`。
  - 导入结果进入 authoring draft，不直接发布 private template。
- JSON import：
  - 校验 schema 与 manifest content hash。
  - 篡改 template 内容时返回 `TEMPLATE_PACK_HASH_MISMATCH`。
  - portable core 转为 `DesignTemplateDraftV2`，保留 tokens 和 rationale。
- DESIGN.md import：
  - 复用现有 parser/lint。
  - importer findings 进入 draft findings。
  - 重新导入后保留 name、颜色、间距和可表达的 rationale。
- 两种 portable import 都增加 `html_examples_not_portable` warning，必须重新关联或提取 reviewed HTML example 才能 preview/publish。
- export/import 写入用户能力审计：
  - `capability.template.exported_design_md`。
  - `capability.template.exported_json`。
  - `capability.template.imported_design_md_draft`。
  - `capability.template.imported_json_draft`。

### 测试

- portable core JSON round-trip 等价。
- 不同导出时间产生相同 content hash。
- JSON 内容篡改被拒绝。
- DESIGN.md export -> import 保留可表达的 tokens/name。
- private template 不可被其他用户导出。
- HTTP download 校验 content-disposition，并完成两种格式导入。

### 边界

- 本轮完成 API，不包含用户端导出/导入 UI。
- 旧 `/api/design-templates/import-design-md` 作为兼容入口仍可直接创建私有模板；新的 Authoring Studio 应只使用 governed draft import API。
- 完整 HTML examples、skills、interaction/data/review assets 已由 Capability Bundle ZIP manifest 承载。

### 下一步

- 接入用户端 Authoring Studio 的下载与导入入口。
- 逐步迁移旧 DESIGN.md 直接发布入口到 governed draft 流程。

## 2026-07-13 CAP-M10.5 Private Publish and Version Rollback

### 已完成

- 新增 private publish contract/API：
  - `POST /api/capability-authoring/drafts/:id/publish-private`。
  - 仅接受 `ready` draft。
  - 首版要求 candidate bundle 恰好包含一个 Template Draft。
- 发布门禁：
  - extraction evidence 已确认。
  - sanitizer passed。
  - sanitized artifact hash 与已审核 draft 一致。
  - preview smoke passed。
  - 只读取 sanitized artifact，不读取源 HTML 作为发布 example。
- 发布后的 `DesignTemplatePack`：
  - `source=user`、`visibility=private`、`status=published`。
  - 初始版本固定为 `1.0.0`。
  - tokens、rationale、section blueprints 和 sanitized HTML example 显式进入 pack。
  - `previewArtifactId` 指向 sanitized artifact。
  - draft 进入 `published_private` 并记录 `publishedTemplateId`。
- template id 按 draft id 确定性生成，降低发布重试造成重复私有模板的风险。
- 新增私有模板 rollback contract/API：
  - `POST /api/design-templates/:id/rollback`。
  - 只允许模板 owner 回滚自己的 private user template。
  - 恢复历史 version 内容，但生成新的 semantic patch version。
  - 不覆盖或删除任何旧 version，旧 job snapshot 继续保持原内容。
- 发布与回滚分别记录：
  - `capability.template.published_private`。
  - `capability.template.rolled_back`。
  - audit metadata 包含 draft/source hash、历史版本、生成版本和 sanitized artifact。

### 测试

- 非 `ready` draft 禁止发布。
- 发布模板只包含 sanitized HTML，不包含 source script。
- 发布后 draft 不可重复发布或编辑。
- rollback `1.0.1 -> source 1.0.0` 生成 `1.0.2`。
- `1.0.0`、`1.0.1` 和 `1.0.2` 均可独立读取，历史内容不漂移。
- HTTP flow 覆盖 analyze -> confirm -> sanitize -> preview -> publish -> rollback。

### 边界

- 本轮只实现用户私有模板发布与回滚，不等同于 CAP-10.5 官方模板/Skill 审核回滚。
- 多模板 Capability Bundle、私有 Skill、Data Contract 和 Review Profile 尚不随本接口发布。
- publish 与 rollback 复用现有 repository version 模型；后续可增加事务型 Unit of Work 进一步收紧跨表原子性。

### 下一步

- 开放 `DESIGN.md` / Template Pack JSON 导出和 round-trip。
- 实现私有 Skill 持久化与 capability snapshot。
- 在真实 PostgreSQL 环境验证 publish/rollback version 与 audit persistence。

## 2026-07-13 CAP-M11.3 Exploration Plan Snapshot Integration

### 已完成

- `CreateDesignJobRequest` 增加可选 `requirementModuleGraphId`、`exploration` 和结构化 data context。
- 新增 `POST /api/design-jobs/exploration-plan/preview`，preview 不创建 job 或 variation。
- 用户只能提交 graph id；服务端通过受控 resolver 获取已准入图谱，不接受客户端提交任意模块图。
- 创建 job 时重新执行权限、图谱和 planner 校验，并覆盖客户端伪造的 exploration snapshot。
- Graph 和 batch plan 固定到现有 `templateRequirements` JSON snapshot，不新增并行持久化事实源。
- Job snapshot 和 variation detail 显式返回：
  - Requirement Module Graph。
  - Batch Exploration Plan。
  - 与 variation index 对应的单项 plan。
- DUDesign variation index 与 planner 统一为 `1..N`。
- 服务重建后从 Repository snapshot 恢复原计划，不重新规划。
- 管理员整单重试继承原 batch snapshot；单 variation 重试派生原方向的单项 snapshot。
- retry 保留原 `productMode`，动态百科任务不会退回默认 Web&App 模式。

### 安全与边界

- preview 和 create 都要求 workspace editor 以上权限。
- viewer、workspace 外用户和未授权 graph 无法预览或创建计划。
- 非法探索值和模块选择被归一化为结构化 400。
- `ExplorationPlanningApplicationService` 不依赖 Runtime、PostgreSQL provider、Redis 或 `ApplicationService` facade。

### 验证

- 探索契约、planner、Application Service、HTTP flow 和架构边界定向测试：24 项通过。
- `npm run typecheck`：通过。
- 排除已知 Playwright Chromium 环境用例后，API 回归 217 项通过。
- `git diff --check`：通过。

### 后续关注

- 接入 CAP-10 发布后的用户私有 Requirement Module Graph resolver。
- 增加真实 PostgreSQL hydrate/no-hydrate 和进程重启 smoke。
- 增加 exploration lifecycle/adjustment audit events。
- 实现“换一个方向”显式创建新 plan version。

## 2026-07-13 CAP-M11.2 Deterministic Batch Exploration Planner

### 已完成

- 新增 `apps/api/src/explorationPlanner.ts`，实现无数据库、无 Runtime 依赖的确定性 batch planner。
- 支持 1-6 个 variation，并使用 planner version、capability snapshot id 和外部 seed 形成可回放计划。
- 对 always 模块全量注入；对 sampled/conditional 模块按优先级、最小覆盖和探索度分配。
- conditional 模块通过结构化 data context 判断资格；明星组合 Unit 导航只在存在 Unit 数据时进入计划。
- 支持 locked/excluded module：
  - locked eligible module 至少覆盖一个 variation。
  - excluded module 不进入计划和 coverage summary。
  - always/global rule 不允许排除。
  - 依赖 excluded module 的选择会失败。
- 自动补齐模块依赖，并为每个 variation 生成 focus、style direction、interaction direction 和 rationale。
- 高探索增加可选模块覆盖，但 `factCreativity` 始终为 0。
- 批量计划校验增加 schema/profile 漂移、连续 variation index、依赖/冲突和 coverage summary 一致性检查。

### 验证

- `node --test apps/api/dist/explorationContracts.test.js apps/api/dist/explorationPlanner.test.js apps/api/dist/architectureBoundaries.test.js`：17 项通过。
- `npm run typecheck`：通过。

### 后续关注

- 将 planner 包装进 `ExplorationPlanningApplicationService`，增加 workspace/capability 权限和 preview API。
- 把 batch/variation plan 持久化到 job snapshot，并补 resume/retry/refine 不漂移测试。
- 后续增加 focus uniqueness、模块 Jaccard 和 layout/interaction diversity 指标。

## 2026-07-13 CAP-M11.1 Controlled Exploration Contracts and Golden Fixture

### 已完成

- 新增 `packages/contracts/src/exploration.ts`：
  - `RequirementModuleGraphV1`、`RequirementModuleV1` 和四种模块模式。
  - `ExplorationProfileV1`、`BatchExplorationPlanV1`、`VariationExplorationPlanV1`。
  - schema version、planner metadata、coverage summary 和 warning 契约。
- 增加探索档位纯函数：忠实、均衡、探索、实验。
- 在类型和运行时校验中固定 `factCreativity=0`。
- 增加模块图校验：条件模块、coverage、evidence confidence、依赖/冲突/兼容引用和重复 id。
- 增加批量计划校验：unknown module、冲突分配、重复 variation index 和 always module 全覆盖。
- 根据《明星组合动态百科功能设计文档》建立 golden fixture：
  - 组合身份、当前成员为 always。
  - 历任成员、时间线、作品和双向链接为 sampled。
  - Unit 导航为 conditional。
  - 作品归属和中性事实表达为 global rule。
  - 事实不可编造、多 Unit 归属、作品分离和敏感状态表达进入 invariant。
- `@dudesign/contracts` 暴露独立 `./exploration` export；未增加 `packages/domain` 反向依赖。

### 验证

- `npx tsc -b packages/contracts packages/domain apps/api --pretty false --force`
- `node --test apps/api/dist/explorationContracts.test.js apps/api/dist/architectureBoundaries.test.js`：10 项通过。
- `npm run typecheck`：通过。
- 排除缺少 Playwright Chromium 的 `preview-interaction.test` 和依赖 screenshot worker 的 `mock-flow.test` 后，API 回归 179 项通过。

### 验证限制

- 完整 API test 因本机缺少当前 Playwright revision 的 Chromium Headless Shell，`preview-interaction.test` 无法启动。
- 同一轮完整测试中的 `mock-flow.test` 等待 screenshot artifact 超时；非浏览器 API 回归和本轮契约测试均通过。

### 后续关注

- 下一步实现 Capability Spec Importer 的 Requirement Module graph 输出。
- 再进入 deterministic batch planner，先覆盖 3/6 variation，不提前接 UI 或 Runtime。

## 2026-07-13 CAP-M11 Controlled Exploration Governance Admission

### 已完成

- 新增专项规划：`controlled-exploration-governance-plan.md`。
- 将多模块功能文档定义为 Requirement Module graph，而不是单一视觉模板。
- 确定批量 variation 必须先生成 `BatchExplorationPlan`，再分配单 variation plan。
- 确定用户探索度是 `0..100` 的业务语义，不直接等同 provider temperature。
- 确定事实、安全、权限、数据契约和必需模块为 invariant，不随探索度升高而放宽。
- 在 Capability TODO 登记 Phase CAP-11，并同步四层实施任务。

### 决策

- `factCreativity` 固定为 0；探索度只控制模块广度、组合新颖度、布局、视觉、交互和有限文案语气。
- resume、retry 和 refine 默认沿用已快照的 variation plan；只有显式“换一个方向”才创建新计划版本。
- Runtime Provider 只消费既定 exploration context，不能重新阅读原文随机抽样。

### 后续关注

- 先完成 CAP-10.3 的普通功能文档规范化和明星组合 golden fixture。
- 先实现 deterministic planner 与 3/6 variation 测试，再接用户滑块和真实 Runtime。

## 2026-07-13 CAP-M10.4 HTML Example Sanitizer and Preview Gate

### 已完成

- 扩展 `HtmlExampleReference`：
  - `sanitizedArtifactId`。
  - sanitizer content hash、findings 和时间。
  - preview smoke static/pixel 状态、issues 和时间。
- 新增 parse5/PostCSS 结构化 sanitizer：
  - 删除 script、iframe、object、embed、form、base。
  - 删除 inline `on*` handler、`srcdoc` 和危险 URL scheme。
  - 删除外部 stylesheet、外部资源 URL、CSS `@import` 和外部 CSS `url()`。
  - 脱敏 email、API key/token/password、Bearer token 和绝对路径。
  - logo/wordmark/公共品牌线索进入 warning，要求人工 license/trade dress 审查。
  - 清理后再次检查 active content、外部依赖和绝对路径是否残留。
- sanitizer 通过后：
  - 生成独立 `asset` artifact，不把大段 HTML 直接写入 draft JSON。
  - artifact 固定 source artifact、draft id、storage key 和 content hash。
  - draft 保存 sanitized artifact 引用和完整 findings。
  - 同一 draft、同一 sanitized content hash 重复执行时复用已有 artifact，避免重复产物。
- 新增 preview smoke：
  - 未 sanitize 的 draft 禁止 preview。
  - 复用 `analyzeHtmlArtifactQuality()` 作为强制 static gate。
  - `DUDESIGN_CAPABILITY_AUTHORING_PIXEL_GATE=1` 时复用 Playwright pixel gate。
  - preview pass 进入 `ready`；warning 回到 `needs_confirmation`；fail 进入 `lint_failed`。
- 新增 API：
  - `POST /api/capability-authoring/drafts/:id/sanitize`。
  - `POST /api/capability-authoring/drafts/:id/preview`。
- `CreateArtifactInput` 支持可选预分配 artifact id，保证 Artifact Store 路径、repository id 和 draft 引用一致。

### 测试

- sanitizer 覆盖 script、event handler、external stylesheet/resource、CSS URL、secret/email/path 脱敏和品牌 warning。
- safe relative assets 与 inline CSS 保留。
- Application Service 覆盖 sanitized artifact 固化、warning 人工确认、未 sanitize 禁 preview 和 static preview -> ready。
- HTTP flow 覆盖 analyze -> sanitize -> preview -> ready。

### 边界

- 默认只强制 static preview；真实 pixel gate 需 staging/production Chromium 环境 opt-in。
- sanitizer warning 不阻止生成安全 artifact，但会保留 `needs_confirmation` 供用户确认。
- private publish 仍未开放，下一步需要把 `ready` 状态转成版本化私有 Design Template Pack，并记录审计。

### 下一步

- 在 Chromium staging 环境开启 authoring pixel gate 跑真实 preview smoke。
- 实现 `ready -> published_private` command、模板 version 创建和审计日志。
- 增加 draft 删除、source 更新后的无引用 sanitized artifact cleanup。

## 2026-07-13 CAP-M10.3 HTML and CSS AST Extraction

### 已完成

- API workspace 显式依赖 `parse5` 和 `postcss`，不以正则作为 HTML/CSS 主解析器。
- 新增 `htmlTemplateExtractor.ts`：
  - parse5 DOM 解析语义 section、结构角色和 DOM evidence。
  - PostCSS AST 解析 CSS variables、颜色、排版、间距、圆角和 box-shadow。
  - 提取 media query 为 `ResponsiveRule`。
  - 识别重复 card/item/tile/member/work 等 component candidate。
  - 识别 tab、accordion、modal、page switcher、carousel 和 local filter 的 role/state。
  - 仅把现有 registry 中真实存在的 Interaction Paradigm id 写入 draft，未注册交互保留为候选，不伪造 id。
  - 每个 token/section/component/responsive 候选带 source evidence 和 confidence。
  - HTML example 固定到 artifact id/version/content hash/entry path，并保持 `sanitizationStatus: pending`。
- `CapabilityAuthoringApplicationService.analyzeDraft()`：
  - 当前只接受冻结的 variation HTML source。
  - 从 Artifact Store 读取 HTML。
  - 从同一 parent artifact 的相对 CSS assets 读取样式。
  - 检查 artifact version/content hash 未漂移。
  - 生成单个 `DesignTemplateDraftV2`，写入 candidate bundle 后运行 lint。
- 新增 `POST /api/capability-authoring/drafts/:id/analyze`。

### 测试

- extractor golden 覆盖 CSS variables、typography、spacing、radius、elevation、semantic sections、repeated cards、tabs、accordion 和 mobile media query。
- malformed CSS 不阻断 DOM section 提取。
- Application Service 测试覆盖真实 LocalArtifactStore HTML/CSS 读取和非空 draft。
- HTTP API flow 覆盖 variation source -> analyze -> 非空 tokens/sections/html example。

### 边界

- JavaScript 不执行，只根据 DOM 属性和命名做受控交互特征识别。
- 当前不自动生成业务 Skill、Data Contract 或 Review Profile。
- HTML reference 尚未完成去敏、外部脚本/网络依赖清理，因此不能 private publish 或进入 Runtime。
- 普通功能 Markdown 的 Capability Spec Importer 尚未开始。

### 下一步

- 实现 HTML example sanitizer：隐私/secret、品牌标识、外部脚本、网络请求、绝对路径和危险 URL 检查。
- sanitizer 通过后再实现 draft preview smoke。
- 在可用 PostgreSQL 环境运行 `0019_capability_authoring_drafts` migration smoke。

## 2026-07-13 CAP-M10.2 Authoring Persistence and Application Service

### 已完成

- 新增 migration `0019_capability_authoring_drafts.sql`：
  - 固化 owner、workspace、source type、source artifact、content hash、完整 source JSON。
  - 保存 draft bundle、findings、confirmed paths 和状态。
  - 增加 owner/workspace、workspace/status 和 source artifact 查询索引。
- `PostgresRepository` 增加 SQL-native authoring draft：
  - list/get 不依赖 hydrate cache。
  - upsert 保持 owner/workspace 不可变，冲突时明确失败。
  - hydrate 模式同步回灌 draft cache。
- 新增 `CapabilityAuthoringApplicationService`：
  - 创建、列表、详情、更新和 lint。
  - variation source 从 repository 读取真实 artifact version/content hash。
  - 校验 workspace、variation、artifact 归属和 HTML kind。
  - 文档 artifact source 使用服务端 artifact content hash。
  - 客户端不能直接写 draft status。
  - 已发布、已提交、已拒绝和已归档 draft 不允许继续编辑。
- 新增用户 API：
  - `POST /api/capability-authoring/drafts`。
  - `GET /api/capability-authoring/drafts?workspaceId=...`。
  - `GET /api/capability-authoring/drafts/:id?workspaceId=...`。
  - `PATCH /api/capability-authoring/drafts/:id`。
  - `POST /api/capability-authoring/drafts/:id/lint`。
- HTTP runtime 输入校验覆盖 workspace、source、candidate bundle 和 confirmed paths。
- CORS 方法补齐 `PATCH` / `DELETE`，支持后续 Draft Review 浏览器调用。

### 边界

- `analyze`、preview smoke、private publish、contribution submit 尚未开放。
- 本轮不读取 HTML 内容，不进行 DOM/CSS AST 提取。
- PostgreSQL 集成测试依赖 `DUDESIGN_POSTGRES_TEST_URL`，当前本地环境未配置时显式 skip。

### 验证

- `npm --workspace @dudesign/api exec tsc -b`。
- capability authoring governance、Application Service 和 API flow 共 11 个测试通过。
- PostgreSQL integration test 已编译并登记 draft write/hydrate/SQL direct query/跨用户隔离断言；本地因无测试 URL 跳过实际数据库执行。

### 下一步

- 在可用 PostgreSQL test/staging 环境执行 migration smoke。
- 开始 HTML/CSS AST extractor：先做 token、section 和 responsive rule 的确定性提取。
- extractor 输出只写入 draft，不直接发布 Design Template Pack。

## 2026-07-13 CAP-M10.1 Authoring Contracts and Governance Kernel

### 已完成

- 在 `@dudesign/contracts` 增加首批能力创作稳定契约：
  - `CapabilityAuthoringSource`。
  - `CapabilityExtractionEvidence`。
  - `DesignTemplateDraftV2`。
  - `DesignSkillDraft`。
  - `InteractionParadigmDraft`。
  - `DataContractDraft`。
  - `ReviewProfileDraft`。
  - `CapabilityBundleDraft`。
  - `CapabilityAuthoringDraft` 与状态枚举。
- 新增 `capabilityAuthoring.ts` 治理内核：
  - 显式 draft 状态迁移表。
  - source content hash / variation artifact version 检查。
  - bundle 非空和 capability profile index 检查。
  - extraction evidence path 与 confidence 检查。
  - 声明式 Skill 的危险指令、prompt injection、shell、绝对路径、可执行内容、长度和 scope 提权 lint。
  - lint 结果确定性映射到 `lint_failed`、`needs_confirmation` 或 `preview_pending`。
- 扩展 `ApplicationRepository` 与 `InMemoryStore`：
  - 保存、按用户/workspace 列表、按 id 读取 authoring draft。
  - 返回 clone，避免调用方修改已保存 draft。
  - 严格按 `ownerUserId + workspaceId` 隔离。

### 边界

- 本轮没有新增 API 路由、用户端 UI、PostgreSQL migration 或 Runtime Gateway 注入。
- 当前 repository 能力仅用于内存测试和后续 Application Service 接入，不宣称 production persistence 已完成。
- draft 仍是候选能力，不能直接进入官方 registry 或 runtime snapshot。

### 验证

- `npm --workspace @dudesign/contracts exec tsc -b`。
- `npm --workspace @dudesign/api exec tsc -b`。
- `node --test apps/api/dist/capabilityAuthoring.test.js apps/api/dist/designTemplatePack.test.js apps/api/dist/capabilities.test.js`。
- 共 24 个相关测试通过。

### 下一步

- 新增 `capability_authoring_drafts` PostgreSQL migration 和 SQL-native repository 实现。
- 提取 `CapabilityAuthoringApplicationService`，接入 source 权限校验、创建、读取、lint 和更新命令。
- 再进入 HTML/CSS AST extractor，避免在持久化和权限边界不稳定时提前扩张解析能力。

## 2026-07-13 CAP-M10 Template & Skill Authoring Governance Admission

### 已完成

- 新增 `template-skill-authoring-governance-plan.md`。
- 规划覆盖 HTML -> Template Draft v2、普通功能文档规范化、用户私有 Skill、能力导出、用户贡献、管理端审核发布和多 Runtime Provider 兼容。
- 将任务同步登记到 CAP-10、UX-11、ADM-9、APP-12 和 RTC-12。

### 实测证据

- 使用“明星组合动态百科功能设计文档”运行现有 importer：
  - 模板名回退为 `Imported Design Template`。
  - colors / typography / spacing / rounded / components 均为空。
  - 标准 Overview / Layout / Components / Do/Don't 均为空。
  - 八个业务章节仅作为 unknown sections 保留。
  - lint 结果为 1 warning + 8 info。
- 当前 variation“保存为模板”有 assigned pack 时复制原模板，无 assigned pack 时生成 token 全空 fallback pack，HTML 只写入 `previewArtifactId`。
- Runtime Gateway 不读取 `previewArtifactId` 作为生成上下文，只消费 tokens、rationale、sections、dos/donts、htmlExamples 和 Skill context。
- `exportDesignTemplatePackToDesignMd()` 已存在，但尚无用户 API/UI。
- 用户 Skill 选择器只展示 official active plugin，尚无私有 Skill CRUD。
- 管理端可见 lint/preview/diff 和风险插件禁用，但模板/Skill 发布写 API尚未落地。

### 准入决策

- 该能力属于 Capability Distribution System，不新增第五层。
- “明星组合”文档应建模为 Business Template Package + Child Templates + Skills + Interaction Paradigms + Data Contract + Review Profile。
- 普通功能文档不能未经结构化和人工确认直接发布。
- HTML 可以提取视觉、结构、响应式和本地交互，但不能自动推导事实治理、业务优先级或工具权限。
- 用户 Skill 首版只允许声明式内容。
- 优先推进 HTML -> Template Draft v2，再推进普通功能文档规范化和用户私有 Skill。

### 验证

- 文档链接和跨模块 TODO 已登记。
- 本轮仅修改文档，不执行代码测试。

## 2026-07-08 CAP-M8.9 Dynamic Encyclopedia Vertical Template Roadmap

### 已完成

- 新增垂类模板迭代规划文档：`docs/dynamic-encyclopedia-vertical-template-roadmap.md`。
- 将 Obsidian Vault `BaiDu/动态百科/04_垂类模板与内容` 中的需求沉淀为 DUDesign 内部规划：
  - 历史人物：关系图谱、事件因果链、人物列表/排名。
  - 电影作品：演员-角色网络、系列/IP 导航、剧情脉络、相似推荐。
  - 电视剧作品：角色关系、分集剧情链、伏笔/回收、系列导航。
  - 文化类词语：关联词图谱、出处典故、词义辨析。
- 注册首批高优垂类子模板：
  - `dtp_de_history_person_relationship`。
  - `dtp_de_history_person_event_chain`。
  - `dtp_de_film_cast_role_network`。
  - `dtp_de_film_series_navigation`。
  - `dtp_de_tv_character_relation`。
  - `dtp_de_tv_episode_chain`。
  - `dtp_de_cultural_phrase_relation_graph`。
  - `dtp_de_cultural_phrase_origin_story`。
- 扩展 `InteractionParadigm`：
  - `ip_causal_event_chain`。
  - `ip_series_navigation`。
- 扩展 democase mock 和 application-service guidance 规则，让历史人物、电影、电视剧、文化类词语可以自动推荐垂类模板。
- 用户端低置信度分类确认选项更新为新的高优垂类集合。
- 单测/API smoke 增加垂类模板 registry、交互范式映射和 guidance 推荐断言。

### 决策

- 当前仍复用 `primaryCategory` / `secondaryCategory` / `tertiaryCategory` 持久化字段，不新增数据库迁移。
- 新分类值开始向动态百科文档里的 L1/L2 体系靠拢，例如 `影视作品 / 电影`、`影视作品 / 电视剧`、`知识术语 / 文化类词语`。
- 垂类模板仍作为 `dtp_dynamic_encyclopedia_card` 的 child template，不引入新的模板层级实体。
- 交互范式关联仍以 `InteractionParadigm.compatibleTemplatePackIds` 为唯一事实来源。

### 后续关注

- 为 guidance metadata 增加结构化 `classificationVector`，表达 L1/L2/L3+、推荐模块优先级和分类信号。
- 扩展 `encyclopediaSpecReview` 的垂类规则：
  - 影视禁止盗版播放/下载/网盘/磁力入口。
  - 影视剧情、分集、评分、票房不得幻觉。
  - 历史人物关系和事件链不得编造。
  - 文化词语典故缺可靠出处时隐藏，不硬拼。
- Runtime Gateway 需要把垂类模板 rationale 和业务上下文编译进 BabeL-O prompt，并保持内核解耦。

## 2026-07-08 CAP-M8.10 Dynamic Encyclopedia Classification Vector and Vertical Spec Rules

### 已完成

- 新增 `EncyclopediaClassificationVector` contract：
  - `l1` / `l2` / `l3`。
  - `recommendedModulePriorities`。
  - `preferredTemplateIds`。
  - `riskFlags`。
- Application Service 在创建/确认 entry guidance 时写入 `metadata.classificationVector`。
- `toEncyclopediaEntryGuidanceResponse` 将 `classificationVector` 输出到 `templateRequirements.businessContext`，旧 guidance 没有 metadata 时会按当前字段动态补齐。
- `resolveArtifactQualityGateForJob` 将 `classificationVector` 传入动态百科 spec review。
- 扩展垂类 spec review（Stage 1 warning）：
  - 影视卡片禁止播放、下载、网盘、磁力、泄露、盗版资源入口。
  - 影视评分、票房、上映/播出等事实需要来源或不确定性表达。
  - 电视剧集数、分集剧情、伏笔、结局等高幻觉风险内容需要来源/缺失说明。
  - 历史人物关系需要来源/不确定性表达。
  - 历史人物事件链模板需要“起因/经过/结果/影响”结构。
  - 文化词语出处典故需要来源或“暂无可靠出处”。
  - 文化词语关联词需要关系类型标签。
- 测试覆盖：
  - `classificationVector` 进入 API smoke 的 businessContext。
  - 影视、电视剧、历史人物、文化词语四类 spec review warning。

### 决策

- 垂类规则先以 warning 生效，继续观察真实生成分布，避免上线初期阻断过多任务。
- `classificationVector` 暂存在 guidance metadata 和 job businessContext，不新增数据库字段。
- spec review 继续保持确定性静态规则，不引入 LLM 审查，避免自动修复链路不可复现。

### 后续关注

- 管理端治理面板需要展示垂类 spec rule 的命中率、误伤率和升级状态。
- Runtime Gateway 应把 `classificationVector.recommendedModulePriorities` 与 `riskFlags` 注入 BabeL-O prompt。
- 后续可把高置信垂类规则从 warning 升级为 error，纳入自动修复硬门禁。

## 2026-07-03 CAP-M8 Dynamic Encyclopedia Card Planning

### 已完成

- 新增业务规划文档：`docs/dynamic-encyclopedia-card-business-logic-plan.md`。
- 明确动态百科卡片是 `ProductMode + Capability Preset + Business Wizard`，不替代现有 `sourceMode`。
- 明确“词条引导”对用户可表现为一个能力，但系统内部必须拆成：
  - democase 只读 MCP Tool Binding。
  - 百科词条分类与模板匹配 Design Skill。
  - Application Service 词条引导向导。
- 明确“动态百科词条卡片模板包”需要拆出父模板包、子模板和交互范式三层，避免把交互玩法和视觉 token 混在同一模板实体。
- 明确“自动审查”复用 Automation Loop，但需要新增 `loop_encyclopedia_spec_review`、百科规范审查器，以及自动/半自动/关闭三种 review mode。
- CAP-8 已加入 TODO，作为动态百科能力包的准入阶段。

### 决策

- `ProductMode` 与 `SourceMode` 正交：动态百科卡片也应支持从零生成和基于已有 HTML 修改。
- Capability Distribution 只管理模板、插件、MCP、loop profile 和 preset；分类、模板匹配、半自动确认状态机由 Application Service 编排。
- Runtime Gateway 只消费业务层解析后的标准上下文和 tool policy，不直接读取 democase 数据库或用户上传原文。

### 后续关注

- 先补 DesignTemplatePack 父子关系与 InteractionParadigm 契约，再做用户端模式切换。
- `mcp_encyclopedia_democase_readonly` 初期可 mock，但 contract 要按真实 MCP 调用设计。
- 自动审查规则需要与 `dtp_dynamic_encyclopedia_card` rationale 和 KeDU 分类体系对齐。

## 2026-07-03 CAP-M8.1 Dynamic Encyclopedia Capability Registry Foundation

### 已完成

- 新建功能分支：`feature/dynamic-encyclopedia-card`。
- Contracts 增加动态百科能力地基：
  - `ProductMode = web_app | dynamic_encyclopedia_card`。
  - `DesignTemplatePack` 父子元数据：`parentPackId`、`templateRole`、`supportedProductModes`、`supportedEntryCategories`。
  - `InteractionParadigm`。
  - `AutomationLoopProfile.qualityGates` 兼容字段和 `spec_review_refine` repair strategy。
- Capability registry 增加动态百科入口：
  - `tpl_dynamic_encyclopedia_entry`。
  - `plug_encyclopedia_entry_guidance`。
  - `sk_encyclopedia_entry_guidance`。
  - `plug_encyclopedia_democase_readonly`。
  - `mcp_encyclopedia_democase_readonly`。
  - `loop_encyclopedia_spec_review`。
  - `DYNAMIC_ENCYCLOPEDIA_PRESET`。
- 官方模板包增加动态百科子模板：
  - `dtp_dynamic_encyclopedia_summary_card`。
  - `dtp_dynamic_encyclopedia_timeline_card`。
- 交互范式增加首批映射：
  - `ip_entity_summary -> dtp_dynamic_encyclopedia_summary_card`。
  - `ip_timeline_story -> dtp_dynamic_encyclopedia_timeline_card`。
- 单测覆盖动态百科 preset snapshot、交互范式映射、父子模板元数据和官方模板合规约束。

### 验证

- `npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js`
- `npx tsc -b apps/api packages/contracts packages/domain packages/runtime-gateway`

### 决策

- 本分支第一步只注册能力地基，不一次性改穿 productMode 顶层化、数据库迁移、entry guidance API 和用户端模式切换。
- `qualityGates` 先作为兼容字段引入，保留既有 `qualityGate` / `enablePixelGate`，避免一次改动影响 Automation Loop 事件、前端 Activity Stream 和旧测试。
- 交互范式与模板包关联以 `InteractionParadigm.compatibleTemplatePackIds` 为事实来源，模板包不持久化反向引用。

### 后续关注

- `productMode` 顶层化已在 CAP-M8.2 / APP-M32 / RTC-M8.1 推进；下一步进入 entry guidance mock flow。
- 再下一步实现 `POST /api/encyclopedia/entry-guidance` mock flow。

## 2026-07-03 CAP-M8.2 Dynamic Encyclopedia Product Mode Contract

### 已完成

- `ProductMode` 从规划字段推进为 job 顶层业务字段：
  - contracts `CreateDesignJobRequest.productMode`。
  - domain `DesignJob.productMode`。
  - InMemoryStore / PostgresRepository job 创建与读取。
  - PostgreSQL migration `0011_product_mode.sql`。
  - Runtime Gateway `SpawnVariationAgentsInput.productMode`。
  - BabeL-O `/v1/agents` request body。
- 默认值保持 `web_app`，旧请求不传 `productMode` 时不改变现有 Web&App 生成流程。
- API flow smoke 增加断言：
  - 旧 `from_existing_html` job 默认 `web_app`。
  - 显式 `dynamic_encyclopedia_card` job 可进入 job snapshot。
- Runtime Gateway 测试覆盖 `productMode` 透传到 BabeL-O agent request。

### 验证

- `npx tsc -b packages/contracts packages/domain packages/runtime-gateway && npm --workspace @dudesign/api exec tsc -b && node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway exec tsc -b && node --test packages/runtime-gateway/dist/babelOClient.test.js`

### 决策

- 本轮只将 `productMode` 顶层化到 job，不把 session 改成 product-mode session。原因是生成任务才是动态百科业务事实来源，session 仍可承载同一会话下的多类任务。
- `productMode` 不进入 `templateRequirements`，避免污染 capability snapshot。

### 后续关注

- 下一步实现 entry guidance mock API，让动态百科模式可以在创建 job 前产生分类与推荐。
- 用户端模式切换后再开始传 `productMode=dynamic_encyclopedia_card`。

## 2026-07-03 CAP-M5.1 DESIGN.md Private Template Browser E2E

### 已完成

- 用户端模板导入闭环增加浏览器 E2E：
  - 打开模板库。
  - 切换到“我的模板”。
  - 粘贴 `DESIGN.md`。
  - 创建用户私有 `DesignTemplatePack`。
  - 自动选中新导入模板。
  - 使用该模板创建 design job。
  - 通过 job snapshot 验证 `designTemplatePacks` 和 variation assignment 均指向该私有模板。
- 首页导入成功后自动切换到 template pack 模式，并将新模板设为唯一选中模板，减少用户导入后忘记选择的误操作。
- CAP-7 中 `DESIGN.md -> 私有模板 -> 生成` 的 E2E 门禁已标记完成。

### 验证

- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts -g "import DESIGN.md"`
- `npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts -g "capability distribution|import DESIGN.md"`

### 后续关注

- 继续补 `选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot` 的专门 E2E。
- 结果页/详情页后续可显式展示本次使用的 Design Template Pack 名称，避免用户只能从 API snapshot 验证。

## 2026-07-03 CAP-M5 User-Facing Capability Library

### 已完成

- 用户前端接入 Design Template Pack 库：
  - 官方模板。
  - 我的模板。
  - 最近使用。
  - 收藏。
- 模板卡片展示能力治理需要的核心摘要：
  - color swatch。
  - display/body 字体摘要。
  - rationale / 适用场景。
  - preview artifact 状态。
- 用户私有模板入口接入 `DESIGN.md` import：
  - 前端支持粘贴 `DESIGN.md` 内容。
  - 调用 `POST /api/design-templates/import-design-md`。
  - import 成功后刷新模板库并自动选中新模板。
- Job 创建接入 Design Template Pack 选择：
  - `capabilityRequirements.template.designTemplatePackIds`。
  - `capabilityRequirements.template.autoDistributeTemplatePacks`。
- 用户端插件入口接入 Capability Plugin / Design Skill / MCP Tool Binding registry：
  - MVP 只展示官方 active plugin。
  - skill 写入 `capabilityRequirements.plugins.skillIds`。
  - MCP tool binding 写入 `capabilityRequirements.plugins.mcpToolBindingIds`，仍保持 `policy_only` 治理语义。
  - 插件卡展示类型、scope、规则摘要和安全等级。
- 用户偏好入口扩展：
  - 默认 Design Template Pack。
  - 默认 skill。
  - 默认 loop。
  - 色板、参考品牌、负面要求等高级约束。
- 单变体页接入保存当前版本为模板：
  - 调用 `POST /api/variations/:id/save-template`。
  - 保持来源 artifact/version 由后端记录。

### 验证

- `npm --workspace @dudesign/web run build`
- `npm --workspace @dudesign/web run test:e2e`

### 决策

- 用户端负责选择和展示能力，不在浏览器侧拼接 BabeL-O 私有 prompt。
- Capability 选择继续通过 Application Service 授权和快照化，再由 Runtime Gateway 编译为受控 prompt/tool policy。
- `DESIGN.md` 是导入格式，DUDesign 内部仍以 `DesignTemplatePack` 作为稳定契约。

### 后续关注

- CAP-7 仍需补专门 E2E：
  - 上传或粘贴 `DESIGN.md` -> 保存私有模板 -> 用该模板生成。
  - 选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- Runtime Gateway golden 仍需覆盖 safe skill 选择后的 prompt block 和 tool policy。
- 管理端 Capability Governance 仍未实现，后续需要展示模板、skill、MCP policy 和 usage events。

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

## 2026-07-01 CAP-M3 Template IA Consolidation

### 背景

- 当前用户端模板菜单将 `Styles / Domain / Aesthetic / Palette` 并列展示。
- 从用户心智看，这四项都会被理解为“风格”，其中：
  - `Styles` 与 `Aesthetic` 重叠。
  - `Palette` 是视觉风格的高级覆盖项，不应与场景并列。
  - `Premium Product Page` 这类条目混合了页面场景、视觉气质和品牌参考。

### 已完成

- 将模板产品信息架构明确为三层：
  - 场景：用户要做什么类型的网站或页面。
  - 视觉：用户希望页面呈现什么视觉气质。
  - 高级：色板、补充风格词、参考品牌、负面要求。
- 更新 `templates.md`：
  - 明确 UI label 建议：`Scene / Visual / Advanced`。
  - 明确底层契约仍保留 `DomainTemplate / AestheticProfile / ColorPalette`。
  - 新增 `BrandStyleReference` 草案。
  - 明确参考品牌只能作为 inspiration，不得复制品牌资产、文案、商标或造成官方背书误解。
- 更新 `README.md` 和 `TODO.md`，将后续前端接入任务调整为“场景 / 视觉 / 高级”。

### 决策

- 产品展示层不再使用“风格 / 领域 / 审美 / 配色”四个并列入口。
- 工程契约层暂不重命名已落地字段，避免破坏 `capabilitySnapshot`、用户偏好和 runtime prompt 编译。
- `ColorPalette` 作为 `AestheticProfile` 的高级覆盖项展示。
- 自由 `Styles` 输入改为高级入口内的补充风格词，不进入官方 registry。
- `BrandStyleReference` 是后续扩展项，必须带有 `inspiration_only` 和 forbidden rules。

### 下一步

- 更新用户前端工作台 composer：
  - `Domain` 改为 `Scene`。
  - `Aesthetic` 改为 `Visual`。
  - `Palette` 和 `Styles` 移入 `Advanced`。
  - 预留参考品牌和负面要求字段。
- 梳理官方 registry，将混合场景/视觉/品牌参考的条目拆分。

## 2026-07-01 CAP-M3.1 Open Design Reference Mapping

### 背景

- 参考 `/Users/tangyaoyue/DEV/open-design` 的模板、设计系统和前端选择器实现，重新校准 DUDesign 的模板 UI 规划。
- Open Design 的价值不在于“更多模板分类”，而在于把生成能力拆成多个独立平面：
  - Mode / Surface。
  - Scenario。
  - Design System。
  - Skill / Design Template。
  - Prompt Template Gallery。

### 已完成

- 在 `templates.md` 新增 Open Design 参考映射。
- 明确 DUDesign 短期仍采用“场景 / 视觉 / 高级”。
- 明确中期应预留 Open Design 式 Design System 能力，用于承载品牌 token、组件、排版、动效、语气和反模式。
- 将 Open Design `template.json` 的字段纳入后续 `AestheticProfile` 扩展参考：
  - `mood`
  - `occasion`
  - `tone`
  - `formality`
  - `density`
  - `palette`
  - `typography`
  - `best_for`
  - `avoid_for`
- 将前端选择器建议写入文档：
  - 单个“设计方向”选择器。
  - 内部 tabs：场景、视觉、高级。
  - 搜索、分类、右侧详情预览。

### 决策

- 不把 Open Design 的 `Design System` 直接等同于 DUDesign 当前的 `BrandStyleReference`。
- `BrandStyleReference` 是高级入口中的轻量 inspiration-only 参考。
- `DesignSystem` 是中期更完整的品牌契约能力，未来可以从已有 HTML、用户上传素材或历史 variation 中提取。
- Prompt Template Gallery 应定位为灵感库/brief starter，不进入正式 capability snapshot，除非用户显式选择保存为模板。

### 下一步

- 用户前端先做轻量 `DesignDirectionPicker`。
- 后端 registry 后续扩展视觉 profile 元数据。
- 中期新增 Design System 文档和数据模型时，再决定是否从 Capability Distribution 中拆成独立子模块。

## 2026-07-01 CAP-M3.2 Design Direction Picker Implementation

### 已完成

- 用户端首页 composer 将原 `Styles / Domain / Aesthetic / Palette` 并列入口替换为单个 Design Direction 入口。
- Design Direction 内部 tabs：
  - Scene。
  - Visual。
  - Advanced。
- Advanced 已承载：
  - Palette。
  - Style notes。
  - Reference brand。
  - Negative requirements。
- 参考品牌和负面要求复用现有 `templateRequirements.notes`，避免新增后端契约。
- Runtime Gateway 将 `templateRequirements.notes` 注入 variation runtime prompt，确保高级约束进入实际生成上下文。

### 决策

- 本阶段只做前端信息架构和 runtime prompt 闭环。
- `BrandStyleReference`、`DesignSystem`、视觉 profile 扩展字段暂不进入代码模型，继续按 TODO 推进。
- 旧 `DomainTemplate / AestheticProfile / ColorPalette` 契约保持不变，确保历史 job snapshot 和用户偏好兼容。

### 下一步

- 增加 runtime-gateway 单测覆盖 `templateRequirements.notes` 注入。
- 扩展 registry 元数据后，再升级视觉卡片内容。

## 2026-07-01 CAP-M3.3 DESIGN.md Ecosystem Reference

### 背景

- 调研 `google-labs-code/design.md`：
  - 重点是 DESIGN.md 规范、lint、diff、export 和 token/prose 双层结构。
  - YAML front matter 存机器可读 token。
  - Markdown 正文存设计意图、组件规则和 Do / Don't。
- 调研 `VoltAgent/awesome-design-md`：
  - 重点是大量品牌设计系统样例的组织方式。
  - 对 DUDesign 的价值是模板库分发、分类和预览方式，而不是直接复制品牌视觉。

### 已完成

- 更新 `README.md`：
  - 增加 Design Template / Design Skill / Capability Profile 三分法。
  - 明确 `DESIGN.md` 是导入/导出兼容格式，不是 DUDesign 唯一内部格式。
  - 增加 `design_template_versions` 和 `capability_profiles` 数据对象建议。
- 更新 `templates.md`：
  - 增加 `DESIGN.md` 与 Template Pack 治理章节。
  - 定义 `DesignTemplatePack` 草案。
  - 明确官方模板应抽象为通用启发式模板，而不是品牌克隆。
  - 明确用户模板来源：上传 `DESIGN.md`、从已有 HTML/variation 提取、手动编辑。
  - 明确多 variation 可以按不同 template pack 自动分配。
- 更新 `plugins.md`：
  - 明确 Design Skill 与 Design Template 的边界。
  - Skill 管生成方法，Template 管视觉系统。
- 更新 `TODO.md`：
  - 增加 `DESIGN.md` import/lint/export。
  - 增加 Design Template Pack adapter。
  - 增加官方模板、用户模板、模板卡片、管理端 lint/diff/preview smoke 任务。
- 更新 `online-design-platform-plan.md`：
  - 将 `DESIGN.md` 生态启发写入总规划。

### 决策

- DUDesign 可以兼容 `DESIGN.md`，但内部必须保留 stable contract。
- 官方模板不能直接复制公开品牌名称、logo、专有字体、商标元素或明显 trade dress。
- 用户偏好只保存 template/skill/profile id；真实生成依据随 job snapshot 保存完整版本。
- 多变体生成应支持“单模板多方向”和“多模板分配”两种模式。

### 下一步

- 先做 `DesignTemplatePack` 文档定稿和 schema 单测。
- 再做 `DESIGN.md` import/lint 的后端基础能力。
- 然后补 6-8 个 DUDesign 官方启发式模板。

## 2026-07-01 CAP-M3.4 DesignTemplatePack Import Contract

### 已完成

- 在 `@dudesign/contracts` 增加内部稳定模板包契约：
  - `DesignTemplatePack`
  - `DesignTemplatePackImportResult`
  - `DesignTemplatePackLintFinding`
  - token、source、format、visibility、status、lint status 等枚举类型。
- 新增 API 层 `DESIGN.md` adapter：
  - 解析 YAML front matter。
  - 解析 Markdown `##` sections。
  - 规范化 colors、typography、spacing、rounded、components。
  - 保留 unknown sections，方便后续兼容外部扩展。
  - 生成稳定 `dtp_` id。
- 新增 lint 初版：
  - missing front matter。
  - invalid YAML。
  - duplicate section。
  - missing primary。
  - missing typography。
  - broken token reference。
  - component background/text contrast ratio。
  - dangerous instruction 过滤。
- 新增单元测试覆盖：
  - 正常 `DESIGN.md` 导入为 DUDesign Template Pack。
  - broken ref 和低对比 warning。
  - 越权/危险 prompt 指令拦截。
  - unknown section 保留。
- 增加 `yaml` 依赖，避免手写 YAML 缩进解析。
- 修复 InMemoryStore 最近 job/artifact 排序在同毫秒下不稳定的问题：
  - 增加 `compareRecent`，按 updatedAt、createdAt、id 兜底排序。
  - 防止新增测试改变执行顺序后 admin support smoke 偶发拿到错误 latest job。

### 决策

- `DESIGN.md` 只作为导入兼容格式，内部使用 `DesignTemplatePack` stable contract。
- `DESIGN.md` export 暂未实现，保留在 TODO 中后续补齐。
- Runtime Gateway 仍不直接读取用户上传 markdown；后续必须由 Application Service 解析、校验、授权和 snapshot 后再注入。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 下一步

- 增加 Design Template Pack 持久化表或 capability table。
- 增加 `POST /api/design-templates/import-design-md` 草案 API。
- 补 6-8 个 DUDesign 官方启发式模板 seed。

## 2026-07-01 CAP-M3.5 Template Contract Split

### 已完成

- 扩展 `@dudesign/contracts` 模板契约：
  - 新增 `BrandStyleReference`。
  - 新增 `AdvancedTemplateConstraints`。
  - 扩展 `AestheticProfile`：`mood`、`occasion`、`tone`、`formality`、`density`、`bestFor`、`avoidFor`。
  - `CapabilitySnapshot.template` 增加 `brandStyleReference`。
- 升级 capability schema 到 `2026-07-01.dudesign-capabilities.v2`。
- 拆分官方 registry 中混合品牌/视觉/场景的过渡条目：
  - `Apple-like Product Page` -> `Premium Product Page` 场景。
  - `Apple-like Minimal` -> `Premium Minimal` 视觉。
  - `Apple-inspired` 进入 `BrandStyleReference`，并补充 inspiration-only 和 forbidden rules。
- 新增官方品牌参考：
  - `Apple-inspired`
  - `Stripe-inspired`
  - `Linear-inspired`
- 用户端 Design Direction picker：
  - Visual 卡片展示 mood、density、formality、bestFor 摘要。
  - Advanced 增加官方 brand reference chips。
  - 色板、补充风格词、参考品牌、负面要求写入结构化 `advancedConstraints`。
  - 本地保存高级偏好，刷新后创建 job 不丢 brand reference。
- Runtime Gateway：
  - 将 `AdvancedTemplateConstraints` 编译为独立 prompt block。
  - `CapabilitySnapshot` 中的 `BrandStyleReference` 进入 runtime capability context。
- Job snapshot：
  - 继续把完整 `capabilitySnapshot` 写入 `templateRequirements`。
  - `CapabilitySummary` 显示 `Brand reference`，用于确认 resume/replay 不漂移。

### 决策

- 官方 registry 不再把品牌、场景、视觉混在同一个 `DomainTemplate` 名称里。
- 参考品牌必须是 inspiration-only 抽象约束，不作为品牌克隆模板。
- 高级偏好先做用户端 localStorage 持久化；后端用户偏好表暂不扩字段，避免引入数据库迁移。
- `BrandStyleReference` 进入 contracts/API/runtime，但“从 variation 保存私有模板”仍需要单独的用户模板存储/API/UI。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test`
- `DUDESIGN_WEB_URL=http://localhost:3301 npm --workspace @dudesign/web run test:e2e -- e2e/mock-product-flow.spec.ts`

### 下一步

- 进入 CAP-1 私有模板保存：
  - `POST /api/variations/:id/save-template` 或 `POST /api/design-templates/from-variation`。
  - 增加 `design_templates` / `design_template_versions` 存储。
  - 用户端 variation 页面增加“保存为模板”入口。
  - 模板选择器合并官方模板与用户私有模板。

## 2026-07-01 CAP-M3.6 DesignSystem Plan and Official Heuristic Templates

### 已完成

- 补齐中期 `DesignSystem` 能力规划：
  - Brand Tokens
  - Typography
  - Components
  - Motion
  - Voice
  - Anti-patterns
- 明确 `DesignSystem`、`DesignTemplatePack`、高级字段之间的层级：
  - 高级字段是一次 job 的轻量约束。
  - `DesignTemplatePack` 是可保存、可 import/export 的模板资产。
  - `DesignSystem` 是长期可复用、可治理、可版本化的品牌/产品设计系统。
- 新增 `exportDesignTemplatePackToDesignMd`：
  - 将 DUDesign stable `DesignTemplatePack` 导出为 `DESIGN.md` front matter + Markdown sections。
  - 支持 colors、typography、spacing、rounded、components。
  - 支持 Overview、Colors、Typography、Layout、Elevation、Shapes、Components、Do's and Don'ts 以及 unknown sections。
- 新增 8 个 DUDesign 官方启发式模板 seed：
  - Premium Product Launch
  - Trust-Centered Fintech
  - Editorial Creative Portfolio
  - Enterprise Clarity
  - Mobility Launch
  - Developer Workflow
  - Warm Commerce
  - Data-Dense Operations
- 新增单元测试：
  - `DesignTemplatePack -> DESIGN.md -> DesignTemplatePack` round-trip。
  - 官方模板数量限制为 6-8 个。
  - 官方模板不包含公开品牌名称。
  - 官方模板必须带有反克隆约束。
  - 官方模板都能 export/import 为有效 `DESIGN.md`。

### 决策

- 官方模板使用通用场景/产品语言，不使用公开品牌名称作为模板身份。
- 公开品牌只能作为 inspiration-only `BrandStyleReference` 或用户高级约束，不进入官方模板 seed 名称。
- 官方模板必须通过 lint/export/import round-trip，再进入用户端可选 UI。
- `DesignSystem` 暂不直接进入数据库模型；下一步先完善私有模板保存和 Template Pack 持久化。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test`

### 下一步

- 增加 `design_templates` / `design_template_versions` 存储。
- 增加 `POST /api/design-templates/import-design-md` 和 `POST /api/design-templates/from-variation`。
- 将官方 Template Pack seed 接入 capability listing 或独立 template listing API。
- 用户端模板选择器合并官方模板、用户私有模板和当前轻量 Scene / Visual / Advanced 选择。

## 2026-07-01 CAP-M3.7 Private Templates and Template Pack Snapshot

### 已完成

- 新增用户私有模板 API MVP：
  - `GET /api/design-templates`
  - `POST /api/design-templates/import-design-md`
  - `POST /api/variations/:id/save-template`
- `DESIGN.md` 上传/粘贴导入：
  - 继续复用 `importDesignMd` lint。
  - 导入结果保存为 `source=user`、`visibility=private`、`status=published` 的 `DesignTemplatePack`。
  - 私有模板按 `createdByUserId` 隔离。
- 从 variation 保存私有模板：
  - 使用当前 variation 已分配的 `DesignTemplatePack` 作为基础。
  - 将当前 artifact 写入 `previewArtifactId`。
  - 如果没有已分配模板，则生成 fallback private pack。
- 多 variation 自动分配：
  - 创建 job 时解析显式 `designTemplatePackIds`。
  - 当 `autoDistributeTemplatePacks=true` 或未显式选择模板时，从官方/用户模板 registry 补足 variation 数量。
  - 每个 variation 保存 `{ variationIndex, designTemplatePackId, designTemplatePack }` assignment。
- Snapshot 不漂移：
  - `templateRequirements.designTemplatePacks` 保存完整 pack snapshot。
  - `templateRequirements.variationTemplateAssignments` 保存每个 variation 的 pack snapshot。
  - `GET /api/design-jobs/:id` 和 `GET /api/variations/:id` 返回固定 snapshot，不依赖 registry latest。
- Runtime Gateway：
  - 将当前 variation 分配到的 Template Pack 编译进 BabeL-O prompt。
  - Prompt 只传摘要化 token、rationale、dos/donts，避免泄露无关内部对象。
- API smoke：
  - 覆盖导入私有 `DESIGN.md` 模板。
  - 覆盖 3 variation 自动分配不同 Template Pack。
  - 覆盖 job snapshot 中的 template assignment 不漂移。
  - 覆盖从 variation 保存私有模板。

### 决策

- 本阶段先做 API + InMemoryRepository MVP，确保产品语义跑通。
- Postgres 真实持久化表仍作为后续 M：需要新增 `design_templates` / `design_template_versions` migration。
- 用户端 UI 暂未接入保存/导入按钮；后续需要接入模板选择器和 variation 页保存入口。
- Runtime 只消费标准化后的 Template Pack snapshot，不直接读取用户原始 `DESIGN.md`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/runtime-gateway run test`
- `npm --workspace @dudesign/api run test -- designTemplatePack.test.js officialDesignTemplatePacks.test.js mock-flow.test.js`

说明：本次曾启动一次完整 `npm --workspace @dudesign/api run test`，但环境中已有另一个旧的 `babel-runtime-api-flow.test.js` 进程挂起；为避免混淆，已停止本次完整测试并改跑相关测试集。

### 下一步

- 增加 Postgres `design_templates` / `design_template_versions` migration 与 repository 实现。
- 用户端接入：
  - 设计首页模板选择器读取 `GET /api/design-templates`。
  - Advanced/Template Pack 选择写入 `designTemplatePackIds`。
  - Variation 页增加“保存为模板”入口。
  - DESIGN.md 粘贴/上传入口。
- 增加 resume/regression 测试：registry 中模板被修改后，旧 job 仍使用 job snapshot。

## 2026-07-01 CAP-2.1 Plugin Registry and Runtime Policy

### 已完成

- 扩展 contracts：
  - `CapabilityPlugin`
  - `DesignSkill`
  - `McpToolBinding`
  - `PluginPermissionPolicy`
  - `CapabilityPluginSnapshot`
- 新增官方 CAP-2 registry seed：
  - `Static Export Safe`
  - `Mobile-first Landing`
  - `Accessibility First`
  - `Asset Library Readonly`
  - `Accessibility Validate`
- 明确 MVP 安全边界：
  - Skill 只允许声明式规则、prompt block、负向规则和 checklist。
  - Skill 不允许 shell、安装命令、绝对路径、runtime/system override。
  - MCP tool binding MVP 只允许 `readonly_context`、`asset_readonly`、`validation_only`。
  - `artifact_write` 和 `external_network` 暂不开放。
- Application Service / capability resolver：
  - 校验 skill / MCP id 是否存在。
  - 校验插件 active / safety 状态。
  - 校验 template category 适配范围。
  - 生成 `plugins.pluginSnapshot` 并写入 job capability snapshot。
- Runtime Gateway：
  - 将 selected skills 编译为 `DUDesign plugin context` prompt block。
  - 将 MCP binding 编译为 `toolPolicy`，以 `policy_only` 形式传给 runtime。
  - 明确插件不能覆盖 runtime guardrails、workspace path、model choice 和 artifact 输出要求。
- API smoke：
  - job 创建时选择 `sk_static_export_safe`、`sk_accessibility_first`、`mcp_accessibility_validate`。
  - job snapshot 保留完整 plugin snapshot 和 tool policy。

### 决策

- CAP-2 第一版只做声明式 plugin，不做任意代码插件。
- MCP 当前只做 tool policy 编译，不在 DUDesign API 层直接执行外部 MCP 调用。
- `CapabilityProfile` 先内嵌在 job `CapabilitySnapshot`，暂不新增持久化 profile table。
- 管理端 skill/MCP 治理和用户自定义 skill 留到后续阶段。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- capabilities.test.js mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- 用户端 composer 增加插件/skill 选择入口。
- 管理端增加官方 skill/MCP registry 管理页。
- 增加真实 MCP authorization / audit 记录。
- 增加 plugin usage events，用于统计采用率、失败率和成本。

## 2026-07-01 CAP-3.1 Automation Loop Planning and Test Baseline

### 已完成

- 系统梳理 CAP-3 与 BabeL-O 的测试关系：
  - Loop profile、stop condition、event contract、quality gate、repair prompt builder 属于 DUDesign 后端服务层，可用 mock runtime 测试。
  - 真实 refine 修复、BabeL-O event drift、runtime unavailable、resume 需要 staging BabeL-O smoke。
- 重写 `automation-loop.md` 为可开发规格：
  - 定义 `fast / standard / deep repair` 目标配置。
  - 定义 stop conditions：
    - max attempts
    - max cost
    - max duration
    - quality pass/fail
    - runtime unavailable
    - contract mismatch
    - repeated failure
    - cancelled
  - 定义 loop event contract 草案：
    - `design.loop_started`
    - `design.loop_quality_checked`
    - `design.loop_repair_planned`
    - `design.loop_repair_started`
    - `design.loop_completed`
    - `design.loop_stopped`
  - 定义最小自动修复 prompt 模板。
  - 定义 mock integration、Runtime Gateway contract、BabeL-O staging smoke 测试矩阵。
- 明确现有可复用底座：
  - `AutomationLoopProfile` 初版。
  - 静态 artifact quality gate。
  - 可选 Playwright pixel gate。
  - `design.runtime_warning` artifact quality warning。
  - `refineVariation` current artifact context。
  - 事件持久化和 SSE replay。

### 决策

- CAP-3 不应把所有测试绑定真实 BabeL-O；默认 CI 先使用 unit/mock/contract。
- BabeL-O staging smoke 是上线门禁，不作为默认本地测试。
- MVP 先实现 `maxRepairAttempts`、`maxDurationMs`、`quality pass/fail`、`runtime unavailable`；`maxCostCents` 先预留，待真实计费稳定后启用硬门禁。
- Pixel gate 应由 loop profile 控制，后续逐步替代纯 env 开关。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- runtime-unavailable.test.js babel-runtime-api-flow.test.js designJobEvents.test.js mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- CAP-3.2：扩展 `AutomationLoopProfile` contract，加入 `maxCostCents`、`maxDurationMs`、`repairStrategy`。
- CAP-3.2：实现 stop condition evaluator 和 user-facing stop reason mapper。
- CAP-3.2：将 loop event contract 写入 `packages/contracts/src/events.ts`。
- CAP-3.3：实现 mock runtime repair loop：static fail -> repair -> pass / stopped。

## 2026-07-01 CAP-3.2 Loop Domain Contract and Stop Conditions

### 已完成

- 扩展 `AutomationLoopProfile`：
  - `maxCostCents`
  - `maxDurationMs`
  - `repairStrategy`
- 更新官方 loop profile：
  - `loop_fast`：不自动修复，120s，静态 gate。
  - `loop_standard`：1 次 minimal refine，200 cents，300s，静态 gate。
  - `loop_deep_repair`：2 次 deep refine，500 cents，720s，pixel gate。
- 扩展 `CapabilitySnapshot.automation`：
  - 保存 `maxRepairAttempts`
  - 保存 `maxCostCents`
  - 保存 `maxDurationMs`
- 新增 DUDesign loop event contract：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - `design.loop_completed`
  - `design.loop_stopped`
- 新增 `automationLoop.ts`：
  - `evaluateAutomationLoopStop`
  - `automationLoopUserMessage`
  - `automationIssueFingerprint`
  - `buildAutomationRepairPrompt`
- 覆盖 stop conditions：
  - quality pass
  - max attempts
  - max cost
  - max duration
  - runtime unavailable
  - runtime contract mismatch
  - repeated failure
  - cancelled
- 新增单元测试：
  - loop profile 默认字段。
  - loop override clamp。
  - stop condition evaluator。
  - user-facing reason mapper。
  - minimal repair prompt builder。

### 决策

- 本阶段只落 domain/evaluator/event contract，不自动触发 refine。
- `maxCostCents` 现在进入 snapshot 和 evaluator，真实费用硬门禁后续接 usage/cost 数据。
- repair prompt builder 只生成受控修复请求，不允许 shell、安装命令、绝对路径或外部依赖。
- `quality_passed` 作为 stop reason 保留在 evaluator，但 loop event 中会映射为 `design.loop_completed`。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/capabilities.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 补充修复

- `apiFlowSmoke` 关闭测试 harness 时同步关闭 pooled Chromium browser，避免 mock API flow 输出全绿后因为浏览器池 handle 未释放而悬挂。

### 下一步

- CAP-3.3：生成后发布 loop events。
- CAP-3.3：standard loop 自动调用一次 refine repair。
- CAP-3.3：mock runtime 覆盖 static fail -> repair -> pass / stopped。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。

## 2026-07-01 CAP-3.3 Automation Loop Events and Static Gate Planning

### 已完成

- 将生成后的 HTML artifact 质量检查接入 Automation Loop：
  - runtime HTML artifact。
  - runtime workspace artifact。
- 生成后发布标准 loop events：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_completed`
  - `design.loop_stopped`
  - `design.loop_repair_planned`
- `loop_standard` 在质量未通过且仍有修复次数时，会生成最小自动修复 prompt preview，并发布 `design.loop_repair_planned`。
- job event persistence / SSE replay 已覆盖 loop events，刷新或重连后仍能看到自动化状态。
- mock API flow 更新：
  - 兼容 workspace membership guard 返回 `WORKSPACE_FORBIDDEN`。
  - support failure smoke 使用微小时间间隔避免 latest job 排序同毫秒抖动。

### 决策

- 本阶段只做 loop eventization 和 repair planning，不自动调用 runtime refine。
- loop events 作为 job event 旁路持久化，不改变 variation/job 的完成状态。
- `quality_passed` 映射为 `design.loop_completed`；质量失败但未触发修复时映射为 `design.loop_stopped`。
- `design.loop_repair_planned` 的 prompt 只暴露 preview，供后续 worker/refine 执行阶段消费。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`

### 下一步

- CAP-3.3：standard loop 自动调用一次 refine repair，并发布 `design.loop_repair_started`。
- CAP-3.3：mock runtime 覆盖 static fail -> repair -> pass / max attempts stopped。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。

## 2026-07-01 CAP-3.3 Standard Loop Automatic Repair

### 已完成

- `loop_standard` 在质量检查失败且仍有修复次数时，自动执行一次 runtime refine repair。
- 发布完整自动修复事件链：
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - runtime `design.variation_streaming`
  - runtime `design.variation_completed`
  - 新 artifact 的 `design.loop_quality_checked`
  - 新 artifact 通过时 `design.loop_completed`
- 自动修复使用内部 system message 记录，不伪装成用户手动 prompt。
- 自动修复复用当前 variation runtime session、当前 artifact HTML、workspace root、model context。
- 通过 artifact version 作为 attempts 边界，避免 standard loop 在同一任务中无限递归。
- mock runtime 测试覆盖 `static fail -> automatic repair -> pass`，并断言 current artifact 升级到 v2。

### 决策

- MVP 先以内联后台任务执行 automatic repair，不新增队列表；后续 Queue/Redis worker 化时可把同一逻辑迁移到 worker。
- 自动 repair 不改变 job completed 的定义；它通过 artifact、variation current version 和 loop events 表达修复结果。
- runtime 异常会发布 `design.loop_stopped`，reason 为 `runtime_unavailable`，当前 artifact 保留。
- `deep_repair` 暂不增加更多策略差异；先复用 attempts/quality gate 决策，后续再扩展。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- CAP-3.3：补 max attempts stopped 的 mock test。
- CAP-3.4：让 pixel gate 由 loop profile 控制，而不是仅由 env 开关控制。
- 后端服务层：将 automatic repair 从 inline background task 迁移到 queue worker，支持恢复、限流和观测。

## 2026-07-01 CAP-3.4 Max Attempts and Profile-Controlled Pixel Gate

### 已完成

- 补充 mock integration：`static fail -> automatic repair -> fail -> max_attempts_reached`。
- 验证 standard loop 只启动一次 automatic repair，不会继续递归。
- 验证修复失败后保留 v2 artifact，并发布 `design.loop_stopped`：
  - `reason = max_attempts_reached`
  - `attempts = 1`
- Artifact quality gate 改为优先读取 job capability snapshot：
  - `loop_standard` 使用 static gate。
  - `loop_deep_repair` 通过 `enablePixelGate=true` / `qualityGate=pixel` 启用 pixel gate。
  - 没有 job/capability snapshot 的路径继续使用 `DUDESIGN_ARTIFACT_PIXEL_GATE` env fallback。

### 决策

- Pixel gate 的产品开关归属 CAP-3 loop profile，不再只依赖进程环境变量。
- `DUDESIGN_ARTIFACT_PIXEL_GATE` 保留为无 job 上下文或运维强制开启的 fallback。
- 当前 pixel gate 仍复用现有 Playwright screenshot / pixel analysis；后续可以继续增加更细的视觉规则和阈值配置。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/runtime-gateway run test`

### 下一步

- 后端服务层：将 automatic repair 从 inline background task 迁移到 queue worker。
- 前端交互层：在 job/variation 页面展示 loop event timeline、repair attempt 和 stopped reason。
- Runtime Compatibility：真实 BabeL-O staging smoke 覆盖 automatic refine repair。

## 2026-07-01 CAP-3.5 Queue-backed Automatic Repair

### 已完成

- 将 Automation Loop automatic repair 从 inline background task 迁移到 `refine_job` queue worker。
- 扩展 `RefineJobQueuePayload`，支持：
  - `prompt`
  - `annotationPromptSuffix`
  - `deviceContext`
  - `source = automation_loop | manual`
  - `attempt`
- `processQueuedRefineJob()` 从 501 占位变为真实执行路径：
  - 校验 job/session/workspace/variation/artifact 归属。
  - 读取 base HTML artifact。
  - 调用 runtime `refineVariation()`。
  - 应用并持久化标准 runtime events。
- Automation Loop 在 `design.loop_repair_planned` 后只 enqueue repair，不直接调用 runtime。
- worker 消费 repair 时发布 `design.loop_repair_started`，runtime 不可用时发布 `design.loop_stopped`。
- 自动修复队列使用稳定幂等键：
  - `queue:refine:automation-loop:{artifactId}:attempt:{attempt}`
- `flushBackgroundTasks()` 更新为循环 flush queue/background tasks，确保后台 task 入队的新任务也会在测试和 smoke 中完成。
- 补充 runtime unavailable 回归测试：
  - 初始 artifact 质量失败后成功 enqueue automatic repair。
  - worker 消费 repair 时 runtime refine 抛错。
  - 发布 `design.loop_stopped`，`reason = runtime_unavailable`。
  - 对应 `refine_job` queue state 标记为 `failed`。
  - current artifact 保持在原始版本，不产生漂移。

### 决策

- 用户手动 refine API 暂时保持同步执行，避免在本阶段同时改造前端交互和用户等待语义。
- Automation repair 先复用 `refine_job` 队列，不新增单独 `automation_repair_job` 类型；后续如果需要更细 observability，再拆分 job kind。
- `design.loop_repair_started` 表示 worker 开始消费，而不是 planner 入队成功。
- 队列 payload 中只保存执行上下文，业务事实仍以 job/variation/artifact/event 为准。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/automationLoop.test.js apps/api/dist/designJobEvents.test.js apps/api/dist/designJobQueue.test.js apps/api/dist/designJobWorker.test.js apps/api/dist/mock-flow.test.js apps/api/dist/redisDesignJobQueue.test.js`

### 下一步

- 后端服务层：将手动 refine API 也可选切到 queue-backed 模式，用于长任务和跨进程 worker。
- Runtime Compatibility：真实 BabeL-O staging smoke 覆盖 automatic refine repair。
- 后端服务层：Redis worker staging smoke 覆盖 automatic repair failed/completed 两条路径。
- 前端交互层：展示 loop timeline、repair queue status、stopped reason。

## 2026-07-02 CAP-4 Design Template Persistence and Capability Governance Events

### 已完成

- 新增 PostgreSQL migration `0010_design_templates.sql`：
  - `design_templates`
  - `design_template_versions`
  - `user_preferences` 扩展字段
  - `usage_events.kind` capability 事件扩展
- `ApplicationRepository` 增加模板版本 lookup：
  - `getDesignTemplatePackVersion(templateId, version, userId, workspaceId)`
- `InMemoryStore` 增加不可变模板版本缓存：
  - 当前模板保存在 `designTemplatePacks`
  - 历史版本保存在 `designTemplatePackVersions`
  - 同一 `templateId/version` 不覆盖历史内容
- `PostgresRepository` 实现 SQL-native 模板读写：
  - 官方模板 seed 入库
  - list/get 通过 SQL 权限过滤，不依赖 hydrate cache
  - save 写当前模板，并为新 version 写入 `design_template_versions`
  - version lookup 支持 no-hydrate production mode
- 官方模板与用户私有模板合并读取保持稳定排序：
  - official 在前
  - user/private 在后
  - sort_key/name/id 稳定排序
- 用户私有模板权限隔离：
  - owner 可读
  - 其它用户不可读 private template
  - workspace template 预留 workspace_id 过滤
- job snapshot 显式保存：
  - `capabilityProfileVersion`
  - `designTemplatePackVersions`
- capability usage events 接入：
  - `capability.template.selected`
  - `capability.plugin.selected`
  - `capability.preference.updated`
- 用户偏好扩展保存：
  - 默认 Design Template Pack
  - 默认 skill
  - 默认 MCP tool
  - brand style reference
  - advanced constraints

### 决策

- 本阶段不新增单独 `capability_profiles` 表，先在 job snapshot 中显式保存 profile version，满足 resume 不漂移。
- `DesignTemplatePack` API contract 暂保持前端兼容，版本历史由 repository/table 管理。
- capability usage events 复用 `usage_events`，成本为 0，用于治理统计和后续管理端分析。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/capabilities.test.js apps/api/dist/designTemplatePack.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/apiFlowSmoke.test.js apps/api/dist/postgresRepository.test.js`
- 真实 PostgreSQL opt-in：
  - 临时端口：`55432`
  - `DUDESIGN_POSTGRES_TEST_URL=postgresql://127.0.0.1:55432/dudesign_test`
  - `node --test --test-concurrency=1 apps/api/dist/postgresRepository.test.js apps/api/dist/postgres-api-flow.test.js`
  - 覆盖 migration、hydrate、production no-hydrate API flow、多用户隔离、私有模板隔离、版本 lookup 和 capability usage events。

> 本轮使用本机临时 PostgreSQL 实例完成 opt-in 验证；测试后已停止并清理临时数据目录。

### 下一步

- 管理端治理：展示模板版本、usage 统计和 lint/drift 状态。
- 用户前端：官方模板 / 我的模板 / 最近使用 / 收藏入口。
- PostgreSQL 真实环境：后续在 CI/staging 增加固定 opt-in job，避免本地手动验证成为唯一门禁。

## 2026-07-03 CAP-5/6 Loop Activity and Dynamic Encyclopedia Template Pack

### 已完成

- 用户端 Activity Stream 接入 automation loop 标准事件：
  - `design.loop_started`
  - `design.loop_quality_checked`
  - `design.loop_repair_planned`
  - `design.loop_repair_started`
  - `design.loop_completed`
  - `design.loop_stopped`
- Activity Stream 现在展示 loop 检查、质量结果、自动修复计划、修复开始、完成和停止原因。
- 直接参考 `/Users/tangyaoyue/DEV/open-design` 的模板资产结构：
  - `plugins/_official/*-templates/*/template.json`
  - `design-systems/<id>/manifest.json`
  - `design-systems/<id>/DESIGN.md`
  - `design-systems/<id>/design-tokens.json` / `tokens.css`
  - DUDesign 保持模板治理与 skill/plugin 治理分离，但模板字段、资产包组织和中期 Design System 规划直接对齐上述资产形态。
- 新增官方业务模板包：
  - `dtp_dynamic_encyclopedia_card`
  - 名称：`Dynamic Encyclopedia Entry Card`
  - 定位：动态百科词条卡片模板包，后续可继续拆 summary、timeline、relation、comparison、expandable fact-card 等子模板。
- 模板包内固化首版基础约束：
  - 主色 `#6487FA`
  - 内容背景 `#FFFFFF` / `#F8F8F8`
  - 文本色 `#1E1F24` / `#848691` / `#B7B9C1`
  - PC 固定 `788x492`
  - WISE 标准 `380x456`
  - WISE 兼容 `396x475` / `300x360`
  - 移动端 iframe / touch / scroll 交互约束
  - 避免视频、下载和跳链作为核心交互
- CAP-6 增加“管理业务模板包及其子模板”治理项。
- Runtime Gateway 的 `DesignTemplatePack` prompt block 已强化：
  - 输出 component token 详情，而不是只输出组件名。
  - 输出 `rationale.sections`，确保尺寸、滚动、iframe/touch 等业务约束能进入 BabeL-O 子 session prompt。

### 决策

- “动态百科词条卡片”先作为官方 Design Template Pack 根模板入库，不在本轮创建子模板表；子模板先记录在 pack rationale sections 中。
- 管理官方场景模板、视觉 profile、色板和参考品牌仍归 CAP-6/Admin Console 治理，不混入用户端 Activity Stream 改造。
- 官方模板数量上限从 8 放宽到 9，用于容纳第一个真实业务模板包。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/capabilities.test.js`
- `npm --workspace @dudesign/runtime-gateway test`

### 下一步

- 管理端治理：官方场景模板、视觉 profile、色板、参考品牌、Design Template Pack CRUD。
- 用户端：在模板选择器中强化官方模板 / 我的模板 / 业务模板包的分组展示。
- Runtime Gateway：继续把模板包 prompt block 纳入真实 BabeL-O golden event / prompt contract 回放。

## 2026-07-03 CAP-6 Template Governance Closure

### 已完成

- 新增管理端模板治理只读 API：
  - `GET /api/admin/capabilities/templates`
  - 返回官方模板、用户/工作区模板、业务模板包的治理摘要。
  - 返回 lint 状态、required actions、prompt block coverage 和子模板草案。
- 新增 CAP-6 模板治理 lint：
  - schema version。
  - official visibility/status。
  - primary/surface color token。
  - typography/component token。
  - negative rules / anti-clone trade dress guardrail。
  - `rationale.sections` 是否足以进入 runtime prompt block。
  - “动态百科词条卡片”专属检查：
    - PC `788x492`。
    - WISE `380x456`。
    - explicit `scroll-container`。
    - iframe/touchmove 兼容约束。
    - 子模板草案覆盖 summary/timeline/relation/comparison/expandable。
- “动态百科词条卡片”业务模板包子模板草案已结构化：
  - `summary-card`
  - `timeline-card`
  - `relation-card`
  - `comparison-card`
  - `expandable-fact-card`
- 管理端新增 `Templates` section：
  - 展示 total / official / business packs / lint warnings。
  - 展示 write mode、publish 权限、registry edit 权限。
  - 展示每个模板包的 lint、token 数、section 数、prompt block coverage 和子模板草案。

### 决策

- 用户前端模板列表保持当前页面形态，本阶段不推进：
  - 官方 / 我的 / 业务模板包 / 最近使用分组改造。
  - 业务模板包详情页。
  - 动态百科模板选择后的 composer summary 额外文案。
- CAP-6 当前先做只读治理面板和 lint，编辑 / 发布 / 禁用写操作后续单独做审计流，不在没有审核链路时直接开放。
- 子模板先作为业务模板包的草案 metadata/rationale 展示，后续当需要独立编辑、发布、统计时再拆成独立表。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/mock-flow.test.js apps/api/dist/officialDesignTemplatePacks.test.js`
- `npm --workspace @dudesign/admin run build`

### 下一步

- 管理端模板编辑 / 发布 / 禁用写操作：
  - developer 可编辑 registry 草案。
  - operator 可发布/禁用。
  - 所有写操作进入 audit log。
- 增加 CAP-6 source/license 字段的真实 schema，而不是仅 lint 预留。
- 将模板治理结果接入 staging smoke dashboard。

## 2026-07-03 CAP-6 Official Registry Governance

### 已完成

- 管理端 CAP-6 治理范围从 Design Template Pack 扩展到完整官方 registry：
  - 官方场景模板 / `DomainTemplate`
  - 官方视觉 profile / `AestheticProfile`
  - 官方色板 / `ColorPalette`
  - 官方参考品牌 / `BrandStyleReference`
  - 官方 Design Template Pack
  - 业务模板包 / `Business Template Package`
- `GET /api/admin/capabilities/templates` 新增：
  - `registryAssets`
  - `registryTotals`
- registry asset 统一治理字段：
  - `id`
  - `name`
  - `type`
  - `status`
  - `version`
  - `description`
  - `summary`
  - `requiredActions`
  - `linkedAssetIds`
- 管理端 `Templates` section 增加官方 registry 分组：
  - `Official Scene Templates`
  - `Official Visual Profiles`
  - `Official Palettes`
  - `Official Brand References`
  - `Official Design Template Packs`
  - `Business Template Packages`
- API smoke 增加断言，确保 CAP-6 返回至少一个 scene、visual、palette、brand reference，并能定位：
  - `tpl_fintech_trust`
  - `aes_trustworthy_saas`
  - `pal_blue_white_trust`
  - `brand_apple_inspired`

### 决策

- 本阶段“管理”定义为只读治理、lint、关联完整性和状态可视化。
- 编辑 / 发布 / 禁用仍保留为下一阶段写操作，不在本阶段混入，以免缺少 audit/approval 链路。
- 用户前端模板选择器继续保持当前 UI，不受 CAP-6 管理端治理扩展影响。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api exec tsc -b && node --test --test-concurrency=1 apps/api/dist/mock-flow.test.js`
- `npm --workspace @dudesign/admin run build`

## 2026-07-03 CAP-M8.3 Dynamic Encyclopedia Guidance Snapshot

### 已完成

- `POST /api/encyclopedia/entry-guidance` 输出动态百科 capability preset：
  - `tpl_dynamic_encyclopedia_entry`
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- guidance 结果返回动态百科 child template 推荐，并通过 `designTemplatePackIds` 进入 job 创建流程。
- guidance 结果把业务上下文写入 `templateRequirements.businessContext`：
  - guidance id
  - entry title
  - L1/L2 分类
  - recommended template ids
  - automation mode

### 决策

- 本阶段只做 mock guidance 和 snapshot 注入，不把 guidance 持久化为正式 capability entity。
- 动态百科模式的自动勾选仍通过标准 `CapabilityRequirements` 表达，不新增第五层架构。
- 词条引导向导的业务分类先在 application-service 内实现；生成期 democase 访问仍保留为 MCP binding / Runtime 兼容层职责。

### 验证

- `node --test apps/api/dist/capabilities.test.js apps/api/dist/officialDesignTemplatePacks.test.js apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.4 Confirmed Guidance Capability Snapshot

### 已完成

- guidance 持久化后，confirmed response 可作为创建 dynamic encyclopedia job 的能力输入。
- confirmation 阶段可以覆盖 selected child template 和 automation mode。
- API smoke 验证：
  - 选择 `dtp_dynamic_encyclopedia_timeline_card`
  - 切换 `semi_auto`
  - job snapshot 保留 `loop_encyclopedia_spec_review`
  - max repair attempts 固定为 1
  - variation 使用 confirmed child template

### 决策

- capability snapshot 仍只记录标准能力选择；业务上下文进入 `templateRequirements.businessContext`。
- interaction paradigm 仍待显式持久化，不从 child template id 反推作为最终事实。

### 验证

- `node --test apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.5 Interaction Paradigm as Snapshot Fact

### 已完成

- guidance response 显式返回 `interactionParadigm`。
- 每个 recommended template 明确标注 `interactionParadigmId`。
- confirmed guidance 将 interaction paradigm 写入 `templateRequirements.businessContext`。
- API smoke 覆盖：
  - 默认企业词条先推荐 `ip_entity_summary`
  - 用户确认 timeline child template 后切换为 `ip_timeline_story`
  - job 创建后 business context 保持该 interaction paradigm，不依赖模板 id 反推。

### 决策

- `InteractionParadigm.compatibleTemplatePackIds` 仍是 template -> paradigm 映射来源。
- 生成任务的事实快照以 guidance/job `businessContext.interactionParadigmId` 为准。
- 未来增加新 child template 时，只需更新 interaction paradigm 兼容关系和推荐规则，不需要改变 Runtime Gateway 契约。

### 验证

- `node --test apps/api/dist/mock-flow.test.js`

## 2026-07-03 CAP-M8.6 Dynamic Encyclopedia Parent/Child Template Pack

### 已完成

- 将 `dtp_dynamic_encyclopedia_card` 固化为动态百科父模板包：
  - `templateRole = parent_pack`
  - `supportedProductModes = ['dynamic_encyclopedia_card']`
  - `supportedEntryCategories = ['encyclopedia']`
  - 保留 PC `788x492`、WISE `380x456`、iframe/touch/scroll、交付安全约束。
- `DesignTemplatePack` 父子关系字段已作为契约事实使用：
  - `parentPackId`
  - `templateRole`
  - `supportedProductModes`
  - `supportedEntryCategories`
- 删除/避免 pack 侧 `supportedInteractionParadigms`，以 `InteractionParadigm.compatibleTemplatePackIds` 为唯一事实来源。
- 注册首批 5 个动态百科子模板，并与父包 `packageChildren` 声明对齐：
  - `dtp_dynamic_encyclopedia_summary_card`
  - `dtp_dynamic_encyclopedia_timeline_card`
  - `dtp_dynamic_encyclopedia_relation_card`
  - `dtp_dynamic_encyclopedia_compare_card`
  - `dtp_dynamic_encyclopedia_expandable_card`
- 扩展 `InteractionParadigm`：
  - `ip_entity_summary`
  - `ip_timeline_story`
  - `ip_relation_map`
  - `ip_fact_compare`
  - `ip_expandable_facts`
- guidance 推荐逻辑从摘要/时间线二选一升级为按词条类别和 democase 信号推荐 1-3 个动态百科子模板。
- 用户端 capability i18n 增加新增模板和交互范式中文名/描述。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`

### 后续建议

- 将 `dynamicEncyclopediaRuleTemplateIds` 从硬编码规则迁移到真实分类体系/模板适配表。
- 补 API smoke：关系图谱卡、对比辨析卡、可展开事实卡分别被 guidance 推荐并进入 job snapshot。

## 2026-07-04 CAP-M8.7 Variation Assignment as Spec Review Source

### 发现

- 动态百科 job 可以包含多个候选 child template，并通过 `variationTemplateAssignments` 分配给不同 variation。
- 远端 `牛顿摆` 任务显示，job 级候选模板集合包含 timeline 时，非 timeline variation 也可能被 timeline 审查规则误伤。

### 决策

- job 级 `designTemplatePackIds` 表示候选/可用模板集合，不代表每个 artifact 必须满足全部模板规则。
- `variationTemplateAssignments` 是单个 variation 的 child template 事实来源，spec review、automation repair prompt 和后续 refine 都应使用该 variation 的实际 assignment。
- 管理端展示审查失败原因时，需要同时展示 job 候选模板和 variation 实际模板，以便排查规则误伤。

### 后续建议

- 后端服务层实现 variation-scoped spec review context。
- Runtime Gateway prompt block 已按 variation 注入模板上下文，后端 quality gate 需要与该语义保持一致。

## 2026-07-04 CAP-M8.8 Entry Guidance Plugin Trio and Loop Contract

### 已完成

- 注册并收口词条引导插件三件：
  - `plug_encyclopedia_entry_guidance`
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
- `sk_encyclopedia_entry_guidance.pluginId` 和 `mcp_encyclopedia_democase_readonly.pluginId` 均指向 `plug_encyclopedia_entry_guidance`。
- `plug_encyclopedia_entry_guidance` 标记为 `mixed` 类型，表示同一个能力插件同时承载 declarative skill 和 MCP binding。
- democase MCP binding 显式声明 `scopes = ['readonly_context']`，通过 MVP safe policy。
- 明确 democase MCP binding 只服务生成期 agent；首页词条引导向导的分类查询仍由 application-service 直连 democase 只读服务，不经过 runtime MCP binding。
- `AutomationLoopProfile` 契约移除 legacy 字段：
  - 删除 `qualityGate`
  - 删除 `enablePixelGate`
  - 固化 `qualityGates: ('static' | 'pixel' | 'spec')[]`
  - 保留 `repairStrategy`
- loop profile 迁移：
  - `loop_fast` -> `['static']`
  - `loop_standard` -> `['static']`
  - `loop_deep_repair` -> `['static', 'pixel']`
  - `loop_encyclopedia_spec_review` -> `['static', 'spec', 'pixel']`
- loop events 改为输出多门禁字段：
  - `design.loop_started.payload.qualityGates`
  - `design.loop_quality_checked.payload.gates`
- 用户端插件选择器支持 `mixed` 插件，选择时同时切换对应 skill 与 MCP binding。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="capabilities|Automation Loop|api flow"`

### 后续建议

- Runtime Gateway golden 继续验证 `sk_encyclopedia_entry_guidance` 与 `mcp_encyclopedia_democase_readonly` prompt/tool policy 注入稳定。
- 若后续支持真实 MCP 调用，需要把 `allowRuntimeToolUse` 从 policy-only 灰度到可授权、可审计、可回放链路。

## 2026-07-04 CAP-M8.9 Dynamic Encyclopedia Capability Preset

### 已完成

- 新增标准 `CapabilityPreset` 契约，并通过 `ListCapabilitiesResponse.capabilityPresets` 暴露。
- 将 `preset_dynamic_encyclopedia_card` 从后端内部常量升级为 API 可查询的能力事实：
  - `productMode = dynamic_encyclopedia_card`
  - `domainTemplateId = tpl_dynamic_encyclopedia_entry`
  - `designTemplatePackIds = ['dtp_dynamic_encyclopedia_card']`
  - `skillIds = ['sk_encyclopedia_entry_guidance']`
  - `mcpToolIds = ['mcp_encyclopedia_democase_readonly']`
  - `loopProfileId = loop_encyclopedia_spec_review`
- 用户端切换“动态百科卡片”模式时优先读取 API preset，缺失时才使用本地 fallback id。
- capabilities 单测验证 preset 引用的 domain template、skill、MCP binding、loop profile 都存在。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/api apps/web`
- 已通过：`npm --workspace @dudesign/api run test -- --test-name-pattern="capabilities|api flow"`

### 后续建议

- 管理端展示 `capabilityPresets`，作为业务能力包治理入口。
- 后续若新增 `dtp_dynamic_encyclopedia_explore_card`，需要同步更新 preset 版本策略和父包 `packageChildren`。

### 落地状态

- 后端服务层已在 APP-M44 中实现 variation-scoped spec review context。
- `variationTemplateAssignments` 已作为 spec review 的 child template 事实来源，job 级 `designTemplatePackIds` 仅作为无 assignment 时的兼容回退。

## 2026-07-04 CAP-M8.10 Runtime Gateway Safe Skill Golden

### 已完成

- 补充 Runtime Gateway golden，覆盖动态百科 preset 对应的 safe skill 组合选择：
  - `sk_encyclopedia_entry_guidance`
  - `mcp_encyclopedia_democase_readonly`
- 断言 Babel-O `/v1/agents` payload 中的 `DUDesign plugin context` 稳定包含：
  - 词条引导 skill 的 rules、prompt guidance、avoid、checklist。
  - democase MCP binding 的 policy-only 映射说明。
  - 插件不能覆盖 runtime guardrails、workspace path、model choice、artifact output requirements。
- 断言 `templateRequirements.toolPolicy` 保持 DUDesign 标准形式：
  - `allowedMcpToolIds = ['mcp_encyclopedia_democase_readonly']`
  - `scopes = ['readonly_context']`
  - `requiresUserAuth = false`
  - `auditLevel = usage`
  - `mode = policy_only`
- 将 CAP-7 `Runtime Gateway golden：safe skill 选择后 prompt block 和 tool policy 稳定` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts packages/runtime-gateway`
- 已通过：`npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="safe skill|dynamic encyclopedia|capability|tool policy|prompt"`

### 后续建议

- 继续补 E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- 后续真实 MCP 调用开启前，保持 democase binding 为 `policy_only`，避免 application-service 直连 guidance 查询和生成期 agent tool policy 混淆。

## 2026-07-05 CAP-M8.11 Safe Skill E2E Snapshot

### 已完成

- 补充用户端 E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot。
- 首页 capability summary 增加插件 chip，让用户在生成前能看到已选官方插件/skill。
- Job 结果页增加 job 级 `CapabilitySummary`，不再只在单 variation 页面展示能力快照。
- `CapabilitySummary` 中的 skill 展示名改为优先使用所属 `CapabilityPlugin.name`，避免用户看到 `sk_*` 内部 ID。
- E2E 同时断言后端 job snapshot 中：
  - `plugins.skillIds` 包含 `sk_static_export_safe`。
  - `plugins.mcpToolIds` 为空。
  - `pluginSnapshot.skills` 包含 `sk_static_export_safe`。
  - `pluginSnapshot.toolPolicy.allowedMcpToolIds` 为空。
- 将 CAP-7 `E2E：选择官方 safe skill -> 创建 job -> 结果页展示 capability snapshot` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/web`
- 已通过：`npm --workspace @dudesign/web run test:e2e -- --grep "official safe skill"`

### 后续建议

- 继续补 E2E：模板 + 插件 + standard loop 生成，覆盖多能力组合快照。
- 管理端后续展示 `capabilityPresets` 时，应复用同一套用户可读名称规则，避免泄露内部能力 ID。

## 2026-07-05 CAP-M8.12 Template + Plugin + Standard Loop E2E

### 已完成

- 升级用户端 capability distribution E2E，覆盖模板包 + 官方 safe skill + standard loop 组合生成。
- 测试链路：
  - 选择 `tpl_premium_product_page` 场景。
  - 选择 custom 方向并验证偏好恢复。
  - 回到 template pack 模式，选择 `dtp_premium_product_launch`。
  - 选择官方 safe skill：`sk_static_export_safe`。
  - 选择 `loop_standard`。
  - 创建 job 并在结果页展示 job 级 capability snapshot。
  - 打开单 variation 并展示 variation 级 capability snapshot。
- E2E 同时校验后端 job snapshot：
  - `designTemplatePacks` 包含 `dtp_premium_product_launch`。
  - `capabilitySnapshot.template.domainTemplate.id = tpl_premium_product_page`。
  - 模板包模式下 snapshot 使用模板包默认视觉基线：`aes_trustworthy_saas` / `pal_blue_white_trust`。
  - `capabilitySnapshot.plugins.skillIds` 包含 `sk_static_export_safe`。
  - `capabilitySnapshot.plugins.mcpToolIds` 为空。
  - `capabilitySnapshot.automation.loopProfile.id = loop_standard`。
- 将 CAP-7 `E2E：模板 + 插件 + standard loop 生成` 标记完成。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/web`
- 已通过：`npm --workspace @dudesign/web run test:e2e -- --grep "capability distribution options"`

### 后续建议

- CAP-7 剩余主要门禁是 MCP smoke：从 `policy_only` 升级到真实调用后，覆盖授权、审计、结果注入和回放。
- 在进入真实 MCP 调用前，建议先整理 MCP invocation contract，明确 application-service guidance 查询与 runtime agent tool policy 的边界。

## 2026-07-05 CAP-M8.13 MCP Smoke Prerequisite Contract

### 已完成

- MCP smoke 前置 contract 已落到第 4 层 Runtime Compatibility：
  - `docs/modules/runtime-compatibility/mcp-invocation-contract.md`
  - `McpInvocationRequest`
  - `McpInvocationResult`
  - `McpInvocationAuditRecord`
- Runtime Gateway 已补 contract helper 和测试，用于固定：
  - `policy_only` 输出稳定。
  - selected MCP tool / tool policy / binding target / scope 必须匹配。
  - user auth required 时必须拒绝未授权调用。
  - MCP unavailable 必须转成标准降级 result。

### 当前状态

- CAP-7 的 `MCP smoke：从 policy_only 升级到真实调用后，覆盖授权、审计、结果注入和回放` 仍未完成。
- 本轮完成的是 smoke 前的 contract 地基，避免后续真实 MCP 接入时突破 capability/plugin 权限边界。

### 后续建议

- 下一步进入 Application Service：实现 MCP 调用前授权校验入口和 audit record 持久化。
- 再进入真实 MCP smoke：授权、调用、结果注入、审计、回放。

## 2026-07-06 CAP-9 External Capability Expansion Planning

### 背景

- 新增规划需求：
  - 网络信息搜索 MCP，参考 `Agent-Reach`，用于 skill 输出与审核。
  - 生成图片 MCP，优先考虑火山方舟 `doubao-seedream-5-0-260128` 作为 provider。
  - 双端差异化生产策略 skill，需进入模板选择环节。
  - 模板融合/迭代更新机制，并与 automation loop 协同。
  - 数据输入获取分析 skill。
  - 用户开发模板贡献机制。

### 已更新

- 在 `README.md` 增加“外部能力扩展规划”，明确 CAP-9 不新增第五层架构，而是分摊到 Templates、Plugins、Automation Loop 和 CAP-6 管理端治理。
- 在 `plugins.md` 增加 CAP-9 外部能力细化：
  - `ResearchContextArtifact`。
  - `ImageGenerationRequest`。
  - `sk_dual_surface_strategy`。
  - `sk_data_intake_analysis`。
  - 模板融合/迭代流程。
  - 用户模板贡献生命周期。
- 在 `TODO.md` 增加 Phase CAP-9：
  - CAP-9.1 网络信息搜索 MCP。
  - CAP-9.2 生成图片 MCP。
  - CAP-9.3 双端差异化生产策略 skill。
  - CAP-9.4 数据输入获取分析 skill。
  - CAP-9.5 模板融合与迭代更新机制。
  - CAP-9.6 用户开发模板贡献机制。

### 治理决策

- 外部 MCP 结果不能直接成为事实来源，必须先形成带 source、confidence、freshness、reviewStatus 的 artifact。
- 图片生成不能由 skill 内嵌 curl 或 API key；provider 调用必须由后端服务执行，结果写入 artifact store。
- 双端策略属于 Design Skill，不属于视觉模板；它指导 PC / WISE / mobile 的差异化生成方法。
- 数据输入分析属于前置 brief 能力，推荐模板/skill 时必须解释原因，不能静默覆盖用户显式选择。
- 模板融合和用户贡献必须生成新 version，不覆盖历史 job snapshot。

### 后续建议

- 第一优先级：实现 CAP-9.3 `sk_dual_surface_strategy`，因为它能直接增强动态百科和固定尺寸业务模板。
- 第二优先级：实现 CAP-9.4 `sk_data_intake_analysis`，为 Agent-Reach 和 democase 输入统一结构化 brief。
- 第三优先级：接 CAP-9.1 Agent-Reach research MCP，并补授权、审核、结果注入、审计和回放 smoke。
- 第四优先级：接 CAP-9.2 图片生成 MCP，先走 artifact-backed mock，再接真实 provider。

## 2026-07-06 CAP-9.3 Dual-surface Strategy Skill

### 已完成

- 新增官方插件 `plug_dual_surface_strategy`：
  - `type = skill`
  - `category = responsive`
  - `safetyLevel = safe`
  - 权限保持 `readonly_context` + `validation_only`，不允许 runtime tool use。
- 新增官方 skill `sk_dual_surface_strategy`：
  - 明确 PC / WISE / mobile / embedded iframe 是不同产品端，不是简单 responsive 缩放。
  - 固定尺寸业务模板优先满足标准 viewport，再兼容次级尺寸。
  - 移动和 iframe 场景要求显式滚动容器、稳定控件和 touch-safe interaction。
  - 负向约束禁止全局 `touchmove` 阻断、全局 `touch-action:none`、视频、下载和跳转作为核心移动交互。
- 动态百科 preset 默认选择：
  - `sk_encyclopedia_entry_guidance`
  - `sk_dual_surface_strategy`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- 用户端 dynamic encyclopedia fallback skillIds 同步为词条引导 + 双端策略。
- 补充中文能力文案，插件选择器和 capability summary 可展示用户可读名称。
- Runtime Gateway golden 覆盖 dual-surface prompt block，确保进入 BabeL-O 的 prompt 内容稳定且不覆盖 runtime guardrails。

### 验证

- 已通过：`npx tsc -b packages/contracts apps/api packages/runtime-gateway apps/web`
- 已通过：`npm --workspace @dudesign/api run test -- --test-name-pattern="capability plugin registry|api flow"`
- 已通过：`npm --workspace @dudesign/runtime-gateway run test -- --test-name-pattern="dual-surface|dynamic encyclopedia|capability|tool policy|prompt"`

### 后续建议

- 下一步进入 CAP-9.4：实现 `sk_data_intake_analysis`，把 prompt、URL、粘贴文本、JSON/table、democase 和后续 Agent-Reach research artifact 统一成结构化 brief。
- 然后再做 CAP-9.1 Agent-Reach research MCP；这样检索结果有稳定的 brief 容器，不会直接污染 runtime prompt。

## 2026-07-06 CAP-9.4 Data Intake Analysis Skill Baseline

### 已完成

- 新增 `DataIntakeAnalysis` contract：
  - `inputSources`
  - `topicSummary`
  - `entities`
  - `fields`
  - `missingFields`
  - `recommendedScenarioTemplates`
  - `recommendedDesignTemplatePacks`
  - `recommendedSkills`
  - `riskFlags`
  - `reviewStatus`
- 新增官方插件 `plug_data_intake_analysis`：
  - `type = skill`
  - `category = research`
  - 权限保持 `readonly_context` + `validation_only`
  - 不允许 runtime tool use
- 新增官方 skill `sk_data_intake_analysis`：
  - 要求把松散输入整理为结构化 brief。
  - 要求保留 prompt、URL、粘贴文本、表格、JSON、上传资产、democase、research artifact、existing HTML 和 memory 的来源边界。
  - 推荐模板/skill 时必须说明 reason 和 confidence。
  - memory、democase、research artifact 只能作为 context hints，不作为未经确认的事实。
- 动态百科 preset 默认加入 `sk_data_intake_analysis`，形成：
  - `sk_encyclopedia_entry_guidance`
  - `sk_dual_surface_strategy`
  - `sk_data_intake_analysis`
  - `mcp_encyclopedia_democase_readonly`
  - `loop_encyclopedia_spec_review`
- 用户端中文能力文案新增“数据输入分析”。
- Runtime Gateway golden 覆盖 data-intake prompt block，确保该 skill 进入 BabeL-O prompt 且不能覆盖 runtime guardrails。

### 当前边界

- 已完成 contract + official skill + snapshot/golden baseline。
- 已实现 `POST /api/capabilities/data-intake/analyze`，可生成 deterministic `DataIntakeAnalysis`。
- 分析结果已写入 artifact store，作为 `data_intake_analysis` preflight artifact 返回。
- 已实现创建 job 时引用 data-intake preflight artifact，并把 artifact id、storageKey、contentHash、sizeBytes、schemaVersion、reviewStatus 固化到 job snapshot。
- Agent-Reach research MCP 尚未接入；后续 research result 应先进入 `ResearchContextArtifact`，再被 data-intake 分析吸收。

### 后续建议

- 下一步推进 CAP-9.1 Agent-Reach research MCP，让搜索结果经过 `ResearchContextArtifact -> DataIntakeAnalysis -> Runtime prompt` 的链路。

## 2026-07-06 CAP-9.1 Agent-Reach Research MCP Contract Baseline

### 已完成

- 新增 `ResearchContextArtifact` 合约：
  - `query`。
  - `sources`。
  - `summary`。
  - `citations`。
  - `confidence`。
  - `freshness`。
  - `riskFlags`。
  - `rawPayloadHash`。
  - `reviewStatus`。
- 注册官方网络检索能力族：
  - `plug_research_context`。
  - `sk_research_brief_builder`。
  - `mcp_agent_reach_search`。
  - `mcp_agent_reach_page_read`。
  - `mcp_agent_reach_social_scan`。
- 明确当前 MVP 安全策略：
  - Agent-Reach 能力先走 `readonly_context` 和 `auditLevel=full`。
  - 不直接开放 `external_network` 给 Runtime Gateway。
  - 真实网络访问后续通过管理端灰度和环境配置开启。
- `MockMcpExecutor` 增加 Agent-Reach mock：
  - 搜索、页面读取、社媒扫描统一归一化为 `ResearchContextArtifact`。
  - MCP result 只暴露 reviewed summary、references 和 research context。
  - 不把原始外部 payload 注入 runtime prompt。
- 用户端 skill 本地化增加“网络检索摘要”，插件面板可展示中文名称、规则、负向约束和 checklist。

### 验证

- `ResearchContextArtifact` contract 单测。
- capability registry 单测：
  - 官方插件、skill、MCP binding 可列出。
  - Agent-Reach binding 进入 full audit readonly tool policy。
- MCP executor 单测：
  - mock Agent-Reach search 返回 reviewed research context。

### 决策

- 本阶段先完成离线契约、registry、mock 和审计策略，不直接依赖真实 Agent-Reach 进程或外网搜索结果。
- 后续真实联调必须保持 `Agent-Reach -> ResearchContextArtifact -> DataIntakeAnalysis -> Runtime prompt` 链路，不允许 Runtime Gateway 直接消费 Agent-Reach 原始结果。

### 后续关注

- 将 MCP 调用结果写入 artifact store 或 capability artifact 表，并把 artifact reference 写入 job snapshot。
- 增加网络搜索 MCP API smoke：授权、调用、审核、结果注入、审计和回放。
- 接入真实 Agent-Reach staging route 后补 golden replay，验证事件 drift 不破坏 DUDesign 标准 research context。

## 2026-07-06 CAP-9.1 Research Context Artifact Snapshot Flow

### 已完成

- 扩展 contracts：
  - 新增 `ResearchContextArtifactReference`。
  - `CreateDesignJobRequest.templateRequirements` 支持 `researchContextArtifactIds`。
  - `CreateDesignJobRequest.templateRequirements` 支持 `researchContexts` snapshot。
- Application Service 执行 MCP 调用后自动识别 `result.data.researchContext`：
  - 写入 artifact store：`capabilities/research/context.json`。
  - artifact metadata 记录 `kind=research_context`、`invocationId`、`mcpToolId`、`schemaVersion`、`reviewStatus`、`query`。
  - MCP result 回填 `data.researchContextArtifact`。
- 创建 design job 时支持固定 research context：
  - 从 `researchContextArtifactIds` 或 `researchContexts[].artifactId` 读取 artifact store。
  - 校验 artifact kind 与 JSON schema。
  - 将轻量 reference 写入 job `templateRequirements.researchContexts`。
  - 将 artifact id 列表写入 `templateRequirements.researchContextArtifactIds`。
- API flow smoke 增加 mock Agent-Reach 链路：
  - 创建带 `sk_research_brief_builder` 和 `mcp_agent_reach_search` 的 job。
  - 执行 MCP search。
  - 验证 `ResearchContextArtifact` 被写入 artifact store。
  - 使用该 artifact 创建后续 job。
  - 断言后续 job snapshot 固定 artifact id、storage key、content hash、schema version、review status、query 和 source count。

### 验证

- `npx tsc -b packages/contracts apps/api apps/web`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|capability plugin registry|MockMcpExecutor|HttpMcpExecutor"`

### 决策

- Research context 先复用 artifact store，不新增 PostgreSQL capability artifact 表。
- Job snapshot 只保存轻量 reference，不把完整 research context JSON 展开到 job record，降低 snapshot 膨胀和隐私扩散风险。
- 当前 smoke 使用 mock Agent-Reach；真实 Agent-Reach staging smoke 仍需单独接入，避免本地测试依赖外网和账号状态。

### 后续关注

- 接入真实 Agent-Reach HTTP/CLI route，输出仍必须归一化为 `ResearchContextArtifact`。
- Runtime Gateway prompt 编译阶段需要将 `researchContexts` 与 `dataIntake` 组合成受控上下文，不允许直接传原始 MCP payload。
- 管理端后续展示 research artifact 的来源、reviewStatus、query、sourceCount 和 replay key。

## 2026-07-06 CAP-9.1 Agent-Reach Staging Smoke Scaffold

### 已完成

- 新增 `deploy/staging/scripts/agent-reach-mcp-adapter.py`：
  - 暴露 DUDesign 标准 MCP HTTP endpoint：`POST /v1/mcp/invocations`。
  - 当前支持 `agent-reach.search`。
  - 默认通过 `mcporter call 'exa.web_search_exa(...)'` 调 Agent-Reach web search。
  - 可通过 `AGENT_REACH_SEARCH_COMMAND` 替换搜索命令，便于不同服务器安装方式。
  - 将真实搜索 payload 归一化为 `ResearchContextArtifact`，不把原始 payload 透传给 DUDesign runtime。
  - 外部调用失败时返回标准 MCP `unavailable` result。
- 新增 `deploy/staging/scripts/smoke-agent-reach-remote.sh`：
  - 远端启动 Agent-Reach MCP adapter。
  - 将 staging API 的 `DUDESIGN_MCP_EXECUTOR` 临时切换为 `http`。
  - 创建带 `sk_research_brief_builder` 和 `mcp_agent_reach_search` 的 job。
  - 执行 Agent-Reach search MCP invocation。
  - 验证 DUDesign 写入 `researchContextArtifact`。
  - 创建后续 pinned job，验证 `researchContextArtifactIds` 和 `researchContexts` 写入 job snapshot。
  - 退出时恢复 staging `.env` 并重启 API。
- `deploy/staging/staging.env.example` 增加 Agent-Reach staging smoke env：
  - `DUDESIGN_STAGING_AGENT_REACH_MCP_PORT`。
  - `DUDESIGN_STAGING_AGENT_REACH_QUERY`。

### 本地检查

- 本机执行 `agent-reach doctor --json` 返回 `command not found`，说明当前本机尚未安装 Agent-Reach CLI；因此本轮只做脚手架和静态检查，不声称真实搜索已跑通。

### 决策

- DUDesign API 不直接 shell 调 Agent-Reach，不直接绑定 Agent-Reach CLI 或 `mcporter` 输出格式。
- 真实检索能力通过标准 MCP HTTP adapter 隔离；API 只看 DUDesign MCP result envelope 和 `ResearchContextArtifact`。
- Staging smoke 仍保持 opt-in，不让默认部署依赖外部搜索服务、账号或网络状态。

### 后续关注

- 在 staging 主机安装/配置 Agent-Reach 或 `mcporter` 后运行：
  - `DUDESIGN_STAGING_AGENT_REACH_QUERY="..." deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 若实际 Agent-Reach payload 结构与预期差异较大，更新 adapter 的 `collect_sources()`，但不改变 DUDesign API contract。

## 2026-07-06 CAP-9.1 Agent-Reach Staging Preflight

### 已完成

- 新增 `deploy/staging/scripts/preflight-agent-reach-remote.sh`：
  - 检查远端 SSH 可达。
  - 检查 `python3`。
  - 检查 `docker`。
  - 检查 DUDesign current 部署目录。
  - 检查已部署的 `agent-reach-mcp-adapter.py`。
  - 检查已部署的 `smoke-agent-reach-remote.sh`。
  - 检查 `mcporter` 或 `AGENT_REACH_SEARCH_COMMAND`。
  - 可选运行 `agent-reach doctor --json`。
- 给 Agent-Reach staging 脚本增加执行权限：
  - `agent-reach-mcp-adapter.py`。
  - `smoke-agent-reach-remote.sh`。
  - `preflight-agent-reach-remote.sh`。

### 当前远端检查结果

- `ssh tyy` 可达。
- 远端存在：
  - `/usr/bin/python3`
  - `/usr/bin/docker`
  - `/home/ubuntu/deployments/dudesign/current`
- 远端当前缺少：
  - `deploy/staging/scripts/agent-reach-mcp-adapter.py`
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 因此真实 smoke 尚未运行；需要先提交并部署包含这两个脚本的新版本。

### 本地检查

- `bash -n deploy/staging/scripts/preflight-agent-reach-remote.sh deploy/staging/scripts/smoke-agent-reach-remote.sh`
- `python3 -m py_compile deploy/staging/scripts/agent-reach-mcp-adapter.py`

### 后续顺序

1. 提交并部署当前 DUDesign 改动到 staging。
2. 在 staging 主机安装 `mcporter` / Agent-Reach，或提供 `AGENT_REACH_SEARCH_COMMAND`。
3. 运行 `deploy/staging/scripts/preflight-agent-reach-remote.sh`，直到输出 `agent-reach-preflight:ready`。
4. 运行 `deploy/staging/scripts/smoke-agent-reach-remote.sh`。

## 2026-07-06 CAP-9.1 Staging Deploy And Smoke Stabilization

### 已完成

- 已将包含 Agent-Reach MCP adapter 与 staging smoke 脚本的版本部署到 staging。
- 修复 `deploy/staging/scripts/smoke-mcp-http-remote.sh`：
  - 增加 executable 权限，避免 `smoke-remote.sh` 调用时报 `Permission denied`。
  - API 重启后等待 `/api/dev/bootstrap` 返回可用 JSON，避免刚启动时 502/空响应导致误判。
  - MCP invocation payload 不再依赖 `/api/design-jobs` 返回完整 `userId/workspaceId/sessionId`，改为从 bootstrap 与 session 上下文取值。
  - mock MCP server 从 `127.0.0.1` 改为 `0.0.0.0` 绑定，兼容 Linux Docker 容器通过 `host.docker.internal` 访问宿主机端口。
- 修复 `deploy/staging/scripts/agent-reach-mcp-adapter.py`：
  - adapter 从 `127.0.0.1` 改为 `0.0.0.0` 绑定，支持 staging API 容器访问。
- 修复 `deploy/staging/scripts/smoke-agent-reach-remote.sh`：
  - API 重启后校验 bootstrap user/workspace。
  - Agent-Reach invocation payload 改为使用稳定上下文，不依赖轻量 job envelope。

### 验证结果

- `deploy/staging/scripts/deploy-remote.sh` 已完成部署；基础服务、public web/api/admin、runtime adapter health 均通过。
- `deploy/staging/scripts/smoke-remote.sh` 已通过：
  - BabeL-O prompt smoke 完成。
  - MCP HTTP mock smoke 完成。
- `deploy/staging/scripts/preflight-agent-reach-remote.sh` 已运行到外部检索后端检查：
  - 远端 `python3` 已就位。
  - 远端 `docker` 已就位。
  - DUDesign current 部署目录已就位。
  - 已部署 `agent-reach-mcp-adapter.py`。
  - 已部署 `smoke-agent-reach-remote.sh`。
  - 当前阻塞：staging 主机缺少 `mcporter`，且未配置 `AGENT_REACH_SEARCH_COMMAND`。

### 决策

- 当前不把 “Agent-Reach 真实搜索 smoke” 标记完成，因为外部检索后端尚未安装或配置。
- 先确认 DUDesign 侧 HTTP MCP transport、artifact 写入、job snapshot 逻辑在 mock/staging 基础 smoke 中稳定，再接真实 provider。

### 后续关注

- 在 staging 主机安装 `mcporter` / Agent-Reach，或在远端 shell 环境提供 `AGENT_REACH_SEARCH_COMMAND`。
- 再运行：
  - `deploy/staging/scripts/preflight-agent-reach-remote.sh`
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
- 若真实 provider payload 和 adapter 预期不一致，只调整 adapter 的 source collection/normalization，不改变 DUDesign `ResearchContextArtifact` contract。

## 2026-07-06 CAP-9.1 Custom Search Command Bridge

### 已完成

- `preflight-agent-reach-remote.sh` 支持从本地传入 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`，并在远端映射为 `AGENT_REACH_SEARCH_COMMAND`。
- `smoke-agent-reach-remote.sh` 支持从本地传入 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`，避免要求操作者手动登录远端 export。
- `staging.env.example` 增加 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND` 说明：
  - 命令运行在 staging 主机。
  - stdin 接收 `{"query":"...","numResults":N}`。
  - stdout 需要输出可被 adapter 解析的 JSON 或文本。

### 验证结果

- 使用 fixture search command 跑通 preflight：
  - `agent-reach-preflight:custom-search-command`
  - `agent-reach-preflight:ready`
- 使用 fixture search command 跑通 smoke：
  - adapter 归一化 fixture search result。
  - API 执行 `mcp_agent_reach_search`。
  - research context 写入 artifact。
  - 后续 job snapshot 固定 `researchContextArtifactIds` 与 `researchContexts`。
  - 输出 `agent-reach-smoke:completed`。

### 决策

- 这一步只证明 DUDesign 自定义检索命令桥、HTTP MCP adapter、artifact 写入和 job snapshot 链路可用。
- 这一步不等同于真实 Agent-Reach provider smoke；真实 provider 仍需安装 `mcporter` / Agent-Reach，或提供调用真实 Agent-Reach 的 `DUDESIGN_STAGING_AGENT_REACH_SEARCH_COMMAND`。

### 后续关注

- 将 fixture command 替换为真实 Agent-Reach/mcporter command 后，重新运行 preflight + smoke。
- 记录真实 provider payload schema，并按需调整 `agent-reach-mcp-adapter.py` 的 `collect_sources()`。

## 2026-07-06 CAP-9.1 Real Agent-Reach Staging Install

### 已完成

- 在 staging 主机 `tyy` 安装 Agent-Reach 本体：
  - 安装位置：`/home/ubuntu/.agent-reach-venv`
  - 版本：`agent-reach 1.5.0`
  - Skill 安装位置：`/home/ubuntu/.agents/skills/agent-reach`
- 按官方安装指南补齐基础依赖：
  - `python3.12-venv`
  - `pipx`
  - `nodejs`
  - `npm`
  - `mcporter`
- 配置 Exa MCP：
  - `mcporter config add exa https://mcp.exa.ai/mcp`
  - 配置文件位置：`/home/ubuntu/config/mcporter.json`
- `agent-reach doctor --json` 当前核心可用渠道：
  - `exa_search`：ok，active backend 为 `Exa via mcporter`
  - `web`：ok，active backend 为 `Jina Reader`
  - `rss`：ok，active backend 为 `feedparser`
  - `bilibili`：ok，active backend 为 `B站搜索 API`
- `agent-reach check-update` 返回当前已是最新版本。

### DUDesign 适配修复

- `agent-reach-mcp-adapter.py` 支持 `AGENT_REACH_MCPORTER_CONFIG`：
  - 当设置该变量时，adapter 调用 `mcporter --config <path> call ...`。
  - 避免 `mcporter` 依赖当前 release 目录下的 `config/mcporter.json`。
- `preflight-agent-reach-remote.sh` 自动探测：
  - `$HOME/config/mcporter.json`
  - `$HOME/.mcporter/mcporter.json`
- `smoke-agent-reach-remote.sh` 启动 adapter 时注入探测到的 `AGENT_REACH_MCPORTER_CONFIG`。
- `staging.env.example` 增加 `DUDESIGN_STAGING_AGENT_REACH_MCPORTER_CONFIG`。

### 验证结果

- 直接验证 `mcporter` + Exa：
  - `mcporter call 'exa.web_search_exa(query: "DUDesign Agent-Reach smoke test", numResults: 1)'`
  - 能返回真实搜索结果。
- DUDesign preflight：
  - `agent-reach-preflight:mcporter /usr/local/bin/mcporter`
  - `agent-reach-preflight:mcporter-config /home/ubuntu/config/mcporter.json`
  - `agent-reach-preflight:ready`
- DUDesign real smoke：
  - `deploy/staging/scripts/smoke-agent-reach-remote.sh`
  - 输出 `agent-reach-smoke:completed`
  - 真实链路为 `mcporter + Exa -> Agent-Reach MCP adapter -> DUDesign MCP execute -> research context artifact -> pinned job snapshot`。

### 风险与后续关注

- `npm install -g mcporter` 在 Ubuntu apt Node 18.19.1 上出现 engine warning：
  - `mcporter@0.12.3` 声明需要 Node `>=24`
  - 当前 smoke 实测可用，但中期建议把 staging Node 升级到 LTS/新版，避免后续 mcporter 更新后不兼容。
- `preflight` 仍提示 `agent-reach-cli-not-installed`，因为 Agent-Reach 安装在 venv，不在默认 PATH；当前 DUDesign smoke 依赖 `mcporter + Exa`，不受影响。
- 可选渠道如 Twitter、Reddit、小红书等仍需登录态、代理或额外后端，不纳入本次 DUDesign 网络检索 MVP 验收。

### 本轮补充

- 新增 contracts：
  - `AnalyzeDataIntakeRequest`
  - `AnalyzeDataIntakeResponse`
- 新增 API：
  - `POST /api/capabilities/data-intake/analyze`
- deterministic analyzer 当前支持：
  - prompt / URL / pasted text / table / JSON / uploaded asset ids / democase ids / research artifact ids / existing HTML artifact id / memory note ids。
  - topic summary、entity、field、missing fields、recommendations、risk flags、review status。
- API smoke 覆盖：
  - workspace 权限路径。
  - 动态百科相关输入推荐 `tpl_dynamic_encyclopedia_entry`。
  - 时间线信息推荐 `dtp_dynamic_encyclopedia_timeline_card`。
  - external source 风险标记。
  - artifact store 可读回固化 JSON。

### 2026-07-06 补充收口

- `CreateDesignJobRequest.templateRequirements` 新增：
  - `dataIntakeArtifactId`
  - `dataIntake`
- 创建 job 时会校验 `dataIntakeArtifactId` 指向当前 workspace 下的 `data_intake_analysis` artifact。
- job snapshot 中只固化轻量引用，不复制完整 analysis，避免 job 记录膨胀：
  - `artifactId`
  - `storageKey`
  - `contentHash`
  - `sizeBytes`
  - `schemaVersion`
  - `reviewStatus`
  - `createdAt`
- API smoke 已覆盖：
  - 创建 job 引用 data-intake artifact。
  - 存储后的 job `templateRequirements.dataIntakeArtifactId` 与 `templateRequirements.dataIntake` 不漂移。

## 2026-07-06 CAP-9.2 Image Generation MCP Mock Foundation

### 已完成

- 新增图片生成能力契约：
  - `ImageGenerationRequest`
  - `ImageGenerationArtifact`
  - `ImageGenerationUsageContext`
- 官方 registry 增加图片生成插件族：
  - `plug_image_generation`
  - `sk_visual_asset_brief`
  - `mcp_image_generation_ark_seedream`
- `sk_visual_asset_brief` 明确：
  - 将视觉资产需求转为受控 image request。
  - 不请求 logo、版权角色、品牌 trade dress、受保护 UI chrome。
  - provider API key、raw provider response、临时 URL 不进入 runtime prompt 或 job snapshot。
- `MockMcpExecutor` 增加 image generation 分支：
  - 成功请求返回 mock `ImageGenerationArtifact`。
  - 命中 logo / copyrighted / celebrity / exact brand trade dress 等风险词时返回 `IMAGE_CONTENT_SAFETY_BLOCKED`。
- Application Service 的 MCP execute 阶段新增 `persistMcpCapabilityArtifacts()`：
  - 继续支持 research context artifact 固化。
  - 新增 image generation artifact 固化到 artifact store。
  - MCP result 对外只返回 `/api/capability-artifacts/:artifactId` 形式的稳定引用和 artifact metadata。
- capability registry 单测覆盖 artifact write scope 的 tool policy。
- API smoke 覆盖图片生成 MCP：
  - job snapshot 中选择 `sk_visual_asset_brief` + `mcp_image_generation_ark_seedream`。
  - 执行 mock image MCP。
  - 验证 image artifact 写入 artifact store。
  - 验证 content safety status、cost 和 metadata。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="capability plugin registry|MockMcpExecutor|MCP|api flow"`

### 决策

- 本轮不直接接入火山方舟真实 API；先稳定 DUDesign 内部契约、权限、审计和 artifact 语义。
- 图片生成产物暂不扩展 `ArtifactKind`，避免把 variation artifact 与 capability artifact 混为一层；真实图片二进制/URL 管理后续再通过 provider adapter 和 artifact resolver 收敛。

### 后续关注

- 增加 Ark Seedream provider adapter：
  - `ARK_API_KEY` 仅存在服务端 secret。
  - 支持 provider unavailable、rate limit、content safety blocked、cost usage。
- 增加真实 provider smoke，但默认 CI/staging smoke 仍使用 mock，避免依赖外部付费服务。

## 2026-07-06 CAP-9.2 Ark Seedream Provider Adapter

### 已完成

- 新增 `ArkSeedreamImageMcpExecutor`：
  - 只接管 `image-generation.generateArkSeedreamImage`。
  - 非图片 MCP tool 继续交给 fallback executor，默认 fallback 为 `MockMcpExecutor`。
  - 按火山方舟 images/generations 形态发送 `model`、`prompt`、`response_format=url`、`size`、`stream=false`、`watermark`、`sequential_image_generation=disabled`。
  - 服务端通过 `Authorization: Bearer <ARK_API_KEY>` 注入密钥，密钥不会进入 skill、runtime prompt、job snapshot 或 MCP result。
- `createMcpExecutorFromEnv()` 支持可选图片 provider：
  - `DUDESIGN_IMAGE_GENERATION_PROVIDER=ark_seedream`
  - `ARK_API_KEY` / `DUDESIGN_ARK_API_KEY`
  - `ARK_IMAGE_GENERATION_URL`
  - `ARK_IMAGE_MODEL`
  - `ARK_IMAGE_TIMEOUT_MS`
- `deploy/staging/staging.env.example` 增加 Ark provider env，但默认关闭，保持 staging/CI 不依赖外部付费服务。
- Provider adapter 单测覆盖：
  - server-side credential header。
  - provider request body。
  - provider URL result 归一化为 `ImageGenerationArtifact`。
  - provider 429 / failure 归一化为 `MCP_UNAVAILABLE`。
  - 非图片 MCP tool fallback 到基础 executor。

### 验证

- 待本轮统一执行 `npm run typecheck` 与 API 测试。

### 后续关注

- 在有 `ARK_API_KEY` 的 staging secret 环境跑真实 provider smoke。
- 增加用户端/Activity Stream 的图片 provider unavailable 细分文案。
- 决定是否为真实图片二进制引入 capability artifact read endpoint，替代当前 JSON artifact 引用。

## 2026-07-06 CAP-9.2 Ark Seedream Opt-in Staging Smoke

### 已完成

- 新增 `deploy/staging/scripts/smoke-ark-image-remote.sh`：
  - 默认在 `DUDESIGN_STAGING_ARK_REAL_SMOKE!=1` 时输出 skipped，不阻塞默认 staging deploy。
  - 有密钥时临时写入 staging `.env`，启用 `DUDESIGN_IMAGE_GENERATION_PROVIDER=ark_seedream`。
  - 通过 DUDesign 标准 `/api/mcp/invocations/execute` 触发 `mcp_image_generation_ark_seedream`，不在 smoke 中直接绑定 Ark 原始 response。
  - 断言返回 `ImageGenerationArtifact`、provider 为 `ark_seedream`、图片 URL 被替换为 artifact-backed `/api/capability-artifacts/:id`，不泄露 provider URL。
  - 断言管理端 MCP audit 能按 job/tool/status 查询到本次调用。
  - 退出时恢复原 staging `.env` 并重启 API，避免测试配置污染常驻服务。
- `smoke-remote.sh` 挂载 Ark image smoke；默认只跳过，打开开关后才跑真实付费 provider。
- `staging.env.example` 增加 opt-in Ark smoke 参数。

### 验证

- 待本轮执行 shell 静态检查、typecheck 与 API 测试。

### 后续关注

- 在具备 `ARK_API_KEY` 的 staging secret 环境运行：
  - `DUDESIGN_STAGING_ARK_REAL_SMOKE=1 deploy/staging/scripts/smoke-ark-image-remote.sh`
- 若真实 provider 返回额外成本/用量字段，继续收敛到 `ImageGenerationArtifact.costCents`，不把原始 provider payload 暴露给前端或 runtime。

## 2026-07-06 CAP-9.2 Image Provider Unavailable UX Mapping

### 已完成

- 前端 `toUserFacingError` 增加 MCP 上下文识别：
  - `MCP_UNAVAILABLE + image-generation` 映射为 “Image generation temporarily unavailable”。
  - action 固定为 “Continue without images”，强调可稍后重试或切换 provider。
  - 非图片 MCP 继续使用通用 capability unavailable 文案，避免影响 Agent-Reach、质量检查等其他工具。
- 新增 `mcpInvocationToUserError(result)` helper，供后续 Activity Stream、插件执行面板、toast 统一复用 MCP result 的用户文案。
- API client 支持透传 error payload 中的 `context`/`data`，为 HTTP 错误场景保留同一套文案映射。
- Ark Seedream provider unavailable 结果补充 `serverName`、`toolName`、`mcpToolId`、`provider`，但不泄露密钥或 provider 原始 payload。
- 增加 web mapper 测试和 API Ark unavailable 上下文断言。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="ArkSeedream"`
- `node --test apps/web/test/capability-errors.test.mjs`

### 后续关注

- 将 `mcpInvocationToUserError` 接入用户端 Activity Stream/插件执行结果 UI。
- 为图片生成失败增加可操作按钮：继续无图、重试图片、切换 provider。

### 2026-07-06 追加进展

- 用户端已新增 `CapabilityNotice` 组件，并在 Variation 详情页预留真实展示位。
- 已补充重试图片 / 切换 provider 的用户端动作文案。
- Application Service 已在 variation detail 中返回 recent MCP invocation result；Variation 页面会自动显示真实 provider 降级。
- Variation Inspect 面板已使用 `mcpInvocationToUserError()` 展示 provider/tool 降级活动。
- 首页生成过程 Activity Stream 已通过 `design.runtime_warning.context` 接入 provider/tool 降级。

## 2026-07-07 CAP-6 Admin Capability Governance Visibility

### 已完成

- 扩展 `GET /api/admin/capabilities/templates`：
  - 返回 `skillGovernance`：官方 skill 的 schema、prompt block、rules、negative rules、checklist、适用 category、安全等级、policy mode、usage 指标和 required actions。
  - 返回 `mcpPluginGovernance`：MCP binding 的 server/tool、scope、auth、audit level、policy mode、rollout state、health、usage 指标和 required actions。
  - 返回 `automationLoopGovernance`：loop quality gates、repair strategy、使用次数、成功率、平均成本和 required actions。
  - 返回 `quality`：DESIGN.md lint/diff/preview smoke 可见性、模板 warning/block 计数、policy-only/real MCP 数、audit log 数和 recent drift 数。
- 管理端 Templates 页新增 CAP-6 治理摘要区：
  - DESIGN.md lint / diff / preview smoke readiness。
  - 官方 skill 治理卡片。
  - MCP plugin policy 灰度卡片。
  - automation loop metrics 卡片。
  - write audit action 和 audit mode。
- 新增管理端浏览器 smoke：`apps/admin/e2e/capability-governance.spec.ts`。
- 更新既有 admin e2e mock，使 CAP-6 governance response 新字段保持兼容。

### 验证

- `npx tsc -b apps/api apps/admin`
- `npm --workspace @dudesign/admin run test:e2e -- capability-governance.spec.ts`
- `npm --workspace @dudesign/admin run build`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="api flow|MCP|capability"`

### 决策

- 本轮只推进管理端治理可见性，不改用户前端模板列表形态。
- 模板编辑 / 发布 / 禁用、风险插件禁用仍保留为下一阶段写操作，并必须走 Admin API + audit log。
- 指标首版复用 `usage_events`、MCP invocation audit 和 audit logs，不新增独立 metrics 表。

### 后续关注

- 增加 `PATCH /api/admin/capabilities/templates/:id`，支持 draft/publish/disable，并记录 `capability.governance.change`。
- 增加 `PATCH /api/admin/capabilities/plugins/:id`，支持风险插件禁用、可见性和权限调整，并记录审计。
- 将 template contribution candidate 的 diff / preview smoke / risk review 接入同一治理面板。

## 2026-07-07 CAP-6.1 Risk Plugin Governance Persistence

### 已完成

- 风险插件治理从“服务内即时覆盖”升级为“Repository contract + PostgreSQL override 表”：
  - capability registry 输出继续由官方 registry + governance override 合成。
  - job snapshot 解析继续在业务服务层拦截 disabled plugin，不进入 runtime。
  - Admin PATCH API 负责写入 override 和审计日志。
- 新增 `capability_governance_overrides`：
  - `plugin_id` 为当前有效治理对象。
  - `status` 表示 `active` 或 `disabled`。
  - `reason`、`updated_by_user_id`、`updated_by_role` 和 `metadata` 为后续治理面板、配置同步、审计回放保留上下文。
- Capability Distribution TODO 已更新：风险插件禁用的持久化覆盖层完成。

### 验证

- `npm run typecheck`
- `npm --workspace @dudesign/api run test -- --test-name-pattern="capability governance persistence|capability plugin registry|DUDesign mock API flow|PostgresRepository integration"`

> 本地未配置 `POSTGRES_TEST_URL`，PostgreSQL integration suite 按既有策略 skip；Repository contract 和 hydrate 断言已随代码路径补入 opt-in smoke。

### 后续关注

- 插件级 governance override 已完成；子模板、审查规则、capability preset 仍需要单独设计 scope 和冲突优先级。
- 后续 capability usage events 可统计被禁用插件的命中/拒绝次数，帮助管理员判断禁用影响面。
## 2026-07-15 Taxonomy 与 Democase 检索重构准入

- 在 CAP-12 登记完整 11 个 L1、44 个 L2、40+ L3 机器可读 taxonomy registry。
- 明确 `/Users/tangyaoyue/DEV/Baidu/case垂类分类` 需要建立结构化索引与 BM25/向量混合检索，现有 9 条手写 democase 仅作为 mock fixture。
- 模板推荐目标调整为 AI 语义评分 + registry hard constraints，并区分 entity classification 与 user intent。
- 登记至少 100 条 golden guidance fixture 与离线评测指标：分类准确率、Top-3 模板召回率、interaction intent 命中率和过度澄清率。
- 新增 `EncyclopediaGuidanceAnalysisV2` contract，taxonomy candidate、democase evidence、模板与交互 allowlist 都是显式结构化输入。
## 2026-07-15 CAP-12 Taxonomy 与 Evidence 首版

- 新增版本化 taxonomy registry：11 个 L1、源表明确枚举的 41 个 L2、首批历史人物/电影/电视剧/文化词语/景区 L3。
- taxonomy lint 发现并保留源文档矛盾：文档声明 44 个 L2，但表格合计只有 41 个；未虚构缺失分类。
- 新增 taxonomy candidate resolver，支持 query signals、democase category hints、模板/交互 compatibility 和 risk flags。
- 新增 democase evidence resolver：exact alias、关键词评分、taxonomy node、模板、交互、matched evidence、index version 和 SHA-256 content hash。
- 当前只索引代码内 9 条 mock；本地 `case垂类分类` 约 488 个文件及 BM25/向量索引仍是下一阶段。
## 2026-07-15 CAP-12 Real Case Index 与 100 Golden Fixtures

- 新增可重复执行的 `encyclopediaDemocaseIndexBuilder`：
  - 使用 parse5 解析 HTML title 与 DOM class，不用正则拼装 HTML 结构。
  - 从 `/Users/tangyaoyue/DEV/Baidu/case垂类分类` 识别 32 个主 HTML case。
  - 将约 488 个图片、DOCX、TXT、JSON 等文件作为 supporting assets 汇总。
  - 输出 entry title、taxonomy、模板、交互范式、结构特征、asset summary、relative path 和 SHA-256 content hash。
- 生成版本化仓库快照 `encyclopediaDemocaseIndex.generated.ts`，当前 index version 为 `2026-07-15.real-case.bd692bdcd3591ef1`。
- resolver 升级为真实 index 优先、9 条 mock fallback：
  - exact title / alias boost。
  - BM25-style lexical scoring。
  - 通用词单独命中不构成 evidence，避免“人工智能”误命中“智能导览”。
- 新增 100 条 golden guidance fixture：20 个高频 L2，每类 5 条，包含至少 8 条歧义输入。
- 新增离线 evaluator：coverage、L1/L2/node accuracy、primary intent accuracy、Top-3 template recall、clarification precision/recall。

### 验证

- case index builder：32 个主 case，case id/content hash 唯一且稳定。
- real evidence：`庆余年人物关系与剧情脉络` 命中真实电视剧 case；弱通用词不产生错误 category hint。
- golden dataset：100 条、20 个 L2、全部 taxonomy node 在 AI allowlist 中。

## 2026-07-15 CAP-10.7 HTML Example 文件边界

### 已完成

- 将时间线、关系图谱、对比辨析和可展开事实卡的大型 HTML 示例从 `officialDesignTemplatePacks.ts` 迁移到 `apps/api/src/html-examples/`。
- registry 仅保存 `HtmlExampleFileRef`，避免 HTML 反引号、脚本和构建产物破坏 TypeScript 编译。
- 保留现有示例内容，并将四个动态百科子模板连接到对应文件。
- 增加文件路径解析、非空和 HTML 文档结构测试。

### 验证

- 全仓 `npm run typecheck` 通过。
- `officialDesignTemplatePacks` 外部 HTML 引用测试通过。

### 后续

- 为示例文件增加 license/provenance manifest、content hash 和发布前 sanitizer gate。

## 2026-07-15 CAP-12 真实模型 Golden 准入

- 100 条 golden fixture 已接入真实 `GuidanceAnalysisGateway` evaluation runner，不再只做静态 dataset lint。
- runner 输出逐 case JSON，保留 fixture id、预期分类/意图/模板/澄清、实际 prediction、错误码和耗时。
- staging 默认阈值：coverage 0.98、L1 0.90、L2 0.82、taxonomy node 0.78、intent 0.75、Top-3 template recall 0.85、clarification precision/recall 0.70。
- 阈值属于首版准入线；首次真实 BabeL-O 100 条报告完成后，应按垂类混淆矩阵调整 fixture 与阈值，不通过降低标准掩盖系统性分类问题。
- 向量检索与源分类文档缺失的 3 个 L2 仍是 CAP-12 后续项。

## 2026-07-15 CAP-12 Guidance Golden Baseline 通过

- 100 条 fixture 已在真实 BabeL-O/MiniMax-M3 staging 环境完成准入，不再只是 mock/offline evaluator。
- 最终指标：coverage 99%、L1 98.0%、L2 92.9%、taxonomy node 85.9%、intent 94.9%、Top-3 template recall 100%、clarification precision 87.5%、recall 70%。
- 根据真实 AI 问题记录治理 fixture：`中山公园游览顺序` 改为阻断性地点澄清，`龙井的植物特征` 改为显式植物语境下非阻断。
- 残余混淆将作为向量检索和 taxonomy signal 调优样本，不通过硬编码单个词条绕过。

## 2026-07-15 产品语义校正：词条主题动态交互卡

- 明确词条/实体只负责提供主题入口、分类信号和事实边界。
- 产品交付物是主题驱动、单屏、可操作的动态交互卡片，不是百科文章或百科页面。
- 更新 domain template、preset、guidance skill 和父模板 rationale，优先主要交互命题、视觉叙事与内容策展。
- 保留 `dynamic_encyclopedia_card` 等历史技术 ID，避免破坏旧 job/session 和 Runtime Contract。
- 产品语义文档：`../../dynamic-topic-interactive-card-product-semantics.md`。

## 2026-07-15 CAP-18 主题交互审美与明星组合 Democase

- 新增 `Topic Interactive Card` aesthetic profile，以单画布、单主要交互和主题策展为核心。
- 动态产品模式默认选择该 profile 与 `pal_minimal_mono`，用户显式视觉覆盖仍优先。
- 明星组合模板切换到 `star-group-member-map-example.html`：788×492 居中画布、成员主舞台、成员详情、阶段与团体作品标签均为真实本地交互。
- democase 不包含外部脚本或网络资产，pixel/spec 质量检查均为 pass。
- Chromium 交互测试实际点击成员并验证详情更新，再切换阶段 tab 并验证 panel hidden/selected 状态。
- HTML example prompt 仅保留显式标记的交互脚本，避免恢复任意第三方脚本。
- ResearchContext reference 增加 `provenance`；mock search 在 Runtime prompt 中明确标记为非事实来源。
- `provider=mock` 的图片产物明确标记为仅元数据，不允许模型输出断链图片或声称已生成视觉素材。

## 2026-07-16 CAP-18.1 极小视口与多模板 Democase 闭环

- 将 300×360 从模板说明中的“兼容尺寸”升级为所有动态主题卡的稳定组件契约 `wise-small-frame`。
- compact 首屏统一保留主题身份、最核心事实和必要页面切换/主交互；次要信息必须通过 tab、卡内弹层或点击状态继续获取，禁止直接删除详情入口或改为内部滚动。
- 摘要卡补齐 300×360 信息密度收缩；明星组合在极小屏下由“隐藏详情”改为点击成员打开卡内详情层。
- 修复时间线 few-shot 的模板字符串转义错误，并将五个阶段按钮压为极小屏五等分可点击选择器。
- 用自包含 compact interaction democase 替换对比卡损坏的图表构建产物和可展开卡 hydration 空代理页。
- 新增六类结构原型统一回归；summary/timeline/relation/comparison/expandable/star-group 在桌面和 300×360 pixel gate 全部为 pass。

### 验证

- `npm run typecheck` 通过。
- 相关 21 项测试通过，包含双视口 pixel gate、时间线切换、对比弹层、渐进展开、成员详情与固定画布命中检查。
- 内置浏览器加载明星组合示例后可点击成员乙并更新详情，控制台无 error/warn。
