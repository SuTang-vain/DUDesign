import type { RuntimeGateway } from '@dudesign/runtime-gateway'
import type { RequestContext } from '../auth.js'
import type { ApplicationRepository } from '../repository.js'

export class AdminRuntimeGovernanceService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly runtime: RuntimeGateway,
  ) {}

  async getRuntimeHealth(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const startedAt = Date.now()
    const [runtime, contract] = await Promise.all([
      this.runtime.getRuntimeHealth(),
      this.runtime.getRuntimeContract(),
    ])
    const latencyMs = Math.max(0, Date.now() - startedAt)
    const degraded = runtime.status === 'degraded' || contract.status === 'degraded'
    const unavailable = runtime.status === 'unavailable' || contract.status === 'unavailable'
    const contractMismatch = runtime.status === 'contract_mismatch' || contract.status === 'contract_mismatch'
    const drift = runtime.contractVersion !== contract.contractVersion || runtime.runtimeVersion !== contract.runtimeVersion
    if (degraded || unavailable || contractMismatch || drift) {
      await this.recordRuntimeObservation(ctx, {
        runtime,
        contract,
        latencyMs,
        degraded,
        unavailable,
        contractMismatch,
        drift,
      })
    }
    return {
      runtime,
      contract,
      observability: {
        latencyMs,
        degraded,
        unavailable,
        contractMismatch,
        drift,
        degradedMode: degraded ? 'read_existing_artifacts_and_block_unsafe_runtime_switch' : 'none',
        rollbackAvailable: false,
        rollbackMode: 'external_config_required',
      },
    }
  }

  async requestRuntimeRollback(ctx: RequestContext, input: { reason?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const [runtime, contract] = await Promise.all([
      this.runtime.getRuntimeHealth(),
      this.runtime.getRuntimeContract(),
    ])
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'runtime.config.rollback.requested',
      targetType: 'runtime_config',
      targetId: runtime.runtime,
      reason: input.reason ?? null,
      metadata: {
        status: 'unsupported_external_config_required',
        runtimeProviderId: runtime.runtime,
        runtimeStatus: runtime.status,
        contractStatus: contract.status,
        runtimeVersion: runtime.runtimeVersion,
        contractVersion: contract.contractVersion,
        message: 'Runtime config rollback is recorded by DUDesign but must be executed by deployment/config management.',
      },
    })
    return {
      status: 'unsupported_external_config_required',
      message: 'DUDesign recorded the rollback request. Switch the active runtime config through deployment/config management, then re-run runtime health.',
      runtime,
      contract,
      audit,
    }
  }

  private async recordRuntimeObservation(ctx: RequestContext, input: {
    runtime: Awaited<ReturnType<RuntimeGateway['getRuntimeHealth']>>
    contract: Awaited<ReturnType<RuntimeGateway['getRuntimeContract']>>
    latencyMs: number
    degraded: boolean
    unavailable: boolean
    contractMismatch: boolean
    drift: boolean
  }): Promise<void> {
    const action = input.contractMismatch
      ? 'runtime.contract_mismatch'
      : input.unavailable
        ? 'runtime.unavailable'
        : input.drift
          ? 'runtime.drift_detected'
          : 'runtime.degraded'
    await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action,
      targetType: 'runtime',
      targetId: input.runtime.runtime,
      reason: input.runtime.message ?? input.contract.status,
      metadata: {
        latencyMs: input.latencyMs,
        runtimeProviderId: input.runtime.runtime,
        runtimeStatus: input.runtime.status,
        contractStatus: input.contract.status,
        runtimeVersion: input.runtime.runtimeVersion,
        runtimeContractVersion: input.runtime.contractVersion,
        contractRuntimeVersion: input.contract.runtimeVersion,
        contractVersion: input.contract.contractVersion,
        degraded: input.degraded,
        unavailable: input.unavailable,
        contractMismatch: input.contractMismatch,
        drift: input.drift,
      },
    })
  }

  private async requireAdminRole(
    ctx: RequestContext,
    allowed: Array<NonNullable<RequestContext['adminRole']>>,
  ): Promise<void> {
    if (!ctx.userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const user = await this.store.getUserById(ctx.userId)
    if (!user) throw applicationError(401, 'UNAUTHENTICATED', `Unknown user: ${ctx.userId}`)
    if (user.status !== 'active') throw applicationError(403, 'USER_DISABLED', `User disabled: ${ctx.userId}`)
    if (!ctx.adminRole || !allowed.includes(ctx.adminRole)) {
      throw applicationError(403, 'ADMIN_FORBIDDEN', 'This admin action requires a higher role.')
    }
  }
}

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
