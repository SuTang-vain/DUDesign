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
      }
      assert.equal(payload.runtime.status, 'contract_mismatch')
      assert.equal(payload.contract.status, 'contract_mismatch')
      assert.equal(payload.runtime.contractVersion, '2026-06-26.dudesign-runtime.v0')
      assert.match(payload.runtime.message ?? '', /does not match/i)
      assert.equal(payload.contract.requiredEndpoints.includes('POST /v1/sessions'), true)
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
