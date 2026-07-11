import type { ArtifactStore } from '@dudesign/artifact-store'
import type { ShareVariationRequest } from '@dudesign/contracts'
import type { Artifact, DesignVariation, WorkspaceMemberRole } from '@dudesign/domain'
import { posix } from 'node:path'
import type { RequestContext } from '../auth.js'
import type { DesignJobQueue, ScreenshotJobQueuePayload } from '../designJobQueue.js'
import { createId } from '../id.js'
import type { ApplicationRepository } from '../repository.js'

export class ArtifactApplicationService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly artifacts: ArtifactStore,
    private readonly queue: DesignJobQueue,
  ) {}

  async restoreVariationVersion(ctx: RequestContext, variationId: string, artifactId: string) {
    const context = await this.store.getVariationArtifactContext(variationId, artifactId)
    const variation = context.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const artifact = context.artifact
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    if (context.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (artifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Only HTML artifact versions can be restored.')
    }
    const previewUrl = `/api/variations/${variationId}/preview`
    const updated = await this.store.setVariationCurrentArtifact(variationId, artifact.id, previewUrl)
    if (!updated) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.enqueueScreenshotJob({
      artifact,
      variation: updated,
      reason: 'restore_requested',
    })
    await this.store.appendMessage({
      sessionId: variation.sessionId,
      role: 'system',
      content: `Restored ${variation.title ?? variation.id} to artifact v${artifact.version}.`,
      metadata: {
        kind: 'variation_restore',
        variationId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
      },
    })
    return {
      variation: {
        id: updated.id,
        currentArtifactId: artifact.id,
        previewUrl: updated.previewUrl,
      },
      artifact: {
        id: artifact.id,
        kind: 'html' as const,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
      },
    }
  }

  async repairVariationPreview(
    ctx: RequestContext,
    variationId: string,
    input: { artifactId?: string | null } = {},
  ) {
    const snapshot = input.artifactId
      ? await this.store.getVariationArtifactContext(variationId, input.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    if (snapshot.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const artifact = snapshot.artifact
    if (!artifact) throw applicationError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an HTML artifact to repair.')
    if (artifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Preview repair requires an HTML artifact.')
    }
    await this.readArtifactText(artifact.storageKey)
    const previewUrl = `/api/variations/${encodeURIComponent(variationId)}/preview`
    const updated = variation.currentArtifactId === artifact.id
      ? await this.store.setVariationCurrentArtifact(variationId, artifact.id, previewUrl)
      : variation
    const queueJob = await this.enqueueScreenshotJob({
      artifact,
      variation,
      reason: 'repair_requested',
    })
    await this.store.appendMessage({
      sessionId: variation.sessionId,
      role: 'system',
      content: `Queued preview repair for ${variation.title ?? variation.id} artifact v${artifact.version}.`,
      metadata: {
        kind: 'variation_preview_repair',
        variationId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        queueJobIdempotencyKey: queueJob.idempotencyKey,
      },
    })
    return {
      variation: {
        id: variation.id,
        currentArtifactId: updated?.currentArtifactId ?? variation.currentArtifactId ?? artifact.id,
        previewUrl: updated?.previewUrl ?? variation.previewUrl ?? previewUrl,
        screenshotUrl: screenshotUrlForArtifactId(
          updated?.screenshotArtifactId ?? variation.screenshotArtifactId,
          variation.id,
        ),
      },
      artifact: {
        id: artifact.id,
        kind: 'html' as const,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
        quality: artifactQualitySummary(artifact.metadata.quality),
      },
      queueJob: {
        idempotencyKey: queueJob.idempotencyKey,
        kind: 'screenshot_job' as const,
        status: queueJob.status,
      },
    }
  }

  async exportVariation(ctx: RequestContext, variationId: string) {
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    const job = await this.store.getJobById(variation.jobId)
    const html = await this.readArtifactText(artifact.storageKey)
    const filename = `${variation.title ?? variation.id}-v${artifact.version}.html`
      .replaceAll(/\s+/g, '-')
      .toLowerCase()
    const existingExportArtifact = await this.store.getExportArtifactForSource(variation.id, artifact.id)
    const exportArtifact = existingExportArtifact ?? await this.createExportZipArtifact({
      variationId: variation.id,
      sourceArtifact: artifact,
      filename: filename.replace(/\.html$/, '.zip'),
      html,
    })
    await this.store.createUsageEvent({
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

  async shareVariation(ctx: RequestContext, variationId: string, input: ShareVariationRequest) {
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    if (!['public', 'private', 'password'].includes(input.visibility)) {
      throw applicationError(400, 'INVALID_SHARE_VISIBILITY', 'visibility must be public, private, or password.')
    }
    const share = await this.store.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: ctx.userId,
      visibility: input.visibility,
      expiresAt: input.expiresAt ?? null,
    })
    await this.store.createUsageEvent({
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

  async revokeShare(ctx: RequestContext, token: string) {
    const share = await this.store.getShareByToken(token)
    if (!share) throw applicationError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    if (share.ownerId !== ctx.userId) {
      throw applicationError(403, 'SHARE_FORBIDDEN', 'You do not have access to this share link.')
    }
    const revoked = await this.store.revokeShare(token)
    if (!revoked) throw applicationError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    return {
      share: {
        id: revoked.id,
        token: revoked.token,
        revokedAt: revoked.revokedAt!,
      },
    }
  }

  async getVariationPreview(
    ctx: RequestContext,
    variationId: string,
    options: { artifactId?: string | null } = {},
  ): Promise<string> {
    const snapshot = options.artifactId
      ? await this.store.getVariationArtifactContext(variationId, options.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    if (snapshot.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const artifact = snapshot.artifact
    if (!artifact) {
      throw applicationError(404, 'ARTIFACT_NOT_FOUND', 'Variation does not have a preview artifact yet.')
    }
    if (artifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Variation preview can only be read from HTML artifacts.')
    }
    const html = await this.readArtifactText(artifact.storageKey)
    return this.rewriteArtifactAssetUrls(variationId, artifact, html, assetPath =>
      `/api/variations/${encodeURIComponent(variationId)}/assets/${encodeRuntimeAssetPath(assetPath)}${options.artifactId ? `?artifactId=${encodeURIComponent(artifact.id)}` : ''}`)
  }

  async getVariationAsset(
    ctx: RequestContext,
    variationId: string,
    assetPath: string,
    options: { artifactId?: string | null } = {},
  ): Promise<{ contentType: string; body: Uint8Array }> {
    const normalizedPath = normalizeArtifactPath(assetPath)
    const snapshot = options.artifactId
      ? await this.store.getVariationArtifactContext(variationId, options.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    if (snapshot.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const htmlArtifact = snapshot.artifact
    if (!htmlArtifact) throw applicationError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    if (htmlArtifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Variation assets can only be read from HTML artifacts.')
    }
    const asset = await this.store.getVariationAssetArtifact(variationId, htmlArtifact.id, normalizedPath)
    if (!asset) throw applicationError(404, 'ASSET_NOT_FOUND', `Asset not found: ${normalizedPath}`)
    const stored = await this.artifacts.get(asset.storageKey)
    return {
      contentType: stored.contentType || contentTypeForPath(normalizedPath),
      body: stored.body,
    }
  }

  async getVariationScreenshot(
    ctx: RequestContext,
    variationId: string,
    screenshotArtifactId: string,
  ): Promise<{ contentType: string; body: Uint8Array }> {
    const context = await this.store.getVariationArtifactContext(variationId, screenshotArtifactId)
    const variation = context.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    if (context.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const artifact = context.artifact
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${screenshotArtifactId}`)
    if (artifact.kind !== 'screenshot') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Only screenshot artifacts can be read through this endpoint.')
    }
    const stored = await this.artifacts.get(artifact.storageKey)
    return {
      contentType: stored.contentType || 'image/png',
      body: stored.body,
    }
  }

  async getVariationFiles(
    ctx: RequestContext,
    variationId: string,
    options: { artifactId?: string | null } = {},
  ) {
    const snapshot = options.artifactId
      ? await this.store.getVariationArtifactContext(variationId, options.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId)
    if (snapshot.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const htmlArtifact = snapshot.artifact
    if (!htmlArtifact) throw applicationError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    if (htmlArtifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Variation files can only be read from HTML artifacts.')
    }
    const files: Array<{
      path: string
      language: 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text'
      content: string
      artifactId: string
      kind: 'html' | 'asset'
    }> = [{
      path: htmlArtifact.entryPath ?? 'index.html',
      language: languageForPath(htmlArtifact.entryPath ?? 'index.html'),
      content: await this.readArtifactText(htmlArtifact.storageKey),
      artifactId: htmlArtifact.id,
      kind: 'html',
    }]
    const assets = await this.store.getVariationAssetArtifacts(variationId, htmlArtifact.id)
    for (const asset of assets) {
      if (!asset.entryPath || !isCodeFilePath(asset.entryPath)) continue
      files.push({
        path: asset.entryPath,
        language: languageForPath(asset.entryPath),
        content: await this.readArtifactText(asset.storageKey),
        artifactId: asset.id,
        kind: 'asset',
      })
    }
    return {
      artifact: {
        id: htmlArtifact.id,
        version: htmlArtifact.version,
        entryPath: htmlArtifact.entryPath,
        createdAt: htmlArtifact.createdAt,
      },
      files: files.sort((a, b) => fileSortKey(a.path).localeCompare(fileSortKey(b.path))),
    }
  }

  async getSharedVariationAsset(token: string, assetPath: string): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    const normalizedPath = normalizeArtifactPath(assetPath)
    const { share, artifact } = await this.requirePublicShareSnapshot(token)
    const asset = await this.store.getVariationAssetArtifact(share.variationId, artifact.id, normalizedPath)
    if (!asset) throw applicationError(404, 'ASSET_NOT_FOUND', `Asset not found: ${normalizedPath}`)
    const stored = await this.artifacts.get(asset.storageKey)
    return {
      contentType: stored.contentType || contentTypeForPath(normalizedPath),
      body: stored.body,
    }
  }

  async downloadArtifact(ctx: RequestContext, artifactId: string): Promise<{
    filename: string
    contentType: string
    body: Uint8Array
  }> {
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    if (artifact.kind !== 'export_zip') {
      throw applicationError(403, 'ARTIFACT_DOWNLOAD_FORBIDDEN', 'Only export artifacts can be downloaded through this endpoint.')
    }
    if (!artifact.variationId) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISSING', 'Export artifact is not attached to a variation.')
    }
    await this.requireVariationAccess(artifact.variationId, ctx.userId)
    const stored = await this.artifacts.get(artifact.storageKey)
    return {
      filename: artifact.entryPath ?? `${artifact.id}.zip`,
      contentType: stored.contentType || 'application/zip',
      body: stored.body,
    }
  }

  async getSharedVariation(token: string) {
    const { share, variation, artifact } = await this.requirePublicShareSnapshot(token)
    const html = await this.readArtifactText(artifact.storageKey)
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

  private async requireCurrentVariationArtifact(variationId: string) {
    const snapshot = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    if (!snapshot.artifactId) throw applicationError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const artifact = snapshot.artifact
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${snapshot.artifactId}`)
    if (snapshot.mismatch) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (artifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Variation export and share require an HTML artifact.')
    }
    return { variation, artifact }
  }

  private async enqueueScreenshotJob(input: {
    artifact: Artifact
    variation: DesignVariation
    reason: Extract<ScreenshotJobQueuePayload['reason'], 'repair_requested' | 'restore_requested'>
  }) {
    const job = await this.store.getJobById(input.variation.jobId)
    return this.queue.enqueueScreenshotJob({
      jobId: input.variation.jobId,
      sessionId: input.artifact.sessionId,
      variationId: input.variation.id,
      artifactId: input.artifact.id,
      idempotencyKey: screenshotQueueIdempotencyKey(input.artifact.id, input.reason),
      userId: job?.userId ?? this.store.devUser.id,
      workspaceId: input.artifact.workspaceId,
      source: 'repair',
      reason: input.reason,
      createdAt: new Date().toISOString(),
    })
  }

  private async createExportZipArtifact(input: {
    variationId: string
    sourceArtifact: Artifact
    filename: string
    html: string
  }): Promise<Artifact> {
    const assets = await this.store.getVariationAssetArtifacts(input.variationId, input.sourceArtifact.id)
    const files: Array<{ path: string; body: Uint8Array | string }> = [{
      path: input.sourceArtifact.entryPath ?? 'index.html',
      body: input.html,
    }]
    for (const asset of assets) {
      if (!asset.entryPath) continue
      const stored = await this.artifacts.get(asset.storageKey)
      files.push({ path: asset.entryPath, body: stored.body })
    }
    const manifest = {
      kind: 'dudesign.export',
      variationId: input.variationId,
      sourceArtifactId: input.sourceArtifact.id,
      sourceVersion: input.sourceArtifact.version,
      files: files.map(file => file.path),
      exportedAt: new Date().toISOString(),
    }
    const body = createZipArchive([
      ...files,
      { path: 'dudesign-export.json', body: JSON.stringify(manifest, null, 2) },
    ])
    const exportArtifactId = `export_${input.sourceArtifact.id}`
    const stored = await this.artifacts.put({
      workspaceId: input.sourceArtifact.workspaceId,
      artifactId: exportArtifactId,
      relativePath: input.filename,
      contentType: 'application/zip',
      body,
      metadata: {
        kind: 'export_zip',
        sourceArtifactId: input.sourceArtifact.id,
        variationId: input.variationId,
        files: manifest.files.join('\n'),
      },
    })
    return this.store.createArtifact({
      workspaceId: input.sourceArtifact.workspaceId,
      sessionId: input.sourceArtifact.sessionId,
      variationId: input.variationId,
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

  private async requireVariationAccess(
    variationId: string,
    userId: string,
    minRole: WorkspaceMemberRole = 'viewer',
  ): Promise<void> {
    const variation = await this.store.getVariationById(variationId)
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const job = await this.store.getJobById(variation.jobId)
    if (!job) throw applicationError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    const workspace = await this.store.getWorkspaceById(job.workspaceId)
    if (!workspace) throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    const member = await this.store.getWorkspaceMember(job.workspaceId, userId)
    const effectiveRole = member?.status === 'active'
      ? member.role
      : workspace.ownerId === userId
        ? 'owner'
        : null
    if (!effectiveRole || !roleAllows(effectiveRole, minRole)) {
      throw applicationError(403, 'JOB_FORBIDDEN', 'You do not have access to this design job.')
    }
  }

  private async requirePublicShareSnapshot(token: string) {
    const snapshot = await this.store.getSharedVariationSnapshot(token)
    if (!snapshot) throw applicationError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    const { share, variation, artifact } = snapshot
    if (share.revokedAt) throw applicationError(410, 'SHARE_REVOKED', 'This share link has been revoked.')
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      throw applicationError(410, 'SHARE_EXPIRED', 'This share link has expired.')
    }
    if (share.visibility !== 'public') {
      throw applicationError(403, 'SHARE_FORBIDDEN', `${share.visibility} share links require authenticated access in MVP.`)
    }
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${share.variationId}`)
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${share.artifactId}`)
    return { share, variation, artifact }
  }

  private async readArtifactText(storageKey: string): Promise<string> {
    const stored = await this.artifacts.get(storageKey)
    return new TextDecoder().decode(stored.body)
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
      return resolved && assetPaths.has(resolved) ? toAssetUrl(resolved) : value
    })
  }
}

const WORKSPACE_ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

function roleAllows(actual: WorkspaceMemberRole, required: WorkspaceMemberRole): boolean {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required]
}

function normalizeArtifactPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw applicationError(400, 'RUNTIME_ARTIFACT_INVALID_PATH', `Invalid runtime artifact path: ${path}`)
  }
  if (normalized.split('/').some(part => part === '..' || part === '')) {
    throw applicationError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
  }
  const clean = posix.normalize(normalized)
  if (clean === '.' || clean.startsWith('../') || clean === '..' || posix.isAbsolute(clean)) {
    throw applicationError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
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

function languageForPath(path: string): 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text' {
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

function fileSortKey(path: string): string {
  return path === 'index.html' ? `0:${path}` : `1:${path}`
}

function isCodeFilePath(path: string): boolean {
  return /\.(html?|css|m?js|tsx?|json|txt|md)$/i.test(path)
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
  try {
    return normalizeArtifactPath(baseDir ? `${baseDir}/${pathOnly}` : pathOnly)
  } catch {
    return null
  }
}

function encodeRuntimeAssetPath(path: string): string {
  return path.split('/').map(part => encodeURIComponent(part)).join('/')
}

function screenshotQueueIdempotencyKey(
  artifactId: string,
  reason: Extract<ScreenshotJobQueuePayload['reason'], 'repair_requested' | 'restore_requested'>,
): string {
  if (reason === 'repair_requested') return `queue:screenshot:${reason}:${artifactId}:${createId('repair')}`
  return `queue:screenshot:${reason}:${artifactId}`
}

function screenshotUrlForArtifactId(artifactId: string | null, variationId: string): string | null {
  return artifactId
    ? `/api/variations/${encodeURIComponent(variationId)}/screenshots/${encodeURIComponent(artifactId)}`
    : null
}

function artifactQualitySummary(value: unknown): {
  status: 'pass' | 'warn' | 'fail'
  issues: string[]
  specFindings?: unknown[]
} | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.status !== 'pass' && record.status !== 'warn' && record.status !== 'fail') return null
  if (!Array.isArray(record.issues) || !record.issues.every(issue => typeof issue === 'string')) return null
  return {
    status: record.status,
    issues: record.issues,
    ...(Array.isArray(record.specFindings) ? { specFindings: record.specFindings } : {}),
  }
}

function createZipArchive(files: Array<{ path: string; body: Uint8Array | string }>): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const path = normalizeArtifactPath(file.path)
    const name = encoder.encode(path)
    const body = typeof file.body === 'string' ? encoder.encode(file.body) : file.body
    const crc = crc32(body)
    const localHeader = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.byteLength), u32(body.byteLength), u16(name.byteLength), u16(0), name,
    ])
    localParts.push(localHeader, body)
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.byteLength), u32(body.byteLength), u16(name.byteLength),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]))
    offset += localHeader.byteLength + body.byteLength
  }
  const centralDirectory = concatBytes(centralParts)
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDirectory.byteLength), u32(offset), u16(0),
  ])
  return concatBytes([...localParts, centralDirectory, end])
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  new DataView(out.buffer).setUint16(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value >>> 0, true)
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
