import type {
  CapabilitySnapshot,
  McpInvocationRequest,
  McpInvocationResult,
  McpToolPromptContext,
  PluginPermissionScope,
} from '@dudesign/contracts'

export type RuntimeMcpToolPolicy = {
  allowedMcpToolIds: string[]
  scopes: PluginPermissionScope[]
  requiresUserAuth: boolean
  auditLevel: 'none' | 'usage' | 'full'
  mode: 'policy_only' | 'authorized_invocation'
}

export type McpInvocationAuthorization =
  | { status: 'authorized'; binding: NonNullable<CapabilitySnapshot['plugins']['pluginSnapshot']>['mcpToolBindings'][number] }
  | { status: 'denied'; code: string; message: string }

export function runtimeMcpToolPolicy(
  snapshot: CapabilitySnapshot | undefined,
  mode: RuntimeMcpToolPolicy['mode'] = 'policy_only',
): RuntimeMcpToolPolicy {
  const policy = snapshot?.plugins?.pluginSnapshot?.toolPolicy
  if (!policy) {
    return {
      allowedMcpToolIds: [],
      scopes: [],
      requiresUserAuth: false,
      auditLevel: 'none',
      mode,
    }
  }
  return {
    allowedMcpToolIds: [...policy.allowedMcpToolIds],
    scopes: [...policy.scopes],
    requiresUserAuth: policy.requiresUserAuth,
    auditLevel: policy.auditLevel,
    mode,
  }
}

export function authorizeMcpInvocation(
  snapshot: CapabilitySnapshot,
  request: McpInvocationRequest,
): McpInvocationAuthorization {
  const pluginSnapshot = snapshot.plugins.pluginSnapshot
  if (!pluginSnapshot) {
    return denied('MCP_POLICY_MISSING', 'Capability snapshot does not include an MCP tool policy.')
  }
  if (!snapshot.plugins.mcpToolIds.includes(request.mcpToolId)) {
    return denied('MCP_TOOL_NOT_SELECTED', `MCP tool is not selected for this job: ${request.mcpToolId}`)
  }
  if (!pluginSnapshot.toolPolicy.allowedMcpToolIds.includes(request.mcpToolId)) {
    return denied('MCP_TOOL_NOT_ALLOWED', `MCP tool is not allowed by the runtime tool policy: ${request.mcpToolId}`)
  }
  const binding = pluginSnapshot.mcpToolBindings.find(item => item.id === request.mcpToolId)
  if (!binding) {
    return denied('MCP_BINDING_MISSING', `MCP binding snapshot is missing: ${request.mcpToolId}`)
  }
  if (binding.serverName !== request.serverName || binding.toolName !== request.toolName) {
    return denied('MCP_BINDING_MISMATCH', `MCP binding target does not match request target: ${request.mcpToolId}`)
  }
  const allowedScopes = new Set([...binding.scopes, ...pluginSnapshot.toolPolicy.scopes])
  const bindingScopes = new Set(binding.scopes)
  const policyScopes = new Set(pluginSnapshot.toolPolicy.scopes)
  for (const scope of request.scopes) {
    if (!allowedScopes.has(scope) || !bindingScopes.has(scope) || !policyScopes.has(scope)) {
      return denied('MCP_SCOPE_DENIED', `MCP scope is not allowed for this invocation: ${scope}`)
    }
  }
  if (binding.requiresUserAuth) {
    return denied('MCP_USER_AUTH_REQUIRED', `MCP tool requires user authorization: ${request.mcpToolId}`)
  }
  return { status: 'authorized', binding }
}

export function mcpUnavailableResult(
  request: McpInvocationRequest,
  message: string,
  completedAt = new Date().toISOString(),
): McpInvocationResult {
  return {
    invocationId: request.invocationId,
    status: 'unavailable',
    mcpToolId: request.mcpToolId,
    source: {
      serverName: request.serverName,
      toolName: request.toolName,
      scopes: [...request.scopes],
    },
    summary: 'MCP tool unavailable.',
    references: [],
    error: {
      code: 'MCP_UNAVAILABLE',
      message,
      retryable: true,
    },
    completedAt,
  }
}

export function mcpToolPromptContext(result: McpInvocationResult): McpToolPromptContext | null {
  if (result.status !== 'ok') return null
  return {
    invocationId: result.invocationId,
    mcpToolId: result.mcpToolId,
    status: result.status,
    source: {
      serverName: result.source.serverName,
      toolName: result.source.toolName,
      scopes: [...result.source.scopes],
    },
    summary: result.summary,
    references: result.references.map(reference => ({ ...reference })),
    contextText: [
      `MCP tool context (${result.mcpToolId})`,
      `Source: ${result.source.serverName}.${result.source.toolName}`,
      `Scopes: ${result.source.scopes.join(', ') || 'none'}`,
      `Summary: ${result.summary}`,
      result.references.length
        ? `References: ${result.references.map(reference => reference.title ? `${reference.id} (${reference.title})` : reference.id).join(', ')}`
        : 'References: none',
      'Use this as sourced context only. Do not store it in long-term memory unless the user explicitly asks.',
    ].join('\n'),
  }
}

function denied(code: string, message: string): McpInvocationAuthorization {
  return { status: 'denied', code, message }
}
