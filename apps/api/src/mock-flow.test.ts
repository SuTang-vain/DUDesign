import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type http from 'node:http'
import type {
  CreateAnnotationBatchResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  ExportVariationResponse,
  RefineVariationResponse,
  SharedVariationResponse,
  ShareVariationResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { createApiServer } from './server.js'

type JobSnapshot = {
  job: { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' }
  variations: Array<{ id: string; status: string }>
  artifacts: unknown[]
}

describe('DUDesign mock API flow', () => {
  let server: http.Server
  let baseUrl: string

  before(async () => {
    server = createApiServer(new ApplicationService())
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error)
        else resolve()
      })
    })
  })

  it('creates a session, generates variations, refines with annotations, and serves preview HTML', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    assert.equal(bootstrap.workspace.id, 'ws_dev')

    const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Smoke session',
    })
    assert.ok(createdSession.session.id.startsWith('ses_'))

    const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: createdSession.session.id,
      prompt: 'A landing page for a freelancer invoicing app',
      sourceMode: 'new_html',
      variationCount: 3,
      templateRequirements: {
        styles: ['minimal', 'editorial'],
        deviceTargets: ['desktop', 'mobile'],
      },
    })
    assert.equal(createdJob.variations.length, 3)

    const jobSnapshot = await waitForJob(createdJob.job.id)
    assert.equal(jobSnapshot.job.status, 'completed')
    assert.equal(jobSnapshot.variations.length, 3)
    assert.ok(jobSnapshot.variations.every(variation => variation.status === 'completed'))
    assert.equal(jobSnapshot.artifacts.length, 3)

    const sseReplay = await getText(`/api/design-jobs/${createdJob.job.id}/stream`)
    assert.match(sseReplay, /event: design\.variation_streaming/)
    assert.match(sseReplay, /event: design\.job_completed/)

    const variationId = jobSnapshot.variations[0]!.id
    const beforeRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
    assert.equal(beforeRefine.currentArtifact?.version, 1)

    const refined = await postJson<RefineVariationResponse>('/api/variations/' + variationId + '/refine', {
      prompt: 'Make the hero more confident and improve mobile spacing.',
      baseArtifactId: beforeRefine.currentArtifact!.id,
      deviceContext: 'mobile',
    })
    assert.ok(refined.artifact)
    assert.equal(refined.artifact.version, 2)

    const afterRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
    assert.equal(afterRefine.currentArtifact?.version, 2)
    assert.deepEqual(afterRefine.artifacts.map(artifact => artifact.version), [2, 1])

    const annotated = await postJson<CreateAnnotationBatchResponse>(`/api/variations/${variationId}/annotations`, {
      artifactId: afterRefine.currentArtifact!.id,
      prompt: 'Apply this marked layout change.',
      shapes: [
        {
          type: 'rect',
          x: 0.12,
          y: 0.18,
          w: 0.32,
          h: 0.24,
          note: 'Give this area more breathing room.',
        },
      ],
    })
    assert.equal(annotated.annotationBatch.shapeCount, 1)
    assert.match(annotated.annotationBatch.promptSuffix, /rectangle at x=0\.120/)
    assert.equal(annotated.artifact?.version, 3)

    const preview = await getText(`/api/variations/${variationId}/preview`)
    assert.match(preview, /version 3/)
    assert.match(preview, /iframe-ready HTML/)

    const exported = await postJson<ExportVariationResponse>(`/api/variations/${variationId}/export`, {})
    assert.equal(exported.artifact.version, 3)
    assert.match(exported.artifact.filename, /variation-01-v3\.html/)
    assert.match(exported.artifact.html, /version 3/)

    const shared = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
      visibility: 'public',
    })
    assert.ok(shared.share.token.startsWith('share_'))
    assert.match(shared.share.url, /^\/share\/share_/)

    const shareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
    assert.equal(shareDetail.variation.id, variationId)
    assert.equal(shareDetail.artifact.version, 3)
  })

  async function waitForJob(jobId: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function getText(path: string): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.text()
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
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
