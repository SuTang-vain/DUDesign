import type {
  CreateDesignJobRequest,
  CreateAnnotationBatchRequest,
  CreateSessionRequest,
  DesignEvent,
  RefineVariationRequest,
  ShareVariationRequest,
} from '@dudesign/contracts'
import { LocalArtifactStore, type ArtifactStore } from '@dudesign/artifact-store'
import { MockRuntimeGateway, type RuntimeGateway } from '@dudesign/runtime-gateway'
import type { Artifact, DesignVariation, DesignVariationStatus } from '@dudesign/domain'
import { join, posix } from 'node:path'
import { buildAnnotationPrompt } from './annotationPrompt.js'
import { JobEventBus } from './eventBus.js'
import { InMemoryStore } from './store.js'
import type { ApplicationRepository } from './repository.js'
import type { RequestContext } from './auth.js'

export class ApplicationService {
  readonly store: ApplicationRepository
  readonly events: JobEventBus
  readonly runtime: RuntimeGateway
  readonly artifacts: ArtifactStore

  constructor(options: {
    store?: ApplicationRepository
    events?: JobEventBus
    runtime?: RuntimeGateway
    artifacts?: ArtifactStore
  } = {}) {
    this.store = options.store ?? new InMemoryStore()
    this.events = options.events ?? new JobEventBus()
    this.runtime = options.runtime ?? new MockRuntimeGateway()
    this.artifacts = options.artifacts ?? new LocalArtifactStore({
      rootDir: process.env.DUDESIGN_ARTIFACT_ROOT ?? join(process.cwd(), '.dudesign', 'artifacts'),
    })
  }

  async getBootstrap(ctx: RequestContext) {
    const user = await this.requireUser(ctx.userId)
    const workspace = await this.store.getPrimaryWorkspaceForUser(user.id)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${user.id}`)
    const models = await this.store.listUserModelOptions(user.id)
    return { user, workspace, models }
  }

  async listUserModels(ctx: RequestContext) {
    const user = await this.requireUser(ctx.userId)
    return this.store.listUserModelOptions(user.id)
  }

  async createSession(ctx: RequestContext, input: CreateSessionRequest) {
    const user = await this.requireUser(ctx.userId)
    const workspace = await this.store.getWorkspaceById(input.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${input.workspaceId}`)
    await this.requireWorkspaceAccess(workspace.id, user.id)
    const session = await this.store.createSession({
      ...input,
      userId: user.id,
      mode: input.mode ?? 'new_html',
    })
    const runtime = await this.tryCreateRuntimeSession({
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
    await this.store.saveSession(updated)
    return {
      session: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        runtimeSessionId: updated.runtimeSessionId,
        status: updated.status,
      },
    }
  }

  async listSessions(ctx: RequestContext) {
    const sessions = await this.store.listSessions()
    return {
      sessions: sessions.filter(session => session.userId === ctx.userId),
    }
  }

  private async tryCreateRuntimeSession(input: Parameters<RuntimeGateway['createSession']>[0]) {
    try {
      return await this.runtime.createSession(input)
    } catch (error) {
      return {
        runtimeSessionId: null,
        message: error instanceof Error ? error.message : 'Runtime unavailable.',
      }
    }
  }

