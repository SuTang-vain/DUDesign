import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXPLORATION_PLAN_SCHEMA_VERSION,
  type BatchExplorationPlanV1,
} from '@dudesign/contracts'
import { officialDesignTemplatePacks } from './officialDesignTemplatePacks.js'
import { assignDesignTemplatePacks } from './service.js'

describe('variation template assignment', () => {
  it('matches relationship, timeline, and expandable exploration to compatible templates', () => {
    const templateIds = [
      'dtp_dynamic_encyclopedia_timeline_card',
      'dtp_de_star_group_member_map',
      'dtp_dynamic_encyclopedia_summary_card',
    ]
    const templates = templateIds.map(id => {
      const template = officialDesignTemplatePacks.find(candidate => candidate.id === id)
      assert.ok(template, `missing template fixture: ${id}`)
      return template
    })
    const plan: BatchExplorationPlanV1 = {
      schemaVersion: EXPLORATION_PLAN_SCHEMA_VERSION,
      plannerVersion: 'test-planner',
      seed: 'test-seed',
      capabilitySnapshotId: 'test-capability',
      profile: {
        level: 40,
        mode: 'balanced',
        moduleBreadth: 0.46,
        moduleNovelty: 0.32,
        layoutDivergence: 0.42,
        visualDivergence: 0.47,
        interactionDivergence: 0.35,
        copyToneDivergence: 0.18,
        factCreativity: 0,
      },
      moduleGraphVersion: 'test-graph',
      variations: [
        variation(1, 'entry_relationships', ['ip_relation_network']),
        variation(2, 'entry_timeline', ['ip_timeline_story']),
        variation(3, 'entry_expandable_details', ['ip_expandable_facts']),
      ],
      coverageSummary: {},
      warnings: [],
    }

    const assignments = assignDesignTemplatePacks(3, templates, plan)

    assert.deepEqual(assignments.map(item => item.designTemplatePackId), [
      'dtp_de_star_group_member_map',
      'dtp_dynamic_encyclopedia_timeline_card',
      'dtp_dynamic_encyclopedia_summary_card',
    ])
    assert.deepEqual(assignments.map(item => item.interactionParadigmId), [
      'ip_relation_map',
      'ip_timeline_story',
      'ip_entity_summary',
    ])
  })
})

function variation(
  variationIndex: number,
  focusId: string,
  interactionDirectionIds: string[],
): BatchExplorationPlanV1['variations'][number] {
  return {
    variationIndex,
    focusId,
    requiredModuleIds: ['entry_identity_summary', 'entry_key_facts'],
    sampledModuleIds: [focusId],
    excludedModuleIds: [],
    interactionDirectionIds,
    rationale: `Focus on ${focusId}.`,
  }
}
