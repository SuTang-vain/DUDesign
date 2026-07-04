import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listCapabilities, resolveCapabilitySnapshot } from './capabilities.js'

describe('capability plugin registry', () => {
  it('lists automation loop profiles with stop condition defaults', () => {
    const capabilities = listCapabilities()
    const fast = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_fast')
    const standard = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_standard')
    const deep = capabilities.automationLoopProfiles.find(profile => profile.id === 'loop_deep_repair')

    assert.equal(fast?.repairStrategy, 'none')
    assert.equal(fast?.maxRepairAttempts, 0)
    assert.equal(standard?.maxCostCents, 200)
    assert.equal(standard?.maxDurationMs, 300000)
    assert.deepEqual(deep?.qualityGates, ['static', 'pixel'])
    assert.equal(deep?.enablePixelGate, true)
    assert.equal(deep?.qualityGate, 'pixel')
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
    assert.ok(capabilities.plugins.some(plugin => plugin.id === 'plug_encyclopedia_entry_guidance'))
    assert.ok(capabilities.plugins.some(plugin => plugin.id === 'plug_encyclopedia_democase_readonly'))
    assert.ok(capabilities.skills.some(skill => skill.id === 'sk_encyclopedia_entry_guidance'))
    assert.ok(capabilities.mcpToolBindings.some(binding => binding.id === 'mcp_encyclopedia_democase_readonly'))
    assert.equal(capabilities.plugins.every(plugin => plugin.status === 'active'), true)
  })

  it('snapshots the dynamic encyclopedia preset capabilities', () => {
    const snapshot = resolveCapabilitySnapshot({
      template: {
        domainTemplateId: 'tpl_dynamic_encyclopedia_entry',
        designTemplatePackIds: ['dtp_dynamic_encyclopedia_card'],
      },
      plugins: {
        skillIds: ['sk_encyclopedia_entry_guidance'],
        mcpToolIds: ['mcp_encyclopedia_democase_readonly'],
      },
      automation: {
        loopProfileId: 'loop_encyclopedia_spec_review',
      },
    })

    assert.equal(snapshot.template.domainTemplate.category, 'encyclopedia')
    assert.deepEqual(snapshot.plugins.skillIds, ['sk_encyclopedia_entry_guidance'])
    assert.deepEqual(snapshot.plugins.mcpToolIds, ['mcp_encyclopedia_democase_readonly'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.allowedMcpToolIds, ['mcp_encyclopedia_democase_readonly'])
    assert.deepEqual(snapshot.plugins.pluginSnapshot?.toolPolicy.scopes, ['readonly_context', 'validation_only'])
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

    assert.equal(summary?.category, 'encyclopedia')
    assert.deepEqual(summary?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_summary_card'])
    assert.equal(timeline?.category, 'encyclopedia')
    assert.deepEqual(timeline?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_timeline_card'])
    assert.equal(relation?.category, 'encyclopedia')
    assert.deepEqual(relation?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_relation_card'])
    assert.equal(compare?.category, 'encyclopedia')
    assert.deepEqual(compare?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_compare_card'])
    assert.equal(expandable?.category, 'encyclopedia')
    assert.deepEqual(expandable?.compatibleTemplatePackIds, ['dtp_dynamic_encyclopedia_expandable_card'])
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
