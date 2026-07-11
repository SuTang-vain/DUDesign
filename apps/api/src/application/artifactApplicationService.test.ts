import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import type { Artifact } from '@dudesign/domain'
import type { RequestContext } from '../auth.js'
import { InMemoryStore } from '../store.js'
import { ArtifactApplicationService } from './artifactApplicationService.js'
import { InMemoryDesignJobQueue } from '../designJobQueue.js'

describe('ArtifactApplicationService', () => {
  let rootDir: string
  let store: InMemoryStore
  let artifacts: LocalArtifactStore
  let service: ArtifactApplicationService
  let queue: InMemoryDesignJobQueue

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'dudesign-artifact-service-'))
    store = new InMemoryStore()
    artifacts = new LocalArtifactStore({ rootDir })
    queue = new InMemoryDesignJobQueue()
    service = new ArtifactApplicationService(store, artifacts, queue)
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('reads a selected historical version and rewrites only its asset URLs', async () => {
    const fixture = await createVariationFixture(store)
    const v1 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 1,
      html: '<link href="assets/site.css"><h1>Version one</h1>',
      assetPath: 'assets/site.css',
      assetBody: 'body { color: red; }',
    })
    const v2 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 2,
      html: '<link href="assets/site.css"><h1>Version two</h1>',
      assetPath: 'assets/site.css',
      assetBody: 'body { color: blue; }',
    })
    await store.setVariationCurrentArtifact(fixture.variation.id, v2.html.id, `/api/variations/${fixture.variation.id}/preview`)

    const preview = await service.getVariationPreview(ownerContext(store), fixture.variation.id, {
      artifactId: v1.html.id,
    })
    const css = await service.getVariationAsset(ownerContext(store), fixture.variation.id, 'assets/site.css', {
      artifactId: v1.html.id,
    })
    const files = await service.getVariationFiles(ownerContext(store), fixture.variation.id, {
      artifactId: v1.html.id,
    })

    assert.match(preview, /Version one/)
    assert.doesNotMatch(preview, /Version two/)
    assert.match(preview, new RegExp(`artifactId=${encodeURIComponent(v1.html.id)}`))
    assert.equal(new TextDecoder().decode(css.body), 'body { color: red; }')
    assert.deepEqual(files.files.map(file => [file.path, file.content]), [
      ['index.html', '<link href="assets/site.css"><h1>Version one</h1>'],
      ['assets/site.css', 'body { color: red; }'],
    ])
  })

  it('keeps a public share pinned to the artifact selected when the share was created', async () => {
    const fixture = await createVariationFixture(store)
    const v1 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 1,
      html: '<img src="assets/hero.svg"><h1>Shared version one</h1>',
      assetPath: 'assets/hero.svg',
      assetBody: '<svg>one</svg>',
    })
    const share = await store.createShare({
      artifactId: v1.html.id,
      variationId: fixture.variation.id,
      ownerId: store.devUser.id,
      visibility: 'public',
    })
    const v2 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 2,
      html: '<h1>Current version two</h1>',
    })
    await store.setVariationCurrentArtifact(fixture.variation.id, v2.html.id, `/api/variations/${fixture.variation.id}/preview`)

    const shared = await service.getSharedVariation(share.token)
    const sharedAsset = await service.getSharedVariationAsset(share.token, 'assets/hero.svg')

    assert.equal(shared.artifact.id, v1.html.id)
    assert.equal(shared.artifact.version, 1)
    assert.match(shared.artifact.html, /Shared version one/)
    assert.doesNotMatch(shared.artifact.html, /Current version two/)
    assert.match(shared.artifact.html, new RegExp(`/api/shares/${share.token}/assets/assets/hero.svg`))
    assert.equal(new TextDecoder().decode(sharedAsset.body), '<svg>one</svg>')
  })

  it('rejects private artifact reads from a user outside the workspace', async () => {
    const fixture = await createVariationFixture(store)
    const v1 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 1,
      html: '<h1>Private version</h1>',
    })
    await store.setVariationCurrentArtifact(fixture.variation.id, v1.html.id, `/api/variations/${fixture.variation.id}/preview`)
    const outsider = await store.createUserWithWorkspace({ email: 'outsider@example.com' })

    await assert.rejects(
      () => service.getVariationPreview(requestContext(outsider.user.id), fixture.variation.id),
      error => hasErrorCode(error, 403, 'JOB_FORBIDDEN'),
    )
  })

  it('allows only attached export zip artifacts through the download boundary', async () => {
    const fixture = await createVariationFixture(store)
    const exportArtifact = await createStoredArtifact({
      store,
      artifacts,
      fixture,
      artifactId: 'export_fixture',
      kind: 'export_zip',
      version: 1,
      relativePath: 'exports/design.zip',
      entryPath: 'design.zip',
      contentType: 'application/zip',
      body: new Uint8Array([1, 2, 3]),
    })
    const downloaded = await service.downloadArtifact(ownerContext(store), exportArtifact.id)

    assert.equal(downloaded.filename, 'design.zip')
    assert.equal(downloaded.contentType, 'application/zip')
    assert.deepEqual([...downloaded.body], [1, 2, 3])
  })

  it('restores and repairs HTML versions through screenshot queue commands', async () => {
    const fixture = await createVariationFixture(store)
    const v1 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 1,
      html: '<h1>Version one</h1>',
    })
    const v2 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 2,
      html: '<h1>Version two</h1>',
    })
    await store.setVariationCurrentArtifact(fixture.variation.id, v2.html.id, `/api/variations/${fixture.variation.id}/preview`)

    const restored = await service.restoreVariationVersion(ownerContext(store), fixture.variation.id, v1.html.id)
    const restoreQueue = await queue.getJobState(`queue:screenshot:restore_requested:${v1.html.id}`)
    const repaired = await service.repairVariationPreview(ownerContext(store), fixture.variation.id)
    const session = await store.getSessionSnapshot(fixture.session.id)

    assert.equal(restored.variation.currentArtifactId, v1.html.id)
    assert.equal(restoreQueue?.status, 'queued')
    assert.equal(repaired.artifact.id, v1.html.id)
    assert.equal(repaired.queueJob.status, 'queued')
    assert.match(repaired.queueJob.idempotencyKey, new RegExp(`^queue:screenshot:repair_requested:${v1.html.id}:repair_`))
    assert.deepEqual(
      session?.messages.slice(-2).map(message => message.metadata.kind),
      ['variation_restore', 'variation_preview_repair'],
    )
  })

  it('creates reusable exports and artifact-pinned shares with usage records', async () => {
    const fixture = await createVariationFixture(store)
    const v1 = await createHtmlVersion({
      store,
      artifacts,
      fixture,
      version: 1,
      html: '<link href="assets/site.css"><h1>Export me</h1>',
      assetPath: 'assets/site.css',
      assetBody: 'body { color: green; }',
    })
    await store.setVariationCurrentArtifact(fixture.variation.id, v1.html.id, `/api/variations/${fixture.variation.id}/preview`)

    const firstExport = await service.exportVariation(ownerContext(store), fixture.variation.id)
    const secondExport = await service.exportVariation(ownerContext(store), fixture.variation.id)
    const shared = await service.shareVariation(ownerContext(store), fixture.variation.id, { visibility: 'public' })
    const shareSnapshot = await store.getSharedVariationSnapshot(shared.share.token)
    const revoked = await service.revokeShare(ownerContext(store), shared.share.token)
    const usageKinds = store.listUsageEvents({ variationId: fixture.variation.id }).map(event => event.kind)

    assert.equal(firstExport.exportArtifact.reused, false)
    assert.equal(secondExport.exportArtifact.id, firstExport.exportArtifact.id)
    assert.equal(secondExport.exportArtifact.reused, true)
    assert.deepEqual(firstExport.exportArtifact.files, ['index.html', 'assets/site.css'])
    assert.equal(shareSnapshot?.artifact?.id, v1.html.id)
    assert.ok(revoked.share.revokedAt)
    assert.deepEqual([...usageKinds].sort(), ['export.created', 'share.created'])
  })
})

