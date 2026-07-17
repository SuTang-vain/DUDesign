import { pathToFileURL } from 'node:url'
import { createApplicationServiceFromEnv } from './serviceFactory.js'
import { createRefineOperationReconcilerFromEnv, refineOperationReconcilerEnabled } from './refineOperationReconciler.js'

export async function startDesignJobWorker(): Promise<void> {
  const service = await createApplicationServiceFromEnv({ role: 'worker' })
  const reconciler = refineOperationReconcilerEnabled() ? createRefineOperationReconcilerFromEnv(service) : null
  reconciler?.start()
  await service.queue.flush?.()
  console.log('DUDesign design job worker is ready.')

  const shutdown = async (signal: NodeJS.Signals) => {
    console.log(`DUDesign design job worker received ${signal}; shutting down.`)
    await service.flushBackgroundTasks()
    reconciler?.stop()
    const queue = service.queue as { close?: () => Promise<void> }
    await queue.close?.()
    process.exit(0)
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startDesignJobWorker()
}
