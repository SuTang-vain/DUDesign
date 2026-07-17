import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { Pool } from 'pg'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import { createDesignEvent } from '@dudesign/contracts'
import type { CreateDesignJobResponse, CreateSessionResponse, VariationDetailResponse } from '@dudesign/contracts'
import {
  MockRuntimeGateway,
  type CancelRuntimeJobInput,
  type CancelRuntimeJobResult,
  type RuntimeRefineOperationInput,
  type RuntimeRefineOperationSnapshot,
} from '@dudesign/runtime-gateway'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { PostgresRepository } from './postgresRepository.js'
import { closePooledChromiumBrowser } from './playwrightBrowserPool.js'
import { RefineOperationReconciler } from './refineOperationReconciler.js'
import { ApplicationService } from './service.js'

const POSTGRES_TEST_URL = process.env.DUDESIGN_POSTGRES_TEST_URL

describe('Postgres refine operation restart reconciliation', { skip: !POSTGRES_TEST_URL }, () => {
  const schema = `dudesign_refine_reconcile_${Date.now().toString(36)}`
  let artifactRoot = ''
  let firstRepository: PostgresRepository
  let firstHarness: ApiFlowHarness

  before(async () => {
    artifactRoot = await mkdtemp(join(tmpdir(), 'dudesign-refine-reconcile-pg-'))
    firstRepository = await PostgresRepository.connect({ connectionString: POSTGRES_TEST_URL!, schema })
    firstHarness = await startApiFlowHarness(new ApplicationService({
      store: firstRepository,
      artifacts: new LocalArtifactStore({ rootDir: artifactRoot }),
    }))
  })

  after(async () => {
    await firstHarness?.close().catch(() => undefined)
    await firstRepository?.close().catch(() => undefined)
    const pool = new Pool({ connectionString: POSTGRES_TEST_URL! })
    try {
      await pool.query(`drop schema if exists ${schema} cascade`)
    } finally {
      await pool.end()
      await rm(artifactRoot, { recursive: true, force: true })
    }
  })

  it('recovers completion and cancellation after recreating the API repository', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>(firstHarness.baseUrl, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(firstHarness.baseUrl, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Postgres restart reconcile fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>(firstHarness.baseUrl, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create two persisted refine operations.',
      sourceMode: 'new_html',
      productMode: 'web_app',
      variationCount: 2,
    })
    await firstHarness.service.flushBackgroundTasks()

    const details = await Promise.all(created.variations.map(variation => (
      getJson<VariationDetailResponse>(firstHarness.baseUrl, `/api/variations/${variation.id}`)
    )))
    const now = new Date().toISOString()
    for (const [index, detail] of details.entries()) {
      assert.ok(detail.currentArtifact)
      const variation = await firstRepository.getVariationById(detail.variation.id)
      assert.ok(variation)
      await firstRepository.createRefineOperation({
        requestId: index === 0 ? 'rfn_pg_restart_complete' : 'rfn_pg_restart_cancel',
        kind: 'prompt',
        prompt: index === 0 ? 'Complete after restart.' : 'Cancel after restart.',
        variationId: detail.variation.id,
        jobId: created.job.id,
        sessionId: session.session.id,
        workspaceId: bootstrap.workspace.id,
        userId: firstRepository.devUser.id,
        baseArtifactId: detail.currentArtifact.id,
        basePreviewUrl: detail.variation.previewUrl,
        runtimeChildSessionId: variation.runtimeChildSessionId,
        runtimeAgentJobId: variation.runtimeAgentJobId,
        status: index === 0 ? 'running' : 'cancelling',
        cancelRequested: index === 1,
        cancelReason: index === 1 ? 'Persisted user cancellation.' : null,
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
    }

    await firstHarness.close()
    await firstRepository.close()

    const restartedRepository = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
      hydrateOnStart: true,
    })
    const runtime = new PostgresRestartRecoveryRuntimeGateway()
    const restartedService = new ApplicationService({
      store: restartedRepository,
      runtime,
      artifacts: new LocalArtifactStore({ rootDir: artifactRoot }),
    })
    try {
      const reconciler = new RefineOperationReconciler(restartedService, { ownerId: 'pg-restart-reconciler', orphanAfterMs: 0 })
      const summary = await reconciler.runOnce()
      assert.deepEqual(summary, { claimed: 2, completed: 1, failed: 0, cancelled: 1, deferred: 0 })
      assert.equal((await restartedRepository.getRefineOperationById('rfn_pg_restart_complete'))?.status, 'completed')
      assert.equal((await restartedRepository.getRefineOperationById('rfn_pg_restart_cancel'))?.status, 'cancelled')
      assert.equal(runtime.cancelInputs.length, 1)
      const completedDetail = await restartedService.getVariationDetail({
        requestId: 'req_pg_reconcile_detail',
        userId: restartedRepository.devUser.id,
        adminRole: null,
      }, details[0]!.variation.id)
      assert.equal(completedDetail.currentArtifact?.version, 2)
      const cancelledDetail = await restartedService.getVariationDetail({
        requestId: 'req_pg_reconcile_cancelled_detail',
        userId: restartedRepository.devUser.id,
        adminRole: null,
      }, details[1]!.variation.id)
      assert.equal(cancelledDetail.currentArtifact?.id, details[1]!.currentArtifact!.id)
    } finally {
      await restartedService.flushBackgroundTasks()
      await closePooledChromiumBrowser()
      await restartedRepository.close()
    }
  })
})

class PostgresRestartRecoveryRuntimeGateway extends MockRuntimeGateway {
  readonly cancelInputs: CancelRuntimeJobInput[] = []

  async getRefineOperation(input: RuntimeRefineOperationInput): Promise<RuntimeRefineOperationSnapshot> {
    if (input.requestId === 'rfn_pg_restart_complete') {
      return {
        status: 'completed',
        terminalEvent: createDesignEvent({
          type: 'design.variation_completed',
          requestId: input.requestId,
          sessionId: input.sessionId,
          jobId: input.jobId,
          variationId: input.variationId,
          payload: {
            artifactId: 'babel_o_pg_restart_recovered',
            entryPath: 'index.html',
            html: '<!doctype html><main><h1>Postgres restart recovered</h1></main>',
          },
        }),
      }
    }
    return { status: 'running' }
  }

  override async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    this.cancelInputs.push(input)
    return { cancelled: true, cancelledVariationCount: 1, failedVariationCount: 0 }
  }
}

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`)
  if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
  return response.json() as Promise<T>
}
