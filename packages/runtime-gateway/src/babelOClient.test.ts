import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CapabilitySnapshot, DesignTemplatePack, InteractionParadigm, PluginPermissionScope } from '@dudesign/contracts'

import { BabelORuntimeClient, DUDESIGN_RUNTIME_CONTRACT_VERSION, RuntimeGatewayError } from './babelOClient.js'

describe('BabelORuntimeClient', () => {
  it('normalizes compatible health and contract responses', async () => {
    const calls: Array<{ url: string; headers: Headers }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test/',
      apiKey: 'test-key',
      fetch: async (url, init) => {
        calls.push({ url: String(url), headers: new Headers(init?.headers) })
        if (String(url).endsWith('/v1/health')) {
          return jsonResponse({
            runtime: 'babel-o',
            runtimeVersion: '1.2.3',
            contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
          })
        }
        return jsonResponse({
          runtime: 'babel-o',
          runtimeVersion: '1.2.3',
          contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
          requiredEndpoints: ['GET /v1/health', 'GET /v1/contract'],
          requiredEvents: ['session_started', 'result'],
          eventMappings: {
            session_started: 'design.session_started',
            result: 'design.variation_completed',
            future: 'not_a_design_event',
          },
        })
      },
    })

    const health = await client.getRuntimeHealth()
    const contract = await client.getRuntimeContract()

    assert.equal(health.status, 'compatible')
    assert.equal(health.runtimeVersion, '1.2.3')
    assert.equal(contract.status, 'compatible')
    assert.deepEqual(contract.requiredEndpoints, ['GET /v1/health', 'GET /v1/contract'])
    assert.deepEqual(contract.eventMappings, {
      session_started: 'design.session_started',
      result: 'design.variation_completed',
    })
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/health')
    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer test-key')
  })

  it('marks runtime as contract_mismatch when the manifest version drifts', async () => {
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async () =>
        jsonResponse({
          runtimeVersion: '2.0.0',
          contractVersion: '2026-06-27.babel-o-runtime.v2',
        }),
    })

    const health = await client.getRuntimeHealth()
    const contract = await client.getRuntimeContract()

    assert.equal(health.status, 'contract_mismatch')
    assert.equal(contract.status, 'contract_mismatch')
  })

  it('returns unavailable snapshots when runtime health or contract cannot be fetched', async () => {
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async () => {
        throw new Error('connection refused')
      },
    })

    const health = await client.getRuntimeHealth()
    const contract = await client.getRuntimeContract()

    assert.equal(health.status, 'unavailable')
    assert.equal(health.runtimeVersion, null)
    assert.match(health.message ?? '', /connection refused/)
    assert.equal(contract.status, 'unavailable')
    assert.deepEqual(contract.requiredEndpoints, [])
  })

  it('normalizes the BabeL-O runtime model matrix', async () => {
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async url => {
        assert.equal(String(url), 'https://runtime.example.test/v1/models')
        return jsonResponse({
          type: 'runtime_models',
          discoveryStatus: 'supported',
          version: 7,
          defaultModel: 'openai/gpt-5',
          activeProfile: 'prod',
          providers: [
            {
              id: 'openai',
              displayName: 'OpenAI-compatible',
              adapter: 'openai-compatible',
              authMode: 'bearer',
              defaultBaseUrl: 'https://api.openai.com/v1',
              defaultModel: 'openai/gpt-5',
              configured: false,
              authConfigured: true,
              authSource: 'env',
              active: true,
              apiKey: 'must-not-leak',
              models: [
                {
                  id: 'openai/gpt-5',
                  name: 'GPT-5',
                  contextWindow: 400000,
                  defaultMaxTokens: 8192,
                  capabilities: {
                    toolCalling: true,
                    jsonOutput: true,
                    streaming: true,
                  },
                },
              ],
            },
          ],
        })
      },
    })

    const models = await client.listRuntimeModels()

    assert.equal(models.type, 'runtime_models')
    assert.equal(models.discoveryStatus, 'supported')
    assert.equal(models.version, 7)
    assert.equal(models.defaultModel, 'openai/gpt-5')
    assert.equal(models.activeProfile, 'prod')
    assert.equal(models.providers[0]?.id, 'openai')
    assert.equal(models.providers[0]?.authSource, 'env')
    assert.equal(models.providers[0]?.models[0]?.contextWindow, 400000)
    assert.equal(models.providers[0]?.models[0]?.capabilities.toolCalling, true)
    assert.doesNotMatch(JSON.stringify(models), /must-not-leak/)
  })

  it('falls back to the legacy runtime model endpoint before reporting unsupported discovery', async () => {
    const calls: string[] = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async url => {
        calls.push(String(url))
        if (String(url).endsWith('/v1/models')) {
          return jsonResponseWithStatus({ type: 'error', code: 'NOT_FOUND' }, 404)
        }
        return jsonResponse({
          type: 'runtime_models',
          version: 8,
          defaultModel: 'local/coding-runtime',
          providers: [
            {
              id: 'local',
              displayName: 'Local',
              adapter: 'local',
              authMode: 'none',
              defaultModel: 'local/coding-runtime',
              configured: true,
              authConfigured: true,
              authSource: 'none',
              active: true,
              models: [
                {
                  id: 'local/coding-runtime',
                  name: 'Local Coding Runtime',
                  contextWindow: 8192,
                  defaultMaxTokens: 4096,
                  capabilities: { toolCalling: true, jsonOutput: false, streaming: true },
                },
              ],
            },
          ],
        })
      },
    })

    const models = await client.listRuntimeModels()

    assert.deepEqual(calls, [
      'https://runtime.example.test/v1/models',
      'https://runtime.example.test/v1/runtime/models',
    ])
    assert.equal(models.discoveryStatus, 'supported')
    assert.equal(models.providers[0]?.models[0]?.id, 'local/coding-runtime')
  })

  it('returns unsupported runtime models when neither discovery endpoint is available', async () => {
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async () => jsonResponseWithStatus({ type: 'error', code: 'NOT_FOUND', message: 'not found' }, 404),
    })

    const models = await client.listRuntimeModels()

    assert.equal(models.type, 'runtime_models')
    assert.equal(models.discoveryStatus, 'unsupported')
    assert.deepEqual(models.providers, [])
    assert.match(models.message ?? '', /404|not found/i)
  })

  it('creates a runtime session with isolated workspace and memory context', async () => {
    const calls: Array<{ url: string; method: string; body: unknown; headers: Headers }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      apiKey: 'gateway-key',
      authHeaderName: 'x-runtime-key',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: JSON.parse(String(init?.body)),
          headers: new Headers(init?.headers),
        })
        return jsonResponse({ runtimeSessionId: 'rt_ses_123' })
      },
    })

    const created = await client.createSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })

    assert.equal(created.runtimeSessionId, 'rt_ses_123')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/sessions')
    assert.equal(calls[0]?.method, 'POST')
    assert.equal(calls[0]?.headers.get('content-type'), 'application/json')
    assert.equal(calls[0]?.headers.get('x-runtime-key'), 'gateway-key')
    assert.deepEqual(calls[0]?.body, {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })
  })

  it('falls back to bearer authorization when auth header name is blank', async () => {
    const calls: Array<{ headers: Headers }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      apiKey: 'gateway-key',
      authHeaderName: '   ',
      fetch: async (_url, init) => {
        calls.push({ headers: new Headers(init?.headers) })
        return jsonResponse({
          runtime: 'babel-o',
          runtimeVersion: '1.2.3',
          contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
        })
      },
    })

    const health = await client.getRuntimeHealth()

    assert.equal(health.status, 'compatible')
    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer gateway-key')
  })

  it('resumes an existing runtime session', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: JSON.parse(String(init?.body)),
        })
        return jsonResponse({
          status: 'resumed',
          runtimeSessionId: 'rt_ses_existing',
          message: 'ok',
        })
      },
    })

    const resumed = await client.resumeSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      runtimeSessionId: 'rt_ses_existing',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      fallbackSummary: 'previous task summary',
    })

    assert.equal(resumed.status, 'resumed')
    assert.equal(resumed.runtimeSessionId, 'rt_ses_existing')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/sessions/rt_ses_existing/resume')
    assert.equal(calls[0]?.method, 'POST')
    assert.deepEqual(calls[0]?.body, {
      userId: 'user_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      fallbackSummary: 'previous task summary',
    })
  })

  it('rebuilds a runtime session when no previous runtime session id exists', async () => {
    const calls: Array<{ url: string; body: unknown }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        })
        return jsonResponse({ runtimeSessionId: 'rt_ses_rebuilt' })
      },
    })

    const resumed = await client.resumeSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      runtimeSessionId: null,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })

    assert.equal(resumed.status, 'rebuilt')
    assert.equal(resumed.runtimeSessionId, 'rt_ses_rebuilt')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/sessions')
    assert.deepEqual(calls[0]?.body, {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })
  })

  it('rebuilds a runtime session when resume fails', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: init?.body ? JSON.parse(String(init.body)) : null,
        })
        if (String(url).endsWith('/resume')) {
          return new Response('gone', { status: 410 })
        }
        return jsonResponse({ runtimeSessionId: 'rt_ses_rebuilt_after_resume_failure' })
      },
    })

    const resumed = await client.resumeSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      runtimeSessionId: 'rt_ses_stale',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })

    assert.equal(resumed.status, 'rebuilt')
    assert.equal(resumed.runtimeSessionId, 'rt_ses_rebuilt_after_resume_failure')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/sessions/rt_ses_stale/resume')
    assert.equal(calls[1]?.url, 'https://runtime.example.test/v1/sessions')
    assert.deepEqual(calls[1]?.body, {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })
  })

  it('creates a refine agent with current artifact context', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          ...(init?.body && { body: JSON.parse(String(init.body)) }),
        })
        return jsonResponse({
          streamId: 'refine_stream_1',
          agentJobId: 'refine_agent_1',
          runtimeChildSessionId: 'rt_child_1',
        })
      },
    })

    const agent = await client.createRefineAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      variationId: 'variation_1',
      variationIndex: 2,
      runtimeChildSessionId: 'rt_child_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<!doctype html><h1>Current HTML</h1>',
      baseArtifactEntryPath: 'index.html',
      baseArtifactVersion: 3,
      prompt: 'Make the hero bolder',
      annotationPromptSuffix: 'Annotation feedback: rect at 10,20.',
      workspaceRoot: 'workspaces/workspace_1',
      deviceContext: 'desktop',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
    })

    assert.equal(agent.streamId, 'refine_stream_1')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/agents/refine')
    assert.equal(calls[0]?.method, 'POST')
    assert.deepEqual(calls[0]?.body, {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      variationId: 'variation_1',
      variationIndex: 2,
      runtimeChildSessionId: 'rt_child_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<!doctype html><h1>Current HTML</h1>',
      baseArtifactEntryPath: 'index.html',
      baseArtifactVersion: 3,
      prompt: 'Make the hero bolder',
      annotationPromptSuffix: 'Annotation feedback: rect at 10,20.',
      workspaceRoot: 'workspaces/workspace_1/runtime-jobs/job_1/variation_02',
      parentWorkspaceRoot: 'workspaces/workspace_1',
      deviceContext: 'desktop',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
    })
  })

  it('spawns a variation agent and streams NDJSON runtime events', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? 'GET',
          ...(init?.body && { body: JSON.parse(String(init.body)) }),
        })
        if (String(url).endsWith('/v1/agents')) {
          return jsonResponse({
            streamId: 'stream_1',
            agentJobId: 'agent_job_1',
            runtimeChildSessionId: 'rt_child_1',
          })
        }
        return streamResponse('{"type":"assistant_delta","delta":"hello"}\n{"type":"result","artifactId":"artifact_1"}\n')
      },
    })

    const agent = await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a page',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 2,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
      templateRequirements: {
        styles: ['minimal'],
        notes: 'Reference brand inspiration: Apple-inspired. Use as inspiration only.\nNegative requirements: No busy gradients',
        advancedConstraints: {
          colorPaletteId: 'pal_minimal_mono',
          styleNotes: ['premium product storytelling'],
          brandStyleReferenceId: 'brand_apple_inspired',
          referenceBrand: 'Apple-inspired',
          negativeRequirements: ['No busy gradients'],
        },
        capabilitySnapshot: {
          schemaVersion: '2026-07-01.dudesign-capabilities.v2',
          template: {
            domainTemplate: {
              id: 'tpl_fintech_trust',
              name: 'Fintech Trust Landing',
              category: 'finance',
              description: 'Trust-oriented fintech landing page.',
              contentVersion: '1.0.0',
              structure: {
                sections: ['hero', 'trust', 'pricing'],
                requiredElements: ['headline', 'cta'],
                optionalElements: ['faq'],
              },
              constraints: ['Use clear compliance-safe copy.'],
              variationDirections: ['Minimal trust-led layout.'],
            },
            aestheticProfile: {
              id: 'aes_trustworthy_saas',
              name: 'Trustworthy SaaS',
              description: 'Calm SaaS visual system.',
              colorPaletteIds: ['pal_blue_white_trust'],
              mood: ['calm'],
              occasion: ['launch'],
              tone: ['professional'],
              formality: 'medium',
              density: 'balanced',
              bestFor: ['finance'],
              avoidFor: ['games'],
              typographyTone: 'clear geometric sans',
              layoutTone: 'spacious grid',
              motionTone: 'subtle',
              negativeRules: ['Avoid hype-heavy visuals.'],
            },
            colorPalette: {
              id: 'pal_blue_white_trust',
              name: 'Blue White Trust',
              colors: ['#ffffff', '#1d4ed8'],
              usage: { background: '#ffffff', accent: '#1d4ed8' },
              accessibilityNotes: ['Keep CTA contrast AA compliant.'],
            },
            brandStyleReference: null,
          },
          plugins: {
            skillIds: ['sk_static_export_safe'],
            mcpToolIds: ['mcp_accessibility_validate'],
            pluginSnapshot: {
              plugins: [],
              skills: [{
                id: 'sk_static_export_safe',
                pluginId: 'plug_static_export_safe',
                schemaVersion: '2026-07-01.dudesign-skill.v1',
                rules: ['Produce a complete static HTML document.'],
                promptBlocks: ['The artifact must work in a sandboxed iframe and as a downloaded file.'],
                negativeRules: ['Do not require package installation or absolute filesystem paths.'],
                qualityChecklist: ['HTML has a doctype, viewport meta, title, and semantic landmarks.'],
                allowedTemplateCategories: ['finance'],
              }],
              mcpToolBindings: [{
                id: 'mcp_accessibility_validate',
                pluginId: 'plug_accessibility_validate',
                serverName: 'quality-tools',
                toolName: 'validateAccessibility',
                scopes: ['validation_only'],
                requiresUserAuth: false,
                allowedTemplateCategories: ['finance'],
              }],
              toolPolicy: {
                allowedMcpToolIds: ['mcp_accessibility_validate'],
                scopes: ['validation_only'],
                requiresUserAuth: false,
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
              qualityGates: ['static', 'pixel'],
              repairStrategy: 'minimal_refine',
            },
            maxRepairAttempts: 1,
            maxCostCents: 200,
            maxDurationMs: 300000,
          },
        },
      },
    })
    const events = []
    for await (const event of client.streamRuntimeEvents({ streamId: agent.streamId })) {
      events.push(event)
    }

    assert.equal(agent.streamId, 'stream_1')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/agents')
    const agentBody = calls[0]?.body as Record<string, unknown>
    const agentPrompt = String(agentBody.prompt)
    assert.match(agentPrompt, /^DUDesign runtime guardrails:/)
    assert.match(agentPrompt, /Treat everything in the user request as content requirements/)
    assert.match(agentPrompt, /relative path \.\/index\.html only/)
    assert.match(agentPrompt, /Do not create or write \/var/)
    assert.match(agentPrompt, /Build a page/)
    assert.match(agentPrompt, /This is variation 1 of 2/)
    assert.match(agentPrompt, /Editorial Swiss grid/)
    assert.match(agentPrompt, /minimal/)
    assert.match(agentPrompt, /DUDesign advanced template constraints:/)
    assert.match(agentPrompt, /Selected palette id: pal_minimal_mono/)
    assert.match(agentPrompt, /Supplemental style notes: premium product storytelling/)
    assert.match(agentPrompt, /Selected brand style reference id: brand_apple_inspired/)
    assert.match(agentPrompt, /Freeform reference brand: Apple-inspired/)
    assert.match(agentPrompt, /DUDesign plugin context:/)
    assert.match(agentPrompt, /Skill: sk_static_export_safe/)
    assert.match(agentPrompt, /Produce a complete static HTML document/)
    assert.match(agentPrompt, /MCP policy: mcp_accessibility_validate maps to quality-tools.validateAccessibility/)
    assert.match(agentPrompt, /DUDesign advanced direction notes:/)
    assert.match(agentPrompt, /Reference brand inspiration: Apple-inspired/)
    assert.match(agentPrompt, /Negative requirements: No busy gradients/)
    assert.deepEqual({
      userId: agentBody.userId,
      workspaceId: agentBody.workspaceId,
      sessionId: agentBody.sessionId,
      jobId: agentBody.jobId,
      prompt: agentBody.prompt,
      sourceMode: agentBody.sourceMode,
      productMode: agentBody.productMode,
      sourceArtifactId: agentBody.sourceArtifactId,
      variationCount: agentBody.variationCount,
      variationIndex: agentBody.variationIndex,
      workspaceRoot: agentBody.workspaceRoot,
      parentWorkspaceRoot: agentBody.parentWorkspaceRoot,
      memoryNamespace: agentBody.memoryNamespace,
      modelServiceId: agentBody.modelServiceId,
      modelId: agentBody.modelId,
      modelProvider: agentBody.modelProvider,
    }, {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: agentPrompt,
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 2,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1/runtime-jobs/job_1/variation_01',
      parentWorkspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
    })
    const templateRequirements = agentBody.templateRequirements as Record<string, unknown>
    const capabilitySnapshot = templateRequirements.capabilitySnapshot as Record<string, unknown>
    const templateSnapshot = capabilitySnapshot.template as Record<string, Record<string, unknown>>
    assert.deepEqual(templateRequirements.styles, ['minimal'])
    assert.equal(templateRequirements.variationStyleDirection, 'Editorial Swiss grid: precise hierarchy, restrained typography, generous whitespace, and one confident accent. Interpret the user-requested style tags through this direction: minimal.')
    assert.deepEqual(templateRequirements.toolPolicy, {
      allowedMcpToolIds: ['mcp_accessibility_validate'],
      scopes: ['validation_only'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
    assert.equal(capabilitySnapshot.schemaVersion, '2026-07-01.dudesign-capabilities.v2')
    assert.equal(templateSnapshot.domainTemplate?.id, 'tpl_fintech_trust')
    assert.equal(templateSnapshot.domainTemplate?.description, 'Trust-oriented fintech landing page.')
    assert.equal(templateSnapshot.aestheticProfile?.typographyTone, 'clear geometric sans')
    assert.deepEqual(templateSnapshot.colorPalette?.colors, ['#ffffff', '#1d4ed8'])
    const pluginSnapshot = (capabilitySnapshot.plugins as Record<string, unknown>).pluginSnapshot as {
      skills?: Array<{ id: string }>
      mcpToolBindings?: Array<{ id: string }>
    }
    assert.equal(pluginSnapshot.skills?.[0]?.id, 'sk_static_export_safe')
    assert.equal(pluginSnapshot.mcpToolBindings?.[0]?.id, 'mcp_accessibility_validate')
    assert.equal(calls[1]?.url, 'https://runtime.example.test/v1/stream?streamId=stream_1')
    assert.deepEqual(events, [
      { type: 'assistant_delta', delta: 'hello' },
      { type: 'result', artifactId: 'artifact_1' },
    ])
  })

  it('injects distinct deterministic style directions for sibling variations', async () => {
    const prompts: string[] = []
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompts.push(body.prompt)
        return jsonResponse({
          streamId: `stream_${prompts.length}`,
          agentJobId: `agent_job_${prompts.length}`,
          runtimeChildSessionId: `rt_child_${prompts.length}`,
        })
      },
    })

    for (const variationIndex of [1, 2, 3]) {
      await client.spawnVariationAgent({
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'session_1',
        jobId: 'job_1',
        prompt: 'Build a pricing page',
        sourceMode: 'new_html',
        sourceArtifactId: null,
        variationCount: 3,
        variationIndex,
        workspaceRoot: 'workspaces/workspace_1',
        memoryNamespace: 'memory:user:user_1',
        templateRequirements: {
          styles: ['trustworthy'],
        },
      })
    }

    assert.equal(new Set(prompts).size, 3)
    assert.match(prompts[0] ?? '', /Editorial Swiss grid/)
    assert.match(prompts[1] ?? '', /Bold conversion-focused SaaS/)
    assert.match(prompts[2] ?? '', /Warm product story/)
    assert.ok(prompts.every(prompt => prompt.includes('trustworthy')))
  })

  it('golden replays dynamic encyclopedia child template prompt context', async () => {
    let prompt = ''
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompt = body.prompt
        return jsonResponse({
          streamId: 'stream_encyclopedia',
          agentJobId: 'agent_job_encyclopedia',
          runtimeChildSessionId: 'rt_child_encyclopedia',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a dynamic encyclopedia entry card',
      sourceMode: 'new_html',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        businessContext: {
          guidanceId: 'eg_baidu_baike',
          entryTitle: '百度百科',
          entryPrimaryCategory: '作品',
          entrySecondaryCategory: '游戏',
          interactionParadigmId: 'ip_timeline_story',
          recommendedTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card'],
          automationMode: 'semi_auto',
        },
        variationTemplateAssignments: [{
          variationIndex: 1,
          designTemplatePackId: 'dtp_dynamic_encyclopedia_timeline_card',
          designTemplatePack: dynamicEncyclopediaTemplatePack(),
        }],
      },
    })

    const templateBlock = extractPromptBlock(prompt, 'DUDesign assigned Template Pack:', 'DUDesign variation directive:')
    assert.equal(templateBlock, [
      'DUDesign assigned Template Pack:',
      '- Template: Dynamic Encyclopedia Timeline Card (dtp_dynamic_encyclopedia_timeline_card) — Timeline child template with fixed PC and WISE viewport constraints.',
      '- Dynamic encyclopedia business context:',
      '  guidanceId=eg_baidu_baike',
      '  entryTitle=百度百科',
      '  entryCategory=作品/游戏',
      '  interactionParadigmId=ip_timeline_story',
      '  recommendedTemplateIds=dtp_dynamic_encyclopedia_timeline_card',
      '  automationMode=semi_auto',
      '- Overview: A child template for biographies, release histories, and staged entity development.',
      '- Color tokens: primary=#6487FA, surface=#FFFFFF, background=#F8F8F8, text=#1E1F24, muted=#848691, subtle=#B7B9C1.',
      '- Typography tokens: body=Inter, PingFang SC, system-ui 16px weight 400.',
      '- Spacing tokens: frame=16.',
      '- Component rules: pc-card-frame: {"width":788,"height":492,"unit":"px","strict":true}; wise-standard-frame: {"width":380,"height":456,"ratio":"1:1.2"}; timeline-track: {"accentColor":"#6487FA","markerSize":8}; scroll-container: {"overflowY":"auto","webkitOverflowScrolling":"touch","bodyScroll":false}.',
      '- Layout rationale: Lead with entry summary, then a vertical or segmented timeline inside a scroll container. PC must render perfectly at 788x492. WISE standard must render perfectly at 380x456.',
      '- Component rationale: Timeline track, milestone cards, period filters, summary chips, and explicit overflow container.',
      '- Template sections and constraints: sizing: PC 788x492. WISE standard 380x456. WISE compatibility sizes 396x475 and 300x360. iframeTouch: Avoid iframe pinch zoom conflicts. Do not globally intercept touchmove. Allow scroll-container and iframe targets. scrolling: Set html/body to height 100% and overflow hidden; put all long content inside .scroll-container with overflow-y auto. timeline: Add dated or phased milestones without inventing exact dates.',
      '- Do: Use a dedicated overflow container instead of body scrolling. Keep iframe and mobile gesture compatibility explicit. Group sparse dates into phases when exact dates are unavailable.',
      '- Do not: Do not bind global touchmove preventDefault. Do not set global touch-action: none. Do not fabricate dates or milestones. Do not use video, download, or outbound navigation as core interactions.',
      '- Treat this Template Pack as a stable snapshot for this variation. Do not imitate public brands or proprietary trade dress.',
    ].join('\n'))
  })

  it('golden replays layered dynamic encyclopedia template and interaction context', async () => {
    let prompt = ''
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompt = body.prompt
        return jsonResponse({
          streamId: 'stream_encyclopedia_layered',
          agentJobId: 'agent_job_encyclopedia_layered',
          runtimeChildSessionId: 'rt_child_encyclopedia_layered',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a dynamic encyclopedia timeline entry card',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        businessContext: {
          guidanceId: 'eg_game_release',
          entryTitle: '示例游戏',
          entryPrimaryCategory: '作品',
          entrySecondaryCategory: '游戏',
          interactionParadigmId: 'ip_timeline_story',
          recommendedTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card'],
          automationMode: 'auto',
        },
        interactionParadigm: dynamicEncyclopediaTimelineParadigm(),
        designTemplatePacks: [
          dynamicEncyclopediaParentTemplatePack(),
          dynamicEncyclopediaTemplatePack(),
        ],
        variationTemplateAssignments: [{
          variationIndex: 1,
          designTemplatePackId: 'dtp_dynamic_encyclopedia_timeline_card',
          designTemplatePack: dynamicEncyclopediaTemplatePack(),
        }],
      },
    })

    const templateBlock = extractPromptBlock(prompt, 'DUDesign assigned Template Pack:', 'DUDesign variation directive:')
    assert.equal(templateBlock, [
      'DUDesign assigned Template Pack:',
      '- Parent package: Dynamic Encyclopedia Entry Card (dtp_dynamic_encyclopedia_card) — Interactive encyclopedia card parent package for compact knowledge entries.',
      '- Parent package role: parent_pack.',
      '- Parent package inherited constraints: sizing: PC 788x492 exact composition. WISE standard 380x456. iframeTouch: Avoid global touch interception and preserve iframe/mobile gesture compatibility.',
      '- Parent package do: Use a dedicated scroll container. Use local interactive UI states instead of external navigation.',
      '- Parent package do not: Do not imitate public encyclopedia, search engine, browser, or mobile app trade dress. Do not attach global touchmove preventDefault handlers.',
      '- Template: Dynamic Encyclopedia Timeline Card (dtp_dynamic_encyclopedia_timeline_card) — Timeline child template with fixed PC and WISE viewport constraints.',
      '- Dynamic encyclopedia business context:',
      '  guidanceId=eg_game_release',
      '  entryTitle=示例游戏',
      '  entryCategory=作品/游戏',
      '  interactionParadigmId=ip_timeline_story',
      '  recommendedTemplateIds=dtp_dynamic_encyclopedia_timeline_card',
      '  automationMode=auto',
      '- Interaction paradigm: Timeline Story (ip_timeline_story) — A chronological interaction for life stages, release history, enterprise development, events, or work evolution.',
      '  category=encyclopedia',
      '  bestFor=历史人物, 影视作品, 文学著作, 企业, 文化活动, 游戏',
      '  avoidFor=entries without event order or milestone data',
      '  requiredDataShape=dated or ordered events, phase labels, short event descriptions',
      '  compatibleTemplatePackIds=dtp_dynamic_encyclopedia_timeline_card',
      '- Overview: A child template for biographies, release histories, and staged entity development.',
      '- Color tokens: primary=#6487FA, surface=#FFFFFF, background=#F8F8F8, text=#1E1F24, muted=#848691, subtle=#B7B9C1.',
      '- Typography tokens: body=Inter, PingFang SC, system-ui 16px weight 400.',
      '- Spacing tokens: frame=16.',
      '- Component rules: pc-card-frame: {"width":788,"height":492,"unit":"px","strict":true}; wise-standard-frame: {"width":380,"height":456,"ratio":"1:1.2"}; timeline-track: {"accentColor":"#6487FA","markerSize":8}; scroll-container: {"overflowY":"auto","webkitOverflowScrolling":"touch","bodyScroll":false}.',
      '- Layout rationale: Lead with entry summary, then a vertical or segmented timeline inside a scroll container. PC must render perfectly at 788x492. WISE standard must render perfectly at 380x456.',
      '- Component rationale: Timeline track, milestone cards, period filters, summary chips, and explicit overflow container.',
      '- Template sections and constraints: sizing: PC 788x492. WISE standard 380x456. WISE compatibility sizes 396x475 and 300x360. iframeTouch: Avoid iframe pinch zoom conflicts. Do not globally intercept touchmove. Allow scroll-container and iframe targets. scrolling: Set html/body to height 100% and overflow hidden; put all long content inside .scroll-container with overflow-y auto. timeline: Add dated or phased milestones without inventing exact dates.',
      '- Do: Use a dedicated overflow container instead of body scrolling. Keep iframe and mobile gesture compatibility explicit. Group sparse dates into phases when exact dates are unavailable.',
      '- Do not: Do not bind global touchmove preventDefault. Do not set global touch-action: none. Do not fabricate dates or milestones. Do not use video, download, or outbound navigation as core interactions.',
      '- Treat this Template Pack as a stable snapshot for this variation. Do not imitate public brands or proprietary trade dress.',
    ].join('\n'))
  })

  it('golden replays dynamic encyclopedia entry guidance skill prompt block', async () => {
    let prompt = ''
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { prompt: string }
        prompt = body.prompt
        return jsonResponse({
          streamId: 'stream_entry_guidance',
          agentJobId: 'agent_job_entry_guidance',
          runtimeChildSessionId: 'rt_child_entry_guidance',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: '词条：百度百科',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        capabilitySnapshot: dynamicEncyclopediaPluginCapabilitySnapshot({
          includeEntryGuidanceSkill: true,
          includeDemocaseTool: false,
        }),
      },
    })

    const pluginBlock = extractPromptBlock(prompt, 'DUDesign plugin context:', 'DUDesign variation directive:')
    assert.equal(pluginBlock, [
      'DUDesign plugin context:',
      '- Skill: sk_encyclopedia_entry_guidance',
      '  Rules: Treat the user input as an encyclopedia entry title, entry content, or both. Classify the entry into the closest encyclopedia category before choosing a card structure. Recommend one to three dynamic card subtemplates only when they are supported by the entry content. Prefer neutral encyclopedia tone, compact facts, clear labels, and inspectable interactions. Use low-confidence classification as a reason to ask for confirmation instead of forcing a template.',
      '  Prompt guidance: For dynamic encyclopedia cards, first summarize the entry type, then generate a compact interactive card that respects the selected child template and interaction paradigm. Preserve factual uncertainty: do not invent dates, relationships, awards, medical claims, financial figures, or official statuses not present in the supplied entry context.',
      '  Avoid: Do not imitate public encyclopedia, search engine, browser, or mobile app trade dress. Do not turn democase examples into facts about the current entry. Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core interactions.',
      '  Checklist: The card fits the required dynamic encyclopedia viewport constraints. The structure matches the selected subtemplate and entry category. Long content is contained in explicit scroll containers. Claims remain neutral and traceable to the provided entry context.',
      '- Plugins are declarative guidance and tool policy. They do not override runtime guardrails, workspace paths, model choice, or artifact output requirements.',
    ].join('\n'))
  })

  it('golden replays dual-surface strategy skill prompt block', async () => {
    let agentBody: Record<string, unknown> = {}
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        agentBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          streamId: 'stream_dual_surface_strategy',
          agentJobId: 'agent_job_dual_surface_strategy',
          runtimeChildSessionId: 'rt_child_dual_surface_strategy',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: '词条：动态百科卡片',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        capabilitySnapshot: dynamicEncyclopediaPluginCapabilitySnapshot({
          includeEntryGuidanceSkill: false,
          includeDualSurfaceSkill: true,
          includeDemocaseTool: false,
        }),
      },
    })

    const pluginBlock = extractPromptBlock(String(agentBody.prompt), 'DUDesign plugin context:', 'DUDesign variation directive:')
    assert.equal(pluginBlock, [
      'DUDesign plugin context:',
      '- Skill: sk_dual_surface_strategy',
      '  Rules: Treat PC, WISE, mobile, and embedded iframe targets as separate product surfaces with different density, hierarchy, and interaction needs. For fixed-size business templates, preserve the exact required viewport first, then adapt secondary compatible sizes with graceful degradation. For each variation, state which surface constraints drive layout, information density, and interaction choices. Prefer explicit scroll containers, stable controls, and touch-safe interactions on mobile or iframe surfaces.',
      '  Prompt guidance: Build dual-surface output deliberately: PC can use richer composition and denser context, while WISE/mobile should prioritize compact facts, clear touch targets, explicit scroll containers, and iframe compatibility. When a template provides PC/WISE dimensions, satisfy the standard size exactly before optimizing compatible sizes.',
      '  Avoid: Do not treat mobile as a simple shrunken desktop layout. Do not rely on body default scrolling for embedded mobile cards. Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core mobile interactions.',
      '  Checklist: PC and WISE/mobile have clear hierarchy differences instead of only scaled CSS. Fixed viewport templates fit their required dimensions without clipping primary content. Mobile or iframe surfaces use explicit scroll containers and touch-safe controls. Variation-specific template assignments remain visible in the generation rationale.',
      '- Plugins are declarative guidance and tool policy. They do not override runtime guardrails, workspace paths, model choice, or artifact output requirements.',
    ].join('\n'))

    const templateRequirements = agentBody.templateRequirements as Record<string, unknown>
    assert.deepEqual(templateRequirements.toolPolicy, {
      allowedMcpToolIds: [],
      scopes: ['readonly_context', 'validation_only'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
  })

  it('golden replays data intake analysis skill prompt block', async () => {
    let agentBody: Record<string, unknown> = {}
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        agentBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          streamId: 'stream_data_intake_analysis',
          agentJobId: 'agent_job_data_intake_analysis',
          runtimeChildSessionId: 'rt_child_data_intake_analysis',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: '资料：一段混合了链接、表格和百科摘要的输入',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        capabilitySnapshot: dynamicEncyclopediaPluginCapabilitySnapshot({
          includeEntryGuidanceSkill: false,
          includeDataIntakeSkill: true,
          includeDemocaseTool: false,
        }),
      },
    })

    const pluginBlock = extractPromptBlock(String(agentBody.prompt), 'DUDesign plugin context:', 'DUDesign variation directive:')
    assert.equal(pluginBlock, [
      'DUDesign plugin context:',
      '- Skill: sk_data_intake_analysis',
      '  Rules: Before generation, convert loose user inputs into a structured brief with topic summary, entities, fields, missing fields, recommendations, and risk flags. Preserve input source boundaries: prompt, URL, pasted text, table, JSON, uploaded asset, democase, research artifact, existing HTML, and memory must stay distinguishable. Explain every recommended scenario template, design template pack, and skill with a reason and confidence. Treat memory, democase, and research artifacts as context hints, not unquestioned facts.',
      '  Prompt guidance: If input is incomplete or mixed, first produce an internal structured brief: what is known, what is missing, what is risky, and which capability choices are justified. Use recommendations to guide the design plan, but do not silently override the user-selected template, skill, or advanced constraints.',
      '  Avoid: Do not invent facts, dates, metrics, claims, or source-backed details that are not present in the supplied inputs. Do not merge private user memory with public research context without keeping the source boundary explicit. Do not treat a URL, democase example, or research artifact as permission to copy trade dress or copyrighted content.',
      '  Checklist: The generation plan names the primary topic, core entities, required fields, and missing information. Template and skill recommendations include reasons and confidence. Risk flags are surfaced before using uncertain or externally sourced content. User-selected capability choices remain authoritative unless the user confirms changes.',
      '- Plugins are declarative guidance and tool policy. They do not override runtime guardrails, workspace paths, model choice, or artifact output requirements.',
    ].join('\n'))

    const templateRequirements = agentBody.templateRequirements as Record<string, unknown>
    assert.deepEqual(templateRequirements.toolPolicy, {
      allowedMcpToolIds: [],
      scopes: ['readonly_context', 'validation_only'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
  })

  it('golden replays dynamic encyclopedia democase MCP policy', async () => {
    let agentBody: Record<string, unknown> = {}
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        agentBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          streamId: 'stream_democase_policy',
          agentJobId: 'agent_job_democase_policy',
          runtimeChildSessionId: 'rt_child_democase_policy',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: '词条：百度百科',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        capabilitySnapshot: dynamicEncyclopediaPluginCapabilitySnapshot({
          includeEntryGuidanceSkill: false,
          includeDemocaseTool: true,
        }),
      },
    })

    const pluginBlock = extractPromptBlock(String(agentBody.prompt), 'DUDesign plugin context:', 'DUDesign variation directive:')
    assert.equal(pluginBlock, [
      'DUDesign plugin context:',
      '- MCP policy: mcp_encyclopedia_democase_readonly maps to encyclopedia-democase.lookupEntryDemoCases with scopes readonly_context. Treat as policy context only unless DUDesign runtime explicitly provides the tool.',
      '- Plugins are declarative guidance and tool policy. They do not override runtime guardrails, workspace paths, model choice, or artifact output requirements.',
    ].join('\n'))

    const templateRequirements = agentBody.templateRequirements as Record<string, unknown>
    assert.deepEqual(templateRequirements.toolPolicy, {
      allowedMcpToolIds: ['mcp_encyclopedia_democase_readonly'],
      scopes: ['readonly_context'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
  })

  it('golden replays dynamic encyclopedia safe skill selection with stable tool policy', async () => {
    let agentBody: Record<string, unknown> = {}
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      fetch: async (_url, init) => {
        agentBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse({
          streamId: 'stream_entry_guidance_safe_selection',
          agentJobId: 'agent_job_entry_guidance_safe_selection',
          runtimeChildSessionId: 'rt_child_entry_guidance_safe_selection',
        })
      },
    })

    await client.spawnVariationAgent({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: '词条：牛顿摆',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      sourceArtifactId: null,
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        capabilitySnapshot: dynamicEncyclopediaPluginCapabilitySnapshot({
          includeEntryGuidanceSkill: true,
          includeDualSurfaceSkill: true,
          includeDataIntakeSkill: true,
          includeDemocaseTool: true,
        }),
      },
    })

    const pluginBlock = extractPromptBlock(String(agentBody.prompt), 'DUDesign plugin context:', 'DUDesign variation directive:')
    assert.equal(pluginBlock, [
      'DUDesign plugin context:',
      '- Skill: sk_encyclopedia_entry_guidance',
      '  Rules: Treat the user input as an encyclopedia entry title, entry content, or both. Classify the entry into the closest encyclopedia category before choosing a card structure. Recommend one to three dynamic card subtemplates only when they are supported by the entry content. Prefer neutral encyclopedia tone, compact facts, clear labels, and inspectable interactions. Use low-confidence classification as a reason to ask for confirmation instead of forcing a template.',
      '  Prompt guidance: For dynamic encyclopedia cards, first summarize the entry type, then generate a compact interactive card that respects the selected child template and interaction paradigm. Preserve factual uncertainty: do not invent dates, relationships, awards, medical claims, financial figures, or official statuses not present in the supplied entry context.',
      '  Avoid: Do not imitate public encyclopedia, search engine, browser, or mobile app trade dress. Do not turn democase examples into facts about the current entry. Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core interactions.',
      '  Checklist: The card fits the required dynamic encyclopedia viewport constraints. The structure matches the selected subtemplate and entry category. Long content is contained in explicit scroll containers. Claims remain neutral and traceable to the provided entry context.',
      '- Skill: sk_dual_surface_strategy',
      '  Rules: Treat PC, WISE, mobile, and embedded iframe targets as separate product surfaces with different density, hierarchy, and interaction needs. For fixed-size business templates, preserve the exact required viewport first, then adapt secondary compatible sizes with graceful degradation. For each variation, state which surface constraints drive layout, information density, and interaction choices. Prefer explicit scroll containers, stable controls, and touch-safe interactions on mobile or iframe surfaces.',
      '  Prompt guidance: Build dual-surface output deliberately: PC can use richer composition and denser context, while WISE/mobile should prioritize compact facts, clear touch targets, explicit scroll containers, and iframe compatibility. When a template provides PC/WISE dimensions, satisfy the standard size exactly before optimizing compatible sizes.',
      '  Avoid: Do not treat mobile as a simple shrunken desktop layout. Do not rely on body default scrolling for embedded mobile cards. Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core mobile interactions.',
      '  Checklist: PC and WISE/mobile have clear hierarchy differences instead of only scaled CSS. Fixed viewport templates fit their required dimensions without clipping primary content. Mobile or iframe surfaces use explicit scroll containers and touch-safe controls. Variation-specific template assignments remain visible in the generation rationale.',
      '- Skill: sk_data_intake_analysis',
      '  Rules: Before generation, convert loose user inputs into a structured brief with topic summary, entities, fields, missing fields, recommendations, and risk flags. Preserve input source boundaries: prompt, URL, pasted text, table, JSON, uploaded asset, democase, research artifact, existing HTML, and memory must stay distinguishable. Explain every recommended scenario template, design template pack, and skill with a reason and confidence. Treat memory, democase, and research artifacts as context hints, not unquestioned facts.',
      '  Prompt guidance: If input is incomplete or mixed, first produce an internal structured brief: what is known, what is missing, what is risky, and which capability choices are justified. Use recommendations to guide the design plan, but do not silently override the user-selected template, skill, or advanced constraints.',
      '  Avoid: Do not invent facts, dates, metrics, claims, or source-backed details that are not present in the supplied inputs. Do not merge private user memory with public research context without keeping the source boundary explicit. Do not treat a URL, democase example, or research artifact as permission to copy trade dress or copyrighted content.',
      '  Checklist: The generation plan names the primary topic, core entities, required fields, and missing information. Template and skill recommendations include reasons and confidence. Risk flags are surfaced before using uncertain or externally sourced content. User-selected capability choices remain authoritative unless the user confirms changes.',
      '- MCP policy: mcp_encyclopedia_democase_readonly maps to encyclopedia-democase.lookupEntryDemoCases with scopes readonly_context. Treat as policy context only unless DUDesign runtime explicitly provides the tool.',
      '- Plugins are declarative guidance and tool policy. They do not override runtime guardrails, workspace paths, model choice, or artifact output requirements.',
    ].join('\n'))

    const templateRequirements = agentBody.templateRequirements as Record<string, unknown>
    assert.deepEqual(templateRequirements.toolPolicy, {
      allowedMcpToolIds: ['mcp_encyclopedia_democase_readonly'],
      scopes: ['readonly_context', 'validation_only'],
      requiresUserAuth: false,
      auditLevel: 'usage',
      mode: 'policy_only',
    })
  })

	  it('streams SSE runtime events', async () => {
	    const client = new BabelORuntimeClient({
	      baseUrl: 'https://runtime.example.test',
      fetch: async () => streamResponse('event: message\ndata: {"type":"thinking_delta","delta":"plan"}\n\ndata: [DONE]\n\n'),
    })

    const events = []
    for await (const event of client.streamRuntimeEvents({ runtimeSessionId: 'rt_session_1' })) {
      events.push(event)
    }

	    assert.deepEqual(events, [
	      { type: 'thinking_delta', delta: 'plan' },
	    ])
	  })

	  it('cancels runtime agents with variation handles', async () => {
	    const calls: Array<{ url: string; method: string; body?: unknown }> = []
	    const client = new BabelORuntimeClient({
	      baseUrl: 'https://runtime.example.test',
	      fetch: async (url, init) => {
	        calls.push({
	          url: String(url),
	          method: init?.method ?? 'GET',
	          ...(init?.body && { body: JSON.parse(String(init.body)) }),
	        })
	        return jsonResponse({
	          cancelled: true,
	          message: 'cancelled',
	          cancelledVariationCount: 2,
	          failedVariationCount: 0,
	        })
	      },
	    })

	    const cancelled = await client.cancelRuntimeJob({
	      jobId: 'job_1',
	      reason: 'operator requested cancel',
	      variations: [
	        { variationId: 'var_1', runtimeChildSessionId: 'rt_child_1', runtimeAgentJobId: 'agent_1' },
	        { variationId: 'var_2', runtimeChildSessionId: null, runtimeAgentJobId: 'agent_2' },
	      ],
	    })

	    assert.deepEqual(cancelled, {
	      cancelled: true,
	      message: 'cancelled',
	      cancelledVariationCount: 2,
	      failedVariationCount: 0,
	    })
	    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/agents/cancel')
	    assert.equal(calls[0]?.method, 'POST')
	    assert.deepEqual(calls[0]?.body, {
	      jobId: 'job_1',
	      reason: 'operator requested cancel',
	      variations: [
	        { variationId: 'var_1', runtimeChildSessionId: 'rt_child_1', runtimeAgentJobId: 'agent_1' },
	        { variationId: 'var_2', runtimeChildSessionId: null, runtimeAgentJobId: 'agent_2' },
	      ],
	    })
	  })

	  it('fails a connected stream after the idle timeout', async () => {
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      streamIdleTimeoutMs: 10,
      fetch: async () => hangingStreamResponse(),
    })

    await assert.rejects(
      async () => {
        for await (const _event of client.streamRuntimeEvents({ streamId: 'stream_idle' })) {
          // no events expected
        }
      },
      error => error instanceof RuntimeGatewayError && error.code === 'RUNTIME_STREAM_IDLE_TIMEOUT',
    )
  })

  it('reconnects a stream if the first attempt fails before emitting events', async () => {
    let attempts = 0
    const client = new BabelORuntimeClient({
      baseUrl: 'https://runtime.example.test',
      streamReconnectAttempts: 1,
      fetch: async () => {
        attempts += 1
        if (attempts === 1) {
          return new Response('temporarily unavailable', { status: 503 })
        }
        return streamResponse('{"type":"assistant_delta","delta":"after reconnect"}\n')
      },
    })

    const events = []
    for await (const event of client.streamRuntimeEvents({ streamId: 'stream_retry' })) {
      events.push(event)
    }

    assert.equal(attempts, 2)
    assert.deepEqual(events, [
      { type: 'assistant_delta', delta: 'after reconnect' },
    ])
  })
})

