import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  BabelOGuidanceAnalysisGateway,
  GuidanceAnalysisGatewayError,
  type GuidanceAnalysisGateway,
} from '@dudesign/runtime-gateway'
import { EncyclopediaGuidanceApplicationService } from './application/encyclopediaGuidanceApplicationService.js'
import {
  evaluateEncyclopediaGuidanceGolden,
  type EncyclopediaGuidanceGoldenMetrics,
  type EncyclopediaGuidanceGoldenPrediction,
} from './encyclopediaGuidanceGoldenEvaluator.js'
import { ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION } from './encyclopediaGuidanceEvidence.js'
import { ENCYCLOPEDIA_TAXONOMY_VERSION } from './encyclopediaTaxonomy.js'
import {
  ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES,
  type EncyclopediaGuidanceGoldenFixture,
} from './fixtures/encyclopediaGuidanceGolden.js'
import { InMemoryStore } from './store.js'

export const ENCYCLOPEDIA_GUIDANCE_EVALUATION_SCHEMA_VERSION = '2026-07-15.dudesign-guidance-evaluation.v1' as const

export type EncyclopediaGuidanceEvaluationThresholds = {
  coverage: number
  l1Accuracy: number
  l2Accuracy: number
  taxonomyNodeAccuracy: number
  primaryIntentAccuracy: number
  top3TemplateRecall: number
  clarificationPrecision: number
  clarificationRecall: number
}

export const DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS: EncyclopediaGuidanceEvaluationThresholds = {
  coverage: 0.98,
  l1Accuracy: 0.9,
  l2Accuracy: 0.82,
  taxonomyNodeAccuracy: 0.78,
  primaryIntentAccuracy: 0.75,
  top3TemplateRecall: 0.85,
  clarificationPrecision: 0.7,
  clarificationRecall: 0.7,
}

export type EncyclopediaGuidanceEvaluationCaseResult = {
  fixtureId: string
  entry: string
  status: 'completed' | 'failed'
  durationMs: number
  prediction: EncyclopediaGuidanceGoldenPrediction | null
  error: {
    code: string
    message: string
  } | null
}

export type EncyclopediaGuidanceEvaluationReport = {
  schemaVersion: typeof ENCYCLOPEDIA_GUIDANCE_EVALUATION_SCHEMA_VERSION
  startedAt: string
  completedAt: string
  fixtureCount: number
  taxonomyVersion: string
  democaseIndexVersion: string
  metrics: EncyclopediaGuidanceGoldenMetrics
  thresholds: EncyclopediaGuidanceEvaluationThresholds
  passed: boolean
  thresholdFailures: string[]
  cases: EncyclopediaGuidanceEvaluationCaseResult[]
}

export async function runEncyclopediaGuidanceGoldenEvaluation(input: {
  gateway: GuidanceAnalysisGateway
  fixtures?: EncyclopediaGuidanceGoldenFixture[]
  thresholds?: EncyclopediaGuidanceEvaluationThresholds
  concurrency?: number
}): Promise<EncyclopediaGuidanceEvaluationReport> {
  const startedAt = new Date().toISOString()
  const fixtures = input.fixtures ?? ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES
  const thresholds = input.thresholds ?? DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS
  const store = new InMemoryStore()
  const service = new EncyclopediaGuidanceApplicationService(store, input.gateway)
  const results = await mapWithConcurrency(fixtures, boundedInteger(input.concurrency, 1, 12, 3), async fixture => {
    const started = Date.now()
    try {
      const analysis = await service.analyzeEntry({
        requestId: `eval_${fixture.id}`,
        userId: store.devUser.id,
        adminRole: null,
        authMode: 'dev',
        authSessionTokenHash: null,
      }, {
        workspaceId: store.devWorkspace.id,
        entry: fixture.entry,
        context: fixture.context,
        maxTemplateRecommendations: 3,
        maxClarificationQuestions: 3,
      })
      return {
        fixtureId: fixture.id,
        entry: fixture.entry,
        status: 'completed' as const,
        durationMs: Date.now() - started,
        prediction: {
          fixtureId: fixture.id,
          taxonomyNodeId: analysis.entity.classification.taxonomyNodeId,
          l1: analysis.entity.classification.l1,
          l2: analysis.entity.classification.l2,
          l3: analysis.entity.classification.l3,
          primaryIntent: analysis.intent.primaryIntent,
          topTemplatePackIds: analysis.templateRecommendations.map(item => item.templatePackId).slice(0, 3),
          requiresClarification: analysis.clarification.required || analysis.status === 'needs_clarification',
          clarificationQuestions: [...analysis.clarification.questions],
        },
        error: null,
      }
    } catch (error) {
      return {
        fixtureId: fixture.id,
        entry: fixture.entry,
        status: 'failed' as const,
        durationMs: Date.now() - started,
        prediction: null,
        error: {
          code: errorCode(error),
          message: error instanceof Error ? error.message : String(error),
        },
      }
    }
  })
  const predictions = results.flatMap(result => result.prediction ? [result.prediction] : [])
  const metrics = evaluateEncyclopediaGuidanceGolden(fixtures, predictions)
  const thresholdFailures = guidanceThresholdFailures(metrics, thresholds)
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_EVALUATION_SCHEMA_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    fixtureCount: fixtures.length,
    taxonomyVersion: ENCYCLOPEDIA_TAXONOMY_VERSION,
    democaseIndexVersion: ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION,
    metrics,
    thresholds,
    passed: thresholdFailures.length === 0,
    thresholdFailures,
    cases: results,
  }
}

