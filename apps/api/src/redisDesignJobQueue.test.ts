import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { designJobQueueJobNames, type DesignJobQueuePayload } from './designJobQueue.js'
import { createDesignJobQueueFromEnv } from './serviceFactory.js'
import {
  createRedisDesignJobQueueFromEnv,
  createRedisQueueReliabilityPolicy,
  queueStateFromBullJob,
  queueStatusFromBullState,
} from './redisDesignJobQueue.js'

describe('RedisDesignJobQueue configuration', () => {
  it('maps BullMQ states into DUDesign queue states', () => {
    assert.equal(queueStatusFromBullState('waiting'), 'queued')
    assert.equal(queueStatusFromBullState('delayed'), 'queued')
    assert.equal(queueStatusFromBullState('active'), 'running')
    assert.equal(queueStatusFromBullState('completed'), 'completed')
    assert.equal(queueStatusFromBullState('failed'), 'failed')
    assert.equal(queueStatusFromBullState('unknown'), 'cancelled')
  })

  it('normalizes a BullMQ job snapshot without exposing BullMQ internals', () => {
    const job = {
      data: { kind: 'design_job', payload: designPayload('job_1') },
      timestamp: Date.parse('2026-06-30T00:00:00.000Z'),
      processedOn: Date.parse('2026-06-30T00:00:01.000Z'),
      finishedOn: Date.parse('2026-06-30T00:00:02.000Z'),
      attemptsMade: 1,
      failedReason: undefined,
    }

    const state = queueStateFromBullJob(job as never, 'completed')

    assert.deepEqual(state, {
      idempotencyKey: 'queue:design-job:job_1',
      kind: 'design_job',
      status: 'completed',
      enqueuedAt: '2026-06-30T00:00:00.000Z',
      startedAt: '2026-06-30T00:00:01.000Z',
      completedAt: '2026-06-30T00:00:02.000Z',
      failedAt: null,
      cancelledAt: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
    })
  })

  it('marks timeout failures with a stable queue error code', () => {
    const job = {
      data: { kind: 'design_job', payload: designPayload('job_timeout') },
      timestamp: Date.parse('2026-06-30T00:00:00.000Z'),
      processedOn: Date.parse('2026-06-30T00:00:01.000Z'),
      finishedOn: Date.parse('2026-06-30T00:00:02.000Z'),
      attemptsMade: 2,
      failedReason: 'QUEUE_JOB_TIMEOUT: Queue job exceeded 10ms.',
    }

    const state = queueStateFromBullJob(job as never, 'failed')

    assert.equal(state.status, 'failed')
    assert.equal(state.errorCode, 'QUEUE_JOB_TIMEOUT')
    assert.equal(state.attempts, 2)
  })

  it('exposes the Redis queue reliability policy', () => {
    const policy = createRedisQueueReliabilityPolicy({
      connection: { url: 'redis://127.0.0.1:6379' },
      attempts: 3,
      backoffMs: 250,
      jobTimeoutMs: 1000,
      removeOnFail: false,
    })

    assert.deepEqual(policy, {
      attempts: 3,
      backoffMs: 250,
      jobTimeoutMs: 1000,
      dedupe: 'jobId:idempotencyKey',
      deadLetter: 'bullmq:failed-set',
      removeOnComplete: false,
      removeOnFail: false,
    })
  })

  it('keeps InMemory queue as the default provider', () => {
    const previousQueue = process.env.DUDESIGN_QUEUE
    const previousProvider = process.env.DUDESIGN_QUEUE_PROVIDER
    delete process.env.DUDESIGN_QUEUE
    delete process.env.DUDESIGN_QUEUE_PROVIDER
    try {
      const queue = createDesignJobQueueFromEnv()
      assert.equal(queue.constructor.name, 'InMemoryDesignJobQueue')
    } finally {
      restoreEnv('DUDESIGN_QUEUE', previousQueue)
      restoreEnv('DUDESIGN_QUEUE_PROVIDER', previousProvider)
    }
  })

  it('requires Redis URL when the Redis provider is selected', () => {
    assert.throws(
      () => createRedisDesignJobQueueFromEnv({ DUDESIGN_QUEUE: 'redis' } as NodeJS.ProcessEnv),
      /REDIS_URL or DUDESIGN_REDIS_URL is required/,
    )
  })

  it('keeps stable job names for cross-process producers and workers', () => {
    assert.equal(designJobQueueJobNames.designJob, 'design_job')
    assert.equal(designJobQueueJobNames.refineJob, 'refine_job')
    assert.equal(designJobQueueJobNames.screenshotJob, 'screenshot_job')
  })
})

function designPayload(jobId: string): DesignJobQueuePayload {
  return {
    jobId,
    sessionId: 'ses_1',
    variationIds: ['var_1'],
    sourceArtifactId: null,
    runtimeSessionId: 'rt_1',
    modelServiceId: 'mdl_1',
    idempotencyKey: `queue:design-job:${jobId}`,
    userId: 'usr_1',
    workspaceId: 'wsp_1',
    createdAt: '2026-06-30T00:00:00.000Z',
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
