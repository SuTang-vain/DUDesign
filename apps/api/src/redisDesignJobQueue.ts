import { Queue, Worker, type Job, type JobsOptions, type QueueOptions, type WorkerOptions } from 'bullmq'
import {
  designJobQueueJobNames,
  type DesignJobQueue,
  type DesignJobQueueConsumer,
  type DesignJobQueuePayload,
  type QueueJobKind,
  type QueueJobState,
  type QueueJobStatus,
  type RefineJobQueuePayload,
} from './designJobQueue.js'

type RedisQueuePayload =
  | {
      kind: 'design_job'
      payload: DesignJobQueuePayload
    }
  | {
      kind: 'refine_job'
      payload: RefineJobQueuePayload
    }

export type RedisDesignJobQueueOptions = {
  connection: QueueOptions['connection']
  queueName?: string
  prefix?: string
  concurrency?: number
  attempts?: number
  backoffMs?: number
  removeOnComplete?: JobsOptions['removeOnComplete']
  removeOnFail?: JobsOptions['removeOnFail']
  skipWaitingForReady?: boolean
}

export class RedisDesignJobQueue implements DesignJobQueue {
  private readonly queue: Queue<RedisQueuePayload, void, QueueJobKind>
  private readonly workerOptions: WorkerOptions
  private readonly jobOptions: JobsOptions
  private worker: Worker<RedisQueuePayload, void, QueueJobKind> | null = null

  constructor(options: RedisDesignJobQueueOptions) {
    const queueName = options.queueName ?? 'dudesign-design-jobs'
    const queueOptions: QueueOptions = {
      connection: options.connection,
      prefix: options.prefix,
      skipWaitingForReady: options.skipWaitingForReady,
    }
    this.queue = new Queue<RedisQueuePayload, void, QueueJobKind>(queueName, queueOptions)
    this.workerOptions = {
      connection: options.connection,
      prefix: options.prefix,
      concurrency: options.concurrency ?? 3,
      skipWaitingForReady: options.skipWaitingForReady,
    }
    this.jobOptions = {
      attempts: options.attempts ?? 1,
      backoff: options.backoffMs ? { type: 'fixed', delay: options.backoffMs } : undefined,
      removeOnComplete: options.removeOnComplete ?? false,
      removeOnFail: options.removeOnFail ?? false,
    }
  }

  async enqueueDesignJob(payload: DesignJobQueuePayload): Promise<QueueJobState> {
    const job = await this.queue.add(
      designJobQueueJobNames.designJob,
      { kind: 'design_job', payload },
      {
        ...this.jobOptions,
        jobId: payload.idempotencyKey,
        timestamp: Date.parse(payload.createdAt),
      },
    )
    return queueStateFromBullJob(job)
  }

  async enqueueRefineJob(payload: RefineJobQueuePayload): Promise<QueueJobState> {
    const job = await this.queue.add(
      designJobQueueJobNames.refineJob,
      { kind: 'refine_job', payload },
      {
        ...this.jobOptions,
        jobId: payload.idempotencyKey,
        timestamp: Date.parse(payload.createdAt),
      },
    )
    return queueStateFromBullJob(job)
  }

  async cancelJob(idempotencyKey: string, reason?: string): Promise<QueueJobState | null> {
    const job = await this.queue.getJob(idempotencyKey)
    if (!job) return null
    const current = await job.getState()
    if (current === 'completed' || current === 'failed') return queueStateFromBullJob(job, current)
    if (current === 'active') {
      const cancelled = this.worker?.cancelJob(idempotencyKey, reason) ?? false
      if (!cancelled) {
        return queueStateFromBullJob(job, current, {
          errorCode: 'QUEUE_CANCEL_UNAVAILABLE',
          errorMessage: 'Active job is running in another worker process and cannot be cancelled by this queue client.',
        })
      }
      return queueStateFromBullJob(job, current, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        errorCode: 'QUEUE_CANCELLED',
        errorMessage: reason ?? 'Job cancellation requested.',
      })
    }
    await job.remove()
    return queueStateFromBullJob(job, 'unknown', {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      errorCode: 'QUEUE_CANCELLED',
      errorMessage: reason ?? 'Job cancelled before execution.',
    })
  }

  async getJobState(idempotencyKey: string): Promise<QueueJobState | null> {
    const job = await this.queue.getJob(idempotencyKey)
    if (!job) return null
    return queueStateFromBullJob(job)
  }

  setConsumer(consumer: DesignJobQueueConsumer): void {
    if (this.worker) return
    this.worker = new Worker<RedisQueuePayload, void, QueueJobKind>(
      this.queue.name,
      async job => {
        if (job.data.kind === 'design_job') await consumer.runDesignJob(job.data.payload)
        else await consumer.runRefineJob(job.data.payload)
      },
      this.workerOptions,
    )
  }

  async flush(): Promise<void> {
    await this.queue.waitUntilReady()
    await this.worker?.waitUntilReady()
  }

  async close(): Promise<void> {
    await this.worker?.close()
    await this.queue.close()
  }

  async obliterate(): Promise<void> {
    await this.queue.obliterate({ force: true })
  }
}

export function createRedisDesignJobQueueFromEnv(env: NodeJS.ProcessEnv = process.env): RedisDesignJobQueue {
  const redisUrl = env.REDIS_URL ?? env.DUDESIGN_REDIS_URL
  if (!redisUrl) {
    throw new Error('REDIS_URL or DUDESIGN_REDIS_URL is required when DUDESIGN_QUEUE=redis.')
  }
  return new RedisDesignJobQueue({
    connection: { url: redisUrl },
    queueName: env.DUDESIGN_QUEUE_NAME,
    prefix: env.DUDESIGN_QUEUE_PREFIX,
    concurrency: optionalPositiveInteger(env.DUDESIGN_QUEUE_CONCURRENCY),
    attempts: optionalPositiveInteger(env.DUDESIGN_QUEUE_ATTEMPTS),
    backoffMs: optionalPositiveInteger(env.DUDESIGN_QUEUE_BACKOFF_MS),
    skipWaitingForReady: env.DUDESIGN_QUEUE_SKIP_WAITING_FOR_READY === 'true',
  })
}

export function queueStatusFromBullState(state: string): QueueJobStatus {
  switch (state) {
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'active':
      return 'running'
    case 'unknown':
      return 'cancelled'
    default:
      return 'queued'
  }
}

export function queueStateFromBullJob(
  job: Job<RedisQueuePayload, void, QueueJobKind>,
  knownState?: string,
  override: Partial<QueueJobState> = {},
): QueueJobState {
  const payload = job.data.payload
  const kind = job.data.kind
  const state = knownState ?? inferBullStateFromJob(job)
  const status = override.status ?? queueStatusFromBullState(state)
  return {
    idempotencyKey: payload.idempotencyKey,
    kind,
    status,
    enqueuedAt: new Date(job.timestamp || Date.parse(payload.createdAt)).toISOString(),
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    completedAt: status === 'completed' && job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    failedAt: status === 'failed' && job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    cancelledAt: null,
    attempts: job.attemptsMade,
    errorCode: status === 'failed' ? 'QUEUE_CONSUMER_FAILED' : null,
    errorMessage: status === 'failed' ? job.failedReason ?? 'Queue job failed.' : null,
    ...override,
  }
}

function inferBullStateFromJob(job: Job<RedisQueuePayload, void, QueueJobKind>): string {
  if (job.finishedOn && job.failedReason) return 'failed'
  if (job.finishedOn) return 'completed'
  if (job.processedOn) return 'active'
  return 'waiting'
}

function optionalPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
