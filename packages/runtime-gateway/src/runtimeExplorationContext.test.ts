import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXPLORATION_PLAN_SCHEMA_VERSION,
  REQUIREMENT_MODULE_GRAPH_SCHEMA_VERSION,
  createExplorationProfile,
  type BatchExplorationPlanV1,
  type RequirementModuleGraphV1,
} from '@dudesign/contracts'
import {
  compileRuntimeExplorationContexts,
  createCliAgentExplorationFixture,
  runtimeExplorationPromptBlock,
} from './runtimeExplorationContext.js'

describe('RuntimeExplorationContextV1', () => {
  it('compiles a fixed variation plan without leaking authoring evidence or tool permissions', () => {
    const contexts = compileRuntimeExplorationContexts(graph(), plan())
    const context = contexts[0]!
    const serialized = JSON.stringify(context)

    assert.equal(context.source.variationIndex, 1)
    assert.equal(context.focus.id, 'timeline')
    assert.equal(context.safety.factCreativity, 0)
    assert.equal(context.safety.mayExpandToolPolicy, false)
    assert.equal(context.safety.mayReassignModules, false)
    assert.doesNotMatch(serialized, /sourceExcerpt|sourcePath|dangerous original document|mcpToolIds|temperature/i)
    assert.deepEqual(context.requiredModules.map(module => module.id), ['identity'])
    assert.deepEqual(context.sampledModules.map(module => module.id), ['timeline'])
  })

  it('creates the same prompt block for BabeL-O and the CLI Agent fixture', () => {
    const context = compileRuntimeExplorationContexts(graph(), plan())[0]!
    const fixture = createCliAgentExplorationFixture(context)

    assert.equal(fixture.context, context)
    assert.equal(fixture.promptBlock, runtimeExplorationPromptBlock(context))
    assert.match(fixture.promptBlock, /Variation focus: Member timeline/)
    assert.match(fixture.promptBlock, /Keep fact creativity at zero/)
    assert.match(fixture.promptBlock, /Do not expand tool permissions/)
    assert.match(fixture.promptBlock, /Do not reassign, remove, or add requirement modules/)
  })
})

function graph(): RequirementModuleGraphV1 {
  const evidence = [{
    sourcePath: 'private-product-spec.md',
    sourceExcerpt: 'dangerous original document excerpt must not reach runtime',
    extractionMethod: 'deterministic' as const,
    confidence: 1,
  }]
  return {
    schemaVersion: REQUIREMENT_MODULE_GRAPH_SCHEMA_VERSION,
    id: 'graph_star_group',
    capabilityVersion: 'star-group.v1',
    title: 'Star group encyclopedia',
    modules: [
      {
        id: 'identity',
        title: 'Group identity',
        description: 'Explain the group identity and current status.',
        mode: 'always',
        priority: 'critical',
        minBatchCoverage: 1,
        requiredDataFields: ['group.name'],
        interactionCandidates: ['identity-card'],
        evidenceRefs: evidence,
        confidence: 1,
      },
      {
        id: 'timeline',
        title: 'Member timeline',
        description: 'Explain verified member changes over time.',
        mode: 'sampled',
        priority: 'high',
        minBatchCoverage: 1,
        dependencies: ['identity'],
        requiredDataFields: ['membershipEvents'],
        interactionCandidates: ['vertical-timeline'],
        evidenceRefs: evidence,
        confidence: 1,
      },
      {
        id: 'neutral_facts',
        title: 'Neutral facts',
        description: 'Use neutral and verifiable wording for sensitive status changes.',
        mode: 'global_rule',
        priority: 'critical',
        minBatchCoverage: 1,
        evidenceRefs: evidence,
        confidence: 1,
      },
    ],
    invariants: [{
      id: 'no_fabrication',
      category: 'fact',
      description: 'Do not invent people, relationships, dates, works, or status changes.',
      evidenceRefs: evidence,
    }],
    unresolvedQuestions: ['This authoring-only question must not reach runtime.'],
  }
}

function plan(): BatchExplorationPlanV1 {
  return {
    schemaVersion: EXPLORATION_PLAN_SCHEMA_VERSION,
    plannerVersion: 'planner.v1',
    seed: 'sha256:test',
    capabilitySnapshotId: 'capability_snapshot_1',
    profile: createExplorationProfile(65),
    moduleGraphVersion: 'star-group.v1',
    variations: [{
      variationIndex: 1,
      focusId: 'timeline',
      requiredModuleIds: ['identity'],
      sampledModuleIds: ['timeline'],
      excludedModuleIds: [],
      interactionDirectionIds: ['vertical-timeline'],
      rationale: 'Focus on history.',
    }],
    coverageSummary: { identity: 1, timeline: 1 },
    warnings: [],
  }
}
