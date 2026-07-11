import type { ArtifactStore } from '@dudesign/artifact-store'
import type { Artifact } from '@dudesign/domain'
import type { RequestContext } from '../auth.js'
import type { DesignJobQueue } from '../designJobQueue.js'
import { createId } from '../id.js'
import type { ApplicationRepository } from '../repository.js'
import { createArtifactExportZip, enqueueArtifactScreenshotJob } from './artifactOperations.js'

export class AdminArtifactGovernanceService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly artifacts: ArtifactStore,
    private readonly queue: DesignJobQueue,
  ) {}

  async rebuildScreenshot(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx)
    const artifact = await this.requireArtifact(artifactId)
    if (artifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Screenshot rebuild requires an HTML artifact.')
    }
    if (!artifact.variationId) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISSING', 'Artifact is not attached to a variation.')
    }
    const variation = await this.store.getVariationById(artifact.variationId)
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${artifact.variationId}`)
    const queueJob = await enqueueArtifactScreenshotJob({
      store: this.store,
      queue: this.queue,
      artifact,
      variation,
      reason: 'repair_requested',
    })
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.screenshot_rebuild',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: artifact.variationId,
        queueJobIdempotencyKey: queueJob.idempotencyKey,
        queueJobStatus: queueJob.status,
      },
    })
    const screenshotUrl = screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id)
    return {
      artifact: { id: artifact.id, version: artifact.version, screenshotUrl },
      queueJob: {
        idempotencyKey: queueJob.idempotencyKey,
        kind: queueJob.kind,
        status: queueJob.status,
      },
      variation: { id: variation.id, screenshotUrl },
      audit,
    }
  }

  async repairExport(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx)
    const artifact = await this.requireArtifact(artifactId)
    const sourceArtifact = await this.resolveExportSourceArtifact(artifact)
    if (!sourceArtifact.variationId) {
      throw applicationError(400, 'ARTIFACT_VARIATION_MISSING', 'Export repair source is not attached to a variation.')
    }
    const variation = await this.store.getVariationById(sourceArtifact.variationId)
    if (!variation) throw applicationError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${sourceArtifact.variationId}`)
    const html = new TextDecoder().decode((await this.artifacts.get(sourceArtifact.storageKey)).body)
    const filename = `${variation.title ?? variation.id}-v${sourceArtifact.version}.zip`
      .replaceAll(/\s+/g, '-')
      .toLowerCase()
    const exportArtifact = await createArtifactExportZip({
      store: this.store,
      artifacts: this.artifacts,
      variationId: variation.id,
      sourceArtifact,
      filename,
      html,
      reuseKey: createId('repair_export'),
    })
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.export_repair',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: variation.id,
        sourceArtifactId: sourceArtifact.id,
        exportArtifactId: exportArtifact.id,
        repairedFromKind: artifact.kind,
      },
    })
    return {
      sourceArtifact: { id: sourceArtifact.id, version: sourceArtifact.version },
      exportArtifact: {
        id: exportArtifact.id,
        kind: 'export_zip',
        filename: exportArtifact.entryPath ?? filename,
        sizeBytes: exportArtifact.sizeBytes,
        contentHash: exportArtifact.contentHash,
        downloadUrl: `/api/artifacts/${encodeURIComponent(exportArtifact.id)}/download`,
        files: Array.isArray(exportArtifact.metadata.files) ? exportArtifact.metadata.files as string[] : [],
      },
      audit,
    }
  }

  async revokeShares(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx)
    const artifact = await this.requireArtifact(artifactId)
    const shares = await this.store.listSharesForArtifact(artifact.id)
    const revoked = []
    for (const share of shares.filter(share => !share.revokedAt)) {
      const next = await this.store.revokeShare(share.token)
      if (next) revoked.push(next)
    }
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.shares_revoke',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: artifact.variationId,
        revokedCount: revoked.length,
        totalShareCount: shares.length,
      },
    })
    return {
      artifact: { id: artifact.id, shareCount: shares.length },
      revokedShares: revoked.map(share => ({
        id: share.id,
        token: share.token,
        revokedAt: share.revokedAt!,
      })),
      revokedCount: revoked.length,
      audit,
    }
  }

  private async requireAdminRole(ctx: RequestContext): Promise<void> {
    if (!ctx.userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const user = await this.store.getUserById(ctx.userId)
    if (!user) throw applicationError(401, 'UNAUTHENTICATED', `Unknown user: ${ctx.userId}`)
    if (user.status !== 'active') throw applicationError(403, 'USER_DISABLED', `User disabled: ${ctx.userId}`)
    if (ctx.adminRole !== 'operator' && ctx.adminRole !== 'developer') {
      throw applicationError(403, 'ADMIN_FORBIDDEN', 'This admin action requires a higher role.')
    }
  }

  private async requireArtifact(artifactId: string): Promise<Artifact> {
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    return artifact
  }

  private async resolveExportSourceArtifact(artifact: Artifact): Promise<Artifact> {
    if (artifact.kind === 'html') return artifact
    if (artifact.kind !== 'export_zip') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Export repair requires an HTML or export artifact.')
    }
    const sourceArtifactId = typeof artifact.metadata.sourceArtifactId === 'string'
      ? artifact.metadata.sourceArtifactId
      : artifact.parentArtifactId
    if (!sourceArtifactId) {
      throw applicationError(400, 'EXPORT_SOURCE_ARTIFACT_MISSING', 'Export artifact does not record its source HTML artifact.')
    }
    const sourceArtifact = await this.store.getArtifactById(sourceArtifactId)
    if (!sourceArtifact) throw applicationError(404, 'ARTIFACT_NOT_FOUND', `Source artifact not found: ${sourceArtifactId}`)
    if (sourceArtifact.kind !== 'html') {
      throw applicationError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Export source artifact must be HTML.')
    }
    return sourceArtifact
  }
}

function screenshotUrlForArtifactId(artifactId: string | null, variationId: string): string | null {
  return artifactId
    ? `/api/variations/${encodeURIComponent(variationId)}/screenshots/${encodeURIComponent(artifactId)}`
    : null
}

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
