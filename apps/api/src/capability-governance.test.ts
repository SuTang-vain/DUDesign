import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'

describe('capability governance persistence', () => {
  it('reloads disabled plugin overrides from the repository before resolving jobs', async () => {
    const store = new InMemoryStore()
    const firstService = new ApplicationService({ store, consumeQueue: false })
    await firstService.updateAdminCapabilityPluginGovernance(
      { userId: store.devUser.id, adminRole: 'developer', requestId: 'req_disable_plugin' },
      'plug_static_export_safe',
      {
        status: 'disabled',
        reason: 'persist disabled plugin override',
      },
    )

    const secondService = new ApplicationService({ store, consumeQueue: false })
    const capabilities = await secondService.listCapabilities({
      userId: store.devUser.id,
      adminRole: null,
      requestId: 'req_list_capability_governance',
    })
    assert.ok(capabilities.plugins.some(plugin => plugin.id === 'plug_static_export_safe' && plugin.status === 'disabled'))

    const session = await secondService.createSession({
      userId: store.devUser.id,
      adminRole: null,
      requestId: 'req_create_governed_session',
    }, {
      workspaceId: store.devWorkspace.id,
      title: 'Governance reload smoke',
    })

    await assert.rejects(
      () => secondService.createDesignJob({
        userId: store.devUser.id,
        adminRole: null,
        requestId: 'req_create_blocked_job',
      }, {
        sessionId: session.session.id,
        prompt: 'This job should be blocked by the persisted plugin override.',
        sourceMode: 'new_html',
        variationCount: 1,
        capabilityRequirements: {
          plugins: { skillIds: ['sk_static_export_safe'] },
        },
      }),
      (error: unknown) => (error as { code?: string }).code === 'CAPABILITY_PLUGIN_DISABLED',
    )
  })
})
