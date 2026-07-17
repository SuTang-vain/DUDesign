import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import {
  BabelOGuidanceAnalysisGateway,
  GuidanceAnalysisGatewayError,
  validateEncyclopediaGuidanceAnalysis,
} from './guidanceAnalysis.js'

describe('Guidance analysis runtime contract', () => {
  it('accepts a provider-neutral AI analysis constrained to request allowlists', () => {
    const input = guidanceInput()
    const result = guidanceResult()

    assert.deepEqual(validateEncyclopediaGuidanceAnalysis(input, result), result)
  })

  it('rejects template ids invented outside the capability registry allowlist', () => {
    const result = guidanceResult()
    result.templateRecommendations[0]!.templatePackId = 'dtp_invented_by_model'

    assert.throws(
      () => validateEncyclopediaGuidanceAnalysis(guidanceInput(), result),
      (error: unknown) => error instanceof GuidanceAnalysisGatewayError
        && error.code === 'GUIDANCE_INVALID_RESPONSE'
        && /outside the request allowlist/.test(error.message),
    )
  })

  it('rejects primary intent ids outside an explicit intent allowlist', () => {
    const input = guidanceInput()
    input.allowedCapabilities.primaryIntentIds = ['character_relationship_exploration']
    const result = guidanceResult()
    result.intent.primaryIntent = 'invented_intent'

    assert.throws(
      () => validateEncyclopediaGuidanceAnalysis(input, result),
      (error: unknown) => error instanceof GuidanceAnalysisGatewayError
        && error.code === 'GUIDANCE_INVALID_RESPONSE'
        && /primaryIntent/.test(error.message),
    )
  })

  it('calls the BabeL-O compatibility endpoint and validates the structured response', async () => {
    const requests: Array<{ url: string; authorization: string | null; body: unknown }> = []
    const gateway = new BabelOGuidanceAnalysisGateway({
      baseUrl: 'http://babel-o.test/',
      apiKey: 'secret',
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(url),
          authorization: new Headers(init?.headers).get('authorization'),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(JSON.stringify(guidanceResult()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }) as typeof fetch,
    })

    const result = await gateway.analyzeEncyclopediaEntry(guidanceInput())

    assert.equal(result.analysisMode, 'ai')
    assert.deepEqual(requests, [{
      url: 'http://babel-o.test/v1/guidance/analyze',
      authorization: 'Bearer secret',
      body: guidanceInput(),
    }])
  })

  it('maps an unavailable BabeL-O endpoint to a stable guidance error', async () => {
    const gateway = new BabelOGuidanceAnalysisGateway({
      baseUrl: 'http://babel-o.test',
      fetch: (async () => new Response('runtime unavailable', { status: 503 })) as typeof fetch,
    })

    await assert.rejects(
      () => gateway.analyzeEncyclopediaEntry(guidanceInput()),
      (error: unknown) => error instanceof GuidanceAnalysisGatewayError
        && error.code === 'GUIDANCE_RUNTIME_UNAVAILABLE'
        && error.message === 'runtime unavailable',
    )
  })

  it('preserves adapter invalid-response and timeout categories', async () => {
    for (const [status, code] of [[502, 'GUIDANCE_INVALID_RESPONSE'], [504, 'GUIDANCE_TIMEOUT']] as const) {
      const gateway = new BabelOGuidanceAnalysisGateway({
        baseUrl: 'http://babel-o.test',
        fetch: (async () => new Response('adapter error', { status })) as typeof fetch,
      })
      await assert.rejects(
        () => gateway.analyzeEncyclopediaEntry(guidanceInput()),
        (error: unknown) => error instanceof GuidanceAnalysisGatewayError && error.code === code,
      )
    }
  })
})

function guidanceInput(): EncyclopediaGuidanceAnalysisInputV2 {
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisId: 'ega_test_1',
    userId: 'user_test',
    workspaceId: 'workspace_test',
    entry: {
      title: '庆余年',
      rawInput: '庆余年人物关系与剧情脉络',
      context: null,
    },
    taxonomy: {
      version: 'taxonomy-2026-07-15',
      candidates: [{
        taxonomyNodeId: 'taxonomy_tv_historical',
        l1: '影视作品',
        l2: '电视剧',
        l3: '古装历史剧',
        aliases: ['古装剧'],
        positiveSignals: ['人物关系', '剧情脉络'],
        negativeSignals: [],
        compatibleTemplatePackIds: ['dtp_de_tv_character_relation'],
        compatibleInteractionParadigmIds: ['ip_relation_map'],
        riskFlags: ['plot_hallucination_risk', 'spoiler_control_required'],
      }],
    },
    democase: {
      indexVersion: 'democase-2026-07-15',
      evidence: [{
        caseId: 'case_qing_yu_nian_relation',
        title: '庆余年人物图谱与剧情脉络',
        taxonomyNodeId: 'taxonomy_tv_historical',
        summary: '电视剧人物关系与剧情脉络参考。',
        score: 0.94,
        matchedEvidence: ['人物关系', '剧情脉络'],
        preferredTemplatePackIds: ['dtp_de_tv_character_relation'],
        interactionParadigmIds: ['ip_relation_map'],
        contentHash: 'sha256:test',
      }],
    },
    allowedCapabilities: {
      templatePackIds: ['dtp_de_tv_character_relation', 'dtp_de_tv_episode_chain'],
      interactionParadigmIds: ['ip_relation_map', 'ip_causal_event_chain'],
    },
    limits: {
      maxAlternativeCategories: 3,
      maxTemplateRecommendations: 3,
      maxClarificationQuestions: 3,
    },
  }
}

function guidanceResult(): EncyclopediaGuidanceAnalysisV2 {
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: 'completed',
    entity: {
      canonicalTitle: '庆余年',
      aliases: [],
      classification: {
        taxonomyNodeId: 'taxonomy_tv_historical',
        l1: '影视作品',
        l2: '电视剧',
        l3: '古装历史剧',
        confidence: 0.96,
        reason: '输入明确包含电视剧人物关系和剧情脉络意图。',
        evidenceIds: ['case_qing_yu_nian_relation'],
      },
      alternatives: [],
    },
    intent: {
      primaryIntent: 'character_relationship_exploration',
      secondaryIntents: ['plot_context_navigation'],
      requestedContent: ['人物关系', '剧情脉络'],
      requestedInteractions: ['关系图节点切换', '角色详情面板'],
      audience: null,
      depth: 'deep',
    },
    dataReadiness: {
      availableFacts: ['词条标题', '用户目标'],
      missingFacts: ['角色关系资料', '剧情来源'],
      requiresResearch: true,
      riskFlags: ['plot_hallucination_risk', 'spoiler_control_required'],
    },
    templateRecommendations: [{
      templatePackId: 'dtp_de_tv_character_relation',
      interactionParadigmId: 'ip_relation_map',
      score: 0.94,
      reason: '人物关系是当前输入的首要浏览目标。',
      requiredModuleIds: ['character_relation_graph', 'spoiler_control'],
      evidenceCaseIds: ['case_qing_yu_nian_relation'],
    }],
    clarification: {
      required: false,
      questions: [],
    },
    evidence: {
      taxonomyNodeIds: ['taxonomy_tv_historical'],
      democaseIds: ['case_qing_yu_nian_relation'],
    },
    execution: {
      providerId: 'babel-o',
      modelId: 'guidance-model',
      runtimeVersion: 'test',
      promptVersion: 'guidance-prompt-v1',
      taxonomyVersion: 'taxonomy-2026-07-15',
      democaseIndexVersion: 'democase-2026-07-15',
      durationMs: 120,
      repaired: false,
    },
  }
}
