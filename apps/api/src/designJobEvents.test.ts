import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'
import type {
  RuntimeGateway,
  SpawnVariationAgentsInput,
  RefineVariationInput,
  CreateRuntimeSessionInput,
  ResumeRuntimeSessionInput,
  CancelRuntimeJobInput,
} from '@dudesign/runtime-gateway'
import type { CreateDesignJobResponse, CreateSessionResponse, DesignJobSnapshotResponse } from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { JobEventBus } from './eventBus.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { InMemoryDesignJobQueue, type QueueJobState, type ScreenshotJobQueuePayload } from './designJobQueue.js'

describe('Design job event persistence and partial failures', () => {
  let harness: ApiFlowHarness | null = null

  after(async () => {
    await harness?.close()
  })

  it('replays persisted job events through SSE after the producing event bus is gone', async () => {
    const store = new InMemoryStore()
    const producingService = new ApplicationService({
      store,
      runtime: new ControlledRuntimeGateway('all-complete'),
      queue: new NoopScreenshotQueue(),
    })
    const bootstrapHarness = await startApiFlowHarness(producingService)
    try {
      const bootstrap = await getJson<{ workspace: { id: string } }>(bootstrapHarness, '/api/dev/bootstrap')
      const session = await postJson<CreateSessionResponse>(bootstrapHarness, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: 'Persisted SSE replay',
      })
      const job = await postJson<CreateDesignJobResponse>(bootstrapHarness, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: 'Persist job events for replay',
        sourceMode: 'new_html',
        variationCount: 1,
        capabilityRequirements: {
          automation: {
            loopProfileId: 'loop_standard',
            maxRepairAttempts: 1,
          },
        },
        templateRequirements: {},
      })
      await waitForJob(bootstrapHarness, job.job.id, 'completed')
      await producingService.flushBackgroundTasks()
      const persistedEvents = await store.listDesignEvents(job.job.id)
      assert.equal(persistedEvents.some(event => event.type === 'design.job_completed'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_started'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_quality_checked'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_completed'), true)

      harness = await startApiFlowHarness(new ApplicationService({
        store,
        events: new JobEventBus(),
        runtime: new ControlledRuntimeGateway('all-complete'),
        queue: new NoopScreenshotQueue(),
      }))
      const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
      assert.match(streamText, /design\.variation_streaming/)
      assert.match(streamText, /design\.loop_quality_checked/)
      assert.match(streamText, /design\.loop_completed/)
      assert.match(streamText, /design\.job_completed/)
    } finally {
      await harness?.close()
      harness = null
      await bootstrapHarness.close()
    }
  })

  it('marks mixed variation outcomes as a completed job with failed variation count', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('partial-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Partial failure job',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'One variation succeeds and one variation fails',
      sourceMode: 'new_html',
      variationCount: 2,
      templateRequirements: {},
    })
    const snapshot = await waitForJob(harness, job.job.id, 'completed')
    assert.equal(snapshot.variations.filter(variation => variation.status === 'completed').length, 1)
    assert.equal(snapshot.variations.filter(variation => variation.status === 'failed').length, 1)

    const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
    assert.match(streamText, /design\.variation_failed/)
    assert.match(streamText, /"completedVariationCount":1/)
    assert.match(streamText, /"failedVariationCount":1/)
    await harness.close()
    harness = null
  })

  it('runs one automation repair when generated artifact fails the static gate and attempts remain', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop repair planning',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should trigger static repair planning',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecks = events.filter(event => event.type === 'design.loop_quality_checked')
    const repairPlanned = events.find(event => event.type === 'design.loop_repair_planned')
    const repairStarted = events.find(event => event.type === 'design.loop_repair_started')
    const completed = events.find(event => event.type === 'design.loop_completed')
    assert.equal(qualityChecks[0]?.payload.status, 'fail')
    assert.equal(qualityChecks[1]?.payload.status, 'pass')
    assert.equal(repairPlanned?.payload.attempt, 1)
    assert.match(repairPlanned?.payload.promptPreview ?? '', /DUDesign automatic repair request/)
    assert.match(repairPlanned?.payload.promptPreview ?? '', /Body is empty/)
    assert.equal(repairStarted?.payload.artifactId, repairPlanned?.payload.artifactId)
    assert.equal(completed?.payload.attempts, 1)
    const repairQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(repairQueueState?.kind, 'refine_job')
    assert.equal(repairQueueState?.status, 'completed')

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 2)

    await harness.close()
    harness = null
  })

  it('stops automation repair at max attempts when repaired artifact still fails', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure-still-fails'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop max attempts',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should fail after one automatic repair.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecks = events.filter(event => event.type === 'design.loop_quality_checked')
    const repairStartedEvents = events.filter(event => event.type === 'design.loop_repair_started')
    const stopped = events.find(event => event.type === 'design.loop_stopped')
    const completed = events.find(event => event.type === 'design.loop_completed')

    assert.deepEqual(qualityChecks.map(event => event.payload.status), ['fail', 'fail'])
    assert.equal(repairStartedEvents.length, 1)
    assert.equal(stopped?.payload.reason, 'max_attempts_reached')
    assert.equal(stopped?.payload.attempts, 1)
    assert.equal(completed, undefined)

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 2)

    await harness.close()
    harness = null
  })

  it('marks queued automation repair failed when runtime refine is unavailable', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure-runtime-unavailable'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop runtime unavailable',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should fail repair because runtime refine is unavailable.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const repairPlanned = events.find(event => event.type === 'design.loop_repair_planned')
    const repairStarted = events.find(event => event.type === 'design.loop_repair_started')
    const stopped = events.find(event => event.type === 'design.loop_stopped')
    const completed = events.find(event => event.type === 'design.loop_completed')

    assert.equal(repairStarted?.payload.artifactId, repairPlanned?.payload.artifactId)
    assert.equal(stopped?.payload.reason, 'runtime_unavailable')
    assert.equal(stopped?.payload.recoverable, true)
    assert.match(stopped?.payload.message ?? '', /Runtime refine unavailable/)
    assert.equal(completed, undefined)

    const repairQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(repairQueueState?.kind, 'refine_job')
    assert.equal(repairQueueState?.status, 'failed')
    assert.equal(repairQueueState?.errorCode, 'QUEUE_CONSUMER_FAILED')
    assert.match(repairQueueState?.errorMessage ?? '', /Runtime refine unavailable/)

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 1)

    await harness.close()
    harness = null
  })
})

