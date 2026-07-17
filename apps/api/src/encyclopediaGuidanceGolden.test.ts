import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateEncyclopediaGuidanceGolden } from './encyclopediaGuidanceGoldenEvaluator.js'
import { resolveEncyclopediaTaxonomyCandidates } from './encyclopediaTaxonomy.js'
import { ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES } from './fixtures/encyclopediaGuidanceGolden.js'

describe('Encyclopedia guidance golden dataset', () => {
  it('contains exactly 100 unique fixtures across 20 high-frequency L2 categories', () => {
    assert.equal(ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.length, 100)
    assert.equal(new Set(ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.map(fixture => fixture.id)).size, 100)
    assert.equal(new Set(ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.map(fixture => fixture.expected.l2)).size, 20)
    assert.ok(ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.filter(fixture => fixture.expected.requiresClarification).length >= 8)
  })

  it('keeps every resolved fixture taxonomy node inside the AI candidate allowlist', () => {
    for (const fixture of ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES) {
      const candidates = resolveEncyclopediaTaxonomyCandidates({ query: fixture.entry, limit: 48 })
      assert.equal(
        candidates.some(candidate => candidate.taxonomyNodeId === fixture.expected.taxonomyNodeId),
        true,
        `${fixture.id}: ${fixture.expected.taxonomyNodeId}`,
      )
}
  })

  it('calculates perfect classification, intent, template and clarification metrics', () => {
    const metrics = evaluateEncyclopediaGuidanceGolden(
      ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES,
      ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.map(fixture => ({
        fixtureId: fixture.id,
        taxonomyNodeId: fixture.expected.taxonomyNodeId,
        l1: fixture.expected.l1,
        l2: fixture.expected.l2,
        l3: fixture.expected.l3,
        primaryIntent: fixture.expected.primaryIntent,
        topTemplatePackIds: [...fixture.expected.templatePackIds],
        requiresClarification: fixture.expected.requiresClarification,
      })),
    )

    assert.deepEqual(metrics, {
      total: 100,
      predicted: 100,
      coverage: 1,
      l1Accuracy: 1,
      l2Accuracy: 1,
      taxonomyNodeAccuracy: 1,
      primaryIntentAccuracy: 1,
      top3TemplateRecall: 1,
      clarificationPrecision: 1,
      clarificationRecall: 1,
    })
  })

  it('surfaces missing predictions and degraded template/clarification quality', () => {
    const fixtures = ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.slice(0, 10)
    const metrics = evaluateEncyclopediaGuidanceGolden(fixtures, fixtures.slice(0, 5).map(fixture => ({
      fixtureId: fixture.id,
      taxonomyNodeId: 'tax_wrong',
      l1: fixture.expected.l1,
      l2: '错误分类',
      l3: null,
      primaryIntent: null,
      topTemplatePackIds: ['dtp_wrong'],
      requiresClarification: !fixture.expected.requiresClarification,
    })))

    assert.equal(metrics.coverage, 0.5)
    assert.equal(metrics.l1Accuracy, 1)
    assert.equal(metrics.l2Accuracy, 0)
    assert.equal(metrics.top3TemplateRecall, 0)
    assert.equal(metrics.primaryIntentAccuracy, 0)
    assert.ok(metrics.clarificationPrecision < 1)
  })
})
