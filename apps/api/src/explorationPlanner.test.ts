import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { validateBatchExplorationPlan } from '@dudesign/contracts'
import { createBatchExplorationPlan } from './explorationPlanner.js'
import { productShowcaseRequirementModuleGraph } from './fixtures/productShowcaseRequirementModuleGraph.js'

describe('deterministic exploration planner', () => {
  it('creates the same three-variation plan for the same seed and snapshot', () => {
    const input = plannerInput(3, 40, { variants: [{ id: 'variant-a' }] })

    const first = createBatchExplorationPlan(input)
    const second = createBatchExplorationPlan(input)

    assert.deepEqual(first, second)
    assert.equal(first.variations.length, 3)
    assert.deepEqual(validateBatchExplorationPlan(first, productShowcaseRequirementModuleGraph), [])
    assert.ok(first.variations.every(variation => variation.requiredModuleIds.includes('product_identity')))
    assert.ok(first.variations.every(variation => variation.requiredModuleIds.includes('launch_stages')))
    assert.equal(new Set(first.variations.map(variation => variation.focusId)).size, 3)
  })

  it('covers high-priority sampled modules across six variations', () => {
    const plan = createBatchExplorationPlan(plannerInput(6, 40, { variants: [{ id: 'variant-a' }] }))

    for (const moduleId of ['archived_stages', 'release_timeline', 'product_works', 'related_links']) {
      assert.ok((plan.coverageSummary[moduleId] ?? 0) >= 1, `${moduleId} should be covered`)
    }
    assert.ok((plan.coverageSummary.variant_navigation ?? 0) >= 1)
  })

  it('only includes conditional Unit navigation when Unit data exists', () => {
    const withoutUnits = createBatchExplorationPlan(plannerInput(3, 40, {}))
    const withUnits = createBatchExplorationPlan(plannerInput(3, 40, { variants: [{ id: 'variant-a' }] }))

    assert.equal(withoutUnits.coverageSummary.variant_navigation, undefined)
    assert.ok((withUnits.coverageSummary.variant_navigation ?? 0) >= 1)
  })

  it('increases optional module coverage at higher exploration levels', () => {
    const low = createBatchExplorationPlan(plannerInput(6, 0, { variants: [{ id: 'variant-a' }] }))
    const high = createBatchExplorationPlan(plannerInput(6, 100, { variants: [{ id: 'variant-a' }] }))

    assert.ok(optionalAssignments(high) > optionalAssignments(low))
    assert.equal(high.profile.factCreativity, 0)
  })

  it('respects excluded modules and guarantees locked eligible modules', () => {
    const plan = createBatchExplorationPlan({
      ...plannerInput(3, 40, { variants: [{ id: 'variant-a' }] }),
      request: {
        level: 40,
        excludedModuleIds: ['related_links'],
        lockedModuleIds: ['variant_navigation'],
      },
    })

    assert.equal(plan.coverageSummary.related_links, undefined)
    assert.ok(plan.variations.every(variation => variation.excludedModuleIds.includes('related_links')))
    assert.ok((plan.coverageSummary.variant_navigation ?? 0) >= 1)
  })

  it('rejects exclusion of always modules and invalid variation counts', () => {
    assert.throws(
      () => createBatchExplorationPlan({
        ...plannerInput(3, 40, {}),
        request: { level: 40, excludedModuleIds: ['launch_stages'] },
      }),
      /Invariant module cannot be excluded/,
    )
    assert.throws(() => createBatchExplorationPlan(plannerInput(7, 40, {})), /between 1 and 6/)
  })
})

function plannerInput(variationCount: number, level: number, dataContext: Record<string, unknown>) {
  return {
    graph: productShowcaseRequirementModuleGraph,
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
