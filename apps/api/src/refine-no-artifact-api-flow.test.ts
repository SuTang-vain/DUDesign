import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import type { CreateDesignJobResponse, CreateSessionResponse, GetVariationRefineOperationResponse, RefineVariationResponse, VariationDetailResponse } from '@dudesign/contracts'
import type { RuntimeGateway } from '@dudesign/runtime-gateway'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { InMemoryStore } from './store.js'

const noArtifactRefineRuntime: RuntimeGateway = {
  async getRuntimeHealth() {
    return {
      status: 'compatible',
      runtime: 'test-no-artifact',
      runtimeVersion: '1',
      contractVersion: 'test',
      checkedAt: new Date().toISOString(),
    }
  },
  async getRuntimeContract() {
    return {
      runtime: 'test-no-artifact',
      runtimeVersion: '1',
      contractVersion: 'test',
      status: 'compatible',
      requiredEndpoints: [],
      requiredEvents: [],
      eventMappings: {},
    }
  },
  async listRuntimeModels() {
    return {
      type: 'runtime_models',
      version: 1,
      providers: [],
      defaultModel: null,
      syncedAt: new Date().toISOString(),
    }
  },
  async createSession() {
    return { runtimeSessionId: 'runtime_test' }
  },
  async resumeSession() {
    return { status: 'resumed', runtimeSessionId: 'runtime_test' }
  },
  async *spawnVariationAgents() {
    throw new Error('Generation is not used by this runtime fixture.')
  },
  async *refineVariation() {
    // Simulate a provider stream that closes without an artifact/result body.
  },
  async cancelRuntimeJob() {
    return { cancelled: false }
  },
}

describe('Refine artifact advancement invariant', () => {
  let artifactRoot: string
  let healthy: ApiFlowHarness
  let noChange: ApiFlowHarness

  before(async () => {
    artifactRoot = await mkdtemp(join(tmpdir(), 'dudesign-refine-no-artifact-'))
    const store = new InMemoryStore()
    const artifacts = new LocalArtifactStore({ rootDir: artifactRoot })
    healthy = await startApiFlowHarness(new ApplicationService({ store, artifacts }))
    noChange = await startApiFlowHarness(new ApplicationService({ store, artifacts, runtime: noArtifactRefineRuntime }))
  })

  after(async () => {
    await Promise.all([healthy?.close(), noChange?.close()])
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true })
  })

  it('fails the refine attempt when runtime completes without a new artifact', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>(healthy, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(healthy, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'No artifact refine fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>(healthy, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create a base artifact.',
      sourceMode: 'new_html',
      variationCount: 1,
    })
    await healthy.service.flushBackgroundTasks()
    const variationId = created.variations[0]!.id
    const before = await getJson<VariationDetailResponse>(healthy, `/api/variations/${variationId}`)
    const baseArtifactId = before.currentArtifact!.id

    const refined = await postJson<RefineVariationResponse>(noChange, `/api/variations/${variationId}/refine`, {
      requestId: 'rfn_no_artifact_change',
      prompt: 'Make a visible change.',
      baseArtifactId,
    })

    assert.equal(refined.variation.status, 'failed')
    assert.equal(refined.variation.errorCode, 'REFINE_NO_ARTIFACT_CHANGE')
    assert.equal(refined.variation.currentArtifactId, baseArtifactId)
    assert.equal(refined.artifact, undefined)

    const after = await getJson<VariationDetailResponse>(noChange, `/api/variations/${variationId}`)
    assert.equal(after.variation.status, 'completed')
    assert.equal(after.currentArtifact?.id, baseArtifactId)
    const operation = await getJson<GetVariationRefineOperationResponse>(
      noChange,
      `/api/variations/${variationId}/refine-operation?requestId=rfn_no_artifact_change`,
    )
    assert.equal(operation.operation?.status, 'failed')
  })
})

async function getJson<T>(harness: ApiFlowHarness, path: string): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  if (response.status < 200 || response.status >= 300) assert.fail(`${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function postJson<T>(harness: ApiFlowHarness, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status < 200 || response.status >= 300) assert.fail(`${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}
