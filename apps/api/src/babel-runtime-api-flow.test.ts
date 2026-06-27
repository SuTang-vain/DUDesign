import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { BabelORuntimeGateway, BabelORuntimeClient, DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import type { CreateDesignJobResponse, CreateSessionResponse } from '@dudesign/contracts'

import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

type JobSnapshot = {
  job: { status: string }
  variations: Array<{
    id: string
    status: string
    runtimeChildSessionId: string | null
    runtimeAgentJobId: string | null
  }>
  artifacts: unknown[]
}

describe('DUDesign API flow with BabeL-O runtime gateway', () => {
  let harness: ApiFlowHarness
  let activeStreams = 0
  let maxActiveStreams = 0
  let unsafeBundle = false

  before(async () => {
    const runtime = new BabelORuntimeGateway({
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
          if (href.endsWith('/v1/health')) {
            return jsonResponse({
              contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
              runtimeVersion: '1.2.3',
            })
          }
          if (href.endsWith('/v1/sessions')) {
            return jsonResponse({ runtimeSessionId: 'rt_session_api_smoke' })
          }
          if (href.endsWith('/v1/agents')) {
            const body = JSON.parse(String(init?.body)) as { variationIndex: number }
            return jsonResponse({
              streamId: `stream_${body.variationIndex}`,
              agentJobId: `agent_${body.variationIndex}`,
              runtimeChildSessionId: `rt_child_${body.variationIndex}`,
            })
          }
          if (href.includes('/v1/stream')) {
            const streamId = new URL(href).searchParams.get('streamId') ?? 'stream_0'
            if (unsafeBundle) {
              return streamResponse(JSON.stringify({
                type: 'result',
                artifactId: `runtime_artifact_${streamId}`,
                entryPath: '../escape.html',
                files: [
                  { path: '../escape.html', content: '<!doctype html><p>escape</p>' },
                ],
              }) + '\n')
            }
            return streamResponse([
              JSON.stringify({ type: 'assistant_delta', delta: `Streaming ${streamId}` }),
              JSON.stringify({
                type: 'workspace_dirty',
                artifactId: `runtime_partial_artifact_${streamId}`,
                entryPath: 'index.html',
                changedPaths: ['index.html', 'styles.css'],
                files: [
                  {
                    path: 'index.html',
                    content: `<!doctype html><html><head><link rel="stylesheet" href="./styles.css"></head><body><h1>${streamId}</h1><p>Runtime partial snapshot</p></body></html>`,
                    contentType: 'text/html; charset=utf-8',
                  },
                  {
                    path: 'styles.css',
                    content: 'body { color: rgb(90, 90, 90); }',
                    contentType: 'text/css; charset=utf-8',
                  },
                ],
              }),
              JSON.stringify({
                type: 'result',
                artifactId: `runtime_artifact_${streamId}`,
                entryPath: 'index.html',
                files: [
                  {
                    path: 'index.html',
                    content: `<!doctype html><html><head><link rel="stylesheet" href="./styles.css"><script src="scripts/app.js"></script></head><body><h1>${streamId}</h1><p>Runtime workspace bridge</p></body></html>`,
                    contentType: 'text/html; charset=utf-8',
                  },
                  {
                    path: 'styles.css',
                    content: 'body { color: rgb(20, 20, 20); }',
                    contentType: 'text/css; charset=utf-8',
                  },
                  {
                    path: 'scripts/app.js',
                    content: 'window.__dudesignRuntimeAssetLoaded = true;',
                    contentType: 'text/javascript; charset=utf-8',
                  },
                ],
                inputTokens: 100,
                outputTokens: 400,
                costCents: 2,
              }),
            ].join('\n') + '\n', {
              onOpen: () => {
                activeStreams += 1
                maxActiveStreams = Math.max(maxActiveStreams, activeStreams)
              },
              onClose: () => {
                activeStreams -= 1
              },
              delayMs: 25,
              chunkDelayMs: 25,
            })
          }
          return jsonResponse({})
        },
      }),
    })
    harness = await startApiFlowHarness(new ApplicationService({ runtime }))
  })

  after(async () => {
    await harness.close()
  })

  it('creates variations from mocked BabeL-O stream events', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'BabeL-O runtime smoke',
    })
    assert.equal(createdSession.session.runtimeSessionId, 'rt_session_api_smoke')

    const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: createdSession.session.id,
      prompt: 'A runtime backed page',
      sourceMode: 'new_html',
      variationCount: 2,
      templateRequirements: {
        styles: ['runtime'],
      },
    })
    const partialSnapshot = await waitForJobStatus(createdJob.job.id, 'rendering_preview')
    const partialVariation = partialSnapshot.variations.find(variation => variation.status === 'rendering_preview')
    assert.ok(partialVariation)
    assert.equal(partialSnapshot.artifacts.length >= 2, true)
    const partialPreview = await getText(`/api/variations/${partialVariation.id}/preview`)
    assert.match(partialPreview, /Runtime partial snapshot/)
    assert.match(partialPreview, /\/api\/variations\/[^/]+\/assets\/styles\.css/)
    const jobSnapshot = await waitForJob(createdJob.job.id)

	    assert.equal(jobSnapshot.job.status, 'completed')
	    assert.equal(jobSnapshot.variations.length, 2)
	    assert.ok(jobSnapshot.variations.every(variation => variation.status === 'completed'))
	    assert.deepEqual(jobSnapshot.variations.map(variation => variation.runtimeChildSessionId), ['rt_child_1', 'rt_child_2'])
	    assert.deepEqual(jobSnapshot.variations.map(variation => variation.runtimeAgentJobId), ['agent_1', 'agent_2'])
	    assert.equal(jobSnapshot.artifacts.length, 10)
    const preview = await getText(`/api/variations/${jobSnapshot.variations[0]!.id}/preview`)
    assert.match(preview, /Runtime workspace bridge/)
    assert.match(preview, /\/api\/variations\/[^/]+\/assets\/styles\.css/)
    assert.match(preview, /\/api\/variations\/[^/]+\/assets\/scripts\/app\.js/)
    assert.doesNotMatch(preview, /href="\.\/styles\.css"/)
    assert.doesNotMatch(preview, /Mock preview/)
    const css = await getText(`/api/variations/${jobSnapshot.variations[0]!.id}/assets/styles.css`)
    assert.match(css, /rgb\(20, 20, 20\)/)
    const js = await getText(`/api/variations/${jobSnapshot.variations[0]!.id}/assets/scripts/app.js`)
    assert.match(js, /__dudesignRuntimeAssetLoaded/)
    const escapeAttempt = await fetch(`${harness.baseUrl}/api/variations/${jobSnapshot.variations[0]!.id}/assets/%5C..%5Cstyles.css`)
    assert.equal(escapeAttempt.status, 400)
    assert.equal(maxActiveStreams, 2)
  })

  it('rejects runtime workspace files that escape the artifact root', async () => {
    unsafeBundle = true
    try {
      const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
      const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: 'Unsafe workspace bundle',
      })
      const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
        sessionId: createdSession.session.id,
        prompt: 'A runtime backed page with unsafe files',
        sourceMode: 'new_html',
        variationCount: 1,
        templateRequirements: {},
      })
      const jobSnapshot = await waitForJob(createdJob.job.id)

      assert.equal(jobSnapshot.job.status, 'failed')
      assert.equal(jobSnapshot.variations[0]?.status, 'failed')
      assert.equal(jobSnapshot.artifacts.length, 0)
    } finally {
      unsafeBundle = false
    }
  })

	  async function waitForJob(jobId: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed' || snapshot.job.status === 'failed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function waitForJobStatus(jobId: string, variationStatus: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.variations.some(variation => variation.status === variationStatus)) return snapshot
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`Timed out waiting for variation status ${variationStatus} in job ${jobId}`)
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function getText(path: string): Promise<string> {
    const response = await fetch(`${harness.baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.text()
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  })
}

function streamResponse(body: string, options: {
  delayMs?: number
  chunkDelayMs?: number
  onOpen?: () => void
  onClose?: () => void
} = {}): Response {
  return new Response(new ReadableStream({
    async start(controller) {
      options.onOpen?.()
      if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs))
      const chunks = options.chunkDelayMs
        ? body.split(/(?<=\n)/).filter(Boolean)
        : [body]
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
        if (options.chunkDelayMs) await new Promise(resolve => setTimeout(resolve, options.chunkDelayMs))
      }
      controller.close()
      options.onClose?.()
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
    },
  })
}
