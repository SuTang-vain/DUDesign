import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import { createRuntimeAdapterServer } from './app.js'
import { NexusClient } from './nexusClient.js'

describe('runtime adapter guidance analysis bridge', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('runs a tool-free BabeL-O analysis and returns a validated DUDesign response', async () => {
    const executeBodies: Array<Record<string, unknown>> = []
    const harness = await createHarness(async (url, init) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_1' }, 201)
      if (url.endsWith('/v1/execute')) {
        executeBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return executeResponse(guidanceResult())
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 200)
      const result = await response.json() as EncyclopediaGuidanceAnalysisV2
      assert.equal(result.analysisMode, 'ai')
      assert.equal(result.execution.providerId, 'babel-o')
      assert.equal(result.execution.repaired, false)
      assert.deepEqual(executeBodies[0]?.allowedTools, [])
      assert.equal(executeBodies[0]?.skipPermissionCheck, true)
    } finally {
      await harness.close()
    }
  })

  it('repairs one invalid model response in the same isolated runtime session', async () => {
    let executeCount = 0
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_repair' }, 201)
      if (url.endsWith('/v1/execute')) {
        executeCount += 1
        return executeCount === 1
          ? executeResponse({ ...guidanceResult(), templateRecommendations: [] })
          : executeResponse(guidanceResult())
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 200)
      const result = await response.json() as EncyclopediaGuidanceAnalysisV2
      assert.equal(executeCount, 2)
      assert.equal(result.execution.repaired, true)
    } finally {
      await harness.close()
    }
  })

  it('normalizes safe provider dialect drift without spending the repair attempt', async () => {
    let executeCount = 0
    const drifted = guidanceResult() as unknown as Record<string, unknown>
    drifted.status = 'COMPLETED_SUCCESSFULLY'
    drifted.clarification = null
    drifted.evidence = null
    drifted.entity = {
      ...(drifted.entity as Record<string, unknown>),
      alternatives: [{ reason: 'partial provider suggestion' }],
    }
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_drift' }, 201)
      if (url.endsWith('/v1/execute')) {
        executeCount += 1
        return executeResponse(drifted)
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 200)
      const result = await response.json() as EncyclopediaGuidanceAnalysisV2
      assert.equal(executeCount, 1)
      assert.equal(result.status, 'completed')
      assert.deepEqual(result.entity.alternatives, [])
      assert.deepEqual(result.clarification, { required: false, questions: [] })
      assert.deepEqual(result.evidence, {
        taxonomyNodeIds: ['taxonomy_tv_historical'],
        democaseIds: ['case_qing_yu_nian'],
      })
    } finally {
      await harness.close()
    }
  })

  it('retries the initial guidance execute once after a raw Nexus timeout', async () => {
    let executeCount = 0
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_timeout_retry' }, 201)
      if (url.endsWith('/v1/execute')) {
        executeCount += 1
        return executeCount === 1
          ? jsonResponse({ type: 'error', code: 'EXECUTION_TIMEOUT' }, 408)
          : executeResponse(guidanceResult())
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 200)
      assert.equal(executeCount, 2)
    } finally {
      await harness.close()
    }
  })

  it('keeps entity ambiguity blocking but downgrades optional scope questions', async () => {
    let executeCount = 0
    const optional = guidanceResult()
    optional.status = 'needs_clarification'
    optional.clarification = {
      required: true,
      questions: ['希望覆盖全部角色还是只展示主要角色？'],
    }
    const blocking = guidanceResult()
    blocking.status = 'needs_clarification'
    blocking.clarification = {
      required: true,
      questions: ['您指的是哪一部作品？'],
    }
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_clarification_policy' }, 201)
      if (url.endsWith('/v1/execute')) {
        executeCount += 1
        return executeResponse(executeCount === 1 ? optional : blocking)
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const optionalResponse = await post(harness.baseUrl, guidanceInput())
      const optionalResult = await optionalResponse.json() as EncyclopediaGuidanceAnalysisV2
      assert.equal(optionalResult.status, 'completed')
      assert.equal(optionalResult.clarification.required, false)

      const blockingResponse = await post(harness.baseUrl, { ...guidanceInput(), analysisId: 'ega_runtime_bridge_2' })
      const blockingResult = await blockingResponse.json() as EncyclopediaGuidanceAnalysisV2
      assert.equal(blockingResult.status, 'needs_clarification')
      assert.equal(blockingResult.clarification.required, true)
    } finally {
      await harness.close()
    }
  })

  it('returns a stable invalid-response error after the single repair is exhausted', async () => {
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ sessionId: 'guidance_session_invalid' }, 201)
      if (url.endsWith('/v1/execute')) {
        return jsonResponse({
          success: true,
          events: [{ type: 'assistant_delta', delta: 'not json' }],
        })
      }
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 502)
      const error = await response.json() as { code: string }
      assert.equal(error.code, 'GUIDANCE_INVALID_RESPONSE')
    } finally {
      await harness.close()
    }
  })

  it('maps raw Nexus outages to guidance runtime unavailable', async () => {
    const harness = await createHarness(async (url) => {
      if (url.endsWith('/v1/sessions')) return jsonResponse({ type: 'error' }, 503)
      return jsonResponse({ status: 'ok' })
    }, roots)
    try {
      const response = await post(harness.baseUrl, guidanceInput())
      assert.equal(response.status, 503)
      const error = await response.json() as { code: string }
      assert.equal(error.code, 'GUIDANCE_RUNTIME_UNAVAILABLE')
    } finally {
      await harness.close()
    }
  })
})

