import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import { MockRuntimeGateway, type RuntimeGateway } from '@dudesign/runtime-gateway'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { RedisDesignJobQueue } from './redisDesignJobQueue.js'

const REDIS_TEST_URL = process.env.DUDESIGN_REDIS_TEST_URL

describe('RedisDesignJobQueue integration', { skip: !REDIS_TEST_URL }, () => {
  let tempDir: string
  let producerQueue: RedisDesignJobQueue
  let workerQueue: RedisDesignJobQueue

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dudesign-redis-queue-'))
    const queueName = `dudesign-test-${process.pid}-${Date.now()}`
    producerQueue = createRedisQueue(queueName)
    workerQueue = createRedisQueue(queueName)
  })

  afterEach(async () => {
    await producerQueue?.obliterate().catch(() => undefined)
    await workerQueue?.close().catch(() => undefined)
    await producerQueue?.close().catch(() => undefined)
    await rm(tempDir, { recursive: true, force: true })
  })

  it('lets an API producer enqueue and a worker service consume a design job', async () => {
    const store = new InMemoryStore()
    const artifacts = new LocalArtifactStore({ rootDir: join(tempDir, 'artifacts') })
    const runtime = new MockRuntimeGateway()
    const apiService = new ApplicationService({
      store,
      artifacts,
      runtime,
      queue: producerQueue,
      consumeQueue: false,
    })
    const workerService = new ApplicationService({
      store,
      artifacts,
      runtime,
      queue: workerQueue,
      consumeQueue: true,
    })
    await workerService.queue.flush?.()

    const sessionResponse = await apiService.createSession(
      { requestId: 'req_redis_session', userId: store.devUser.id, adminRole: null },
      {
        workspaceId: store.devWorkspace.id,
        mode: 'new_html',
        title: 'Redis queue integration',
      },
    )
    const jobResponse = await apiService.createDesignJob(
      { requestId: 'req_redis_job', userId: store.devUser.id, adminRole: null },
      {
        sessionId: sessionResponse.session.id,
        prompt: 'A concise landing page for Redis-backed queue integration.',
        sourceMode: 'new_html',
        variationCount: 1,
      },
    )

    assert.equal(jobResponse.job.status, 'queued')
    assert.equal((await producerQueue.getJobState(`queue:design-job:${jobResponse.job.id}`))?.status, 'queued')

    const snapshot = await waitForJobCompleted(apiService, jobResponse.job.id)
    assert.equal(snapshot.job.status, 'completed')
    assert.equal(snapshot.variations[0]?.status, 'completed')
    assert.equal((await producerQueue.getJobState(`queue:design-job:${jobResponse.job.id}`))?.status, 'completed')
    assert.ok(snapshot.artifacts.some(artifact => artifact.kind === 'html'))

    await apiService.flushBackgroundTasks()
    await workerService.flushBackgroundTasks()
  })

  it('keeps runtime unavailable failures explicit and visible in the dead-letter view', async () => {
    const store = new InMemoryStore()
    const artifacts = new LocalArtifactStore({ rootDir: join(tempDir, 'artifacts') })
    const apiService = new ApplicationService({
      store,
      artifacts,
      runtime: unavailableRuntime,
      queue: producerQueue,
      consumeQueue: false,
    })
    const workerService = new ApplicationService({
      store,
      artifacts,
      runtime: unavailableRuntime,
      queue: workerQueue,
      consumeQueue: true,
    })
    await workerService.queue.flush?.()

    const sessionResponse = await apiService.createSession(
      { requestId: 'req_redis_unavailable_session', userId: store.devUser.id, adminRole: null },
      {
        workspaceId: store.devWorkspace.id,
        mode: 'new_html',
        title: 'Redis runtime unavailable integration',
      },
    )
    assert.equal(sessionResponse.session.runtimeSessionId, null)

    const jobResponse = await apiService.createDesignJob(
      { requestId: 'req_redis_unavailable_job', userId: store.devUser.id, adminRole: null },
      {
        sessionId: sessionResponse.session.id,
        prompt: 'This queued job should fail clearly when the runtime is unavailable.',
        sourceMode: 'new_html',
        variationCount: 1,
      },
    )

    const snapshot = await waitForJobStatus(apiService, jobResponse.job.id, 'failed')
    assert.equal(snapshot.variations[0]?.status, 'failed')
    assert.equal(snapshot.variations[0]?.errorCode, 'RUNTIME_UNAVAILABLE')

    const queueState = await producerQueue.getJobState(`queue:design-job:${jobResponse.job.id}`)
    assert.equal(queueState?.status, 'completed')

    const deadLetters = await producerQueue.getDeadLetterJobs()
    assert.equal(deadLetters.some(job => job.idempotencyKey === `queue:design-job:${jobResponse.job.id}`), false)

    await apiService.flushBackgroundTasks()
    await workerService.flushBackgroundTasks()
  })

  it('moves exhausted queue consumer failures into the dead-letter view', async () => {
    const payload = designPayload('dead_letter')
    const queue = createRedisQueue(`dudesign-test-dlq-${process.pid}-${Date.now()}`)
    queue.setConsumer({
      async runDesignJob() {
        throw new Error('synthetic queue consumer failure')
      },
      async runRefineJob() {
        throw new Error('unexpected refine job')
      },
    })
    try {
      await queue.flush()
      await queue.enqueueDesignJob(payload)
      const state = await waitForQueueStatus(queue, payload.idempotencyKey, 'failed')
      assert.equal(state.errorCode, 'QUEUE_CONSUMER_FAILED')

      const deadLetters = await queue.getDeadLetterJobs()
      assert.equal(deadLetters.some(job => job.idempotencyKey === payload.idempotencyKey), true)
    } finally {
      await queue.obliterate().catch(() => undefined)
      await queue.close().catch(() => undefined)
    }
  })
})

