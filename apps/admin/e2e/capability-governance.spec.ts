import { expect, test, type Page, type Route } from '@playwright/test'

const checkedAt = '2026-07-07T09:00:00.000Z'

test('template governance shows capability policy, skill, MCP, and automation metrics', async ({ page }) => {
  await mockAdminApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Templates' }).click()

  await expect(page.getByTestId('capability-governance-summary')).toContainText('DESIGN.md lint / diff / preview')
  await expect(page.getByTestId('capability-governance-summary')).toContainText('1 real · 1 policy')
  await expect(page.getByText('write audit action: capability.governance.change')).toBeVisible()

  await expect(page.getByTestId('private-template-governance-panel')).toContainText('User Private Templates')
  await expect(page.getByTestId('private-template-governance-panel')).toContainText('not tracked')
  await expect(page.getByTestId('dynamic-encyclopedia-governance-panel')).toContainText('Dynamic Encyclopedia Mapping')
  await expect(page.getByTestId('dynamic-encyclopedia-governance-panel')).toContainText('InteractionParadigm.compatibleTemplatePackIds')
  await expect(page.getByTestId('dynamic-encyclopedia-governance-panel')).toContainText('Timeline Story')

  await expect(page.getByTestId('skill-governance-panel')).toContainText('Static Export Safe')
  await expect(page.getByTestId('skill-governance-panel')).toContainText('prompt_block_only')
  await expect(page.getByTestId('mcp-policy-governance-panel')).toContainText('Image Generation')
  await expect(page.getByTestId('mcp-policy-governance-panel')).toContainText('real_invocation_opt_in')
  await expect(page.getByTestId('mcp-policy-governance-panel')).toContainText('policy_only')
  await expect(page.getByTestId('automation-loop-governance-panel')).toContainText('Encyclopedia Spec Review')
  await expect(page.getByTestId('automation-loop-governance-panel')).toContainText('pixel gate')

  await page.getByTestId('toggle-plugin-plug_static_export_safe').click()
  await expect(page.getByText('Disabled Static Export Safe')).toBeVisible()
  await expect(page.getByTestId('skill-governance-panel')).toContainText('disabled')
  await expect(page.getByTestId('toggle-plugin-plug_static_export_safe')).toHaveText('Enable plugin')
})

async function mockAdminApi(page: Page): Promise<void> {
  let staticExportPluginStatus: 'active' | 'disabled' = 'active'

  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url())
    const method = route.request().method()

    if (url.pathname === '/api/admin/runtime/health') return json(route, runtimeHealth())
    if (url.pathname === '/api/admin/audit-logs') return json(route, { auditLogs: [] })
    if (url.pathname === '/api/admin/mcp/invocations') {
      return json(route, { invocations: [], filters: { jobId: null, variationId: null, mcpToolId: null, status: null, limit: 50 } })
    }
    if (url.pathname === '/api/admin/mcp/summary') return json(route, emptyMcpSummary())
    if (url.pathname === '/api/admin/models') return json(route, { models: [] })
    if (url.pathname === '/api/admin/users/usr_dev/models') return json(route, { userId: 'usr_dev', access: [] })
    if (url.pathname === '/api/admin/capabilities/templates') return json(route, capabilityGovernance({ staticExportPluginStatus }))
    if (method === 'PATCH' && url.pathname === '/api/admin/capabilities/plugins/plug_static_export_safe') {
      const body = route.request().postDataJSON() as { status: 'active' | 'disabled' }
      staticExportPluginStatus = body.status
      return json(route, {
        plugin: {
          id: 'plug_static_export_safe',
          name: 'Static Export Safe',
          status: staticExportPluginStatus,
          safetyLevel: staticExportPluginStatus === 'disabled' ? 'disabled' : 'safe',
        },
        affectedSkills: ['sk_static_export_safe'],
        affectedMcpToolBindings: [],
        audit: {
          id: 'aud_capability_disable',
          action: 'capability.governance.change',
          targetType: 'capability_plugin',
          targetId: 'plug_static_export_safe',
          createdAt: checkedAt,
        },
      })
    }
    if (url.pathname === '/api/admin/jobs') return json(route, { jobs: [] })
    if (url.pathname === '/api/admin/artifacts') return json(route, { artifacts: [] })
    if (url.pathname === '/api/admin/support/users') return json(route, { users: [] })
    if (url.pathname === '/api/admin/memory') return json(route, emptyMemoryGovernance())
    if (url.pathname === '/api/admin/costs/summary') {
      return json(route, {
        totals: { jobCount: 0, usageEventCount: 0, inputTokens: 0, outputTokens: 0, costCents: 0 },
        byUser: [],
      })
    }

    return json(route, { error: { message: `Unhandled ${route.request().method()} ${url.pathname}` } }, 404)
  })
}