async function createVariationFixture(store: InMemoryStore) {
  const session = await store.createSession({
    userId: store.devUser.id,
    workspaceId: store.devWorkspace.id,
    mode: 'new_html',
    title: 'Artifact service fixture',
  })
  const job = await store.createJob({
    session,
    prompt: 'Artifact service fixture',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const [variation] = await store.createVariations({ job, count: 1 })
  assert.ok(variation)
  return { session, job, variation }
}

async function createHtmlVersion(input: {
  store: InMemoryStore
  artifacts: LocalArtifactStore
  fixture: Awaited<ReturnType<typeof createVariationFixture>>
  version: number
  html: string
  assetPath?: string
  assetBody?: string
}) {
  const html = await createStoredArtifact({
    store: input.store,
    artifacts: input.artifacts,
    fixture: input.fixture,
    artifactId: `html_v${input.version}`,
    kind: 'html',
    version: input.version,
    relativePath: `v${input.version}/index.html`,
    entryPath: 'index.html',
    contentType: 'text/html; charset=utf-8',
    body: input.html,
  })
  let asset: Artifact | null = null
  if (input.assetPath && input.assetBody !== undefined) {
    asset = await createStoredArtifact({
      store: input.store,
      artifacts: input.artifacts,
      fixture: input.fixture,
      artifactId: `asset_v${input.version}`,
      kind: 'asset',
      version: input.version,
      relativePath: `v${input.version}/${input.assetPath}`,
      entryPath: input.assetPath,
      contentType: input.assetPath.endsWith('.css') ? 'text/css; charset=utf-8' : 'image/svg+xml',
      body: input.assetBody,
      parentArtifactId: html.id,
    })
  }
  return { html, asset }
}

async function createStoredArtifact(input: {
  store: InMemoryStore
  artifacts: LocalArtifactStore
  fixture: Awaited<ReturnType<typeof createVariationFixture>>
  artifactId: string
  kind: Artifact['kind']
  version: number
  relativePath: string
  entryPath: string
  contentType: string
  body: Uint8Array | string
  parentArtifactId?: string | null
}): Promise<Artifact> {
  const stored = await input.artifacts.put({
    workspaceId: input.fixture.job.workspaceId,
    artifactId: input.artifactId,
    relativePath: input.relativePath,
    contentType: input.contentType,
    body: input.body,
  })
  return input.store.createArtifact({
    workspaceId: input.fixture.job.workspaceId,
    sessionId: input.fixture.session.id,
    variationId: input.fixture.variation.id,
    parentArtifactId: input.parentArtifactId ?? null,
    kind: input.kind,
    version: input.version,
    storageKey: stored.storageKey,
    entryPath: input.entryPath,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
  })
}

function ownerContext(store: InMemoryStore): RequestContext {
  return requestContext(store.devUser.id)
}

function requestContext(userId: string): RequestContext {
  return {
    requestId: 'req_artifact_service_test',
    userId,
    adminRole: null,
  }
}

function hasErrorCode(error: unknown, status: number, code: string): boolean {
  return error instanceof Error
    && (error as Error & { status?: number }).status === status
    && (error as Error & { code?: string }).code === code
}
