import { afterEach, describe, it } from 'node:test'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { runMultiUserAccessSmoke } from './multiUserAccessSmoke.js'

describe('multi-user access HTTP smoke', () => {
  let harness: ApiFlowHarness | null = null
  let previousAuthMode: string | undefined

  afterEach(async () => {
    if (previousAuthMode === undefined) delete process.env.DUDESIGN_AUTH_MODE
    else process.env.DUDESIGN_AUTH_MODE = previousAuthMode
    await harness?.close()
    harness = null
  })

  it('isolates private resources across users while public shares stay token-readable and artifact-pinned', async () => {
    previousAuthMode = process.env.DUDESIGN_AUTH_MODE
    process.env.DUDESIGN_AUTH_MODE = 'session'
    harness = await startApiFlowHarness(new ApplicationService({ consumeQueue: false }))
    await runMultiUserAccessSmoke(harness)
  })
})
