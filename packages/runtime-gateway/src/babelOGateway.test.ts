import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BabelORuntimeGateway } from './babelOGateway.js'
import { BabelORuntimeClient, DUDESIGN_RUNTIME_CONTRACT_VERSION } from './babelOClient.js'

describe('BabelORuntimeGateway', () => {
  it('creates sessions through the BabeL-O client when the contract is compatible', async () => {
    const calls: string[] = []
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async (url, init) => {
          calls.push(`${init?.method ?? 'GET'} ${url}`)
          if (String(url).endsWith('/v1/contract')) {
            return jsonResponse({
              contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
              runtimeVersion: '1.2.3',
            })
          }
          return jsonResponse({ runtimeSessionId: 'rt_session_created' })
        },
      }),
    })

    const created = await gateway.createSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })

    assert.equal(created.runtimeSessionId, 'rt_session_created')
    assert.deepEqual(calls, [
      'GET https://runtime.example.test/v1/contract',
      'POST https://runtime.example.test/v1/sessions',
    ])
  })

  it('blocks session creation when the runtime contract mismatches', async () => {
    const calls: string[] = []
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async (url, init) => {
          calls.push(`${init?.method ?? 'GET'} ${url}`)
          return jsonResponse({
            contractVersion: '2026-06-27.babel-o-runtime.v2',
            runtimeVersion: '2.0.0',
          })
        },
      }),
    })

    await assert.rejects(
      () =>
        gateway.createSession({
          userId: 'user_1',
          workspaceId: 'workspace_1',
          sessionId: 'session_1',
          workspaceRoot: 'workspaces/workspace_1',
          memoryNamespace: 'memory:user:user_1',
        }),
      error => error instanceof Error && error.message.includes('contract does not match'),
    )
    assert.deepEqual(calls, ['GET https://runtime.example.test/v1/contract'])
  })

	  it('returns unavailable resume results when the runtime contract mismatches', async () => {
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async () =>
          jsonResponse({
            contractVersion: '2026-06-27.babel-o-runtime.v2',
            runtimeVersion: '2.0.0',
          }),
      }),
    })

    const resumed = await gateway.resumeSession({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      runtimeSessionId: 'rt_session_existing',
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })

    assert.equal(resumed.status, 'unavailable')
    assert.equal(resumed.runtimeSessionId, null)
	    assert.match(resumed.message ?? '', /contract_mismatch/)
	  })

	  it('cancels runtime agents when the contract is compatible', async () => {
	    const calls: Array<{ url: string; method: string; body?: unknown }> = []
	    const gateway = new BabelORuntimeGateway({
	      client: new BabelORuntimeClient({
	        baseUrl: 'https://runtime.example.test',
	        fetch: async (url, init) => {
	          calls.push({
	            url: String(url),
	            method: init?.method ?? 'GET',
	            ...(init?.body && { body: JSON.parse(String(init.body)) }),
	          })
	          if (String(url).endsWith('/v1/contract')) {
	            return jsonResponse({
	              contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
	              runtimeVersion: '1.2.3',
	            })
	          }
	          return jsonResponse({
	            cancelled: true,
	            message: 'runtime cancel accepted',
	            cancelledVariationCount: 1,
	            failedVariationCount: 0,
	          })
	        },
	      }),
	    })

	    const cancelled = await gateway.cancelRuntimeJob({
	      jobId: 'job_1',
	      reason: 'operator cancel',
	      variations: [
	        { variationId: 'var_1', runtimeChildSessionId: 'rt_child_1', runtimeAgentJobId: 'agent_1' },
	      ],
	    })

	    assert.deepEqual(cancelled, {
	      cancelled: true,
	      message: 'runtime cancel accepted',
	      cancelledVariationCount: 1,
	      failedVariationCount: 0,
	    })
	    assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), [
	      'GET https://runtime.example.test/v1/contract',
	      'POST https://runtime.example.test/v1/agents/cancel',
	    ])
	    assert.deepEqual(calls[1]?.body, {
	      jobId: 'job_1',
	      reason: 'operator cancel',
	      variations: [
	        { variationId: 'var_1', runtimeChildSessionId: 'rt_child_1', runtimeAgentJobId: 'agent_1' },
	      ],
	    })
	  })

	  it('does not call cancel when the runtime contract mismatches', async () => {
	    const calls: string[] = []
	    const gateway = new BabelORuntimeGateway({
	      client: new BabelORuntimeClient({
	        baseUrl: 'https://runtime.example.test',
	        fetch: async (url, init) => {
	          calls.push(`${init?.method ?? 'GET'} ${url}`)
	          return jsonResponse({
	            contractVersion: '2026-06-27.babel-o-runtime.v2',
	            runtimeVersion: '2.0.0',
	          })
	        },
	      }),
	    })

	    const cancelled = await gateway.cancelRuntimeJob({
	      jobId: 'job_1',
	      variations: [
	        { variationId: 'var_1', runtimeChildSessionId: 'rt_child_1', runtimeAgentJobId: 'agent_1' },
	      ],
	    })

	    assert.equal(cancelled.cancelled, false)
	    assert.match(cancelled.message ?? '', /contract_mismatch/)
	    assert.deepEqual(calls, ['GET https://runtime.example.test/v1/contract'])
	  })

	  it('maps raw Nexus events through the adapter without exposing runtime details', () => {
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async () => jsonResponse({ contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION }),
      }),
    })

    const event = gateway.mapRuntimeEvent(
      {
        type: 'assistant_delta',
        delta: 'hello',
      },
      {
        sessionId: 'session_1',
        jobId: 'job_1',
        variationId: 'variation_1',
      },
    )

    assert.equal(event.type, 'design.variation_streaming')
    assert.deepEqual(event.payload, {
      channel: 'assistant',
      delta: 'hello',
    })
  })

  it('spawns variation agents and maps stream events into DUDesign events', async () => {
    const calls: string[] = []
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async (url, init) => {
          calls.push(`${init?.method ?? 'GET'} ${url}`)
          if (String(url).endsWith('/v1/contract')) {
            return jsonResponse({
              contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
              runtimeVersion: '1.2.3',
            })
          }
          if (String(url).endsWith('/v1/agents')) {
            return jsonResponse({
              streamId: 'stream_1',
              agentJobId: 'agent_1',
              runtimeChildSessionId: 'rt_child_1',
            })
          }
          return streamResponse('{"type":"assistant_delta","delta":"hello"}\n{"type":"result","artifactId":"artifact_1"}\n')
        },
      }),
    })

    const events = []
    for await (const event of gateway.spawnVariationAgents({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a page',
      sourceMode: 'new_html',
      sourceArtifactId: null,
      variationCount: 1,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })) {
      events.push(event)
    }

    assert.deepEqual(calls, [
      'GET https://runtime.example.test/v1/contract',
      'POST https://runtime.example.test/v1/agents',
      'GET https://runtime.example.test/v1/stream?streamId=stream_1&runtimeSessionId=rt_child_1&agentJobId=agent_1',
    ])
	    assert.deepEqual(events.map(event => event.type), [
	      'design.job_started',
	      'design.variation_queued',
	      'design.variation_queued',
	      'design.variation_streaming',
	      'design.variation_completed',
	      'design.job_completed',
	    ])
	    assert.equal(events[1]?.variationId, 'runtime_variation_1')
	    assert.equal(events[2]?.variationId, 'runtime_variation_1')
	    assert.equal(events[3]?.variationId, 'runtime_variation_1')
	    assert.equal(events[2]?.type === 'design.variation_queued' ? events[2].payload.runtimeChildSessionId : null, 'rt_child_1')
	    assert.equal(events[2]?.type === 'design.variation_queued' ? events[2].payload.runtimeAgentJobId : null, 'agent_1')
	  })

  it('merges variation streams and lets one child fail without stopping the others', async () => {
    const gateway = new BabelORuntimeGateway({
      client: new BabelORuntimeClient({
        baseUrl: 'https://runtime.example.test',
        fetch: async (url, init) => {
          const href = String(url)
          if (href.endsWith('/v1/contract')) {
            return jsonResponse({
              contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
              runtimeVersion: '1.2.3',
            })
          }
          if (href.endsWith('/v1/agents')) {
            const body = JSON.parse(String(init?.body)) as { variationIndex: number }
            return jsonResponse({
              streamId: `stream_${body.variationIndex}`,
              agentJobId: `agent_${body.variationIndex}`,
              runtimeChildSessionId: `rt_child_${body.variationIndex}`,
            })
          }
          const streamId = new URL(href).searchParams.get('streamId')
          if (streamId === 'stream_2') {
            return streamResponse('{"type":"assistant_delta","delta":"fast"}\n{"type":"result","artifactId":"artifact_2"}\n')
          }
          return delayedStreamResponse('{"type":"assistant_delta","delta":"slow"}\n{"type":"error","code":"CHILD_FAILED","message":"child failed","recoverable":true}\n', 20)
        },
      }),
    })

    const events = []
    for await (const event of gateway.spawnVariationAgents({
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_1',
      jobId: 'job_1',
      prompt: 'Build a page',
      sourceMode: 'new_html',
      sourceArtifactId: null,
      variationCount: 2,
      workspaceRoot: 'workspaces/workspace_1',
      memoryNamespace: 'memory:user:user_1',
    })) {
      events.push(event)
    }

    const completed = events.find(event => event.type === 'design.variation_completed')
    const failed = events.find(event => event.type === 'design.variation_failed')
    const jobCompleted = events.at(-1)

    assert.equal(completed?.variationId, 'runtime_variation_2')
    assert.equal(failed?.variationId, 'runtime_variation_1')
    assert.equal(jobCompleted?.type, 'design.job_completed')
    assert.deepEqual(jobCompleted?.payload, {
      completedVariationCount: 1,
      failedVariationCount: 1,
    })
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

function delayedStreamResponse(body: string, delayMs: number): Response {
  return new Response(new ReadableStream({
    async start(controller) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
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
