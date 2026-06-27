import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import type {
  CreateDesignJobResponse,
  CreateSessionResponse,
  ExportVariationResponse,
  SharedVariationResponse,
  ShareVariationResponse,
} from '@dudesign/contracts'
import type { RuntimeGateway } from '@dudesign/runtime-gateway'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

type JobSnapshot = {
  job: { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' }
  variations: Array<{ id: string; status: string; currentArtifactId?: string | null; errorCode?: string | null }>
}

const unavailableRuntime: RuntimeGateway = {
  async getRuntimeHealth() {
    return {
      status: 'unavailable',
      runtime: 'babel-o',
      runtimeVersion: null,
      contractVersion: 'test',
      checkedAt: new Date().toISOString(),
      message: 'Runtime unavailable in test.',
    }
  },
  async getRuntimeContract() {
    return {
      runtime: 'babel-o',
      runtimeVersion: 'unavailable',
      contractVersion: 'test',
      status: 'unavailable',
      requiredEndpoints: [],
      requiredEvents: [],
      eventMappings: {},
    }
  },
  async createSession() {
    throw new Error('Runtime unavailable in test.')
  },
  async resumeSession() {
    return {
      status: 'unavailable',
      runtimeSessionId: null,
      message: 'Runtime unavailable in test.',
    }
  },
  async *spawnVariationAgents() {
    throw new Error('Runtime unavailable in test.')
  },
  async *refineVariation() {
    throw new Error('Runtime unavailable in test.')
  },
  async cancelRuntimeJob() {
    return {
      cancelled: false,
      message: 'Runtime unavailable in test.',
    }
  },
}

describe('Runtime unavailable degradation', () => {
  let artifactRoot: string
  let healthyHarness: ApiFlowHarness
  let degradedHarness: ApiFlowHarness

  before(async () => {
    artifactRoot = await mkdtemp(join(tmpdir(), 'dudesign-runtime-unavailable-'))
    const store = new InMemoryStore()
    const artifacts = new LocalArtifactStore({ rootDir: artifactRoot })
    healthyHarness = await startApiFlowHarness(new ApplicationService({ store, artifacts }))
    degradedHarness = await startApiFlowHarness(new ApplicationService({
      store,
      artifacts,
      runtime: unavailableRuntime,
    }))
  })

  after(async () => {
    await healthyHarness?.close()
    await degradedHarness?.close()
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true })
  })

  it('keeps completed artifacts readable and marks new jobs failed when runtime is unavailable', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>(healthyHarness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(healthyHarness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Runtime unavailable session',
    })
    const completedJob = await postJson<CreateDesignJobResponse>(healthyHarness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'A stable page before runtime outage',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const completedSnapshot = await waitForJob(healthyHarness, completedJob.job.id, 'completed')
    const variationId = completedSnapshot.variations[0]!.id
    const previewBefore = await getText(healthyHarness, `/api/variations/${variationId}/preview`)
    assert.match(previewBefore, /iframe-ready HTML/)

    const resumed = await postJson<{ runtime: { status: string }; artifacts: unknown[] }>(
      degradedHarness,
      `/api/sessions/${session.session.id}/resume`,
      {},
    )
    assert.equal(resumed.runtime.status, 'unavailable')
    assert.equal(resumed.artifacts.length >= 1, true)

    const previewDuringOutage = await getText(degradedHarness, `/api/variations/${variationId}/preview`)
    assert.match(previewDuringOutage, /iframe-ready HTML/)

    const exported = await postJson<ExportVariationResponse>(degradedHarness, `/api/variations/${variationId}/export`, {})
    assert.match(exported.artifact.html, /iframe-ready HTML/)

    const shared = await postJson<ShareVariationResponse>(degradedHarness, `/api/variations/${variationId}/share`, {
      visibility: 'public',
    })
    const shareDetail = await getJson<SharedVariationResponse>(degradedHarness, `/api/shares/${shared.share.token}`)
    assert.equal(shareDetail.variation.id, variationId)
    assert.match(shareDetail.artifact.html ?? '', /iframe-ready HTML/)

    const degradedSession = await postJson<CreateSessionResponse>(degradedHarness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Runtime outage new session',
    })
    assert.equal(degradedSession.session.runtimeSessionId, null)

    const degradedJob = await postJson<CreateDesignJobResponse>(degradedHarness, '/api/design-jobs', {
      sessionId: degradedSession.session.id,
      prompt: 'This should fail clearly while runtime is unavailable',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const failedSnapshot = await waitForJob(degradedHarness, degradedJob.job.id, 'failed')
    assert.equal(failedSnapshot.variations[0]?.status, 'failed')
    assert.equal(failedSnapshot.variations[0]?.errorCode, 'RUNTIME_UNAVAILABLE')
  })
})

async function waitForJob(harness: ApiFlowHarness, jobId: string, status: JobSnapshot['job']['status']): Promise<JobSnapshot> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2000) {
    const snapshot = await getJson<JobSnapshot>(harness, `/api/design-jobs/${jobId}`)
    if (snapshot.job.status === status) return snapshot
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for job ${jobId} to become ${status}`)
}

async function getJson<T>(harness: ApiFlowHarness, path: string): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function getText(harness: ApiFlowHarness, path: string): Promise<string> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.text()
}

async function postJson<T>(harness: ApiFlowHarness, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}
