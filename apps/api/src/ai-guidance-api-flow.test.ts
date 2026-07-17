import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type CreateDesignJobResponse,
  type CreateSessionResponse,
  type EncyclopediaEntryGuidanceResponse,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import { GuidanceAnalysisGatewayError, type GuidanceAnalysisGateway } from '@dudesign/runtime-gateway'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'

describe('AI-first encyclopedia guidance API flow', () => {
  let harness: ApiFlowHarness
  let store: InMemoryStore
  const requests: EncyclopediaGuidanceAnalysisInputV2[] = []

  before(async () => {
    const gateway: GuidanceAnalysisGateway = {
      async analyzeEncyclopediaEntry(input) {
        requests.push(input)
        return aiAnalysis(input)
      },
    }
    store = new InMemoryStore()
    harness = await startApiFlowHarness(new ApplicationService({
      store,
      guidanceAnalysis: gateway,
      consumeQueue: false,
    }))
  })

  after(async () => {
    await harness.close()
  })

  it('persists AI classification, intent and template evidence instead of mock_rules', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const created = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
      workspaceId: bootstrap.workspace.id,
      entry: '庆余年人物关系与剧情脉络',
      maxTemplateRecommendations: 2,
      automationMode: 'semi_auto',
    })

    assert.equal(requests.length, 1)
    assert.equal(created.classification.source, 'ai_guidance_v2')
    assert.equal(created.classification.primaryCategory, '影视作品')
    assert.equal(created.classification.secondaryCategory, '电视剧')
    assert.equal(created.analysis?.intent.primaryIntent, 'character_relationship_exploration')
    assert.equal(created.recommendedTemplates[0]?.designTemplatePackId, 'dtp_de_tv_character_relation')
    assert.equal(created.templateRequirements.businessContext.classification.source, 'ai_guidance_v2')
    assert.equal(created.templateRequirements.businessContext.classificationVector.source, 'ai_guidance_v2')
    assert.equal(created.templateRequirements.businessContext.democaseExperienceProfiles[0]?.experienceProfile.dominantStage, 'relation_map')
    assert.ok(created.templateRequirements.businessContext.democaseExperienceProfiles[0]?.experienceProfile.preserveAt300x360.length)

    const restored = await getJson<EncyclopediaEntryGuidanceResponse>(`/api/encyclopedia/entry-guidance/${created.guidanceId}`)
    assert.deepEqual(restored.analysis, created.analysis)
    assert.equal(restored.classification.source, 'ai_guidance_v2')
    assert.deepEqual(
      restored.templateRequirements.businessContext.recommendedTemplateIds,
      created.templateRequirements.businessContext.recommendedTemplateIds,
    )
    assert.deepEqual(
      restored.templateRequirements.businessContext.democaseExperienceProfiles,
      created.templateRequirements.businessContext.democaseExperienceProfiles,
    )

    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'AI guidance democase experience snapshot',
      mode: 'new_html',
    })
    const job = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: '为庆余年生成一张简洁的人物关系动态交互卡。',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      capabilityRequirements: created.capabilityRequirements,
      templateRequirements: created.templateRequirements,
      requirementModuleGraphId: created.explorationRecommendation.requirementModuleGraphId,
      exploration: { level: created.explorationRecommendation.level },
    })
    const storedJob = await store.getJobById(job.job.id)
    assert.ok(storedJob)
    const storedBusinessContext = (storedJob.templateRequirements as {
      businessContext?: EncyclopediaEntryGuidanceResponse['templateRequirements']['businessContext']
    }).businessContext
    assert.equal(storedBusinessContext?.classification.source, 'ai_guidance_v2')
    assert.equal(storedBusinessContext?.democaseExperienceProfiles[0]?.experienceProfile.dominantStage, 'relation_map')
  })

  it('returns a stable unavailable error instead of silently falling back to mock classification', async () => {
    const unavailableHarness = await startApiFlowHarness(new ApplicationService({
      store: new InMemoryStore(),
      guidanceAnalysis: {
        async analyzeEncyclopediaEntry() {
          throw new GuidanceAnalysisGatewayError('GUIDANCE_RUNTIME_UNAVAILABLE', 'Guidance model is unavailable.')
        },
      },
      consumeQueue: false,
    }))
    try {
      const bootstrap = await (await fetch(`${unavailableHarness.baseUrl}/api/dev/bootstrap`)).json() as { workspace: { id: string } }
      const response = await fetch(`${unavailableHarness.baseUrl}/api/encyclopedia/entry-guidance`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: bootstrap.workspace.id, entry: '李白' }),
      })
      assert.equal(response.status, 503)
      const payload = await response.json() as { error: { code: string; message: string } }
      assert.equal(payload.error.code, 'GUIDANCE_RUNTIME_UNAVAILABLE')
      assert.equal(payload.error.message, 'Guidance model is unavailable.')
    } finally {
      await unavailableHarness.close()
    }
  })

  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`)
    if (!response.ok) assert.fail(`${path} failed: ${await response.text()}`)
    return response.json() as Promise<T>
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) assert.fail(`${path} failed: ${await response.text()}`)
    return response.json() as Promise<T>
  }
})

function aiAnalysis(input: EncyclopediaGuidanceAnalysisInputV2): EncyclopediaGuidanceAnalysisV2 {
  const classification = input.taxonomy.candidates.find(candidate => candidate.taxonomyNodeId === 'tax_tv_historical')
    ?? input.taxonomy.candidates.find(candidate => candidate.taxonomyNodeId === 'tax_screen_tv')
    ?? input.taxonomy.candidates[0]!
  const democaseId = input.democase.evidence[0]?.caseId
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisMode: 'ai',
    status: 'completed',
    entity: {
      canonicalTitle: '庆余年',
      aliases: [],
      classification: {
        taxonomyNodeId: classification.taxonomyNodeId,
        l1: '影视作品',
        l2: '电视剧',
        l3: '古装历史剧',
        confidence: 0.96,
        reason: 'The entity is a TV drama and the request focuses on character relationships.',
        evidenceIds: democaseId ? [democaseId] : [],
      },
      alternatives: [],
    },
    intent: {
      primaryIntent: 'character_relationship_exploration',
      secondaryIntents: ['plot_context_navigation'],
      requestedContent: ['人物关系', '剧情脉络'],
      requestedInteractions: ['关系图节点切换'],
      audience: null,
      depth: 'deep',
    },
    dataReadiness: {
      availableFacts: ['entry title', 'user intent'],
      missingFacts: ['verified character relation data'],
      requiresResearch: true,
      riskFlags: ['plot_hallucination_risk', 'spoiler_control_required'],
    },
    templateRecommendations: [{
      templatePackId: 'dtp_de_tv_character_relation',
      interactionParadigmId: 'ip_relation_map',
      score: 0.94,
      reason: 'The requested experience is centered on character relationships.',
      requiredModuleIds: ['character_relation_graph', 'spoiler_control'],
      evidenceCaseIds: democaseId ? [democaseId] : [],
    }, {
      templatePackId: 'dtp_de_tv_episode_chain',
      interactionParadigmId: 'ip_causal_event_chain',
      score: 0.86,
      reason: 'The secondary intent requires plot and episode causality navigation.',
      requiredModuleIds: ['episode_causal_chain'],
      evidenceCaseIds: democaseId ? [democaseId] : [],
    }],
    clarification: { required: false, questions: [] },
    evidence: {
      taxonomyNodeIds: [classification.taxonomyNodeId],
      democaseIds: democaseId ? [democaseId] : [],
    },
    execution: {
      providerId: 'babel-o-test',
      modelId: 'guidance-model-test',
      runtimeVersion: 'test',
      promptVersion: 'guidance-v1',
      taxonomyVersion: input.taxonomy.version,
      democaseIndexVersion: input.democase.indexVersion,
      durationMs: 42,
      repaired: false,
    },
  }
}
