import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  CreateDesignJobResponse,
  CreateSessionResponse,
  DesignJobSnapshotResponse,
  EncyclopediaEntryGuidanceResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

const DYNAMIC_GRAPH_ID = 'requirement_graph_dynamic_encyclopedia_entry'

describe('Dynamic encyclopedia capability selection', () => {
  let harness: ApiFlowHarness

  before(async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      store: new InMemoryStore(),
      consumeQueue: false,
    }))
  })

  after(async () => {
    await harness.close()
  })

  it('returns preset exploration guidance and snapshots the normalized selection', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const guidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
      workspaceId: bootstrap.workspace.id,
      entry: '故宫博物院',
      maxTemplateRecommendations: 3,
      automationMode: 'semi_auto',
    })
    assert.equal(guidance.explorationRecommendation.level, 40)
    assert.equal(guidance.explorationRecommendation.requirementModuleGraphId, DYNAMIC_GRAPH_ID)
    assert.match(guidance.explorationRecommendation.reason, /factual invariants locked/i)

    const confirmed = guidance.requiresConfirmation
      ? await postJson<EncyclopediaEntryGuidanceResponse>(`/api/encyclopedia/entry-guidance/${guidance.guidanceId}/confirm`, {
          selectedTemplateIds: guidance.templateRequirements.designTemplatePackIds,
          automationMode: 'semi_auto',
        })
      : guidance
    assert.equal(confirmed.capabilityRequirements.template?.autoDistributeTemplatePacks, false)
    assert.equal(confirmed.capabilityRequirements.template?.aestheticProfileId, 'aes_topic_interactive_card')
    assert.equal(confirmed.capabilityRequirements.template?.colorPaletteId, 'pal_minimal_mono')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Dynamic capability selection fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create a dynamic encyclopedia card for 故宫博物院.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 3,
      capabilityRequirements: confirmed.capabilityRequirements,
      templateRequirements: confirmed.templateRequirements,
      requirementModuleGraphId: confirmed.explorationRecommendation.requirementModuleGraphId,
      exploration: { level: confirmed.explorationRecommendation.level },
    })

    assert.equal(created.job.explorationPlan?.profile.level, 40)
    assert.equal(created.job.capabilitySelectionSnapshot?.presetId, 'preset_dynamic_encyclopedia_card')
    assert.equal(created.job.capabilitySelectionSnapshot?.guidanceId, confirmed.guidanceId)
    assert.deepEqual(created.job.capabilitySelectionSnapshot?.explorationRequest, { level: 40 })
    assert.ok(created.job.capabilitySelectionSnapshot?.selectedSkillIds.includes('sk_encyclopedia_entry_guidance'))
    assert.ok(created.job.capabilitySelectionSnapshot?.selectedMcpToolIds.includes('mcp_encyclopedia_democase_readonly'))

    const snapshot = await getJson<DesignJobSnapshotResponse>(`/api/design-jobs/${created.job.id}`)
    assert.equal(snapshot.job.requirementModuleGraph?.id, DYNAMIC_GRAPH_ID)
    assert.deepEqual(snapshot.job.capabilitySelectionSnapshot, created.job.capabilitySelectionSnapshot)
    assert.equal(snapshot.job.capabilitySelectionSnapshot?.sourceByCapabilityId.sk_encyclopedia_entry_guidance, 'official_preset')
    assertUserSnapshotPrivacy(snapshot)

    const variationDetail = await getJson<VariationDetailResponse>(`/api/variations/${snapshot.variations[0]!.id}`)
    assertUserSnapshotPrivacy(variationDetail)
  })

  it('cycles only confirmed child templates when variation count exceeds recommendations', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const guidance = await postJson<EncyclopediaEntryGuidanceResponse>('/api/encyclopedia/entry-guidance', {
      workspaceId: bootstrap.workspace.id,
      entry: 'BLACKPINK',
      context: '韩国女子音乐组合，页面正文使用简体中文。',
      maxTemplateRecommendations: 3,
      automationMode: 'semi_auto',
    })
    const confirmed = guidance.requiresConfirmation
      ? await postJson<EncyclopediaEntryGuidanceResponse>(`/api/encyclopedia/entry-guidance/${guidance.guidanceId}/confirm`, {
          selectedTemplateIds: guidance.templateRequirements.designTemplatePackIds,
          automationMode: 'semi_auto',
        })
      : guidance
    const selectedTemplateIds = confirmed.templateRequirements.designTemplatePackIds ?? []
    assert.ok(selectedTemplateIds.length > 0)
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Confirmed template cycling fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: '为 BLACKPINK 生成动态百科卡片。',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 6,
      capabilityRequirements: confirmed.capabilityRequirements,
      templateRequirements: confirmed.templateRequirements,
    })
    const snapshot = await getJson<DesignJobSnapshotResponse>(`/api/design-jobs/${created.job.id}`)
    const assigned = snapshot.variations.map(variation => variation.designTemplatePack?.id)
    assert.equal(assigned.every(id => Boolean(id) && selectedTemplateIds.includes(id!)), true)
  })

  it('expands the dynamic encyclopedia parent template pack into child templates for generation', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Dynamic parent template fixture',
      mode: 'new_html',
    })
    const created = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Create a dynamic encyclopedia card for 西湖.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 2,
      capabilityRequirements: {
        template: {
          designTemplatePackIds: ['dtp_dynamic_encyclopedia_card'],
          autoDistributeTemplatePacks: true,
        },
      },
      templateRequirements: {
        designTemplatePackIds: ['dtp_dynamic_encyclopedia_card'],
      },
    })

    const snapshot = await getJson<DesignJobSnapshotResponse>(`/api/design-jobs/${created.job.id}`)
    const assignedTemplateIds = snapshot.variations.map(variation => variation.designTemplatePack?.id)
    assert.equal(assignedTemplateIds.includes('dtp_dynamic_encyclopedia_card'), false)
    assert.equal(
      snapshot.variations.every(variation => variation.designTemplatePack?.parentPackId === 'dtp_dynamic_encyclopedia_card'),
      true,
    )
    assert.ok(snapshot.job.capabilitySelectionSnapshot?.selectedTemplatePackIds.every(id => id !== 'dtp_dynamic_encyclopedia_card'))
  })

  it('rejects removal of required capabilities and experimental exploration without spec review', async () => {
    const bootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      title: 'Dynamic capability policy fixture',
      mode: 'new_html',
    })

    await expectApiError('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Remove required guidance.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      capabilityRequirements: {
        plugins: { skillIds: [], mcpToolIds: ['mcp_encyclopedia_democase_readonly'] },
      },
    }, 400, 'REQUIRED_SKILL_REMOVED')

    await expectApiError('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Use an invalid loop.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      capabilityRequirements: {
        automation: { loopProfileId: 'loop_deep_repair' },
      },
    }, 400, 'DYNAMIC_LOOP_NOT_ALLOWED')

    await expectApiError('/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Experiment without encyclopedia review.',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      exploration: { level: 80 },
      capabilityRequirements: {
        automation: { loopProfileId: 'loop_standard', maxRepairAttempts: 0 },
      },
    }, 409, 'EXPERIMENTAL_REVIEW_REQUIRED')
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

  async function expectApiError(path: string, body: unknown, status: number, code: string): Promise<void> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, status)
    const payload = await response.json() as { error: { code: string } }
    assert.equal(payload.error.code, code)
  }
})

function assertUserSnapshotPrivacy(payload: unknown): void {
  const serialized = JSON.stringify(payload)
  for (const privateField of [
    'serverName',
    'toolName',
    'runtimeSessionId',
    'runtimeChildSessionId',
    'runtimeAgentJobId',
    'runtimeLaneId',
    'runtimeBackendId',
    'runtimeLeaseId',
    'runtimeLastErrorCode',
  ]) {
    assert.equal(serialized.includes(`"${privateField}"`), false, `${privateField} must not be exposed by user snapshot APIs`)
  }

  if (isRecord(payload) && isRecord(payload.job) && 'variations' in payload) {
    assert.deepEqual(Object.keys(payload.job).sort(), [
      'capabilitySelectionSnapshot',
      'capabilitySnapshot',
      'designTemplatePacks',
      'explorationPlan',
      'id',
      'productMode',
      'prompt',
      'requirementModuleGraph',
      'status',
      'variationCount',
    ])
    for (const internalJobField of ['userId', 'workspaceId', 'sessionId', 'templateRequirements']) {
      assert.equal(internalJobField in payload.job, false, `${internalJobField} must not be exposed by the user job snapshot`)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
