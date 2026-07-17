import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisErrorCode,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'

export type GuidanceAnalysisGateway = {
  analyzeEncyclopediaEntry(input: EncyclopediaGuidanceAnalysisInputV2): Promise<EncyclopediaGuidanceAnalysisV2>
}

export class GuidanceAnalysisGatewayError extends Error {
  constructor(
    public readonly code: EncyclopediaGuidanceAnalysisErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'GuidanceAnalysisGatewayError'
  }
}

export type BabelOGuidanceAnalysisGatewayConfig = {
  baseUrl: string
  apiKey?: string
  authHeaderName?: string
  endpointPath?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

export class BabelOGuidanceAnalysisGateway implements GuidanceAnalysisGateway {
  private readonly baseUrl: string
  private readonly endpointPath: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: BabelOGuidanceAnalysisGatewayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.endpointPath = normalizeEndpointPath(config.endpointPath ?? '/v1/guidance/analyze')
    this.timeoutMs = positiveInteger(config.timeoutMs, 210000)
    this.fetchImpl = config.fetch ?? fetch
  }

  async analyzeEncyclopediaEntry(input: EncyclopediaGuidanceAnalysisInputV2): Promise<EncyclopediaGuidanceAnalysisV2> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const requestUrl = `${this.baseUrl}${this.endpointPath}`
    try {
      const response = await this.fetchImpl(requestUrl, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(input),
        signal: controller.signal,
      })
      if (!response.ok) {
        const message = await response.text().catch(() => '')
        throw new GuidanceAnalysisGatewayError(
          guidanceErrorCodeFromStatus(response.status),
          message.trim() || `BabeL-O guidance analysis returned HTTP ${response.status}.`,
        )
      }
      const payload = await response.json().catch(error => {
        throw new GuidanceAnalysisGatewayError('GUIDANCE_INVALID_RESPONSE', 'BabeL-O guidance analysis did not return JSON.', error)
      })
      return validateEncyclopediaGuidanceAnalysis(input, payload)
    } catch (error) {
      if (error instanceof GuidanceAnalysisGatewayError) throw error
      if (isAbortError(error)) {
        throw new GuidanceAnalysisGatewayError('GUIDANCE_TIMEOUT', `BabeL-O guidance analysis exceeded ${this.timeoutMs}ms.`, error)
      }
      throw new GuidanceAnalysisGatewayError(
        'GUIDANCE_RUNTIME_UNAVAILABLE',
        `BabeL-O guidance analysis request failed for ${requestUrl}: ${errorMessage(error)}`,
        error,
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    }
    if (this.config.apiKey) {
      const authHeaderName = this.config.authHeaderName?.trim()
      headers[authHeaderName || 'authorization'] = authHeaderName
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`
    }
    return headers
  }
}

function guidanceErrorCodeFromStatus(status: number): EncyclopediaGuidanceAnalysisErrorCode {
  if (status === 409) return 'GUIDANCE_CONTRACT_MISMATCH'
  if (status === 408 || status === 504) return 'GUIDANCE_TIMEOUT'
  if (status === 400 || status === 422 || status === 502) return 'GUIDANCE_INVALID_RESPONSE'
  return 'GUIDANCE_RUNTIME_UNAVAILABLE'
}

export function validateEncyclopediaGuidanceAnalysis(
  input: EncyclopediaGuidanceAnalysisInputV2,
  value: unknown,
): EncyclopediaGuidanceAnalysisV2 {
  const result = objectValue(value, 'guidance analysis')
  if (result.schemaVersion !== ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION) {
    invalid('Guidance analysis schema version is incompatible.')
  }
  enumValue(result.analysisMode, ['ai', 'mock', 'degraded'], 'analysisMode')
  const status = enumValue(result.status, ['completed', 'needs_clarification', 'degraded'], 'status')

  const taxonomyIds = new Set(input.taxonomy.candidates.map(candidate => candidate.taxonomyNodeId))
  const democaseIds = new Set(input.democase.evidence.map(item => item.caseId))
  const allowedTemplateIds = new Set(input.allowedCapabilities.templatePackIds)
  const allowedParadigmIds = new Set(input.allowedCapabilities.interactionParadigmIds)
  const allowedPrimaryIntentIds = input.allowedCapabilities.primaryIntentIds
    ? new Set(input.allowedCapabilities.primaryIntentIds)
    : null

  const entity = objectValue(result.entity, 'entity')
  nonEmptyString(entity.canonicalTitle, 'entity.canonicalTitle')
  stringArray(entity.aliases, 'entity.aliases', 12)
  validateCategoryCandidate(entity.classification, 'entity.classification', taxonomyIds, democaseIds)
  const classification = objectValue(entity.classification, 'entity.classification')
  const selectedTaxonomyCandidate = input.taxonomy.candidates.find(candidate => candidate.taxonomyNodeId === classification.taxonomyNodeId)
  arrayValue(entity.alternatives, 'entity.alternatives', input.limits.maxAlternativeCategories)
    .forEach((item, index) => validateCategoryCandidate(item, `entity.alternatives[${index}]`, taxonomyIds, democaseIds))

  const intent = objectValue(result.intent, 'intent')
  nonEmptyString(intent.primaryIntent, 'intent.primaryIntent')
  if (allowedPrimaryIntentIds && !allowedPrimaryIntentIds.has(intent.primaryIntent as string)) {
    invalid('intent.primaryIntent references an id outside the request allowlist.')
  }
  if (selectedTaxonomyCandidate?.compatiblePrimaryIntentIds?.length
    && !selectedTaxonomyCandidate.compatiblePrimaryIntentIds.includes(intent.primaryIntent as string)) {
    invalid('intent.primaryIntent is incompatible with the selected taxonomy candidate.')
  }
  stringArray(intent.secondaryIntents, 'intent.secondaryIntents', 12)
  stringArray(intent.requestedContent, 'intent.requestedContent', 20)
  stringArray(intent.requestedInteractions, 'intent.requestedInteractions', 12)
  nullableString(intent.audience, 'intent.audience')
  enumValue(intent.depth, ['summary', 'standard', 'deep'], 'intent.depth')

  const dataReadiness = objectValue(result.dataReadiness, 'dataReadiness')
  stringArray(dataReadiness.availableFacts, 'dataReadiness.availableFacts', 30)
  stringArray(dataReadiness.missingFacts, 'dataReadiness.missingFacts', 30)
  booleanValue(dataReadiness.requiresResearch, 'dataReadiness.requiresResearch')
  stringArray(dataReadiness.riskFlags, 'dataReadiness.riskFlags', 30)

  const recommendations = arrayValue(
    result.templateRecommendations,
    'templateRecommendations',
    input.limits.maxTemplateRecommendations,
  )
  if (status === 'completed' && recommendations.length === 0) {
    invalid('Completed guidance analysis must recommend at least one template.')
  }
  recommendations.forEach((item, index) => {
    const recommendation = objectValue(item, `templateRecommendations[${index}]`)
    allowedId(recommendation.templatePackId, allowedTemplateIds, `templateRecommendations[${index}].templatePackId`)
    allowedId(recommendation.interactionParadigmId, allowedParadigmIds, `templateRecommendations[${index}].interactionParadigmId`)
    probability(recommendation.score, `templateRecommendations[${index}].score`)
    nonEmptyString(recommendation.reason, `templateRecommendations[${index}].reason`)
    stringArray(recommendation.requiredModuleIds, `templateRecommendations[${index}].requiredModuleIds`, 30)
    allowedIds(recommendation.evidenceCaseIds, democaseIds, `templateRecommendations[${index}].evidenceCaseIds`, 20)
  })

  const clarification = objectValue(result.clarification, 'clarification')
  const clarificationRequired = booleanValue(clarification.required, 'clarification.required')
  const questions = stringArray(clarification.questions, 'clarification.questions', input.limits.maxClarificationQuestions)
  if ((status === 'needs_clarification' || clarificationRequired) && questions.length === 0) {
    invalid('Guidance analysis requiring clarification must include at least one question.')
  }

  const evidence = objectValue(result.evidence, 'evidence')
  allowedIds(evidence.taxonomyNodeIds, taxonomyIds, 'evidence.taxonomyNodeIds', 30)
  allowedIds(evidence.democaseIds, democaseIds, 'evidence.democaseIds', 30)

  const execution = objectValue(result.execution, 'execution')
  nonEmptyString(execution.providerId, 'execution.providerId')
  nullableString(execution.modelId, 'execution.modelId')
  nullableString(execution.runtimeVersion, 'execution.runtimeVersion')
  nonEmptyString(execution.promptVersion, 'execution.promptVersion')
  if (execution.taxonomyVersion !== input.taxonomy.version) invalid('Guidance analysis taxonomy version drifted from the request.')
  if (execution.democaseIndexVersion !== input.democase.indexVersion) invalid('Guidance analysis democase index version drifted from the request.')
  nonNegativeNumber(execution.durationMs, 'execution.durationMs')
  booleanValue(execution.repaired, 'execution.repaired')

  return value as EncyclopediaGuidanceAnalysisV2
}

function validateCategoryCandidate(
  value: unknown,
  path: string,
  taxonomyIds: Set<string>,
  democaseIds: Set<string>,
): void {
  const candidate = objectValue(value, path)
  allowedId(candidate.taxonomyNodeId, taxonomyIds, `${path}.taxonomyNodeId`)
  nonEmptyString(candidate.l1, `${path}.l1`)
  nonEmptyString(candidate.l2, `${path}.l2`)
  nonEmptyString(candidate.l3, `${path}.l3`)
  probability(candidate.confidence, `${path}.confidence`)
  nonEmptyString(candidate.reason, `${path}.reason`)
  allowedIds(candidate.evidenceIds, democaseIds, `${path}.evidenceIds`, 20)
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${path} must be an object.`)
  return value as Record<string, unknown>
}

