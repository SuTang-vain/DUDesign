import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  InMemoryDesignJobQueue,
  type DesignJobQueuePayload,
  type RefineJobQueuePayload,
  type ScreenshotJobQueuePayload,
} from './designJobQueue.js'
import { ApplicationDesignJobWorker, attachDesignJobWorker } from './designJobWorker.js'

describe('ApplicationDesignJobWorker', () => {
  it('delegates design and refine payloads to the processor boundary', async () => {
    const calls: string[] = []
    const worker = new ApplicationDesignJobWorker({
      async processQueuedDesignJob(payload) {
        calls.push(`design:${payload.jobId}`)
      },
      async processQueuedRefineJob(payload) {
        calls.push(`refine:${payload.variationId}`)
      },
      async processQueuedScreenshotJob(payload) {
        calls.push(`screenshot:${payload.artifactId}`)
      },
    })

    await worker.runDesignJob(designPayload('job_1'))
    await worker.runRefineJob(refinePayload('refine_1'))
    await worker.runScreenshotJob(screenshotPayload('art_1'))

    assert.deepEqual(calls, ['design:job_1', 'refine:var_refine_1', 'screenshot:art_1'])
  })

  it('can attach after enqueue and consume pending jobs', async () => {
    const queue = new InMemoryDesignJobQueue()
    const payload = designPayload('job_pending')
    const consumed: string[] = []

    await queue.enqueueDesignJob(payload)
    assert.equal((await queue.getJobState(payload.idempotencyKey))?.status, 'queued')

    attachDesignJobWorker(queue, {
      async processQueuedDesignJob(queuedPayload) {
        consumed.push(queuedPayload.jobId)
      },
      async processQueuedRefineJob() {
        throw new Error('unexpected refine job')
      },
      async processQueuedScreenshotJob() {
        throw new Error('unexpected screenshot job')
      },
    })
    await queue.flush()

    assert.deepEqual(consumed, ['job_pending'])
    assert.equal((await queue.getJobState(payload.idempotencyKey))?.status, 'completed')
  })

  it('does not consume jobs cancelled before worker attach', async () => {
    const queue = new InMemoryDesignJobQueue()
    const payload = designPayload('job_cancelled_before_worker')
    const consumed: string[] = []

    await queue.enqueueDesignJob(payload)
    await queue.cancelJob(payload.idempotencyKey, 'cancelled before worker startup')
    attachDesignJobWorker(queue, {
      async processQueuedDesignJob(queuedPayload) {
        consumed.push(queuedPayload.jobId)
      },
      async processQueuedRefineJob() {
        throw new Error('unexpected refine job')
      },
      async processQueuedScreenshotJob() {
        throw new Error('unexpected screenshot job')
      },
    })
    await queue.flush()

    assert.deepEqual(consumed, [])
    assert.equal((await queue.getJobState(payload.idempotencyKey))?.status, 'cancelled')
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

function refinePayload(id: string): RefineJobQueuePayload {
  return {
    jobId: null,
    sessionId: 'ses_1',
    variationIds: ['var_refine_1'],
    sourceArtifactId: null,
    runtimeSessionId: 'rt_1',
    modelServiceId: 'mdl_1',
    idempotencyKey: `queue:refine:${id}`,
    userId: 'usr_1',
    workspaceId: 'wsp_1',
    variationId: 'var_refine_1',
    baseArtifactId: 'art_1',
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
