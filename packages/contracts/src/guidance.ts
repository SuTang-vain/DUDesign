import type { ID } from './api.js'

export const ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION = '2026-07-15.dudesign-encyclopedia-guidance-analysis.v2' as const

export type EncyclopediaGuidanceAnalysisMode = 'ai' | 'mock' | 'degraded'

export type EncyclopediaDemocaseDominantStage =
  | 'entity_summary'
  | 'timeline_story'
  | 'relation_map'
  | 'fact_compare'
  | 'progressive_disclosure'
  | 'route_guide'

export type EncyclopediaDemocaseExperienceProfile = {
  dominantStage: EncyclopediaDemocaseDominantStage
  firstViewPromise: string
  primaryInteraction: string
  secondaryReveal: string
  attentionBudget: {
    desktop: {
      maxControlGroups: number
      maxVisibleControls: number
      maxVisibleItems: number
    }
    extremeSmall: {
      maxControlGroups: number
      maxVisibleControls: number
      maxPrimaryTabs: number
      maxVisibleItems: number
      maxTextCharacters: number
    }
  }
  preserveAt300x360: string[]
  deferAt300x360: string[]
  forbiddenPatterns: string[]
}

export type EncyclopediaGuidanceTaxonomyCandidate = {
  taxonomyNodeId: ID
  l1: string
  l2: string
  l3: string
  aliases: string[]
  positiveSignals: string[]
  negativeSignals: string[]
  compatibleTemplatePackIds: ID[]
  compatibleInteractionParadigmIds: ID[]
  compatiblePrimaryIntentIds?: ID[]
  riskFlags: string[]
}

export type EncyclopediaGuidanceDemocaseEvidence = {
  caseId: ID
  title: string
  taxonomyNodeId: ID | null
  summary: string
  score: number
  matchedEvidence: string[]
  preferredTemplatePackIds: ID[]
  interactionParadigmIds: ID[]
  contentHash: string | null
  experienceProfile?: EncyclopediaDemocaseExperienceProfile
}

export type EncyclopediaGuidanceAnalysisInputV2 = {
  schemaVersion: typeof ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION
  analysisId: ID
  userId: ID
  workspaceId: ID
  entry: {
    title: string
    rawInput: string
    context: string | null
  }
  taxonomy: {
    version: string
    candidates: EncyclopediaGuidanceTaxonomyCandidate[]
  }
  democase: {
    indexVersion: string
    evidence: EncyclopediaGuidanceDemocaseEvidence[]
  }
  allowedCapabilities: {
    templatePackIds: ID[]
    interactionParadigmIds: ID[]
    /** Optional closed vocabulary for provider-neutral intent normalization. */
    primaryIntentIds?: ID[]
  }
  limits: {
    maxAlternativeCategories: number
    maxTemplateRecommendations: number
    maxClarificationQuestions: number
  }
}

export type EncyclopediaGuidanceCategoryCandidate = {
  taxonomyNodeId: ID
  l1: string
  l2: string
  l3: string
  confidence: number
  reason: string
  evidenceIds: ID[]
}

export type EncyclopediaGuidanceTemplateRecommendationV2 = {
  templatePackId: ID
  interactionParadigmId: ID
  score: number
  reason: string
  requiredModuleIds: ID[]
  evidenceCaseIds: ID[]
}

export type EncyclopediaGuidanceAnalysisV2 = {
  schemaVersion: typeof ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION
  analysisMode: EncyclopediaGuidanceAnalysisMode
  status: 'completed' | 'needs_clarification' | 'degraded'
  entity: {
    canonicalTitle: string
    aliases: string[]
    classification: EncyclopediaGuidanceCategoryCandidate
    alternatives: EncyclopediaGuidanceCategoryCandidate[]
  }
  intent: {
    primaryIntent: string
    secondaryIntents: string[]
    requestedContent: string[]
    requestedInteractions: string[]
    audience: string | null
    depth: 'summary' | 'standard' | 'deep'
  }
  dataReadiness: {
    availableFacts: string[]
    missingFacts: string[]
    requiresResearch: boolean
    riskFlags: string[]
  }
  templateRecommendations: EncyclopediaGuidanceTemplateRecommendationV2[]
  clarification: {
    required: boolean
    questions: string[]
  }
  evidence: {
    taxonomyNodeIds: ID[]
    democaseIds: ID[]
  }
  execution: {
    providerId: string
    modelId: string | null
    runtimeVersion: string | null
    promptVersion: string
    taxonomyVersion: string
    democaseIndexVersion: string
    durationMs: number
    repaired: boolean
  }
}

export type EncyclopediaGuidanceAnalysisErrorCode =
  | 'GUIDANCE_RUNTIME_UNAVAILABLE'
  | 'GUIDANCE_INVALID_RESPONSE'
  | 'GUIDANCE_TIMEOUT'
  | 'GUIDANCE_CONTRACT_MISMATCH'
