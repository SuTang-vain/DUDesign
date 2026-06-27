import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

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
      runtimeChildSessionId: 'rt_child_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<!doctype html><h1>Current HTML</h1>',
      baseArtifactEntryPath: 'index.html',
      baseArtifactVersion: 3,
      prompt: 'Make the hero bolder',
      annotationPromptSuffix: 'Annotation feedback: rect at 10,20.',
      workspaceRoot: 'workspaces/workspace_1',
      deviceContext: 'desktop',
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
      runtimeChildSessionId: 'rt_child_1',
      baseArtifactId: 'artifact_1',
      baseArtifactHtml: '<!doctype html><h1>Current HTML</h1>',
      baseArtifactEntryPath: 'index.html',
      baseArtifactVersion: 3,
      prompt: 'Make the hero bolder',
      annotationPromptSuffix: 'Annotation feedback: rect at 10,20.',
      workspaceRoot: 'workspaces/workspace_1',
      deviceContext: 'desktop',
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
      sourceArtifactId: null,
      variationCount: 2,
      variationIndex: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
      templateRequirements: {
        styles: ['minimal'],
      },
    })
    const events = []
    for await (const event of client.streamRuntimeEvents({ streamId: agent.streamId })) {
      events.push(event)
    }

    assert.equal(agent.streamId, 'stream_1')
    assert.equal(calls[0]?.url, 'https://runtime.example.test/v1/agents')
    assert.equal(calls[1]?.url, 'https://runtime.example.test/v1/stream?streamId=stream_1')
    assert.deepEqual(events, [
      { type: 'assistant_delta', delta: 'hello' },
      { type: 'result', artifactId: 'artifact_1' },
    ])
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
  return new Response(JSON.stringify(payload), {
    status: 200,
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
