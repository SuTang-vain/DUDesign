import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DataIntakeAnalysis, ImageGenerationArtifact, ImageGenerationRequest, ResearchContextArtifact } from '@dudesign/contracts'
import { listCapabilities, resolveCapabilitySnapshot } from './capabilities.js'

describe('capability plugin registry', () => {
  it('supports the ResearchContextArtifact contract for reviewed network context', () => {
    const researchContext: ResearchContextArtifact = {
      schemaVersion: '2026-07-06.dudesign-research-context.v1',
      query: 'dynamic encyclopedia card interaction references',
      sources: [
        {
          url: 'https://example.com/reference',
          title: 'Reference',
          platform: 'web',
          retrievedAt: '2026-07-06T00:00:00.000Z',
          licenseHint: 'unknown',
        },
      ],
      summary: 'Reviewed network context for design planning.',
      citations: [{ sourceUrl: 'https://example.com/reference', note: 'Use as context only.' }],
      confidence: 'medium',
      freshness: 'recent',
      riskFlags: ['source-review-required'],
      rawPayloadHash: 'hash_test',
      reviewStatus: 'auto_reviewed',
    }

    assert.equal(researchContext.sources[0]?.platform, 'web')
    assert.equal(researchContext.citations[0]?.sourceUrl, researchContext.sources[0]?.url)
    assert.equal(researchContext.reviewStatus, 'auto_reviewed')
  })

  it('supports the DataIntakeAnalysis contract for structured preflight briefs', () => {
    const analysis: DataIntakeAnalysis = {
      schemaVersion: '2026-07-06.dudesign-data-intake.v1',
      inputSources: ['prompt', 'url'],
      topicSummary: 'A trusted fintech landing page for a payments company.',
      entities: [{ name: 'Example Company', type: 'company', confidence: 0.86, source: 'prompt' }],
      fields: [
        { name: 'companyName', value: 'Example Company', confidence: 0.86, source: 'prompt' },
        { name: 'foundedAt', missing: true, confidence: 0.2, source: 'url' },
      ],
      missingFields: ['foundedAt'],
      recommendedScenarioTemplates: [{ id: 'tpl_fintech_trust', reason: 'The input describes a trust-heavy finance flow.', confidence: 0.9 }],
      recommendedDesignTemplatePacks: [{ id: 'dtp_premium_product_launch', reason: 'The supplied data is mostly product narrative.', confidence: 0.82 }],
      recommendedSkills: [{ id: 'sk_dual_surface_strategy', reason: 'The target requires PC and WISE delivery.', confidence: 0.78 }],
      riskFlags: ['missing-source-dates'],
      reviewStatus: 'auto_reviewed',
    }

    assert.equal(analysis.inputSources.includes('prompt'), true)
    assert.equal(analysis.fields.some(field => field.missing), true)
    assert.equal(analysis.recommendedSkills[0]?.id, 'sk_dual_surface_strategy')
  })

  it('supports the ImageGenerationRequest and ImageGenerationArtifact contracts for controlled visual assets', () => {
    const request: ImageGenerationRequest = {
      schemaVersion: '2026-07-06.dudesign-image-generation-request.v1',
      prompt: 'Abstract blue knowledge-card background, clean vector depth, no logos.',
      model: 'doubao-seedream-5-0-260128',
      size: '2K',
      watermark: true,
      usageContext: 'template_hero',
      variationId: 'var_01',
      templatePackId: 'dtp_premium_product_launch',
      contentSafety: {
        policy: 'strict',
        allowBrandReference: false,
      },
    }
    const artifact: ImageGenerationArtifact = {
      schemaVersion: '2026-07-06.dudesign-image-generation-artifact.v1',
      provider: 'ark_seedream',
      model: request.model,
      promptHash: 'a'.repeat(64),
      imageUrl: '/api/capability-artifacts/img_01',
      size: request.size,
      watermark: request.watermark,
      usageContext: request.usageContext,
      contentType: 'image/png',
      contentSafety: {
        status: 'passed',
        policy: 'strict',
      },
      costCents: 12,
      artifactId: 'img_01',
      createdAt: '2026-07-06T00:00:00.000Z',
    }

    assert.equal(request.contentSafety?.allowBrandReference, false)
    assert.equal(artifact.promptHash.length, 64)
    assert.equal(artifact.usageContext, 'template_hero')
  })

  it('lists automation loop profiles with stop condition defaults', () => {
    const capabilities = listCapabilities()
    const fast = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_fast')
    const standard = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_standard')
    const deep = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_deep_repair')

    assert.equal(fast?.repairStrategy, 'none')
    assert.equal(fast?.maxRepairAttempts, 0)
    assert.deepEqual(fast?.qualityGates, ['static'])
    assert.equal(standard?.maxCostCents, 200)
    assert.equal(standard?.maxDurationMs, 300000)
    assert.deepEqual(standard?.qualityGates, ['static'])
    assert.deepEqual(deep?.qualityGates, ['static', 'pixel'])
    assert.equal(deep?.repairStrategy, 'deep_refine')

  })

  it('snapshots loop stop condition overrides with conservative clamps', () => {
    const snapshot = resolveCapabilitySnapshot({
      automation: {
        loopProfileId: 'loop_deep_repair',
        maxRepairAttempts: 99,
        maxCostCents: 123.9,
        maxDurationMs: 9999999,
      },
    })

    assert.equal(snapshot.automation.loopProfile.id, 'loop_deep_repair')
    assert.equal(snapshot.automation.maxRepairAttempts, 3)
    assert.equal(snapshot.automation.maxCostCents, 123)
    assert.equal(snapshot.automation.maxDurationMs, 900000)
  })

  it('lists official declarative skills and MCP tool bindings', () => {
    const capabilities = listCapabilities()

    assert.ok(capabilities.plugins.some(plugin => plugin.id === 'plug_static_export_safe'))
    assert.ok(capabilities.skills.some(skill => skill.id === 'sk_static_export_safe'))
    assert.ok(capabilities.mcpToolBindings.some(binding => binding.id === 'mcp_accessibility_validate'))
    const dualSurfacePlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_dual_surface_strategy')
    const dualSurfaceSkill = capabilities.skills.find(skill => skill.id === 'sk_dual_surface_strategy')
    const dataIntakePlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_data_intake_analysis')
    const dataIntakeSkill = capabilities.skills.find(skill => skill.id === 'sk_data_intake_analysis')
    const researchPlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_research_context')
    const researchSkill = capabilities.skills.find(skill => skill.id === 'sk_research_brief_builder')
    const researchSearchBinding = capabilities.mcpToolBindings.find(binding => binding.id === 'mcp_agent_reach_search')
    const imagePlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_image_generation')
    const imageSkill = capabilities.skills.find(skill => skill.id === 'sk_visual_asset_brief')
    const imageBinding = capabilities.mcpToolBindings.find(binding => binding.id === 'mcp_image_generation_ark_seedream')
    assert.ok(dualSurfacePlugin)
    assert.equal(dualSurfacePlugin.category, 'responsive')
    assert.ok(dualSurfaceSkill)
    assert.equal(dualSurfaceSkill.pluginId, 'plug_dual_surface_strategy')
    assert.ok(dataIntakePlugin)
    assert.equal(dataIntakePlugin.category, 'research')
    assert.ok(dataIntakeSkill)
    assert.equal(dataIntakeSkill.pluginId, 'plug_data_intake_analysis')
    assert.ok(researchPlugin)
    assert.equal(researchPlugin.category, 'research')
    assert.equal(researchPlugin.safetyLevel, 'safe')
    assert.match(researchPlugin.description, /网络检索/)
    assert.equal(researchPlugin.permissionPolicy.auditLevel, 'full')
    assert.ok(researchSkill)
    assert.equal(researchSkill.pluginId, 'plug_research_context')
    assert.ok(researchSearchBinding)
    assert.equal(researchSearchBinding.serverName, 'agent-reach')
    assert.deepEqual(researchSearchBinding.scopes, ['readonly_context'])
    assert.ok(imagePlugin)
    assert.equal(imagePlugin.category, 'assets')
    assert.equal(imagePlugin.safetyLevel, 'safe')
    assert.match(imagePlugin.description, /视觉资产/)
    assert.equal(imagePlugin.permissionPolicy.auditLevel, 'full')
    assert.ok(imageSkill)
    assert.equal(imageSkill.pluginId, 'plug_image_generation')
    assert.ok(imageBinding)
    assert.equal(imageBinding.serverName, 'image-generation')
    assert.deepEqual(imageBinding.scopes, ['artifact_write', 'readonly_context'])
    const assetLibraryPlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_asset_library_readonly')
    assert.ok(assetLibraryPlugin)
    assert.equal(assetLibraryPlugin.safetyLevel, 'safe')
    assert.match(assetLibraryPlugin.description, /只读读取/)
    assert.equal(capabilities.plugins.every(plugin => plugin.status === 'active'), true)
  })

  it('snapshots selected skills and MCP bindings into a stable plugin profile', () => {
    const snapshot = resolveCapabilitySnapshot({
      template: {
        domainTemplateId: 'tpl_fintech_trust',
        aestheticProfileId: 'aes_trustworthy_saas',
        colorPaletteId: 'pal_blue_white_trust',
      },
      plugins: {
        skillIds: ['sk_static_export_safe', 'sk_accessibility_first'],
        mcpToolIds: ['mcp_accessibility_validate'],
      },
    })

    assert.deepEqual(snapshot.plugins.skillIds, ['sk_static_export_safe', 'sk_accessibility_first'])
    assert.deepEqual(snapshot.plugins.mcpToolIds, ['mcp_accessibility_validate'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.skills.map(skill => skill.id), ['sk_static_export_safe', 'sk_accessibility_first'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.mcpToolBindings.map(binding => binding.id), ['mcp_accessibility_validate'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, ['mcp_accessibility_validate'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.scopes, ['readonly_context', 'validation_only'])
    assert.equal(snapshot.plugins.pluginSnapshot?.toolPolicy.auditLevel, 'usage')
  })

  it('snapshots Agent-Reach research MCP bindings into a fully audited readonly policy', () => {
    const snapshot = resolveCapabilitySnapshot({
      template: {
        domainTemplateId: 'tpl_fintech_trust',
      },
      plugins: {
        skillIds: ['sk_research_brief_builder'],
        mcpToolIds: ['mcp_agent_reach_search', 'mcp_agent_reach_page_read'],
      },
    })

    assert.deepEqual(snapshot.plugins.skillIds, ['sk_research_brief_builder'])
    assert.deepEqual(snapshot.plugins.mcpToolIds, ['mcp_agent_reach_search', 'mcp_agent_reach_page_read'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.skills.map(skill => skill.id), ['sk_research_brief_builder'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.mcpToolBindings.map(binding => binding.id), [
      'mcp_agent_reach_search',
      'mcp_agent_reach_page_read',
    ])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, [
      'mcp_agent_reach_search',
      'mcp_agent_reach_page_read',
    ])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.scopes, ['readonly_context'])
    assert.equal(snapshot.plugins.pluginSnapshot?.toolPolicy.requiresUserAuth, false)
    assert.equal(snapshot.plugins.pluginSnapshot?.toolPolicy.auditLevel, 'full')
  })

  it('snapshots image generation MCP bindings with artifact write scope', () => {
    const snapshot = resolveCapabilitySnapshot({
      template: {
        domainTemplateId: 'tpl_fintech_trust',
      },
      plugins: {
        skillIds: ['sk_visual_asset_brief'],
        mcpToolIds: ['mcp_image_generation_ark_seedream'],
      },
    })

    assert.deepEqual(snapshot.plugins.skillIds, ['sk_visual_asset_brief'])
    assert.deepEqual(snapshot.plugins.mcpToolIds, ['mcp_image_generation_ark_seedream'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.mcpToolBindings.map(binding => binding.id), ['mcp_image_generation_ark_seedream'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, ['mcp_image_generation_ark_seedream'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.scopes, ['readonly_context', 'artifact_write'])
    assert.equal(snapshot.plugins.pluginSnapshot?.toolPolicy.auditLevel, 'full')
  })

  it('rejects missing plugin references before job snapshot creation', () => {
    assert.throws(
      () => resolveCapabilitySnapshot({ plugins: { skillIds: ['sk_missing'] } }),
      /Capability not found: sk_missing/,
    )
    assert.throws(
      () => resolveCapabilitySnapshot({ plugins: { mcpToolIds: ['mcp_missing'] } }),
      /Capability not found: mcp_missing/,
    )
  })

  it('applies runtime governance disabled plugin overrides', () => {
    const capabilities = listCapabilities({ disabledPluginIds: ['plug_static_export_safe'] })
    const plugin = capabilities.plugins.find(item => item.id === 'plug_static_export_safe')
    assert.equal(plugin?.status, 'disabled')
    assert.equal(plugin?.safetyLevel, 'disabled')

    assert.throws(
      () => resolveCapabilitySnapshot(
        { plugins: { skillIds: ['sk_static_export_safe'] } },
        { disabledPluginIds: ['plug_static_export_safe'] },
      ),
      /Capability plugin is not active: plug_static_export_safe/,
    )
  })

  it('rejects MCP bindings outside the selected template category', () => {
    assert.throws(
      () => resolveCapabilitySnapshot({
        template: { domainTemplateId: 'tpl_fintech_trust' },
        plugins: { mcpToolIds: ['mcp_asset_library_readonly'] },
      }),
      /cannot be used with template category finance/,
    )
  })
})
