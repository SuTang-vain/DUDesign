import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import {
  GuidanceAnalysisGatewayError,
  validateEncyclopediaGuidanceAnalysis,
} from '@dudesign/runtime-gateway'

export const GUIDANCE_ANALYSIS_PROMPT_VERSION = 'dudesign-guidance-v2.1'

export function assertGuidanceAnalysisInput(value: Record<string, unknown>): EncyclopediaGuidanceAnalysisInputV2 {
  if (value.schemaVersion !== ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION) {
    throw new GuidanceBridgeError('GUIDANCE_CONTRACT_MISMATCH', 'Guidance analysis schema version is incompatible.', 409)
  }
  requiredString(value.analysisId, 'analysisId')
  requiredString(value.userId, 'userId')
  requiredString(value.workspaceId, 'workspaceId')
  const entry = requestObjectValue(value.entry, 'entry')
  requiredString(entry.title, 'entry.title')
  requiredString(entry.rawInput, 'entry.rawInput')
  const taxonomy = requestObjectValue(value.taxonomy, 'taxonomy')
  requiredString(taxonomy.version, 'taxonomy.version')
  if (!Array.isArray(taxonomy.candidates) || taxonomy.candidates.length === 0) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_REQUEST', 'taxonomy.candidates must not be empty.', 400)
  }
  const democase = requestObjectValue(value.democase, 'democase')
  requiredString(democase.indexVersion, 'democase.indexVersion')
  if (!Array.isArray(democase.evidence)) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_REQUEST', 'democase.evidence must be an array.', 400)
  }
  const allowedCapabilities = requestObjectValue(value.allowedCapabilities, 'allowedCapabilities')
  if (!Array.isArray(allowedCapabilities.templatePackIds) || !Array.isArray(allowedCapabilities.interactionParadigmIds)) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_REQUEST', 'allowedCapabilities allowlists must be arrays.', 400)
  }
  requestObjectValue(value.limits, 'limits')
  return value as EncyclopediaGuidanceAnalysisInputV2
}

export function buildGuidanceAnalysisPrompt(input: EncyclopediaGuidanceAnalysisInputV2): string {
  return [
    'You are the DUDesign topic-driven dynamic interactive card guidance classifier.',
    'The entry is a thematic starting point, not a request for a traditional encyclopedia article or encyclopedia website page.',
    'Analyze the user entry and intent using only the taxonomy candidates, democase evidence, and capability allowlists in the request.',
    'Recommend the interaction paradigm and modules that best express the user goal; do not optimize for exhaustive encyclopedia coverage.',
    'Do not call tools, browse, write files, or invent identifiers.',
    'Return exactly one JSON object and no markdown, explanation, or code fence.',
    'Every taxonomyNodeId, evidence id, templatePackId, and interactionParadigmId must come from the request allowlists.',
    'intent.primaryIntent must exactly equal one id from request.allowedCapabilities.primaryIntentIds when that allowlist is present.',
    'After choosing entity.classification, intent.primaryIntent must also come from that candidate compatiblePrimaryIntentIds list.',
    'Use status needs_clarification when the entity type or requested target cannot be disambiguated from the user input.',
    'A short common name must trigger clarification when two materially plausible taxonomy candidates remain, such as place versus administrative region, food versus plant, company versus product, work title versus film/TV medium, or technical versus everyday/social term.',
    'Do not silently choose one category merely because it has a slightly stronger lexical match when the title itself remains polysemous.',
    'clarification.required is blocking: set it true only when no safe default entity classification and template can be selected.',
    'Questions about scope, time range, version, comparison target, content depth, spoiler preference, route entrance, audience, or optional modules are non-blocking preferences and must not set clarification.required to true.',
    'For a well-known named entity with one dominant interpretation, use that dominant interpretation and keep clarification.required false; optional refinement questions may be omitted.',
    'Explicit medium/category words in the input resolve entity type: examples include 电影, 电视剧, 节目, 综艺, 小说, 图书, 三部曲, 游戏, 公司, 城市, 景区, 食品, and 植物.',
    'For zh-CN input, 国庆节 defaults to the National Day of the People\'s Republic of China unless another country or region is named.',
    'Missing research facts, absent source material, or the need to verify claims are dataReadiness concerns and must not by themselves trigger clarification.',
    'A recognizable named entity plus a clear content goal should normally be completed without asking the user a question.',
    'Provide concise Chinese reasons and clarification questions.',
    'The response must match EncyclopediaGuidanceAnalysisV2. Set execution.providerId to babel-o, modelId/runtimeVersion to null, promptVersion to the supplied prompt version, durationMs to 0, and repaired to false.',
    `Prompt version: ${GUIDANCE_ANALYSIS_PROMPT_VERSION}`,
    'Required output contract:',
    guidanceOutputContract(),
    'Request JSON:',
    JSON.stringify(input),
  ].join('\n')
}

