import { expect, test, type Page, type Route } from '@playwright/test'

const checkedAt = '2026-06-30T08:30:00.000Z'

test('runtime health shows compatible contract details', async ({ page }) => {
  await mockAdminApi(page, runtimeHealth('compatible'))

  await page.goto('/')

  await expect(page.getByTestId('runtime-health-panel')).toBeVisible()
  await expect(page.getByTestId('runtime-status-pill')).toHaveText('compatible')
  await expect(page.getByTestId('runtime-health-panel')).toContainText('0.9.0')
  await expect(page.getByTestId('runtime-health-panel')).toContainText('2026-06-30.dudesign-runtime.v1')
  await expect(page.getByTestId('runtime-health-panel')).toContainText('2')
  await expect(page.getByTestId('runtime-endpoints-panel')).toContainText('/v1/runtime/models')
})

test('runtime health surfaces contract mismatch state and message', async ({ page }) => {
  await mockAdminApi(page, runtimeHealth('contract_mismatch', 'Runtime contract version is outside the supported range.'))

  await page.goto('/')

  await expect(page.getByTestId('runtime-status-pill')).toHaveText('contract_mismatch')
  await expect(page.getByTestId('runtime-status-pill')).toHaveClass(/contract_mismatch/)
  await expect(page.getByTestId('runtime-health-panel')).toContainText('outside the supported range')
})

test('runtime health surfaces degraded state without hiding contract endpoints', async ({ page }) => {
  await mockAdminApi(page, runtimeHealth('degraded', 'Runtime is reachable but model discovery is partially unavailable.'))

  await page.goto('/')

  await expect(page.getByTestId('runtime-status-pill')).toHaveText('degraded')
  await expect(page.getByTestId('runtime-status-pill')).toHaveClass(/degraded/)
  await expect(page.getByTestId('runtime-health-panel')).toContainText('partially unavailable')
  await expect(page.getByTestId('runtime-endpoints-panel')).toContainText('/v1/sessions')
})

async function mockAdminApi(page: Page, runtimePayload: unknown): Promise<void> {
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/admin/runtime/health') {
      return json(route, runtimePayload)
    }

    if (url.pathname === '/api/admin/audit-logs') {
      return json(route, { auditLogs: [] })
    }

    if (url.pathname === '/api/admin/models') {
      return json(route, { models: [] })
    }

    if (url.pathname === '/api/admin/users/usr_dev/models') {
      return json(route, { userId: 'usr_dev', access: [] })
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

    return json(route, { error: { message: `Unhandled ${route.request().method()} ${url.pathname}` } }, 404)
  })
}

function runtimeHealth(
  status: 'compatible' | 'degraded' | 'unavailable' | 'contract_mismatch',
  message?: string,
) {
  return {
    runtime: {
      status,
      runtime: 'babel-o',
      runtimeVersion: status === 'contract_mismatch' ? '0.1.0' : '0.9.0',
      contractVersion: '2026-06-30.dudesign-runtime.v1',
      checkedAt,
      ...(message ? { message } : {}),
    },
    contract: {
      runtime: 'babel-o',
      runtimeVersion: status === 'contract_mismatch' ? '0.1.0' : '0.9.0',
      contractVersion: '2026-06-30.dudesign-runtime.v1',
      status,
      requiredEndpoints: ['/v1/runtime/models', '/v1/sessions'],
      requiredEvents: ['variation.completed', 'variation.failed'],
      eventMappings: {
        'variation.completed': 'design.variation_completed',
        'variation.failed': 'design.variation_failed',
      },
    },
  }
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
