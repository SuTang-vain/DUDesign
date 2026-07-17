import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import { createRuntimeAdapterServer, resolveRuntimeWorkspaceRoot } from './app.js'
import { NexusClient } from './nexusClient.js'
import { createRuntimeLaneFromConfig, RuntimeLaneRegistry } from './runtimeLane.js'
import { FileRuntimeAdapterStateStore } from './stateStore.js'

describe('DUDesign BabeL-O runtime adapter', () => {
  let harness: Awaited<ReturnType<typeof startHarness>>
  const nexusCalls: Array<{ url: string; method: string; body?: unknown }> = []
  let workspaceRoot = ''

  before(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-'))
    await writeFile(join(workspaceRoot, 'index.html'), '<!doctype html><h1>Adapter workspace artifact</h1>', 'utf8')
    let sessionSequence = 0
    const nexus = new NexusClient({
      baseUrl: 'https://nexus.example.test',
      fetch: async (url, init) => {
        const href = String(url)
        nexusCalls.push({
          url: href,
          method: init?.method ?? 'GET',
          ...(init?.body && { body: JSON.parse(String(init.body)) }),
        })
        if (href.endsWith('/health')) {
          return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
        }
        if (href.endsWith('/v1/runtime/version')) {
          return jsonResponse({ type: 'runtime_version', serverVersion: '0.3.9' })
        }
        if (href.endsWith('/v1/runtime/config')) {
          return jsonResponse({
            type: 'runtime_config',
            version: 4,
            modelId: 'openai/gpt-5',
            modelName: 'GPT-5',
            providerId: 'openai',
            providerName: 'OpenAI-compatible',
            authMode: 'bearer',
            modelSource: 'profile',
            hasApiKey: true,
            apiKeySource: 'env',
            activeProfile: 'prod',
            contextWindow: 400000,
            defaultMaxTokens: 8192,
            capabilities: {
              toolCalling: true,
              jsonOutput: true,
              structuredOutput: true,
              streaming: true,
            },
          })
        }
        if (href.endsWith('/v1/runtime/config/profiles')) {
          return jsonResponse({
            type: 'runtime_config_profiles',
            version: 4,
            activeProfile: 'prod',
            profiles: [
              {
                name: 'prod',
                active: true,
                model: 'openai/gpt-5',
                provider: 'openai',
                modelName: 'GPT-5',
                providerName: 'OpenAI-compatible',
                contextWindow: 400000,
                defaultMaxTokens: 8192,
                capabilities: {
                  toolCalling: true,
                  jsonOutput: true,
                  structuredOutput: true,
                  streaming: true,
                },
              },
            ],
          })
        }
        if (href.endsWith('/v1/sessions')) {
          sessionSequence += 1
          return jsonResponse({
            type: 'session_created',
            sessionId: `nexus_session_${sessionSequence}`,
          }, 201)
        }
        if (href.endsWith('/v1/sessions/nexus_session_1/resume')) {
          return jsonResponse({
            type: 'session_resume_snapshot',
            sessionId: 'nexus_session_1',
          })
        }
        if (href.endsWith('/v1/execute')) {
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'nexus_session_1',
            success: true,
            events: [
              { type: 'thinking_delta', delta: 'Plan' },
              { type: 'assistant_delta', delta: 'Done' },
            ],
          })
        }
        if (href.endsWith('/v1/agents/agent_job_1/cancel')) {
          return jsonResponse({
            type: 'agent_job_cancelled',
            job: {
              jobId: 'agent_job_1',
              parentSessionId: 'nexus_session_1',
              childSessionId: 'nexus_child_1',
              status: 'cancelled',
              prompt: 'Build',
            },
          })
        }
        return new Response(JSON.stringify({ type: 'error' }), { status: 404 })
      },
    })
    harness = await startHarness(createRuntimeAdapterServer({ nexus }))
  })

  after(async () => {
    await harness.close()
  })

  it('serves DUDesign runtime health and contract over raw Nexus', async () => {
    const health = await getJson<{
      runtimeVersion: string
      contractVersion: string
      status: string
      lanes: Array<{ id: string; provider: string; status: string; inflight: number; maxConcurrent: number }>
    }>('/v1/health')
    const contract = await getJson<{
      contractVersion: string
      status: string
      requiredEndpoints: string[]
      requiredEvents: string[]
      eventMappings: Record<string, string>
    }>('/v1/contract')

    assert.equal(health.runtimeVersion, '0.3.9')
    assert.equal(health.contractVersion, DUDESIGN_RUNTIME_CONTRACT_VERSION)
    assert.equal(health.status, 'compatible')
    assert.equal(health.lanes[0]?.id, 'default')
    assert.equal(health.lanes[0]?.provider, 'babel-o')
    assert.equal(health.lanes[0]?.status, 'healthy')
    assert.equal(health.lanes[0]?.inflight, 0)
    assert.equal(contract.contractVersion, DUDESIGN_RUNTIME_CONTRACT_VERSION)
    assert.equal(contract.status, 'compatible')
    assert.ok(contract.requiredEndpoints.includes('POST /v1/agents/refine'))
    assert.ok((contract as { optionalEndpoints?: string[] }).optionalEndpoints?.includes('GET /v1/models'))
    assert.ok(contract.requiredEvents.includes('file_delta'))
    assert.ok(contract.requiredEvents.includes('runtime_lane_assigned'))
    assert.ok(contract.requiredEvents.includes('runtime_lane_retry_started'))
    assert.ok(contract.requiredEvents.includes('runtime_lane_retry_exhausted'))
    assert.equal(contract.eventMappings.file_delta, 'design.variation_code_delta')
    assert.equal(contract.eventMappings.runtime_lane_assigned, 'design.runtime_lane_assigned')
    assert.equal(contract.eventMappings.runtime_lane_retry_started, 'design.runtime_lane_retry_started')
    assert.equal(contract.eventMappings.runtime_lane_retry_exhausted, 'design.runtime_lane_retry_exhausted')
  })

  it('serves normalized DUDesign runtime models from raw Nexus runtime config', async () => {
    const models = await getJson<{
      type: string
      discoveryStatus: string
      version: number
      defaultModel: string
      activeProfile: string
      providers: Array<{
        id: string
        displayName: string
        authSource: string
        authConfigured: boolean
        active: boolean
        models: Array<{ id: string; contextWindow: number; capabilities: { toolCalling: boolean; jsonOutput: boolean; streaming: boolean } }>
      }>
    }>('/v1/models')

    assert.equal(models.type, 'runtime_models')
    assert.equal(models.discoveryStatus, 'supported')
    assert.equal(models.version, 4)
    assert.equal(models.defaultModel, 'openai/gpt-5')
    assert.equal(models.activeProfile, 'prod')
    assert.equal(models.providers[0]?.id, 'openai')
    assert.equal(models.providers[0]?.authSource, 'env')
    assert.equal(models.providers[0]?.authConfigured, true)
    assert.equal(models.providers[0]?.active, true)
    assert.equal(models.providers[0]?.models[0]?.id, 'openai/gpt-5')
    assert.equal(models.providers[0]?.models[0]?.contextWindow, 400000)
    assert.equal(models.providers[0]?.models[0]?.capabilities.toolCalling, true)
  })

  it('returns explicit unsupported model discovery when raw Nexus lacks config endpoints', async () => {
    const unsupportedHarness = await startHarness(createRuntimeAdapterServer({
      nexus: new NexusClient({
        baseUrl: 'https://nexus.example.test',
        fetch: async url => {
          const href = String(url)
          if (href.endsWith('/v1/runtime/version')) return jsonResponse({ type: 'runtime_version', serverVersion: '0.3.9' })
          return jsonResponse({ type: 'error', code: 'NOT_FOUND' }, 404)
        },
      }),
    }))
    try {
      const models = await getJsonWithBase<{
        type: string
        discoveryStatus: string
        providers?: unknown[]
        message: string
      }>(unsupportedHarness.baseUrl, '/v1/models')

      assert.equal(models.type, 'runtime_models_unsupported')
      assert.equal(models.discoveryStatus, 'unsupported')
      assert.match(models.message, /does not expose runtime model discovery/i)
    } finally {
      await unsupportedHarness.close()
    }
  })

  it('falls back to bearer authorization when Nexus auth header name is blank', async () => {
    const calls: Array<{ headers: Headers }> = []
    const nexus = new NexusClient({
      baseUrl: 'https://nexus.example.test',
      apiKey: 'nexus-key',
      authHeaderName: ' ',
      fetch: async (_url, init) => {
        calls.push({ headers: new Headers(init?.headers) })
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })

    await nexus.health()

    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer nexus-key')
  })

  it('resolves relative DUDesign workspace roots under the runtime workspace base', () => {
    assert.equal(resolveRuntimeWorkspaceRoot('workspaces/ws_dev', '/workspace'), '/workspace/workspaces/ws_dev')
    assert.equal(resolveRuntimeWorkspaceRoot('/already/absolute', '/workspace'), '/already/absolute')
  })

  it('creates and resumes Nexus sessions with DUDesign-compatible payloads', async () => {
    const created = await postJson<{ runtimeSessionId: string }>('/v1/sessions', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot,
      memoryNamespace: 'memory:user_1',
    })
    const resumed = await postJson<{ status: string; runtimeSessionId: string }>('/v1/sessions/nexus_session_1/resume', {})

    assert.equal(created.runtimeSessionId, 'nexus_session_1')
    assert.equal(resumed.status, 'resumed')
    assert.equal(resumed.runtimeSessionId, 'nexus_session_1')
    assert.equal(nexusCalls.some(call => call.url.endsWith('/v1/sessions') && call.method === 'POST'), true)
  })

  it('spawns a Nexus agent and streams DUDesign-compatible runtime events', async () => {
    const variationWorkspaceRoot = join(workspaceRoot, 'runtime-jobs', 'job_1', 'variation_01')
    await mkdir(variationWorkspaceRoot, { recursive: true })
    await writeFile(join(variationWorkspaceRoot, 'index.html'), '<!doctype html><h1>Adapter variation artifact</h1>', 'utf8')
    await writeFile(join(variationWorkspaceRoot, 'styles.css'), 'body { color: rebeccapurple; }', 'utf8')
    await writeFile(join(variationWorkspaceRoot, 'script.js'), 'document.body.dataset.ready = "true";', 'utf8')
    await writeFile(join(variationWorkspaceRoot, 'assets.json'), '{"entry":"index.html"}', 'utf8')
    const spawned = await postJson<{ streamId: string; agentJobId: string; runtimeChildSessionId: string }>('/v1/agents', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'nexus_session_1',
      jobId: 'job_1',
      prompt: 'Build a page',
      sourceMode: 'new_html',
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot: variationWorkspaceRoot,
      memoryNamespace: 'memory:user_1',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
      templateRequirements: {},
    })
    const stream = await getText(`/v1/stream?streamId=${spawned.streamId}`)

    assert.match(spawned.agentJobId, /^execute_/)
    assert.equal(spawned.runtimeChildSessionId, 'nexus_session_2')
    assert.match(stream, /"type":"thinking_delta"/)
    assert.match(stream, /"type":"runtime_lane_assigned"/)
    assert.match(stream, /"runtimeLaneId":"default"/)
    assert.match(stream, /"delta":"Planning the page structure\."/)
    assert.match(stream, /"type":"assistant_delta"/)
    assert.match(stream, /"delta":"Finishing the generated page\."/)
    assert.match(stream, /"type":"file_delta"/)
    assert.match(stream, /"path":"index.html"/)
    assert.match(stream, /"path":"styles.css"/)
    assert.match(stream, /"path":"script.js"/)
    assert.match(stream, /"path":"assets.json"/)
    assert.match(stream, /"type":"result"/)
    assert.match(stream, /Adapter variation artifact/)
    const executeCall = nexusCalls.find(call => call.url.endsWith('/v1/execute') && call.method === 'POST')
    assert.ok(executeCall)
    const body = executeCall.body as {
      model?: string
      cwd?: string
      prompt?: string
    }
    assert.equal(body.model, 'anthropic/claude-3-5-sonnet')
    assert.equal(body.cwd, variationWorkspaceRoot)
    assert.match(body.prompt ?? '', /Model selection: service=mdl_babelo_default, provider=babel-o, model=anthropic\/claude-3-5-sonnet/)
  })

  it('preserves the fixed exploration context in the final Nexus execution prompt', async () => {
    const executeBodies: Array<Record<string, unknown>> = []
    const explorationWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-exploration-'))
    await writeFile(join(explorationWorkspaceRoot, 'index.html'), '<!doctype html><h1>Exploration context</h1>', 'utf8')
    const explorationHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({ onExecuteBody: body => executeBodies.push(body) }),
    }))
    try {
      const explorationContext = {
        schemaVersion: '2026-07-13.dudesign-runtime-exploration-context.v1',
        source: {
          plannerVersion: 'planner.v1',
          capabilitySnapshotId: 'capability_snapshot_1',
          moduleGraphId: 'graph_1',
          moduleGraphVersion: 'graph.v1',
          variationIndex: 1,
        },
        focus: {
          id: 'timeline',
          title: 'Member timeline',
          description: 'Explain verified member changes.',
          requiredDataFields: ['membershipEvents'],
          interactionCandidates: ['vertical-timeline'],
        },
        requiredModules: [],
        sampledModules: [],
        excludedModuleIds: [],
        interactionDirectionIds: ['vertical-timeline'],
        designDivergence: {
          moduleBreadth: 0.6,
          moduleNovelty: 0.5,
          layout: 0.6,
          visual: 0.65,
          interaction: 0.5,
          copyTone: 0.25,
        },
        invariants: [{ id: 'no_fabrication', category: 'fact', description: 'Do not invent facts.' }],
        globalRules: [],
        safety: { factCreativity: 0, mayExpandToolPolicy: false, mayReassignModules: false },
      }
      const spawned = await postJsonWithBase<{ streamId: string }>(explorationHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_exploration',
        jobId: 'job_exploration',
        prompt: 'Build a timeline-led page.',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: explorationWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        explorationContext,
        templateRequirements: {},
      })
      await getTextWithBase(explorationHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      const prompt = String(executeBodies[0]?.prompt ?? '')
      assert.match(prompt, /Controlled exploration context \(fixed by DUDesign; do not reassign modules\)/)
      assert.match(prompt, /"id": "timeline"/)
      assert.match(prompt, /"factCreativity": 0/)
      assert.match(prompt, /"mayExpandToolPolicy": false/)
      assert.match(prompt, /"mayReassignModules": false/)
    } finally {
      await explorationHarness.close()
      await rm(explorationWorkspaceRoot, { recursive: true, force: true })
    }
  })

  it('streams workspace file changes as near-real-time code_delta before final artifact result', async () => {
    const liveWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-live-code-'))
    let executeStarted = false
    const liveHarness = await startHarness(createRuntimeAdapterServer({
      workspacePollIntervalMs: 5,
      nexus: createMockNexus({
        executeEvents: [
          { type: 'thinking_delta', delta: 'private raw delta marker about layout constraints' },
          { type: 'assistant_delta', delta: 'private raw delta marker writing index.html' },
        ],
        beforeExecuteReturn: async () => {
          executeStarted = true
          await writeFile(join(liveWorkspaceRoot, 'index.html'), '<!doctype html><h1>Live draft</h1>', 'utf8')
          await delay(20)
          await writeFile(join(liveWorkspaceRoot, 'index.html'), '<!doctype html><h1>Live final</h1>', 'utf8')
          await writeFile(join(liveWorkspaceRoot, 'styles.css'), 'body { color: teal; }', 'utf8')
        },
      }),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(liveHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_live',
        jobId: 'job_live_code',
        prompt: 'Build a live streamed page',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: liveWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(liveHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)
      const firstCodeDelta = stream.indexOf('"type":"code_delta"')
      const finalResult = stream.indexOf('"type":"result"')

      assert.equal(executeStarted, true)
      assert.ok(firstCodeDelta >= 0, stream)
      assert.ok(finalResult > firstCodeDelta, stream)
      assert.match(stream, /"type":"code_delta"/)
      assert.match(stream, /Live draft|Live final/)
      assert.match(stream, /"path":"styles.css"/)
      assert.match(stream, /"type":"file_delta"/)
      assert.match(stream, /"isFinal":true/)
      assert.match(stream, /"delta":"Checking the brief and design constraints\."/)
      assert.match(stream, /"delta":"Writing index.html\."/)
      assert.doesNotMatch(stream, /private raw delta marker/)
    } finally {
      await liveHarness.close()
    }
  })

  it('refines and reads artifacts from the supplied variation workspace root', async () => {
    const parentWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-refine-parent-'))
    const variationWorkspaceRoot = join(parentWorkspaceRoot, 'runtime-jobs', 'job_refine', 'variation_02')
    await mkdir(variationWorkspaceRoot, { recursive: true })
    await writeFile(join(parentWorkspaceRoot, 'index.html'), '<!doctype html><h1>Wrong parent artifact</h1>', 'utf8')
    await writeFile(join(variationWorkspaceRoot, 'index.html'), '<!doctype html><h1>Correct refined variation artifact</h1>', 'utf8')
    const refineHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeChildSessionId: string }>(refineHarness.baseUrl, '/v1/agents/refine', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'session_1',
        jobId: 'job_refine',
        variationId: 'variation_2',
        runtimeChildSessionId: 'rt_child_refine',
        baseArtifactId: 'artifact_1',
        baseArtifactHtml: '<!doctype html><h1>Base artifact</h1>',
        baseArtifactEntryPath: 'index.html',
        baseArtifactVersion: 1,
        prompt: 'Make it better',
        workspaceRoot: variationWorkspaceRoot,
        parentWorkspaceRoot,
        variationIndex: 2,
        templateRequirements: {},
      })
      const stream = await getTextWithBase(refineHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(spawned.runtimeChildSessionId, 'rt_child_refine')
      assert.match(stream, /Correct refined variation artifact/)
      assert.doesNotMatch(stream, /Wrong parent artifact/)
    } finally {
      await refineHarness.close()
    }
  })

  it('persists adapter stream state and restores it after restart', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-state-'))
    const stateFile = join(stateRoot, 'state.json')
    const firstHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    const spawned = await postJsonWithBase<{ streamId: string; agentJobId: string; runtimeChildSessionId: string }>(firstHarness.baseUrl, '/v1/agents', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'nexus_session_1',
      jobId: 'job_persisted',
      prompt: 'Build a persisted page',
      sourceMode: 'new_html',
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot,
      memoryNamespace: 'memory:user_1',
      templateRequirements: {},
    })
    await firstHarness.close()

    const snapshot = JSON.parse(await readFile(stateFile, 'utf8')) as { streams?: Record<string, unknown> }
    assert.ok(snapshot.streams?.[spawned.streamId])

    const secondHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    try {
      const stream = await getTextWithBase(secondHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)
      assert.match(spawned.agentJobId, /^execute_/)
      assert.equal(spawned.runtimeChildSessionId, 'nexus_session_1')
      assert.match(stream, /"type":"result"/)
      assert.match(stream, /Adapter workspace artifact/)
      const consumedSnapshot = JSON.parse(await readFile(stateFile, 'utf8')) as { streams?: Record<string, unknown> }
      assert.equal(consumedSnapshot.streams?.[spawned.streamId], undefined)
    } finally {
      await secondHarness.close()
    }
  })

  it('restores refine request ids and cancels the matching agent after restart', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-cancel-state-'))
    const stateFile = join(stateRoot, 'state.json')
    const firstHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    const spawned = await postJsonWithBase<{ streamId: string; agentJobId: string }>(firstHarness.baseUrl, '/v1/agents/refine', {
      requestId: 'rfn_persisted_cancel',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'nexus_session_1',
      jobId: 'job_persisted_cancel',
      variationId: 'variation_persisted_cancel',
      runtimeChildSessionId: 'nexus_session_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<main>Base</main>',
      prompt: 'Refine then cancel after restart',
      workspaceRoot,
      variationIndex: 1,
    })
    await firstHarness.close()

    const cancelledAgentIds: string[] = []
    const secondHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({ onCancelAgent: agentJobId => cancelledAgentIds.push(agentJobId) }),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    try {
      const cancelled = await postJsonWithBase<{ cancelled: boolean; requestId: string; cancelledVariationCount: number }>(
        secondHarness.baseUrl,
        '/v1/agents/cancel',
        { jobId: 'job_persisted_cancel', requestId: 'rfn_persisted_cancel', reason: 'restart recovery test', variations: [] },
      )
      assert.equal(cancelled.cancelled, true)
      assert.equal(cancelled.requestId, 'rfn_persisted_cancel')
      assert.equal(cancelled.cancelledVariationCount, 1)
      assert.deepEqual(cancelledAgentIds, [spawned.agentJobId])
    } finally {
      await secondHarness.close()
    }
  })

  it('recovers a persisted refine stream by request id and exposes its terminal operation', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-recover-state-'))
    const stateFile = join(stateRoot, 'state.json')
    const firstHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    await postJsonWithBase<{ streamId: string }>(firstHarness.baseUrl, '/v1/agents/refine', {
      requestId: 'rfn_persisted_recover',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'nexus_session_1',
      jobId: 'job_persisted_recover',
      variationId: 'variation_persisted_recover',
      runtimeChildSessionId: 'nexus_session_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<main>Base</main>',
      prompt: 'Recover this refine after restart',
      workspaceRoot,
      variationIndex: 1,
    })
    await firstHarness.close()

    const secondHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    try {
      const queued = await getJsonWithBase<{ status: string }>(secondHarness.baseUrl, '/v1/refine-operations/rfn_persisted_recover')
      assert.equal(queued.status, 'queued')
      const recovered = await getTextWithBase(secondHarness.baseUrl, '/v1/stream?requestId=rfn_persisted_recover')
      assert.match(recovered, /"type":"result"/)
      const completed = await getJsonWithBase<{ status: string; terminalEvent?: { type?: string } }>(
        secondHarness.baseUrl,
        '/v1/refine-operations/rfn_persisted_recover',
      )
      assert.equal(completed.status, 'completed')
      assert.equal(completed.terminalEvent?.type, 'result')
    } finally {
      await secondHarness.close()
    }
  })

  it('persists concurrently spawned streams without losing state', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-concurrent-'))
    const stateFile = join(stateRoot, 'state.json')
    const concurrentHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      stateStore: new FileRuntimeAdapterStateStore(stateFile),
    }))
    try {
      const bodies = [1, 2, 3].map(index => ({
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_1',
        jobId: 'job_concurrent',
        prompt: `Build concurrent page ${index}`,
        sourceMode: 'new_html',
        variationCount: 3,
        variationIndex: index,
        workspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      }))
      const spawned = await Promise.all(
        bodies.map(body => postJsonWithBase<{ streamId: string }>(concurrentHarness.baseUrl, '/v1/agents', body)),
      )
      const snapshot = JSON.parse(await readFile(stateFile, 'utf8')) as { streams?: Record<string, unknown> }

      assert.equal(Object.keys(snapshot.streams ?? {}).length, 3)
      for (const spawn of spawned) {
        assert.ok(snapshot.streams?.[spawn.streamId])
      }
    } finally {
      await concurrentHarness.close()
    }
  })

  it('assigns streams to runtime lanes and releases leases after consumption', async () => {
    const laneAWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-a-'))
    const laneBWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-b-'))
    await writeFile(join(laneAWorkspaceRoot, 'index.html'), '<!doctype html><h1>Lane A artifact</h1>', 'utf8')
    await writeFile(join(laneBWorkspaceRoot, 'index.html'), '<!doctype html><h1>Lane B artifact</h1>', 'utf8')
    const laneANexus = createMockNexus()
    const laneBNexus = createMockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test' }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test' }, laneBNexus),
    ])
    const laneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
    }))
    try {
      const spawnedA = await postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeBackendId: string; runtimeLeaseId?: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lanes',
        jobId: 'job_lanes',
        prompt: 'Build lane A page',
        sourceMode: 'new_html',
        variationCount: 2,
        variationIndex: 1,
        workspaceRoot: laneAWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const spawnedB = await postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeBackendId: string; runtimeLeaseId?: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lanes',
        jobId: 'job_lanes',
        prompt: 'Build lane B page',
        sourceMode: 'new_html',
        variationCount: 2,
        variationIndex: 2,
        workspaceRoot: laneBWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })

      assert.equal(spawnedA.runtimeLaneId, 'lane-a')
      assert.equal(spawnedA.runtimeBackendId, 'backend-a')
      assert.equal(spawnedB.runtimeLaneId, 'lane-b')
      assert.equal(spawnedB.runtimeBackendId, 'backend-b')
      assert.equal(spawnedA.runtimeLeaseId, undefined)
      assert.equal(spawnedB.runtimeLeaseId, undefined)
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)

      const streamA = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${spawnedA.streamId}`)
      const streamB = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${spawnedB.streamId}`)

      assert.match(streamA, /"runtimeBackendId":"backend-a"/)
      assert.match(streamB, /"runtimeBackendId":"backend-b"/)
      assert.match(streamA, /Lane A artifact/)
      assert.match(streamB, /Lane B artifact/)
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)
    } finally {
      await laneHarness.close()
    }
  })

  it('does not reserve runtime lane capacity before a stream is consumed', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-deferred-lease-'))
    await writeFile(join(workspaceRoot, 'index.html'), '<!doctype html><h1>Deferred lease artifact</h1>', 'utf8')
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, createMockNexus()),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 1 }, createMockNexus()),
    ])
    const deferredHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
      runtimeLaneRegistry: registry,
    }))
    try {
      const spawned = await Promise.all([1, 2, 3].map(index => postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeLeaseId?: string }>(deferredHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_deferred_lease',
        jobId: 'job_deferred_lease',
        prompt: `Build deferred lease page ${index}`,
        sourceMode: 'new_html',
        variationCount: 3,
        variationIndex: index,
        workspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })))

      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)
      assert.equal(spawned.every(item => item.runtimeLeaseId === undefined), true)

      const stream = await getTextWithBase(deferredHarness.baseUrl, `/v1/stream?streamId=${spawned[0]?.streamId}`)
      assert.match(stream, /"type":"runtime_lane_assigned"/)
      assert.match(stream, /"runtimeLeaseId":"lease_/)
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)
    } finally {
      await deferredHarness.close()
    }
  })

  it('resolves relative workspaces under each assigned runtime lane root', async () => {
    const laneARoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-root-a-'))
    const laneBRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-root-b-'))
    await mkdir(join(laneARoot, 'runtime-jobs', 'job_lane_root', 'variation_01'), { recursive: true })
    await mkdir(join(laneBRoot, 'runtime-jobs', 'job_lane_root', 'variation_02'), { recursive: true })
    await writeFile(
      join(laneARoot, 'runtime-jobs', 'job_lane_root', 'variation_01', 'index.html'),
      '<!doctype html><h1>Lane root A artifact</h1>',
      'utf8',
    )
    await writeFile(
      join(laneBRoot, 'runtime-jobs', 'job_lane_root', 'variation_02', 'index.html'),
      '<!doctype html><h1>Lane root B artifact</h1>',
      'utf8',
    )
    const sessionWorkspaces: string[] = []
    const executeCwds: string[] = []
    const laneANexus = createMockNexus({
      onSessionBody: body => sessionWorkspaces.push(String(body.cwd)),
      onExecuteBody: body => executeCwds.push(String(body.cwd)),
    })
    const laneBNexus = createMockNexus({
      onSessionBody: body => sessionWorkspaces.push(String(body.cwd)),
      onExecuteBody: body => executeCwds.push(String(body.cwd)),
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', workspaceRoot: laneARoot }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', workspaceRoot: laneBRoot }, laneBNexus),
    ])
    const laneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
    }))
    try {
      const spawnedA = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_roots',
        jobId: 'job_lane_root',
        prompt: 'Build lane root A page',
        sourceMode: 'new_html',
        variationCount: 2,
        variationIndex: 1,
        workspaceRoot: 'runtime-jobs/job_lane_root/variation_01',
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const spawnedB = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_roots',
        jobId: 'job_lane_root',
        prompt: 'Build lane root B page',
        sourceMode: 'new_html',
        variationCount: 2,
        variationIndex: 2,
        workspaceRoot: 'runtime-jobs/job_lane_root/variation_02',
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })

      assert.equal(spawnedA.runtimeLaneId, 'lane-a')
      assert.equal(spawnedB.runtimeLaneId, 'lane-b')
      assert.deepEqual(sessionWorkspaces, [
        join(laneARoot, 'runtime-jobs', 'job_lane_root', 'variation_01'),
        join(laneBRoot, 'runtime-jobs', 'job_lane_root', 'variation_02'),
      ])

      const streamA = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${spawnedA.streamId}`)
      const streamB = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${spawnedB.streamId}`)

      assert.deepEqual(executeCwds, [
        join(laneARoot, 'runtime-jobs', 'job_lane_root', 'variation_01'),
        join(laneBRoot, 'runtime-jobs', 'job_lane_root', 'variation_02'),
      ])
      assert.match(streamA, /Lane root A artifact/)
      assert.match(streamB, /Lane root B artifact/)
    } finally {
      await laneHarness.close()
    }
  })

  it('keeps refine work on the variation assigned runtime lane root', async () => {
    const laneARoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-refine-lane-a-'))
    const laneBRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-refine-lane-b-'))
    await mkdir(join(laneBRoot, 'runtime-jobs', 'job_refine_lane', 'variation_02'), { recursive: true })
    await writeFile(
      join(laneBRoot, 'runtime-jobs', 'job_refine_lane', 'variation_02', 'index.html'),
      '<!doctype html><h1>Refined on lane B</h1>',
      'utf8',
    )
    const executeCwds: string[] = []
    const laneANexus = createMockNexus({
      onExecuteBody: body => executeCwds.push(`lane-a:${String(body.cwd)}`),
    })
    const laneBNexus = createMockNexus({
      onExecuteBody: body => executeCwds.push(`lane-b:${String(body.cwd)}`),
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', workspaceRoot: laneARoot }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', workspaceRoot: laneBRoot }, laneBNexus),
    ])
    const laneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeBackendId: string }>(laneHarness.baseUrl, '/v1/agents/refine', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_refine_lane',
        jobId: 'job_refine_lane',
        variationId: 'variation_refine_lane',
        variationIndex: 2,
        runtimeChildSessionId: 'lane_b_existing_session',
        runtimeLaneId: 'lane-b',
        baseArtifactId: 'artifact_1',
        baseArtifactHtml: '<!doctype html><h1>Base</h1>',
        prompt: 'Refine on the existing lane',
        workspaceRoot: 'runtime-jobs/job_refine_lane/variation_02',
      })

      assert.equal(spawned.runtimeLaneId, 'lane-b')
      assert.equal(spawned.runtimeBackendId, 'backend-b')

      const stream = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.deepEqual(executeCwds, [
        `lane-b:${join(laneBRoot, 'runtime-jobs', 'job_refine_lane', 'variation_02')}`,
      ])
      assert.match(stream, /Refined on lane B/)
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)
    } finally {
      await laneHarness.close()
    }
  })

  it('drains runtime lanes without interrupting active streams', async () => {
    const laneAWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-drain-a-'))
    const laneBWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-drain-b-'))
    const laneAAfterUndrainRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-undrain-a-'))
    await writeFile(join(laneAWorkspaceRoot, 'index.html'), '<!doctype html><h1>Draining lane A artifact</h1>', 'utf8')
    await writeFile(join(laneBWorkspaceRoot, 'index.html'), '<!doctype html><h1>Lane B receives new work</h1>', 'utf8')
    await writeFile(join(laneAAfterUndrainRoot, 'index.html'), '<!doctype html><h1>Lane A accepts work again</h1>', 'utf8')
    const laneANexus = createMockNexus()
    const laneBNexus = createMockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 2 }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 2 }, laneBNexus),
    ])
    const laneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
    }))
    try {
      const activeA = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_drain',
        jobId: 'job_lane_drain',
        prompt: 'Build lane A page before drain',
        sourceMode: 'new_html',
        variationCount: 3,
        variationIndex: 1,
        workspaceRoot: laneAWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const drained = await postJsonWithBase<{ action: string; lane: { id: string; status: string; inflight: number } }>(laneHarness.baseUrl, '/v1/lanes/lane-a/drain', {})
      const afterDrainHealth = await getJsonWithBase<{ lanes: Array<{ id: string; status: string; inflight: number }> }>(laneHarness.baseUrl, '/v1/health')
      const newWork = await postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeBackendId: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_drain',
        jobId: 'job_lane_drain',
        prompt: 'Build lane B page while lane A drains',
        sourceMode: 'new_html',
        variationCount: 3,
        variationIndex: 2,
        workspaceRoot: laneBWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })

      assert.equal(activeA.runtimeLaneId, 'lane-a')
      assert.equal(drained.action, 'drain_started')
      assert.equal(drained.lane.status, 'draining')
      assert.equal(drained.lane.inflight, 0)
      assert.equal(afterDrainHealth.lanes.find(lane => lane.id === 'lane-a')?.status, 'draining')
      assert.equal(afterDrainHealth.lanes.find(lane => lane.id === 'lane-a')?.inflight, 0)
      assert.equal(newWork.runtimeLaneId, 'lane-b')
      assert.equal(newWork.runtimeBackendId, 'backend-b')

      const streamA = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${activeA.streamId}`)
      const streamB = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${newWork.streamId}`)
      assert.match(streamA, /Draining lane A artifact/)
      assert.match(streamB, /Lane B receives new work/)
      assert.equal(registry.get('lane-a')?.status, 'draining')
      assert.equal(registry.get('lane-a')?.inflight, 0)

      const undrained = await postJsonWithBase<{ action: string; lane: { id: string; status: string } }>(laneHarness.baseUrl, '/v1/lanes/lane-a/undrain', {})
      const afterUndrain = await postJsonWithBase<{ streamId: string; runtimeLaneId: string; runtimeBackendId: string }>(laneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_drain',
        jobId: 'job_lane_drain',
        prompt: 'Build lane A page after undrain',
        sourceMode: 'new_html',
        variationCount: 3,
        variationIndex: 3,
        workspaceRoot: laneAAfterUndrainRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      assert.equal(undrained.action, 'drain_cleared')
      assert.equal(undrained.lane.status, 'healthy')
      assert.equal(afterUndrain.runtimeLaneId, 'lane-a')
      assert.equal(afterUndrain.runtimeBackendId, 'backend-a')

      const streamAfterUndrain = await getTextWithBase(laneHarness.baseUrl, `/v1/stream?streamId=${afterUndrain.streamId}`)
      assert.match(streamAfterUndrain, /Lane A accepts work again/)
    } finally {
      await laneHarness.close()
    }
  })

  it('lets BabeL-O resolve its configured default model for the DUDesign placeholder model', async () => {
    const executeBodies: Array<Record<string, unknown>> = []
    const defaultModelHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({
        onExecuteBody: body => executeBodies.push(body),
      }),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(defaultModelHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_1',
        jobId: 'job_default_model',
        prompt: 'Build a page',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot,
        memoryNamespace: 'memory:user_1',
        modelServiceId: 'mdl_babelo_default',
        modelId: 'babel-o-default',
        modelProvider: 'babel-o',
        templateRequirements: {},
      })
      await getTextWithBase(defaultModelHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(executeBodies.length, 1)
      assert.equal(executeBodies[0]?.model, undefined)
    } finally {
      await defaultModelHarness.close()
    }
  })

  it('sends separate execute and watchdog timeout values to raw Nexus', async () => {
    const executeBodies: Array<Record<string, unknown>> = []
    const timeoutHarness = await startHarness(createRuntimeAdapterServer({
      executeTimeoutMs: 300000,
      watchdogTimeoutMs: 600000,
      nexus: createMockNexus({
        onExecuteBody: body => executeBodies.push(body),
      }),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(timeoutHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_timeout',
        jobId: 'job_timeout_policy',
        prompt: 'Build a page with timeout policy',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      await getTextWithBase(timeoutHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(executeBodies.length, 1)
      assert.equal(executeBodies[0]?.timeoutMs, 300000)
      assert.equal(executeBodies[0]?.watchdogTimeoutMs, 600000)
    } finally {
      await timeoutHarness.close()
    }
  })

  it('retries raw Nexus execute once when runtime capacity returns HTTP 429', async () => {
    let executeAttempts = 0
    const retryHarness = await startHarness(createRuntimeAdapterServer({
      executeRetryAttempts: 1,
      executeRetryBaseDelayMs: 1,
      nexus: new NexusClient({
        baseUrl: 'https://nexus.example.test',
        fetch: async (url) => {
          const href = String(url)
          if (href.endsWith('/v1/sessions')) {
            return jsonResponse({
              type: 'session_created',
              sessionId: 'nexus_retry_session',
            }, 201)
          }
          if (href.endsWith('/v1/execute')) {
            executeAttempts += 1
            if (executeAttempts === 1) {
              return jsonResponse({
                type: 'error',
                code: 'EXECUTION_BUSY',
                message: 'Nexus execution capacity is full. Try again shortly.',
              }, 429)
            }
            return jsonResponse({
              type: 'execute_result',
              sessionId: 'nexus_retry_session',
              success: true,
              events: [
                { type: 'assistant_delta', delta: 'Retried successfully' },
              ],
            })
          }
          return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
        },
      }),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(retryHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_retry',
        jobId: 'job_retry',
        prompt: 'Build a page after capacity frees up',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(retryHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(executeAttempts, 2)
      assert.match(stream, /Finishing the generated page/)
      assert.doesNotMatch(stream, /Retried successfully/)
      assert.match(stream, /"type":"result"/)
    } finally {
      await retryHarness.close()
    }
  })

  it('switches to another runtime lane when the assigned lane is unavailable', async () => {
    const retryWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-retry-'))
    await writeFile(join(retryWorkspaceRoot, 'index.html'), '<!doctype html><h1>Recovered on lane B</h1>', 'utf8')
    let laneAExecuteAttempts = 0
    let laneBExecuteAttempts = 0
    let laneBSessionCreates = 0
    const laneANexus = new NexusClient({
      baseUrl: 'https://lane-a.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_a_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneAExecuteAttempts += 1
          return jsonResponse({ type: 'error', code: 'LANE_DOWN' }, 503)
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const laneBNexus = new NexusClient({
      baseUrl: 'https://lane-b.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          laneBSessionCreates += 1
          return jsonResponse({ type: 'session_created', sessionId: `lane_b_retry_session_${laneBSessionCreates}` }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneBExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_b_retry_session_1',
            success: true,
            events: [{ type: 'assistant_delta', delta: 'Recovered on the second lane' }],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 1 }, laneBNexus),
    ])
    const retryLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 1,
      laneAcquireTimeoutMs: 50,
      laneAcquirePollMs: 10,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(retryLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_retry',
        jobId: 'job_lane_retry',
        prompt: 'Build a page after lane retry',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: retryWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(retryLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(spawned.runtimeLaneId, 'lane-a')
      assert.equal(laneAExecuteAttempts, 1)
      assert.equal(laneBExecuteAttempts, 1)
      assert.equal(laneBSessionCreates, 1)
      assert.equal(registry.get('lane-a')?.status, 'unavailable')
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.equal(registry.get('lane-b')?.inflight, 0)
      assert.match(stream, /"type":"runtime_lane_retry_started"/)
      assert.match(stream, /"previousRuntimeLaneId":"lane-a"/)
      assert.match(stream, /"nextRuntimeLaneId":"lane-b"/)
      assert.match(stream, /"type":"runtime_lane_assigned"/)
      assert.match(stream, /"runtimeLaneId":"lane-b"/)
      assert.match(stream, /Recovered on lane B/)
      assert.match(stream, /"type":"result"/)
    } finally {
      await retryLaneHarness.close()
    }
  })

  it('switches lanes when raw Nexus returns an unsuccessful execution result', async () => {
    const retryWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-execution-failed-'))
    await writeFile(join(retryWorkspaceRoot, 'index.html'), '<!doctype html><h1>Recovered after execution failure</h1>', 'utf8')
    let laneAExecuteAttempts = 0
    let laneBExecuteAttempts = 0
    const laneANexus = new NexusClient({
      baseUrl: 'https://lane-a.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_a_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneAExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_a_session',
            success: false,
            events: [
              { type: 'assistant_delta', delta: 'Writing index.html.' },
              { type: 'error', code: 'EXECUTION_FAILED', message: 'Runtime returned no artifact.' },
            ],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const laneBNexus = new NexusClient({
      baseUrl: 'https://lane-b.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_b_execution_retry_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneBExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_b_execution_retry_session',
            success: true,
            events: [{ type: 'assistant_delta', delta: 'Recovered after execution failure' }],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 1 }, laneBNexus),
    ])
    const retryLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 1,
      laneAcquireTimeoutMs: 50,
      laneAcquirePollMs: 10,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(retryLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_execution_retry',
        jobId: 'job_lane_execution_retry',
        prompt: 'Build a page after execution failure lane retry',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: retryWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(retryLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(spawned.runtimeLaneId, 'lane-a')
      assert.equal(laneAExecuteAttempts, 1)
      assert.equal(laneBExecuteAttempts, 1)
      assert.equal(registry.get('lane-a')?.status, 'healthy')
      assert.equal(registry.get('lane-a')?.lastErrorCode, undefined)
      assert.match(stream, /"type":"runtime_lane_retry_started"/)
      assert.match(stream, /"reason":"runtime_execution_failed"/)
      assert.match(stream, /"runtimeLaneId":"lane-b"/)
      assert.match(stream, /Recovered after execution failure/)
      assert.match(stream, /"type":"result"/)
    } finally {
      await retryLaneHarness.close()
    }
  })

  it('waits for a busy alternate runtime lane before retrying execution failure', async () => {
    const retryWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-retry-wait-'))
    await writeFile(join(retryWorkspaceRoot, 'index.html'), '<!doctype html><h1>Recovered after waiting for lane B</h1>', 'utf8')
    let laneAExecuteAttempts = 0
    let laneBExecuteAttempts = 0
    const laneANexus = new NexusClient({
      baseUrl: 'https://lane-a.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_a_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneAExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_a_session',
            success: false,
            events: [{ type: 'error', code: 'EXECUTION_FAILED', message: 'Runtime returned no artifact.' }],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const laneBNexus = new NexusClient({
      baseUrl: 'https://lane-b.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_b_wait_retry_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneBExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_b_wait_retry_session',
            success: true,
            events: [{ type: 'assistant_delta', delta: 'Recovered after alternate lane became free' }],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 1 }, laneBNexus),
    ])
    const occupiedLease = registry.acquire({ preferredLaneId: 'lane-b' })
    const retryLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 1,
      laneAcquireTimeoutMs: 1000,
      laneAcquirePollMs: 20,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(retryLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_execution_retry_wait',
        jobId: 'job_lane_execution_retry_wait',
        prompt: 'Build a page after waiting for lane retry',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: retryWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const streamPromise = getTextWithBase(retryLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)
      await delay(80)
      registry.release(occupiedLease)
      const stream = await streamPromise

      assert.equal(spawned.runtimeLaneId, 'lane-a')
      assert.equal(laneAExecuteAttempts, 1)
      assert.equal(laneBExecuteAttempts, 1)
      assert.equal(registry.get('lane-a')?.status, 'healthy')
      assert.equal(registry.get('lane-b')?.inflight, 0)
      assert.match(stream, /"type":"runtime_lane_retry_started"/)
      assert.match(stream, /"runtimeLaneId":"lane-b"/)
      assert.match(stream, /Recovered after waiting for lane B/)
      assert.match(stream, /"type":"result"/)
    } finally {
      registry.release(occupiedLease)
      await retryLaneHarness.close()
    }
  })

  it('waits briefly for a busy runtime lane instead of failing stream consumption immediately', async () => {
    const busyLaneWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-busy-'))
    const laneANexus = createMockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
    ])
    const occupiedLease = registry.acquire()
    const busyLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 0,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(busyLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_busy',
        jobId: 'job_lane_busy',
        prompt: 'Build a page after lane frees up',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: busyLaneWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const streamPromise = getTextWithBase(busyLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)
      await delay(50)
      registry.release(occupiedLease)
      const stream = await streamPromise

      assert.equal(spawned.runtimeLaneId, 'lane-a')
      assert.match(stream, /"type":"runtime_lane_assigned"/)
      assert.equal(registry.get('lane-a')?.inflight, 0)
    } finally {
      registry.release(occupiedLease)
      await busyLaneHarness.close()
    }
  })

  it('switches lanes when raw Nexus execute hangs past the adapter watchdog', async () => {
    const retryWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-timeout-retry-'))
    await writeFile(join(retryWorkspaceRoot, 'index.html'), '<!doctype html><h1>Recovered after execute timeout</h1>', 'utf8')
    let laneBExecuteAttempts = 0
    const laneANexus = new NexusClient({
      baseUrl: 'https://lane-a.example.test',
      fetch: async (url, init) => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_a_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          await neverUntilAbort(init?.signal)
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const laneBNexus = new NexusClient({
      baseUrl: 'https://lane-b.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_b_timeout_retry_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          laneBExecuteAttempts += 1
          return jsonResponse({
            type: 'execute_result',
            sessionId: 'lane_b_timeout_retry_session',
            success: true,
            events: [{ type: 'assistant_delta', delta: 'Recovered after timeout' }],
          })
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', backendId: 'backend-b', baseUrl: 'https://lane-b.example.test', maxConcurrent: 1 }, laneBNexus),
    ])
    const retryLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 1,
      executeTimeoutMs: 20,
      watchdogTimeoutMs: 20,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string; runtimeLaneId: string }>(retryLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_timeout_retry',
        jobId: 'job_lane_timeout_retry',
        prompt: 'Build a page after execute timeout lane retry',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: retryWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(retryLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(spawned.runtimeLaneId, 'lane-a')
      assert.equal(laneBExecuteAttempts, 1)
      assert.equal(registry.get('lane-a')?.status, 'unavailable')
      assert.equal(registry.get('lane-a')?.lastErrorCode, 'RUNTIME_REQUEST_TIMEOUT')
      assert.match(stream, /"type":"runtime_lane_retry_started"/)
      assert.match(stream, /"reason":"runtime_request_timeout"/)
      assert.match(stream, /"runtimeLaneId":"lane-b"/)
      assert.match(stream, /Recovered after execute timeout/)
      assert.match(stream, /"type":"result"/)
    } finally {
      await retryLaneHarness.close()
    }
  })

  it('reports lane retry exhausted when no alternate runtime lane is available', async () => {
    const retryWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-lane-retry-exhausted-'))
    const laneANexus = new NexusClient({
      baseUrl: 'https://lane-a.example.test',
      fetch: async url => {
        const href = String(url)
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({ type: 'session_created', sessionId: 'lane_a_session' }, 201)
        }
        if (href.endsWith('/v1/execute')) {
          return jsonResponse({ type: 'error', code: 'LANE_DOWN' }, 503)
        }
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      },
    })
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', backendId: 'backend-a', baseUrl: 'https://lane-a.example.test', maxConcurrent: 1 }, laneANexus),
    ])
    const retryLaneHarness = await startHarness(createRuntimeAdapterServer({
      nexus: laneANexus,
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 1,
      laneAcquireTimeoutMs: 50,
      laneAcquirePollMs: 10,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(retryLaneHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_lane_retry_exhausted',
        jobId: 'job_lane_retry_exhausted',
        prompt: 'Build a page but all lanes fail',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: retryWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(retryLaneHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.equal(registry.get('lane-a')?.status, 'unavailable')
      assert.equal(registry.get('lane-a')?.inflight, 0)
      assert.match(stream, /"type":"runtime_lane_retry_exhausted"/)
      assert.match(stream, /"errorCode":"RUNTIME_LANE_UNAVAILABLE"/)
      assert.match(stream, /"type":"error"/)
      assert.match(stream, /"code":"ADAPTER_STREAM_FAILED"/)
      assert.doesNotMatch(stream, /"type":"result"/)
    } finally {
      await retryLaneHarness.close()
    }
  })

  it('fails the stream when BabeL-O completes without writing an artifact in the DUDesign workspace', async () => {
    const emptyWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-empty-artifact-'))
    const missingArtifactHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus(),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(missingArtifactHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_missing_artifact',
        jobId: 'job_missing_artifact',
        prompt: 'Build a page but do not write it',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: emptyWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(missingArtifactHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.match(stream, /"type":"error"/)
      assert.match(stream, /"code":"ARTIFACT_MISSING"/)
      assert.doesNotMatch(stream, /"type":"result"/)
      assert.doesNotMatch(stream, /BabeL-O completed without writing index.html/)
    } finally {
      await missingArtifactHarness.close()
    }
  })

  it('includes the latest BabeL-O execution error detail when execute returns success false', async () => {
    const failedWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-execute-failed-'))
    const failedHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({
        executeSuccess: false,
        executeEvents: [
          { type: 'thinking_delta', delta: 'Plan the page' },
          { type: 'error', code: 'MODEL_PROVIDER_AUTH_FAILED', message: 'Model provider rejected the request.' },
        ],
      }),
      laneAcquireTimeoutMs: 50,
      laneAcquirePollMs: 10,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(failedHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_execute_failed',
        jobId: 'job_execute_failed',
        prompt: 'Build a page that fails',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: failedWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(failedHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.match(stream, /"type":"error"/)
      assert.match(stream, /"code":"MODEL_PROVIDER_AUTH_FAILED"/)
      assert.match(stream, /BabeL-O execution failed: Model provider rejected the request\./)
      assert.match(stream, /"detail":/)
      assert.equal((stream.match(/"type":"error"/g) ?? []).length, 1)
      assert.doesNotMatch(stream, /"code":"EXECUTION_FAILED","message":"BabeL-O execution failed\."/)
    } finally {
      await failedHarness.close()
    }
  })

  it('falls back to agent transcript detail when execute failure returns no events', async () => {
    const failedWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-execute-transcript-'))
    const failedHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({
        executeSuccess: false,
        executeEvents: [],
        transcriptEvents: [
          { type: 'thinking_delta', delta: 'Writing index.html.' },
          { type: 'tool_started', name: 'Write', input: { path: 'index.html' } },
          { type: 'assistant_delta', delta: 'The runtime stopped after a tool call without returning an explicit error.' },
        ],
      }),
      laneAcquireTimeoutMs: 50,
      laneAcquirePollMs: 10,
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(failedHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_execute_transcript',
        jobId: 'job_execute_transcript',
        prompt: 'Build a page that fails without direct execute events',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: failedWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(failedHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.match(stream, /"type":"error"/)
      assert.match(stream, /"code":"EXECUTION_FAILED"/)
      assert.match(stream, /"detail":/)
      assert.match(stream, /Writing index\.html/)
      assert.match(stream, /tool_started/)
      assert.match(stream, /without returning an explicit error/)
    } finally {
      await failedHarness.close()
    }
  })

  it('fails the stream when BabeL-O drifts outside the DUDesign variation cwd', async () => {
    const isolatedWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-cwd-drift-'))
    const driftHarness = await startHarness(createRuntimeAdapterServer({
      nexus: createMockNexus({
        executeEvents: [
          {
            type: 'session_root_continuity',
            requestCwd: '/var',
            storedSessionCwd: isolatedWorkspaceRoot,
            resolvedCwd: '/var',
            decision: 'use_prompt_path',
            reason: 'prompt_internal_path_inferred',
          },
          {
            type: 'tool_started',
            name: 'Write',
            input: { path: '/var/www/index.html' },
          },
        ],
      }),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(driftHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_cwd_drift',
        jobId: 'job_cwd_drift',
        prompt: 'Build a page from bundled HTML that contains /var(...) tokens',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: isolatedWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(driftHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.match(stream, /"type":"error"/)
      assert.match(stream, /"code":"RUNTIME_CWD_DRIFT"/)
      assert.match(stream, /"actualCwd":"\/var"/)
      assert.doesNotMatch(stream, /"type":"result"/)
    } finally {
      await driftHarness.close()
    }
  })

  it('does not follow symlinks when reading workspace artifacts', async () => {
    const symlinkWorkspaceRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-symlink-'))
    const outsideRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-adapter-outside-'))
    await writeFile(join(symlinkWorkspaceRoot, 'index.html'), '<!doctype html><h1>Safe artifact</h1>', 'utf8')
    await writeFile(join(outsideRoot, 'secret.css'), 'body::before { content: "leaked-secret"; }', 'utf8')
    await symlink(join(outsideRoot, 'secret.css'), join(symlinkWorkspaceRoot, 'styles.css'))
    const symlinkHarness = await startHarness(createRuntimeAdapterServer({
      workspacePollIntervalMs: 5,
      nexus: createMockNexus(),
    }))
    try {
      const spawned = await postJsonWithBase<{ streamId: string }>(symlinkHarness.baseUrl, '/v1/agents', {
        userId: 'user_1',
        workspaceId: 'workspace_1',
        sessionId: 'nexus_session_symlink',
        jobId: 'job_symlink',
        prompt: 'Build a page without following symlinks',
        sourceMode: 'new_html',
        variationCount: 1,
        variationIndex: 1,
        workspaceRoot: symlinkWorkspaceRoot,
        memoryNamespace: 'memory:user_1',
        templateRequirements: {},
      })
      const stream = await getTextWithBase(symlinkHarness.baseUrl, `/v1/stream?streamId=${spawned.streamId}`)

      assert.match(stream, /"type":"result"/)
      assert.match(stream, /Safe artifact/)
      assert.doesNotMatch(stream, /leaked-secret/)
      assert.doesNotMatch(stream, /"path":"styles.css"/)
    } finally {
      await symlinkHarness.close()
    }
  })

  it('cancels Nexus agent jobs from DUDesign variation handles', async () => {
    const cancelled = await postJson<{ cancelled: boolean; cancelledVariationCount: number }>('/v1/agents/cancel', {
      jobId: 'job_1',
      reason: 'operator requested',
      variations: [
        {
          variationId: 'variation_1',
          runtimeChildSessionId: 'nexus_child_1',
          runtimeAgentJobId: 'agent_job_1',
        },
      ],
    })

    assert.equal(cancelled.cancelled, true)
    assert.equal(cancelled.cancelledVariationCount, 1)
  })

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function getText(path: string): Promise<string> {
    return getTextWithBase(harness.baseUrl, path)
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    return postJsonWithBase(harness.baseUrl, path, body)
  }
})

function createMockNexus(options: {
  onSessionBody?: (body: Record<string, unknown>) => void
  onExecuteBody?: (body: Record<string, unknown>) => void
  executeEvents?: Array<Record<string, unknown>>
  executeSuccess?: boolean
  transcriptEvents?: Array<Record<string, unknown>>
  beforeExecuteReturn?: () => Promise<void>
  onCancelAgent?: (agentJobId: string) => void
} = {}): NexusClient {
  let sessionSequence = 0
  return new NexusClient({
    baseUrl: 'https://nexus.example.test',
    fetch: async (url, init) => {
      const href = String(url)
      if (href.endsWith('/health')) {
        return jsonResponse({ status: 'ok', runtime: 'babel-o', version: '0.3.9' })
      }
      if (href.endsWith('/v1/runtime/version')) {
        return jsonResponse({ type: 'runtime_version', serverVersion: '0.3.9' })
      }
      if (href.endsWith('/v1/sessions')) {
        sessionSequence += 1
        if (init?.body) {
          options.onSessionBody?.(JSON.parse(String(init.body)) as Record<string, unknown>)
        }
        return jsonResponse({
          type: 'session_created',
          sessionId: `nexus_session_${sessionSequence}`,
        }, 201)
      }
      if (href.endsWith('/v1/execute')) {
        if (init?.body) {
          options.onExecuteBody?.(JSON.parse(String(init.body)) as Record<string, unknown>)
        }
        await options.beforeExecuteReturn?.()
        return jsonResponse({
          type: 'execute_result',
          sessionId: 'nexus_session_1',
          success: options.executeSuccess ?? true,
          events: options.executeEvents ?? [
            { type: 'thinking_delta', delta: 'Plan' },
            { type: 'assistant_delta', delta: 'Done' },
          ],
        })
      }
      if (/\/v1\/agents\/[^/]+\/transcript(?:\?|$)/.test(href)) {
        return jsonResponse({
          type: 'agent_transcript',
          events: options.transcriptEvents ?? options.executeEvents ?? [],
        })
      }
      const cancelMatch = href.match(/\/v1\/agents\/([^/]+)\/cancel$/)
      if (cancelMatch) {
        options.onCancelAgent?.(decodeURIComponent(cancelMatch[1]!))
        return jsonResponse({ type: 'agent_job_cancelled', job: { jobId: cancelMatch[1], status: 'cancelled' } })
      }
      return new Response(JSON.stringify({ type: 'error' }), { status: 404 })
    },
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function neverUntilAbort(signal: AbortSignal | null | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

async function getTextWithBase(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.text()
}

async function getJsonWithBase<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function postJsonWithBase<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function startHarness(server: ReturnType<typeof createRuntimeAdapterServer>): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