export function buildGuidanceRepairPrompt(
  input: EncyclopediaGuidanceAnalysisInputV2,
  previousOutput: unknown,
  validationError: string,
): string {
  return [
    'Repair the previous DUDesign guidance JSON so it strictly matches the requested contract.',
    'Return exactly one JSON object and no markdown or commentary. Do not call tools or invent identifiers.',
    `Validation error: ${validationError}`,
    `Prompt version: ${GUIDANCE_ANALYSIS_PROMPT_VERSION}`,
    'Required output contract:',
    guidanceOutputContract(),
    'Original request JSON:',
    JSON.stringify(input),
    'Previous output JSON:',
    JSON.stringify(previousOutput),
  ].join('\n')
}

export function extractGuidanceAnalysisPayload(events: Array<Record<string, unknown>>): unknown {
  for (const event of [...events].reverse()) {
    for (const field of ['result', 'output', 'data', 'payload']) {
      const candidate = event[field]
      if (isGuidancePayload(candidate)) return candidate
    }
    if (isGuidancePayload(event)) return event
  }

  const assistantText = events
    .filter(event => ['assistant_delta', 'assistant_message', 'message', 'result'].includes(stringField(event, 'type') ?? ''))
    .map(event => stringField(event, 'delta') ?? stringField(event, 'text') ?? stringField(event, 'content') ?? '')
    .join('')
    .trim()
  if (!assistantText) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_RESPONSE', 'BabeL-O guidance execution returned no assistant JSON.', 502)
  }
  return parseJsonObject(assistantText)
}

export function normalizeAndValidateGuidanceAnalysis(
  input: EncyclopediaGuidanceAnalysisInputV2,
  payload: unknown,
  metadata: {
    durationMs: number
    repaired: boolean
    runtimeVersion?: string | null
    modelId?: string | null
  },
): EncyclopediaGuidanceAnalysisV2 {
  const object = objectValue(payload, 'guidance analysis response')
  const entity = objectValueOrEmpty(object.entity)
  const classification = normalizeGuidanceCategoryCandidate(entity.classification)
  const clarification = normalizeGuidanceClarification(input, object.clarification, classification)
  const templateRecommendations = normalizeGuidanceTemplateRecommendations(object.templateRecommendations)
  const normalized = {
    ...object,
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: normalizeGuidanceStatus(object.status, clarification),
    entity: {
      ...entity,
      aliases: normalizeStringArray(entity.aliases),
      classification,
      alternatives: normalizeGuidanceAlternatives(entity.alternatives),
    },
    intent: normalizeGuidanceIntent(object.intent),
    dataReadiness: normalizeGuidanceDataReadiness(object.dataReadiness),
    clarification,
    templateRecommendations,
    evidence: normalizeGuidanceEvidence(input, object.evidence, classification, templateRecommendations),
    execution: {
      ...(objectValueOrEmpty(object.execution)),
      providerId: 'babel-o',
      modelId: metadata.modelId ?? null,
      runtimeVersion: metadata.runtimeVersion ?? null,
      promptVersion: GUIDANCE_ANALYSIS_PROMPT_VERSION,
      taxonomyVersion: input.taxonomy.version,
      democaseIndexVersion: input.democase.indexVersion,
      durationMs: metadata.durationMs,
      repaired: metadata.repaired,
    },
  }
  try {
    return validateEncyclopediaGuidanceAnalysis(input, normalized)
  } catch (error) {
    if (error instanceof GuidanceAnalysisGatewayError) {
      throw new GuidanceBridgeError('GUIDANCE_INVALID_RESPONSE', error.message, 502, normalized)
    }
    throw error
  }
}

function guidanceOutputContract(): string {
  return JSON.stringify({
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: 'completed | needs_clarification | degraded',
    entity: {
      canonicalTitle: 'string',
      aliases: ['string'],
      classification: {
        taxonomyNodeId: 'request.taxonomy.candidates[].taxonomyNodeId',
        l1: 'selected candidate l1',
        l2: 'selected candidate l2',
        l3: 'selected candidate l3',
        confidence: 'number 0..1',
        reason: 'string',
        evidenceIds: ['request.democase.evidence[].caseId'],
      },
      alternatives: ['zero or more classification objects with the same shape'],
    },
    intent: {
      primaryIntent: 'request.allowedCapabilities.primaryIntentIds[]',
      secondaryIntents: ['snake_case intent id'],
      requestedContent: ['string'],
      requestedInteractions: ['string'],
      audience: 'string or null',
      depth: 'summary | standard | deep',
    },
    dataReadiness: {
      availableFacts: ['string'],
      missingFacts: ['string'],
      requiresResearch: 'boolean',
      riskFlags: ['string'],
    },
    templateRecommendations: [{
      templatePackId: 'request.allowedCapabilities.templatePackIds[]',
      interactionParadigmId: 'request.allowedCapabilities.interactionParadigmIds[]',
      score: 'number 0..1',
      reason: 'string',
      requiredModuleIds: ['string'],
      evidenceCaseIds: ['request.democase.evidence[].caseId'],
    }],
    clarification: {
      required: 'boolean',
      questions: ['string'],
    },
    evidence: {
      taxonomyNodeIds: ['request.taxonomy.candidates[].taxonomyNodeId'],
      democaseIds: ['request.democase.evidence[].caseId'],
    },
    execution: {},
  })
}

