import type { ArtifactStore } from '@dudesign/artifact-store'
import type { Artifact, WorkspaceMemberRole } from '@dudesign/domain'
import { posix } from 'node:path'
import type { RequestContext } from '../auth.js'
import type { ApplicationRepository } from '../repository.js'

export class ArtifactApplicationService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly artifacts: ArtifactStore,
  ) {}

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
