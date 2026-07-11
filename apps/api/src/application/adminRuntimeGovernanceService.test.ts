import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MockRuntimeGateway } from '@dudesign/runtime-gateway'
import { InMemoryStore } from '../store.js'
import { AdminRuntimeGovernanceService } from './adminRuntimeGovernanceService.js'

describe('AdminRuntimeGovernanceService', () => {
  it('returns runtime observability independently from the ApplicationService facade', async () => {
    const store = new InMemoryStore()
    const service = new AdminRuntimeGovernanceService(store, new MockRuntimeGateway())

    const result = await service.getRuntimeHealth({
      requestId: 'req_runtime_health',
      userId: store.devUser.id,
      adminRole: 'developer',
    })

    assert.equal(result.runtime.runtime, 'mock')
    assert.equal(result.runtime.status, 'compatible')
    assert.equal(result.observability.contractMismatch, false)
    assert.equal(result.observability.rollbackMode, 'external_config_required')
  })

  it('records provider-neutral rollback requests and rejects insufficient roles', async () => {
    const store = new InMemoryStore()
    const service = new AdminRuntimeGovernanceService(store, new MockRuntimeGateway())

    await assert.rejects(
      () => service.requestRuntimeRollback({
        requestId: 'req_runtime_support',
        userId: store.devUser.id,
        adminRole: 'support',
      }),
      /higher role/,
    )

    const result = await service.requestRuntimeRollback({
      requestId: 'req_runtime_rollback',
      userId: store.devUser.id,
      adminRole: 'developer',
    }, { reason: 'contract drift' })

    assert.equal(result.audit.targetId, 'mock')
    assert.equal(result.audit.metadata.runtimeProviderId, 'mock')
    assert.equal(result.audit.reason, 'contract drift')
  })
})
