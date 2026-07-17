import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  CancelVariationRefineResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  GetVariationRefineOperationResponse,
  RefineVariationResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'
import { createDesignEvent } from '@dudesign/contracts'
import {
  MockRuntimeGateway,
  type CancelRuntimeJobInput,
  type CancelRuntimeJobResult,
  type RefineVariationInput,
  type RuntimeRefineOperationInput,
  type RuntimeRefineOperationSnapshot,
} from '@dudesign/runtime-gateway'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { InMemoryStore } from './store.js'
import { RefineOperationReconciler } from './refineOperationReconciler.js'

describe('variation refine cancellation API flow', () => {
  let harness: ApiFlowHarness
  let runtime: BlockingRefineRuntimeGateway

  before(async () => {
    runtime = new BlockingRefineRuntimeGateway()
    harness = await startApiFlowHarness(new ApplicationService({ runtime }))
  })

  after(async () => {
    await harness.close()
  })

  it('cancels one active refine idempotently and preserves the previous artifact', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Refine cancellation fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create a cancellable design refinement fixture.',
      sourceMode: 'new_html',
      productMode: 'web_app',
      variationCount: 1,
    })
    await harness.service.flushBackgroundTasks()

    const variationId = created.variations[0]!.id
    const before = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
    assert.ok(before.currentArtifact)
    const baseArtifactId = before.currentArtifact.id
    const requestId = 'rfn_api_cancel_1'

    const refinePromise = postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
      requestId,
      prompt: 'Change the visual hierarchy, but stop before completion.',
      baseArtifactId,
    })
    await runtime.waitUntilRefineStarted()

    const running = await getJson<GetVariationRefineOperationResponse>(
      `/api/variations/${variationId}/refine-operation?requestId=${requestId}`,
    )
    assert.equal(running.operation?.status, 'running')
    assert.equal(running.operation?.prompt, 'Change the visual hierarchy, but stop before completion.')

    const cancelled = await postJson<CancelVariationRefineResponse>(
      `/api/variations/${variationId}/refine/${requestId}/cancel`,
      { reason: 'User pressed stop in the editor.' },
    )
    const refined = await refinePromise

    assert.equal(cancelled.status, 'cancelled')
    assert.equal(cancelled.runtime.cancelled, true)
    assert.equal(refined.requestId, requestId)
    assert.equal(refined.variation.status, 'cancelled')
    assert.equal(refined.variation.currentArtifactId, baseArtifactId)
    assert.equal(runtime.cancelInputs[0]?.requestId, requestId)

    const after = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
    assert.equal(after.variation.status, 'completed')
    assert.equal(after.currentArtifact?.id, baseArtifactId)

    const repeated = await postJson<CancelVariationRefineResponse>(
      `/api/variations/${variationId}/refine/${requestId}/cancel`,
      { reason: 'Repeated click' },
    )
    assert.equal(repeated.status, 'cancelled')
    assert.equal(runtime.cancelInputs.length, 1)

    const persisted = await getJson<GetVariationRefineOperationResponse>(
      `/api/variations/${variationId}/refine-operation?requestId=${requestId}`,
    )
    assert.equal(persisted.operation?.status, 'cancelled')
    assert.equal(persisted.operation?.baseArtifactId, baseArtifactId)
  })

  it('allows a second application service replica to query and cancel the persisted operation', async () => {
    const sharedStore = new InMemoryStore()
    const sharedRuntime = new BlockingRefineRuntimeGateway()
    const first = await startApiFlowHarness(new ApplicationService({ store: sharedStore, runtime: sharedRuntime }))
    const second = await startApiFlowHarness(new ApplicationService({ store: sharedStore, runtime: sharedRuntime }))
    try {
      const bootstrap = await getJsonAt<{ workspace: { id: string } }>(first.baseUrl, '/api/dev/bootstrap')
      const session = await postJsonAt<CreateSessionResponse>(first.baseUrl, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        title: 'Replica refine operation fixture',
        mode: 'new_html',
      })
      const created = await postJsonAt<CreateDesignJobResponse>(first.baseUrl, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: 'Create a shared refine operation fixture.',
        sourceMode: 'new_html',
        productMode: 'web_app',
        variationCount: 1,
      })
      await first.service.flushBackgroundTasks()
      const variationId = created.variations[0]!.id
      const detail = await getJsonAt<VariationDetailResponse>(first.baseUrl, `/api/variations/${variationId}`)
      const requestId = 'rfn_replica_cancel_1'
      const refinePromise = postJsonAt<RefineVariationResponse>(first.baseUrl, `/api/variations/${variationId}/refine`, {
        requestId,
        prompt: 'Start on replica one and cancel from replica two.',
        baseArtifactId: detail.currentArtifact!.id,
      })
      await sharedRuntime.waitUntilRefineStarted()

      const observed = await getJsonAt<GetVariationRefineOperationResponse>(
        second.baseUrl,
        `/api/variations/${variationId}/refine-operation?requestId=${requestId}`,
      )
      assert.equal(observed.operation?.status, 'running')

      const cancelled = await postJsonAt<CancelVariationRefineResponse>(
        second.baseUrl,
        `/api/variations/${variationId}/refine/${requestId}/cancel`,
        { reason: 'Cancelled from replica two.' },
      )
      assert.equal(cancelled.status, 'cancelled')
      assert.equal((await refinePromise).variation.status, 'cancelled')
    } finally {
      await Promise.all([first.close(), second.close()])
    }
  })

  it('leases one persisted operation and completes it after an application restart', async () => {
    const sharedStore = new InMemoryStore()
    const bootstrapService = new ApplicationService({ store: sharedStore })
    const bootstrapHarness = await startApiFlowHarness(bootstrapService)
    try {
      const bootstrap = await getJsonAt<{ workspace: { id: string } }>(bootstrapHarness.baseUrl, '/api/dev/bootstrap')
      const session = await postJsonAt<CreateSessionResponse>(bootstrapHarness.baseUrl, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        title: 'Reconciler restart fixture',
        mode: 'new_html',
      })
      const created = await postJsonAt<CreateDesignJobResponse>(bootstrapHarness.baseUrl, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: 'Create a persisted refine reconciler fixture.',
        sourceMode: 'new_html',
        productMode: 'web_app',
        variationCount: 1,
      })
      await bootstrapService.flushBackgroundTasks()
      const variationId = created.variations[0]!.id
      const before = await getJsonAt<VariationDetailResponse>(bootstrapHarness.baseUrl, `/api/variations/${variationId}`)
      assert.ok(before.currentArtifact)
      const persistedVariation = await sharedStore.getVariationById(variationId)
      assert.ok(persistedVariation)
      const now = new Date().toISOString()
      await sharedStore.createRefineOperation({
        requestId: 'rfn_reconcile_restart_1',
        kind: 'prompt',
        prompt: 'Complete this operation after the API restarts.',
        variationId,
        jobId: created.job.id,
        sessionId: session.session.id,
        workspaceId: bootstrap.workspace.id,
        userId: sharedStore.devUser.id,
        baseArtifactId: before.currentArtifact.id,
        basePreviewUrl: before.variation.previewUrl,
        runtimeChildSessionId: persistedVariation.runtimeChildSessionId,
        runtimeAgentJobId: persistedVariation.runtimeAgentJobId,
        status: 'running',
        cancelRequested: false,
        cancelReason: null,
        runtimeCancelResult: null,
        cancellationRecorded: false,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        reconcileOwner: null,
        reconcileLeaseUntil: null,
        reconcileAttempts: 0,
        lastReconcileError: null,
      })

      const recoveryRuntime = new CompletedRefineRecoveryRuntimeGateway()
      const firstReplica = new ApplicationService({ store: sharedStore, runtime: recoveryRuntime })
      const secondReplica = new ApplicationService({ store: sharedStore, runtime: recoveryRuntime })
      const firstReconciler = new RefineOperationReconciler(firstReplica, { ownerId: 'reconciler-a', orphanAfterMs: 0 })
      const secondReconciler = new RefineOperationReconciler(secondReplica, { ownerId: 'reconciler-b', orphanAfterMs: 0 })
      const results = await Promise.all([firstReconciler.runOnce(), secondReconciler.runOnce()])

      assert.equal(results[0].claimed + results[1].claimed, 1)
      const operation = await sharedStore.getRefineOperationById('rfn_reconcile_restart_1')
      assert.equal(operation?.status, 'completed')
      assert.equal(operation?.reconcileOwner, null)
      assert.equal(recoveryRuntime.queryCount, 1)
      const after = await getJsonAt<VariationDetailResponse>(bootstrapHarness.baseUrl, `/api/variations/${variationId}`)
      assert.equal(after.currentArtifact?.version, 2)
      const artifactRecord = await sharedStore.getArtifactById(after.currentArtifact!.id)
      assert.ok(artifactRecord)
      const artifactBody = await bootstrapService.artifacts.get(artifactRecord.storageKey)
      assert.match(new TextDecoder().decode(artifactBody.body), /Recovered refine result/)
    } finally {
      await bootstrapHarness.close()
    }
  })

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
})

