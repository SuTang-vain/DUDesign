import { expect, test, type Route } from '@playwright/test'

const syncedAt = '2026-06-30T08:00:00.000Z'

test('model services show Babel-O sync diff and audit summary', async ({ page }) => {
  await mockAdminApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Model Services' }).click()
  await expect(page.getByTestId('model-services-panel')).toBeVisible()
  await expect(page.getByText('Seed Babel-O')).toBeVisible()

  await page.getByTestId('sync-models-button').click()
  await expect(page.getByTestId('model-sync-summary')).toContainText('1 created')
  await expect(page.getByTestId('model-sync-summary')).toContainText('1 missing')
  await expect(page.getByTestId('model-sync-summary')).toContainText('audit aud_model_sync_001')
  await expect(page.getByTestId('model-sync-diff')).toContainText('Coding Runtime')
  await expect(page.getByTestId('model-sync-diff')).toContainText('Old Missing Runtime')
  await expect(page.getByTestId('model-services-panel')).toContainText('runtime_discovery')
  await expect(page.getByTestId('model-services-panel')).toContainText('missing from runtime')
})

test('support can inspect model services but cannot trigger Babel-O sync', async ({ page }) => {
  let syncRequestCount = 0
  await mockAdminApi(page, {
    onSyncRequest: () => {
      syncRequestCount += 1
    },
  })

  await page.goto('/')
  await page.getByTestId('admin-role-select').selectOption('support')
  await page.getByRole('button', { name: 'Model Services' }).click()

  await expect(page.getByTestId('model-services-panel')).toBeVisible()
  await expect(page.getByText('Seed Babel-O')).toBeVisible()
  await expect(page.getByTestId('sync-models-button')).toBeDisabled()
  await page.getByTestId('sync-models-button').click({ force: true })
  await expect.poll(() => syncRequestCount).toBe(0)
  await expect(page.getByTestId('model-sync-summary')).toBeHidden()
})

async function mockAdminApi(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  options: { onSyncRequest?: () => void } = {},
): Promise<void> {
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()

    if (url.pathname === '/api/admin/runtime/health') {
      return json(route, {
        runtime: {
          status: 'compatible',
          runtime: 'babel-o',
          runtimeVersion: '0.9.0',
          contractVersion: '2026-06-30.dudesign-runtime.v1',
          checkedAt: syncedAt,
        },
        contract: {
          runtime: 'babel-o',
          runtimeVersion: '0.9.0',
          contractVersion: '2026-06-30.dudesign-runtime.v1',
          status: 'compatible',
          requiredEndpoints: ['/v1/runtime/models'],
          requiredEvents: ['variation.completed'],
          eventMappings: { 'variation.completed': 'design.variation_completed' },
        },
      })
    }

    if (url.pathname === '/api/admin/models' && method === 'GET') {
      return json(route, { models: [seedModel()] })
    }

    if (url.pathname === '/api/admin/models/sync' && method === 'POST') {
      options.onSyncRequest?.()
      return json(route, syncResponse())
    }

    if (url.pathname === '/api/admin/users/usr_dev/models') {
      return json(route, { userId: 'usr_dev', access: [] })
    }

    if (url.pathname === '/api/admin/audit-logs') {
      return json(route, { auditLogs: [] })
    }

    if (url.pathname === '/api/admin/jobs') {
      return json(route, { jobs: [] })
    }

    if (url.pathname === '/api/admin/artifacts') {
      return json(route, { artifacts: [] })
    }

    if (url.pathname === '/api/admin/support/users') {
      return json(route, { users: [] })
    }

    if (url.pathname === '/api/admin/memory') {
      return json(route, {
        users: [],
        totals: {
          userCount: 0,
          isolatedUserCount: 0,
          conflictUserCount: 0,
          missingNamespaceUserCount: 0,
          memoryRefCount: 0,
          pendingMemoryNoteCount: 0,
        },
        capabilities: {
          memoryNotes: 'not_configured',
          memoryRefs: 'event_stream_only',
        },
      })
    }

    if (url.pathname === '/api/admin/costs/summary') {
      return json(route, {
        totals: {
          jobCount: 0,
          usageEventCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
        },
        byUser: [],
      })
    }

    return json(route, { error: { message: `Unhandled ${method} ${url.pathname}` } }, 404)
  })
}

function syncResponse() {
  return {
    createdCount: 1,
    updatedCount: 1,
    missingCount: 1,
    disabledMissingCount: 1,
    diff: [
      {
        modelServiceId: 'mdl_runtime_local_coding_runtime',
        modelId: 'local/coding-runtime',
        displayName: 'Coding Runtime',
        runtimeProviderId: 'local',
        changeType: 'created',
        previousContextWindow: null,
        nextContextWindow: 32768,
        previousInputTokenCostCents: 0,
        nextInputTokenCostCents: 0,
        previousOutputTokenCostCents: 0,
        nextOutputTokenCostCents: 0,
      },
      {
        modelServiceId: 'mdl_runtime_old_missing',
        modelId: 'old/missing-runtime',
        displayName: 'Old Missing Runtime',
        runtimeProviderId: 'old',
        changeType: 'missing',
        previousContextWindow: 8192,
        nextContextWindow: 8192,
        previousInputTokenCostCents: 1,
        nextInputTokenCostCents: 1,
        previousOutputTokenCostCents: 2,
        nextOutputTokenCostCents: 2,
      },
    ],
    runtime: {
      type: 'runtime_models',
      version: 1,
      providerCount: 1,
      modelCount: 1,
      defaultModel: 'local/coding-runtime',
      activeProfile: 'local',
      syncedAt,
    },
    audit: {
      id: 'aud_model_sync_001',
      requestId: 'req_test',
      operatorUserId: 'usr_dev',
      operatorRole: 'operator',
      action: 'model.sync',
      targetType: 'model_service',
      targetId: 'runtime_discovery',
      reason: null,
      metadata: {},
      createdAt: syncedAt,
    },
    models: [
      syncedModel(),
      {
        ...seedModel(),
        enabled: false,
        metadata: {
          ...seedModel().metadata,
          runtimeMissingSinceLastSync: true,
          runtimeMissingAt: syncedAt,
        },
      },
    ],
  }
}

function seedModel() {
  return {
    id: 'mdl_runtime_old_missing',
    provider: 'babel-o',
    modelId: 'old/missing-runtime',
    displayName: 'Seed Babel-O',
    description: 'Seed model',
    enabled: true,
    isDefault: true,
    capabilities: ['html_generation'],
    contextWindow: 8192,
    inputTokenCostCents: 1,
    outputTokenCostCents: 2,
    metadata: {
      source: 'runtime_discovery',
      runtimeProviderId: 'old',
      runtimeProviderAuthSource: 'env',
      runtimeSyncedAt: '2026-01-01T00:00:00.000Z',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function syncedModel() {
  return {
    id: 'mdl_runtime_local_coding_runtime',
    provider: 'babel-o',
    modelId: 'local/coding-runtime',
    displayName: 'Coding Runtime',
    description: 'Local runtime-discovered model',
    enabled: false,
    isDefault: false,
    capabilities: ['html_generation', 'html_refine'],
    contextWindow: 32768,
    inputTokenCostCents: 0,
    outputTokenCostCents: 0,
    metadata: {
      source: 'runtime_discovery',
      runtimeProviderId: 'local',
      runtimeProviderAuthSource: 'none',
      runtimeSyncedAt: syncedAt,
    },
    createdAt: syncedAt,
    updatedAt: syncedAt,
  }
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