async function createHarness(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  roots: string[],
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const workspaceBase = await mkdtemp(join(tmpdir(), 'dudesign-guidance-adapter-'))
  roots.push(workspaceBase)
  const nexus = new NexusClient({
    baseUrl: 'https://nexus.guidance.test',
    fetch: ((url, init) => fetchImpl(String(url), init)) as typeof fetch,
  })
  const server = createRuntimeAdapterServer({ nexus, workspaceBase, guidanceExecuteTimeoutMs: 5000 })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(() => resolve())),
  }
}

function post(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/v1/guidance/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function executeResponse(result: unknown): Response {
  return jsonResponse({
    type: 'execute_result',
    success: true,
    events: [{ type: 'assistant_delta', delta: JSON.stringify(result) }],
  })
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function guidanceInput(): EncyclopediaGuidanceAnalysisInputV2 {
  return {
    schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
    analysisId: 'ega_runtime_bridge_1',
    userId: 'user_test',
    workspaceId: 'workspace_test',
    entry: { title: '庆余年', rawInput: '庆余年人物关系与剧情脉络', context: null },
    taxonomy: {
      version: 'taxonomy-test',
      candidates: [{
        taxonomyNodeId: 'taxonomy_tv_historical',
        l1: '影视作品',
        l2: '电视剧',
        l3: '古装历史剧',
        aliases: ['古装剧'],
        positiveSignals: ['人物关系'],
        negativeSignals: [],
        compatibleTemplatePackIds: ['dtp_de_tv_character_relation'],
        compatibleInteractionParadigmIds: ['ip_relation_map'],
        riskFlags: ['plot_hallucination_risk'],
      }],
    },
    democase: {
      indexVersion: 'democase-test',
      evidence: [{
        caseId: 'case_qing_yu_nian',
        title: '庆余年人物关系',
        taxonomyNodeId: 'taxonomy_tv_historical',
        summary: '电视剧人物关系参考。',
        score: 0.9,
        matchedEvidence: ['人物关系'],
        preferredTemplatePackIds: ['dtp_de_tv_character_relation'],
        interactionParadigmIds: ['ip_relation_map'],
        contentHash: 'sha256:test',
      }],
    },
    allowedCapabilities: {
      templatePackIds: ['dtp_de_tv_character_relation'],
      interactionParadigmIds: ['ip_relation_map'],
    },
    limits: { maxAlternativeCategories: 3, maxTemplateRecommendations: 3, maxClarificationQuestions: 3 },
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
        reason: '输入明确要求人物关系与剧情脉络。',
        evidenceIds: ['case_qing_yu_nian'],
      },
      alternatives: [],
    },
    intent: {
      primaryIntent: 'character_relationship_exploration',
      secondaryIntents: ['plot_context_navigation'],
      requestedContent: ['人物关系', '剧情脉络'],
      requestedInteractions: ['关系节点切换'],
      audience: null,
      depth: 'deep',
    },
    dataReadiness: {
      availableFacts: ['词条标题'],
      missingFacts: ['可靠剧情来源'],
      requiresResearch: true,
      riskFlags: ['plot_hallucination_risk'],
    },
    templateRecommendations: [{
      templatePackId: 'dtp_de_tv_character_relation',
      interactionParadigmId: 'ip_relation_map',
      score: 0.94,
      reason: '人物关系是主要浏览目标。',
      requiredModuleIds: ['character_relation_graph'],
      evidenceCaseIds: ['case_qing_yu_nian'],
    }],
    clarification: { required: false, questions: [] },
    evidence: {
      taxonomyNodeIds: ['taxonomy_tv_historical'],
      democaseIds: ['case_qing_yu_nian'],
    },
    execution: {
      providerId: 'model-placeholder',
      modelId: null,
      runtimeVersion: null,
      promptVersion: 'model-placeholder',
      taxonomyVersion: 'taxonomy-test',
      democaseIndexVersion: 'democase-test',
      durationMs: 0,
      repaired: false,
    },
  }
}
