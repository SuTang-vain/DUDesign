import type { DesignEvent } from '@dudesign/contracts'

export type JobEventListener = (event: DesignEvent) => void

export class JobEventBus {
  private readonly buffers = new Map<string, DesignEvent[]>()
  private readonly listeners = new Map<string, Set<JobEventListener>>()

  publish(event: DesignEvent): void {
    if (!event.jobId) return
    const buffer = this.buffers.get(event.jobId) ?? []
    buffer.push(event)
    this.buffers.set(event.jobId, buffer.slice(-500))
    for (const listener of this.listeners.get(event.jobId) ?? []) {
      listener(event)
    }
  }

  replay(jobId: string): DesignEvent[] {
    return [...(this.buffers.get(jobId) ?? [])]
  }

  subscribe(jobId: string, listener: JobEventListener): () => void {
    const listeners = this.listeners.get(jobId) ?? new Set<JobEventListener>()
    listeners.add(listener)
    this.listeners.set(jobId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(jobId)
    }
  }
}

