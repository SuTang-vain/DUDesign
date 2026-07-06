import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CapabilitySnapshot, McpInvocationRequest } from '@dudesign/contracts'

import {
  authorizeMcpInvocation,
  mcpToolPromptContext,
  mcpUnavailableResult,
  runtimeMcpToolPolicy,
} from './mcpInvocationContract.js'

describe('MCP invocation contract', () => {
  it('keeps policy-only tool policy stable before real invocation is enabled', () => {
    assert.deepEqual(runtimeMcpToolPolicy(undefined), {
      allowedMcpToolIds: [],
      scopes: [],
      requiresUserAuth: false,
      auditLevel: 'none',
      mode: 'policy_only',
    })

    assert.deepEqual(runtimeMcpToolPolicy(snapshotWithDemocaseTool()), {
      allowedMcpToolIds: ['mcp_encyclopedia_democase_readonly'],
      scopes: ['readonly_context'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
  })

  it('authorizes only selected MCP tools that match binding, policy, target, and scopes', () => {
    const snapshot = snapshotWithDemocaseTool()
    const request = democaseRequest()

    assert.deepEqual(authorizeMcpInvocation(snapshot, request), {
      status: 'authorized',
      binding: snapshot.plugins.pluginSnapshot?.mcpToolBindings[0],
    })

    assert.equal(authorizeMcpInvocation(snapshot, {
      ...request,
      mcpToolId: 'mcp_missing',
    }).status, 'denied')
    assert.equal(authorizeMcpInvocation(snapshot, {
      ...request,
      toolName: 'writeDemoCase',
    }).status, 'denied')
    assert.equal(authorizeMcpInvocation(snapshot, {
      ...request,
      scopes: ['external_network'],
    }).status, 'denied')
  })

  it('denies MCP invocations that require user authorization until explicit auth is supplied', () => {
    const snapshot = snapshotWithDemocaseTool({ requiresUserAuth: true })
    const result = authorizeMcpInvocation(snapshot, democaseRequest())

    assert.deepEqual(result, {
      status: 'denied',
      code: 'MCP_USER_AUTH_REQUIRED',
      message: 'MCP tool requires user authorization: mcp_encyclopedia_democase_readonly',
    })
  })

  it('normalizes unavailable MCP results for user-facing degradation and replay', () => {
    const request = democaseRequest()
    assert.deepEqual(mcpUnavailableResult(request, 'democase service timeout', '2026-07-05T00:00:00.000Z'), {
      invocationId: 'mcp_inv_1',
      status: 'unavailable',
      mcpToolId: 'mcp_encyclopedia_democase_readonly',
      source: {
        serverName: 'encyclopedia-democase',
        toolName: 'lookupEntryDemoCases',
        scopes: ['readonly_context'],
      },
      summary: 'MCP tool unavailable.',
      references: [],
      error: {
        code: 'MCP_UNAVAILABLE',
        message: 'democase service timeout',
        retryable: true,
      },
      completedAt: '2026-07-05T00:00:00.000Z',
    })
  })

  it('formats successful MCP results as sourced prompt context', () => {
    const request = democaseRequest()
    const result = {
      invocationId: request.invocationId,
      status: 'ok' as const,
      mcpToolId: request.mcpToolId,
      source: {
        serverName: request.serverName,
        toolName: request.toolName,
        scopes: request.scopes,
      },
      summary: 'Matched 2 approved demo cases for dynamic encyclopedia generation.',
      references: [
        { id: 'demo_baidu_baike_company', title: '百度百科' },
        { id: 'demo_company_history', title: '企业发展史' },
      ],
      data: { matchCount: 2 },
      completedAt: '2026-07-05T00:00:00.000Z',
    }

    const context = mcpToolPromptContext(result)

    assert.equal(context?.invocationId, request.invocationId)
    assert.equal(context?.source.serverName, 'encyclopedia-democase')
    assert.match(context?.contextText ?? '', /Source: encyclopedia-democase\.lookupEntryDemoCases/)
    assert.match(context?.contextText ?? '', /Use this as sourced context only/)
  })
})

function democaseRequest(): McpInvocationRequest {
  return {
    invocationId: 'mcp_inv_1',
    mode: 'authorized_invocation',
    userId: 'user_1',
    workspaceId: 'workspace_1',
    sessionId: 'session_1',
    jobId: 'job_1',
    variationId: 'var_1',
    runtimeSessionId: 'rt_child_1',
    mcpToolId: 'mcp_encyclopedia_democase_readonly',
    serverName: 'encyclopedia-democase',
    toolName: 'lookupEntryDemoCases',
    scopes: ['readonly_context'],
    input: { entryTitle: '百度百科' },
    reason: 'Need readonly demo cases for generation context.',
    requestedAt: '2026-07-05T00:00:00.000Z',
  }
}

function snapshotWithDemocaseTool(options: { requiresUserAuth?: boolean } = {}): CapabilitySnapshot {
  return {
    schemaVersion: '2026-07-01.dudesign-capabilities.v2',
    profileVersion: '2026-07-01.dudesign-capabilities.v2',
    template: {
      domainTemplate: {
        id: 'tpl_dynamic_encyclopedia_entry',
        name: 'Dynamic Encyclopedia Entry',
        category: 'encyclopedia',
        description: 'Dynamic encyclopedia card.',
        contentVersion: '1',
        structure: { sections: [], requiredElements: [], optionalElements: [] },
        constraints: [],
        variationDirections: [],
      },
      aestheticProfile: {
        id: 'aes_dynamic_encyclopedia',
        name: 'Dynamic Encyclopedia',
        description: 'Compact factual card.',
        colorPaletteIds: ['pal_dynamic_encyclopedia'],
        mood: [],
        occasion: [],
        tone: [],
        formality: 'medium',
        density: 'compact',
        bestFor: ['encyclopedia'],
        avoidFor: [],
        typographyTone: 'clear',
        layoutTone: 'fixed card',
        motionTone: 'subtle',
        negativeRules: [],
      },
      colorPalette: {
        id: 'pal_dynamic_encyclopedia',
        name: 'Dynamic Encyclopedia Blue',
        colors: ['#6487FA'],
        usage: { primary: '#6487FA' },
        accessibilityNotes: [],
      },
      brandStyleReference: null,
    },
    plugins: {
      skillIds: [],
      mcpToolIds: ['mcp_encyclopedia_democase_readonly'],
      pluginSnapshot: {
        plugins: [{
          id: 'plug_encyclopedia_entry_guidance',
          type: 'mixed',
          visibility: 'official',
          name: 'Encyclopedia Entry Guidance',
          description: 'Readonly democase context.',
          category: 'encyclopedia',
          safetyLevel: 'safe',
          status: 'active',
          permissionPolicy: {
            scopes: ['readonly_context'],
            maxPromptChars: 2400,
            allowRuntimeToolUse: false,
            requiresUserAuth: options.requiresUserAuth ?? false,
            auditLevel: 'usage',
          },
        }],
        skills: [],
        mcpToolBindings: [{
          id: 'mcp_encyclopedia_democase_readonly',
          pluginId: 'plug_encyclopedia_entry_guidance',
          serverName: 'encyclopedia-democase',
          toolName: 'lookupEntryDemoCases',
          scopes: ['readonly_context'],
          requiresUserAuth: options.requiresUserAuth ?? false,
          allowedTemplateCategories: ['encyclopedia'],
        }],
        toolPolicy: {
          allowedMcpToolIds: ['mcp_encyclopedia_democase_readonly'],
          scopes: ['readonly_context'],
          requiresUserAuth: options.requiresUserAuth ?? false,
          auditLevel: 'usage',
        },
      },
    },
    automation: {
      loopProfile: {
        id: 'loop_standard',
        name: 'Standard',
        description: 'Standard quality loop.',
        maxRepairAttempts: 1,
        maxCostCents: 200,
        maxDurationMs: 300000,
        qualityGates: ['static'],
        repairStrategy: 'minimal_refine',
      },
      maxRepairAttempts: 1,
      maxCostCents: 200,
      maxDurationMs: 300000,
    },
  }
}
