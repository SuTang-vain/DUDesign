import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type {
  CreateAnnotationBatchResponse,
  AnalyzeDataIntakeResponse,
  AuthorizeMcpInvocationResponse,
  AdminMcpInvocationAuditResponse,
  AdminMcpInvocationSummaryResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  CreateSourceArtifactResponse,
  DesignJobSnapshotResponse,
  EncyclopediaEntryGuidanceResponse,
  ExecuteMcpInvocationResponse,
  ExportVariationResponse,
  ListDesignTemplatePacksResponse,
  RefineVariationResponse,
  RepairVariationPreviewResponse,
  ReplayMcpInvocationResponse,
  ReviewVariationActionResponse,
  RestoreVariationVersionResponse,
  SaveDesignTemplatePackResponse,
  SharedVariationResponse,
  ShareVariationResponse,
  VariationDetailResponse,
  VariationFilesResponse,
  ListCapabilitiesResponse,
} from '@dudesign/contracts'
import type { Artifact } from '@dudesign/domain'
import { ApplicationService } from './service.js'
import { createApiServer } from './server.js'
import { closePooledChromiumBrowser } from './playwrightBrowserPool.js'

type JobSnapshot = DesignJobSnapshotResponse

export type ApiFlowHarness = {
  service: ApplicationService
  baseUrl: string
  close(): Promise<void>
}

export async function startApiFlowHarness(service: ApplicationService): Promise<ApiFlowHarness> {
  const server = createApiServer(service)
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    service,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await service.flushBackgroundTasks()
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
      await closePooledChromiumBrowser()
    },
  }
}

