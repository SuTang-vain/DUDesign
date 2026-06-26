import type {
  CreateDesignJobRequest,
  CreateAnnotationBatchRequest,
  CreateSessionRequest,
  DesignEvent,
  RefineVariationRequest,
  ShareVariationRequest,
  AnnotationShape,
} from '@dudesign/contracts'
import { MockRuntimeGateway, type RuntimeGateway } from '@dudesign/runtime-gateway'
import type { DesignVariationStatus } from '@dudesign/domain'
import { JobEventBus } from './eventBus.js'
import { InMemoryStore } from './store.js'
import type { RequestContext } from './auth.js'

export class ApplicationService {
  readonly store: InMemoryStore
  readonly events: JobEventBus
  readonly runtime: RuntimeGateway

  constructor(options: {
    store?: InMemoryStore
    events?: JobEventBus
    runtime?: RuntimeGateway
  } = {}) {
    this.store = options.store ?? new InMemoryStore()
    this.events = options.events ?? new JobEventBus()
    this.runtime = options.runtime ?? new MockRuntimeGateway()
  }

  getBootstrap(ctx: RequestContext) {
    const user = this.requireUser(ctx.userId)
    const workspace = [...this.store.workspaces.values()].find(candidate => candidate.ownerId === user.id)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${user.id}`)
    return { user, workspace }
  }

  async createSession(ctx: RequestContext, input: CreateSessionRequest) {
    const user = this.requireUser(ctx.userId)
    const workspace = this.store.workspaces.get(input.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${input.workspaceId}`)
    this.requireWorkspaceAccess(workspace.id, user.id)
    const session = this.store.createSession({ ...input, userId: user.id })
    const runtime = await this.runtime.createSession({
      userId: user.id,
      workspaceId: workspace.id,
      sessionId: session.id,
      workspaceRoot: workspace.storageKey,
      memoryNamespace: user.memoryNamespace,
    })
    const updated = {
      ...session,
      runtimeSessionId: runtime.runtimeSessionId,
      updatedAt: new Date().toISOString(),
    }
    this.store.sessions.set(session.id, updated)
    return {
      session: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        runtimeSessionId: updated.runtimeSessionId,
        status: updated.status,
      },
    }
  }

  listSessions(ctx: RequestContext) {
    return {
      sessions: this.store.listSessions().filter(session => session.userId === ctx.userId),
    }
  }

  async resumeSession(ctx: RequestContext, sessionId: string) {
    const snapshot = this.store.getSessionSnapshot(sessionId)
    if (!snapshot) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    this.requireSessionAccess(snapshot.session.id, ctx.userId)
    const workspace = this.store.workspaces.get(snapshot.session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${snapshot.session.workspaceId}`)
    const runtime = await this.runtime.resumeSession({
      userId: snapshot.session.userId,
      sessionId: snapshot.session.id,
      runtimeSessionId: snapshot.session.runtimeSessionId,
      workspaceRoot: workspace.storageKey,
    })
    return {
      ...snapshot,
      runtime,
    }
  }

  async createDesignJob(ctx: RequestContext, input: CreateDesignJobRequest) {
    validateVariationCount(input.variationCount)
    const session = this.store.sessions.get(input.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${input.sessionId}`)
    this.requireSessionAccess(session.id, ctx.userId)
    const workspace = this.store.workspaces.get(session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${session.workspaceId}`)
    this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId ?? null,
        variationCount: input.variationCount,
      },
    })
    const job = this.store.createJob({
      session,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      variationCount: input.variationCount,
      templateRequirements: input.templateRequirements ?? {},
    })
    const variations = this.store.createVariations({ job, count: input.variationCount })

    void this.runMockJob({
      jobId: job.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      workspaceRoot: workspace.storageKey,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      sourceArtifactId: input.sourceArtifactId ?? null,
      variationCount: input.variationCount,
      templateRequirements: input.templateRequirements,
      variationIdsByIndex: new Map(variations.map(variation => [variation.index, variation.id])),
    })

    return {
      job: {
        id: job.id,
        status: job.status,
        variationCount: job.variationCount,
      },
      variations: variations.map(variation => ({
        id: variation.id,
        index: variation.index,
        status: variation.status,
      })),
    }
  }

  getDesignJob(ctx: RequestContext, jobId: string) {
    const snapshot = this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    this.requireJobAccess(snapshot.job.id, ctx.userId)
    return snapshot
  }

  getVariationDetail(ctx: RequestContext, variationId: string) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const job = this.store.jobs.get(variation.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    this.requireJobAccess(job.id, ctx.userId)
    const artifacts = [...this.store.artifacts.values()]
      .filter(artifact => artifact.variationId === variationId && artifact.kind === 'html')
      .sort((a, b) => b.version - a.version)
    const currentArtifact = variation.currentArtifactId
      ? this.store.artifacts.get(variation.currentArtifactId) ?? null
      : artifacts[0] ?? null
    return {
      variation,
      job: {
        id: job.id,
        prompt: job.prompt,
        status: job.status,
      },
      currentArtifact: currentArtifact
        ? {
            id: currentArtifact.id,
            version: currentArtifact.version,
            entryPath: currentArtifact.entryPath,
            createdAt: currentArtifact.createdAt,
          }
        : null,
      artifacts: artifacts.map(artifact => ({
        id: artifact.id,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
      })),
    }
  }

  async refineVariation(ctx: RequestContext, variationId: string, input: RefineVariationRequest) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const job = this.store.jobs.get(variation.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    this.requireJobAccess(job.id, ctx.userId)
    const session = this.store.sessions.get(variation.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${variation.sessionId}`)
    const workspace = this.store.workspaces.get(job.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    if (!input.prompt.trim()) throw createHttpError(400, 'INVALID_PROMPT', 'prompt is required.')
    const baseArtifact = this.store.artifacts.get(input.baseArtifactId)
    if (!baseArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.baseArtifactId}`)

    this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        kind: 'variation_refine',
        variationId,
        baseArtifactId: input.baseArtifactId,
        deviceContext: input.deviceContext ?? null,
      },
    })

    for await (const event of this.runtime.refineVariation({
      userId: session.userId,
      workspaceId: workspace.id,
      sessionId: session.id,
      jobId: job.id,
      variationId,
      runtimeChildSessionId: variation.runtimeChildSessionId,
      baseArtifactId: input.baseArtifactId,
      prompt: input.prompt,
      workspaceRoot: workspace.storageKey,
      deviceContext: input.deviceContext,
    })) {
      this.applyEventSideEffects(event)
      this.events.publish(event)
    }

    const updated = this.store.variations.get(variationId)!
    const artifact = updated.currentArtifactId ? this.store.artifacts.get(updated.currentArtifactId) : null
    return {
      variation: {
        id: updated.id,
        status: updated.status,
        currentArtifactId: updated.currentArtifactId,
        previewUrl: updated.previewUrl,
      },
      ...(artifact && {
        artifact: {
          id: artifact.id,
          version: artifact.version,
          entryPath: artifact.entryPath,
        },
      }),
    }
  }

  async annotateVariation(ctx: RequestContext, variationId: string, input: CreateAnnotationBatchRequest) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    this.requireVariationAccess(variationId, ctx.userId)
    const artifact = this.store.artifacts.get(input.artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
    if (artifact.variationId !== variationId) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (!Array.isArray(input.shapes) || input.shapes.length === 0) {
      throw createHttpError(400, 'ANNOTATION_REQUIRED', 'At least one annotation shape is required.')
    }
    const promptSuffix = buildAnnotationPrompt(input.shapes, input.prompt)
    const batch = this.store.createAnnotationBatch({
      variationId,
      artifactId: input.artifactId,
      userId: ctx.userId,
      shapes: input.shapes,
      promptSuffix,
    })
    const refined = await this.refineVariation(ctx, variationId, {
      prompt: promptSuffix,
      baseArtifactId: input.artifactId,
    })
    return {
      ...refined,
      annotationBatch: {
        id: batch.id,
        shapeCount: input.shapes.length,
        promptSuffix,
      },
    }
  }

  getVariationPreview(ctx: RequestContext, variationId: string): string {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    this.requireVariationAccess(variationId, ctx.userId)
    const title = variation.title ?? 'DUDesign Variation'
    const artifact = variation.currentArtifactId ? this.store.artifacts.get(variation.currentArtifactId) : null
    const version = artifact?.version ?? 1
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; background: #f7f4ed; color: #191714; display: grid; place-items: center; }
      main { width: min(1080px, calc(100vw - 48px)); min-height: 620px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; }
      h1 { font-size: clamp(48px, 8vw, 112px); line-height: 0.92; margin: 0; letter-spacing: 0; }
      p { font-size: 18px; line-height: 1.65; color: #5f5a52; max-width: 560px; }
      .accent { color: #4f46e5; }
      .panel { background: #fffefa; border: 1px solid #e5ded2; border-radius: 8px; padding: 28px; box-shadow: 0 24px 80px rgba(40, 35, 24, 0.12); }
      .invoice { border: 2px solid #191714; padding: 24px; aspect-ratio: 4 / 5; display: grid; align-content: space-between; }
      .row { display: flex; justify-content: space-between; border-bottom: 1px solid #d8d0c2; padding: 12px 0; font-size: 14px; }
      button { border: 0; background: #191714; color: #fffefa; border-radius: 6px; padding: 14px 18px; font-weight: 700; }
      @media (max-width: 760px) { main { grid-template-columns: 1fr; padding: 32px 0; } h1 { font-size: 56px; } }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Send the invoice.<br />Get <span class="accent">paid</span> faster.</h1>
        <p>Mock preview for ${escapeHtml(title)} version ${version}. This hosted artifact proves the DUDesign API can create variations, attach artifacts, and serve iframe-ready HTML before the real BabeL-O adapter is connected.</p>
        <button>${version > 1 ? 'Refined version' : 'Start free'}</button>
      </section>
      <section class="panel">
        <div class="invoice">
          <strong>Invoice #${escapeHtml(variation.index.toString().padStart(2, '0'))} · v${version}</strong>
          <div>
            <div class="row"><span>Design exploration</span><strong>$2,400</strong></div>
            <div class="row"><span>Frontend build</span><strong>$900</strong></div>
            <div class="row"><span>Final polish</span><strong>$700</strong></div>
          </div>
          <strong>Total due: $4,000</strong>
        </div>
      </section>
    </main>
  </body>
</html>`
  }

  exportVariation(ctx: RequestContext, variationId: string) {
    this.requireVariationAccess(variationId, ctx.userId)
    const { variation, artifact } = this.requireCurrentVariationArtifact(variationId)
    const job = this.store.jobs.get(variation.jobId)
    this.recordUsageEvent({
      kind: 'export.created',
      userId: ctx.userId,
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      jobId: variation.jobId,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      metadata: {
        artifactVersion: artifact.version,
        jobStatus: job?.status ?? null,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        version: artifact.version,
        filename: `${variation.title ?? variation.id}-v${artifact.version}.html`.replaceAll(/\s+/g, '-').toLowerCase(),
        html: this.getVariationPreview(ctx, variationId),
      },
    }
  }

  shareVariation(ctx: RequestContext, variationId: string, input: ShareVariationRequest) {
    this.requireVariationAccess(variationId, ctx.userId)
    const { variation, artifact } = this.requireCurrentVariationArtifact(variationId)
    if (!['public', 'private', 'password'].includes(input.visibility)) {
      throw createHttpError(400, 'INVALID_SHARE_VISIBILITY', 'visibility must be public, private, or password.')
    }
    const share = this.store.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: ctx.userId,
      visibility: input.visibility,
      expiresAt: input.expiresAt ?? null,
    })
    this.recordUsageEvent({
      kind: 'share.created',
      userId: ctx.userId,
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      jobId: variation.jobId,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      metadata: {
        shareId: share.id,
        visibility: share.visibility,
        artifactVersion: artifact.version,
      },
    })
    return {
      share: {
        id: share.id,
        token: share.token,
        url: `/share/${share.token}`,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
      },
    }
  }

  getSharedVariation(token: string) {
    const share = this.store.getShareByToken(token)
    if (!share) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      throw createHttpError(410, 'SHARE_EXPIRED', 'This share link has expired.')
    }
    const variation = this.store.variations.get(share.variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${share.variationId}`)
    const artifact = this.store.artifacts.get(share.artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${share.artifactId}`)
    return {
      share: {
        id: share.id,
        token: share.token,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
      variation: {
        id: variation.id,
        title: variation.title,
        previewUrl: `/api/variations/${variation.id}/preview`,
      },
      artifact: {
        id: artifact.id,
        version: artifact.version,
        entryPath: artifact.entryPath,
      },
    }
  }

  async getAdminRuntimeHealth(ctx: RequestContext) {
    this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return {
      runtime: await this.runtime.getRuntimeHealth(),
      contract: await this.runtime.getRuntimeContract(),
    }
  }

  listAuditLogs(ctx: RequestContext) {
    this.requireAdminRole(ctx, ['operator', 'developer'])
    return {
      auditLogs: this.store.listAuditLogs(),
    }
  }

  listAdminJobs(ctx: RequestContext, filter: { status?: string | null; userId?: string | null } = {}) {
    this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const jobs = [...this.store.jobs.values()]
      .filter(job => !filter.status || job.status === filter.status)
      .filter(job => !filter.userId || job.userId === filter.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100)

    return {
      jobs: jobs.map(job => {
        const variations = [...this.store.variations.values()].filter(variation => variation.jobId === job.id)
        const artifacts = [...this.store.artifacts.values()].filter(artifact =>
          variations.some(variation => variation.id === artifact.variationId),
        )
        const counts = variations.reduce(
          (acc, variation) => {
            acc[variation.status] = (acc[variation.status] ?? 0) + 1
            return acc
          },
          {} as Record<string, number>,
        )
        return {
          id: job.id,
          userId: job.userId,
          workspaceId: job.workspaceId,
          sessionId: job.sessionId,
          prompt: job.prompt,
          status: job.status,
          variationCount: job.variationCount,
          completedVariationCount: counts.completed ?? 0,
          failedVariationCount: counts.failed ?? 0,
          cancelledVariationCount: counts.cancelled ?? 0,
          artifactCount: artifacts.length,
          totalInputTokens: variations.reduce((sum, variation) => sum + variation.inputTokens, 0),
          totalOutputTokens: variations.reduce((sum, variation) => sum + variation.outputTokens, 0),
          totalCostCents: variations.reduce((sum, variation) => sum + variation.costCents, 0),
          errorCount: variations.filter(variation => variation.errorCode).length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }
      }),
    }
  }

  listAdminArtifacts(ctx: RequestContext, filter: { jobId?: string | null; variationId?: string | null; kind?: string | null } = {}) {
    this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const variationIdsForJob = filter.jobId
      ? new Set([...this.store.variations.values()].filter(variation => variation.jobId === filter.jobId).map(variation => variation.id))
      : null

    const artifacts = [...this.store.artifacts.values()]
      .filter(artifact => !filter.kind || artifact.kind === filter.kind)
      .filter(artifact => !filter.variationId || artifact.variationId === filter.variationId)
      .filter(artifact => !variationIdsForJob || (artifact.variationId ? variationIdsForJob.has(artifact.variationId) : false))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)

    return {
      artifacts: artifacts.map(artifact => {
        const variation = artifact.variationId ? this.store.variations.get(artifact.variationId) : null
        const shareCount = [...this.store.shares.values()].filter(share => share.artifactId === artifact.id).length
        return {
          id: artifact.id,
          workspaceId: artifact.workspaceId,
          sessionId: artifact.sessionId,
          jobId: variation?.jobId ?? null,
          variationId: artifact.variationId,
          parentArtifactId: artifact.parentArtifactId,
          kind: artifact.kind,
          version: artifact.version,
          storageKey: artifact.storageKey,
          entryPath: artifact.entryPath,
          contentHash: artifact.contentHash,
          sizeBytes: artifact.sizeBytes,
          previewUrl: variation?.previewUrl ?? null,
          shareCount,
          createdAt: artifact.createdAt,
        }
      }),
    }
  }

  getAdminUserSupport(ctx: RequestContext, filter: { userId?: string | null; email?: string | null } = {}) {
    this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const userId = filter.userId?.trim()
    const email = filter.email?.trim().toLowerCase()
    const users = [...this.store.users.values()]
      .filter(user => !userId || user.id === userId)
      .filter(user => !email || user.email.toLowerCase().includes(email))
      .sort((a, b) => a.email.localeCompare(b.email))
      .slice(0, 20)

    return {
      users: users.map(user => {
        const workspaces = [...this.store.workspaces.values()]
          .filter(workspace => workspace.ownerId === user.id)
          .sort((a, b) => a.name.localeCompare(b.name))
        const sessions = [...this.store.sessions.values()]
          .filter(session => session.userId === user.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 50)

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          workspaces: workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            visibility: workspace.visibility,
            status: workspace.status,
          })),
          sessions: sessions.map(session => {
            const jobs = [...this.store.jobs.values()]
              .filter(job => job.sessionId === session.id)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            const jobIds = new Set(jobs.map(job => job.id))
            const variations = [...this.store.variations.values()].filter(variation => jobIds.has(variation.jobId))
            const variationSummary = variations.reduce(
              (acc, variation) => {
                acc[variation.status] = (acc[variation.status] ?? 0) + 1
                return acc
              },
              {} as Record<string, number>,
            )
            const failedVariations = variations.filter(variation => variation.status === 'failed' || variation.errorCode)
            const latestJob = jobs[0] ?? null

            return {
              id: session.id,
              workspaceId: session.workspaceId,
              title: session.title,
              mode: session.mode,
              status: session.status,
              resumeState: session.runtimeSessionId ? 'runtime_session_available' : 'runtime_session_missing',
              lastPromptPreview: previewText(session.lastPrompt, 140),
              jobCount: jobs.length,
              latestJob: latestJob
                ? {
                    id: latestJob.id,
                    status: latestJob.status,
                    variationCount: latestJob.variationCount,
                    updatedAt: latestJob.updatedAt,
                  }
                : null,
              variationSummary: {
                queued: variationSummary.queued ?? 0,
                running: variationSummary.running ?? 0,
                streaming: variationSummary.streaming ?? 0,
                renderingPreview: variationSummary.rendering_preview ?? 0,
                completed: variationSummary.completed ?? 0,
                failed: variationSummary.failed ?? 0,
                cancelled: variationSummary.cancelled ?? 0,
              },
              failureSummary: summarizeSupportIssue(latestJob, failedVariations),
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            }
          }),
        }
      }),
    }
  }

  getAdminCostSummary(ctx: RequestContext) {
    this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const jobs = [...this.store.jobs.values()]
    const usageEvents = this.store.listUsageEvents()
    const totals = usageEvents.reduce(
      (acc, event) => {
        acc.inputTokens += event.inputTokens
        acc.outputTokens += event.outputTokens
        acc.costCents += event.costCents
        return acc
      },
      { inputTokens: 0, outputTokens: 0, costCents: 0 },
    )
    const byUser = new Map<string, { userId: string; jobCount: number; usageEventCount: number; inputTokens: number; outputTokens: number; costCents: number }>()
    for (const job of jobs) {
      const row = byUser.get(job.userId) ?? {
        userId: job.userId,
        jobCount: 0,
        usageEventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      }
      row.jobCount += 1
      byUser.set(job.userId, row)
    }
    for (const event of usageEvents) {
      const row = byUser.get(event.userId) ?? {
        userId: event.userId,
        jobCount: 0,
        usageEventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      }
      row.usageEventCount += 1
      row.inputTokens += event.inputTokens
      row.outputTokens += event.outputTokens
      row.costCents += event.costCents
      byUser.set(event.userId, row)
    }
    return {
      totals: {
        jobCount: jobs.length,
        usageEventCount: usageEvents.length,
        ...totals,
      },
      byUser: [...byUser.values()].sort((a, b) => b.costCents - a.costCents || a.userId.localeCompare(b.userId)),
    }
  }

  async cancelJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string }) {
    this.requireAdminRole(ctx, ['operator', 'developer'])
    const snapshot = this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (snapshot.job.status === 'completed' || snapshot.job.status === 'failed' || snapshot.job.status === 'cancelled') {
      throw createHttpError(409, 'JOB_NOT_CANCELLABLE', `Job ${jobId} is already ${snapshot.job.status}.`)
    }
    const runtime = await this.runtime.cancelRuntimeJob({
      jobId,
      reason: input.reason,
    })
    this.store.setJobStatus(jobId, 'cancelled')
    for (const variation of snapshot.variations) {
      if (variation.status !== 'completed' && variation.status !== 'failed' && variation.status !== 'cancelled') {
        this.store.applyVariationEvent({ variationId: variation.id, status: 'cancelled' })
      }
    }
    const audit = this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'job.cancel',
      targetType: 'design_job',
      targetId: jobId,
      reason: input.reason ?? null,
      metadata: {
        runtimeCancelled: runtime.cancelled,
        runtimeMessage: runtime.message,
      },
    })
    return {
      job: this.store.jobs.get(jobId),
      runtime,
      audit,
    }
  }

  async retryJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string } = {}) {
    this.requireAdminRole(ctx, ['operator', 'developer'])
    const original = this.store.jobs.get(jobId)
    if (!original) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    const session = this.store.sessions.get(original.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${original.sessionId}`)
    const retry = await this.createDesignJob(
      { ...ctx, userId: original.userId },
      {
        sessionId: original.sessionId,
        prompt: original.prompt,
        sourceMode: original.sourceMode,
        variationCount: original.variationCount,
        templateRequirements: normalizeTemplateRequirements(original.templateRequirements),
      },
    )
    const audit = this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'job.retry',
      targetType: 'design_job',
      targetId: jobId,
      reason: input.reason ?? null,
      metadata: {
        retriedJobId: retry.job.id,
      },
    })
    return {
      retry,
      audit,
    }
  }

  private requireCurrentVariationArtifact(variationId: string) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    if (!variation.currentArtifactId) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const artifact = this.store.artifacts.get(variation.currentArtifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${variation.currentArtifactId}`)
    if (artifact.variationId !== variationId) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    return { variation, artifact }
  }

  private requireUser(userId: string) {
    const user = this.store.users.get(userId)
    if (!user) throw createHttpError(401, 'UNAUTHENTICATED', `Unknown user: ${userId}`)
    if (user.status !== 'active') throw createHttpError(403, 'USER_DISABLED', `User disabled: ${userId}`)
    return user
  }

  private requireAdminRole(ctx: RequestContext, allowed: Array<NonNullable<RequestContext['adminRole']>>): void {
    this.requireUser(ctx.userId)
    if (!ctx.adminRole || !allowed.includes(ctx.adminRole)) {
      throw createHttpError(403, 'ADMIN_FORBIDDEN', 'This admin action requires a higher role.')
    }
  }

  private requireWorkspaceAccess(workspaceId: string, userId: string): void {
    const workspace = this.store.workspaces.get(workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    if (workspace.ownerId !== userId) {
      throw createHttpError(403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.')
    }
  }

  private requireSessionAccess(sessionId: string, userId: string): void {
    const session = this.store.sessions.get(sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    if (session.userId !== userId) {
      throw createHttpError(403, 'SESSION_FORBIDDEN', 'You do not have access to this session.')
    }
  }

  private requireJobAccess(jobId: string, userId: string): void {
    const job = this.store.jobs.get(jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (job.userId !== userId) {
      throw createHttpError(403, 'JOB_FORBIDDEN', 'You do not have access to this design job.')
    }
  }

  private requireVariationAccess(variationId: string, userId: string): void {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    this.requireJobAccess(variation.jobId, userId)
  }

  private async runMockJob(input: {
    jobId: string
    sessionId: string
    workspaceId: string
    workspaceRoot: string
    prompt: string
    sourceMode: CreateDesignJobRequest['sourceMode']
    sourceArtifactId: string | null
    variationCount: number
    templateRequirements: CreateDesignJobRequest['templateRequirements']
    variationIdsByIndex: Map<number, string>
  }): Promise<void> {
    this.store.setJobStatus(input.jobId, 'running')
    try {
      for await (const event of this.runtime.spawnVariationAgents({
        userId: this.store.sessions.get(input.sessionId)?.userId ?? this.store.devUser.id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        prompt: input.prompt,
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId,
        variationCount: input.variationCount,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: this.store.users.get(this.store.sessions.get(input.sessionId)?.userId ?? '')?.memoryNamespace ?? this.store.devUser.memoryNamespace,
        templateRequirements: input.templateRequirements,
      })) {
        const normalized = this.rewriteMockVariationId(event, input.variationIdsByIndex)
        this.applyEventSideEffects(normalized)
        this.events.publish(normalized)
      }
      this.store.setJobStatus(input.jobId, 'completed')
    } catch (error) {
      this.store.setJobStatus(input.jobId, 'failed')
      throw error
    }
  }

  private rewriteMockVariationId(event: DesignEvent, idsByIndex: Map<number, string>): DesignEvent {
    const variationId = event.variationId
    if (!variationId?.startsWith('mock_variation_')) return event
    const index = Number(variationId.replace('mock_variation_', ''))
    const realId = idsByIndex.get(index)
    if (!realId) return event
    if (event.type === 'design.variation_preview_ready') {
      return {
        ...event,
        variationId: realId,
        payload: {
          ...event.payload,
          previewUrl: `/api/variations/${realId}/preview`,
        },
      }
    }
    return {
      ...event,
      variationId: realId,
    } as DesignEvent
  }

  private applyEventSideEffects(event: DesignEvent): void {
    if (!event.variationId) return
    switch (event.type) {
      case 'design.variation_queued':
        this.store.applyVariationEvent({ variationId: event.variationId, status: 'queued' })
        break
      case 'design.variation_streaming':
        this.store.applyVariationEvent({ variationId: event.variationId, status: 'streaming' })
        break
      case 'design.variation_preview_ready': {
        const variation = this.store.variations.get(event.variationId)
        const job = variation ? this.store.jobs.get(variation.jobId) : undefined
        const artifact = this.store.createMockArtifact({
          workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
          sessionId: event.sessionId ?? variation?.sessionId ?? '',
          variationId: event.variationId,
          artifactId: event.payload.artifactId,
        })
        this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'rendering_preview',
          artifactId: artifact.id,
          previewUrl: event.payload.previewUrl,
        })
        break
      }
      case 'design.variation_completed':
        {
          const variation = this.store.variations.get(event.variationId)
          const job = variation ? this.store.jobs.get(variation.jobId) : undefined
          const existingArtifact = event.payload.artifactId
            ? this.store.artifacts.get(event.payload.artifactId)
            : undefined
          const artifact = variation && !existingArtifact
            ? this.store.createMockArtifact({
                workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variationId: event.variationId,
                artifactId: event.payload.artifactId,
                parentArtifactId: variation.currentArtifactId,
              })
            : existingArtifact
          this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'completed',
          artifactId: artifact?.id ?? event.payload.artifactId,
          inputTokens: event.payload.inputTokens,
          outputTokens: event.payload.outputTokens,
          costCents: event.payload.costCents,
        })
          if (variation && job && artifact) {
            const isRefine = Boolean(artifact.parentArtifactId)
            this.recordUsageEvent({
              kind: isRefine ? 'variation.refined' : 'variation.completed',
              userId: job.userId,
              workspaceId: job.workspaceId,
              sessionId: variation.sessionId,
              jobId: job.id,
              variationId: variation.id,
              artifactId: artifact.id,
              inputTokens: event.payload.inputTokens ?? 0,
              outputTokens: event.payload.outputTokens ?? 0,
              costCents: event.payload.costCents ?? 0,
              metadata: {
                artifactVersion: artifact.version,
                parentArtifactId: artifact.parentArtifactId,
              },
            })
          }
        }
        break
      case 'design.variation_failed':
        this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'failed',
          errorCode: event.payload.errorCode,
          errorMessage: event.payload.message,
        })
        break
      default:
        break
    }
  }

  private recordUsageEvent(input: Parameters<InMemoryStore['createUsageEvent']>[0]) {
    this.store.createUsageEvent(input)
  }
}

function validateVariationCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw createHttpError(400, 'INVALID_VARIATION_COUNT', 'variationCount must be an integer from 1 to 6.')
  }
}

function normalizeTemplateRequirements(value: Record<string, unknown>): CreateDesignJobRequest['templateRequirements'] {
  return {
    styles: Array.isArray(value.styles) ? value.styles.filter((item): item is string => typeof item === 'string') : undefined,
    deviceTargets: Array.isArray(value.deviceTargets)
      ? value.deviceTargets.filter((item): item is 'desktop' | 'tablet' | 'mobile' => item === 'desktop' || item === 'tablet' || item === 'mobile')
      : undefined,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
  }
}

function previewText(value: string | null, maxLength: number): string | null {
  if (!value) return null
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

function summarizeSupportIssue(
  latestJob: { status: string; id: string } | null,
  failedVariations: Array<{ id: string; errorCode: string | null; errorMessage: string | null }>,
): { severity: 'ok' | 'warning' | 'blocked'; message: string; failedVariationCount: number; examples: Array<{ variationId: string; errorCode: string | null; message: string | null }> } {
  if (!latestJob) {
    return {
      severity: 'warning',
      message: 'No jobs have been created for this session.',
      failedVariationCount: 0,
      examples: [],
    }
  }
  if (latestJob.status === 'failed') {
    return {
      severity: 'blocked',
      message: `Latest job ${latestJob.id} failed.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (failedVariations.length > 0) {
    return {
      severity: 'warning',
      message: `${failedVariations.length} variation(s) reported errors.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (latestJob.status === 'queued' || latestJob.status === 'running') {
    return {
      severity: 'warning',
      message: `Latest job ${latestJob.id} is still ${latestJob.status}.`,
      failedVariationCount: 0,
      examples: [],
    }
  }
  return {
    severity: 'ok',
    message: 'No job or variation failures detected.',
    failedVariationCount: 0,
    examples: [],
  }
}

function toFailureExample(variation: { id: string; errorCode: string | null; errorMessage: string | null }) {
  return {
    variationId: variation.id,
    errorCode: variation.errorCode,
    message: previewText(variation.errorMessage, 120),
  }
}

export type HttpError = Error & {
  status: number
  code: string
}

export function createHttpError(status: number, code: string, message: string): HttpError {
  const error = new Error(message) as HttpError
  error.status = status
  error.code = code
  return error
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildAnnotationPrompt(shapes: AnnotationShape[], prompt?: string): string {
  const lines = shapes.map((shape, index) => {
    const label = `Annotation ${index + 1}`
    if (shape.type === 'rect') {
      return `${label}: rectangle at x=${round(shape.x)}, y=${round(shape.y)}, w=${round(shape.w)}, h=${round(shape.h)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'circle') {
      return `${label}: circle at cx=${round(shape.cx)}, cy=${round(shape.cy)}, r=${round(shape.r)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'arrow') {
      return `${label}: arrow from (${round(shape.from.x)}, ${round(shape.from.y)}) to (${round(shape.to.x)}, ${round(shape.to.y)})${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'pen') {
      return `${label}: freehand stroke with ${shape.points.length} points${shape.note ? `; note: ${shape.note}` : ''}`
    }
    return `${label}: text note at (${round(shape.anchor.x)}, ${round(shape.anchor.y)}): ${shape.text}${shape.note ? `; note: ${shape.note}` : ''}`
  })
  return [
    prompt?.trim() || 'Apply the requested visual changes from these annotations.',
    'Use normalized coordinates where 0,0 is the top-left of the current preview and 1,1 is the bottom-right.',
    ...lines,
  ].join('\n')
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000'
}