function jsonResponse(payload: unknown): Response {
  return jsonResponseWithStatus(payload, 200)
}

function jsonResponseWithStatus(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function streamResponse(body: string): Response {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
    },
  })
}

function hangingStreamResponse(): Response {
  return new Response(new ReadableStream({
    start() {
      // Keep the stream open without emitting chunks.
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
    },
  })
}

function extractPromptBlock(prompt: string, startMarker: string, endMarker: string): string {
  const start = prompt.indexOf(startMarker)
  const end = prompt.indexOf(endMarker, start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return prompt.slice(start, end).trim()
}

function dynamicEncyclopediaPluginCapabilitySnapshot(options: {
  includeEntryGuidanceSkill: boolean
  includeDualSurfaceSkill?: boolean
  includeDataIntakeSkill?: boolean
  includeDemocaseTool: boolean
}): CapabilitySnapshot {
  const includesAnySkill = options.includeEntryGuidanceSkill || options.includeDualSurfaceSkill || options.includeDataIntakeSkill
  const toolPolicyScopes: PluginPermissionScope[] = options.includeDemocaseTool || includesAnySkill
    ? ['readonly_context', ...(options.includeDualSurfaceSkill || options.includeDataIntakeSkill ? ['validation_only' as const] : [])]
    : []

  return {
    schemaVersion: '2026-07-01.dudesign-capabilities.v2',
    template: {
      domainTemplate: {
        id: 'tpl_dynamic_encyclopedia_entry',
        name: 'Dynamic Encyclopedia Entry',
        category: 'encyclopedia',
        description: 'Dynamic encyclopedia card generation.',
        contentVersion: '1.0.0',
        structure: {
          sections: ['summary', 'facts', 'interaction'],
          requiredElements: ['entry-title', 'source-aware-facts'],
          optionalElements: ['timeline', 'comparison'],
        },
        constraints: ['Keep claims neutral and traceable to supplied entry context.'],
        variationDirections: ['Timeline card', 'Fact dashboard', 'Comparison card'],
      },
      aestheticProfile: {
        id: 'aes_dynamic_encyclopedia',
        name: 'Dynamic Encyclopedia',
        description: 'Clean factual card style.',
        colorPaletteIds: ['pal_dynamic_encyclopedia'],
        mood: ['clear'],
        occasion: ['knowledge'],
        tone: ['neutral'],
        formality: 'medium',
        density: 'compact',
        bestFor: ['encyclopedia'],
        avoidFor: ['brand-landing'],
        typographyTone: 'clear CJK-friendly sans',
        layoutTone: 'fixed-size factual card',
        motionTone: 'subtle inspectable interactions',
        negativeRules: ['Avoid public encyclopedia or search engine trade dress.'],
      },
      colorPalette: {
        id: 'pal_dynamic_encyclopedia',
        name: 'Dynamic Encyclopedia Blue',
        colors: ['#6487FA', '#FFFFFF', '#F8F8F8', '#1E1F24'],
        usage: {
          primary: '#6487FA',
          surface: '#FFFFFF',
          background: '#F8F8F8',
          text: '#1E1F24',
        },
        accessibilityNotes: ['Use strong contrast for dense fact labels.'],
      },
      brandStyleReference: null,
    },
    plugins: {
      skillIds: [
        ...(options.includeEntryGuidanceSkill ? ['sk_encyclopedia_entry_guidance'] : []),
        ...(options.includeDualSurfaceSkill ? ['sk_dual_surface_strategy'] : []),
        ...(options.includeDataIntakeSkill ? ['sk_data_intake_analysis'] : []),
      ],
      mcpToolIds: options.includeDemocaseTool ? ['mcp_encyclopedia_democase_readonly'] : [],
      pluginSnapshot: {
        plugins: [],
        skills: [
          ...(options.includeEntryGuidanceSkill ? [{
            id: 'sk_encyclopedia_entry_guidance',
            pluginId: 'plug_encyclopedia_entry_guidance',
            schemaVersion: '2026-07-03.dudesign-skill.v1',
            rules: [
              'Treat the user input as an encyclopedia entry title, entry content, or both.',
              'Classify the entry into the closest encyclopedia category before choosing a card structure.',
              'Recommend one to three dynamic card subtemplates only when they are supported by the entry content.',
              'Prefer neutral encyclopedia tone, compact facts, clear labels, and inspectable interactions.',
              'Use low-confidence classification as a reason to ask for confirmation instead of forcing a template.',
            ],
            promptBlocks: [
              'For dynamic encyclopedia cards, first summarize the entry type, then generate a compact interactive card that respects the selected child template and interaction paradigm.',
              'Preserve factual uncertainty: do not invent dates, relationships, awards, medical claims, financial figures, or official statuses not present in the supplied entry context.',
            ],
            negativeRules: [
              'Do not imitate public encyclopedia, search engine, browser, or mobile app trade dress.',
              'Do not turn democase examples into facts about the current entry.',
              'Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core interactions.',
            ],
            qualityChecklist: [
              'The card fits the required dynamic encyclopedia viewport constraints.',
              'The structure matches the selected subtemplate and entry category.',
              'Long content is contained in explicit scroll containers.',
              'Claims remain neutral and traceable to the provided entry context.',
            ],
            allowedTemplateCategories: ['encyclopedia'],
          }] : []),
          ...(options.includeDualSurfaceSkill ? [{
            id: 'sk_dual_surface_strategy',
            pluginId: 'plug_dual_surface_strategy',
            schemaVersion: '2026-07-06.dudesign-skill.v1',
            rules: [
              'Treat PC, WISE, mobile, and embedded iframe targets as separate product surfaces with different density, hierarchy, and interaction needs.',
              'For fixed-size business templates, preserve the exact required viewport first, then adapt secondary compatible sizes with graceful degradation.',
              'For each variation, state which surface constraints drive layout, information density, and interaction choices.',
              'Prefer explicit scroll containers, stable controls, and touch-safe interactions on mobile or iframe surfaces.',
            ],
            promptBlocks: [
              'Build dual-surface output deliberately: PC can use richer composition and denser context, while WISE/mobile should prioritize compact facts, clear touch targets, explicit scroll containers, and iframe compatibility.',
              'When a template provides PC/WISE dimensions, satisfy the standard size exactly before optimizing compatible sizes.',
            ],
            negativeRules: [
              'Do not treat mobile as a simple shrunken desktop layout.',
              'Do not rely on body default scrolling for embedded mobile cards.',
              'Do not use global touchmove prevention, global touch-action:none, videos, downloads, or outbound navigation as core mobile interactions.',
            ],
            qualityChecklist: [
              'PC and WISE/mobile have clear hierarchy differences instead of only scaled CSS.',
              'Fixed viewport templates fit their required dimensions without clipping primary content.',
              'Mobile or iframe surfaces use explicit scroll containers and touch-safe controls.',
              'Variation-specific template assignments remain visible in the generation rationale.',
            ],
            allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai', 'encyclopedia'],
          }] : []),
          ...(options.includeDataIntakeSkill ? [{
            id: 'sk_data_intake_analysis',
            pluginId: 'plug_data_intake_analysis',
            schemaVersion: '2026-07-06.dudesign-skill.v1',
            rules: [
              'Before generation, convert loose user inputs into a structured brief with topic summary, entities, fields, missing fields, recommendations, and risk flags.',
              'Preserve input source boundaries: prompt, URL, pasted text, table, JSON, uploaded asset, democase, research artifact, existing HTML, and memory must stay distinguishable.',
              'Explain every recommended scenario template, design template pack, and skill with a reason and confidence.',
              'Treat memory, democase, and research artifacts as context hints, not unquestioned facts.',
            ],
            promptBlocks: [
              'If input is incomplete or mixed, first produce an internal structured brief: what is known, what is missing, what is risky, and which capability choices are justified.',
              'Use recommendations to guide the design plan, but do not silently override the user-selected template, skill, or advanced constraints.',
            ],
            negativeRules: [
              'Do not invent facts, dates, metrics, claims, or source-backed details that are not present in the supplied inputs.',
              'Do not merge private user memory with public research context without keeping the source boundary explicit.',
              'Do not treat a URL, democase example, or research artifact as permission to copy trade dress or copyrighted content.',
            ],
            qualityChecklist: [
              'The generation plan names the primary topic, core entities, required fields, and missing information.',
              'Template and skill recommendations include reasons and confidence.',
              'Risk flags are surfaced before using uncertain or externally sourced content.',
              'User-selected capability choices remain authoritative unless the user confirms changes.',
            ],
            allowedTemplateCategories: ['finance', 'creative', 'enterprise', 'automotive', 'product', 'ai', 'encyclopedia'],
          }] : []),
        ],
        mcpToolBindings: options.includeDemocaseTool ? [{
          id: 'mcp_encyclopedia_democase_readonly',
          pluginId: 'plug_encyclopedia_entry_guidance',
          serverName: 'encyclopedia-democase',
          toolName: 'lookupEntryDemoCases',
          scopes: ['readonly_context'],
          requiresUserAuth: false,
          allowedTemplateCategories: ['encyclopedia'],
        }] : [],
        toolPolicy: {
          allowedMcpToolIds: options.includeDemocaseTool ? ['mcp_encyclopedia_democase_readonly'] : [],
          scopes: toolPolicyScopes,
          requiresUserAuth: false,
          auditLevel: options.includeDemocaseTool || includesAnySkill ? 'usage' : 'none',
        },
      },
    },
    automation: {
      loopProfile: {
        id: 'loop_encyclopedia_spec_review',
        name: 'Dynamic Encyclopedia Spec Review',
        description: 'Run deterministic encyclopedia spec review and targeted repair.',
        maxRepairAttempts: 2,
        maxCostCents: 300,
        maxDurationMs: 300000,
        qualityGates: ['static', 'spec'],
        repairStrategy: 'spec_review_refine',
      },
      maxRepairAttempts: 2,
      maxCostCents: 300,
      maxDurationMs: 300000,
    },
  }
}

function dynamicEncyclopediaTimelineParadigm(): InteractionParadigm {
  return {
    id: 'ip_timeline_story',
    name: 'Timeline Story',
    category: 'encyclopedia',
    description: 'A chronological interaction for life stages, release history, enterprise development, events, or work evolution.',
    bestFor: ['历史人物', '影视作品', '文学著作', '企业', '文化活动', '游戏'],
    avoidFor: ['entries without event order or milestone data'],
    requiredDataShape: ['dated or ordered events', 'phase labels', 'short event descriptions'],
    compatibleTemplatePackIds: ['dtp_dynamic_encyclopedia_timeline_card'],
  }
}

function dynamicEncyclopediaParentTemplatePack(): DesignTemplatePack {
  return {
    schemaVersion: '2026-07-01.dudesign-template-pack.v1',
    id: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'parent_pack',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['encyclopedia'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Dynamic Encyclopedia Entry Card',
    description: 'Interactive encyclopedia card parent package for compact knowledge entries.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        surface: '#FFFFFF',
        background: '#F8F8F8',
        text: '#1E1F24',
      },
      typography: {
        body: { fontFamily: 'Inter, PingFang SC, system-ui', fontSize: '14px', fontWeight: 400 },
      },
      spacing: {
        frame: 16,
      },
      rounded: {
        card: '16px',
      },
      components: {
        'pc-card-frame': { width: 788, height: 492 },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2' },
      },
    },
    rationale: {
      overview: 'Parent package for all dynamic encyclopedia child templates.',
      colors: 'Use encyclopedia blue and neutral content surfaces.',
      typography: 'Use compact CJK-friendly typography.',
      layout: 'Keep fixed PC and WISE frames stable.',
      elevation: 'Use restrained borders or shadows.',
      shapes: 'Use moderate radii.',
      components: 'Summary, timeline, relation, comparison, and expandable fact child templates.',
      dos: [
        'Use a dedicated scroll container.',
        'Use local interactive UI states instead of external navigation.',
      ],
      donts: [
        'Do not imitate public encyclopedia, search engine, browser, or mobile app trade dress.',
        'Do not attach global touchmove preventDefault handlers.',
      ],
      sections: {
        sizing: 'PC 788x492 exact composition. WISE standard 380x456.',
        iframeTouch: 'Avoid global touch interception and preserve iframe/mobile gesture compatibility.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'passed',
    createdByUserId: null,
  }
}

function dynamicEncyclopediaTemplatePack(): DesignTemplatePack {
  return {
    schemaVersion: '2026-07-01.dudesign-template-pack.v1',
    id: 'dtp_dynamic_encyclopedia_timeline_card',
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    templateRole: 'child_template',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories: ['作品', '游戏'],
    source: 'official',
    format: 'dudesign-template-v1',
    visibility: 'public',
    status: 'published',
    name: 'Dynamic Encyclopedia Timeline Card',
    description: 'Timeline child template with fixed PC and WISE viewport constraints.',
    version: '1.0.0',
    designTokens: {
      colors: {
        primary: '#6487FA',
        surface: '#FFFFFF',
        background: '#F8F8F8',
        text: '#1E1F24',
        muted: '#848691',
        subtle: '#B7B9C1',
      },
      typography: {
        body: { fontFamily: 'Inter, PingFang SC, system-ui', fontSize: '16px', fontWeight: 400 },
      },
      spacing: {
        frame: 16,
      },
      rounded: {
        card: '16px',
      },
      components: {
        'pc-card-frame': { width: 788, height: 492, unit: 'px', strict: true },
        'wise-standard-frame': { width: 380, height: 456, ratio: '1:1.2' },
        'timeline-track': { accentColor: '#6487FA', markerSize: 8 },
        'scroll-container': { overflowY: 'auto', webkitOverflowScrolling: 'touch', bodyScroll: false },
      },
    },
    rationale: {
      overview: 'A child template for biographies, release histories, and staged entity development.',
      colors: 'Use #6487FA as the encyclopedia primary color with white and light gray content surfaces.',
      typography: 'Use clear CJK-friendly sans typography for dense facts and short labels.',
      layout: 'Lead with entry summary, then a vertical or segmented timeline inside a scroll container. PC must render perfectly at 788x492. WISE standard must render perfectly at 380x456.',
      elevation: 'Use restrained elevation only when it clarifies interactive layers.',
      shapes: 'Rounded content cards, stable fixed frame dimensions.',
      components: 'Timeline track, milestone cards, period filters, summary chips, and explicit overflow container.',
      dos: [
        'Use a dedicated overflow container instead of body scrolling.',
        'Keep iframe and mobile gesture compatibility explicit.',
        'Group sparse dates into phases when exact dates are unavailable.',
      ],
      donts: [
        'Do not bind global touchmove preventDefault.',
        'Do not set global touch-action: none.',
        'Do not fabricate dates or milestones.',
        'Do not use video, download, or outbound navigation as core interactions.',
      ],
      sections: {
        sizing: 'PC 788x492. WISE standard 380x456. WISE compatibility sizes 396x475 and 300x360.',
        iframeTouch: 'Avoid iframe pinch zoom conflicts. Do not globally intercept touchmove. Allow scroll-container and iframe targets.',
        scrolling: 'Set html/body to height 100% and overflow hidden; put all long content inside .scroll-container with overflow-y auto.',
        timeline: 'Add dated or phased milestones without inventing exact dates.',
      },
    },
    previewArtifactId: null,
    lintStatus: 'passed',
    createdByUserId: null,
  }
}
