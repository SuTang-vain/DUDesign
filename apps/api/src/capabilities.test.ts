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
      inputSources: ['prompt', 'url', 'democase'],
      topicSummary: 'A dynamic encyclopedia card for a company entry.',
      entities: [{ name: 'Example Company', type: 'company', confidence: 0.86, source: 'prompt' }],
      fields: [
        { name: 'entryTitle', value: 'Example Company', confidence: 0.86, source: 'prompt' },
        { name: 'foundedAt', missing: true, confidence: 0.2, source: 'democase' },
      ],
      missingFields: ['foundedAt'],
      recommendedScenarioTemplates: [{ id: 'tpl_dynamic_encyclopedia_entry', reason: 'The input describes a knowledge entry.', confidence: 0.9 }],
      recommendedDesignTemplatePacks: [{ id: 'dtp_dynamic_encyclopedia_summary_card', reason: 'The supplied data is mostly summary facts.', confidence: 0.82 }],
      recommendedSkills: [{ id: 'sk_dual_surface_strategy', reason: 'The target requires PC and WISE delivery.', confidence: 0.78 }],
      riskFlags: ['missing-source-dates'],
      reviewStatus: 'auto_reviewed',
    }

    assert.equal(analysis.inputSources.includes('democase'), true)
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
      usageContext: 'dynamic_encyclopedia_card',
      variationId: 'var_01',
      templatePackId: 'dtp_dynamic_encyclopedia_summary_card',
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
    assert.equal(artifact.usageContext, 'dynamic_encyclopedia_card')
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

    const encyclopediaReview = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_encyclopedia_spec_review')
    assert.deepEqual(encyclopediaReview?.qualityGates, ['static', 'spec', 'pixel'])
    assert.equal(encyclopediaReview?.repairStrategy, 'spec_review_refine')
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
    const guidancePlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_encyclopedia_entry_guidance')
    const guidanceSkill = capabilities.skills.find(skill => skill.id === 'sk_encyclopedia_entry_guidance')
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
    const democaseBinding = capabilities.mcpToolBindings.find(binding => binding.id === 'mcp_encyclopedia_democase_readonly')
    assert.ok(guidancePlugin)
    assert.equal(guidancePlugin.type, 'mixed')
    assert.deepEqual(guidancePlugin.permissionPolicy.scopes, ['readonly_context'])
    assert.ok(guidanceSkill)
    assert.equal(guidanceSkill.pluginId, 'plug_encyclopedia_entry_guidance')
    assert.ok(dualSurfacePlugin)
    assert.equal(dualSurfacePlugin.category, 'responsive')
    assert.ok(dualSurfaceSkill)
    assert.equal(dualSurfaceSkill.pluginId, 'plug_dual_surface_strategy')
    assert.ok(dualSurfaceSkill.allowedTemplateCategories.includes('encyclopedia'))
    assert.ok(dataIntakePlugin)
    assert.equal(dataIntakePlugin.category, 'research')
    assert.ok(dataIntakeSkill)
    assert.equal(dataIntakeSkill.pluginId, 'plug_data_intake_analysis')
    assert.ok(dataIntakeSkill.allowedTemplateCategories.includes('encyclopedia'))
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
    assert.ok(democaseBinding)
    assert.equal(democaseBinding.pluginId, 'plug_encyclopedia_entry_guidance')
    assert.deepEqual(democaseBinding.scopes, ['readonly_context'])
    const assetLibraryPlugin = capabilities.plugins.find(plugin => plugin.id === 'plug_asset_library_readonly')
    assert.ok(assetLibraryPlugin)
    assert.equal(assetLibraryPlugin.safetyLevel, 'safe')
    assert.match(assetLibraryPlugin.description, /只读读取/)
    assert.equal(capabilities.plugins.every(plugin => plugin.status === 'active'), true)
  })

  it('snapshots the dynamic encyclopedia preset capabilities', () => {
    const capabilities = listCapabilities()
    const preset = capabilities.capabilityPresets.find(item => item.id === 'preset_dynamic_encyclopedia_card')
    assert.ok(preset)
    assert.equal(preset.productMode, 'dynamic_encyclopedia_card')
    assert.equal(preset.domainTemplateId, 'tpl_dynamic_encyclopedia_entry')
    assert.deepEqual(preset.designTemplatePackIds, ['dtp_dynamic_encyclopedia_card'])
    assert.deepEqual(preset.skillIds, ['sk_encyclopedia_entry_guidance', 'sk_data_intake_analysis', 'sk_research_brief_builder', 'sk_visual_asset_brief'])
    assert.deepEqual(preset.mcpToolIds, ['mcp_encyclopedia_democase_readonly', 'mcp_agent_reach_search', 'mcp_image_generation_ark_seedream'])
    assert.equal(preset.loopProfileId, 'loop_encyclopedia_spec_review')
    assert.equal(preset.requirementModuleGraphId, 'requirement_graph_dynamic_encyclopedia_entry')
    assert.deepEqual(preset.selectionPolicy.requiredTemplatePackIds, ['dtp_dynamic_encyclopedia_card'])
    assert.deepEqual(preset.selectionPolicy.requiredSkillIds, ['sk_encyclopedia_entry_guidance'])
    assert.deepEqual(preset.selectionPolicy.requiredMcpToolIds, ['mcp_encyclopedia_democase_readonly'])
    assert.deepEqual(preset.selectionPolicy.allowedLoopProfileIds, ['loop_standard', 'loop_encyclopedia_spec_review'])
    assert.deepEqual(preset.explorationDefaults, {
      level: 40,
      experimentalConfirmationThreshold: 71,
      forceReviewAtOrAbove: 71,
    })
    assert.ok(capabilities.domainTemplates.some(item => item.id === preset.domainTemplateId))
    assert.ok(capabilities.skills.some(item => item.id === preset.skillIds[0]))
    assert.ok(capabilities.skills.some(item => item.id === 'sk_dual_surface_strategy'))
    assert.ok(capabilities.skills.some(item => item.id === 'sk_data_intake_analysis'))
    assert.ok(capabilities.mcpToolBindings.some(item => item.id === preset.mcpToolIds[0]))
    assert.ok(capabilities.automationLoopProfiles.some(item => item.id === preset.loopProfileId))

    const snapshot = resolveCapabilitySnapshot({
      template: {
        domainTemplateId: preset.domainTemplateId,
        designTemplatePackIds: preset.designTemplatePackIds,
      },
      plugins: {
        skillIds: preset.skillIds,
        mcpToolIds: preset.mcpToolIds,
      },
      automation: {
        loopProfileId: preset.loopProfileId,
      },
    })

    assert.equal(snapshot.template.domainTemplate.category, 'encyclopedia')
    assert.deepEqual(snapshot.plugins.skillIds, ['sk_encyclopedia_entry_guidance', 'sk_data_intake_analysis', 'sk_research_brief_builder', 'sk_visual_asset_brief'])
    assert.deepEqual(snapshot.plugins.mcpToolIds, ['mcp_encyclopedia_democase_readonly', 'mcp_agent_reach_search', 'mcp_image_generation_ark_seedream'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.skills.map(skill => skill.id), ['sk_encyclopedia_entry_guidance', 'sk_data_intake_analysis', 'sk_research_brief_builder', 'sk_visual_asset_brief'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, ['mcp_encyclopedia_democase_readonly', 'mcp_agent_reach_search', 'mcp_image_generation_ark_seedream'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.scopes, ['readonly_context', 'validation_only', 'artifact_write'])
    assert.equal(snapshot.plugins.pluginSnapshot?.toolPolicy.auditLevel, 'full')
    assert.equal(snapshot.automation.loopProfile.id, 'loop_encyclopedia_spec_review')
    assert.deepEqual(snapshot.automation.loopProfile.qualityGates, ['static', 'spec', 'pixel'])
  })

  it('lists dynamic encyclopedia interaction paradigms with compatible child templates', () => {
    const capabilities = listCapabilities()
    const summary = capabilities.interactionParadigms.find(item => item.id === 'ip_entity_summary')
    const timeline = capabilities.interactionParadigms.find(item => item.id === 'ip_timeline_story')
    const relation = capabilities.interactionParadigms.find(item => item.id === 'ip_relation_map')
    const compare = capabilities.interactionParadigms.find(item => item.id === 'ip_fact_compare')
    const expandable = capabilities.interactionParadigms.find(item => item.id === 'ip_expandable_facts')
    const causal = capabilities.interactionParadigms.find(item => item.id === 'ip_causal_event_chain')
    const series = capabilities.interactionParadigms.find(item => item.id === 'ip_series_navigation')
    const route = capabilities.interactionParadigms.find(item => item.id === 'ip_route_guide')

    assert.equal(summary?.category, 'encyclopedia')
    assert.deepEqual(summary?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_summary_card'])
    assert.equal(timeline?.category, 'encyclopedia')
    assert.deepEqual(timeline?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_timeline_card'])
    assert.equal(relation?.category, 'encyclopedia')
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_dynamic_encyclopedia_relation_card'))
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_de_history_person_relationship'))
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_de_film_cast_role_network'))
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_de_tv_character_relation'))
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_de_cultural_phrase_relation_graph'))
    assert.ok(relation?.compatibleTemplatePackIds.includes('dtp_de_scenic_spot_map_poi'))
    assert.equal(compare?.category, 'encyclopedia')
    assert.deepEqual(compare?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_compare_card'])
    assert.equal(expandable?.category, 'encyclopedia')
    assert.ok(expandable?.compatibleTemplatePackIds.includes('dtp_dynamic_encyclopedia_expandable_card'))
    assert.ok(expandable?.compatibleTemplatePackIds.includes('dtp_de_cultural_phrase_origin_story'))
    assert.equal(causal?.category, 'encyclopedia')
    assert.ok(causal?.compatibleTemplatePackIds.includes('dtp_de_history_person_event_chain'))
    assert.ok(causal?.compatibleTemplatePackIds.includes('dtp_de_tv_episode_chain'))
    assert.ok(causal?.compatibleTemplatePackIds.includes('dtp_de_cultural_phrase_origin_story'))
    assert.equal(series?.category, 'encyclopedia')
    assert.deepEqual(series?.compatibleTemplatePackIds, ['dtp_de_film_series_navigation'])
    assert.equal(route?.category, 'encyclopedia')
    assert.deepEqual(route?.compatibleTemplatePackIds, [
      'dtp_de_scenic_spot_route_guide',
      'dtp_de_scenic_spot_map_poi',
    ])
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
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
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
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
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
