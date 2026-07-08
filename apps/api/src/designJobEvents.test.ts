import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'
import {
  mcpUnavailableResult,
  type RuntimeGateway,
  type SpawnVariationAgentsInput,
  type RefineVariationInput,
  type CreateRuntimeSessionInput,
  type ResumeRuntimeSessionInput,
  type CancelRuntimeJobInput,
} from '@dudesign/runtime-gateway'
import type {
  CreateDesignJobResponse,
  CreateSessionResponse,
  DesignJobSnapshotResponse,
  ExecuteMcpInvocationResponse,
} from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { InMemoryStore } from './store.js'
import { JobEventBus } from './eventBus.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'
import { InMemoryDesignJobQueue, type QueueJobState, type ScreenshotJobQueuePayload } from './designJobQueue.js'

describe('Design job event persistence and partial failures', () => {
  let harness: ApiFlowHarness | null = null

  after(async () => {
    await harness?.close()
  })

  it('replays persisted job events through SSE after the producing event bus is gone', async () => {
    const store = new InMemoryStore()
    const producingService = new ApplicationService({
      store,
      runtime: new ControlledRuntimeGateway('all-complete'),
      queue: new NoopScreenshotQueue(),
    })
    const bootstrapHarness = await startApiFlowHarness(producingService)
    try {
      const bootstrap = await getJson<{ workspace: { id: string } }>(bootstrapHarness, '/api/dev/bootstrap')
      const session = await postJson<CreateSessionResponse>(bootstrapHarness, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: 'Persisted SSE replay',
      })
      const job = await postJson<CreateDesignJobResponse>(bootstrapHarness, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: 'Persist job events for replay',
        sourceMode: 'new_html',
        variationCount: 1,
        capabilityRequirements: {
          automation: {
            loopProfileId: 'loop_standard',
            maxRepairAttempts: 1,
          },
        },
        templateRequirements: {},
      })
      await waitForJob(bootstrapHarness, job.job.id, 'completed')
      await producingService.flushBackgroundTasks()
      const persistedEvents = await store.listDesignEvents(job.job.id)
      assert.equal(persistedEvents.some(event => event.type === 'design.job_completed'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_started'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_quality_checked'), true)
      assert.equal(persistedEvents.some(event => event.type === 'design.loop_completed'), true)

      harness = await startApiFlowHarness(new ApplicationService({
        store,
        events: new JobEventBus(),
        runtime: new ControlledRuntimeGateway('all-complete'),
        queue: new NoopScreenshotQueue(),
      }))
      const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
      assert.match(streamText, /design\.variation_streaming/)
      assert.match(streamText, /design\.loop_quality_checked/)
      assert.match(streamText, /design\.loop_completed/)
      assert.match(streamText, /design\.job_completed/)
    } finally {
      await harness?.close()
      harness = null
      await bootstrapHarness.close()
    }
  })

  it('marks mixed variation outcomes as a completed job with failed variation count', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('partial-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Partial failure job',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'One variation succeeds and one variation fails',
      sourceMode: 'new_html',
      variationCount: 2,
      templateRequirements: {},
    })
    const snapshot = await waitForJob(harness, job.job.id, 'completed')
    assert.equal(snapshot.variations.filter(variation => variation.status === 'completed').length, 1)
    assert.equal(snapshot.variations.filter(variation => variation.status === 'failed').length, 1)

    const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
    assert.match(streamText, /design\.variation_failed/)
    assert.match(streamText, /"completedVariationCount":1/)
    assert.match(streamText, /"failedVariationCount":1/)
    await harness.close()
    harness = null
  })

  it('keeps artifact-backed variations completed when late runtime events arrive out of order', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('late-streaming-after-complete'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Late runtime event ordering',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Runtime emits completed artifact before a late streaming heartbeat.',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {},
    })
    const snapshot = await waitForJob(harness, job.job.id, 'completed')
    assert.equal(snapshot.variations[0]?.status, 'completed')
    assert.ok(snapshot.variations[0]?.currentArtifactId)

    const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
    assert.match(streamText, /design\.variation_completed/)
    assert.match(streamText, /design\.variation_streaming/)
    await harness.close()
    harness = null
  })

  it('runs one automation repair when generated artifact fails the static gate and attempts remain', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop repair planning',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should trigger static repair planning',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecks = events.filter(event => event.type === 'design.loop_quality_checked')
    const repairPlanned = events.find(event => event.type === 'design.loop_repair_planned')
    const repairStarted = events.find(event => event.type === 'design.loop_repair_started')
    const completed = events.find(event => event.type === 'design.loop_completed')
    assert.equal(qualityChecks[0]?.payload.status, 'fail')
    assert.equal(qualityChecks[1]?.payload.status, 'pass')
    assert.equal(repairPlanned?.payload.attempt, 1)
    assert.match(repairPlanned?.payload.promptPreview ?? '', /DUDesign automatic repair request/)
    assert.match(repairPlanned?.payload.promptPreview ?? '', /Body is empty/)
    assert.equal(repairStarted?.payload.artifactId, repairPlanned?.payload.artifactId)
    assert.equal(completed?.payload.attempts, 1)
    const repairQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(repairQueueState?.kind, 'refine_job')
    assert.equal(repairQueueState?.status, 'completed')

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 2)

    await harness.close()
    harness = null
  })

  it('records findings without repair when review mode is off', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Review mode off',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should be checked but not repaired.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {
        businessContext: {
          reviewMode: 'off',
        },
      },
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecked = events.find(event => event.type === 'design.loop_quality_checked')
    const stopped = events.find(event => event.type === 'design.loop_stopped')
    assert.equal(qualityChecked?.payload.reviewMode, 'off')
    assert.equal(stopped?.payload.reason, 'review_disabled')
    assert.equal(events.some(event => event.type === 'design.loop_repair_planned'), false)
    const queueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${job.variations[0]!.id}:attempt:1`,
    )
    assert.equal(queueState, null)

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 1)

    await harness.close()
    harness = null
  })

  it('waits for confirmation before repair when review mode is semi_auto', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Review mode semi auto',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should wait for confirmation before repair.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {
        businessContext: {
          reviewMode: 'semi_auto',
        },
      },
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const eventsBeforeConfirmation = await harness.service.store.listDesignEvents(job.job.id)
    const repairPlanned = eventsBeforeConfirmation.find(event => event.type === 'design.loop_repair_planned')
    const stopped = eventsBeforeConfirmation.find(event => event.type === 'design.loop_stopped')
    assert.equal(repairPlanned?.payload.reviewMode, 'semi_auto')
    assert.equal(repairPlanned?.payload.requiresConfirmation, true)
    assert.equal(stopped?.payload.reason, 'review_pending_confirmation')
    const plannedQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(plannedQueueState, null)

    const reviewAction = await postJson<{ status: 'repair_queued' | 'skipped' }>(
      harness,
      `/api/variations/${job.variations[0]!.id}/review-actions`,
      { action: 'confirm_repair', artifactId: repairPlanned?.payload.artifactId },
    )
    assert.equal(reviewAction.status, 'repair_queued')
    await harness.service.flushBackgroundTasks()
    const confirmedQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(confirmedQueueState?.kind, 'refine_job')
    assert.equal(confirmedQueueState?.status, 'completed')

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 2)

    await harness.close()
    harness = null
  })

  it('stops automation repair at max attempts when repaired artifact still fails', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure-still-fails'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop max attempts',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should fail after one automatic repair.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecks = events.filter(event => event.type === 'design.loop_quality_checked')
    const repairStartedEvents = events.filter(event => event.type === 'design.loop_repair_started')
    const stopped = events.find(event => event.type === 'design.loop_stopped')
    const completed = events.find(event => event.type === 'design.loop_completed')

    assert.deepEqual(qualityChecks.map(event => event.payload.status), ['fail', 'fail'])
    assert.equal(repairStartedEvents.length, 1)
    assert.equal(stopped?.payload.reason, 'max_attempts_reached')
    assert.equal(stopped?.payload.attempts, 1)
    assert.equal(completed, undefined)

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 2)

    await harness.close()
    harness = null
  })

  it('marks queued automation repair failed when runtime refine is unavailable', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('quality-failure-runtime-unavailable'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Automation loop runtime unavailable',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate an artifact that should fail repair because runtime refine is unavailable.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {},
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const repairPlanned = events.find(event => event.type === 'design.loop_repair_planned')
    const repairStarted = events.find(event => event.type === 'design.loop_repair_started')
    const stopped = events.find(event => event.type === 'design.loop_stopped')
    const completed = events.find(event => event.type === 'design.loop_completed')

    assert.equal(repairStarted?.payload.artifactId, repairPlanned?.payload.artifactId)
    assert.equal(stopped?.payload.reason, 'runtime_unavailable')
    assert.equal(stopped?.payload.recoverable, true)
    assert.match(stopped?.payload.message ?? '', /Runtime refine unavailable/)
    assert.equal(completed, undefined)

    const repairQueueState = await harness.service.queue.getJobState(
      `queue:refine:automation-loop:${repairPlanned?.payload.artifactId}:attempt:${repairPlanned?.payload.attempt}`,
    )
    assert.equal(repairQueueState?.kind, 'refine_job')
    assert.equal(repairQueueState?.status, 'failed')
    assert.equal(repairQueueState?.errorCode, 'QUEUE_CONSUMER_FAILED')
    assert.match(repairQueueState?.errorMessage ?? '', /Runtime refine unavailable/)

    const detail = await getJson<{ currentArtifact: { version: number } | null }>(
      harness,
      `/api/variations/${job.variations[0]!.id}`,
    )
    assert.equal(detail.currentArtifact?.version, 1)

    await harness.close()
    harness = null
  })

  it('publishes a runtime warning when an authorized MCP invocation is unavailable', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('all-complete'),
      queue: new NoopScreenshotQueue(),
      mcpExecutor: {
        execute: async request => mcpUnavailableResult(
          request,
          'quality-tools validateAccessibility endpoint is offline.',
          '2026-07-06T00:00:00.000Z',
        ),
      },
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'MCP unavailable warning',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: 'Generate a page that selects an accessibility validation MCP tool.',
      sourceMode: 'new_html',
      variationCount: 1,
      capabilityRequirements: {
        plugins: {
          mcpToolIds: ['mcp_accessibility_validate'],
        },
      },
      templateRequirements: {},
    })
    const snapshot = await waitForJob(harness, job.job.id, 'completed')
    const variation = snapshot.variations[0]!

    const executed = await postJson<ExecuteMcpInvocationResponse>(harness, '/api/mcp/invocations/execute', {
      userId: 'usr_dev',
      workspaceId: bootstrap.workspace.id,
      sessionId: session.session.id,
      jobId: job.job.id,
      variationId: variation.id,
      runtimeSessionId: null,
      mcpToolId: 'mcp_accessibility_validate',
      serverName: 'quality-tools',
      toolName: 'validateAccessibility',
      scopes: ['validation_only'],
      input: { artifactId: variation.currentArtifactId },
      reason: 'Validate generated artifact accessibility.',
    })
    assert.equal(executed.status, 'authorized')
    assert.equal(executed.result.status, 'unavailable')
    assert.equal(executed.result.error?.code, 'MCP_UNAVAILABLE')
    assert.equal(executed.toolContext, null)

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const warning = events.find(event => event.type === 'design.runtime_warning')
    assert.equal(warning?.variationId, variation.id)
    assert.equal(warning?.payload.code, 'MCP_UNAVAILABLE')
    assert.equal(warning?.payload.severity, 'warn')
    assert.match(warning?.payload.message ?? '', /quality-tools/)

    const streamText = await getText(harness, `/api/design-jobs/${job.job.id}/stream`)
    assert.match(streamText, /design\.runtime_warning/)
    assert.match(streamText, /MCP_UNAVAILABLE/)

    await harness.close()
    harness = null
  })

  it('reviews dynamic encyclopedia artifacts against the assigned variation template only', async () => {
    harness = await startApiFlowHarness(new ApplicationService({
      runtime: new ControlledRuntimeGateway('encyclopedia-summary-with-timeline-candidate'),
      queue: new NoopScreenshotQueue(),
    }))
    const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
    const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'Variation-scoped spec review',
    })
    const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
      sessionId: session.session.id,
      prompt: '牛顿摆',
      sourceMode: 'new_html',
      productMode: 'dynamic_encyclopedia_card',
      variationCount: 1,
      capabilityRequirements: {
        template: {
          designTemplatePackIds: [
            'dtp_dynamic_encyclopedia_summary_card',
            'dtp_dynamic_encyclopedia_timeline_card',
          ],
        },
        automation: {
          loopProfileId: 'loop_standard',
          maxRepairAttempts: 1,
        },
      },
      templateRequirements: {
        designTemplatePackIds: [
          'dtp_dynamic_encyclopedia_summary_card',
          'dtp_dynamic_encyclopedia_timeline_card',
        ],
        businessContext: {
          interactionParadigmId: 'ip_entity_summary',
        },
      },
    })
    await waitForJob(harness, job.job.id, 'completed')
    await harness.service.flushBackgroundTasks()

    const snapshot = await getJson<DesignJobSnapshotResponse>(harness, `/api/design-jobs/${job.job.id}`)
    assert.equal(snapshot.variations[0]?.designTemplatePack?.id, 'dtp_dynamic_encyclopedia_summary_card')
    const htmlArtifacts = snapshot.artifacts.filter(artifact => artifact.kind === 'html')
    assert.equal(htmlArtifacts.length, 1)
    assert.equal(htmlArtifacts[0]?.quality?.status, 'pass')
    assert.equal(
      htmlArtifacts[0]?.quality?.issues.some(issue => /timeline child template|timeline|时间线|里程碑/i.test(issue)),
      false,
    )

    const events = await harness.service.store.listDesignEvents(job.job.id)
    const qualityChecks = events.filter(event => event.type === 'design.loop_quality_checked')
    assert.deepEqual(qualityChecks.map(event => event.payload.status), ['pass'])
    assert.equal(events.some(event => event.type === 'design.loop_repair_planned'), false)

    await harness.close()
    harness = null
  })

  it('carries vertical classification vectors into dynamic encyclopedia spec review findings', async () => {
    const cases: Array<{
      mode: ControlledRuntimeMode
      title: string
      prompt: string
      templatePackId: string
      entryTitle: string
      classificationVector: VerticalClassificationVectorInput
      expectedFindingId: string
      issuePattern: RegExp
    }> = [
      {
        mode: 'encyclopedia-film-resource-risk',
        title: 'Film vertical classification spec review',
        prompt: '电影《飞驰人生3》主演、角色、系列电影和相似电影推荐',
        templatePackId: 'dtp_de_film_cast_role_network',
        entryTitle: '飞驰人生3',
        classificationVector: {
          l1: '影视作品',
          l2: '电影',
          l3: '系列电影',
          signals: ['电影', '主演', '角色', '系列电影'],
          recommendedModulePriorities: ['cast_role_network', 'series_navigation', 'summary_facts'],
          preferredTemplateIds: ['dtp_de_film_cast_role_network', 'dtp_de_film_series_navigation'],
          riskFlags: ['media_resource_link_blocked', 'no_piracy_or_playback_resources', 'plot_hallucination_risk'],
        },
        expectedFindingId: 'encyclopedia.media_resource_link_blocked',
        issuePattern: /playback, download|播放|下载|resource/i,
      },
      {
        mode: 'encyclopedia-tv-episode-risk',
        title: 'TV vertical classification spec review',
        prompt: '电视剧《庆余年》角色关系、分集剧情、伏笔和系列季播导航',
        templatePackId: 'dtp_de_tv_episode_chain',
        entryTitle: '庆余年',
        classificationVector: {
          l1: '影视作品',
          l2: '电视剧',
          l3: '古装历史剧',
          signals: ['电视剧', '角色关系', '分集剧情', '伏笔'],
          recommendedModulePriorities: ['episode_causal_chain', 'spoiler_control', 'character_relation'],
          preferredTemplateIds: ['dtp_de_tv_episode_chain', 'dtp_de_tv_character_relation'],
          riskFlags: ['episode_count_hallucination_risk', 'spoiler_control_required'],
        },
        expectedFindingId: 'encyclopedia.tv_episode_fabrication_risk',
        issuePattern: /episode counts|episode plot|集数|分集剧情/i,
      },
      {
        mode: 'encyclopedia-history-relation-risk',
        title: 'History-person vertical classification spec review',
        prompt: '苏轼人物关系、师承、政治阵营与重要事件链',
        templatePackId: 'dtp_de_history_person_relationship',
        entryTitle: '苏轼',
        classificationVector: {
          l1: '名人',
          l2: '历史人物',
          l3: '文人学者',
          signals: ['人物关系', '师承', '政治阵营', '重要事件'],
          recommendedModulePriorities: ['relationship_graph', 'event_causal_chain', 'summary_facts'],
          preferredTemplateIds: ['dtp_de_history_person_relationship', 'dtp_de_history_person_event_chain'],
          riskFlags: ['relationship_hallucination_risk', 'event_causality_source_required'],
        },
        expectedFindingId: 'encyclopedia.history_relation_source_required',
        issuePattern: /Historical-person relationship|relationship claims|人物关系|关系/i,
      },
      {
        mode: 'encyclopedia-cultural-origin-risk',
        title: 'Cultural phrase vertical classification spec review',
        prompt: '成语“悬梁刺股”的意思、出处典故、近义词反义词和关联词语',
        templatePackId: 'dtp_de_cultural_phrase_origin_story',
        entryTitle: '悬梁刺股',
        classificationVector: {
          l1: '知识术语',
          l2: '文化类词语',
          l3: '出处典故',
          signals: ['成语', '出处典故', '近义词', '关联词语'],
          recommendedModulePriorities: ['origin_story', 'related_phrase_graph', 'meaning_compare'],
          preferredTemplateIds: ['dtp_de_cultural_phrase_origin_story', 'dtp_de_cultural_phrase_relation_graph'],
          riskFlags: ['origin_source_required', 'related_phrase_type_required'],
        },
        expectedFindingId: 'encyclopedia.cultural_origin_source_required',
        issuePattern: /Cultural phrase origin|source text|出处|典故/i,
      },
    ]

    for (const testCase of cases) {
      harness = await startApiFlowHarness(new ApplicationService({
        runtime: new ControlledRuntimeGateway(testCase.mode),
        queue: new NoopScreenshotQueue(),
      }))
      const bootstrap = await getJson<{ workspace: { id: string } }>(harness, '/api/dev/bootstrap')
      const session = await postJson<CreateSessionResponse>(harness, '/api/sessions', {
        workspaceId: bootstrap.workspace.id,
        mode: 'new_html',
        title: testCase.title,
      })
      const job = await postJson<CreateDesignJobResponse>(harness, '/api/design-jobs', {
        sessionId: session.session.id,
        prompt: testCase.prompt,
        sourceMode: 'new_html',
        productMode: 'dynamic_encyclopedia_card',
        variationCount: 1,
        capabilityRequirements: {
          template: {
            designTemplatePackIds: [testCase.templatePackId],
          },
          automation: {
            loopProfileId: 'loop_standard',
            maxRepairAttempts: 1,
          },
        },
        templateRequirements: {
          designTemplatePackIds: [testCase.templatePackId],
          businessContext: {
            reviewMode: 'semi_auto',
            entryTitle: testCase.entryTitle,
            classificationVector: {
              schemaVersion: '2026-07-08.dudesign-encyclopedia-classification-vector.v1',
              confidence: 0.86,
              source: 'mock_rules',
              ...testCase.classificationVector,
            },
          },
        },
      })
      await waitForJob(harness, job.job.id, 'completed')
      await harness.service.flushBackgroundTasks()

      const snapshot = await getJson<DesignJobSnapshotResponse>(harness, `/api/design-jobs/${job.job.id}`)
      assert.equal(snapshot.variations[0]?.designTemplatePack?.id, testCase.templatePackId)
      const htmlArtifact = snapshot.artifacts.find(artifact => artifact.kind === 'html')
      assert.ok(htmlArtifact)
      assert.equal(htmlArtifact.quality?.status, 'warn', testCase.title)
      assert.equal(
        htmlArtifact.quality?.specFindings?.some(finding => finding.id === testCase.expectedFindingId),
        true,
        testCase.title,
      )

      const events = await harness.service.store.listDesignEvents(job.job.id)
      const qualityChecked = events.find(event => event.type === 'design.loop_quality_checked')
      const repairPlanned = events.find(event => event.type === 'design.loop_repair_planned')
      const stopped = events.find(event => event.type === 'design.loop_stopped')
      assert.equal(qualityChecked?.payload.status, 'warn', testCase.title)
      assert.equal(
        Array.isArray(qualityChecked?.payload.issues)
          && qualityChecked.payload.issues.some(issue => testCase.issuePattern.test(String(issue))),
        true,
        testCase.title,
      )
      assert.equal(repairPlanned?.payload.reviewMode, 'semi_auto', testCase.title)
      assert.equal(repairPlanned?.payload.requiresConfirmation, true, testCase.title)
      assert.match(repairPlanned?.payload.promptPreview ?? '', new RegExp(escapeRegExp(testCase.expectedFindingId)))
      assert.equal(stopped?.payload.reason, 'review_pending_confirmation', testCase.title)

      await harness.close()
      harness = null
    }
  })
})

class NoopScreenshotQueue extends InMemoryDesignJobQueue {
  override async enqueueScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<QueueJobState> {
    return {
      idempotencyKey: payload.idempotencyKey,
      kind: 'screenshot_job',
      status: 'completed',
      enqueuedAt: payload.createdAt,
      startedAt: payload.createdAt,
      completedAt: payload.createdAt,
      failedAt: null,
      cancelledAt: null,
      attempts: 1,
      errorCode: null,
      errorMessage: null,
    }
  }
}

type ControlledRuntimeMode =
  | 'all-complete'
  | 'partial-failure'
  | 'late-streaming-after-complete'
  | 'quality-failure'
  | 'quality-failure-still-fails'
  | 'quality-failure-runtime-unavailable'
  | 'encyclopedia-summary-with-timeline-candidate'
  | 'encyclopedia-film-resource-risk'
  | 'encyclopedia-tv-episode-risk'
  | 'encyclopedia-history-relation-risk'
  | 'encyclopedia-cultural-origin-risk'

type VerticalClassificationVectorInput = {
  l1: string
  l2: string
  l3: string
  signals: string[]
  recommendedModulePriorities: string[]
  preferredTemplateIds: string[]
  riskFlags: string[]
}

class ControlledRuntimeGateway implements RuntimeGateway {
  constructor(private readonly mode: ControlledRuntimeMode) {}

  async getRuntimeHealth() {
    return {
      status: 'compatible' as const,
      runtime: 'babel-o' as const,
      runtimeVersion: 'test',
      contractVersion: 'test',
      checkedAt: new Date().toISOString(),
    }
  }

  async getRuntimeContract() {
    return {
      runtime: 'babel-o' as const,
      runtimeVersion: 'test',
      contractVersion: 'test',
      status: 'compatible' as const,
      requiredEndpoints: [],
      requiredEvents: [],
      eventMappings: {},
    }
  }

  async listRuntimeModels() {
    return {
      type: 'runtime_models' as const,
      version: 'test',
      providers: [],
      defaultModel: null,
      syncedAt: new Date().toISOString(),
    }
  }

  async createSession(_input: CreateRuntimeSessionInput) {
    return { runtimeSessionId: 'runtime_test_session' }
  }

  async resumeSession(_input: ResumeRuntimeSessionInput) {
    return { status: 'resumed' as const, runtimeSessionId: 'runtime_test_session' }
  }

  async *spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent> {
    yield createDesignEvent({
      type: 'design.variation_streaming',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: 'runtime_variation_1',
      payload: { channel: 'assistant', delta: 'building first variation' },
    })
    yield createDesignEvent({
      type: 'design.variation_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: 'runtime_variation_1',
      payload: {
        html: this.completedHtml(),
        changedPaths: ['index.html'],
        inputTokens: 10,
        outputTokens: 20,
        costCents: 1,
      },
    })
    if (this.mode === 'late-streaming-after-complete') {
      yield createDesignEvent({
        type: 'design.variation_streaming',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: 'runtime_variation_1',
        payload: { channel: 'system', delta: 'late runtime heartbeat' },
      })
    }
    if (this.mode === 'partial-failure') {
      yield createDesignEvent({
        type: 'design.variation_failed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: 'runtime_variation_2',
        payload: {
          errorCode: 'RUNTIME_CHILD_FAILED',
          message: 'Second variation failed in controlled runtime.',
          recoverable: true,
        },
      })
    }
  }

  async *refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent> {
    if (this.mode === 'quality-failure-runtime-unavailable') {
      throw new Error('Runtime refine unavailable in controlled test.')
    }
    yield createDesignEvent({
      type: 'design.variation_streaming',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        channel: 'assistant',
        delta: 'repairing static quality issues',
      },
    })
    yield createDesignEvent({
      type: 'design.variation_completed',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        html: this.mode === 'quality-failure-still-fails'
          ? '<!doctype html><html><body></body></html>'
          : '<!doctype html><html><body><main><h1>Repaired variation</h1><p>The automatic repair added visible page content and preserved the user goal.</p></main></body></html>',
        changedPaths: ['index.html'],
        inputTokens: 5,
        outputTokens: 10,
        costCents: 1,
      },
    })
  }

  async cancelRuntimeJob(_input: CancelRuntimeJobInput) {
    return { cancelled: true }
  }

  private completedHtml(): string {
    if (this.mode === 'quality-failure' || this.mode === 'quality-failure-still-fails' || this.mode === 'quality-failure-runtime-unavailable') {
      return '<!doctype html><html><body></body></html>'
    }
    if (this.mode === 'encyclopedia-summary-with-timeline-candidate') {
      return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>牛顿摆百科概览</title>
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; }
      body { font-family: Inter, "PingFang SC", system-ui, sans-serif; color: #1E1F24; background: #F8F8F8; }
      /* 硬性归束（v0.4）：no-scroll-frame + tab-bar 取代 .scroll-container */
      .no-scroll-frame { width: 100%; height: 100%; overflow: hidden; padding: 24px; box-sizing: border-box; }
      .tab-bar { display: flex; gap: 8px; border-bottom: 1px solid #B7B9C1; padding-bottom: 8px; margin-bottom: 12px; }
      .tab-bar button { background: none; border: none; padding: 4px 8px; color: #1E1F24; font: inherit; }
      .tab-bar button[aria-selected="true"] { color: #6487FA; border-bottom: 2px solid #6487FA; }
      .fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <nav class="tab-bar" role="tablist">
        <button type="button" role="tab" aria-selected="true">概览</button>
        <button type="button" role="tab" aria-selected="false">时间线</button>
      </nav>
      <h1>牛顿摆</h1>
      <section aria-label="百科概览">百科概览：牛顿摆是一种演示动量守恒和能量传递的教学装置。</section>
      <section class="fact-grid" aria-label="关键事实">
        <article><strong>类型</strong><p>物理演示装置</p></article>
        <article><strong>核心概念</strong><p>动量守恒、近似弹性碰撞</p></article>
        <article><strong>使用场景</strong><p>课堂演示、科普展示</p></article>
        <article><strong>来源提示</strong><p>信息以通用物理知识为基础。</p></article>
      </section>
    </main>
  </body>
</html>`
    }
    if (this.mode === 'encyclopedia-film-resource-risk') {
      return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>飞驰人生3 角色关系卡</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { font-family: "PingFang SC", system-ui, sans-serif; color: #16181D; background: #FAFAFA; }
      .no-scroll-frame { width: 100%; height: 100%; overflow: hidden; padding: 24px; box-sizing: border-box; }
      .role-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .node { border: 1px solid #D6DAE3; padding: 12px; border-radius: 8px; background: #FFFFFF; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>飞驰人生3</h1>
      <section aria-label="百科概览">百科概览：这是一张围绕主演、角色关系和系列电影脉络组织的动态百科卡。</section>
      <section class="role-grid" aria-label="角色关系">
        <article class="node"><strong>主演</strong><p>角色关系需要根据公开资料核验。</p></article>
        <article class="node"><strong>系列电影</strong><p>与前作关系待补充可靠来源。</p></article>
        <article class="node"><strong>相似电影</strong><p>相似题材可以按类型、人物目标和叙事结构比较。</p></article>
        <article class="node"><strong>观看资源</strong><p>提供在线观看、免费下载、网盘和播放地址入口。</p></article>
      </section>
    </main>
  </body>
</html>`
    }
    if (this.mode === 'encyclopedia-tv-episode-risk') {
      return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>庆余年分集剧情链</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { font-family: "PingFang SC", system-ui, sans-serif; color: #16181D; background: #FAFAFA; }
      .no-scroll-frame { width: 100%; height: 100%; overflow: hidden; padding: 24px; box-sizing: border-box; }
      .episode-chain { display: grid; gap: 10px; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>庆余年</h1>
      <section aria-label="百科概览">百科概览：围绕角色关系、分集剧情和伏笔回收组织的电视剧动态百科卡。</section>
      <section class="episode-chain" aria-label="分集剧情链">
        <article><strong>第 38 集</strong><p>主角揭开结局真相，伏笔完成回收。</p></article>
        <article><strong>集数</strong><p>全剧节点按关键冲突展开。</p></article>
      </section>
    </main>
  </body>
</html>`
    }
    if (this.mode === 'encyclopedia-history-relation-risk') {
      return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>苏轼人物关系图</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { font-family: "PingFang SC", system-ui, sans-serif; color: #16181D; background: #FAFAFA; }
      .no-scroll-frame { width: 100%; height: 100%; overflow: hidden; padding: 24px; box-sizing: border-box; }
      .relation-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>苏轼</h1>
      <section aria-label="百科概览">百科概览：这是一张展示历史人物关系、师承与政治阵营的动态百科卡。</section>
      <section class="relation-grid" aria-label="人物关系">
        <article><strong>父</strong><p>苏洵</p></article>
        <article><strong>弟</strong><p>苏辙</p></article>
        <article><strong>师承</strong><p>欧阳修</p></article>
        <article><strong>对手</strong><p>王安石</p></article>
      </section>
    </main>
  </body>
</html>`
    }
    if (this.mode === 'encyclopedia-cultural-origin-risk') {
      return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>悬梁刺股出处典故</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { font-family: "PingFang SC", system-ui, sans-serif; color: #16181D; background: #FAFAFA; }
      .no-scroll-frame { width: 100%; height: 100%; overflow: hidden; padding: 24px; box-sizing: border-box; }
      .story { display: grid; gap: 12px; }
    </style>
  </head>
  <body>
    <main class="no-scroll-frame">
      <h1>悬梁刺股</h1>
      <section aria-label="百科概览">百科概览：这是一张说明成语意思、出处典故和关联词语的动态百科卡。</section>
      <section class="story" aria-label="出处典故">
        <article><strong>出处典故</strong><p>故事讲述古人勤学苦读，寓意刻苦学习。</p></article>
        <article><strong>近义词</strong><p>凿壁偷光、闻鸡起舞。</p></article>
      </section>
    </main>
  </body>
</html>`
    }
    return '<!doctype html><html><body><main><h1>Completed variation</h1><p>This completed variation has enough visible content to pass the static quality gate.</p></main></body></html>'
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function waitForJob(
  harness: ApiFlowHarness,
  jobId: string,
  status: DesignJobSnapshotResponse['job']['status'],
): Promise<DesignJobSnapshotResponse> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2000) {
    const snapshot = await getJson<DesignJobSnapshotResponse>(harness, `/api/design-jobs/${jobId}`)
    if (snapshot.job.status === status) return snapshot
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for job ${jobId} to become ${status}`)
}

async function getJson<T>(harness: ApiFlowHarness, path: string): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function getText(harness: ApiFlowHarness, path: string): Promise<string> {
  const response = await fetch(`${harness.baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.text()
}

async function postJson<T>(harness: ApiFlowHarness, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}
