import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { BabelORuntimeGateway, BabelORuntimeClient, DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import type {
  CreateAnnotationBatchResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  ExportVariationResponse,
  ResumeSessionResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'

import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

type JobSnapshot = {
  job: { status: string }
  variations: Array<{
    id: string
    status: string
    previewUrl: string | null
    runtimeChildSessionId: string | null
    runtimeAgentJobId: string | null
  }>
  artifacts: Array<{
    id: string
    variationId: string | null
    quality: { status: 'pass' | 'warn' | 'fail'; issues: string[] } | null
  }>
}

describe('DUDesign API flow with BabeL-O runtime gateway', () => {
  let harness: ApiFlowHarness
  let activeStreams = 0
  let maxActiveStreams = 0
  let unsafeBundle = false
  let qualityShell = false
  let sessionCreateCount = 0
  let resumeMode: 'resumed' | 'fail_then_rebuild' = 'resumed'
  const refineBodies: unknown[] = []
  const resumeBodies: unknown[] = []

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
          if (/\/v1\/sessions\/[^/]+\/resume$/.test(href)) {
            resumeBodies.push(JSON.parse(String(init?.body)))
            if (resumeMode === 'fail_then_rebuild') {
              return new Response('runtime session gone', { status: 410 })
            }
            return jsonResponse({
              status: 'resumed',
              runtimeSessionId: 'rt_session_api_smoke',
              message: 'ok',
            })
          }
          if (href.endsWith('/v1/sessions')) {
            sessionCreateCount += 1
            return jsonResponse({
              runtimeSessionId: resumeMode === 'fail_then_rebuild'
                ? `rt_session_rebuilt_${sessionCreateCount}`
                : 'rt_session_api_smoke',
            })
          }
          if (href.endsWith('/v1/agents/refine')) {
            const body = JSON.parse(String(init?.body)) as { runtimeChildSessionId?: string | null }
            refineBodies.push(body)
            return jsonResponse({
              streamId: 'refine_stream_1',
              agentJobId: 'refine_agent_1',
              runtimeChildSessionId: body.runtimeChildSessionId ?? 'rt_child_refine_1',
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
          if (href.includes('/v1/stream')) {
            const streamId = new URL(href).searchParams.get('streamId') ?? 'stream_0'
            if (streamId === 'refine_stream_1') {
              return streamResponse([
                JSON.stringify({ type: 'assistant_delta', delta: 'Refining from current artifact context' }),
                JSON.stringify({
                  type: 'result',
                  artifactId: 'runtime_refined_artifact_1',
                  entryPath: 'index.html',
                  html: '<!doctype html><html><body><h1>Runtime refined from annotation</h1></body></html>',
                  inputTokens: 50,
                  outputTokens: 120,
                  costCents: 1,
                }),
              ].join('\n') + '\n')
            }
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
            if (qualityShell) {
              return streamResponse([
                JSON.stringify({ type: 'assistant_delta', delta: `Streaming ${streamId}` }),
                JSON.stringify({
                  type: 'result',
                  artifactId: `runtime_quality_shell_${streamId}`,
                  entryPath: 'index.html',
                  html: '<!doctype html><html><head><style>html,body,#root{width:100%;height:100%;margin:0;background:#000}</style><script src="https://cdn.example.com/app.js"></script></head><body><div id="root"></div></body></html>',
                  inputTokens: 10,
                  outputTokens: 20,
                  costCents: 1,
                }),
              ].join('\n') + '\n')
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
	    assert.ok(jobSnapshot.variations.every(variation => variation.previewUrl === `/api/variations/${variation.id}/preview`))
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
    const firstExport = await postJson<ExportVariationResponse>(`/api/variations/${jobSnapshot.variations[0]!.id}/export`, {})
    const secondExport = await postJson<ExportVariationResponse>(`/api/variations/${jobSnapshot.variations[0]!.id}/export`, {})
    assert.equal(secondExport.exportArtifact?.id, firstExport.exportArtifact?.id)
    assert.equal(secondExport.exportArtifact?.downloadUrl, firstExport.exportArtifact?.downloadUrl)
    assert.equal(secondExport.exportArtifact?.reused, true)
    const escapeAttempt = await fetch(`${harness.baseUrl}/api/variations/${jobSnapshot.variations[0]!.id}/assets/%5C..%5Cstyles.css`)
    assert.equal(escapeAttempt.status, 400)
    assert.equal(maxActiveStreams, 2)
  })

  it('passes current artifact html and annotation suffix to mocked BabeL-O refine', async () => {
    refineBodies.length = 0
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'BabeL-O refine context smoke',
    })
    const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: createdSession.session.id,
      prompt: 'A page that will be refined',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const jobSnapshot = await waitForJob(createdJob.job.id)
    const variationId = jobSnapshot.variations[0]!.id
    const beforeRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
    assert.ok(beforeRefine.currentArtifact)

    const annotated = await postJson<CreateAnnotationBatchResponse>(`/api/variations/${variationId}/annotations`, {
      artifactId: beforeRefine.currentArtifact.id,
      prompt: 'Make the marked hero feel stronger.',
      shapes: [
        {
          type: 'rect',
          x: 10,
          y: 20,
          w: 300,
          h: 120,
          note: 'Hero area',
        },
      ],
    })

    assert.equal(refineBodies.length, 1)
    const refineBody = refineBodies[0] as {
      baseArtifactHtml?: string
      baseArtifactEntryPath?: string | null
      baseArtifactVersion?: number
      annotationPromptSuffix?: string
      runtimeChildSessionId?: string | null
    }
    assert.match(refineBody.baseArtifactHtml ?? '', /Runtime workspace bridge/)
    assert.equal(refineBody.baseArtifactEntryPath, beforeRefine.currentArtifact.entryPath)
    assert.equal(refineBody.baseArtifactVersion, beforeRefine.currentArtifact.version)
    assert.match(refineBody.annotationPromptSuffix ?? '', /Make the marked hero feel stronger/)
    assert.match(refineBody.annotationPromptSuffix ?? '', /rect/)
    assert.equal(refineBody.runtimeChildSessionId, 'rt_child_1')
    assert.match(annotated.annotationBatch.promptSuffix, /Hero area/)
    const preview = await getText(`/api/variations/${variationId}/preview`)
    assert.match(preview, /Runtime refined from annotation/)
  })

  it('emits artifact quality warnings for black-screen shell HTML', async () => {
    qualityShell = true
    try {
      const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
      const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: 'BabeL-O quality gate smoke',
      })
      const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
        sessionId: createdSession.session.id,
        prompt: 'A runtime page that accidentally renders as a black shell',
        sourceMode: 'new_html',
        variationCount: 1,
        templateRequirements: {},
      })
      const jobSnapshot = await waitForJob(createdJob.job.id)
      const variationId = jobSnapshot.variations[0]!.id
      const detail = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
      const replay = await getText(`/api/design-jobs/${createdJob.job.id}/stream`)

      assert.equal(jobSnapshot.job.status, 'completed')
      assert.ok((detail.currentArtifact?.version ?? 0) >= 1)
      const artifact = jobSnapshot.artifacts.find(item =>
        item.quality?.status === 'fail'
        && item.quality.issues.some(issue => /black-screen|hydration|External scripts/.test(issue)),
      )
      assert.ok(artifact, 'expected at least one failed quality artifact')
      assert.equal(artifact?.quality?.status, 'fail')
      assert.ok(artifact?.quality?.issues.some(issue => /black-screen|hydration|External scripts/.test(issue)))
      assert.match(replay, /event: design\.runtime_warning/)
      assert.match(replay, /ARTIFACT_QUALITY_GATE/)
      assert.match(replay, /black-screen risk|client-side hydration|External scripts/)
    } finally {
      qualityShell = false
    }
  })

  it('can run the Playwright pixel gate for visually blank HTML', async () => {
    const previous = process.env.DUDESIGN_ARTIFACT_PIXEL_GATE
    process.env.DUDESIGN_ARTIFACT_PIXEL_GATE = '1'
    qualityShell = true
    try {
      const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
      const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: 'BabeL-O pixel quality gate smoke',
      })
      const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
        sessionId: createdSession.session.id,
        prompt: 'A runtime page that renders as a visually blank shell',
        sourceMode: 'new_html',
        variationCount: 1,
        capabilityRequirements: {
          automation: {
            loopProfileId: 'loop_deep_repair',
            maxRepairAttempts: 0,
          },
        },
        templateRequirements: {},
      })
      const jobSnapshot = await waitForJob(createdJob.job.id)
      const variationId = jobSnapshot.variations[0]!.id
      const detail = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)

      assert.equal(jobSnapshot.job.status, 'completed')
      assert.equal(detail.currentArtifact?.quality?.status, 'fail')
      assert.ok(detail.currentArtifact?.quality?.issues.some(issue => /blank black|low visual variation|black-screen/.test(issue)))
    } finally {
      qualityShell = false
      if (previous === undefined) delete process.env.DUDESIGN_ARTIFACT_PIXEL_GATE
      else process.env.DUDESIGN_ARTIFACT_PIXEL_GATE = previous
    }
  })

  it('resumes runtime sessions and persists rebuilt runtime ids', async () => {
    resumeBodies.length = 0
    resumeMode = 'resumed'
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'BabeL-O runtime resume smoke',
    })
    const resumed = await postJson<ResumeSessionResponse>(`/api/sessions/${createdSession.session.id}/resume`, {})
    assert.equal(resumed.runtime.status, 'resumed')
    assert.equal(resumed.runtime.runtimeSessionId, 'rt_session_api_smoke')
    assert.equal(resumeBodies.length, 1)

    resumeMode = 'fail_then_rebuild'
    const rebuilt = await postJson<ResumeSessionResponse>(`/api/sessions/${createdSession.session.id}/resume`, {})
    assert.equal(rebuilt.runtime.status, 'rebuilt')
    assert.ok(rebuilt.runtime.runtimeSessionId?.startsWith('rt_session_rebuilt_'))
    assert.equal((rebuilt.session as { runtimeSessionId?: string | null }).runtimeSessionId, rebuilt.runtime.runtimeSessionId)

    const continuedJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: createdSession.session.id,
      prompt: 'Continue after runtime rebuild',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const continuedSnapshot = await waitForJob(continuedJob.job.id)
    assert.equal(continuedSnapshot.job.status, 'completed')
    assert.equal(continuedSnapshot.variations[0]?.status, 'completed')
    resumeMode = 'resumed'
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
    while (Date.now() - startedAt < 8000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed' || snapshot.job.status === 'failed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function waitForJobStatus(jobId: string, variationStatus: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 8000) {
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
