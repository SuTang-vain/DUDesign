import type { McpInvocationResult } from '@dudesign/contracts'
import { toUserFacingError, type UserFacingError } from './userErrors'

export function mcpInvocationToUserError(result: McpInvocationResult | null | undefined): UserFacingError | null {
  if (!result) return null
  if (result.status === 'ok') return null

  return toUserFacingError({
    code: result.error?.code ?? (result.status === 'unavailable' ? 'MCP_UNAVAILABLE' : 'MCP_ERROR'),
    message: result.error?.message ?? result.summary,
    recoverable: result.error?.retryable ?? result.status === 'unavailable',
    scope: 'runtime',
    context: {
      mcpToolId: result.mcpToolId,
      serverName: result.source.serverName,
      toolName: result.source.toolName,
      ...(result.data ?? {}),
    },
  })
}
