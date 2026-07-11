import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LocalArtifactStore } from '@dudesign/artifact-store'
import { InMemoryDesignJobQueue } from '../designJobQueue.js'
import { InMemoryStore } from '../store.js'
import { AdminArtifactGovernanceService } from './adminArtifactGovernanceService.js'

describe('AdminArtifactGovernanceService', () => {
  let rootDir: string
  let store: InMemoryStore
  let artifacts: LocalArtifactStore
  let queue: InMemoryDesignJobQueue
  let service: AdminArtifactGovernanceService

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'dudesign-admin-artifact-'))
    store = new InMemoryStore()
    artifacts = new LocalArtifactStore({ rootDir })
    queue = new InMemoryDesignJobQueue()
    service = new AdminArtifactGovernanceService(store, artifacts, queue)
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it('queues screenshot rebuilds and records an operator audit', async () => {
    const fixture = await createFixture(store, artifacts)
    const result = await service.rebuildScreenshot(operatorContext(store), fixture.html.id, {
      reason: 'blank screenshot',
    })

    assert.equal(result.queueJob.kind, 'screenshot_job')
    assert.equal(result.queueJob.status, 'queued')
    assert.match(result.queueJob.idempotencyKey, /^queue:screenshot:repair_requested:/)
    assert.equal(result.audit.action, 'artifact.screenshot_rebuild')
    assert.equal(result.audit.reason, 'blank screenshot')
  })

  it('repairs exports from HTML or an existing export and preserves source assets', async () => {
    const fixture = await createFixture(store, artifacts)
    const first = await service.repairExport(operatorContext(store), fixture.html.id, {
      reason: 'rebuild package',
    })
    const second = await service.repairExport(operatorContext(store), first.exportArtifact.id)

    assert.equal(first.exportArtifact.kind, 'export_zip')
    assert.deepEqual(first.exportArtifact.files, ['index.html', 'assets/site.css'])
    assert.notEqual(second.exportArtifact.id, first.exportArtifact.id)
    assert.equal(second.sourceArtifact.id, fixture.html.id)
    assert.equal(first.audit.action, 'artifact.export_repair')
  })

  it('revokes every active share for an artifact and rejects support role writes', async () => {
    const fixture = await createFixture(store, artifacts)
    const first = await store.createShare({
      artifactId: fixture.html.id,
      variationId: fixture.variation.id,
      ownerId: store.devUser.id,
      visibility: 'public',
    })
    await store.createShare({
      artifactId: fixture.html.id,
      variationId: fixture.variation.id,
      ownerId: store.devUser.id,
      visibility: 'public',
    })

    await assert.rejects(
      () => service.revokeShares({
        requestId: 'req_support',
        userId: store.devUser.id,
        adminRole: 'support',
      }, fixture.html.id),
      error => hasErrorCode(error, 403, 'ADMIN_FORBIDDEN'),
    )

    const result = await service.revokeShares(operatorContext(store), fixture.html.id, {
      reason: 'policy action',
    })
    const firstSnapshot = await store.getSharedVariationSnapshot(first.token)

    assert.equal(result.revokedCount, 2)
    assert.equal(result.audit.action, 'artifact.shares_revoke')
    assert.ok(firstSnapshot?.share.revokedAt)
  })
})

async function createFixture(store: InMemoryStore, artifacts: LocalArtifactStore) {
  const session = await store.createSession({
    userId: store.devUser.id,
    workspaceId: store.devWorkspace.id,
    mode: 'new_html',
    title: 'Admin artifact fixture',
  })
  const job = await store.createJob({
    session,
    prompt: 'Admin artifact fixture',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const [variation] = await store.createVariations({ job, count: 1 })
  assert.ok(variation)
  const htmlStored = await artifacts.put({
    workspaceId: job.workspaceId,
    artifactId: 'admin_html',
    relativePath: 'v1/index.html',
    contentType: 'text/html; charset=utf-8',
    body: '<link href="assets/site.css"><h1>Admin artifact</h1>',
  })
  const html = await store.createArtifact({
    workspaceId: job.workspaceId,
    sessionId: session.id,
    variationId: variation.id,
    kind: 'html',
    version: 1,
    storageKey: htmlStored.storageKey,
    entryPath: 'index.html',
    contentHash: htmlStored.contentHash,
    sizeBytes: htmlStored.sizeBytes,
  })
  const cssStored = await artifacts.put({
    workspaceId: job.workspaceId,
    artifactId: 'admin_css',
    relativePath: 'v1/assets/site.css',
    contentType: 'text/css; charset=utf-8',
    body: 'body { color: purple; }',
  })
  await store.createArtifact({
    workspaceId: job.workspaceId,
    sessionId: session.id,
    variationId: variation.id,
    parentArtifactId: html.id,
    kind: 'asset',
    version: 1,
    storageKey: cssStored.storageKey,
    entryPath: 'assets/site.css',
    contentHash: cssStored.contentHash,
    sizeBytes: cssStored.sizeBytes,
  })
  await store.setVariationCurrentArtifact(variation.id, html.id, `/api/variations/${variation.id}/preview`)
  return { session, job, variation, html }
}

function operatorContext(store: InMemoryStore) {
  return {
    requestId: 'req_admin_artifact',
    userId: store.devUser.id,
    adminRole: 'operator' as const,
  }
}

function hasErrorCode(error: unknown, status: number, code: string): boolean {
  return error instanceof Error
    && (error as Error & { status?: number }).status === status
    && (error as Error & { code?: string }).code === code
}
