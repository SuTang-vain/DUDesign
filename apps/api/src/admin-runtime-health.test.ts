import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { DesignEvent } from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { startApiFlowHarness } from './apiFlowSmoke.js'
import type {
  CancelRuntimeJobInput,
  CancelRuntimeJobResult,
  CreateRuntimeSessionInput,
  RefineVariationInput,
  ResumeRuntimeSessionInput,
  RuntimeContract,
  RuntimeGateway,
  RuntimeHealth,
  RuntimeModels,
  RuntimeResumeResult,
  RuntimeSessionRef,
  SpawnVariationAgentsInput,
} from '@dudesign/runtime-gateway'

describe('Admin runtime health', () => {
  it('surfaces runtime contract mismatch through the Admin API', async () => {
    const harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ContractMismatchRuntimeGateway(),
    }))
    try {
      const response = await fetch(`${harness.baseUrl}/api/admin/runtime/health`, {
        headers: { 'x-dudesign-admin-role': 'developer' },
      })
      assert.equal(response.ok, true)
      const payload = await response.json() as {
        runtime: RuntimeHealth
        contract: RuntimeContract
        observability: {
          latencyMs: number
          contractMismatch: boolean
          unavailable: boolean
          degraded: boolean
          drift: boolean
          degradedMode: string
          rollbackMode: string
        }
      }
      assert.equal(payload.runtime.status, 'contract_mismatch')
      assert.equal(payload.contract.status, 'contract_mismatch')
      assert.equal(payload.runtime.contractVersion, '2026-06-26.dudesign-runtime.v0')
      assert.match(payload.runtime.message ?? '', /does not match/i)
      assert.equal(payload.contract.requiredEndpoints.includes('POST /v1/sessions'), true)
      assert.equal(payload.observability.contractMismatch, true)
      assert.equal(payload.observability.unavailable, false)
      assert.equal(payload.observability.latencyMs >= 0, true)

      const auditResponse = await fetch(`${harness.baseUrl}/api/admin/audit-logs`, {
        headers: { 'x-dudesign-admin-role': 'developer' },
      })
      const audits = await auditResponse.json() as { auditLogs: Array<{ action: string; targetId: string; metadata: Record<string, unknown> }> }
      const runtimeAudit = audits.auditLogs.find(audit => audit.action === 'runtime.contract_mismatch')
      assert.equal(runtimeAudit?.targetId, 'babel-o')
      assert.equal(runtimeAudit?.metadata.contractMismatch, true)
      assert.equal(typeof runtimeAudit?.metadata.latencyMs, 'number')
    } finally {
      await harness.close()
    }
  })

  it('marks degraded runtime health and records a degraded observation', async () => {
    const harness = await startApiFlowHarness(new ApplicationService({
      runtime: new DegradedRuntimeGateway(),
    }))
    try {
      const response = await fetch(`${harness.baseUrl}/api/admin/runtime/health`, {
        headers: { 'x-dudesign-admin-role': 'operator' },
      })
      assert.equal(response.ok, true)
      const payload = await response.json() as {
        runtime: RuntimeHealth
        contract: RuntimeContract
        observability: { degraded: boolean; degradedMode: string; rollbackAvailable: boolean }
      }
      assert.equal(payload.runtime.status, 'degraded')
      assert.equal(payload.contract.status, 'degraded')
      assert.equal(payload.observability.degraded, true)
      assert.equal(payload.observability.rollbackAvailable, false)
      assert.equal(payload.observability.degradedMode, 'read_existing_artifacts_and_block_unsafe_runtime_switch')

      const auditResponse = await fetch(`${harness.baseUrl}/api/admin/audit-logs`, {
        headers: { 'x-dudesign-admin-role': 'operator' },
      })
      const audits = await auditResponse.json() as { auditLogs: Array<{ action: string; metadata: Record<string, unknown> }> }
      const degradedAudit = audits.auditLogs.find(audit => audit.action === 'runtime.degraded')
      assert.equal(degradedAudit?.metadata.degraded, true)
    } finally {
      await harness.close()
    }
  })

  it('records runtime rollback requests without mutating deployment config', async () => {
    const harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ContractMismatchRuntimeGateway(),
    }))
    try {
      const response = await fetch(`${harness.baseUrl}/api/admin/runtime/rollback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dudesign-admin-role': 'developer',
        },
        body: JSON.stringify({ reason: 'rollback after contract mismatch' }),
      })
      assert.equal(response.status, 202)
      const payload = await response.json() as {
        status: string
        message: string
        audit: { action: string; reason: string | null; metadata: Record<string, unknown> }
      }
      assert.equal(payload.status, 'unsupported_external_config_required')
      assert.match(payload.message, /deployment\/config management/)
      assert.equal(payload.audit.action, 'runtime.config.rollback.requested')
      assert.equal(payload.audit.reason, 'rollback after contract mismatch')
      assert.equal(payload.audit.metadata.status, 'unsupported_external_config_required')
    } finally {
      await harness.close()
    }
  })
})

class ContractMismatchRuntimeGateway implements RuntimeGateway {
  async getRuntimeHealth(): Promise<RuntimeHealth> {
    return {
      status: 'contract_mismatch',
      runtime: 'babel-o',
      runtimeVersion: 'mismatch-test',
      contractVersion: '2026-06-26.dudesign-runtime.v0',
      checkedAt: new Date().toISOString(),
      message: 'BabeL-O runtime contract does not match DUDesign expectations.',
    }
  }

  async getRuntimeContract(): Promise<RuntimeContract> {
    return {
      runtime: 'babel-o',
      runtimeVersion: 'mismatch-test',
      contractVersion: '2026-06-26.dudesign-runtime.v0',
      status: 'contract_mismatch',
      requiredEndpoints: ['POST /v1/sessions'],
      requiredEvents: ['session_started'],
      eventMappings: {
        session_started: 'design.session_started',
      },
    }
  }

  async listRuntimeModels(): Promise<RuntimeModels> {
    return {
      type: 'runtime_models',
      version: 'mismatch-test',
      providers: [],
      defaultModel: null,
      activeProfile: null,
      syncedAt: new Date().toISOString(),
    }
  }

  async createSession(_input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef> {
    return { runtimeSessionId: 'runtime_mismatch_session' }
  }

  async resumeSession(_input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult> {
    return {
      status: 'unavailable',
      runtimeSessionId: null,
      message: 'Runtime contract mismatch.',
    }
  }

  async *spawnVariationAgents(_input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    throw new Error('Runtime contract mismatch.')
  }

  async *refineVariation(_input: RefineVariationInput): AsyncIterable<DesignEvent> {
    throw new Error('Runtime contract mismatch.')
  }

  async cancelRuntimeJob(_input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    return {
      cancelled: false,
      message: 'Runtime contract mismatch.',
      cancelledVariationCount: 0,
      failedVariationCount: 0,
    }
  }
}

class DegradedRuntimeGateway extends ContractMismatchRuntimeGateway {
  override async getRuntimeHealth(): Promise<RuntimeHealth> {
    return {
      status: 'degraded',
      runtime: 'babel-o',
      runtimeVersion: 'degraded-test',
      contractVersion: '2026-06-26.dudesign-runtime.v1',
      checkedAt: new Date().toISOString(),
      message: 'BabeL-O runtime is reachable but optional model discovery is degraded.',
    }
  }

  override async getRuntimeContract(): Promise<RuntimeContract> {
    return {
      runtime: 'babel-o',
      runtimeVersion: 'degraded-test',
      contractVersion: '2026-06-26.dudesign-runtime.v1',
      status: 'degraded',
      requiredEndpoints: ['POST /v1/sessions'],
      requiredEvents: ['session_started'],
      eventMappings: {
        session_started: 'design.session_started',
      },
    }
  }
}
