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
  jobTimeoutMs?: number
  removeOnComplete?: JobsOptions['removeOnComplete']
  removeOnFail?: JobsOptions['removeOnFail']
  skipWaitingForReady?: boolean
}

export type RedisQueueReliabilityPolicy = {
  attempts: number
  backoffMs: number | null
  jobTimeoutMs: number | null
  dedupe: 'jobId:idempotencyKey'
  deadLetter: 'bullmq:failed-set'
  removeOnComplete: JobsOptions['removeOnComplete']
  removeOnFail: JobsOptions['removeOnFail']
}

export class RedisDesignJobQueue implements DesignJobQueue {
  private readonly queue: Queue<RedisQueuePayload, void, QueueJobKind>
  private readonly workerOptions: WorkerOptions
  private readonly jobOptions: JobsOptions
  readonly reliabilityPolicy: RedisQueueReliabilityPolicy
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
    this.reliabilityPolicy = createRedisQueueReliabilityPolicy(options)
    this.jobOptions = {
      attempts: this.reliabilityPolicy.attempts,
      backoff: this.reliabilityPolicy.backoffMs ? { type: 'fixed', delay: this.reliabilityPolicy.backoffMs } : undefined,
      removeOnComplete: this.reliabilityPolicy.removeOnComplete,
      removeOnFail: this.reliabilityPolicy.removeOnFail,
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
        await withOptionalTimeout(
          () => job.data.kind === 'design_job'
            ? consumer.runDesignJob(job.data.payload)
            : consumer.runRefineJob(job.data.payload),
          this.reliabilityPolicy.jobTimeoutMs,
        )
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

  async getDeadLetterJobs(limit = 20): Promise<QueueJobState[]> {
    const jobs = await this.queue.getFailed(0, Math.max(0, limit - 1))
    return jobs.map(job => queueStateFromBullJob(job as Job<RedisQueuePayload, void, QueueJobKind>, 'failed'))
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
    jobTimeoutMs: optionalPositiveInteger(env.DUDESIGN_QUEUE_JOB_TIMEOUT_MS),
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
    attempts: normalizeAttempts(job),
    errorCode: status === 'failed' ? queueErrorCode(job.failedReason) : null,
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

export function createRedisQueueReliabilityPolicy(options: RedisDesignJobQueueOptions): RedisQueueReliabilityPolicy {
  return {
    attempts: options.attempts ?? 1,
    backoffMs: options.backoffMs ?? null,
    jobTimeoutMs: options.jobTimeoutMs ?? null,
    dedupe: 'jobId:idempotencyKey',
    deadLetter: 'bullmq:failed-set',
    removeOnComplete: options.removeOnComplete ?? false,
    removeOnFail: options.removeOnFail ?? false,
  }
}

async function withOptionalTimeout<T>(work: () => Promise<T>, timeoutMs: number | null): Promise<T> {
  if (!timeoutMs) return work()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`Queue job exceeded ${timeoutMs}ms.`)
          error.name = 'QUEUE_JOB_TIMEOUT'
          reject(error)
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function queueErrorCode(failedReason: string | undefined): string {
  if (failedReason?.includes('QUEUE_JOB_TIMEOUT') || failedReason?.includes('Queue job exceeded')) {
    return 'QUEUE_JOB_TIMEOUT'
  }
  return 'QUEUE_CONSUMER_FAILED'
}

function normalizeAttempts(job: Job<RedisQueuePayload, void, QueueJobKind>): number {
  return job.attemptsMade || (job.processedOn || job.finishedOn ? 1 : 0)
}