export function guidanceThresholdFailures(
  metrics: EncyclopediaGuidanceGoldenMetrics,
  thresholds: EncyclopediaGuidanceEvaluationThresholds,
): string[] {
  const failures: string[] = []
  for (const key of Object.keys(thresholds) as Array<keyof EncyclopediaGuidanceEvaluationThresholds>) {
    if (metrics[key] < thresholds[key]) failures.push(`${key} ${metrics[key].toFixed(4)} < ${thresholds[key].toFixed(4)}`)
  }
  return failures
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= values.length) return
      results[index] = await mapper(values[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

function errorCode(error: unknown): string {
  if (error instanceof GuidanceAnalysisGatewayError) return error.code
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'GUIDANCE_EVALUATION_ERROR'
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback
}

function thresholdFromEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`${name} must be a number between 0 and 1.`)
  return parsed
}

function thresholdsFromEnv(): EncyclopediaGuidanceEvaluationThresholds {
  return {
    coverage: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_COVERAGE', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.coverage),
    l1Accuracy: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_L1_ACCURACY', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.l1Accuracy),
    l2Accuracy: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_L2_ACCURACY', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.l2Accuracy),
    taxonomyNodeAccuracy: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_TAXONOMY_ACCURACY', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.taxonomyNodeAccuracy),
    primaryIntentAccuracy: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_INTENT_ACCURACY', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.primaryIntentAccuracy),
    top3TemplateRecall: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_TEMPLATE_RECALL', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.top3TemplateRecall),
    clarificationPrecision: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_PRECISION', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.clarificationPrecision),
    clarificationRecall: thresholdFromEnv('DUDESIGN_GUIDANCE_EVAL_MIN_CLARIFICATION_RECALL', DEFAULT_GUIDANCE_EVALUATION_THRESHOLDS.clarificationRecall),
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.DUDESIGN_GUIDANCE_BABELO_BASE_URL
    ?? process.env.BABELO_BASE_URL
    ?? process.env.DUDESIGN_BABELO_BASE_URL
  if (!baseUrl) throw new Error('DUDESIGN_GUIDANCE_BABELO_BASE_URL or BABELO_BASE_URL is required.')
  const fixtureLimit = boundedInteger(Number(process.env.DUDESIGN_GUIDANCE_EVAL_LIMIT), 1, 100, 100)
  const requestedFixtureIds = (process.env.DUDESIGN_GUIDANCE_EVAL_FIXTURE_IDS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const fixtures = requestedFixtureIds.length > 0
    ? requestedFixtureIds.map(id => {
        const fixture = ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.find(item => item.id === id)
        if (!fixture) throw new Error(`Unknown guidance golden fixture id: ${id}.`)
        return fixture
      })
    : ENCYCLOPEDIA_GUIDANCE_GOLDEN_FIXTURES.slice(0, fixtureLimit)
  const report = await runEncyclopediaGuidanceGoldenEvaluation({
    gateway: new BabelOGuidanceAnalysisGateway({
      baseUrl,
      endpointPath: process.env.DUDESIGN_GUIDANCE_ANALYSIS_ENDPOINT,
      apiKey: process.env.DUDESIGN_GUIDANCE_BABELO_API_KEY
        ?? process.env.BABELO_API_KEY
        ?? process.env.DUDESIGN_BABELO_API_KEY,
      authHeaderName: process.env.DUDESIGN_GUIDANCE_BABELO_AUTH_HEADER
        ?? process.env.BABELO_AUTH_HEADER
        ?? process.env.DUDESIGN_BABELO_AUTH_HEADER,
      timeoutMs: boundedInteger(Number(process.env.DUDESIGN_GUIDANCE_ANALYSIS_TIMEOUT_MS), 1000, 600000, 210000),
    }),
    fixtures,
    thresholds: thresholdsFromEnv(),
    concurrency: boundedInteger(Number(process.env.DUDESIGN_GUIDANCE_EVAL_CONCURRENCY), 1, 12, 3),
  })
  const outputFile = process.env.DUDESIGN_GUIDANCE_EVAL_REPORT
  if (outputFile) {
    const absoluteOutput = resolve(outputFile)
    await mkdir(dirname(absoluteOutput), { recursive: true })
    await writeFile(absoluteOutput, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify({
    passed: report.passed,
    fixtureCount: report.fixtureCount,
    metrics: report.metrics,
    thresholdFailures: report.thresholdFailures,
    report: outputFile ?? null,
  }, null, 2)}\n`)
  if (!report.passed) process.exitCode = 1
}

if (process.argv[1]?.endsWith('encyclopediaGuidanceEvaluationRunner.js')) {
  await main()
}
