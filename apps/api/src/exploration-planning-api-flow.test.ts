import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  CreateDesignJobResponse,
  CreateSessionResponse,
  DesignJobSnapshotResponse,
  PreviewExplorationPlanResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'
import {
  MockRuntimeGateway,
  type RefineVariationInput,
  type SpawnVariationAgentsInput,
} from '@dudesign/runtime-gateway'
import { InMemoryDesignJobQueue } from './designJobQueue.js'
import { starGroupRequirementModuleGraph } from './fixtures/starGroupRequirementModuleGraph.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'

describe('Exploration planning API flow', () => {
  let harness: ApiFlowHarness
  let store: InMemoryStore

  before(async () => {
    store = new InMemoryStore()
    harness = await startApiFlowHarness(new ApplicationService({
      store,
      queue: new InMemoryDesignJobQueue(),
      consumeQueue: false,
    }))
  })

  after(async () => {
    await harness.close()
  })

  it('previews without creating a job, then pins the authorized plan into job and variation snapshots', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Exploration planning fixture',
      mode: 'new_html',
    })
    const request = {
      sessionId: session.session.id,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      variationCount: 3,
      exploration: { level: 40 },
      dataContext: { units: [{ id: 'unit-a' }] },
    }

    const preview = await postJson<PreviewExplorationPlanResponse>(
      '/api/design-jobs/exploration-plan/preview',
      request,
    )
    assert.equal((await store.getSessionSnapshot(session.session.id))?.jobs.length, 0)

    const created = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create three controlled star group encyclopedia directions.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 3,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      exploration: { level: 40 },
      explorationDataContext: { units: [{ id: 'unit-a' }] },
      templateRequirements: {
        explorationPlan: { forged: true },
        requirementModuleGraph: { forged: true },
      },
    })
    assert.deepEqual(created.job.explorationPlan, preview.explorationPlan)

    const snapshot = await getJson<DesignJobSnapshotResponse>(`/api/design-jobs/${created.job.id}`)
    assert.deepEqual(snapshot.job.explorationPlan, preview.explorationPlan)
    assert.deepEqual(snapshot.job.requirementModuleGraph, preview.requirementModuleGraph)
    assert.deepEqual(
      snapshot.variations.map(variation => variation.explorationPlan?.variationIndex),
      [1, 2, 3],
    )
    const stored = await store.getJobById(created.job.id)
    assert.deepEqual(stored?.templateRequirements.explorationPlan, preview.explorationPlan)
    assert.deepEqual(stored?.templateRequirements.requirementModuleGraph, preview.requirementModuleGraph)

    const restartedService = new ApplicationService({
      store,
      queue: new InMemoryDesignJobQueue(),
      consumeQueue: false,
    })
    const restartedSnapshot = await restartedService.getDesignJob(ownerContext(), created.job.id)
    assert.deepEqual(restartedSnapshot.job.explorationPlan, preview.explorationPlan)

    const variationDetail = await getJson<VariationDetailResponse>(`/api/variations/${created.variations[0]!.id}`)
    assert.equal(variationDetail.variation.explorationPlan?.variationIndex, 1)
    assert.deepEqual(variationDetail.job.explorationPlan, preview.explorationPlan)

    const adminContext = {
      requestId: 'req_exploration_retry',
      userId: store.devUser.id,
      adminRole: 'developer' as const,
      authMode: 'dev' as const,
      authSessionTokenHash: null,
    }
    const fullRetry = await harness.service.retryJobAsAdmin(adminContext, created.job.id)
    const fullRetrySnapshot = await harness.service.getDesignJob(ownerContext(), fullRetry.retry.job.id)
    assert.deepEqual(fullRetrySnapshot.job.explorationPlan, preview.explorationPlan)
    assert.equal(fullRetrySnapshot.job.productMode, 'dynamic_encyclopedia_card')

    const sourceVariationPlan = snapshot.variations[1]!.explorationPlan
    assert.ok(sourceVariationPlan)
    const variationRetry = await harness.service.retryVariationAsAdmin(
      adminContext,
      created.job.id,
      created.variations[1]!.id,
    )
    const variationRetrySnapshot = await harness.service.getDesignJob(ownerContext(), variationRetry.retry.job.id)
    assert.equal(variationRetrySnapshot.job.explorationPlan?.variations.length, 1)
    assert.equal(variationRetrySnapshot.job.explorationPlan?.variations[0]?.variationIndex, 1)
    assert.deepEqual(
      variationRetrySnapshot.job.explorationPlan?.variations[0]?.sampledModuleIds,
      sourceVariationPlan.sampledModuleIds,
    )
    assert.equal(variationRetrySnapshot.job.productMode, 'dynamic_encyclopedia_card')
  })

  it('rejects unavailable module graphs through both preview and creation', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Unauthorized graph fixture',
      mode: 'new_html',
    })

    await expectApiError('/api/design-jobs/exploration-plan/preview', {
      sessionId: session.session.id,
      requirementModuleGraphId: 'private_graph_unavailable',
      variationCount: 3,
      exploration: { level: 40 },
    }, 404, 'REQUIREMENT_MODULE_GRAPH_NOT_FOUND')

    await expectApiError('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'This should not create a job.',
      sourceMode: 'new_html',
      variationCount: 3,
      requirementModuleGraphId: 'private_graph_unavailable',
      exploration: { level: 40 },
    }, 404, 'REQUIREMENT_MODULE_GRAPH_NOT_FOUND')

    await expectApiError('/api/design-jobs/exploration-plan/preview', {
      sessionId: session.session.id,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      variationCount: 3,
      exploration: { level: 101 },
    }, 400, 'INVALID_EXPLORATION_PLAN_INPUT')
  })

  it('passes the fixed variation contexts into initial generation and refine', async () => {
    const runtime = new CapturingMockRuntimeGateway()
    const runtimeStore = new InMemoryStore()
    const queue = new InMemoryDesignJobQueue()
    const service = new ApplicationService({
      store: runtimeStore,
      runtime,
      queue,
      consumeQueue: false,
    })
    const ctx = {
      requestId: 'req_runtime_exploration',
      userId: runtimeStore.devUser.id,
      adminRole: null,
      authMode: 'dev' as const,
      authSessionTokenHash: null,
    }
    const session = await service.createSession(ctx, {
      workspaceId: runtimeStore.devWorkspace.id,
      title: 'Runtime exploration fixture',
      mode: 'new_html',
    })
    const created = await service.createDesignJob(ctx, {
      sessionId: session.session.id,
      prompt: 'Generate controlled star group directions.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 3,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      exploration: { level: 40 },
      explorationDataContext: { units: [{ id: 'unit-a' }] },
    })
    const storedJob = await runtimeStore.getJobById(created.job.id)
    assert.ok(storedJob)
    await service.processQueuedDesignJob({
      jobId: created.job.id,
      sessionId: session.session.id,
      variationIds: created.variations.map(variation => variation.id),
      sourceArtifactId: null,
      runtimeSessionId: session.session.runtimeSessionId,
      modelServiceId: String(storedJob.templateRequirements.modelServiceId),
      idempotencyKey: `test:runtime-exploration:${created.job.id}`,
      userId: runtimeStore.devUser.id,
      workspaceId: runtimeStore.devWorkspace.id,
      createdAt: new Date().toISOString(),
    })

    assert.equal(runtime.spawnInputs.length, 1)
    const contexts = runtime.spawnInputs[0]!.explorationContexts
    assert.equal(contexts?.length, 3)
    const snapshot = await service.getDesignJob(ctx, created.job.id)
    assert.deepEqual(
      contexts?.map(context => context.focus.id),
      snapshot.variations.map(variation => variation.explorationPlan?.focusId),
    )
    assert.ok(contexts?.every(context => context.safety.factCreativity === 0))
    assert.ok(contexts?.every(context => context.safety.mayExpandToolPolicy === false))

    const variation = snapshot.variations[1]!
    assert.ok(variation.currentArtifactId)
    await service.refineVariation(ctx, variation.id, {
      prompt: 'Improve the selected direction without changing its focus.',
      baseArtifactId: variation.currentArtifactId,
    })

    assert.equal(runtime.refineInputs.length, 1)
    assert.equal(runtime.refineInputs[0]!.explorationContext?.source.variationIndex, variation.index)
    assert.equal(runtime.refineInputs[0]!.explorationContext?.focus.id, variation.explorationPlan?.focusId)
  })

  it('keeps the exploration snapshot readable when runtime execution fails', async () => {
    const runtimeStore = new InMemoryStore()
    const service = new ApplicationService({
      store: runtimeStore,
      runtime: new UnavailableExplorationRuntimeGateway(),
      queue: new InMemoryDesignJobQueue(),
      consumeQueue: false,
    })
    const ctx = {
      requestId: 'req_runtime_unavailable_exploration',
      userId: runtimeStore.devUser.id,
      adminRole: null,
      authMode: 'dev' as const,
      authSessionTokenHash: null,
    }
    const session = await service.createSession(ctx, {
      workspaceId: runtimeStore.devWorkspace.id,
      title: 'Unavailable runtime exploration fixture',
      mode: 'new_html',
    })
    const created = await service.createDesignJob(ctx, {
      sessionId: session.session.id,
      prompt: 'Generate controlled directions while runtime is unavailable.',
      sourceMode: 'new_html',
      variationCount: 3,
      requirementModuleGraphId: starGroupRequirementModuleGraph.id,
      exploration: { level: 40 },
    })
    const storedJob = await runtimeStore.getJobById(created.job.id)
    assert.ok(storedJob)
    await service.processQueuedDesignJob({
      jobId: created.job.id,
      sessionId: session.session.id,
      variationIds: created.variations.map(variation => variation.id),
      sourceArtifactId: null,
      runtimeSessionId: session.session.runtimeSessionId,
      modelServiceId: String(storedJob.templateRequirements.modelServiceId),
      idempotencyKey: `test:runtime-unavailable-exploration:${created.job.id}`,
      userId: runtimeStore.devUser.id,
      workspaceId: runtimeStore.devWorkspace.id,
      createdAt: new Date().toISOString(),
    })

    const snapshot = await service.getDesignJob(ctx, created.job.id)
    assert.deepEqual(snapshot.job.explorationPlan, created.job.explorationPlan)
    assert.deepEqual(
      snapshot.variations.map(variation => variation.explorationPlan?.variationIndex),
      [1, 2, 3],
    )
    assert.ok(snapshot.variations.every(variation => variation.status === 'failed'))
  })

  function ownerContext() {
    return {
      requestId: 'req_exploration_restart',
      userId: store.devUser.id,
      adminRole: null,
      authMode: 'dev' as const,
      authSessionTokenHash: null,
    }
  }

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`)
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function expectApiError(
    path: string,
    body: unknown,
    expectedStatus: number,
    expectedCode: string,
  ): Promise<void> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, expectedStatus)
    const result = await response.json() as { error: { code: string } }
    assert.equal(result.error.code, expectedCode)
  }
})

class CapturingMockRuntimeGateway extends MockRuntimeGateway {
  readonly spawnInputs: SpawnVariationAgentsInput[] = []
  readonly refineInputs: RefineVariationInput[] = []

  override async *spawnVariationAgents(input: SpawnVariationAgentsInput) {
    this.spawnInputs.push(input)
    yield* super.spawnVariationAgents(input)
  }

  override async *refineVariation(input: RefineVariationInput) {
    this.refineInputs.push(input)
    yield* super.refineVariation(input)
  }
}

class UnavailableExplorationRuntimeGateway extends MockRuntimeGateway {
  override async *spawnVariationAgents(_input: SpawnVariationAgentsInput) {
    throw new Error('Runtime unavailable during controlled exploration test.')
    yield undefined as never
  }
}
