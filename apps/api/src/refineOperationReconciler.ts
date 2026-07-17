import { randomUUID } from 'node:crypto'
import type { ApplicationService } from './service.js'

export type RefineOperationReconcilerOptions = {
  ownerId?: string
  intervalMs?: number
  leaseMs?: number
  batchSize?: number
  orphanAfterMs?: number
  onError?: (error: unknown) => void
}

export type RefineOperationReconcileSummary = Awaited<ReturnType<ApplicationService['reconcileRefineOperations']>>

export class RefineOperationReconciler {
  readonly ownerId: string
  private readonly intervalMs: number
  private readonly leaseMs: number
  private readonly batchSize: number
  private readonly orphanAfterMs: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<RefineOperationReconcileSummary> | null = null
  private stopped = true

  constructor(
    private readonly service: ApplicationService,
    private readonly options: RefineOperationReconcilerOptions = {},
  ) {
    this.ownerId = options.ownerId ?? `refine-reconciler:${process.pid}:${randomUUID()}`
    this.intervalMs = positiveInteger(options.intervalMs, 2_000)
    this.leaseMs = positiveInteger(options.leaseMs, Math.max(30_000, this.intervalMs * 3))
    this.batchSize = positiveInteger(options.batchSize, 20)
    this.orphanAfterMs = nonNegativeInteger(options.orphanAfterMs, 300_000)
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.schedule(0)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<RefineOperationReconcileSummary> {
    if (this.running) return this.running
    const run = this.service.reconcileRefineOperations({
      ownerId: this.ownerId,
      limit: this.batchSize,
      leaseMs: this.leaseMs,
      orphanAfterMs: this.orphanAfterMs,
    })
    this.running = run
    try {
      return await run
    } finally {
      this.running = null
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(error => this.options.onError?.(error))
        .finally(() => this.schedule(this.intervalMs))
    }, delayMs)
    this.timer.unref?.()
  }
}

export function createRefineOperationReconcilerFromEnv(service: ApplicationService): RefineOperationReconciler {
  return new RefineOperationReconciler(service, {
    intervalMs: optionalNonNegativeInteger(process.env.DUDESIGN_REFINE_RECONCILE_INTERVAL_MS),
    leaseMs: optionalNonNegativeInteger(process.env.DUDESIGN_REFINE_RECONCILE_LEASE_MS),
    batchSize: optionalNonNegativeInteger(process.env.DUDESIGN_REFINE_RECONCILE_BATCH_SIZE),
    orphanAfterMs: optionalNonNegativeInteger(process.env.DUDESIGN_REFINE_RECONCILE_ORPHAN_MS),
    onError: error => console.error('DUDesign refine operation reconciliation failed.', error),
  })
}

export function refineOperationReconcilerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DUDESIGN_REFINE_RECONCILER_ENABLED !== 'false'
}

function optionalNonNegativeInteger(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback
}
