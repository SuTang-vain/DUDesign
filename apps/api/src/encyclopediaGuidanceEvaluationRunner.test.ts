import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import { GuidanceAnalysisGatewayError, type GuidanceAnalysisGateway } from '@dudesign/runtime-gateway'
import { listCapabilities } from './capabilities.js'
import {
  runEncyclopediaGuidanceGoldenEvaluation,
} from './encyclopediaGuidanceEvaluationRunner.js'
import { ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES } from './fixtures/encyclopediaGuidanceGolden.js'

describe('Encyclopedia guidance golden evaluation runner', () => {
  it('passes all default thresholds for perfect predictions and respects concurrency', async () => {
    let active = 0
    let maxActive = 0
    const fixturesByEntry = new Map(ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.map(fixture => [fixture.entry, fixture]))
    const gateway: GuidanceAnalysisGateway = {
      async analyzeEncyclopediaEntry(input) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolveDelay => setTimeout(resolveDelay, 1))
        active -= 1
        const fixture = fixturesByEntry.get(input.entry.rawInput)
        assert.ok(fixture)
        return perfectAnalysis(input, fixture)
      },
    }

    const report = await runEncyclopediaGuidanceGoldenEvaluation({ gateway, concurrency: 4 })

    assert.equal(report.fixtureCount, 100)
    assert.equal(report.passed, true)
    assert.deepEqual(report.thresholdFailures, [])
    assert.equal(report.metrics.coverage, 1)
    assert.equal(report.metrics.taxonomyNodeAccuracy, 1)
    assert.equal(report.metrics.top3TemplateRecall, 1)
    assert.equal(maxActive <= 4, true)
    assert.equal(maxActive > 1, true)
  })

  it('fails staging admission when the provider is unavailable', async () => {
    const report = await runEncyclopediaGuidanceGoldenEvaluation({
      fixtures: ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.slice(0, 5),
      gateway: {
        async analyzeEncyclopediaEntry() {
          throw new GuidanceAnalysisGatewayError('GUIDANCE_RUNTIME_UNAVAILABLE', 'model unavailable')
        },
      },
    })

    assert.equal(report.passed, false)
    assert.equal(report.metrics.coverage, 0)
    assert.equal(report.cases.every(item => item.error?.code === 'GUIDANCE_RUNTIME_UNAVAILABLE'), true)
    assert.equal(report.thresholdFailures.some(item => item.startsWith('coverage ')), true)
  })

  it('reports valid but semantically degraded model output below quality thresholds', async () => {
    const fixtures = ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.slice(0, 10)
    const gateway: GuidanceAnalysisGateway = {
      async analyzeEncyclopediaEntry(input) {
        return degradedAnalysis(input)
      },
    }

    const report = await runEncyclopediaGuidanceGoldenEvaluation({ gateway, fixtures })

    assert.equal(report.metrics.coverage, 1)
    assert.equal(report.passed, false)
    assert.ok(report.metrics.l2Accuracy < report.thresholds.l2Accuracy)
    assert.ok(report.metrics.top3TemplateRecall < report.thresholds.top3TemplateRecall)
  })
})

function perfectAnalysis(
  input: EncyclopediaGuidanceAnalysisInputV2,
  fixture: (typeof ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES)[number],
): EncyclopediaGuidanceAnalysisV2 {
  const candidate = input.taxonomy.candidates.find(item => item.taxonomyNodeId === fixture.expected.taxonomyNodeId)
  assert.ok(candidate)
  const templatePackId = fixture.expected.templatePackIds.find(id => input.allowedCapabilities.templatePackIds.includes(id))
    ?? input.allowedCapabilities.templatePackIds[0]!
  const paradigm = listCapabilities().interactionParadigms.find(item => item.compatibleTemplatePackIds.includes(templatePackId))
  assert.ok(paradigm)
  return analysisFixture(input, {
    taxonomyNodeId: candidate.taxonomyNodeId,
    l1: fixture.expected.l1,
    l2: fixture.expected.l2,
    l3: fixture.expected.l3,
    primaryIntent: fixture.expected.primaryIntent,
    templatePackId,
    interactionParadigmId: paradigm.id,
    requiresClarification: fixture.expected.requiresClarification,
  })
}

function degradedAnalysis(input: EncyclopediaGuidanceAnalysisInputV2): EncyclopediaGuidanceAnalysisV2 {
  const candidate = input.taxonomy.candidates[0]!
  const templatePackId = input.allowedCapabilities.templatePackIds[0]!
  const paradigm = listCapabilities().interactionParadigms.find(item => item.compatibleTemplatePackIds.includes(templatePackId))
    ?? listCapabilities().interactionParadigms.find(item => input.allowedCapabilities.interactionParadigmIds.includes(item.id))!
  return analysisFixture(input, {
    taxonomyNodeId: candidate.taxonomyNodeId,
    l1: candidate.l1,
    l2: candidate.l2,
    l3: candidate.l3,
    primaryIntent: candidate.compatiblePrimaryIntentIds?.[0] ?? input.allowedCapabilities.primaryIntentIds?.[0]!,
    templatePackId,
    interactionParadigmId: paradigm.id,
    requiresClarification: false,
  })
}

function analysisFixture(input: EncyclopediaGuidanceAnalysisInputV2, value: {
  taxonomyNodeId: string
  l1: string
  l2: string
  l3: string
  primaryIntent: string
  templatePackId: string
  interactionParadigmId: string
  requiresClarification: boolean
}): EncyclopediaGuidanceAnalysisV2 {
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: value.requiresClarification ? 'needs_clarification' : 'completed',
    entity: {
      canonicalTitle: input.entry.title,
      aliases: [],
      classification: {
        taxonomyNodeId: value.taxonomyNodeId,
        l1: value.l1,
        l2: value.l2,
        l3: value.l3,
        confidence: 0.95,
        reason: 'Golden evaluation fixture.',
        evidenceIds: [],
      },
      alternatives: [],
    },
    intent: {
      primaryIntent: value.primaryIntent,
      secondaryIntents: [],
      requestedContent: [],
      requestedInteractions: [],
      audience: null,
      depth: 'standard',
    },
    dataReadiness: {
      availableFacts: [],
      missingFacts: [],
      requiresResearch: false,
      riskFlags: [],
    },
    templateRecommendations: [{
      templatePackId: value.templatePackId,
      interactionParadigmId: value.interactionParadigmId,
      score: 0.95,
      reason: 'Golden evaluation template.',
      requiredModuleIds: [],
      evidenceCaseIds: [],
    }],
    clarification: {
      required: value.requiresClarification,
      questions: value.requiresClarification ? ['请补充词条所属领域。'] : [],
    },
    evidence: { taxonomyNodeIds: [value.taxonomyNodeId], democaseIds: [] },
    execution: {
      providerId: 'golden-test',
      modelId: 'golden-test',
      runtimeVersion: 'test',
      promptVersion: 'test',
      taxonomyVersion: input.taxonomy.version,
      democaseIndexVersion: input.democase.indexVersion,
      durationMs: 1,
      repaired: false,
    },
  }
}