function normalizeGuidanceStatus(value: unknown, clarification: Record<string, unknown>): unknown {
  if (value === 'needs_clarification') return clarification.required === true ? 'needs_clarification' : 'completed'
  if (value === 'completed') return clarification.required === true ? 'needs_clarification' : 'completed'
  if (value === 'degraded') return value
  if (typeof value !== 'string') return clarification.required === true ? 'needs_clarification' : 'completed'
  const normalized = value.trim().toLowerCase()
  if (/clarif|ambig|need[_ -]?more|待澄清|需澄清/.test(normalized)) return 'needs_clarification'
  if (/degrad|partial|fallback|降级|部分完成/.test(normalized)) return 'degraded'
  if (/success|succeed|complete|ready|\bok\b|done|final|已完成|完成/.test(normalized)) return 'completed'
  return clarification.required === true ? 'needs_clarification' : 'completed'
}

function normalizeGuidanceClarification(
  input: EncyclopediaGuidanceAnalysisInputV2,
  value: unknown,
  classification: Record<string, unknown>,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { required: false, questions: [] }
  }
  const clarification = value as Record<string, unknown>
  const questions = normalizeStringArray(clarification.questions)
  const modelRequired = clarification.required === true || clarification.required === 'true'
  const blockingQuestions = questions.filter(isBlockingClarificationQuestion)
  const candidate = input.taxonomy.candidates.find(item => item.taxonomyNodeId === classification.taxonomyNodeId)
  const explicitCategoryCue = candidate ? hasExplicitCategoryCue(input.entry.rawInput, candidate) : false
  const onlyTypeChoices = blockingQuestions.length > 0 && blockingQuestions.every(isEntityTypeChoiceQuestion)
  const mediaSeriesScope = /系列|三部曲/u.test(input.entry.rawInput)
    && blockingQuestions.every(question => /改编|衍生|主线|正传|媒介|载体|动画|影视/u.test(question))
  const required = modelRequired
    && blockingQuestions.length > 0
    && !(onlyTypeChoices && explicitCategoryCue)
    && !mediaSeriesScope
  return {
    ...clarification,
    required,
    questions,
  }
}

function isBlockingClarificationQuestion(question: string): boolean {
  return /哪一位|哪一个|哪一种|哪一座|哪部作品|哪个(?:国家|地区|城市|领域|场景|含义|对象)|具体(?:是|指|哪)|指的.*(?:是|还是)|指的是.*(?:是|还是)|想了解的.*(?:是|还是)|想了解的是|是指.*还是/u.test(question)
}

function isEntityTypeChoiceQuestion(question: string): boolean {
  return /指的.*(?:是|还是)|指的是.*(?:是|还是)|想了解的.*(?:是|还是)|想了解的是|是指.*还是/u.test(question)
}

function hasExplicitCategoryCue(
  rawInput: string,
  candidate: EncyclopediaGuidanceAnalysisInputV2['taxonomy']['candidates'][number],
): boolean {
  const normalized = rawInput.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
  const cues = [candidate.l2, ...candidate.aliases]
    .map(value => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ''))
    .filter(value => value.length >= 2)
  if (candidate.l2 === '综艺节目') cues.push('节目')
  return cues.some(cue => normalized.includes(cue))
}

function normalizeGuidanceAlternatives(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const candidate = item as Record<string, unknown>
    return typeof candidate.taxonomyNodeId === 'string' && candidate.taxonomyNodeId.trim().length > 0
      && typeof candidate.l1 === 'string' && candidate.l1.trim().length > 0
      && typeof candidate.l2 === 'string' && candidate.l2.trim().length > 0
      && typeof candidate.l3 === 'string' && candidate.l3.trim().length > 0
      && typeof candidate.confidence === 'number'
  }).map(normalizeGuidanceCategoryCandidate)
}

function normalizeGuidanceCategoryCandidate(value: unknown): Record<string, unknown> {
  const candidate = objectValueOrEmpty(value)
  return {
    ...candidate,
    evidenceIds: normalizeStringArray(candidate.evidenceIds),
  }
}

