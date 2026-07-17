import type { EncyclopediaGuidanceGoldenFixture } from './fixtures/encyclopediaGuidanceGolden.js'

export type EncyclopediaGuidanceGoldenPrediction = {
  fixtureId: string
  taxonomyNodeId: string | null
  l1: string | null
  l2: string | null
  l3: string | null
  primaryIntent: string | null
  topTemplatePackIds: string[]
  requiresClarification: boolean
  clarificationQuestions?: string[]
}

export type EncyclopediaGuidanceGoldenMetrics = {
  total: number
  predicted: number
  coverage: number
  l1Accuracy: number
  l2Accuracy: number
  taxonomyNodeAccuracy: number
  primaryIntentAccuracy: number
  top3TemplateRecall: number
  clarificationPrecision: number
  clarificationRecall: number
}

export function evaluateEncyclopediaGuidanceGolden(
  fixtures: EncyclopediaGuidanceGoldenFixture[],
  predictions: EncyclopediaGuidanceGoldenPrediction[],
): EncyclopediaGuidanceGoldenMetrics {
  const predictionsById = new Map(predictions.map(prediction => [prediction.fixtureId, prediction]))
  let predicted = 0
  let l1Correct = 0
  let l2Correct = 0
  let taxonomyCorrect = 0
  let intentCorrect = 0
  let templateHit = 0
  let clarificationTruePositive = 0
  let clarificationFalsePositive = 0
  let clarificationFalseNegative = 0
  for (const fixture of fixtures) {
    const prediction = predictionsById.get(fixture.id)
    if (!prediction) continue
    predicted += 1
    if (prediction.l1 === fixture.expected.l1) l1Correct += 1
    if (prediction.l2 === fixture.expected.l2) l2Correct += 1
    if (prediction.taxonomyNodeId === fixture.expected.taxonomyNodeId) taxonomyCorrect += 1
    if (prediction.primaryIntent === fixture.expected.primaryIntent) intentCorrect += 1
    if (prediction.topTemplatePackIds.slice(0, 3).some(id => fixture.expected.templatePackIds.includes(id))) templateHit += 1
    if (prediction.requiresClarification && fixture.expected.requiresClarification) clarificationTruePositive += 1
    if (prediction.requiresClarification && !fixture.expected.requiresClarification) clarificationFalsePositive += 1
    if (!prediction.requiresClarification && fixture.expected.requiresClarification) clarificationFalseNegative += 1
  }
  return {
    total: fixtures.length,
    predicted,
    coverage: ratio(predicted, fixtures.length),
    l1Accuracy: ratio(l1Correct, predicted),
    l2Accuracy: ratio(l2Correct, predicted),
    taxonomyNodeAccuracy: ratio(taxonomyCorrect, predicted),
    primaryIntentAccuracy: ratio(intentCorrect, predicted),
    top3TemplateRecall: ratio(templateHit, predicted),
    clarificationPrecision: ratio(clarificationTruePositive, clarificationTruePositive + clarificationFalsePositive),
    clarificationRecall: ratio(clarificationTruePositive, clarificationTruePositive + clarificationFalseNegative),
  }
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}
