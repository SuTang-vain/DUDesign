import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import { createRuntimeAdapterServer, resolveRuntimeWorkspaceRoot } from './app.js'
import { NexusClient } from './nexusClient.js'
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
    const health = await getJson<{ runtimeVersion: string; contractVersion: string; status: string }>('/v1/health')
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
    assert.equal(contract.contractVersion, DUDESIGN_RUNTIME_CONTRACT_VERSION)
    assert.equal(contract.status, 'compatible')
    assert.ok(contract.requiredEndpoints.includes('POST /v1/agents/refine'))
    assert.ok((contract as { optionalEndpoints?: string[] }).optionalEndpoints?.includes('GET /v1/models'))
    assert.ok(contract.requiredEvents.includes('file_delta'))
    assert.equal(contract.eventMappings.file_delta, 'design.variation_code_delta')
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
  onExecuteBody?: (body: Record<string, unknown>) => void
  executeEvents?: Array<Record<string, unknown>>
  beforeExecuteReturn?: () => Promise<void>
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
          success: true,
          events: options.executeEvents ?? [
            { type: 'thinking_delta', delta: 'Plan' },
            { type: 'assistant_delta', delta: 'Done' },
          ],
        })
      }
      return new Response(JSON.stringify({ type: 'error' }), { status: 404 })
    },
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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