function arrayValue(value: unknown, path: string, maxLength: number): unknown[] {
  if (!Array.isArray(value)) invalid(`${path} must be an array.`)
  if (value.length > maxLength) invalid(`${path} exceeds the maximum length of ${maxLength}.`)
  return value
}

function stringArray(value: unknown, path: string, maxLength: number): string[] {
  const items = arrayValue(value, path, maxLength)
  if (!items.every(item => typeof item === 'string' && item.trim().length > 0)) invalid(`${path} must contain non-empty strings.`)
  return items as string[]
}

function allowedIds(value: unknown, allowed: Set<string>, path: string, maxLength: number): string[] {
  const ids = stringArray(value, path, maxLength)
  ids.forEach(id => allowedId(id, allowed, path))
  return ids
}

function allowedId(value: unknown, allowed: Set<string>, path: string): string {
  const id = nonEmptyString(value, path)
  if (!allowed.has(id)) invalid(`${path} references an id outside the request allowlist: ${id}.`)
  return id
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) invalid(`${path} must be a non-empty string.`)
  return value
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null
  return nonEmptyString(value, path)
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') invalid(`${path} must be a boolean.`)
  return value
}

function probability(value: unknown, path: string): number {
  const number = nonNegativeNumber(value, path)
  if (number > 1) invalid(`${path} must be between 0 and 1.`)
  return number
}

function nonNegativeNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(`${path} must be a non-negative finite number.`)
  return value
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) invalid(`${path} is invalid.`)
  return value as T
}

function normalizeEndpointPath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '/v1/guidance/analyze'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function invalid(message: string): never {
  throw new GuidanceAnalysisGatewayError('GUIDANCE_INVALID_RESPONSE', message)
}
