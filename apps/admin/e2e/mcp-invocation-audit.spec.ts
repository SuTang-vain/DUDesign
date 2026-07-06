import { expect, test, type Page, type Route } from '@playwright/test'

const checkedAt = '2026-07-06T10:00:00.000Z'
const longReplayKey = `mcp-replay:mcpinv_${'a'.repeat(96)}`

test('MCP invocation audit supports filters and long replay keys', async ({ page }) => {
  const requests: string[] = []
  await mockAdminApi(page, requests)

  await page.goto('/')
  await page.getByTestId('admin-role-select').selectOption('support')
  await page.getByRole('button', { name: 'Audit & MCP' }).click()

  await expect(page.getByTestId('mcp-health-panel')).toContainText('degraded')
  await expect(page.getByTestId('mcp-health-panel')).toContainText('67%')
  const democaseHealthRow = page.getByTestId('mcp-tool-health-row').filter({ hasText: 'mcp_encyclopedia_democase_readonly' })
  await expect(democaseHealthRow).toContainText('mcp_encyclopedia_democase_readonly')
  await expect(democaseHealthRow).toContainText('MCP_UNAVAILABLE')
  await expect(page.getByTestId('mcp-invocation-audit-panel')).toBeVisible()
  await expect(page.getByTestId('mcp-invocation-audit-row')).toContainText('mcpinv_ok_long')
  await expect(page.getByTestId('mcp-invocation-audit-row')).toContainText(longReplayKey)

  await page.getByLabel('Job').fill('job_filtered')
  await page.getByLabel('Variation').fill('var_02')
  await page.getByLabel('MCP tool').fill('mcp_encyclopedia_democase_readonly')
  await page.getByLabel('Status').selectOption('unavailable')

  await expect(page.getByTestId('mcp-invocation-audit-row')).toContainText('mcpinv_unavailable_filtered')
  await expect(page.getByTestId('mcp-invocation-audit-row')).toContainText('MCP_UNAVAILABLE')
  await expect(page.getByTestId('mcp-invocation-audit-row')).toContainText('Real democase server is temporarily unavailable.')
  await expect.poll(() => requests.some(url =>
    url.includes('/api/admin/mcp/invocations')
    && url.includes('jobId=job_filtered')
    && url.includes('variationId=var_02')
    && url.includes('mcpToolId=mcp_encyclopedia_democase_readonly')
    && url.includes('status=unavailable'),
  )).toBe(true)
})

test('support can inspect MCP audits but cannot read the general audit log', async ({ page }) => {
  await mockAdminApi(page)

  await page.goto('/')
  await page.getByTestId('admin-role-select').selectOption('support')
  await page.getByRole('button', { name: 'Audit & MCP' }).click()

  await expect(page.getByTestId('mcp-invocation-audit-panel')).toContainText('mcpinv_ok_long')
  await expect(page.getByText('Support can read runtime health but cannot view audit logs.')).toBeVisible()
  await expect(page.getByText('mcp.invocation.executed')).toBeHidden()
})

