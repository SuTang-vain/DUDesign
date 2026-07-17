import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createExplorationProfile,
  EXPLORATION_PLAN_SCHEMA_VERSION,
  resolveExplorationMode,
  type BatchExplorationPlanV1,
  type RequirementModuleGraphV1,
  validateBatchExplorationPlan,
  validateRequirementModuleGraph,
} from '@dudesign/contracts'
import { starGroupRequirementModuleGraph } from './fixtures/starGroupRequirementModuleGraph.js'

describe('controlled exploration contracts', () => {
  it('maps exploration level boundaries to stable product modes', () => {
    assert.equal(resolveExplorationMode(0), 'faithful')
    assert.equal(resolveExplorationMode(20), 'faithful')
    assert.equal(resolveExplorationMode(21), 'balanced')
    assert.equal(resolveExplorationMode(45), 'balanced')
    assert.equal(resolveExplorationMode(46), 'exploratory')
    assert.equal(resolveExplorationMode(70), 'exploratory')
    assert.equal(resolveExplorationMode(71), 'experimental')
    assert.equal(resolveExplorationMode(100), 'experimental')
  })

  it('keeps factual creativity at zero across the full exploration range', () => {
    const levels = [0, 20, 40, 70, 100]
    const profiles = levels.map(createExplorationProfile)

    assert.deepEqual(profiles.map(profile => profile.factCreativity), [0, 0, 0, 0, 0])
    assert.ok(profiles[0].layoutDivergence < profiles.at(-1)!.layoutDivergence)
    assert.ok(profiles[0].moduleNovelty < profiles.at(-1)!.moduleNovelty)
  })

  it('rejects non-integer or out-of-range exploration values', () => {
    for (const level of [-1, 10.5, 101]) {
      assert.throws(() => createExplorationProfile(level), /integer between 0 and 100/)
    }
  })

  it('accepts the star group requirement module golden fixture', () => {
    const findings = validateRequirementModuleGraph(starGroupRequirementModuleGraph)

    assert.deepEqual(findings, [])
    assert.deepEqual(
      starGroupRequirementModuleGraph.modules
        .filter(module => module.mode === 'always')
        .map(module => module.id),
      ['group_identity', 'current_members'],
    )
    assert.ok(starGroupRequirementModuleGraph.modules.some(module => module.id === 'unit_navigation' && module.mode === 'conditional'))
    assert.ok(starGroupRequirementModuleGraph.invariants.some(invariant => invariant.id === 'no_fabricated_member_facts'))
  })

  it('reports invalid conditional modules, duplicate ids, unknown references, and missing evidence', () => {
    const invalid = structuredClone(starGroupRequirementModuleGraph) as RequirementModuleGraphV1
    invalid.modules[0].evidenceRefs = []
    invalid.modules[1].id = invalid.modules[0].id
    const unitModule = invalid.modules.find(module => module.id === 'unit_navigation')!
    unitModule.conditions = []
    unitModule.dependencies = ['missing_module']

    const codes = validateRequirementModuleGraph(invalid).map(finding => finding.code)

    assert.ok(codes.includes('module_evidence_required'))
    assert.ok(codes.includes('duplicate_module_id'))
    assert.ok(codes.includes('conditional_module_requires_condition'))
    assert.ok(codes.includes('unknown_module_reference'))
  })

  it('requires every variation plan to preserve always modules and zero factual creativity', () => {
    const validPlan = createPlan()
    assert.deepEqual(validateBatchExplorationPlan(validPlan, starGroupRequirementModuleGraph), [])

    const invalidPlan = structuredClone(validPlan)
    invalidPlan.variations[1].requiredModuleIds = ['group_identity']
    ;(invalidPlan.profile as { factCreativity: number }).factCreativity = 0.2

    const codes = validateBatchExplorationPlan(invalidPlan, starGroupRequirementModuleGraph)
      .map(finding => finding.code)

    assert.ok(codes.includes('always_module_missing'))
    assert.ok(codes.includes('fact_creativity_must_be_zero'))
  })

  it('rejects drifted profile semantics, missing dependencies, and incorrect coverage summaries', () => {
    const invalidPlan = createPlan()
    invalidPlan.profile.mode = 'experimental'
    invalidPlan.variations[0].requiredModuleIds = ['current_members']
    invalidPlan.coverageSummary.group_works = 2

    const codes = validateBatchExplorationPlan(invalidPlan, starGroupRequirementModuleGraph)
      .map(finding => finding.code)

    assert.ok(codes.includes('exploration_mode_mismatch'))
    assert.ok(codes.includes('module_dependency_missing'))
    assert.ok(codes.includes('coverage_summary_mismatch'))
  })
})

function createPlan(): BatchExplorationPlanV1 {
  const requiredModuleIds = ['group_identity', 'current_members']
  return {
    schemaVersion: EXPLORATION_PLAN_SCHEMA_VERSION,
    plannerVersion: 'deterministic-planner.v1',
    seed: 'sha256:test-seed',
    capabilitySnapshotId: 'capability_snapshot_test',
    profile: createExplorationProfile(40),
    moduleGraphVersion: starGroupRequirementModuleGraph.capabilityVersion,
    variations: [
      {
        variationIndex: 1,
        focusId: 'group_overview',
        requiredModuleIds,
        sampledModuleIds: ['group_works'],
        excludedModuleIds: ['unit_navigation'],
        interactionDirectionIds: ['identity-card', 'work-list'],
        rationale: 'Prioritize group identity and representative works.',
      },
      {
        variationIndex: 2,
        focusId: 'membership_history',
        requiredModuleIds,
        sampledModuleIds: ['former_members', 'membership_timeline'],
        excludedModuleIds: [],
        interactionDirectionIds: ['member-history-table', 'vertical-timeline'],
        rationale: 'Prioritize member history and status changes.',
      },
      {
        variationIndex: 3,
        focusId: 'relationship_navigation',
        requiredModuleIds,
        sampledModuleIds: ['bidirectional_member_links', 'unit_navigation'],
        excludedModuleIds: [],
        interactionDirectionIds: ['relationship-network'],
        rationale: 'Prioritize bidirectional navigation between group and members.',
      },
    ],
    coverageSummary: {
      group_identity: 3,
      current_members: 3,
      group_works: 1,
      former_members: 1,
      membership_timeline: 1,
      bidirectional_member_links: 1,
      unit_navigation: 1,
    },
    warnings: [],
  }
}
