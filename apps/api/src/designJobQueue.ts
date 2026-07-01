import type { DeviceTarget } from '@dudesign/contracts'

export type QueueJobKind = 'design_job' | 'refine_job' | 'screenshot_job'
export const designJobQueueJobNames = {
  designJob: 'design_job',
  refineJob: 'refine_job',
  screenshotJob: 'screenshot_job',
} as const
export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DesignJobQueuePayload = {
  jobId: string
  sessionId: string
  variationIds: string[]
  sourceArtifactId: string | null
  runtimeSessionId: string | null
  modelServiceId: string | null
  idempotencyKey: string
  userId: string
  workspaceId: string
  createdAt: string
}

export type RefineJobQueuePayload = {
  jobId: string | null
  sessionId: string
  variationIds: string[]
  sourceArtifactId: string | null
  runtimeSessionId: string | null
  modelServiceId: string | null
  idempotencyKey: string
  userId: string
  workspaceId: string
  variationId: string
  baseArtifactId: string
  prompt?: string | null
  annotationPromptSuffix?: string | null
  deviceContext?: DeviceTarget | null
  source?: 'manual' | 'automation_loop'
  attempt?: number | null
  createdAt: string
}

export type ScreenshotJobQueuePayload = {
  jobId: string | null
  sessionId: string
  variationId: string
  artifactId: string
  idempotencyKey: string
  userId: string
  workspaceId: string
  source: 'mock-runtime' | 'babel-o-runtime' | 'babel-o-workspace' | 'repair'
  reason: 'artifact_created' | 'repair_requested' | 'restore_requested'
  createdAt: string
}

export type QueueJobState = {
  idempotencyKey: string
  kind: QueueJobKind
  status: QueueJobStatus
  enqueuedAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  attempts: number
  errorCode: string | null
  errorMessage: string | null
}

export type DesignJobQueueConsumer = {
  runDesignJob(payload: DesignJobQueuePayload): Promise<void>
  runRefineJob(payload: RefineJobQueuePayload): Promise<void>
  runScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<void>
}

export type DesignJobQueue = {
  enqueueDesignJob(payload: DesignJobQueuePayload): Promise<QueueJobState>
  enqueueRefineJob(payload: RefineJobQueuePayload): Promise<QueueJobState>
  enqueueScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<QueueJobState>
  cancelJob(idempotencyKey: string, reason?: string): Promise<QueueJobState | null>
  getJobState(idempotencyKey: string): Promise<QueueJobState | null>
  setConsumer?(consumer: DesignJobQueueConsumer): void
  flush?(): Promise<void>
}

type QueueRecord =
  | {
      kind: 'design_job'
      payload: DesignJobQueuePayload
      state: QueueJobState
    }
  | {
      kind: 'refine_job'
      payload: RefineJobQueuePayload
      state: QueueJobState
    }
  | {
      kind: 'screenshot_job'
      payload: ScreenshotJobQueuePayload
      state: QueueJobState
    }

export class InMemoryDesignJobQueue implements DesignJobQueue {
  private readonly records = new Map<string, QueueRecord>()
  private readonly activeTasks = new Set<Promise<void>>()
  private consumer: DesignJobQueueConsumer | null = null

  setConsumer(consumer: DesignJobQueueConsumer): void {
    this.consumer = consumer
    for (const record of this.records.values()) {
      if (record.state.status === 'queued') this.start(record)
    }
  }

  async enqueueDesignJob(payload: DesignJobQueuePayload): Promise<QueueJobState> {
    return this.enqueue({
      kind: 'design_job',
      payload,
      state: createState('design_job', payload.idempotencyKey, payload.createdAt),
    })
  }

  async enqueueRefineJob(payload: RefineJobQueuePayload): Promise<QueueJobState> {
    return this.enqueue({
      kind: 'refine_job',
      payload,
      state: createState('refine_job', payload.idempotencyKey, payload.createdAt),
    })
  }

  async enqueueScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<QueueJobState> {
    return this.enqueue({
      kind: 'screenshot_job',
      payload,
      state: createState('screenshot_job', payload.idempotencyKey, payload.createdAt),
    })
  }

  async cancelJob(idempotencyKey: string, reason?: string): Promise<QueueJobState | null> {
    const record = this.records.get(idempotencyKey)
    if (!record) return null
    if (record.state.status === 'completed' || record.state.status === 'failed') return record.state
    record.state = {
      ...record.state,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      errorCode: reason ? 'QUEUE_CANCELLED' : record.state.errorCode,
      errorMessage: reason ?? record.state.errorMessage,
    }
    this.records.set(idempotencyKey, record)
    return record.state
  }

  async getJobState(idempotencyKey: string): Promise<QueueJobState | null> {
    return this.records.get(idempotencyKey)?.state ?? null
  }

  async flush(): Promise<void> {
    while (this.activeTasks.size > 0) {
      await Promise.allSettled([...this.activeTasks])
    }
  }

  private enqueue(record: QueueRecord): QueueJobState {
    const existing = this.records.get(record.state.idempotencyKey)
    if (existing) return existing.state
    this.records.set(record.state.idempotencyKey, record)
    this.start(record)
    return record.state
  }

  private start(record: QueueRecord): void {
    if (!this.consumer) return
    const task = this.run(record)
    this.activeTasks.add(task)
    task.finally(() => {
      this.activeTasks.delete(task)
    })
  }

  private async run(record: QueueRecord): Promise<void> {
    if (!this.consumer) return
    const startedAt = new Date().toISOString()
    record.state = {
      ...record.state,
      status: 'running',
      startedAt,
      attempts: record.state.attempts + 1,
    }
    this.records.set(record.state.idempotencyKey, record)
    try {
      if (record.kind === 'design_job') await this.consumer.runDesignJob(record.payload)
      else if (record.kind === 'refine_job') await this.consumer.runRefineJob(record.payload)
      else await this.consumer.runScreenshotJob(record.payload)
      if (record.state.status !== 'cancelled') {
        record.state = {
          ...record.state,
          status: 'completed',
          completedAt: new Date().toISOString(),
        }
        this.records.set(record.state.idempotencyKey, record)
      }
    } catch (error) {
      record.state = {
        ...record.state,
        status: 'failed',
        failedAt: new Date().toISOString(),
        errorCode: 'QUEUE_CONSUMER_FAILED',
        errorMessage: error instanceof Error ? error.message : 'Queue consumer failed.',
      }
      this.records.set(record.state.idempotencyKey, record)
    }
  }
}

function createState(kind: QueueJobKind, idempotencyKey: string, enqueuedAt: string): QueueJobState {
  return {
    idempotencyKey,
    kind,
    status: 'queued',
    enqueuedAt,
    startedAt: null,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  }
}
