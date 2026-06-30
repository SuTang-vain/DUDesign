import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import { MockRuntimeGateway } from '@dudesign/runtime-gateway'
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
})

function createRedisQueue(queueName: string): RedisDesignJobQueue {
  return new RedisDesignJobQueue({
    connection: { url: REDIS_TEST_URL! },
    queueName,
    prefix: 'dudesign-test',
    concurrency: 1,
    skipWaitingForReady: false,
  })
}

async function waitForJobCompleted(service: ApplicationService, jobId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 5000) {
    const snapshot = await service.getDesignJob(
      { requestId: 'req_redis_wait', userId: 'usr_dev', adminRole: null },
      jobId,
    )
    if (snapshot.job.status === 'completed') return snapshot
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for Redis-backed job ${jobId}`)
}
