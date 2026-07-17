import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const {
  hasMeaningfulGuidanceEntryChange,
  migrateDynamicGuidanceSelection,
  normalizeGuidanceEntry,
} = await import('../src/lib/dynamicGuidanceMigration.ts')

describe('dynamic encyclopedia guidance migration', () => {
  it('normalizes presentation-only whitespace before invalidating guidance', () => {
    assert.equal(normalizeGuidanceEntry('  王安石\n 北宋政治家  '), '王安石 北宋政治家')
    assert.equal(hasMeaningfulGuidanceEntryChange('王安石  北宋政治家', '王安石\n北宋政治家'), false)
    assert.equal(hasMeaningfulGuidanceEntryChange('苏轼 北宋文学家', '王安石 北宋政治家'), true)
  })

  it('keeps compatible selections and explicit removals while dropping incompatible templates', () => {
    const result = migrateDynamicGuidanceSelection({
      guidance: guidanceFixture(),
      preset: presetFixture(),
      templatePacks: [
        templateFixture('dtp_timeline', ['历史人物']),
        templateFixture('dtp_expandable', ['历史人物']),
        templateFixture('dtp_compare', ['知识术语']),
      ],
      plugins: [
        pluginFixture('plug_required'),
        pluginFixture('plug_optional'),
        pluginFixture('plug_mcp'),
      ],
      skills: [
        skillFixture('sk_required', 'plug_required'),
        skillFixture('sk_optional', 'plug_optional'),
      ],
      mcpToolBindings: [bindingFixture('mcp_required', 'plug_mcp')],
      current: {
        selectedTemplatePackIds: ['dtp_timeline', 'dtp_compare'],
        selectedSkillIds: ['sk_required'],
        selectedMcpToolIds: ['mcp_required'],
        loopProfileId: 'loop_standard',
        userOverrideCapabilityIds: ['dtp_timeline', 'dtp_compare', 'sk_optional', 'loop_standard'],
      },
      preserveCompatibleOverrides: true,
    })

    assert.deepEqual(result.selectedTemplatePackIds, ['dtp_timeline', 'dtp_expandable'])
    assert.deepEqual(result.selectedSkillIds, ['sk_required'])
    assert.deepEqual(result.selectedMcpToolIds, ['mcp_required'])
    assert.equal(result.loopProfileId, 'loop_standard')
    assert.equal(result.loopOverrideRetained, true)
    assert.ok(result.retainedOverrideIds.includes('dtp_timeline'))
    assert.ok(result.retainedOverrideIds.includes('sk_optional'))
    assert.ok(result.retainedOverrideIds.includes('loop_standard'))
    assert.ok(result.droppedOverrideIds.includes('dtp_compare'))
  })

  it('uses the refreshed guidance unchanged when preservation is disabled', () => {
    const result = migrateDynamicGuidanceSelection({
      guidance: guidanceFixture(),
      preset: presetFixture(),
      templatePacks: [
        templateFixture('dtp_timeline', ['历史人物']),
        templateFixture('dtp_expandable', ['历史人物']),
        templateFixture('dtp_compare', ['知识术语']),
      ],
      plugins: [pluginFixture('plug_required'), pluginFixture('plug_optional'), pluginFixture('plug_mcp')],
      skills: [skillFixture('sk_required', 'plug_required'), skillFixture('sk_optional', 'plug_optional')],
      mcpToolBindings: [bindingFixture('mcp_required', 'plug_mcp')],
      current: {
        selectedTemplatePackIds: ['dtp_compare'],
        selectedSkillIds: ['sk_required'],
        selectedMcpToolIds: ['mcp_required'],
        loopProfileId: 'loop_standard',
        userOverrideCapabilityIds: ['dtp_compare', 'loop_standard'],
      },
      preserveCompatibleOverrides: false,
    })

    assert.deepEqual(result.selectedTemplatePackIds, ['dtp_expandable'])
    assert.deepEqual(result.selectedSkillIds, ['sk_required', 'sk_optional'])
    assert.equal(result.loopProfileId, 'loop_encyclopedia_spec_review')
    assert.deepEqual(result.retainedOverrideIds, [])
    assert.ok(result.droppedOverrideIds.includes('dtp_compare'))
    assert.ok(result.droppedOverrideIds.includes('loop_standard'))
  })
})

function guidanceFixture() {
  return {
    classification: {
      primaryCategory: '名人',
      secondaryCategory: '历史人物',
      tertiaryCategory: '政治人物',
    },
    templateRequirements: {
      designTemplatePackIds: ['dtp_expandable'],
    },
    capabilityRequirements: {
      plugins: {
        skillIds: ['sk_required', 'sk_optional'],
        mcpToolIds: ['mcp_required'],
      },
      automation: {
        loopProfileId: 'loop_encyclopedia_spec_review',
      },
    },
  }
}

function presetFixture() {
  return {
    selectionPolicy: {
      requiredTemplatePackIds: ['dtp_dynamic_encyclopedia_card'],
      requiredSkillIds: ['sk_required'],
      requiredMcpToolIds: ['mcp_required'],
      allowedLoopProfileIds: ['loop_standard', 'loop_encyclopedia_spec_review'],
    },
  }
}

function templateFixture(id, supportedEntryCategories) {
  return {
    id,
    parentPackId: 'dtp_dynamic_encyclopedia_card',
    status: 'published',
    supportedProductModes: ['dynamic_encyclopedia_card'],
    supportedEntryCategories,
  }
}

function pluginFixture(id) {
  return {
    id,
    visibility: 'official',
    status: 'active',
    safetyLevel: 'safe',
  }
}

function skillFixture(id, pluginId) {
  return { id, pluginId, allowedTemplateCategories: ['encyclopedia'] }
}

function bindingFixture(id, pluginId) {
  return { id, pluginId, allowedTemplateCategories: ['encyclopedia'] }
}
