import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import type { GuidanceAnalysisGateway } from '@dudesign/runtime-gateway'
import { InMemoryStore } from '../store.js'
import { EncyclopediaGuidanceApplicationService } from './encyclopediaGuidanceApplicationService.js'

describe('EncyclopediaGuidanceApplicationService', () => {
  it('orchestrates taxonomy, democase evidence and capability allowlists before AI analysis', async () => {
    const store = new InMemoryStore()
    const captured: EncyclopediaGuidanceAnalysisInputV2[] = []
    const gateway: GuidanceAnalysisGateway = {
      async analyzeEncyclopediaEntry(input) {
        captured.push(input)
        return completedAnalysis(input)
      },
    }
    const service = new EncyclopediaGuidanceApplicationService(store, gateway)

    const result = await service.analyzeEntry(context(store.devUser.id), {
      workspaceId: store.devWorkspace.id,
      entry: '庆余年人物关系与分集剧情',
      maxTemplateRecommendations: 2,
    })

    assert.equal(result.analysisMode, 'ai')
    const request = captured[0]
    assert.ok(request)
    assert.equal(request.taxonomy.version, '2026-07-15.kedu-taxonomy.v1')
    assert.equal(request.taxonomy.candidates.some(candidate => candidate.taxonomyNodeId === 'tax_screen_tv'), true)
    assert.equal(request.democase.evidence.some(item => item.caseId === 'demo_tv_work'), true)
    assert.equal(request.democase.evidence.some(item => item.experienceProfile?.dominantStage === 'relation_map'), true)
    assert.equal(request.allowedCapabilities.templatePackIds.includes('dtp_de_tv_character_relation'), true)
    assert.equal(request.limits.maxTemplateRecommendations, 2)
  })

  it('rejects workspaces outside the current user boundary before invoking AI', async () => {
    const store = new InMemoryStore()
    let invoked = false
    const service = new EncyclopediaGuidanceApplicationService(store, {
      async analyzeEncyclopediaEntry(input) {
        invoked = true
        return completedAnalysis(input)
      },
    })

    await assert.rejects(
      () => service.analyzeEntry(context('usr_unknown'), {
        workspaceId: store.devWorkspace.id,
        entry: '李白',
      }),
      (error: unknown) => error instanceof Error && (error as Error & { code?: string }).code === 'USER_NOT_FOUND',
    )
    assert.equal(invoked, false)
  })
})

function completedAnalysis(input: EncyclopediaGuidanceAnalysisInputV2): EncyclopediaGuidanceAnalysisV2 {
  const classification = input.taxonomy.candidates.find(candidate => candidate.taxonomyNodeId === 'tax_screen_tv')
    ?? input.taxonomy.candidates[0]!
  const templatePackId = input.allowedCapabilities.templatePackIds.includes('dtp_de_tv_character_relation')
    ? 'dtp_de_tv_character_relation'
    : input.allowedCapabilities.templatePackIds[0]!
  const interactionParadigmId = input.allowedCapabilities.interactionParadigmIds.includes('ip_relation_map')
    ? 'ip_relation_map'
    : input.allowedCapabilities.interactionParadigmIds[0]!
  const evidenceCaseId = input.democase.evidence[0]?.caseId
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: 'completed',
    entity: {
      canonicalTitle: input.entry.title,
      aliases: [],
      classification: {
        taxonomyNodeId: classification.taxonomyNodeId,
        l1: classification.l1,
        l2: classification.l2,
        l3: classification.l3,
        confidence: 0.93,
        reason: 'AI fixture classification.',
        evidenceIds: evidenceCaseId ? [evidenceCaseId] : [],
      },
      alternatives: [],
    },
    intent: {
      primaryIntent: 'character_relationship_exploration',
      secondaryIntents: [],
      requestedContent: ['人物关系', '剧情脉络'],
      requestedInteractions: ['关系图'],
      audience: null,
      depth: 'deep',
    },
    dataReadiness: {
      availableFacts: ['entry title'],
      missingFacts: ['verified relationship data'],
      requiresResearch: true,
      riskFlags: classification.riskFlags,
    },
    templateRecommendations: [{
      templatePackId,
      interactionParadigmId,
      score: 0.91,
      reason: 'Matches the requested relationship exploration intent.',
      requiredModuleIds: ['character_relation_graph'],
      evidenceCaseIds: evidenceCaseId ? [evidenceCaseId] : [],
    }],
    clarification: { required: false, questions: [] },
    evidence: {
      taxonomyNodeIds: [classification.taxonomyNodeId],
      democaseIds: evidenceCaseId ? [evidenceCaseId] : [],
    },
    execution: {
      providerId: 'test-ai',
      modelId: 'test-model',
      runtimeVersion: 'test',
      promptVersion: 'test-v1',
      taxonomyVersion: input.taxonomy.version,
      democaseIndexVersion: input.democase.indexVersion,
      durationMs: 5,
      repaired: false,
    },
  }
}

function context(userId: string) {
  return {
    requestId: 'req_guidance_test',
    userId,
    adminRole: null,
    authMode: 'dev' as const,
    authSessionTokenHash: null,
  }
}
