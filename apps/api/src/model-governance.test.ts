import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  AdminModelsResponse,
  AdminUserModelAccessResponse,
  CreateSessionResponse,
  ListUserModelsResponse,
} from '@dudesign/contracts'
import type { ModelService } from '@dudesign/domain'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('Model governance API', () => {
  let harness: ApiFlowHarness

  before(async () => {
    harness = await startApiFlowHarness(new ApplicationService())
  })

  after(async () => {
    await harness.close()
  })

  it('lists user-selectable models and blocks jobs when user access is disabled', async () => {
    const models = await getJson<ListUserModelsResponse>('/api/models')
    assert.ok(models.defaultModelId)
    assert.ok(models.models.some(model => model.id === models.defaultModelId))

    const disabled = await patchJson<{ access: { enabled: boolean } }>(
      `/api/admin/users/usr_dev/models/${encodeURIComponent(models.defaultModelId!)}`,
      { enabled: false },
    )
    assert.equal(disabled.access.enabled, false)

    const visibleAfterDisable = await getJson<ListUserModelsResponse>('/api/models')
    assert.equal(visibleAfterDisable.models.some(model => model.id === models.defaultModelId), false)

    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: 'ws_dev',
      mode: 'new_html',
      title: 'Model governance',
    })
    const forbidden = await fetch(`${harness.baseUrl}/api/design-jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: session.session.id,
        prompt: 'A SaaS landing page',
        sourceMode: 'new_html',
        modelServiceId: models.defaultModelId,
        variationCount: 1,
      }),
    })
    assert.equal(forbidden.status, 403)
    const forbiddenPayload = await forbidden.json() as { error: { code: string } }
    assert.equal(forbiddenPayload.error.code, 'MODEL_FORBIDDEN')
  })

  it('lets operators enable, disable, and set default model services', async () => {
    const beforeModels = await getJson<AdminModelsResponse>('/api/admin/models')
    const fast = beforeModels.models.find(model => model.id === 'mdl_babelo_fast')
    assert.ok(fast)

    const updated = await patchJson<{ model: { id: string; enabled: boolean; isDefault: boolean } }>(
      `/api/admin/models/${encodeURIComponent(fast.id)}`,
      { enabled: true, isDefault: true },
    )
    assert.equal(updated.model.id, fast.id)
    assert.equal(updated.model.enabled, true)
    assert.equal(updated.model.isDefault, true)

    const afterModels = await getJson<AdminModelsResponse>('/api/admin/models')
    assert.equal(afterModels.models.find(model => model.id === fast.id)?.isDefault, true)
    assert.equal(afterModels.models.filter(model => model.isDefault).length, 1)
  })

  it('shows per-user model usage details', async () => {
    const access = await getJson<AdminUserModelAccessResponse>('/api/admin/users/usr_dev/models')
    assert.equal(access.userId, 'usr_dev')
    assert.ok(access.access.some(item => item.modelServiceId === 'mdl_babelo_default'))
    assert.ok(access.access.every(item => item.usage.usageEventCount >= 0))
  })

  it('syncs runtime-discovered models into model services', async () => {
    const forbidden = await fetch(`${harness.baseUrl}/api/admin/models/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dudesign-admin-role': 'support',
      },
      body: JSON.stringify({}),
    })
    assert.equal(forbidden.status, 403)

    const oldRuntimeModel: ModelService = {
      id: 'mdl_runtime_old_missing',
      provider: 'babel-o',
      modelId: 'old/missing-runtime',
      displayName: 'Old Missing Runtime',
      description: 'Old runtime-discovered model',
      enabled: true,
      isDefault: false,
      capabilities: ['html_generation'],
      contextWindow: 8192,
      inputTokenCostCents: 1,
      outputTokenCostCents: 2,
      metadata: {
        source: 'runtime_discovery',
        runtimeProviderId: 'old',
        runtimeSyncedAt: '2026-01-01T00:00:00.000Z',
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await harness.service.store.upsertDiscoveredModelServices([oldRuntimeModel])

    const syncedResponse = await fetch(`${harness.baseUrl}/api/admin/models/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-dudesign-admin-role': 'operator',
      },
      body: JSON.stringify({}),
    })
    assert.equal(syncedResponse.ok, true, `/api/admin/models/sync failed with ${syncedResponse.status}`)
    const synced = await syncedResponse.json() as AdminModelsResponse & {
      createdCount: number
      updatedCount: number
      missingCount: number
      disabledMissingCount: number
      diff: Array<{ modelServiceId: string; changeType: string }>
      runtime: { modelCount: number; providerCount: number; defaultModel: string | null }
      audit: { action: string; metadata: { runtimeModelCount: number; missingCount: number; disabledMissingCount: number } }
    }
    assert.equal(synced.createdCount >= 1, true)
    assert.equal(synced.missingCount, 1)
    assert.equal(synced.disabledMissingCount, 1)
    assert.equal(synced.diff.some(item => item.modelServiceId === oldRuntimeModel.id && item.changeType === 'missing'), true)
    assert.equal(synced.runtime.providerCount, 1)
    assert.equal(synced.runtime.modelCount, 1)
    assert.equal(synced.runtime.defaultModel, 'local/coding-runtime')
    assert.equal(synced.audit.action, 'model.sync')
    assert.equal(synced.audit.metadata.runtimeModelCount, 1)
    assert.equal(synced.audit.metadata.missingCount, 1)
    assert.equal(synced.audit.metadata.disabledMissingCount, 1)

    const runtimeModel = synced.models.find(model => model.modelId === 'local/coding-runtime')
    assert.ok(runtimeModel)
    assert.equal(runtimeModel.provider, 'babel-o')
    assert.equal(runtimeModel.enabled, false)
    assert.equal(runtimeModel.metadata.source, 'runtime_discovery')
    assert.equal(runtimeModel.metadata.runtimeProviderId, 'local')
    assert.equal(runtimeModel.metadata.runtimeProviderAuthSource, 'none')

    const missingModel = synced.models.find(model => model.id === oldRuntimeModel.id)
    assert.ok(missingModel)
    assert.equal(missingModel.enabled, false)
    assert.equal(missingModel.metadata.runtimeMissingSinceLastSync, true)
  })

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      headers: { 'x-dudesign-admin-role': 'operator' },
    })
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function patchJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-dudesign-admin-role': 'operator',
      },
      body: JSON.stringify(body),
    })
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }
})
