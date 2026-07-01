import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  InMemoryDesignJobQueue,
  type DesignJobQueuePayload,
  type ScreenshotJobQueuePayload,
} from './designJobQueue.js'

describe('InMemoryDesignJobQueue', () => {
  it('dedupes design jobs by idempotency key and runs the consumer', async () => {
    const queue = new InMemoryDesignJobQueue()
    const consumed: string[] = []
    queue.setConsumer({
      async runDesignJob(payload) {
        consumed.push(payload.jobId)
      },
      async runRefineJob() {
        throw new Error('unexpected refine job')
      },
      async runScreenshotJob() {
        throw new Error('unexpected screenshot job')
      },
    })
    const payload = designPayload('job_1')

    const first = await queue.enqueueDesignJob(payload)
    const second = await queue.enqueueDesignJob(payload)
    await queue.flush()
    const final = await queue.getJobState(payload.idempotencyKey)

    assert.equal(first.idempotencyKey, second.idempotencyKey)
    assert.deepEqual(consumed, ['job_1'])
    assert.equal(final?.status, 'completed')
    assert.equal(final?.attempts, 1)
  })

  it('can cancel queued jobs before a consumer is attached', async () => {
    const queue = new InMemoryDesignJobQueue()
    const payload = designPayload('job_cancel')

    await queue.enqueueDesignJob(payload)
    const cancelled = await queue.cancelJob(payload.idempotencyKey, 'user requested cancel')

    assert.equal(cancelled?.status, 'cancelled')
    assert.equal(cancelled?.errorCode, 'QUEUE_CANCELLED')
    assert.equal((await queue.getJobState(payload.idempotencyKey))?.status, 'cancelled')
  })

  it('dedupes screenshot jobs by artifact idempotency key', async () => {
    const queue = new InMemoryDesignJobQueue()
    const consumed: string[] = []
    queue.setConsumer({
      async runDesignJob() {
        throw new Error('unexpected design job')
      },
      async runRefineJob() {
        throw new Error('unexpected refine job')
      },
      async runScreenshotJob(payload) {
        consumed.push(payload.artifactId)
      },
    })
    const payload = screenshotPayload('art_1')

    await queue.enqueueScreenshotJob(payload)
    await queue.enqueueScreenshotJob(payload)
    await queue.flush()

    assert.deepEqual(consumed, ['art_1'])
    assert.equal((await queue.getJobState(payload.idempotencyKey))?.status, 'completed')
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

function screenshotPayload(artifactId: string): ScreenshotJobQueuePayload {
  return {
    jobId: 'job_1',
    sessionId: 'ses_1',
    variationId: 'var_1',
    artifactId,
    idempotencyKey: `queue:screenshot:repair_requested:${artifactId}`,
    userId: 'usr_1',
    workspaceId: 'wsp_1',
    source: 'repair',
    reason: 'repair_requested',
    createdAt: '2026-06-30T00:00:00.000Z',
  }
}