function normalizeGuidanceIntent(value: unknown): Record<string, unknown> {
  const intent = objectValueOrEmpty(value)
  const depth = intent.depth === 'summary' || intent.depth === 'standard' || intent.depth === 'deep'
    ? intent.depth
    : 'standard'
  return {
    ...intent,
    secondaryIntents: normalizeStringArray(intent.secondaryIntents),
    requestedContent: normalizeStringArray(intent.requestedContent),
    requestedInteractions: normalizeStringArray(intent.requestedInteractions),
    audience: typeof intent.audience === 'string' && intent.audience.trim().length > 0 ? intent.audience : null,
    depth,
  }
}

function normalizeGuidanceDataReadiness(value: unknown): Record<string, unknown> {
  const readiness = objectValueOrEmpty(value)
  return {
    ...readiness,
    availableFacts: normalizeStringArray(readiness.availableFacts),
    missingFacts: normalizeStringArray(readiness.missingFacts),
    requiresResearch: readiness.requiresResearch === true || readiness.requiresResearch === 'true',
    riskFlags: normalizeStringArray(readiness.riskFlags),
  }
}

function normalizeGuidanceTemplateRecommendations(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => {
      const recommendation = item as Record<string, unknown>
      return {
        ...recommendation,
        requiredModuleIds: normalizeStringArray(recommendation.requiredModuleIds),
        evidenceCaseIds: normalizeStringArray(recommendation.evidenceCaseIds),
      }
    })
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeGuidanceEvidence(
  input: EncyclopediaGuidanceAnalysisInputV2,
  value: unknown,
  classificationValue: unknown,
  recommendations: unknown[],
): Record<string, unknown> {
  const evidence = objectValueOrEmpty(value)
  const allowedTaxonomyIds = new Set(input.taxonomy.candidates.map(candidate => candidate.taxonomyNodeId))
  const allowedDemocaseIds = new Set(input.democase.evidence.map(item => item.caseId))
  const classification = objectValueOrEmpty(classificationValue)
  const taxonomyNodeIds = new Set(
    Array.isArray(evidence.taxonomyNodeIds)
      ? evidence.taxonomyNodeIds.filter((id): id is string => typeof id === 'string' && allowedTaxonomyIds.has(id))
      : [],
  )
  if (typeof classification.taxonomyNodeId === 'string' && allowedTaxonomyIds.has(classification.taxonomyNodeId)) {
    taxonomyNodeIds.add(classification.taxonomyNodeId)
  }
  const democaseIds = new Set(
    Array.isArray(evidence.democaseIds)
      ? evidence.democaseIds.filter((id): id is string => typeof id === 'string' && allowedDemocaseIds.has(id))
      : [],
  )
  if (Array.isArray(classification.evidenceIds)) {
    classification.evidenceIds.forEach(id => {
      if (typeof id === 'string' && allowedDemocaseIds.has(id)) democaseIds.add(id)
    })
  }
  recommendations.forEach(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return
    const recommendation = item as Record<string, unknown>
    if (!Array.isArray(recommendation.evidenceCaseIds)) return
    recommendation.evidenceCaseIds.forEach(id => {
      if (typeof id === 'string' && allowedDemocaseIds.has(id)) democaseIds.add(id)
    })
  })
  return {
    taxonomyNodeIds: [...taxonomyNodeIds],
    democaseIds: [...democaseIds],
  }
}

export class GuidanceBridgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'GuidanceBridgeError'
  }
}

function parseJsonObject(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(normalized)
  } catch {
    const candidate = firstBalancedJsonObject(normalized)
    if (candidate) {
      try {
        return JSON.parse(candidate)
      } catch {
        // Fall through to the stable adapter error below.
      }
    }
  }
  throw new GuidanceBridgeError('GUIDANCE_INVALID_RESPONSE', 'BabeL-O guidance output was not a valid JSON object.', 502)
}

function firstBalancedJsonObject(value: string): string | null {
  for (let start = value.indexOf('{'); start >= 0; start = value.indexOf('{', start + 1)) {
    let depth = 0
    let quoted = false
    let escaped = false
    for (let index = start; index < value.length; index += 1) {
      const character = value[index]!
      if (quoted) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') quoted = false
        continue
      }
      if (character === '"') quoted = true
      else if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) return value.slice(start, index + 1)
      }
    }
  }
  return null
}

function isGuidancePayload(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (
    (value as Record<string, unknown>).schemaVersion === ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION
    || 'entity' in (value as Record<string, unknown>)
  ))
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_RESPONSE', `${field} must be an object.`, 502)
  }
  return value as Record<string, unknown>
}

function requestObjectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_REQUEST', `${field} must be an object.`, 400)
  }
  return value as Record<string, unknown>
}

function objectValueOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GuidanceBridgeError('GUIDANCE_INVALID_REQUEST', `${field} is required.`, 400)
  }
  return value.trim()
}

function stringField(value: Record<string, unknown>, field: string): string | undefined {
  const candidate = value[field]
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined
}