function createRedisQueue(queueName: string): RedisDesignJobQueue {
  return new RedisDesignJobQueue({
    connection: { url: REDIS_TEST_URL! },
    queueName,
    prefix: 'dudesign-test',
    concurrency: 1,
    attempts: 1,
    skipWaitingForReady: false,
  })
}

async function waitForJobCompleted(service: ApplicationService, jobId: string) {
  return waitForJobStatus(service, jobId, 'completed')
}

async function waitForJobStatus(service: ApplicationService, jobId: string, status: 'completed' | 'failed') {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 5000) {
    const snapshot = await service.getDesignJob(
      { requestId: 'req_redis_wait', userId: 'usr_dev', adminRole: null },
      jobId,
    )
    if (snapshot.job.status === status) return snapshot
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Redis-backed job ${jobId} to become ${status}`)
}

async function waitForQueueStatus(queue: RedisDesignJobQueue, idempotencyKey: string, status: 'failed' | 'completed') {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 5000) {
    const state = await queue.getJobState(idempotencyKey)
    if (state?.status === status) return state
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Redis queue job ${idempotencyKey} to become ${status}`)
}

function designPayload(jobId: string) {
  return {
    jobId,
    sessionId: 'ses_1',
    variationIds: ['var_1'],
    sourceArtifactId: null,
    runtimeSessionId: null,
    modelServiceId: 'mdl_1',
    idempotencyKey: `queue:design-job:${jobId}`,
    userId: 'usr_1',
    workspaceId: 'wsp_1',
    createdAt: '2026-07-01T00:00:00.000Z',
  }
}

const unavailableRuntime: RuntimeGateway = {
  async getRuntimeHealth() {
    return {
      status: 'unavailable',
      runtime: 'babel-o',
      runtimeVersion: null,
      contractVersion: 'test',
      checkedAt: new Date().toISOString(),
      message: 'Runtime unavailable in Redis queue test.',
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
  async listRuntimeModels() {
    throw new Error('Runtime unavailable in Redis queue test.')
  },
  async createSession() {
    throw new Error('Runtime unavailable in Redis queue test.')
  },
  async resumeSession() {
    return {
      status: 'unavailable',
      runtimeSessionId: null,
      message: 'Runtime unavailable in Redis queue test.',
    }
  },
  async *spawnVariationAgents() {
    throw new Error('Runtime unavailable in Redis queue test.')
  },
  async *refineVariation() {
    throw new Error('Runtime unavailable in Redis queue test.')
  },
  async cancelRuntimeJob() {
    return {
      cancelled: false,
      message: 'Runtime unavailable in Redis queue test.',
    }
  },
}