  async resumeSession(ctx: RequestContext, sessionId: string) {
    const snapshot = await this.store.getSessionSnapshot(sessionId)
    if (!snapshot) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    await this.requireSessionAccess(snapshot.session.id, ctx.userId)
    const workspace = await this.store.getWorkspaceById(snapshot.session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${snapshot.session.workspaceId}`)
    const user = await this.requireUser(snapshot.session.userId)
    const runtime = await this.runtime.resumeSession({
      userId: snapshot.session.userId,
      workspaceId: workspace.id,
      sessionId: snapshot.session.id,
      runtimeSessionId: snapshot.session.runtimeSessionId,
      workspaceRoot: workspace.storageKey,
      memoryNamespace: user.memoryNamespace,
    })
    const session = runtime.runtimeSessionId && runtime.runtimeSessionId !== snapshot.session.runtimeSessionId
      ? {
          ...snapshot.session,
          runtimeSessionId: runtime.runtimeSessionId,
          updatedAt: new Date().toISOString(),
        }
      : snapshot.session
    if (session !== snapshot.session) {
      await this.store.saveSession(session)
    }
    return {
      ...snapshot,
      session,
      runtime,
    }
  }

  async createDesignJob(ctx: RequestContext, input: CreateDesignJobRequest) {
    validateVariationCount(input.variationCount)
    const context = await this.store.getSessionWorkspaceContext(input.sessionId)
    if (!context) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${input.sessionId}`)
    const { session, workspace } = context
    await this.requireSessionAccess(session.id, ctx.userId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${session.workspaceId}`)
    const selectedModel = await this.resolveUserModel(ctx.userId, input.modelServiceId ?? null)
    await this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId ?? null,
        variationCount: input.variationCount,
        modelServiceId: selectedModel.id,
      },
    })
    const job = await this.store.createJob({
      session,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      variationCount: input.variationCount,
      templateRequirements: {
        ...(input.templateRequirements ?? {}),
        modelServiceId: selectedModel.id,
        modelId: selectedModel.modelId,
        modelProvider: selectedModel.provider,
      },
    })
    const variations = await this.store.createVariations({ job, count: input.variationCount })

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
      modelServiceId: selectedModel.id,
      modelId: selectedModel.modelId,
      modelProvider: selectedModel.provider,
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

  async getDesignJob(ctx: RequestContext, jobId: string) {
    const snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    await this.requireJobAccess(snapshot.job.id, ctx.userId)
    return snapshot
  }

  async getVariationDetail(ctx: RequestContext, variationId: string) {
    const snapshot = await this.store.getVariationDetailSnapshot(variationId)
    if (!snapshot) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const { variation, job, currentArtifact, artifacts } = snapshot
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId)
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
    const context = await this.store.getVariationRefineContext(variationId, input.baseArtifactId)
    if (!context) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const { variation, job, session, workspace, baseArtifact } = context
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${variation.sessionId}`)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    if (!input.prompt.trim()) throw createHttpError(400, 'INVALID_PROMPT', 'prompt is required.')
    if (!baseArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.baseArtifactId}`)
    const baseArtifactHtml = await this.readArtifactHtml(baseArtifact.storageKey)
    const modelContext = modelContextFromTemplateRequirements(job.templateRequirements)

    await this.store.appendMessage({
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
      baseArtifactHtml,
      baseArtifactEntryPath: baseArtifact.entryPath,
      baseArtifactVersion: baseArtifact.version,
      prompt: input.prompt,
      annotationPromptSuffix: input.annotationPromptSuffix,
      workspaceRoot: workspace.storageKey,
      deviceContext: input.deviceContext,
      modelServiceId: modelContext.modelServiceId,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    })) {
      await this.applyEventSideEffects(event)
      this.events.publish(event)
    }

    const current = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const updated = current.variation!
    const artifact = current.artifact
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
    const context = await this.store.getVariationArtifactContext(variationId, input.artifactId)
    const variation = context.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    const artifact = context.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
    if (context.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (!Array.isArray(input.shapes) || input.shapes.length === 0) {
      throw createHttpError(400, 'ANNOTATION_REQUIRED', 'At least one annotation shape is required.')
    }
    const promptSuffix = buildAnnotationPrompt(input.shapes, input.prompt)
    const batch = await this.store.createAnnotationBatch({
      variationId,
      artifactId: input.artifactId,
      userId: ctx.userId,
      shapes: input.shapes,
      promptSuffix,
    })
    const refined = await this.refineVariation(ctx, variationId, {
      prompt: promptSuffix,
      baseArtifactId: input.artifactId,
      annotationPromptSuffix: promptSuffix,
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

  async getVariationPreview(ctx: RequestContext, variationId: string): Promise<string> {
    const snapshot = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    const artifact = snapshot.artifact
    if (!artifact) return renderMockVariationHtml(variation, null)
    const html = await this.readArtifactHtml(artifact.storageKey)
    return await this.rewriteArtifactAssetUrls(variationId, artifact, html, assetPath =>
      `/api/variations/${encodeURIComponent(variationId)}/assets/${encodeRuntimeAssetPath(assetPath)}`)
  }

  async getVariationAsset(ctx: RequestContext, variationId: string, assetPath: string): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    const normalizedPath = normalizeRuntimeArtifactPath(assetPath)
    const snapshot = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    const htmlArtifact = snapshot.artifact
    if (!htmlArtifact) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const asset = await this.store.getVariationAssetArtifact(variationId, htmlArtifact.id, normalizedPath)
    if (!asset) throw createHttpError(404, 'ASSET_NOT_FOUND', `Asset not found: ${normalizedPath}`)
    const stored = await this.artifacts.get(asset.storageKey)
    return {
      contentType: stored.contentType || contentTypeForPath(normalizedPath),
      body: stored.body,
    }
  }

  async getSharedVariationAsset(token: string, assetPath: string): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    const normalizedPath = normalizeRuntimeArtifactPath(assetPath)
    const snapshot = await this.requirePublicShareSnapshot(token)
    const { share, artifact } = snapshot
    const asset = await this.store.getVariationAssetArtifact(share.variationId, artifact.id, normalizedPath)
    if (!asset) throw createHttpError(404, 'ASSET_NOT_FOUND', `Asset not found: ${normalizedPath}`)
    const stored = await this.artifacts.get(asset.storageKey)
    return {
      contentType: stored.contentType || contentTypeForPath(normalizedPath),
      body: stored.body,
    }
  }

  async exportVariation(ctx: RequestContext, variationId: string) {
    await this.requireVariationAccess(variationId, ctx.userId)
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    const job = await this.store.getJobById(variation.jobId)
    const html = await this.readArtifactHtml(artifact.storageKey)
    const filename = `${variation.title ?? variation.id}-v${artifact.version}.html`.replaceAll(/\s+/g, '-').toLowerCase()
    const existingExportArtifact = await this.findExistingExportArtifact(variation.id, artifact.id)
    const exportArtifact = existingExportArtifact ?? await this.createExportZipArtifact({
      variation,
      sourceArtifact: artifact,
      filename: filename.replace(/\.html$/, '.zip'),
      html,
    })
    await this.recordUsageEvent({
      idempotencyKey: `usage:export.created:export:${exportArtifact.id}:source:${artifact.id}`,
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
        exportArtifactId: exportArtifact.id,
        jobStatus: job?.status ?? null,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        version: artifact.version,
        filename,
        html,
      },
      exportArtifact: {
        id: exportArtifact.id,
        kind: 'export_zip',
        filename: exportArtifact.entryPath ?? filename.replace(/\.html$/, '.zip'),
        sizeBytes: exportArtifact.sizeBytes,
        contentHash: exportArtifact.contentHash,
        downloadUrl: `/api/artifacts/${encodeURIComponent(exportArtifact.id)}/download`,
        files: Array.isArray(exportArtifact.metadata.files) ? exportArtifact.metadata.files as string[] : [],
        reused: Boolean(existingExportArtifact),
      },
    }
  }

  async downloadArtifact(ctx: RequestContext, artifactId: string): Promise<{
    filename: string
    contentType: string
    body: Uint8Array
  }> {
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    if (artifact.kind !== 'export_zip') {
      throw createHttpError(403, 'ARTIFACT_DOWNLOAD_FORBIDDEN', 'Only export artifacts can be downloaded through this endpoint.')
    }
    if (!artifact.variationId) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISSING', 'Export artifact is not attached to a variation.')
    }
    await this.requireVariationAccess(artifact.variationId, ctx.userId)
    const stored = await this.artifacts.get(artifact.storageKey)
    return {
      filename: artifact.entryPath ?? `${artifact.id}.zip`,
      contentType: stored.contentType || 'application/zip',
      body: stored.body,
    }
  }

  async shareVariation(ctx: RequestContext, variationId: string, input: ShareVariationRequest) {
    await this.requireVariationAccess(variationId, ctx.userId)
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    if (!['public', 'private', 'password'].includes(input.visibility)) {
      throw createHttpError(400, 'INVALID_SHARE_VISIBILITY', 'visibility must be public, private, or password.')
    }
    const share = await this.store.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: ctx.userId,
      visibility: input.visibility,
      expiresAt: input.expiresAt ?? null,
    })
    await this.recordUsageEvent({
      idempotencyKey: `usage:share.created:share:${share.id}`,
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

  async getSharedVariation(token: string) {
    const { share, variation, artifact } = await this.requirePublicShareSnapshot(token)
    const html = await this.readArtifactHtml(artifact.storageKey)
    return {
      share: {
        id: share.id,
        token: share.token,
        visibility: share.visibility,
        revokedAt: share.revokedAt,
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
        html: await this.rewriteArtifactAssetUrls(variation.id, artifact, html, assetPath =>
          `/api/shares/${encodeURIComponent(token)}/assets/${encodeRuntimeAssetPath(assetPath)}`),
      },
    }
  }

  private async requirePublicShareSnapshot(token: string) {
    const snapshot = await this.store.getSharedVariationSnapshot(token)
    if (!snapshot) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    const { share, variation, artifact } = snapshot
    if (share.revokedAt) {
      throw createHttpError(410, 'SHARE_REVOKED', 'This share link has been revoked.')
    }
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      throw createHttpError(410, 'SHARE_EXPIRED', 'This share link has expired.')
    }
    if (share.visibility !== 'public') {
      throw createHttpError(403, 'SHARE_FORBIDDEN', `${share.visibility} share links require authenticated access in MVP.`)
    }
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${share.variationId}`)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${share.artifactId}`)
    return { share, variation, artifact }
  }

  async revokeShare(ctx: RequestContext, token: string) {
    const share = await this.store.getShareByToken(token)
    if (!share) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    if (share.ownerId !== ctx.userId) {
      throw createHttpError(403, 'SHARE_FORBIDDEN', 'You do not have access to this share link.')
    }
    const revoked = await this.store.revokeShare(token)
    if (!revoked) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    return {
      share: {
        id: revoked.id,
        token: revoked.token,
        revokedAt: revoked.revokedAt!,
      },
    }
  }

  async getAdminRuntimeHealth(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return {
      runtime: await this.runtime.getRuntimeHealth(),
      contract: await this.runtime.getRuntimeContract(),
    }
  }

  async listAuditLogs(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    return {
      auditLogs: this.store.listAuditLogs(),
    }
  }

  async listAdminJobs(ctx: RequestContext, filter: { status?: string | null; userId?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.listAdminJobs(filter)
  }

  async listAdminArtifacts(ctx: RequestContext, filter: { jobId?: string | null; variationId?: string | null; kind?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.listAdminArtifacts(filter)
  }

  async getAdminUserSupport(ctx: RequestContext, filter: { userId?: string | null; email?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.getAdminUserSupport(filter)
  }

  async getAdminCostSummary(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.getAdminCostSummary()
  }

  async listAdminModels(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    return this.store.listAdminModels()
  }

  async updateAdminModel(ctx: RequestContext, modelServiceId: string, input: { enabled?: boolean; isDefault?: boolean }) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const model = await this.store.updateAdminModel(modelServiceId, input)
    if (!model) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'model.update',
      targetType: 'model_service',
      targetId: modelServiceId,
      reason: null,
      metadata: input,
    })
    return { model, audit }
  }

  async getAdminUserModelAccess(ctx: RequestContext, userId: string) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    await this.requireUser(userId)
    return this.store.getAdminUserModelAccess(userId)
  }

  async updateUserModelAccess(
    ctx: RequestContext,
    userId: string,
    modelServiceId: string,
    input: { enabled?: boolean; dailyTokenLimit?: number | null; monthlyCostLimitCents?: number | null },
  ) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    await this.requireUser(userId)
    const model = await this.store.getModelServiceById(modelServiceId)
    if (!model) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    const access = await this.store.updateUserModelAccess(userId, modelServiceId, input)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'user_model_access.update',
      targetType: 'user_model_access',
      targetId: access.id,
      reason: null,
      metadata: {
        userId,
        modelServiceId,
        ...input,
      },
    })
    return { access, audit }
  }

  async cancelJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string }) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (snapshot.job.status === 'completed' || snapshot.job.status === 'failed' || snapshot.job.status === 'cancelled') {
      throw createHttpError(409, 'JOB_NOT_CANCELLABLE', `Job ${jobId} is already ${snapshot.job.status}.`)
    }
	    const runtime = await this.runtime.cancelRuntimeJob({
	      jobId,
	      reason: input.reason,
	      variations: snapshot.variations
	        .filter(variation => variation.status !== 'completed' && variation.status !== 'failed' && variation.status !== 'cancelled')
	        .map(variation => ({
	          variationId: variation.id,
	          runtimeChildSessionId: variation.runtimeChildSessionId,
	          runtimeAgentJobId: variation.runtimeAgentJobId,
	        })),
	    })
    await this.store.setJobStatus(jobId, 'cancelled')
    for (const variation of snapshot.variations) {
      if (variation.status !== 'completed' && variation.status !== 'failed' && variation.status !== 'cancelled') {
        await this.store.applyVariationEvent({ variationId: variation.id, status: 'cancelled' })
      }
    }
    const audit = await this.store.createAuditLog({
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
      job: await this.store.getJobById(jobId),
      runtime,
      audit,
    }
  }

  async retryJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const original = await this.store.getJobById(jobId)
    if (!original) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    const session = await this.store.getSessionById(original.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${original.sessionId}`)
    const retry = await this.createDesignJob(
      { ...ctx, userId: original.userId },
      {
        sessionId: original.sessionId,
        prompt: original.prompt,
        sourceMode: original.sourceMode,
        variationCount: original.variationCount,
        templateRequirements: normalizeTemplateRequirements(original.templateRequirements),
        modelServiceId: stringValue(original.templateRequirements.modelServiceId) ?? undefined,
      },
    )
    const audit = await this.store.createAuditLog({
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

  private async requireCurrentVariationArtifact(variationId: string) {
    const snapshot = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    if (!snapshot.artifactId) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const artifact = snapshot.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${snapshot.artifactId}`)
    if (snapshot.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    return { variation, artifact }
  }

  private async requireUser(userId: string) {
    const user = await this.store.getUserById(userId)
    if (!user) throw createHttpError(401, 'UNAUTHENTICATED', `Unknown user: ${userId}`)
    if (user.status !== 'active') throw createHttpError(403, 'USER_DISABLED', `User disabled: ${userId}`)
    return user
  }

  private async requireAdminRole(ctx: RequestContext, allowed: Array<NonNullable<RequestContext['adminRole']>>): Promise<void> {
    await this.requireUser(ctx.userId)
    if (!ctx.adminRole || !allowed.includes(ctx.adminRole)) {
      throw createHttpError(403, 'ADMIN_FORBIDDEN', 'This admin action requires a higher role.')
    }
  }

  private async requireWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.store.getWorkspaceById(workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    if (workspace.ownerId !== userId) {
      throw createHttpError(403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.')
    }
  }

  private async requireSessionAccess(sessionId: string, userId: string): Promise<void> {
    const session = await this.store.getSessionById(sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    if (session.userId !== userId) {
      throw createHttpError(403, 'SESSION_FORBIDDEN', 'You do not have access to this session.')
    }
  }

  private async requireJobAccess(jobId: string, userId: string): Promise<void> {
    const job = await this.store.getJobById(jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (job.userId !== userId) {
      throw createHttpError(403, 'JOB_FORBIDDEN', 'You do not have access to this design job.')
    }
  }

  private async requireVariationAccess(variationId: string, userId: string): Promise<void> {
    const variation = await this.store.getVariationById(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireJobAccess(variation.jobId, userId)
  }

  private async resolveUserModel(userId: string, requestedModelServiceId: string | null) {
    const options = await this.store.listUserModelOptions(userId)
    const modelServiceId = requestedModelServiceId ?? options.defaultModelId
    if (!modelServiceId) throw createHttpError(409, 'NO_MODEL_AVAILABLE', 'No model service is available for this user.')
    const allowed = await this.store.canUserUseModel(userId, modelServiceId)
    if (!allowed) throw createHttpError(403, 'MODEL_FORBIDDEN', 'This model is not enabled for this user.')
    const model = await this.store.getModelServiceById(modelServiceId)
    if (!model || !model.enabled) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    return model
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
    modelServiceId: string
    modelId: string
    modelProvider: string
    variationIdsByIndex: Map<number, string>
  }): Promise<void> {
    await this.store.setJobStatus(input.jobId, 'running')
    const runtimeContext = await this.store.getRuntimeSessionContext(input.sessionId)
    try {
      for await (const event of this.runtime.spawnVariationAgents({
        userId: runtimeContext?.session.userId ?? this.store.devUser.id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        prompt: input.prompt,
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId,
        variationCount: input.variationCount,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: runtimeContext?.user?.memoryNamespace ?? this.store.devUser.memoryNamespace,
        templateRequirements: input.templateRequirements,
        modelServiceId: input.modelServiceId,
        modelId: input.modelId,
        modelProvider: input.modelProvider,
      })) {
        const normalized = this.rewriteRuntimeVariationId(event, input.variationIdsByIndex)
        await this.applyEventSideEffects(normalized)
        this.events.publish(normalized)
      }
      await this.store.setJobStatus(input.jobId, 'completed')
    } catch (error) {
      await this.store.setJobStatus(input.jobId, 'failed')
      for (const variationId of input.variationIdsByIndex.values()) {
        await this.store.applyVariationEvent({
          variationId,
          status: 'failed',
          errorCode: 'RUNTIME_UNAVAILABLE',
          errorMessage: error instanceof Error ? error.message : 'Runtime unavailable.',
        })
      }
    }
  }

  private rewriteRuntimeVariationId(event: DesignEvent, idsByIndex: Map<number, string>): DesignEvent {
    const variationId = event.variationId
    const index = variationIndexFromRuntimeId(variationId)
    if (!index) return event
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

  private async applyEventSideEffects(event: DesignEvent): Promise<void> {
    if (!event.variationId) return
    switch (event.type) {
      case 'design.variation_queued':
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'queued',
          runtimeChildSessionId: event.payload.runtimeChildSessionId,
          runtimeAgentJobId: event.payload.runtimeAgentJobId,
        })
        break
      case 'design.variation_streaming':
        await this.store.applyVariationEvent({ variationId: event.variationId, status: 'streaming' })
        break
      case 'design.variation_artifact_updated':
        {
          const context = await this.store.getVariationJobContext(event.variationId)
          const variation = context?.variation
          const job = context?.job
          const artifact = variation
            ? await this.materializeArtifactFromRuntimePayload({
                event,
                workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variation,
                sourceEventType: 'artifact_updated',
              })
            : undefined
          await this.store.applyVariationEvent({
            variationId: event.variationId,
            status: artifact ? 'rendering_preview' : 'streaming',
            artifactId: artifact?.id,
            previewUrl: artifact ? `/api/variations/${event.variationId}/preview` : undefined,
          })
        }
        break
      case 'design.variation_preview_ready': {
        const context = await this.store.getVariationJobContext(event.variationId)
        const variation = context?.variation
        const job = context?.job
        const artifact = await this.store.createMockArtifact({
          workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
          sessionId: event.sessionId ?? variation?.sessionId ?? '',
          variationId: event.variationId,
          artifactId: event.payload.artifactId,
        })
        await this.writeMockArtifactBody(artifact.id)
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'rendering_preview',
          artifactId: artifact.id,
          previewUrl: event.payload.previewUrl,
        })
        break
      }
      case 'design.variation_completed':
        {
          const context = await this.store.getVariationJobContext(event.variationId)
          const variation = context?.variation
          const job = context?.job
          const existingArtifact = event.payload.artifactId
            ? await this.store.getArtifactById(event.payload.artifactId) ?? undefined
            : undefined
          const artifact = existingArtifact ?? (variation
            ? await this.materializeArtifactFromRuntimePayload({
                event,
                workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variation,
                sourceEventType: 'completed',
              })
            : undefined)
          await this.store.applyVariationEvent({
            variationId: event.variationId,
            status: 'completed',
            artifactId: artifact?.id ?? event.payload.artifactId,
            previewUrl: artifact ? `/api/variations/${event.variationId}/preview` : undefined,
            inputTokens: event.payload.inputTokens,
            outputTokens: event.payload.outputTokens,
            costCents: event.payload.costCents,
          })
          if (variation && job && artifact) {
            const isRefine = Boolean(artifact.parentArtifactId)
            await this.recordUsageEvent({
              idempotencyKey: `usage:${isRefine ? 'variation.refined' : 'variation.completed'}:job:${job.id}:variation:${variation.id}:artifact:${artifact.id}`,
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
                modelServiceId: stringValue(job.templateRequirements.modelServiceId),
                modelId: stringValue(job.templateRequirements.modelId),
                modelProvider: stringValue(job.templateRequirements.modelProvider),
              },
            })
          }
        }
        break
      case 'design.variation_failed':
        await this.store.applyVariationEvent({
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

  private async recordUsageEvent(input: Parameters<ApplicationRepository['createUsageEvent']>[0]): Promise<void> {
    await this.store.createUsageEvent(input)
  }

  private async writeMockArtifactBody(artifactId: string): Promise<void> {
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    const variation = artifact.variationId ? await this.store.getVariationById(artifact.variationId) : null
    const stored = await this.artifacts.put({
      workspaceId: artifact.workspaceId,
      artifactId: artifact.id,
      relativePath: `v${artifact.version}/${artifact.entryPath ?? 'index.html'}`,
      contentType: 'text/html; charset=utf-8',
      body: renderMockVariationHtml(variation, artifact),
      metadata: {
        kind: artifact.kind,
        version: String(artifact.version),
        sessionId: artifact.sessionId,
        variationId: artifact.variationId ?? '',
      },
    })
    await this.store.saveArtifact({
      ...artifact,
      storageKey: stored.storageKey,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        ...artifact.metadata,
        storedBy: 'LocalArtifactStore',
      },
    })
  }

  private async materializeArtifactFromRuntimePayload(input: {
    event: Extract<DesignEvent, { type: 'design.variation_artifact_updated' | 'design.variation_completed' }>
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact | null> {
    if (Array.isArray(input.event.payload.files) && input.event.payload.files.length > 0) {
      return await this.createRuntimeWorkspaceArtifacts({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variation: input.variation,
        runtimeArtifactId: input.event.payload.artifactId,
        files: input.event.payload.files,
        entryPath: input.event.payload.entryPath ?? 'index.html',
        sourceEventType: input.sourceEventType,
      })
    }
    if (typeof input.event.payload.html === 'string' && input.event.payload.html.trim()) {
      return await this.createRuntimeHtmlArtifact({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variation: input.variation,
        runtimeArtifactId: input.event.payload.artifactId,
        html: input.event.payload.html,
        entryPath: input.event.payload.entryPath ?? 'index.html',
        changedPaths: input.event.payload.changedPaths ?? [],
        sourceEventType: input.sourceEventType,
      })
    }
    if (input.sourceEventType === 'artifact_updated') {
      return null
    }
    const artifact = await this.store.createMockArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      artifactId: input.event.payload.artifactId,
      entryPath: input.event.payload.entryPath,
      parentArtifactId: input.variation.currentArtifactId,
    })
    await this.writeMockArtifactBody(artifact.id)
    return artifact
  }

  private async createRuntimeHtmlArtifact(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    runtimeArtifactId?: string
    html: string
    entryPath: string
    changedPaths: string[]
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact> {
    const version = await this.nextHtmlArtifactVersion(input.variation.id)
    const artifactId = input.runtimeArtifactId?.startsWith('art_') ? input.runtimeArtifactId : `art_${input.variation.id}_runtime_${version}`
    const stored = await this.artifacts.put({
      workspaceId: input.workspaceId,
      artifactId,
      relativePath: `v${version}/${input.entryPath}`,
      contentType: 'text/html; charset=utf-8',
      body: input.html,
      metadata: {
        kind: 'html',
        source: 'babel-o-runtime',
        sessionId: input.sessionId,
        variationId: input.variation.id,
        runtimeArtifactId: input.runtimeArtifactId ?? '',
      },
    })
    return await this.store.createArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.variation.currentArtifactId,
      kind: 'html',
      version,
      storageKey: stored.storageKey,
      entryPath: input.entryPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        source: 'babel-o-runtime',
        sourceEventType: input.sourceEventType,
        runtimeArtifactId: input.runtimeArtifactId ?? null,
        changedPaths: input.changedPaths,
      },
    })
  }

  private async createRuntimeWorkspaceArtifacts(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    runtimeArtifactId?: string
    files: Array<{ path: string; content: string; contentType?: string }>
    entryPath: string
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact> {
    const files = normalizeRuntimeFiles(input.files)
    const entryPath = normalizeRuntimeArtifactPath(input.entryPath)
    const entry = files.find(file => file.path === entryPath) ?? files.find(file => file.path === 'index.html')
    if (!entry) {
      throw createHttpError(400, 'RUNTIME_ARTIFACT_ENTRY_MISSING', 'Runtime artifact files must include index.html.')
    }
    const version = await this.nextHtmlArtifactVersion(input.variation.id)
    const htmlArtifactId = `art_${input.variation.id}_workspace_${version}`
    const storedEntry = await this.artifacts.put({
      workspaceId: input.workspaceId,
      artifactId: htmlArtifactId,
      relativePath: `v${version}/${entry.path}`,
      contentType: entry.contentType ?? contentTypeForPath(entry.path),
      body: entry.content,
      metadata: {
        kind: 'html',
        source: 'babel-o-workspace',
        sessionId: input.sessionId,
        variationId: input.variation.id,
        runtimeArtifactId: input.runtimeArtifactId ?? '',
      },
    })
    const htmlArtifact = await this.store.createArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.variation.currentArtifactId,
      kind: 'html',
      version,
      storageKey: storedEntry.storageKey,
      entryPath: entry.path,
      contentHash: storedEntry.contentHash,
      sizeBytes: storedEntry.sizeBytes,
      metadata: {
        source: 'babel-o-workspace',
        sourceEventType: input.sourceEventType,
        runtimeArtifactId: input.runtimeArtifactId ?? null,
        fileCount: files.length,
      },
    })

    for (const file of files.filter(file => file.path !== entry.path)) {
      const assetArtifactId = `asset_${input.variation.id}_${version}_${stablePathId(file.path)}`
      const storedAsset = await this.artifacts.put({
        workspaceId: input.workspaceId,
        artifactId: assetArtifactId,
        relativePath: `v${version}/${file.path}`,
        contentType: file.contentType ?? contentTypeForPath(file.path),
        body: file.content,
        metadata: {
          kind: 'asset',
          source: 'babel-o-workspace',
          sessionId: input.sessionId,
          variationId: input.variation.id,
          htmlArtifactId: htmlArtifact.id,
        },
      })
      await this.store.createArtifact({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variationId: input.variation.id,
        parentArtifactId: htmlArtifact.id,
        kind: 'asset',
        version,
        storageKey: storedAsset.storageKey,
        entryPath: file.path,
        contentHash: storedAsset.contentHash,
        sizeBytes: storedAsset.sizeBytes,
        metadata: {
          source: 'babel-o-workspace',
          htmlArtifactId: htmlArtifact.id,
        },
      })
    }

    return htmlArtifact
  }

  private async nextHtmlArtifactVersion(variationId: string): Promise<number> {
    const detail = await this.store.getVariationDetailSnapshot(variationId)
    const versions = detail?.artifacts
      .filter(artifact => artifact.kind === 'html')
      .map(artifact => artifact.version) ?? []
    return versions.length > 0 ? Math.max(...versions) + 1 : 1
  }

  private async readArtifactHtml(storageKey: string): Promise<string> {
    const artifact = await this.artifacts.get(storageKey)
    return new TextDecoder().decode(artifact.body)
  }

  private async rewriteArtifactAssetUrls(
    variationId: string,
    htmlArtifact: Artifact,
    html: string,
    toAssetUrl: (assetPath: string) => string,
  ): Promise<string> {
    const assets = await this.store.getVariationAssetArtifacts(variationId, htmlArtifact.id)
    if (assets.length === 0) return html
    const assetPaths = new Set(assets.map(asset => asset.entryPath).filter((path): path is string => Boolean(path)))
    const baseDir = htmlArtifact.entryPath?.includes('/')
      ? htmlArtifact.entryPath.split('/').slice(0, -1).join('/')
      : ''
    return rewriteHtmlAssetUrls(html, value => {
      const resolved = resolveHtmlAssetPath(value, baseDir)
      if (!resolved || !assetPaths.has(resolved)) return value
      return toAssetUrl(resolved)
    })
  }

  private async createExportZipArtifact(input: {
    variation: DesignVariation
    sourceArtifact: Artifact
    filename: string
    html: string
  }): Promise<Artifact> {
    const exportArtifactId = `export_${input.sourceArtifact.id}`
    const assets = await this.store.getVariationAssetArtifacts(input.variation.id, input.sourceArtifact.id)
    const files: Array<{ path: string; body: Uint8Array | string }> = [
      {
        path: input.sourceArtifact.entryPath ?? 'index.html',
        body: input.html,
      },
    ]
    for (const asset of assets) {
      if (!asset.entryPath) continue
      const stored = await this.artifacts.get(asset.storageKey)
      files.push({
        path: asset.entryPath,
        body: stored.body,
      })
    }
    const manifest = {
      kind: 'dudesign.export',
      variationId: input.variation.id,
      sourceArtifactId: input.sourceArtifact.id,
      sourceVersion: input.sourceArtifact.version,
      files: files.map(file => file.path),
      exportedAt: new Date().toISOString(),
    }
    const body = createZipArchive([
      ...files,
      {
        path: 'dudesign-export.json',
        body: JSON.stringify(manifest, null, 2),
      },
    ])
    const stored = await this.artifacts.put({
      workspaceId: input.sourceArtifact.workspaceId,
      artifactId: exportArtifactId,
      relativePath: input.filename,
      contentType: 'application/zip',
      body,
      metadata: {
        kind: 'export_zip',
        sourceArtifactId: input.sourceArtifact.id,
        variationId: input.variation.id,
        files: manifest.files.join('\n'),
      },
    })
    return await this.store.createArtifact({
      workspaceId: input.sourceArtifact.workspaceId,
      sessionId: input.sourceArtifact.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.sourceArtifact.id,
      kind: 'export_zip',
      version: input.sourceArtifact.version,
      storageKey: stored.storageKey,
      entryPath: input.filename,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        sourceArtifactId: input.sourceArtifact.id,
        files: manifest.files,
      },
    })
  }

  private async findExistingExportArtifact(variationId: string, sourceArtifactId: string): Promise<Artifact | null> {
    return this.store.getExportArtifactForSource(variationId, sourceArtifactId)
  }
}

function renderMockVariationHtml(variation: DesignVariation | null, artifact: Artifact | null): string {
  const title = variation?.title ?? 'DUDesign Variation'
  const version = artifact?.version ?? 1
  const variationIndex = variation?.index ?? 1
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
          <strong>Invoice #${escapeHtml(variationIndex.toString().padStart(2, '0'))} · v${version}</strong>
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

function modelContextFromTemplateRequirements(value: Record<string, unknown>): {
  modelServiceId?: string
  modelId?: string
  modelProvider?: string
} {
  const modelServiceId = stringValue(value.modelServiceId)
  const modelId = stringValue(value.modelId)
  const modelProvider = stringValue(value.modelProvider)
  return {
    ...(modelServiceId && { modelServiceId }),
    ...(modelId && { modelId }),
    ...(modelProvider && { modelProvider }),
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function variationIndexFromRuntimeId(variationId: string | undefined): number | null {
  if (!variationId) return null
  const match = variationId.match(/^(?:mock|runtime)_variation_(\d+)$/)
  if (!match) return null
  const index = Number(match[1])
  return Number.isInteger(index) && index > 0 ? index : null
}

function normalizeRuntimeFiles(files: Array<{ path: string; content: string; contentType?: string }>): Array<{
  path: string
  content: string
  contentType?: string
}> {
  const normalized = files.map(file => ({
    ...file,
    path: normalizeRuntimeArtifactPath(file.path),
  }))
  const seen = new Set<string>()
  for (const file of normalized) {
    if (seen.has(file.path)) throw createHttpError(400, 'RUNTIME_ARTIFACT_DUPLICATE_PATH', `Duplicate runtime artifact path: ${file.path}`)
    seen.add(file.path)
  }
  return normalized
}

function normalizeRuntimeArtifactPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_INVALID_PATH', `Invalid runtime artifact path: ${path}`)
  }
  if (normalized.split('/').some(part => part === '..' || part === '')) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
  }
  const clean = posix.normalize(normalized)
  if (clean === '.' || clean.startsWith('../') || clean === '..' || posix.isAbsolute(clean)) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
  }
  if (clean.split('/').some(part => part === '' || part === '..')) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_INVALID_PATH', `Invalid runtime artifact path: ${path}`)
  }
  return clean
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

function stablePathId(path: string): string {
  return path.replaceAll(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'asset'
}

function rewriteHtmlAssetUrls(html: string, rewrite: (value: string) => string): string {
  return html.replace(
    /\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,
    (match: string, attr: string, quote: string, value: string) => {
      const next = rewrite(value)
      return next === value ? match : `${attr}=${quote}${escapeHtmlAttribute(next)}${quote}`
    },
  )
}

function resolveHtmlAssetPath(value: string, baseDir: string): string | null {
  const trimmed = value.trim()
  if (
    !trimmed
    || trimmed.startsWith('#')
    || trimmed.startsWith('?')
    || trimmed.startsWith('/')
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    || trimmed.startsWith('//')
  ) {
    return null
  }
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? ''
  if (!pathOnly) return null
  const candidate = baseDir ? `${baseDir}/${pathOnly}` : pathOnly
  try {
    return normalizeRuntimeArtifactPath(candidate)
  } catch {
    return null
  }
}

function encodeRuntimeAssetPath(path: string): string {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

function createZipArchive(files: Array<{ path: string; body: Uint8Array | string }>): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const path = normalizeRuntimeArtifactPath(file.path)
    const name = encoder.encode(path)
    const body = typeof file.body === 'string' ? encoder.encode(file.body) : file.body
    const crc = crc32(body)
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.byteLength),
      u32(body.byteLength),
      u16(name.byteLength),
      u16(0),
      name,
    ])
    localParts.push(localHeader, body)
    centralParts.push(concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.byteLength),
      u32(body.byteLength),
      u16(name.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]))
    offset += localHeader.byteLength + body.byteLength
  }
  const centralDirectory = concatBytes(centralParts)
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.byteLength),
    u32(offset),
    u16(0),
  ])
  return concatBytes([...localParts, centralDirectory, end])
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  const view = new DataView(out.buffer)
  view.setUint16(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  const view = new DataView(out.buffer)
  view.setUint32(0, value >>> 0, true)
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

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

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