class NoopScreenshotQueue extends InMemoryDesignJobQueue {
  override async enqueueScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<QueueJobState> {
    return {
      idempotencyKey: payload.idempotencyKey,
      kind: 'screenshot_job',
      status: 'completed',
      enqueuedAt: payload.createdAt,
      startedAt: payload.createdAt,
      completedAt: payload.createdAt,
      failedAt: null,
      cancelledAt: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
    }
  }
}

class ControlledRuntimeGateway implements RuntimeGateway {
  constructor(private readonly mode: 'all-complete' | 'partial-failure' | 'quality-failure' | 'quality-failure-still-fails' | 'quality-failure-runtime-unavailable') {}

  async getRuntimeHealth() {
    return {
      status: 'compatible' as const,
      runtime: 'babel-o' as const,
      runtimeVersion: 'test',
      contractVersion: 'test',
      checkedAt: new Date().toISOString(),
    }
  }

  async getRuntimeContract() {
    return {
      runtime: 'babel-o' as const,
      runtimeVersion: 'test',
      contractVersion: 'test',
      status: 'compatible' as const,
      requiredEndpoints: [],
      requiredEvents: [],
      eventMappings: {},
    }
  }

  async listRuntimeModels() {
    return {
      type: 'runtime_models' as const,
      version: 'test',
      providers: [],
      defaultModel: null,
      syncedAt: new Date().toISOString(),
    }
  }

  async createSession(_input: CreateRuntimeSessionInput) {
    return { runtimeSessionId: 'runtime_test_session' }
  }

  async resumeSession(_input: ResumeRuntimeSessionInput) {
    return { status: 'resumed' as const, runtimeSessionId: 'runtime_test_session' }
  }

  async *spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    yield createDesignEvent({
      type: 'design.variation_streaming',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: 'runtime_variation_1',
      payload: { channel: 'assistant', delta: 'building first variation' },
    })
    yield createDesignEvent({
      type: 'design.variation_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: 'runtime_variation_1',
      payload: {
        html: this.mode === 'quality-failure' || this.mode === 'quality-failure-still-fails' || this.mode === 'quality-failure-runtime-unavailable'
          ? '<!doctype html><html><body></body></html>'
          : '<!doctype html><html><body><main><h1>Completed variation</h1><p>This completed variation has enough visible content to pass the static quality gate.</p></main></body></html>',
        changedPaths: ['index.html'],
        inputTokens: 10,
        outputTokens: 20,
        costCents: 1,
      },
    })
    if (this.mode === 'partial-failure') {
      yield createDesignEvent({
        type: 'design.variation_failed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: 'runtime_variation_2',
        payload: {
          errorCode: 'RUNTIME_CHILD_FAILED',
          message: 'Second variation failed in controlled runtime.',
          recoverable: true,
        },
      })
    }
  }

  async *refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent> {
    if (this.mode === 'quality-failure-runtime-unavailable') {
      throw new Error('Runtime refine unavailable in controlled test.')
    }
    yield createDesignEvent({
      type: 'design.variation_streaming',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        channel: 'assistant',
        delta: 'repairing static quality issues',
      },
    })
    yield createDesignEvent({
      type: 'design.variation_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        html: this.mode === 'quality-failure-still-fails'
          ? '<!doctype html><html><body></body></html>'
          : '<!doctype html><html><body><main><h1>Repaired variation</h1><p>The automatic repair added visible page content and preserved the user goal.</p></main></body></html>',
        changedPaths: ['index.html'],
        inputTokens: 5,
        outputTokens: 10,
        costCents: 1,
      },
    })
  }

  async cancelRuntimeJob(_input: CancelRuntimeJobInput) {
    return { cancelled: true }
  }
}

async function waitForJob(
  harness: ApiFlowHarness,
  jobId: string,
  status: DesignJobSnapshotResponse['job']['status'],
): Promise<DesignJobSnapshotResponse> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2000) {
    const snapshot = await getJson<DesignJobSnapshotResponse>(harness, `/api/design-jobs/${jobId}`)
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
