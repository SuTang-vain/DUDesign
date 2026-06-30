import type {
  DesignJobQueue,
  DesignJobQueueConsumer,
  DesignJobQueuePayload,
  RefineJobQueuePayload,
} from './designJobQueue.js'

export type QueuedDesignJobProcessor = {
  processQueuedDesignJob(payload: DesignJobQueuePayload): Promise<void>
  processQueuedRefineJob(payload: RefineJobQueuePayload): Promise<void>
}

export class ApplicationDesignJobWorker implements DesignJobQueueConsumer {
  constructor(private readonly processor: QueuedDesignJobProcessor) {}

  async runDesignJob(payload: DesignJobQueuePayload): Promise<void> {
    await this.processor.processQueuedDesignJob(payload)
  }

  async runRefineJob(payload: RefineJobQueuePayload): Promise<void> {
    await this.processor.processQueuedRefineJob(payload)
  }
}

export function attachDesignJobWorker(queue: DesignJobQueue, processor: QueuedDesignJobProcessor): void {
  queue.setConsumer?.(new ApplicationDesignJobWorker(processor))
}
