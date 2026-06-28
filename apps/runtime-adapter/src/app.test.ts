import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
        if (href.endsWith('/v1/sessions')) {
          return jsonResponse({
            type: 'session_created',
            sessionId: 'nexus_session_1',
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
    const contract = await getJson<{ contractVersion: string; status: string; requiredEndpoints: string[] }>('/v1/contract')

    assert.equal(health.runtimeVersion, '0.3.9')
    assert.equal(health.contractVersion, DUDESIGN_RUNTIME_CONTRACT_VERSION)
    assert.equal(health.status, 'compatible')
    assert.equal(contract.contractVersion, DUDESIGN_RUNTIME_CONTRACT_VERSION)
    assert.equal(contract.status, 'compatible')
    assert.ok(contract.requiredEndpoints.includes('POST /v1/agents/refine'))
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
    const spawned = await postJson<{ streamId: string; agentJobId: string; runtimeChildSessionId: string }>('/v1/agents', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'nexus_session_1',
      jobId: 'job_1',
      prompt: 'Build a page',
      sourceMode: 'new_html',
      variationCount: 1,
      variationIndex: 1,
      workspaceRoot,
      memoryNamespace: 'memory:user_1',
      modelServiceId: 'mdl_babelo_default',
      modelId: 'anthropic/claude-3-5-sonnet',
      modelProvider: 'babel-o',
      templateRequirements: {},
    })
    const stream = await getText(`/v1/stream?streamId=${spawned.streamId}`)

    assert.match(spawned.agentJobId, /^execute_/)
    assert.equal(spawned.runtimeChildSessionId, 'nexus_session_1')
    assert.match(stream, /"type":"thinking_delta"/)
    assert.match(stream, /"type":"assistant_delta"/)
    assert.match(stream, /"type":"result"/)
    assert.match(stream, /Adapter workspace artifact/)
    const executeCall = nexusCalls.find(call => call.url.endsWith('/v1/execute') && call.method === 'POST')
    assert.ok(executeCall)
    const body = executeCall.body as {
      model?: string
      cwd?: string
      prompt?: string
    }
    assert.equal(body.model, 'anthropic/claude-3-5-sonnet')
    assert.equal(body.cwd, workspaceRoot)
    assert.match(body.prompt ?? '', /Model selection: service=mdl_babelo_default, provider=babel-o, model=anthropic\/claude-3-5-sonnet/)
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
} = {}): NexusClient {
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
      if (href.endsWith('/v1/execute')) {
        if (init?.body) {
          options.onExecuteBody?.(JSON.parse(String(init.body)) as Record<string, unknown>)
        }
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
      return new Response(JSON.stringify({ type: 'error' }), { status: 404 })
    },
  })
}

async function getTextWithBase(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.text()
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
