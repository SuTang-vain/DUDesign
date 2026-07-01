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
    assert.equal(deep?.enablePixelGate, true)
    assert.equal(deep?.qualityGate, 'pixel')
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
