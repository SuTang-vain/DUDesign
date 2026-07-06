import type { McpInvocationRequest, McpInvocationResult } from '@dudesign/contracts'
import { mcpUnavailableResult } from '@dudesign/runtime-gateway'
import { lookupEncyclopediaDemocases } from './encyclopediaDemocase.js'

export type McpExecutor = {
  execute(request: McpInvocationRequest): Promise<McpInvocationResult>
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
