# MCP Invocation Contract

> 模块：Runtime Compatibility Layer
> 状态：Draft v0.1
> 目标：将 MCP 插件从 `policy_only` 灰度到真实调用时，保持 DUDesign 业务层、Runtime Gateway 和 BabeL-O 的边界稳定。

## 1. 边界原则

- Application Service 是唯一授权裁决者，Runtime/BabeL-O 不允许绕过 DUDesign 直接读取数据库、用户资产或 democase 服务。
- Runtime Gateway 只消费标准化 `toolPolicy`、标准化 invocation request 和标准化 tool result。
- BabeL-O 可以提出工具调用意图，但最终是否调用由 DUDesign 校验 `jobId`、`variationId`、`userId`、`workspaceId`、`mcpToolId`、scope 和 auth。
- Application Service 的词条引导向导查询和生成期 agent MCP tool policy 是两条链路。前者可直连 democase 只读服务；后者必须走本 contract。
- MCP 结果只作为带来源的上下文注入 prompt，不直接写入用户 memory，不作为事实来源替代业务 snapshot。

## 2. 调用模式

- `policy_only`：MVP 默认。Gateway 只把 allowed tools/scopes/audit level 传给 runtime，不执行真实 MCP。
- `authorized_invocation`：Runtime 发起工具意图，DUDesign 校验通过后代为调用 MCP server。
- `replay`：不访问外部 MCP server，使用审计记录中的 request/result 重放，用于调试、回归和合规复盘。

## 3. 标准请求

```ts
type McpInvocationRequest = {
  invocationId: string
  mode: 'authorized_invocation' | 'replay'
  userId: string
  workspaceId: string
  sessionId: string
  jobId: string
  variationId?: string
  runtimeSessionId?: string | null
  mcpToolId: string
  serverName: string
  toolName: string
  scopes: PluginPermissionScope[]
  input: Record<string, unknown>
  reason: string
  requestedAt: string
}
```

## 4. 标准结果

```ts
type McpInvocationResult = {
  invocationId: string
  status: 'ok' | 'denied' | 'unavailable' | 'error'
  mcpToolId: string
  source: {
    serverName: string
    toolName: string
    scope: PluginPermissionScope[]
  }
  summary: string
  references: Array<{ id: string; title?: string; url?: string }>
  data?: Record<string, unknown>
  error?: { code: string; message: string; retryable: boolean }
  completedAt: string
}
```

## 5. 授权校验

真实调用前必须全部通过：

- `mcpToolId` 存在于当前 job 的 `capabilitySnapshot.plugins.mcpToolIds`。
- `mcpToolId` 存在于 `pluginSnapshot.toolPolicy.allowedMcpToolIds`。
- request scopes 是 binding scopes 和 toolPolicy scopes 的子集。
- binding 的 `requiresUserAuth` 若为 true，必须存在有效用户授权。
- binding 的 `allowedTemplateCategories` 必须覆盖当前 job domain template category。
- plugin status 必须为 active，safetyLevel 不能是 disabled。
- request 的 user/workspace/session/job/variation 必须与业务资源归属一致。

## 6. 结果注入

- Runtime Gateway 注入 prompt 时必须标注 `source.serverName`、`source.toolName`、`mcpToolId` 和 reference id。
- 注入内容必须是 summary-first；大体量 raw data 只能作为 artifact/reference 附件。
- LLM 不得把 MCP 返回内容写入长期 memory，除非后续用户明确保存为偏好或事实。
- 工具 unavailable/denied/error 必须转成 DUDesign 标准降级事件，不能表现为 runtime 崩溃。
- MVP 标准注入载体为 `McpToolPromptContext`：
  - `summary` 是面向模型的首要上下文。
  - `references` 只保存可追溯引用 id/title/url。
  - `contextText` 必须显式包含 source、scope 和“不写入长期 memory”的约束。

## 7. 审计与回放

每次真实调用写入 `McpInvocationAuditRecord`：

- request envelope。
- result envelope。
- policy snapshot hash。
- runtime contract version。
- created/completed timestamps。
- replay key。

回放使用 audit record，不再次访问 MCP server。Golden replay 要覆盖：

- 授权通过。
- scope denied。
- MCP unavailable。
- result 注入。
- replay 输出稳定。

MVP 回放接口：

- `GET /api/mcp/invocations/replay/:replayKey`
- 只读取 `mcp_invocation_audit_records`。
- 需要当前用户对原始 job 至少具备 viewer 权限。
- 返回原始 request/result、audit record 和由 result 派生的 `McpToolPromptContext`。
- 写入 `mcp.invocation.replayed` audit log，但不创建新的外部 MCP 调用。

## 8. 动态百科约束

- `mcp_encyclopedia_democase_readonly` 初期可通过 mock executor 返回 approved demo cases；真实 democase MCP server 接入前不得访问外部私有库。
- 首页词条引导向导的分类查询由 Application Service 直连 democase 只读服务，不经 MCP invocation。
- 生成期 agent 若未来需要 democase MCP，只能使用 `readonly_context`，且结果必须标注 demo case source，不能把 demo case 当作当前词条事实。
