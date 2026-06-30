import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  InMemoryDesignJobQueue,
  type DesignJobQueuePayload,
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