async function mockAdminApi(page: Page, requests: string[] = []): Promise<void> {
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url())
    requests.push(`${url.pathname}${url.search}`)

    if (url.pathname === '/api/admin/runtime/health') {
      return json(route, runtimeHealth())
    }

    if (url.pathname === '/api/admin/mcp/invocations') {
      const filtered = url.searchParams.get('status') === 'unavailable'
      return json(route, {
        invocations: filtered ? [unavailableInvocation()] : [okInvocation()],
        filters: {
          jobId: url.searchParams.get('jobId'),
          variationId: url.searchParams.get('variationId'),
          mcpToolId: url.searchParams.get('mcpToolId'),
          status: url.searchParams.get('status'),
          limit: Number(url.searchParams.get('limit') ?? 50),
        },
      })
    }

    if (url.pathname === '/api/admin/mcp/summary') {
      return json(route, mcpSummary())
    }

    if (url.pathname === '/api/admin/audit-logs') {
      return json(route, {
        auditLogs: [{
          id: 'aud_mcp_001',
          requestId: 'req_admin',
          operatorUserId: 'usr_dev',
          operatorRole: 'operator',
          action: 'mcp.invocation.executed',
          targetType: 'mcp_invocation',
          targetId: 'mcpinv_ok_long',
          reason: 'General audit log should not be visible to support.',
          metadata: {},
          createdAt: checkedAt,
        }],
      })
    }

    if (url.pathname === '/api/admin/models') {
      return json(route, { models: [] })
    }

    if (url.pathname === '/api/admin/users/usr_dev/models') {
      return json(route, { userId: 'usr_dev', access: [] })
    }

    if (url.pathname === '/api/admin/capabilities/templates') {
      return json(route, emptyTemplateGovernance())
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
      return json(route, emptyMemoryGovernance())
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

function okInvocation() {
  return {
    invocationId: 'mcpinv_ok_long',
    replayKey: longReplayKey,
    userId: 'usr_dev',
    workspaceId: 'wrk_dev',
    sessionId: 'ses_dev',
    jobId: 'job_demo',
    variationId: 'var_01',
    mcpToolId: 'mcp_accessibility_validate',
    serverName: 'quality-tools',
    toolName: 'validateAccessibility',
    mode: 'authorized_invocation',
    status: 'ok',
    summary: 'Accessibility validation accepted for queued artifact review.',
    errorCode: null,
    errorMessage: null,
    policySnapshotHash: 'sha256:demo',
    runtimeContractVersion: '2026-06-30.dudesign-runtime.v1',
    referenceCount: 1,
    requestedAt: checkedAt,
    completedAt: checkedAt,
  }
}

function unavailableInvocation() {
  return {
    ...okInvocation(),
    invocationId: 'mcpinv_unavailable_filtered',
    replayKey: 'mcp-replay:mcpinv_unavailable_filtered',
    jobId: 'job_filtered',
    variationId: 'var_02',
    mcpToolId: 'mcp_encyclopedia_democase_readonly',
    serverName: 'encyclopedia-democase',
    toolName: 'readDemocase',
    status: 'unavailable',
    summary: 'MCP tool is temporarily unavailable.',
    errorCode: 'MCP_UNAVAILABLE',
    errorMessage: 'Real democase server is temporarily unavailable.',
    referenceCount: 0,
  }
}

function mcpSummary() {
  return {
    totals: {
      totalCount: 3,
      okCount: 2,
      deniedCount: 0,
      unavailableCount: 1,
      errorCount: 0,
      successRate: 0.667,
      unavailableRate: 0.333,
    },
    tools: [
      {
        mcpToolId: 'mcp_encyclopedia_democase_readonly',
        serverName: 'encyclopedia-democase',
        toolName: 'readDemocase',
        totalCount: 1,
        okCount: 0,
        deniedCount: 0,
        unavailableCount: 1,
        errorCount: 0,
        successRate: 0,
        unavailableRate: 1,
        lastStatus: 'unavailable',
        lastErrorCode: 'MCP_UNAVAILABLE',
        lastErrorMessage: 'Real democase server is temporarily unavailable.',
        lastInvokedAt: checkedAt,
        lastReplayKey: 'mcp-replay:mcpinv_unavailable_filtered',
      },
      {
        mcpToolId: 'mcp_accessibility_validate',
        serverName: 'quality-tools',
        toolName: 'validateAccessibility',
        totalCount: 2,
        okCount: 2,
        deniedCount: 0,
        unavailableCount: 0,
        errorCount: 0,
        successRate: 1,
        unavailableRate: 0,
        lastStatus: 'ok',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastInvokedAt: checkedAt,
        lastReplayKey: longReplayKey,
      },
    ],
    democase: {
      mcpToolId: 'mcp_encyclopedia_democase_readonly',
      totalCount: 1,
      okCount: 0,
      unavailableCount: 1,
      errorCount: 0,
      healthStatus: 'degraded',
      lastInvokedAt: checkedAt,
      lastErrorCode: 'MCP_UNAVAILABLE',
      lastErrorMessage: 'Real democase server is temporarily unavailable.',
    },
    filters: {
      mcpToolId: null,
      limit: 1000,
    },
  }
}

function runtimeHealth() {
  return {
    runtime: {
      status: 'compatible',
      runtime: 'babel-o',
      runtimeVersion: '0.9.0',
      contractVersion: '2026-06-30.dudesign-runtime.v1',
      checkedAt,
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
  }
}

function emptyTemplateGovernance() {
  return {
    templates: [],
    totals: {
      total: 0,
      official: 0,
      privateOrWorkspace: 0,
      businessTemplatePackages: 0,
      passed: 0,
      warning: 0,
      failed: 0,
    },
    registryAssets: [],
    registryTotals: {},
    governance: {
      canEditRegistry: false,
      canPublish: false,
      writeMode: 'planned',
      message: 'No template governance fixtures.',
    },
  }
}

function emptyMemoryGovernance() {
  return {
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
  }
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}
