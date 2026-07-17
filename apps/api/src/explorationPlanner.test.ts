import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateBatchExplorationPlan } from '@dudesign/contracts'
import { createBatchExplorationPlan } from './explorationPlanner.js'
import { starGroupRequirementModuleGraph } from './fixtures/starGroupRequirementModuleGraph.js'

describe('deterministic exploration planner', () => {
  it('creates the same three-variation plan for the same seed and snapshot', () => {
    const input = plannerInput(3, 40, { units: [{ id: 'unit-a' }] })

    const first = createBatchExplorationPlan(input)
    const second = createBatchExplorationPlan(input)

    assert.deepEqual(first, second)
    assert.equal(first.variations.length, 3)
    assert.deepEqual(validateBatchExplorationPlan(first, starGroupRequirementModuleGraph), [])
    assert.ok(first.variations.every(variation => variation.requiredModuleIds.includes('group_identity')))
    assert.ok(first.variations.every(variation => variation.requiredModuleIds.includes('current_members')))
    assert.equal(new Set(first.variations.map(variation => variation.focusId)).size, 3)
  })

  it('covers high-priority sampled modules across six variations', () => {
    const plan = createBatchExplorationPlan(plannerInput(6, 40, { units: [{ id: 'unit-a' }] }))

    for (const moduleId of ['former_members', 'membership_timeline', 'group_works', 'bidirectional_member_links']) {
      assert.ok((plan.coverageSummary[moduleId] ?? 0) >= 1, `${moduleId} should be covered`)
    }
    assert.ok((plan.coverageSummary.unit_navigation ?? 0) >= 1)
  })

  it('only includes conditional Unit navigation when Unit data exists', () => {
    const withoutUnits = createBatchExplorationPlan(plannerInput(3, 40, {}))
    const withUnits = createBatchExplorationPlan(plannerInput(3, 40, { units: [{ id: 'unit-a' }] }))

    assert.equal(withoutUnits.coverageSummary.unit_navigation, undefined)
    assert.ok((withUnits.coverageSummary.unit_navigation ?? 0) >= 1)
  })

  it('increases optional module coverage at higher exploration levels', () => {
    const low = createBatchExplorationPlan(plannerInput(6, 0, { units: [{ id: 'unit-a' }] }))
    const high = createBatchExplorationPlan(plannerInput(6, 100, { units: [{ id: 'unit-a' }] }))

    assert.ok(optionalAssignments(high) > optionalAssignments(low))
    assert.equal(high.profile.factCreativity, 0)
  })

  it('respects excluded modules and guarantees locked eligible modules', () => {
    const plan = createBatchExplorationPlan({
      ...plannerInput(3, 40, { units: [{ id: 'unit-a' }] }),
      request: {
        level: 40,
        excludedModuleIds: ['bidirectional_member_links'],
        lockedModuleIds: ['unit_navigation'],
      },
    })

    assert.equal(plan.coverageSummary.bidirectional_member_links, undefined)
    assert.ok(plan.variations.every(variation => variation.excludedModuleIds.includes('bidirectional_member_links')))
    assert.ok((plan.coverageSummary.unit_navigation ?? 0) >= 1)
  })

  it('rejects exclusion of always modules and invalid variation counts', () => {
    assert.throws(
      () => createBatchExplorationPlan({
        ...plannerInput(3, 40, {}),
        request: { level: 40, excludedModuleIds: ['current_members'] },
      }),
      /Invariant module cannot be excluded/,
    )
    assert.throws(() => createBatchExplorationPlan(plannerInput(7, 40, {})), /between 1 and 6/)
  })
})

function plannerInput(variationCount: number, level: number, dataContext: Record<string, unknown>) {
  return {
    graph: starGroupRequirementModuleGraph,
    capabilitySnapshotId: 'capability_snapshot_star_group_v1',
    variationCount,
    seed: 'user-1:session-1:job-1:star-group-v1',
    request: { level },
    dataContext,
  }
}

function optionalAssignments(plan: ReturnType<typeof createBatchExplorationPlan>): number {
  return plan.variations.reduce((total, variation) => total + variation.sampledModuleIds.length, 0)
}
