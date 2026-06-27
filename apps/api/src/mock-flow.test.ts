import { after, before, describe, it } from 'node:test'
import { ApplicationService } from './service.js'
import { runApiFlowSmoke, startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('DUDesign mock API flow', () => {
  let harness: ApiFlowHarness

  before(async () => {
    harness = await startApiFlowHarness(new ApplicationService())
  })

  after(async () => {
    await harness.close()
  })

  it('creates a session, generates variations, refines with annotations, and serves preview HTML', async () => {
    await runApiFlowSmoke(harness)
  })
})