async function getJsonAt<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`)
  if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function postJsonAt<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}

class BlockingRefineRuntimeGateway extends MockRuntimeGateway {
  readonly cancelInputs: CancelRuntimeJobInput[] = []
  private startedResolve!: () => void
  private cancelResolve!: () => void
  private started = new Promise<void>(resolve => { this.startedResolve = resolve })
  private cancelled = new Promise<void>(resolve => { this.cancelResolve = resolve })

  waitUntilRefineStarted(): Promise<void> {
    return this.started
  }

  override async *refineVariation(input: RefineVariationInput) {
    this.startedResolve()
    yield {
      schemaVersion: '2026-06-26.dudesign-event.v1' as const,
      type: 'design.variation_streaming' as const,
      timestamp: new Date().toISOString(),
      requestId: input.requestId,
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: { channel: 'assistant' as const, delta: 'Refine started.' },
    }
    await this.cancelled
  }

  override async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    this.cancelInputs.push(input)
    this.cancelResolve()
    return {
      cancelled: true,
      message: `Cancelled refine ${input.requestId}.`,
      cancelledVariationCount: 1,
      failedVariationCount: 0,
    }
  }
}

class CompletedRefineRecoveryRuntimeGateway extends MockRuntimeGateway {
  queryCount = 0

  async getRefineOperation(input: RuntimeRefineOperationInput): Promise<RuntimeRefineOperationSnapshot> {
    this.queryCount += 1
    return {
      status: 'completed',
      terminalEvent: createDesignEvent({
        type: 'design.variation_completed',
        requestId: input.requestId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
        payload: {
          artifactId: 'babel_o_recovered_refine',
          entryPath: 'index.html',
          html: '<!doctype html><main><h1>Recovered refine result</h1></main>',
        },
      }),
    }
  }
}