export async function runApiFlowSmoke(harness: ApiFlowHarness): Promise<void> {
  const { baseUrl } = harness
  const sensitivePrompt = [
    'A landing page for a freelancer invoicing app',
    'Contact owner@example.com',
    'api_key=sk-test-admin-redaction-123456789',
    'Use local screenshot /Users/tangyaoyue/Desktop/private/mock.png',
  ].join(' ')

  async function waitForJob(jobId: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function waitForScreenshot(
    jobId: string,
    variationId: string,
    parentArtifactId?: string | null,
  ): Promise<JobSnapshot['artifacts'][number]> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 5000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      const screenshot = snapshot.artifacts.find(artifact =>
        artifact.kind === 'screenshot'
        && artifact.variationId === variationId
        && artifact.screenshotDevice === 'desktop'
        && (!parentArtifactId || artifact.parentArtifactId === parentArtifactId)
      )
      const variation = snapshot.variations.find(candidate => candidate.id === variationId)
      if (screenshot?.url && variation?.screenshotUrl === screenshot.url) return screenshot
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out waiting for screenshot for ${variationId}`)
  }

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, init)
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function getText(path: string): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.text()
  }

  async function postJson<T>(path: string, body: unknown, init?: Omit<RequestInit, 'body' | 'method'>): Promise<T> {
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function patchJson<T>(path: string, body: unknown, init?: Omit<RequestInit, 'body' | 'method'>): Promise<T> {
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function putJson<T>(path: string, body: unknown, init?: Omit<RequestInit, 'body' | 'method'>): Promise<T> {
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  const bootstrapResponse = await fetch(`${baseUrl}/api/dev/bootstrap`, {
    headers: { 'x-request-id': 'req_test_smoke' },
  })
  assert.equal(bootstrapResponse.headers.get('x-request-id'), 'req_test_smoke')
  assert.equal(bootstrapResponse.ok, true)
  const bootstrap = await bootstrapResponse.json() as { workspace: { id: string } }
  assert.equal(bootstrap.workspace.id, 'ws_dev')

  const capabilities = await getJson<ListCapabilitiesResponse>('/api/capabilities')
  assert.equal(capabilities.schemaVersion, '2026-07-01.dudesign-capabilities.v2')
  assert.ok(capabilities.domainTemplates.some(template => template.id === capabilities.defaults.domainTemplateId))
  assert.ok(capabilities.aestheticProfiles.some(profile => profile.id === capabilities.defaults.aestheticProfileId))
  assert.ok(capabilities.colorPalettes.some(palette => palette.id === capabilities.defaults.colorPaletteId))
  assert.ok(capabilities.brandStyleReferences.some(reference => reference.id === 'brand_apple_inspired'))
  const premiumMinimal = capabilities.aestheticProfiles.find(profile => profile.id === 'aes_premium_minimal')
  assert.ok(premiumMinimal?.mood.includes('premium'))
  assert.ok(premiumMinimal?.bestFor.includes('premium product pages'))
  assert.ok(capabilities.automationLoopProfiles.some(profile => profile.id === capabilities.defaults.loopProfileId))

  const defaultPreferences = await getJson<{
    capabilityPreference: {
      domainTemplateId: string | null
      aestheticProfileId: string | null
      colorPaletteId: string | null
      loopProfileId: string | null
    }
  }>('/api/preferences')
  assert.equal(defaultPreferences.capabilityPreference.domainTemplateId, capabilities.defaults.domainTemplateId)
  const updatedPreferences = await putJson<typeof defaultPreferences>('/api/preferences', {
    capabilityPreference: {
      domainTemplateId: 'tpl_premium_product_page',
      aestheticProfileId: 'aes_premium_minimal',
      colorPaletteId: 'pal_minimal_mono',
      loopProfileId: 'loop_standard',
    },
  })
  assert.equal(updatedPreferences.capabilityPreference.domainTemplateId, 'tpl_premium_product_page')
  assert.equal(updatedPreferences.capabilityPreference.aestheticProfileId, 'aes_premium_minimal')
  assert.equal(updatedPreferences.capabilityPreference.colorPaletteId, 'pal_minimal_mono')

  const sourceArtifact = await postJson<CreateSourceArtifactResponse>('/api/source-artifacts', {
    workspaceId: bootstrap.workspace.id,
    filename: 'uploaded-source.html',
    html: '<!doctype html><html><body><main><h1>Uploaded source page</h1><p>Base layout.</p></main></body></html>',
  })
  assert.ok(sourceArtifact.artifact.id.startsWith('art_'))
  assert.equal(sourceArtifact.artifact.entryPath, 'uploaded-source.html')
  assert.equal(sourceArtifact.artifact.kind, 'html')

  const existingSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'from_existing_html',
    sourceArtifactId: sourceArtifact.artifact.id,
    title: 'Existing HTML source smoke',
  })
  const existingJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: existingSession.session.id,
    prompt: 'Improve the uploaded source page without changing its product promise.',
    sourceMode: 'from_existing_html',
    sourceArtifactId: sourceArtifact.artifact.id,
    variationCount: 1,
    templateRequirements: {
      styles: ['existing-source'],
      deviceTargets: ['desktop'],
    },
  })
  const existingSnapshot = await waitForJob(existingJob.job.id)
  assert.equal(existingSnapshot.job.status, 'completed')
  const existingStoredSession = await harness.service.store.getSessionById(existingSession.session.id)
  assert.equal(existingStoredSession?.sourceArtifactId, sourceArtifact.artifact.id)
  const existingStoredJob = await harness.service.store.getJobById(existingJob.job.id)
  assert.equal(existingStoredJob?.sourceMode, 'from_existing_html')
  assert.equal(existingStoredJob?.productMode, 'web_app')

  const initialTemplates = await getJson<ListDesignTemplatePacksResponse>('/api/design-templates')
  assert.ok(initialTemplates.templates.length >= 6)
  const templateGovernance = await getJson<{
    templates: Array<{
      id: string
      category: string
      lintStatus: string
      childTemplates: Array<{ id: string }>
      promptBlockCoverage: { colors: boolean; components: boolean; sections: boolean; dos: boolean; donts: boolean }
      previewArtifact: { status: string }
      versionDiff: { status: string; currentVersion: string }
      designMd: { brokenReferenceCount: number; dangerousInstructionCount: number; previewSmokeStatus: string }
    }>
    totals: { businessTemplatePackages: number }
    privateTemplates: {
      count: number
      latestCreatedAt: string | null
      lint: { passed: number; warning: number; failed: number }
      previewArtifact: { available: number; missing: number }
    }
    dynamicEncyclopedia: {
      sourceOfTruth: string
      parentTemplatePackId: string
      childTemplates: Array<{ id: string; status: string }>
      interactionParadigms: Array<{ id: string; mappingStatus: string; compatibleTemplatePackIds: string[] }>
      categoryMappings: Array<{ category: string; interactionParadigmIds: string[]; templatePackIds: string[] }>
    }
    registryAssets: Array<{ id: string; type: string; status: string }>
    registryTotals: Record<string, number>
    governance: { writeMode: string; writeAuditAction: string }
  }>('/api/admin/capabilities/templates', {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  const encyclopediaGovernance = templateGovernance.templates.find(template => template.id === 'dtp_dynamic_encyclopedia_card')
  assert.ok(encyclopediaGovernance)
  assert.equal(encyclopediaGovernance.category, 'business-template-package')
  assert.equal(encyclopediaGovernance.lintStatus, 'passed')
  assert.ok(encyclopediaGovernance.childTemplates.some(template => template.id === 'summary-card'))
  assert.ok(encyclopediaGovernance.childTemplates.some(template => template.id === 'timeline-card'))
  assert.deepEqual(encyclopediaGovernance.promptBlockCoverage, {
    colors: true,
    components: true,
    sections: true,
    dos: true,
    donts: true,
  })
  assert.equal(encyclopediaGovernance.previewArtifact.status, 'missing')
  assert.equal(encyclopediaGovernance.versionDiff.status, 'new')
  assert.equal(encyclopediaGovernance.designMd.brokenReferenceCount, 0)
  assert.equal(encyclopediaGovernance.designMd.dangerousInstructionCount, 0)
  assert.equal(templateGovernance.totals.businessTemplatePackages, 1)
  assert.equal(templateGovernance.privateTemplates.count, 0)
  assert.equal(templateGovernance.privateTemplates.latestCreatedAt, null)
  assert.equal(templateGovernance.dynamicEncyclopedia.parentTemplatePackId, 'dtp_dynamic_encyclopedia_card')
  assert.equal(templateGovernance.dynamicEncyclopedia.sourceOfTruth, 'InteractionParadigm.compatibleTemplatePackIds')
  assert.ok(templateGovernance.dynamicEncyclopedia.childTemplates.some(template => template.id === 'dtp_dynamic_encyclopedia_summary_card'))
  assert.ok(templateGovernance.dynamicEncyclopedia.interactionParadigms.some(paradigm =>
    paradigm.id === 'ip_timeline_story'
    && paradigm.mappingStatus === 'mapped'
    && paradigm.compatibleTemplatePackIds.includes('dtp_dynamic_encyclopedia_timeline_card'),
  ))
  assert.ok(templateGovernance.dynamicEncyclopedia.categoryMappings.some(mapping =>
    mapping.interactionParadigmIds.includes('ip_entity_summary')
    && mapping.templatePackIds.includes('dtp_dynamic_encyclopedia_summary_card'),
  ))
  assert.equal(templateGovernance.registryTotals['scene-template'] >= 1, true)
  assert.equal(templateGovernance.registryTotals['visual-profile'] >= 1, true)
  assert.equal(templateGovernance.registryTotals['color-palette'] >= 1, true)
  assert.equal(templateGovernance.registryTotals['brand-reference'] >= 1, true)
  assert.ok(templateGovernance.registryAssets.some(asset => asset.id === 'tpl_fintech_trust' && asset.type === 'scene-template'))
  assert.ok(templateGovernance.registryAssets.some(asset => asset.id === 'aes_trustworthy_saas' && asset.type === 'visual-profile'))
  assert.ok(templateGovernance.registryAssets.some(asset => asset.id === 'pal_blue_white_trust' && asset.type === 'color-palette'))
  assert.ok(templateGovernance.registryAssets.some(asset => asset.id === 'brand_apple_inspired' && asset.type === 'brand-reference'))
  assert.equal(templateGovernance.governance.writeMode, 'enabled')
  assert.equal(templateGovernance.governance.writeAuditAction, 'capability.governance.change')

  const governanceSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    title: 'Disabled plugin governance smoke',
  })
  const disabledPlugin = await patchJson<{
    plugin: { id: string; status: string; safetyLevel: string }
    affectedSkills: string[]
  }>('/api/admin/capabilities/plugins/plug_static_export_safe', {
    status: 'disabled',
    reason: 'API smoke verifies disabled risk plugin rejection.',
  }, {
    headers: { 'x-dudesign-admin-role': 'developer' },
  })
  assert.equal(disabledPlugin.plugin.status, 'disabled')
  assert.equal(disabledPlugin.plugin.safetyLevel, 'disabled')
  assert.deepEqual(disabledPlugin.affectedSkills, ['sk_static_export_safe'])
  const disabledCapabilities = await getJson<{ plugins: Array<{ id: string; status: string }> }>('/api/capabilities')
  assert.ok(disabledCapabilities.plugins.some(plugin => plugin.id === 'plug_static_export_safe' && plugin.status === 'disabled'))
  await assert.rejects(
    () => postJson('/api/design-jobs', {
      sessionId: governanceSession.session.id,
      prompt: 'Generate a page while disabled governance should block this skill.',
      variationCount: 1,
      capabilityRequirements: {
        plugins: { skillIds: ['sk_static_export_safe'] },
      },
    }),
    /CAPABILITY_PLUGIN_DISABLED/,
  )
  const reenabledPlugin = await patchJson<{ plugin: { id: string; status: string } }>('/api/admin/capabilities/plugins/plug_static_export_safe', {
    status: 'active',
    reason: 'API smoke restores plugin after disabled governance check.',
  }, {
    headers: { 'x-dudesign-admin-role': 'developer' },
  })
  assert.equal(reenabledPlugin.plugin.status, 'active')

  const importedTemplate = await postJson<SaveDesignTemplatePackResponse>('/api/design-templates/import-design-md', {
    name: 'Smoke Private Template',
    designMd: `---
name: Smoke Private Template
version: 1.0.0
colors:
  primary: "#102A43"
  on-primary: "#FFFFFF"
typography:
  body:
    fontFamily: Inter
    fontSize: 16px
spacing:
  md: 24px
rounded:
  sm: 6px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
---

## Overview

Reusable smoke test template.

## Do's and Don'ts

- Do: Keep the saved direction clear.
- Don't: Copy public brand trade dress.
`,
  })
  assert.equal(importedTemplate.template.source, 'user')
  assert.equal(importedTemplate.template.createdByUserId, 'usr_dev')
  assert.equal(importedTemplate.summary.errors, 0)

  const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'new_html',
    title: 'Smoke session',
  })
  assert.ok(createdSession.session.id.startsWith('ses_'))

  const dataIntake = await postJson<AnalyzeDataIntakeResponse>('/api/capabilities/data-intake/analyze', {
    workspaceId: bootstrap.workspace.id,
    prompt: '词条：百度百科，需要动态百科卡片，突出企业身份、关键事实、发展历程和 WISE iframe 兼容。',
    url: 'https://example.test/baidu-baike-context',
    tableText: 'name|foundedAt|category\n百度百科|2006|知识平台',
    democaseIds: ['demo_baidu_baike_company'],
  })
  assert.equal(dataIntake.artifact.kind, 'data_intake_analysis')
  assert.equal(dataIntake.artifact.workspaceId, bootstrap.workspace.id)
  assert.match(dataIntake.artifact.contentHash, /^sha256:/)
  assert.deepEqual(dataIntake.analysis.inputSources, ['prompt', 'url', 'table', 'democase'])
  assert.equal(dataIntake.analysis.recommendedScenarioTemplates[0]?.id, 'tpl_dynamic_encyclopedia_entry')
  assert.equal(dataIntake.analysis.recommendedDesignTemplatePacks[0]?.id, 'dtp_dynamic_encyclopedia_timeline_card')
  assert.ok(dataIntake.analysis.recommendedSkills.some(item => item.id === 'sk_data_intake_analysis'))
  assert.ok(dataIntake.analysis.riskFlags.includes('external-source-unreviewed'))
  assert.equal(dataIntake.analysis.reviewStatus, 'human_review_required')
  const storedDataIntake = await harness.service.artifacts.get(dataIntake.artifact.storageKey)
  const storedDataIntakeJson = JSON.parse(new TextDecoder().decode(storedDataIntake.body)) as AnalyzeDataIntakeResponse & { artifactId: string }
  assert.equal(storedDataIntakeJson.analysis.schemaVersion, '2026-07-06.dudesign-data-intake.v1')
  assert.equal(storedDataIntakeJson.artifactId, dataIntake.artifact.id)

  const entryGuidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
    workspaceId: bootstrap.workspace.id,
    entry: '百度百科：一家以搜索、人工智能和知识服务为核心的互联网公司',
    context: '需要生成动态百科词条卡片，突出企业身份、关键事实、发展节点和移动端 iframe 兼容。',
    maxTemplateRecommendations: 2,
    automationMode: 'auto',
  })
  assert.equal(entryGuidance.productMode, 'dynamic_encyclopedia_card')
  assert.equal(entryGuidance.classification.primaryCategory, '机构组织')
  assert.equal(entryGuidance.classification.secondaryCategory, '企业')
  assert.equal(entryGuidance.classification.tertiaryCategory, '知识服务')
  assert.equal(entryGuidance.classification.confidence > 0.8, true)
  assert.ok(entryGuidance.classification.signals.includes('搜索'))
  assert.equal(entryGuidance.democaseReferences[0]?.caseId, 'demo_baidu_baike_company')
  assert.deepEqual(entryGuidance.capabilityRequirements.plugins?.skillIds, ['sk_encyclopedia_entry_guidance', 'sk_dual_surface_strategy', 'sk_data_intake_analysis'])
  assert.deepEqual(entryGuidance.capabilityRequirements.plugins?.mcpToolIds, ['mcp_encyclopedia_democase_readonly'])
  assert.equal(entryGuidance.capabilityRequirements.automation?.loopProfileId, 'loop_encyclopedia_spec_review')
  assert.equal(entryGuidance.recommendedTemplates[0]?.designTemplatePackId, 'dtp_dynamic_encyclopedia_summary_card')
  assert.equal(entryGuidance.recommendedTemplates[0]?.interactionParadigmId, 'ip_entity_summary')
  assert.equal(entryGuidance.interactionParadigm.id, 'ip_entity_summary')
  assert.ok(entryGuidance.templateRequirements.businessContext.guidanceId.startsWith('eg_'))
  assert.equal(entryGuidance.templateRequirements.businessContext.interactionParadigmId, 'ip_entity_summary')
  assert.equal(entryGuidance.templateRequirements.businessContext.entryTertiaryCategory, '知识服务')
  assert.equal(entryGuidance.templateRequirements.businessContext.classification.l1, '机构组织')
  assert.equal(entryGuidance.templateRequirements.businessContext.classification.l2, '企业')
  assert.equal(entryGuidance.templateRequirements.businessContext.classification.l3, '知识服务')
  assert.equal(entryGuidance.templateRequirements.businessContext.interactionParadigm.id, 'ip_entity_summary')
  assert.equal(entryGuidance.templateRequirements.businessContext.childTemplates.length, 2)
  assert.equal(entryGuidance.templateRequirements.businessContext.childTemplates[0]?.selected, true)
  assert.equal(entryGuidance.templateRequirements.businessContext.reviewMode, 'auto')
  assert.equal(entryGuidance.status, 'draft')
  assert.equal(entryGuidance.requiresConfirmation, false)
  assert.equal(entryGuidance.confirmedAt, null)

  const reloadedEntryGuidance = await getJson<EncyclopediaEntryGuidanceResponse>(`/api/encyclopedia/entry-guidance/${entryGuidance.guidanceId}`)
  assert.equal(reloadedEntryGuidance.guidanceId, entryGuidance.guidanceId)
  assert.equal(reloadedEntryGuidance.status, 'draft')

  const lowConfidenceGuidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
    workspaceId: bootstrap.workspace.id,
    entry: '玄青云影',
    maxTemplateRecommendations: 2,
    automationMode: 'auto',
  })
  assert.equal(lowConfidenceGuidance.status, 'needs_confirmation')
  assert.equal(lowConfidenceGuidance.requiresConfirmation, true)
  assert.equal(lowConfidenceGuidance.classification.confidence < 0.6, true)
  assert.equal(lowConfidenceGuidance.classification.tertiaryCategory, '通用')
  assert.equal(lowConfidenceGuidance.democaseReferences.length, 0)
  assert.equal(lowConfidenceGuidance.interactionParadigm.id, 'ip_entity_summary')
  const confirmedLowConfidenceGuidance = await postJson<EncyclopediaEntryGuidanceResponse>(
    `/api/encyclopedia/entry-guidance/${lowConfidenceGuidance.guidanceId}/confirm`,
    {
      classificationOverride: {
        primaryCategory: '作品',
        secondaryCategory: '游戏',
        tertiaryCategory: '电子游戏',
      },
      selectedTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card'],
      automationMode: 'off',
    },
  )
  assert.equal(confirmedLowConfidenceGuidance.status, 'confirmed')
  assert.equal(confirmedLowConfidenceGuidance.requiresConfirmation, false)
  assert.equal(confirmedLowConfidenceGuidance.classification.primaryCategory, '作品')
  assert.equal(confirmedLowConfidenceGuidance.classification.secondaryCategory, '游戏')
  assert.equal(confirmedLowConfidenceGuidance.classification.tertiaryCategory, '电子游戏')
  assert.equal(confirmedLowConfidenceGuidance.interactionParadigm.id, 'ip_timeline_story')
  assert.deepEqual(confirmedLowConfidenceGuidance.templateRequirements.designTemplatePackIds, ['dtp_dynamic_encyclopedia_timeline_card'])
  assert.equal(confirmedLowConfidenceGuidance.capabilityRequirements.automation?.loopProfileId, 'loop_standard')

  const timelineDemocaseGuidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
    workspaceId: bootstrap.workspace.id,
    entry: '某科技公司的发展史与融资上市历程',
    maxTemplateRecommendations: 2,
    automationMode: 'auto',
  })
  assert.equal(timelineDemocaseGuidance.democaseReferences[0]?.caseId, 'demo_company_history')
  assert.equal(timelineDemocaseGuidance.interactionParadigm.id, 'ip_timeline_story')
  assert.equal(timelineDemocaseGuidance.recommendedTemplates[0]?.designTemplatePackId, 'dtp_dynamic_encyclopedia_timeline_card')

  const compareGuidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
    workspaceId: bootstrap.workspace.id,
    entry: '大语言模型和搜索引擎的概念区别、技术定义与适用场景对比',
    maxTemplateRecommendations: 3,
    automationMode: 'auto',
  })
  assert.equal(compareGuidance.interactionParadigm.id, 'ip_fact_compare')
  assert.ok(compareGuidance.recommendedTemplates.some(template => template.designTemplatePackId === 'dtp_dynamic_encyclopedia_compare_card'))
  assert.ok(compareGuidance.recommendedTemplates.some(template => template.designTemplatePackId === 'dtp_dynamic_encyclopedia_expandable_card'))

  const confirmedEntryGuidance = await postJson<EncyclopediaEntryGuidanceResponse>(
    `/api/encyclopedia/entry-guidance/${entryGuidance.guidanceId}/confirm`,
    {
      selectedTemplateIds: ['dtp_dynamic_encyclopedia_timeline_card'],
      automationMode: 'semi_auto',
    },
  )
  assert.equal(confirmedEntryGuidance.status, 'confirmed')
  assert.ok(confirmedEntryGuidance.confirmedAt)
  assert.equal(confirmedEntryGuidance.interactionParadigm.id, 'ip_timeline_story')
  assert.deepEqual(confirmedEntryGuidance.templateRequirements.designTemplatePackIds, ['dtp_dynamic_encyclopedia_timeline_card'])
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.interactionParadigmId, 'ip_timeline_story')
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.entryTertiaryCategory, '知识服务')
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.classification.l3, '知识服务')
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.interactionParadigm.id, 'ip_timeline_story')
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.childTemplates[0]?.designTemplatePackId, 'dtp_dynamic_encyclopedia_summary_card')
  assert.equal(confirmedEntryGuidance.templateRequirements.businessContext.reviewMode, 'semi_auto')
  assert.equal(confirmedEntryGuidance.capabilityRequirements.automation?.maxRepairAttempts, 1)

  const guidedJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: `生成 ${confirmedEntryGuidance.entry.title} 的动态百科词条卡片`,
    sourceMode: 'new_html',
    productMode: confirmedEntryGuidance.productMode,
    variationCount: 1,
    templateRequirements: {
      businessContext: {
        guidanceId: confirmedEntryGuidance.guidanceId,
      },
    },
  })
  const guidedSnapshot = await waitForJob(guidedJob.job.id)
  assert.equal(guidedSnapshot.job.productMode, 'dynamic_encyclopedia_card')
  assert.equal(guidedSnapshot.job.capabilitySnapshot?.template.domainTemplate.id, 'tpl_dynamic_encyclopedia_entry')
  assert.equal(guidedSnapshot.job.capabilitySnapshot?.automation.loopProfile.id, 'loop_encyclopedia_spec_review')
  assert.equal(guidedSnapshot.job.capabilitySnapshot?.automation.maxRepairAttempts, 1)
  assert.deepEqual(guidedSnapshot.job.capabilitySnapshot?.plugins.skillIds, ['sk_encyclopedia_entry_guidance', 'sk_dual_surface_strategy', 'sk_data_intake_analysis'])
  assert.deepEqual(guidedSnapshot.job.capabilitySnapshot?.plugins.mcpToolIds, ['mcp_encyclopedia_democase_readonly'])
  assert.equal(guidedSnapshot.job.designTemplatePacks[0]?.id, 'dtp_dynamic_encyclopedia_timeline_card')
  assert.equal(guidedSnapshot.variations[0]?.designTemplatePack?.id, 'dtp_dynamic_encyclopedia_timeline_card')
  assert.equal(guidedSnapshot.variations[0]?.reviewAction, null)
  const guidedVariationId = guidedSnapshot.variations[0]!.id
  const guidedArtifactId = guidedSnapshot.variations[0]!.currentArtifactId
  assert.ok(guidedArtifactId)
  const guidedReviewAction = await postJson<ReviewVariationActionResponse>(
    `/api/variations/${guidedVariationId}/review-actions`,
    { action: 'confirm_repair', artifactId: guidedArtifactId },
  )
  assert.equal(guidedReviewAction.status, 'repair_queued')
  assert.equal(guidedReviewAction.artifact?.id, guidedArtifactId)
  const guidedSnapshotAfterReview = await getJson<JobSnapshot>(`/api/design-jobs/${guidedJob.job.id}`)
  assert.equal(guidedSnapshotAfterReview.variations[0]?.reviewAction?.status, 'repair_queued')
  assert.equal(guidedSnapshotAfterReview.variations[0]?.reviewAction?.action, 'confirm_repair')
  assert.equal(guidedSnapshotAfterReview.variations[0]?.reviewAction?.artifactId, guidedArtifactId)
  const storedGuidedJob = await harness.service.store.getJobById(guidedJob.job.id)
  const storedGuidedBusinessContext = storedGuidedJob?.templateRequirements.businessContext as {
    guidanceId?: string
    interactionParadigmId?: string
    entryTertiaryCategory?: string
    classification?: { l1?: string; l2?: string; l3?: string; source?: string }
    childTemplates?: Array<{ designTemplatePackId?: string; selected?: boolean }>
    reviewMode?: string
  } | undefined
  assert.equal(storedGuidedBusinessContext?.guidanceId, confirmedEntryGuidance.guidanceId)
  assert.equal(storedGuidedBusinessContext?.interactionParadigmId, 'ip_timeline_story')
  assert.equal(storedGuidedBusinessContext?.entryTertiaryCategory, '知识服务')
  assert.equal(storedGuidedBusinessContext?.classification?.l1, '机构组织')
  assert.equal(storedGuidedBusinessContext?.classification?.l2, '企业')
  assert.equal(storedGuidedBusinessContext?.classification?.l3, '知识服务')
  assert.equal(storedGuidedBusinessContext?.classification?.source, 'mock_rules')
  assert.equal(storedGuidedBusinessContext?.childTemplates?.[0]?.designTemplatePackId, 'dtp_dynamic_encyclopedia_summary_card')
  assert.equal(storedGuidedBusinessContext?.childTemplates?.some(template => template.designTemplatePackId === 'dtp_dynamic_encyclopedia_timeline_card' && template.selected), true)
  assert.equal(storedGuidedBusinessContext?.reviewMode, 'semi_auto')

  const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: sensitivePrompt,
    sourceMode: 'new_html',
    productMode: 'dynamic_encyclopedia_card',
    variationCount: 3,
    capabilityRequirements: {
      template: {
        domainTemplateId: 'tpl_fintech_trust',
        aestheticProfileId: 'aes_trustworthy_saas',
        colorPaletteId: 'pal_blue_white_trust',
        brandStyleReferenceId: 'brand_apple_inspired',
        designTemplatePackIds: [importedTemplate.template.id],
        autoDistributeTemplatePacks: true,
      },
      automation: {
        loopProfileId: 'loop_standard',
        maxRepairAttempts: 1,
      },
      plugins: {
        skillIds: ['sk_static_export_safe', 'sk_accessibility_first'],
        mcpToolIds: ['mcp_accessibility_validate'],
      },
    },
    templateRequirements: {
      styles: ['minimal', 'editorial'],
      deviceTargets: ['desktop', 'mobile'],
      dataIntakeArtifactId: dataIntake.artifact.id,
      advancedConstraints: {
        colorPaletteId: 'pal_blue_white_trust',
        styleNotes: ['minimal', 'editorial'],
        brandStyleReferenceId: 'brand_apple_inspired',
        referenceBrand: 'Apple-inspired',
        negativeRequirements: ['No busy gradients'],
      },
    },
  })
  assert.equal(createdJob.variations.length, 3)

  const jobSnapshot = await waitForJob(createdJob.job.id)
  assert.equal(jobSnapshot.job.status, 'completed')
  assert.equal(jobSnapshot.job.productMode, 'dynamic_encyclopedia_card')
  const storedCreatedJob = await harness.service.store.getJobById(createdJob.job.id)
  assert.equal(storedCreatedJob?.productMode, 'dynamic_encyclopedia_card')
  const capabilitySnapshot = storedCreatedJob?.templateRequirements.capabilitySnapshot as {
    schemaVersion?: string
    template?: {
      domainTemplate?: { id?: string }
      aestheticProfile?: { id?: string }
      colorPalette?: { id?: string }
      brandStyleReference?: { id?: string } | null
    }
    automation?: {
      loopProfile?: { id?: string }
      maxRepairAttempts?: number
      maxCostCents?: number | null
      maxDurationMs?: number
    }
  } | undefined
  assert.equal(capabilitySnapshot?.schemaVersion, '2026-07-01.dudesign-capabilities.v2')
  assert.equal(capabilitySnapshot?.template?.domainTemplate?.id, 'tpl_fintech_trust')
  assert.equal(capabilitySnapshot?.template?.aestheticProfile?.id, 'aes_trustworthy_saas')
  assert.equal(capabilitySnapshot?.template?.colorPalette?.id, 'pal_blue_white_trust')
  assert.equal(capabilitySnapshot?.template?.brandStyleReference?.id, 'brand_apple_inspired')
  assert.equal(capabilitySnapshot?.automation?.loopProfile?.id, 'loop_standard')
  assert.equal(capabilitySnapshot?.automation?.maxRepairAttempts, 1)
  assert.equal(capabilitySnapshot?.automation?.maxCostCents, 200)
  assert.equal(capabilitySnapshot?.automation?.maxDurationMs, 300000)
  const dataIntakeSnapshot = storedCreatedJob?.templateRequirements.dataIntake as {
    artifactId?: string
    storageKey?: string
    contentHash?: string
    schemaVersion?: string
    reviewStatus?: string
  } | undefined
  assert.equal(storedCreatedJob?.templateRequirements.dataIntakeArtifactId, dataIntake.artifact.id)
  assert.equal(dataIntakeSnapshot?.artifactId, dataIntake.artifact.id)
  assert.equal(dataIntakeSnapshot?.storageKey, dataIntake.artifact.storageKey)
  assert.equal(dataIntakeSnapshot?.contentHash, dataIntake.artifact.contentHash)
  assert.equal(dataIntakeSnapshot?.schemaVersion, '2026-07-06.dudesign-data-intake.v1')
  assert.equal(dataIntakeSnapshot?.reviewStatus, 'human_review_required')
  const researchPolicyJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: sensitivePrompt,
    sourceMode: 'new_html',
    productMode: 'dynamic_encyclopedia_card',
    variationCount: 1,
    capabilityRequirements: {
      template: {
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
      },
      plugins: {
        skillIds: ['sk_research_brief_builder'],
        mcpToolIds: ['mcp_agent_reach_search'],
      },
    },
  })
  const researchPolicySnapshot = await waitForJob(researchPolicyJob.job.id)
  const executedResearchMcpInvocation = await postJson<ExecuteMcpInvocationResponse>('/api/mcp/invocations/execute', {
    userId: 'usr_dev',
    workspaceId: 'ws_dev',
    sessionId: createdSession.session.id,
    jobId: researchPolicyJob.job.id,
    variationId: researchPolicySnapshot.variations[0]!.id,
    runtimeSessionId: null,
    mcpToolId: 'mcp_agent_reach_search',
    serverName: 'agent-reach',
    toolName: 'search',
    scopes: ['readonly_context'],
    input: { query: 'dynamic encyclopedia card iframe interaction references' },
    reason: 'Create a reviewed research context artifact for a follow-up job.',
  })
  assert.equal(executedResearchMcpInvocation.result.status, 'ok')
  const researchContextArtifact = executedResearchMcpInvocation.result.data?.researchContextArtifact as {
    artifactId?: string
    storageKey?: string
    contentHash?: string
    schemaVersion?: string
    reviewStatus?: string
    query?: string
    sourceCount?: number
  } | undefined
  assert.ok(researchContextArtifact?.artifactId)
  assert.equal(researchContextArtifact?.schemaVersion, '2026-07-06.dudesign-research-context.v1')
  assert.equal(researchContextArtifact?.reviewStatus, 'auto_reviewed')
  assert.equal(researchContextArtifact?.sourceCount, 1)
  const storedResearchContext = await harness.service.artifacts.get(researchContextArtifact.storageKey!)
  assert.equal(storedResearchContext.metadata.kind, 'research_context')
  const imagePolicyJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: 'Create a dynamic encyclopedia card with an original abstract supporting illustration.',
    sourceMode: 'new_html',
    productMode: 'dynamic_encyclopedia_card',
    variationCount: 1,
    capabilityRequirements: {
      template: {
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
      },
      plugins: {
        skillIds: ['sk_visual_asset_brief'],
        mcpToolIds: ['mcp_image_generation_ark_seedream'],
      },
    },
  })
  const imagePolicySnapshot = await waitForJob(imagePolicyJob.job.id)
  const executedImageMcpInvocation = await postJson<ExecuteMcpInvocationResponse>('/api/mcp/invocations/execute', {
    userId: 'usr_dev',
    workspaceId: 'ws_dev',
    sessionId: createdSession.session.id,
    jobId: imagePolicyJob.job.id,
    variationId: imagePolicySnapshot.variations[0]!.id,
    runtimeSessionId: null,
    mcpToolId: 'mcp_image_generation_ark_seedream',
    serverName: 'image-generation',
    toolName: 'generateArkSeedreamImage',
    scopes: ['artifact_write', 'readonly_context'],
    input: {
      prompt: 'Original blue abstract knowledge-card illustration with soft geometric depth.',
      model: 'doubao-seedream-5-0-260128',
      size: '2K',
      watermark: true,
      usageContext: 'dynamic_encyclopedia_card',
      contentSafety: { policy: 'strict', allowBrandReference: false },
    },
    reason: 'Create a reviewed generated image artifact for card visual context.',
  })
  assert.equal(executedImageMcpInvocation.result.status, 'ok')
  const imageGenerationArtifact = executedImageMcpInvocation.result.data?.imageGenerationArtifact as {
    artifactId?: string
    storageKey?: string
    contentHash?: string
    schemaVersion?: string
    provider?: string
    usageContext?: string
    contentSafetyStatus?: string
    costCents?: number
  } | undefined
  assert.ok(imageGenerationArtifact?.artifactId)
  assert.equal(imageGenerationArtifact?.schemaVersion, '2026-07-06.dudesign-image-generation-artifact.v1')
  assert.equal(imageGenerationArtifact?.provider, 'mock')
  assert.equal(imageGenerationArtifact?.usageContext, 'dynamic_encyclopedia_card')
  assert.equal(imageGenerationArtifact?.contentSafetyStatus, 'passed')
  assert.equal(imageGenerationArtifact?.costCents, 12)
  const storedImageGeneration = await harness.service.artifacts.get(imageGenerationArtifact.storageKey!)
  assert.equal(storedImageGeneration.metadata.kind, 'image_generation')
  assert.equal(storedImageGeneration.metadata.contentSafetyStatus, 'passed')
  const blockedImageMcpInvocation = await postJson<ExecuteMcpInvocationResponse>('/api/mcp/invocations/execute', {
    userId: 'usr_dev',
    workspaceId: 'ws_dev',
    sessionId: createdSession.session.id,
    jobId: imagePolicyJob.job.id,
    variationId: imagePolicySnapshot.variations[0]!.id,
    runtimeSessionId: null,
    mcpToolId: 'mcp_image_generation_ark_seedream',
    serverName: 'image-generation',
    toolName: 'generateArkSeedreamImage',
    scopes: ['artifact_write', 'readonly_context'],
    input: {
      prompt: 'Use an exact copyrighted logo as the main visual.',
      usageContext: 'dynamic_encyclopedia_card',
      contentSafety: { policy: 'strict', allowBrandReference: false },
    },
    reason: 'Verify image generation safety blocks are visible in variation detail.',
  })
  assert.equal(blockedImageMcpInvocation.result.status, 'error')
  assert.equal(blockedImageMcpInvocation.result.error?.code, 'IMAGE_CONTENT_SAFETY_BLOCKED')
  const imageVariationDetail = await getJson<VariationDetailResponse>(`/api/variations/${encodeURIComponent(imagePolicySnapshot.variations[0]!.id)}`)
  assert.equal(imageVariationDetail.capabilityNotices[0]?.invocationId, blockedImageMcpInvocation.invocationId)
  assert.equal(imageVariationDetail.capabilityNotices[0]?.status, 'error')
  assert.equal(imageVariationDetail.capabilityNotices[0]?.error?.code, 'IMAGE_CONTENT_SAFETY_BLOCKED')
  assert.equal(imageVariationDetail.capabilityNotices[0]?.source.serverName, 'image-generation')
  assert.equal('request' in imageVariationDetail.capabilityNotices[0]!, false)
  const researchPinnedJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: sensitivePrompt,
    sourceMode: 'new_html',
    productMode: 'dynamic_encyclopedia_card',
    variationCount: 1,
    capabilityRequirements: {
      template: {
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
      },
      plugins: {
        skillIds: ['sk_research_brief_builder', 'sk_data_intake_analysis'],
        mcpToolIds: ['mcp_agent_reach_search'],
      },
    },
    templateRequirements: {
      researchContextArtifactIds: [researchContextArtifact.artifactId!],
    },
  })
  await waitForJob(researchPinnedJob.job.id)
  const storedResearchPinnedJob = await harness.service.store.getJobById(researchPinnedJob.job.id)
  const researchSnapshot = storedResearchPinnedJob?.templateRequirements.researchContexts as Array<{
    artifactId?: string
    storageKey?: string
    contentHash?: string
    schemaVersion?: string
    reviewStatus?: string
    query?: string
    sourceCount?: number
  }> | undefined
  assert.deepEqual(storedResearchPinnedJob?.templateRequirements.researchContextArtifactIds, [researchContextArtifact.artifactId])
  assert.equal(researchSnapshot?.[0]?.artifactId, researchContextArtifact.artifactId)
  assert.equal(researchSnapshot?.[0]?.storageKey, researchContextArtifact.storageKey)
  assert.equal(researchSnapshot?.[0]?.contentHash, researchContextArtifact.contentHash)
  assert.equal(researchSnapshot?.[0]?.schemaVersion, '2026-07-06.dudesign-research-context.v1')
  assert.equal(researchSnapshot?.[0]?.reviewStatus, 'auto_reviewed')
  assert.equal(researchSnapshot?.[0]?.query, 'dynamic encyclopedia card iframe interaction references')
  const advancedConstraints = storedCreatedJob?.templateRequirements.advancedConstraints as {
    brandStyleReferenceId?: string | null
    negativeRequirements?: string[]
  } | undefined
  assert.equal(advancedConstraints?.brandStyleReferenceId, 'brand_apple_inspired')
  assert.deepEqual(advancedConstraints?.negativeRequirements, ['No busy gradients'])
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.domainTemplate.id, 'tpl_fintech_trust')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.aestheticProfile.id, 'aes_trustworthy_saas')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.colorPalette.id, 'pal_blue_white_trust')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.brandStyleReference?.id, 'brand_apple_inspired')
  assert.match(jobSnapshot.job.capabilitySnapshot?.profileVersion ?? '', /^2026-/)
  assert.equal(jobSnapshot.job.capabilitySnapshot?.automation.loopProfile.id, 'loop_standard')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.automation.maxCostCents, 200)
  assert.equal(jobSnapshot.job.capabilitySnapshot?.automation.maxDurationMs, 300000)
  assert.deepEqual(jobSnapshot.job.capabilitySnapshot?.plugins.skillIds, ['sk_static_export_safe', 'sk_accessibility_first'])
  assert.deepEqual(jobSnapshot.job.capabilitySnapshot?.plugins.mcpToolIds, ['mcp_accessibility_validate'])
  assert.deepEqual(jobSnapshot.job.capabilitySnapshot?.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, ['mcp_accessibility_validate'])
  assert.equal(jobSnapshot.job.capabilitySnapshot?.plugins.pluginSnapshot?.skills[0]?.id, 'sk_static_export_safe')
  const authorizedMcpInvocation = await postJson<AuthorizeMcpInvocationResponse>('/api/mcp/invocations/authorize', {
    userId: 'usr_dev',
    workspaceId: 'ws_dev',
    sessionId: createdSession.session.id,
    jobId: createdJob.job.id,
    variationId: jobSnapshot.variations[0]!.id,
    runtimeSessionId: null,
    mcpToolId: 'mcp_accessibility_validate',
    serverName: 'quality-tools',
    toolName: 'validateAccessibility',
    scopes: ['validation_only'],
    input: { artifactId: jobSnapshot.variations[0]!.currentArtifactId },
    reason: 'Validate generated artifact accessibility.',
  })
  assert.equal(authorizedMcpInvocation.status, 'authorized')
  assert.equal(authorizedMcpInvocation.request.mcpToolId, 'mcp_accessibility_validate')
  assert.equal(authorizedMcpInvocation.invocationAuditRecord.invocationId, authorizedMcpInvocation.invocationId)
  assert.equal(authorizedMcpInvocation.invocationAuditRecord.result.status, 'ok')
  assert.match(authorizedMcpInvocation.invocationAuditRecord.replayKey, /^mcp-replay:mcpinv_/)
  const executedMcpInvocation = await postJson<ExecuteMcpInvocationResponse>('/api/mcp/invocations/execute', {
    userId: 'usr_dev',
    workspaceId: 'ws_dev',
    sessionId: createdSession.session.id,
    jobId: createdJob.job.id,
    variationId: jobSnapshot.variations[0]!.id,
    runtimeSessionId: null,
    mcpToolId: 'mcp_accessibility_validate',
    serverName: 'quality-tools',
    toolName: 'validateAccessibility',
    scopes: ['validation_only'],
    input: { artifactId: jobSnapshot.variations[0]!.currentArtifactId },
    reason: 'Execute accessibility validation for prompt context.',
  })
  assert.equal(executedMcpInvocation.status, 'authorized')
  assert.equal(executedMcpInvocation.result.status, 'ok')
  assert.equal(executedMcpInvocation.invocationAuditRecord.result.summary, 'Accessibility validation accepted for queued artifact review.')
  assert.match(executedMcpInvocation.toolContext?.contextText ?? '', /Source: quality-tools\.validateAccessibility/)
  const replayedMcpInvocation = await getJson<ReplayMcpInvocationResponse>(
    `/api/mcp/invocations/replay/${encodeURIComponent(executedMcpInvocation.invocationAuditRecord.replayKey)}`,
  )
  assert.equal(replayedMcpInvocation.invocationId, executedMcpInvocation.invocationId)
  assert.equal(replayedMcpInvocation.result.summary, executedMcpInvocation.result.summary)
  assert.equal(replayedMcpInvocation.toolContext?.contextText, executedMcpInvocation.toolContext?.contextText)
  const deniedMcpResponse = await fetch(`${baseUrl}/api/mcp/invocations/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'usr_dev',
      workspaceId: 'ws_dev',
      sessionId: createdSession.session.id,
      jobId: createdJob.job.id,
      variationId: jobSnapshot.variations[0]!.id,
      runtimeSessionId: null,
      mcpToolId: 'mcp_accessibility_validate',
      serverName: 'quality-tools',
      toolName: 'validateAccessibility',
      scopes: ['external_network'],
      input: { url: 'https://example.test' },
      reason: 'Attempt a scope that is outside the selected tool policy.',
    }),
  })
  assert.equal(deniedMcpResponse.ok, true)
  const deniedMcpInvocation = await deniedMcpResponse.json() as AuthorizeMcpInvocationResponse
  assert.equal(deniedMcpInvocation.status, 'denied')
  assert.equal(deniedMcpInvocation.code, 'MCP_SCOPE_DENIED')
  assert.equal(deniedMcpInvocation.invocationAuditRecord.result.status, 'denied')
  const mcpAudits = harness.service.store.listAuditLogs().filter(audit => audit.action.startsWith('mcp.invocation.'))
  assert.ok(mcpAudits.some(audit => audit.action === 'mcp.invocation.authorized' && audit.targetId === authorizedMcpInvocation.invocationId))
  assert.ok(mcpAudits.some(audit => audit.action === 'mcp.invocation.executed' && audit.targetId === executedMcpInvocation.invocationId))
  assert.ok(mcpAudits.some(audit => audit.action === 'mcp.invocation.replayed' && audit.targetId === executedMcpInvocation.invocationId))
  assert.ok(mcpAudits.some(audit => audit.action === 'mcp.invocation.denied' && audit.targetId === deniedMcpInvocation.invocationId))
  const mcpInvocationAuditRecords = await harness.service.store.listMcpInvocationAuditRecords({ jobId: createdJob.job.id })
  assert.equal(mcpInvocationAuditRecords.length, 3)
  assert.ok(mcpInvocationAuditRecords.some(record => record.invocationId === authorizedMcpInvocation.invocationId && record.result.status === 'ok'))
  assert.ok(mcpInvocationAuditRecords.some(record => record.invocationId === executedMcpInvocation.invocationId && record.result.summary === 'Accessibility validation accepted for queued artifact review.'))
  assert.ok(mcpInvocationAuditRecords.some(record => record.invocationId === deniedMcpInvocation.invocationId && record.result.status === 'denied'))
  const adminMcpInvocations = await getJson<AdminMcpInvocationAuditResponse>(
    `/api/admin/mcp/invocations?jobId=${encodeURIComponent(createdJob.job.id)}`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.equal(adminMcpInvocations.filters.jobId, createdJob.job.id)
  assert.ok(adminMcpInvocations.invocations.some(invocation =>
    invocation.invocationId === executedMcpInvocation.invocationId
    && invocation.status === 'ok'
    && invocation.replayKey === executedMcpInvocation.invocationAuditRecord.replayKey
  ))
  const deniedAdminMcpInvocations = await getJson<AdminMcpInvocationAuditResponse>(
    `/api/admin/mcp/invocations?jobId=${encodeURIComponent(createdJob.job.id)}&mcpToolId=${encodeURIComponent('mcp_accessibility_validate')}&status=denied`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.ok(deniedAdminMcpInvocations.invocations.every(invocation => invocation.status === 'denied'))
  assert.ok(deniedAdminMcpInvocations.invocations.some(invocation =>
    invocation.invocationId === deniedMcpInvocation.invocationId
    && invocation.errorCode === 'MCP_SCOPE_DENIED'
  ))
  const adminMcpSummary = await getJson<AdminMcpInvocationSummaryResponse>(
    `/api/admin/mcp/summary?mcpToolId=mcp_accessibility_validate&createdFrom=${encodeURIComponent('2000-01-01T00:00:00.000Z')}&createdTo=${encodeURIComponent('2999-01-01T00:00:00.000Z')}`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.equal(adminMcpSummary.filters.mcpToolId, 'mcp_accessibility_validate')
  assert.equal(adminMcpSummary.filters.createdFrom, '2000-01-01T00:00:00.000Z')
  assert.equal(adminMcpSummary.filters.createdTo, '2999-01-01T00:00:00.000Z')
  assert.equal(adminMcpSummary.totals.totalCount, 3)
  assert.equal(adminMcpSummary.totals.okCount, 2)
  assert.equal(adminMcpSummary.totals.deniedCount, 1)
  assert.ok(adminMcpSummary.tools.some(tool =>
    tool.mcpToolId === 'mcp_accessibility_validate'
    && tool.okCount === 2
    && tool.deniedCount === 1
    && tool.lastReplayKey
  ))
  assert.equal(jobSnapshot.job.designTemplatePacks.length, 3)
  assert.deepEqual(
    (storedCreatedJob?.templateRequirements.designTemplatePackVersions as Array<{ id: string; version: string }>).map(item => item.id),
    jobSnapshot.job.designTemplatePacks.map(template => template.id),
  )
  assert.equal(jobSnapshot.job.designTemplatePacks[0]!.id, importedTemplate.template.id)
  assert.equal(jobSnapshot.job.designTemplatePacks[0]!.version, '1.0.0')
  assert.equal(jobSnapshot.job.designTemplatePacks[0]!.name, 'Smoke Private Template')
  assert.equal(new Set(jobSnapshot.variations.map(variation => variation.designTemplatePack?.id)).size, 3)
  assert.equal(jobSnapshot.variations[0]!.designTemplatePack?.id, importedTemplate.template.id)
  assert.equal(jobSnapshot.variations[0]!.designTemplatePack?.version, '1.0.0')
  await harness.service.store.saveDesignTemplatePack({
    ...importedTemplate.template,
    name: 'Smoke Private Template v2',
    version: '2.0.0',
    rationale: {
      ...importedTemplate.template.rationale,
      overview: 'Updated template should not mutate old job snapshots.',
    },
  })
  const templateVersionV1 = await harness.service.store.getDesignTemplatePackVersion(
    importedTemplate.template.id,
    '1.0.0',
    'usr_dev',
    bootstrap.workspace.id,
  )
  const templateVersionV2 = await harness.service.store.getDesignTemplatePackVersion(
    importedTemplate.template.id,
    '2.0.0',
    'usr_dev',
    bootstrap.workspace.id,
  )
  assert.equal(templateVersionV1?.pack.name, 'Smoke Private Template')
  assert.equal(templateVersionV2?.pack.name, 'Smoke Private Template v2')
  const templatesAfterTemplateUpdate = await getJson<ListDesignTemplatePacksResponse>('/api/design-templates')
  const currentTemplate = templatesAfterTemplateUpdate.templates.find(template => template.id === importedTemplate.template.id)
  assert.equal(currentTemplate?.version, '2.0.0')
  assert.equal(currentTemplate?.name, 'Smoke Private Template v2')
  const stableJobSnapshot = await getJson<JobSnapshot>(`/api/design-jobs/${createdJob.job.id}`)
  assert.equal(stableJobSnapshot.job.designTemplatePacks[0]!.version, '1.0.0')
  assert.equal(stableJobSnapshot.job.designTemplatePacks[0]!.name, 'Smoke Private Template')
  assert.equal(stableJobSnapshot.variations[0]!.designTemplatePack?.version, '1.0.0')
  assert.equal(stableJobSnapshot.variations[0]!.designTemplatePack?.name, 'Smoke Private Template')
  assert.equal(jobSnapshot.variations.length, 3)
  assert.ok(jobSnapshot.variations.every(variation => variation.status === 'completed'))
  assert.equal(jobSnapshot.artifacts.filter(artifact => artifact.kind === 'html').length, 3)
  const firstScreenshot = await waitForScreenshot(createdJob.job.id, jobSnapshot.variations[0]!.id)
  const snapshotWithScreenshot = await getJson<JobSnapshot>(`/api/design-jobs/${createdJob.job.id}`)
  assert.equal(snapshotWithScreenshot.variations[0]!.screenshotUrl, firstScreenshot.url)
  const screenshotResponse = await fetch(`${baseUrl}${firstScreenshot.url}`)
  assert.equal(screenshotResponse.ok, true)
  assert.equal(screenshotResponse.headers.get('content-type'), 'image/png')
  assert.equal(new Uint8Array(await screenshotResponse.arrayBuffer()).slice(0, 4).join(','), '137,80,78,71')
  const capabilityUsage = harness.service.store.listUsageEvents({ jobId: createdJob.job.id })
  assert.equal(capabilityUsage.filter(event => event.kind === 'capability.template.selected').length, 3)
  assert.equal(capabilityUsage.filter(event => event.kind === 'capability.plugin.selected').length, 3)

  const sseReplay = await getText(`/api/design-jobs/${createdJob.job.id}/stream`)
  assert.match(sseReplay, /event: design\.variation_streaming/)
  assert.match(sseReplay, /event: design\.job_completed/)

  const variationId = jobSnapshot.variations[0]!.id
  const beforeRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(beforeRefine.currentArtifact?.version, 1)
  assert.equal(beforeRefine.job.capabilitySnapshot?.template.domainTemplate.id, 'tpl_fintech_trust')
  assert.equal(beforeRefine.job.capabilitySnapshot?.template.aestheticProfile.id, 'aes_trustworthy_saas')
  assert.equal(beforeRefine.variation.designTemplatePack?.id, importedTemplate.template.id)

  const refined = await postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
    prompt: 'Make the hero more confident and improve mobile spacing.',
    baseArtifactId: beforeRefine.currentArtifact!.id,
    deviceContext: 'mobile',
  })
  assert.ok(refined.artifact)
  assert.equal(refined.artifact.version, 2)

  const afterRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(afterRefine.currentArtifact?.version, 2)
  assert.deepEqual(afterRefine.artifacts.filter(artifact => artifact.kind === 'html').map(artifact => artifact.version), [2, 1])
  await waitForScreenshot(createdJob.job.id, variationId, afterRefine.currentArtifact?.id)
  const afterRefineWithScreenshot = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(afterRefineWithScreenshot.artifacts.some(artifact =>
    artifact.kind === 'screenshot'
    && artifact.parentArtifactId === afterRefine.currentArtifact?.id
    && artifact.screenshotDevice === 'desktop'
    && artifact.url?.includes('/screenshots/'),
  ), true)
  assert.equal(afterRefine.artifacts.find(artifact => artifact.id === afterRefine.currentArtifact?.id)?.isCurrent, true)

  const repairedPreview = await postJson<RepairVariationPreviewResponse>(`/api/variations/${variationId}/preview/repair`, {
    artifactId: afterRefine.currentArtifact!.id,
  })
  assert.equal(repairedPreview.artifact.id, afterRefine.currentArtifact!.id)
  assert.equal(repairedPreview.queueJob.kind, 'screenshot_job')
  await waitForScreenshot(createdJob.job.id, variationId, afterRefine.currentArtifact?.id)

  const savedTemplate = await postJson<SaveDesignTemplatePackResponse>(`/api/variations/${variationId}/save-template`, {
    name: 'Saved Smoke Template',
    artifactId: afterRefine.currentArtifact!.id,
  })
  assert.equal(savedTemplate.template.source, 'user')
  assert.equal(savedTemplate.template.createdByUserId, 'usr_dev')
  assert.equal(savedTemplate.template.previewArtifactId, afterRefine.currentArtifact!.id)
  const templatesAfterSave = await getJson<ListDesignTemplatePacksResponse>('/api/design-templates')
  assert.equal(templatesAfterSave.templates.some(template => template.id === savedTemplate.template.id), true)

  const annotated = await postJson<CreateAnnotationBatchResponse>(`/api/variations/${variationId}/annotations`, {
    artifactId: afterRefine.currentArtifact!.id,
    prompt: 'Apply this marked layout change.',
    shapes: [
      {
        type: 'rect',
        x: 0.12,
        y: 0.18,
        w: 0.32,
        h: 0.24,
        note: 'Give this area more breathing room.',
      },
    ],
  })
  assert.equal(annotated.annotationBatch.shapeCount, 1)
  assert.match(annotated.annotationBatch.promptSuffix, /rectangle at x=0\.120/)
  assert.equal(annotated.artifact?.version, 3)
  await attachAssetBackedHtml(harness, variationId, annotated.artifact!.id)

  const historicalFiles = await getJson<VariationFilesResponse>(
    `/api/variations/${variationId}/files?artifactId=${beforeRefine.currentArtifact!.id}`,
  )
  const currentFiles = await getJson<VariationFilesResponse>(
    `/api/variations/${variationId}/files?artifactId=${annotated.artifact!.id}`,
  )
  const historicalIndex = findFile(historicalFiles, 'index.html')
  const currentIndex = findFile(currentFiles, 'index.html')
  assert.equal(historicalFiles.artifact.id, beforeRefine.currentArtifact!.id)
  assert.equal(historicalFiles.artifact.version, 1)
  assert.equal(currentFiles.artifact.id, annotated.artifact!.id)
  assert.equal(currentFiles.artifact.version, 3)
  assert.equal(historicalIndex.kind, 'html')
  assert.match(historicalIndex.content, /version 1/)
  assert.doesNotMatch(historicalIndex.content, /iframe-ready HTML version 3/)
  assert.match(currentIndex.content, /iframe-ready HTML version 3/)
  assert.equal(findFile(currentFiles, 'styles/share-preview.css').kind, 'asset')

  const preview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(preview, /version 3/)
  assert.match(preview, /iframe-ready HTML/)
  assert.match(preview, /\/api\/variations\/var_.*\/assets\/styles\/share-preview\.css/)
  assert.match(preview, /\/api\/variations\/var_.*\/assets\/images\/mark\.svg/)
  const variationCss = await fetch(`${baseUrl}/api/variations/${variationId}/assets/styles/share-preview.css`)
  assert.equal(variationCss.ok, true)
  assert.equal(variationCss.headers.get('content-type'), 'text/css; charset=utf-8')
  assert.match(await variationCss.text(), /--share-accent/)

  const exported = await postJson<ExportVariationResponse>(`/api/variations/${variationId}/export`, {})
  assert.equal(exported.artifact.version, 3)
  assert.match(exported.artifact.filename, /variation-01-v3\.html/)
  assert.match(exported.artifact.html, /version 3/)
  assert.equal(exported.exportArtifact?.kind, 'export_zip')
  assert.match(exported.exportArtifact?.filename ?? '', /variation-01-v3\.zip/)
  assert.match(exported.exportArtifact?.contentHash ?? '', /^sha256:/)
  assert.deepEqual(exported.exportArtifact?.files, ['index.html', 'images/mark.svg', 'styles/share-preview.css'])
  assert.equal(exported.exportArtifact?.downloadUrl, `/api/artifacts/${exported.exportArtifact?.id}/download`)
  const exportZip = await fetch(`${baseUrl}${exported.exportArtifact!.downloadUrl}`)
  assert.equal(exportZip.ok, true)
  assert.equal(exportZip.headers.get('content-type'), 'application/zip')
  assert.match(exportZip.headers.get('content-disposition') ?? '', /variation-01-v3\.zip/)
  assert.deepEqual(listZipEntries(new Uint8Array(await exportZip.arrayBuffer())), [
    'index.html',
    'images/mark.svg',
    'styles/share-preview.css',
    'dudesign-export.json',
  ])
  const detailWithExport = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.ok(detailWithExport.artifacts.some(artifact =>
    artifact.kind === 'asset'
    && artifact.parentArtifactId === annotated.artifact!.id
    && artifact.entryPath === 'styles/share-preview.css',
  ))
  assert.ok(detailWithExport.artifacts.some(artifact =>
    artifact.kind === 'export_zip'
    && artifact.exportedFromArtifactId === annotated.artifact!.id
    && artifact.entryPath === exported.exportArtifact!.filename,
  ))

  const shared = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  })
  assert.ok(shared.share.token.startsWith('share_'))
  assert.match(shared.share.url, /^\/share\/share_/)

  const shareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(shareDetail.variation.id, variationId)
  assert.equal(shareDetail.artifact.version, 3)
  assert.match(shareDetail.artifact.html ?? '', /version 3/)
  assert.ok((shareDetail.artifact.html ?? '').includes(`/api/shares/${shared.share.token}/assets/styles/share-preview.css`))
  assert.ok((shareDetail.artifact.html ?? '').includes(`/api/shares/${shared.share.token}/assets/images/mark.svg`))
  const shareCss = await fetch(`${baseUrl}/api/shares/${shared.share.token}/assets/styles/share-preview.css`)
  assert.equal(shareCss.ok, true)
  assert.equal(shareCss.headers.get('cache-control'), 'public, max-age=300')
  assert.match(await shareCss.text(), /--share-accent/)

  const driftRefined = await postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
    prompt: 'Create a later edit that should not change the existing share.',
    baseArtifactId: shareDetail.artifact.id,
    deviceContext: 'desktop',
  })
  assert.equal(driftRefined.artifact?.version, 4)
  const driftPreview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(driftPreview, /version 4/)
  const stableShareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(stableShareDetail.artifact.id, shareDetail.artifact.id)
  assert.equal(stableShareDetail.artifact.version, 3)
  assert.match(stableShareDetail.artifact.html ?? '', /version 3/)
  assert.doesNotMatch(stableShareDetail.artifact.html ?? '', /version 4/)
  const historicalPreview = await getText(
    `/api/variations/${variationId}/preview?artifactId=${encodeURIComponent(shareDetail.artifact.id)}`,
  )
  assert.match(historicalPreview, /version 3/)
  assert.doesNotMatch(historicalPreview, /version 4/)
  assert.ok(historicalPreview.includes(
    `/api/variations/${variationId}/assets/styles/share-preview.css?artifactId=${shareDetail.artifact.id}`,
  ))
  const historicalVariationCss = await fetch(
    `${baseUrl}/api/variations/${variationId}/assets/styles/share-preview.css?artifactId=${encodeURIComponent(shareDetail.artifact.id)}`,
  )
  assert.equal(historicalVariationCss.ok, true)
  assert.match(await historicalVariationCss.text(), /--share-accent/)

  const restored = await postJson<RestoreVariationVersionResponse>(
    `/api/variations/${variationId}/versions/${beforeRefine.currentArtifact!.id}/restore`,
    {},
  )
  assert.equal(restored.artifact.version, 1)
  assert.equal(restored.variation.currentArtifactId, beforeRefine.currentArtifact!.id)
  const restoredDetail = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(restoredDetail.currentArtifact?.id, beforeRefine.currentArtifact!.id)
  assert.equal(restoredDetail.artifacts.find(artifact => artifact.id === beforeRefine.currentArtifact!.id)?.isCurrent, true)
  const restoredPreview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(restoredPreview, /version 1/)
  const restoredExport = await postJson<ExportVariationResponse>(`/api/variations/${variationId}/export`, {})
  assert.equal(restoredExport.artifact.version, 1)
  assert.match(restoredExport.artifact.filename, /variation-01-v1\.html/)
  const postRestoreShareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(postRestoreShareDetail.artifact.id, shareDetail.artifact.id)
  assert.equal(postRestoreShareDetail.artifact.version, 3)
  assert.match(postRestoreShareDetail.artifact.html ?? '', /version 3/)

  const expiredShare = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
    expiresAt: '2000-01-01T00:00:00.000Z',
  })
  const expiredResponse = await fetch(`${baseUrl}/api/shares/${expiredShare.share.token}`)
  assert.equal(expiredResponse.status, 410)
  const expiredPayload = await expiredResponse.json() as { error: { code: string } }
  assert.equal(expiredPayload.error.code, 'SHARE_EXPIRED')

  for (const visibility of ['private', 'password'] as const) {
    const restrictedShare = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
      visibility,
    })
    const restrictedResponse = await fetch(`${baseUrl}/api/shares/${restrictedShare.share.token}`)
    assert.equal(restrictedResponse.status, 403)
    const restrictedPayload = await restrictedResponse.json() as { error: { code: string } }
    assert.equal(restrictedPayload.error.code, 'SHARE_FORBIDDEN')
  }

  const shareToRevoke = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  })
  const revokeForbidden = await fetch(`${baseUrl}/api/shares/${shareToRevoke.share.token}/revoke`, {
    method: 'POST',
    headers: {
      'x-dudesign-user-id': 'usr_alt',
    },
  })
  assert.equal(revokeForbidden.status, 403)
  const revoked = await postJson<{ share: { token: string; revokedAt: string } }>(`/api/shares/${shareToRevoke.share.token}/revoke`, {})
  assert.equal(revoked.share.token, shareToRevoke.share.token)
  assert.match(revoked.share.revokedAt, /^\d{4}-/)
  const revokedResponse = await fetch(`${baseUrl}/api/shares/${shareToRevoke.share.token}`)
  assert.equal(revokedResponse.status, 410)
  const revokedPayload = await revokedResponse.json() as { error: { code: string } }
  assert.equal(revokedPayload.error.code, 'SHARE_REVOKED')

  const forbiddenJob = await fetch(`${baseUrl}/api/design-jobs/${createdJob.job.id}`, {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(forbiddenJob.status, 403)
  const forbiddenPayload = await forbiddenJob.json() as { error: { code: string } }
  assert.equal(forbiddenPayload.error.code, 'JOB_FORBIDDEN')

  const altBootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap', {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(altBootstrap.workspace.id, 'ws_alt')

  const altSessions = await getJson<{ sessions: unknown[] }>('/api/sessions', {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(altSessions.sessions.length, 0)

  const runtimeHealth = await getJson<{ runtime: { status: string }; contract: { status: string } }>('/api/admin/runtime/health', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(runtimeHealth.runtime.status, 'compatible')
  assert.equal(runtimeHealth.contract.status, 'compatible')

  const adminJobs = await getJson<{
    jobs: Array<{
      id: string
      status: string
      prompt: string
      userId: string
      workspaceId: string
      sessionId: string
      completedVariationCount: number
      variations: Array<{ id: string; status: string; errorMessage: string | null }>
    }>
  }>('/api/admin/jobs', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.ok(adminJobs.jobs.some(job => job.id === createdJob.job.id && job.completedVariationCount === 3))
  const adminJob = adminJobs.jobs.find(job => job.id === createdJob.job.id)
  assert.ok(adminJob)
  assert.equal(adminJob.variations.length, 3)
  assert.ok(adminJob.variations.some(variation => variation.id === variationId && variation.status === 'completed'))
  assert.match(adminJob.prompt, /\[redacted-email\]/)
  assert.match(adminJob.prompt, /\[redacted-secret\]/)
  assert.match(adminJob.prompt, /\[redacted-path\]/)
  assert.doesNotMatch(adminJob.prompt, /owner@example\.com/)
  assert.doesNotMatch(adminJob.prompt, /sk-test-admin-redaction/)
  assert.doesNotMatch(adminJob.prompt, /\/Users\/tangyaoyue/)

  const filteredAdminJobs = await getJson<{ jobs: Array<{ id: string }> }>(
    `/api/admin/jobs?userId=usr_dev&workspaceId=${encodeURIComponent(adminJob.workspaceId)}&sessionId=${encodeURIComponent(adminJob.sessionId)}&status=completed`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.ok(filteredAdminJobs.jobs.some(job => job.id === createdJob.job.id))

  const timeFilteredAdminJobs = await getJson<{ jobs: Array<{ id: string }> }>(
    `/api/admin/jobs?createdFrom=${encodeURIComponent('2000-01-01T00:00:00.000Z')}&createdTo=${encodeURIComponent('2999-01-01T00:00:00.000Z')}`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.ok(timeFilteredAdminJobs.jobs.some(job => job.id === createdJob.job.id))

  const adminArtifacts = await getJson<{
    artifacts: Array<{
      id: string
      jobId: string | null
      variationId: string | null
      kind: string
      storageKey: string
      contentHash: string
      previewUrl: string | null
      shareCount: number
    }>
  }>(`/api/admin/artifacts?jobId=${createdJob.job.id}&kind=html`, {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.ok(adminArtifacts.artifacts.some(artifact =>
    artifact.jobId === createdJob.job.id
    && artifact.variationId === variationId
    && artifact.kind === 'html'
    && artifact.storageKey.endsWith('/index.html')
    && artifact.contentHash.startsWith('sha256:')
    && artifact.previewUrl === `/api/variations/${variationId}/preview`
    && artifact.shareCount >= 1,
  ))
  const adminHtmlArtifact = adminArtifacts.artifacts.find(artifact =>
    artifact.variationId === variationId
    && artifact.kind === 'html'
    && artifact.shareCount >= 1
  )
  assert.ok(adminHtmlArtifact)
  const rebuiltScreenshot = await postJson<{
    queueJob: { kind: string; status: string }
    audit: { action: string }
  }>(`/api/admin/artifacts/${adminHtmlArtifact.id}/rebuild-screenshot`, {
    reason: 'Smoke rebuild screenshot',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(rebuiltScreenshot.queueJob.kind, 'screenshot_job')
  assert.equal(rebuiltScreenshot.audit.action, 'artifact.screenshot_rebuild')

  const repairedExport = await postJson<{
    exportArtifact: { id: string; kind: string; downloadUrl: string }
    audit: { action: string }
  }>(`/api/admin/artifacts/${adminHtmlArtifact.id}/repair-export`, {
    reason: 'Smoke repair export',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(repairedExport.exportArtifact.kind, 'export_zip')
  assert.match(repairedExport.exportArtifact.downloadUrl, /^\/api\/artifacts\/.+\/download$/)
  assert.equal(repairedExport.audit.action, 'artifact.export_repair')

  const adminRevocableShare = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  })
  const adminRevocableShareDetail = await getJson<SharedVariationResponse>(`/api/shares/${adminRevocableShare.share.token}`)
  const revokedArtifactShares = await postJson<{
    revokedCount: number
    audit: { action: string }
  }>(`/api/admin/artifacts/${adminRevocableShareDetail.artifact.id}/revoke-shares`, {
    reason: 'Smoke revoke shares',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(revokedArtifactShares.revokedCount >= 1, true)
  assert.equal(revokedArtifactShares.audit.action, 'artifact.shares_revoke')
  const adminRevokedShareResponse = await fetch(`${baseUrl}/api/shares/${adminRevocableShare.share.token}`)
  assert.equal(adminRevokedShareResponse.status, 410)

  const supportLookup = await getJson<{
    users: Array<{
      user: { id: string; email: string }
      sessions: Array<{
        id: string
        resumeState: string
        lastPromptPreview: string | null
        latestJob: { id: string; status: string } | null
        failureSummary: { severity: string; message: string; failedVariationCount: number }
      }>
    }>
  }>('/api/admin/support/users?userId=usr_dev', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(supportLookup.users[0]?.user.id, 'usr_dev')
  const supportSession = supportLookup.users[0]?.sessions.find(session => session.id === createdSession.session.id)
  assert.equal(supportSession?.resumeState, 'runtime_session_available')
  assert.equal(supportSession?.latestJob?.status, 'completed')
  assert.equal(supportSession?.failureSummary.severity, 'ok')
  assert.ok(typeof supportSession?.lastPromptPreview === 'string' || supportSession?.lastPromptPreview === null)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-email\]/)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-secret\]/)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-path\]/)

  const retryVariationForbidden = await fetch(`${baseUrl}/api/admin/jobs/${createdJob.job.id}/variations/${variationId}/retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'support',
    },
    body: JSON.stringify({ reason: 'support cannot retry variation' }),
  })
  assert.equal(retryVariationForbidden.status, 403)

  const retriedVariation = await postJson<{
    retry: { job: { id: string; variationCount: number } }
    audit: { action: string; targetId: string; metadata: { originalJobId: string; retriedJobId: string } }
  }>(`/api/admin/jobs/${createdJob.job.id}/variations/${variationId}/retry`, {
    reason: 'operator retry variation smoke',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(retriedVariation.retry.job.variationCount, 1)
  assert.equal(retriedVariation.audit.action, 'variation.retry')
  assert.equal(retriedVariation.audit.targetId, variationId)
  assert.equal(retriedVariation.audit.metadata.originalJobId, createdJob.job.id)
  assert.equal(retriedVariation.audit.metadata.retriedJobId, retriedVariation.retry.job.id)

  const sessionForFailure = await harness.service.store.getSessionById(createdSession.session.id)
  assert.ok(sessionForFailure)
  const failedJob = await harness.service.store.createJob({
    session: sessionForFailure,
    prompt: 'Failure summary redaction smoke',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const [failedVariation] = await harness.service.store.createVariations({ job: failedJob, count: 1 })
  assert.ok(failedVariation)
  await harness.service.store.applyVariationEvent({
    variationId: failedVariation.id,
    status: 'failed',
    errorCode: 'RUNTIME_FAILED',
    errorMessage: 'Failed for owner@example.com with token=ghp_admin_redaction_123456789 at /Users/tangyaoyue/Desktop/private/input.html',
  })
  await new Promise(resolve => setTimeout(resolve, 5))
  await harness.service.store.setJobStatus(failedJob.id, 'failed')

  const failedSupportLookup = await getJson<{
    users: Array<{
      sessions: Array<{
        id: string
        latestJob: { id: string; status: string } | null
        failureSummary: {
          severity: string
          examples: Array<{ message: string | null }>
        }
      }>
    }>
  }>('/api/admin/support/users?userId=usr_dev', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  const failedSupportSession = failedSupportLookup.users[0]?.sessions.find(session => session.id === createdSession.session.id)
  const failureExampleMessage = failedSupportSession?.failureSummary.examples[0]?.message ?? ''
  assert.equal(failedSupportSession?.latestJob?.id, failedJob.id)
  assert.equal(failedSupportSession?.failureSummary.severity, 'blocked')
  assert.match(failureExampleMessage, /\[redacted-email\]/)
  assert.match(failureExampleMessage, /\[redacted-secret\]/)
  assert.match(failureExampleMessage, /\[redacted-path\]/)
  assert.doesNotMatch(failureExampleMessage, /owner@example\.com/)
  assert.doesNotMatch(failureExampleMessage, /ghp_admin_redaction/)
  assert.doesNotMatch(failureExampleMessage, /\/Users\/tangyaoyue/)

  const memoryGovernance = await getJson<{
    users: Array<{
      userId: string
      memoryNamespace: string
      isolationStatus: string
      sessionCount: number
      runtimeSessionCount: number
      memoryRefCount: number
    }>
    totals: { userCount: number; isolatedUserCount: number; conflictUserCount: number }
    capabilities: { memoryNotes: string; memoryRefs: string }
  }>('/api/admin/memory', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  const devMemory = memoryGovernance.users.find(user => user.userId === 'usr_dev')
  const altMemory = memoryGovernance.users.find(user => user.userId === 'usr_alt')
  assert.equal(devMemory?.memoryNamespace, 'memory:user:usr_dev')
  assert.equal(altMemory?.memoryNamespace, 'memory:user:usr_alt')
  assert.equal(devMemory?.isolationStatus, 'isolated')
  assert.equal(altMemory?.isolationStatus, 'isolated')
  assert.equal(memoryGovernance.totals.conflictUserCount, 0)
  assert.equal(memoryGovernance.totals.isolatedUserCount >= 2, true)
  assert.equal(memoryGovernance.capabilities.memoryNotes, 'not_configured')
  assert.equal(memoryGovernance.capabilities.memoryRefs, 'event_stream_only')

  const cancellableJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: 'Generated job for admin cancellation',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })

  const cancelForbidden = await fetch(`${baseUrl}/api/admin/jobs/${cancellableJob.job.id}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'support',
    },
    body: JSON.stringify({ reason: 'support cannot cancel' }),
  })
  assert.equal(cancelForbidden.status, 403)

  const cancelResponse = await fetch(`${baseUrl}/api/admin/jobs/${cancellableJob.job.id}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'operator',
    },
    body: JSON.stringify({ reason: 'operator cancel smoke' }),
  })
  if (cancelResponse.status === 200) {
	    const cancelled = await cancelResponse.json() as {
	      job: { id: string; status: string }
	      runtime: { cancelled: boolean; cancelledVariationCount?: number }
	      audit: { action: string; targetId: string; reason: string }
	    }
	    assert.ok(['cancelled', 'completed'].includes(cancelled.job.status))
	    assert.equal(cancelled.runtime.cancelled, true)
	    assert.equal(cancelled.runtime.cancelledVariationCount, 1)
	    assert.equal(cancelled.audit.action, 'job.cancel')
    assert.equal(cancelled.audit.targetId, cancellableJob.job.id)
  } else {
    assert.equal(cancelResponse.status, 409)
    const cancelPayload = await cancelResponse.json() as { error: { code: string } }
    assert.equal(cancelPayload.error.code, 'JOB_NOT_CANCELLABLE')
  }

  const costSummary = await getJson<{
    totals: { jobCount: number; usageEventCount: number; inputTokens: number; outputTokens: number; costCents: number }
    byUser: Array<{ userId: string; usageEventCount: number; costCents: number }>
  }>('/api/admin/costs/summary', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(costSummary.totals.usageEventCount >= 12, true)
  assert.equal(costSummary.totals.costCents >= 30, true)
  assert.equal(costSummary.byUser[0]?.userId, 'usr_dev')
  assert.equal(costSummary.byUser[0]?.usageEventCount >= 12, true)

  const retried = await postJson<{
    retry: { job: { id: string; variationCount: number } }
    audit: { action: string; targetId: string; metadata: { retriedJobId: string } }
  }>(`/api/admin/jobs/${createdJob.job.id}/retry`, {
    reason: 'operator retry smoke',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.notEqual(retried.retry.job.id, createdJob.job.id)
  assert.equal(retried.retry.job.variationCount, 3)
  assert.equal(retried.audit.action, 'job.retry')
  assert.equal(retried.audit.targetId, createdJob.job.id)
  assert.equal(retried.audit.metadata.retriedJobId, retried.retry.job.id)

  const auditLogs = await getJson<{ auditLogs: Array<{ action: string; targetId: string }> }>('/api/admin/audit-logs', {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.ok(auditLogs.auditLogs.some(audit => audit.action === 'job.retry' && audit.targetId === createdJob.job.id))

  const retrySnapshot = await waitForJob(retried.retry.job.id)
  assert.equal(retrySnapshot.job.status, 'completed')
  assert.equal(retrySnapshot.variations.length, 3)
}

async function attachAssetBackedHtml(harness: ApiFlowHarness, variationId: string, htmlArtifactId: string): Promise<void> {
  const artifact = await harness.service.store.getArtifactById(htmlArtifactId)
  assert.ok(artifact)
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<link rel="stylesheet" href="./styles/share-preview.css">',
    '</head>',
    '<body>',
    '<main>iframe-ready HTML version 3</main>',
    '<img src="images/mark.svg" alt="mark">',
    '</body>',
    '</html>',
  ].join('')
  const storedHtml = await harness.service.artifacts.put({
    workspaceId: artifact.workspaceId,
    artifactId: artifact.id,
    relativePath: `v${artifact.version}/${artifact.entryPath ?? 'index.html'}`,
    contentType: 'text/html; charset=utf-8',
    body: html,
    metadata: { kind: 'html', test: 'share-assets' },
  })
  await harness.service.store.saveArtifact({
    ...artifact,
    storageKey: storedHtml.storageKey,
    contentHash: storedHtml.contentHash,
    sizeBytes: storedHtml.sizeBytes,
  })
  await createAssetArtifact(harness, artifact, variationId, 'styles/share-preview.css', 'text/css; charset=utf-8', ':root { --share-accent: #2454ff; }')
  await createAssetArtifact(harness, artifact, variationId, 'images/mark.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
}

async function createAssetArtifact(
  harness: ApiFlowHarness,
  htmlArtifact: Artifact,
  variationId: string,
  assetPath: string,
  contentType: string,
  body: string,
): Promise<void> {
  const assetArtifactId = `asset_${htmlArtifact.id}_${assetPath.replaceAll(/[^a-zA-Z0-9]+/g, '_')}`
  const stored = await harness.service.artifacts.put({
    workspaceId: htmlArtifact.workspaceId,
    artifactId: assetArtifactId,
    relativePath: `v${htmlArtifact.version}/${assetPath}`,
    contentType,
    body,
    metadata: { kind: 'asset', htmlArtifactId: htmlArtifact.id },
  })
  await harness.service.store.createArtifact({
    workspaceId: htmlArtifact.workspaceId,
    sessionId: htmlArtifact.sessionId,
    variationId,
    parentArtifactId: htmlArtifact.id,
    kind: 'asset',
    version: htmlArtifact.version,
    storageKey: stored.storageKey,
    entryPath: assetPath,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
    metadata: { test: 'share-assets', htmlArtifactId: htmlArtifact.id },
  })
}

function findFile(files: VariationFilesResponse, path: string): VariationFilesResponse['files'][number] {
  const file = files.files.find(item => item.path === path)
  assert.ok(file, `Expected variation files to include ${path}`)
  return file
}

function listZipEntries(zip: Uint8Array): string[] {
  const names: string[] = []
  const decoder = new TextDecoder()
  let offset = 0
  while (offset + 46 <= zip.byteLength) {
    const signature = readU32(zip, offset)
    if (signature === 0x02014b50) {
      const nameLength = readU16(zip, offset + 28)
      const extraLength = readU16(zip, offset + 30)
      const commentLength = readU16(zip, offset + 32)
      const nameStart = offset + 46
      names.push(decoder.decode(zip.slice(nameStart, nameStart + nameLength)))
      offset = nameStart + nameLength + extraLength + commentLength
      continue
    }
    offset += 1
  }
  return names
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}