function capabilityGovernance({
  staticExportPluginStatus,
}: {
  staticExportPluginStatus: 'active' | 'disabled'
}) {
  return {
    templates: [
      {
        id: 'dtp_dynamic_encyclopedia_card',
        name: 'Dynamic Encyclopedia Card',
        description: 'Business template package for dynamic encyclopedia entries.',
        source: 'official',
        status: 'published',
        visibility: 'public',
        version: '1.0.0',
        lintStatus: 'passed',
        governanceStatus: 'published',
        category: 'business-template-package',
        colorTokenCount: 4,
        componentCount: 6,
        sectionCount: 5,
        childTemplates: [{ id: 'summary-card', name: '摘要卡', description: 'Summary card.' }],
        requiredActions: [],
        findings: [{ severity: 'info', code: 'lint-passed', message: 'Template pack passes CAP-6 governance lint.' }],
        promptBlockCoverage: { colors: true, components: true, sections: true, dos: true, donts: true },
        previewArtifact: { id: null, status: 'missing' },
        versionDiff: { currentVersion: '1.0.0', previousVersion: null, status: 'new', changedFields: ['initial version'] },
        designMd: { importStatus: 'missing', brokenReferenceCount: 0, dangerousInstructionCount: 0, previewSmokeStatus: 'pass' },
      },
    ],
    totals: { total: 1, official: 1, privateOrWorkspace: 0, businessTemplatePackages: 1, passed: 1, warning: 0, failed: 0 },
    privateTemplates: {
      count: 0,
      latestCreatedAt: null,
      lint: { passed: 0, warning: 0, failed: 0 },
      previewArtifact: { available: 0, missing: 0 },
    },
    dynamicEncyclopedia: {
      parentTemplatePackId: 'dtp_dynamic_encyclopedia_card',
      childTemplates: [
        { id: 'dtp_dynamic_encyclopedia_summary_card', name: 'Summary Card', status: 'active', parentTemplatePackId: 'dtp_dynamic_encyclopedia_card' },
        { id: 'dtp_dynamic_encyclopedia_timeline_card', name: 'Timeline Card', status: 'active', parentTemplatePackId: 'dtp_dynamic_encyclopedia_card' },
      ],
      interactionParadigms: [
        {
          id: 'ip_entity_summary',
          name: 'Entity Summary',
          compatibleTemplatePackIds: ['dtp_dynamic_encyclopedia_summary_card'],
          compatibleTemplateCount: 1,
          mappingStatus: 'mapped',
          bestFor: ['名人', '机构组织'],
        },
        {
          id: 'ip_timeline_story',
          name: 'Timeline Story',
          compatibleTemplatePackIds: ['dtp_dynamic_encyclopedia_timeline_card'],
          compatibleTemplateCount: 1,
          mappingStatus: 'mapped',
          bestFor: ['历史人物', '影视作品'],
        },
      ],
      categoryMappings: [
        { level: 'L1', category: '名人', interactionParadigmIds: ['ip_entity_summary'], templatePackIds: ['dtp_dynamic_encyclopedia_summary_card'] },
      ],
      sourceOfTruth: 'InteractionParadigm.compatibleTemplatePackIds',
    },
    skillGovernance: [
      {
        id: 'sk_static_export_safe',
        pluginId: 'plug_static_export_safe',
        pluginName: 'Static Export Safe',
        schemaVersion: '2026-07-01.dudesign-skill.v1',
        status: staticExportPluginStatus,
        safetyLevel: staticExportPluginStatus === 'disabled' ? 'disabled' : 'safe',
        category: 'quality',
        promptBlockCount: 1,
        ruleCount: 3,
        negativeRuleCount: 2,
        checklistCount: 3,
        allowedTemplateCategories: ['product'],
        visibility: 'official',
        policyMode: 'prompt_block_only',
        usage: usageMetrics({ usageCount: 4, successRate: 1 }),
        requiredActions: staticExportPluginStatus === 'disabled' ? ['Skill is disabled; keep hidden from generation defaults.'] : [],
      },
    ],
    mcpPluginGovernance: [
      {
        id: 'mcp_image_generation_ark_seedream',
        pluginId: 'plug_image_generation',
        pluginName: 'Image Generation',
        serverName: 'image-generation',
        toolName: 'generateArkSeedreamImage',
        status: 'active',
        safetyLevel: 'review_required',
        scopes: ['readonly_context', 'artifact_write'],
        requiresUserAuth: false,
        auditLevel: 'full',
        policyMode: 'real_invocation_opt_in',
        rolloutState: 'staging_real',
        visibility: 'official',
        allowedTemplateCategories: ['product', 'encyclopedia'],
        health: { totalCount: 3, successRate: 0.67, unavailableRate: 0.33, lastStatus: 'ok', lastErrorCode: null, lastInvokedAt: checkedAt },
        usage: usageMetrics({ usageCount: 3, successRate: 0.67, averageCostCents: 12 }),
        requiredActions: ['Review-required plugin needs explicit visibility and permission review before broad rollout.'],
      },
      {
        id: 'mcp_asset_library_readonly',
        pluginId: 'plug_asset_library_readonly',
        pluginName: 'Asset Library Readonly',
        serverName: 'asset-library',
        toolName: 'readApprovedAssets',
        status: 'active',
        safetyLevel: 'review_required',
        scopes: ['readonly_context'],
        requiresUserAuth: true,
        auditLevel: 'full',
        policyMode: 'policy_only',
        rolloutState: 'policy_only',
        visibility: 'official',
        allowedTemplateCategories: ['product'],
        health: { totalCount: 0, successRate: 0, unavailableRate: 0, lastStatus: null, lastErrorCode: null, lastInvokedAt: null },
        usage: usageMetrics({ usageCount: 0 }),
        requiredActions: ['No real invocation audit yet; this tool is effectively policy-only.'],
      },
    ],
    automationLoopGovernance: [
      {
        id: 'loop_encyclopedia_spec_review',
        name: 'Encyclopedia Spec Review',
        qualityGates: ['static', 'spec', 'pixel'],
        repairStrategy: 'spec_review_refine',
        maxRepairAttempts: 2,
        maxCostCents: 500,
        maxDurationMs: 720000,
        usage: usageMetrics({ usageCount: 2, successRate: 0.5, averageCostCents: 34 }),
        quality: { staticGate: true, pixelGate: true, specGate: true, repairEnabled: true },
        requiredActions: [],
      },
    ],
    quality: {
      templatesWithWarnings: 0,
      templatesBlocked: 0,
      riskyPlugins: 2,
      disabledPlugins: staticExportPluginStatus === 'disabled' ? 1 : 0,
      policyOnlyMcpTools: 1,
      realMcpTools: 1,
      automationLoopsWithPixelGate: 1,
      auditLogCount: 5,
      recentDriftCount: 0,
      previewSmoke: { status: 'available', passedCount: 1, warningCount: 0, failedCount: 0 },
      designMd: {
        lintAvailable: true,
        diffAvailable: true,
        previewSmokeAvailable: true,
        message: 'DESIGN.md import lint, template diff metadata, and preview smoke readiness are exposed for admin governance.',
      },
    },
    registryAssets: [],
    registryTotals: { total: 1, active: 1, warning: 0, blocked: 0, 'business-template-package': 1 },
    governance: {
      canEditRegistry: true,
      canPublish: true,
      writeMode: 'enabled',
      auditMode: 'visible',
      writeAuditAction: 'capability.governance.change',
      message: 'Risk plugin disable/enable is active and audited. Template publish/version actions remain planned.',
    },
  }
}

function usageMetrics(overrides: Partial<ReturnType<typeof baseUsageMetrics>> = {}) {
  return { ...baseUsageMetrics(), ...overrides }
}

function baseUsageMetrics() {
  return {
    usageCount: 0,
    successCount: 0,
    failureCount: 0,
    successRate: 0,
    averageCostCents: 0,
    totalCostCents: 0,
    lastUsedAt: null,
    recentFailureReasons: [],
    recentDriftCount: 0,
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
      requiredEndpoints: ['/v1/sessions'],
      requiredEvents: ['variation.completed'],
      eventMappings: { 'variation.completed': 'design.variation_completed' },
    },
  }
}

function emptyMcpSummary() {
  return {
    totals: { totalCount: 0, okCount: 0, deniedCount: 0, unavailableCount: 0, errorCount: 0, successRate: 0, unavailableRate: 0 },
    tools: [],
    democase: {
      mcpToolId: 'mcp_encyclopedia_democase_readonly',
      totalCount: 0,
      okCount: 0,
      unavailableCount: 0,
      errorCount: 0,
      healthStatus: 'no_data',
      lastInvokedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
    filters: { mcpToolId: null, createdFrom: null, createdTo: null, limit: 1000 },
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
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
