import type { McpInvocationRequest, McpInvocationResult } from '@dudesign/contracts'
import { mcpUnavailableResult } from '@dudesign/runtime-gateway'
import { lookupEncyclopediaDemocases } from './encyclopediaDemocase.js'

export type McpExecutor = {
  execute(request: McpInvocationRequest): Promise<McpInvocationResult>
}

export type HttpMcpExecutorConfig = {
  baseUrl: string
  endpointPath?: string
  apiKey?: string
  authHeaderName?: string
  timeoutMs?: number
}

export class MockMcpExecutor implements McpExecutor {
  async execute(request: McpInvocationRequest): Promise<McpInvocationResult> {
    const completedAt = new Date().toISOString()
    if (request.serverName === 'encyclopedia-democase' && request.toolName === 'lookupEntryDemoCases') {
      const entryTitle = optionalString(request.input.entryTitle) ?? optionalString(request.input.query) ?? ''
      const context = optionalString(request.input.context) ?? ''
      const limit = optionalPositiveInteger(request.input.limit) ?? 3
      const matches = lookupEncyclopediaDemocases(`${entryTitle}\n${context}`, limit)
      return {
        invocationId: request.invocationId,
        status: 'ok',
        mcpToolId: request.mcpToolId,
        source: invocationSource(request),
        summary: matches.length
          ? `Matched ${matches.length} approved encyclopedia demo case${matches.length === 1 ? '' : 's'} for generation context.`
          : 'No approved encyclopedia demo cases matched the request.',
        references: matches.map(match => ({ id: match.caseId, title: match.title })),
        data: {
          matches,
          note: 'Demo cases are examples for structure and interaction only, not facts about the current entry.',
        },
        completedAt,
      }
    }
    if (request.serverName === 'quality-tools' && request.toolName === 'validateAccessibility') {
      return {
        invocationId: request.invocationId,
        status: 'ok',
        mcpToolId: request.mcpToolId,
        source: invocationSource(request),
        summary: 'Accessibility validation accepted for queued artifact review.',
        references: request.input.artifactId ? [{ id: String(request.input.artifactId), title: 'Artifact under validation' }] : [],
        data: {
          validationStatus: 'accepted',
          checkedRules: ['semantic_structure', 'contrast_placeholder', 'keyboard_flow_placeholder'],
        },
        completedAt,
      }
    }
    return mcpUnavailableResult(
      request,
      `No MCP executor is configured for ${request.serverName}.${request.toolName}.`,
      completedAt,
    )
  }
}

export class HttpMcpExecutor implements McpExecutor {
  private readonly baseUrl: string
  private readonly endpointPath: string
  private readonly apiKey: string | undefined
  private readonly authHeaderName: string
  private readonly timeoutMs: number

  constructor(config: HttpMcpExecutorConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.endpointPath = normalizeEndpointPath(config.endpointPath)
    this.apiKey = config.apiKey
    this.authHeaderName = config.authHeaderName?.trim() || 'authorization'
    this.timeoutMs = config.timeoutMs ?? 30000
  }

  async execute(request: McpInvocationRequest): Promise<McpInvocationResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.baseUrl}${this.endpointPath}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ request }),
        signal: controller.signal,
      })
      if (!response.ok) {
        return mcpUnavailableResult(request, `MCP HTTP executor returned ${response.status}: ${await safeResponseText(response)}`)
      }
      const payload = await response.json() as unknown
      const result = normalizeMcpExecutorResponse(payload)
      if (!result) return mcpUnavailableResult(request, 'MCP HTTP executor returned an invalid result envelope.')
      if (result.invocationId !== request.invocationId || result.mcpToolId !== request.mcpToolId) {
        return mcpUnavailableResult(request, 'MCP HTTP executor result does not match the invocation request.')
      }
      return result
    } catch (error) {
      return mcpUnavailableResult(request, error instanceof Error ? error.message : 'MCP HTTP executor request failed.')
    } finally {
      clearTimeout(timeout)
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey) {
      headers[this.authHeaderName] = this.authHeaderName.toLowerCase() === 'authorization'
        ? `Bearer ${this.apiKey}`
        : this.apiKey
    }
    return headers
  }
}

function invocationSource(request: McpInvocationRequest): McpInvocationResult['source'] {
  return {
    serverName: request.serverName,
    toolName: request.toolName,
    scopes: [...request.scopes],
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizeMcpExecutorResponse(payload: unknown): McpInvocationResult | null {
  const value = isRecord(payload) && isRecord(payload.result) ? payload.result : payload
  if (!isRecord(value)) return null
  if (typeof value.invocationId !== 'string') return null
  if (!['ok', 'denied', 'unavailable', 'error'].includes(String(value.status))) return null
  if (typeof value.mcpToolId !== 'string') return null
  if (!isRecord(value.source)) return null
  if (typeof value.source.serverName !== 'string' || typeof value.source.toolName !== 'string' || !Array.isArray(value.source.scopes)) return null
  if (typeof value.summary !== 'string') return null
  if (!Array.isArray(value.references)) return null
  if (typeof value.completedAt !== 'string') return null
  return value as McpInvocationResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeEndpointPath(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) return '/v1/mcp/invocations'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500)
  } catch {
    return 'unreadable response body'
  }
}
