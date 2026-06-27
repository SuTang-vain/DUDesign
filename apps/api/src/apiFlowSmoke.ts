import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type {
  CreateAnnotationBatchResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  ExportVariationResponse,
  RefineVariationResponse,
  SharedVariationResponse,
  ShareVariationResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'
import type { Artifact } from '@dudesign/domain'
import { ApplicationService } from './service.js'
import { createApiServer } from './server.js'

type JobSnapshot = {
  job: { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' }
  variations: Array<{ id: string; status: string }>
  artifacts: unknown[]
}

export type ApiFlowHarness = {
  service: ApplicationService
  baseUrl: string
  close(): Promise<void>
}

export async function startApiFlowHarness(service: ApplicationService): Promise<ApiFlowHarness> {
  const server = createApiServer(service)
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    service,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error)
        else resolve()
      })
    }),
  }
}

export async function runApiFlowSmoke(harness: ApiFlowHarness): Promise<void> {
  const { baseUrl } = harness

  async function waitForJob(jobId: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, init)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  async function getText(path: string): Promise<string> {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.text()
  }

  async function postJson<T>(path: string, body: unknown, init?: Omit<RequestInit, 'body' | 'method'>): Promise<T> {
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    assert.equal(response.ok, true, `${path} failed with ${response.status}`)
    return response.json() as Promise<T>
  }

  const bootstrapResponse = await fetch(`${baseUrl}/api/dev/bootstrap`, {
    headers: { 'x-request-id': 'req_test_smoke' },
  })
  assert.equal(bootstrapResponse.headers.get('x-request-id'), 'req_test_smoke')
  assert.equal(bootstrapResponse.ok, true)
  const bootstrap = await bootstrapResponse.json() as { workspace: { id: string } }
  assert.equal(bootstrap.workspace.id, 'ws_dev')

  const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'new_html',
    title: 'Smoke session',
  })
  assert.ok(createdSession.session.id.startsWith('ses_'))

  const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: 'A landing page for a freelancer invoicing app',
    sourceMode: 'new_html',
    variationCount: 3,
    templateRequirements: {
      styles: ['minimal', 'editorial'],
      deviceTargets: ['desktop', 'mobile'],
    },
  })
  assert.equal(createdJob.variations.length, 3)

  const jobSnapshot = await waitForJob(createdJob.job.id)
  assert.equal(jobSnapshot.job.status, 'completed')
  assert.equal(jobSnapshot.variations.length, 3)
  assert.ok(jobSnapshot.variations.every(variation => variation.status === 'completed'))
  assert.equal(jobSnapshot.artifacts.length, 3)

  const sseReplay = await getText(`/api/design-jobs/${createdJob.job.id}/stream`)
  assert.match(sseReplay, /event: design\.variation_streaming/)
  assert.match(sseReplay, /event: design\.job_completed/)

  const variationId = jobSnapshot.variations[0]!.id
  const beforeRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(beforeRefine.currentArtifact?.version, 1)

  const refined = await postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
    prompt: 'Make the hero more confident and improve mobile spacing.',
    baseArtifactId: beforeRefine.currentArtifact!.id,
    deviceContext: 'mobile',
  })
  assert.ok(refined.artifact)
  assert.equal(refined.artifact.version, 2)

  const afterRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(afterRefine.currentArtifact?.version, 2)
  assert.deepEqual(afterRefine.artifacts.map(artifact => artifact.version), [2, 1])

  const annotated = await postJson<CreateAnnotationBatchResponse>(`/api/variations/${variationId}/annotations`, {
    artifactId: afterRefine.currentArtifact!.id,
    prompt: 'Apply this marked layout change.',
    shapes: [
      {
        type: 'rect',
        x: 0.12,
        y: 0.18,
        w: 0.32,
        h: 0.24,
        note: 'Give this area more breathing room.',
      },
    ],
  })
  assert.equal(annotated.annotationBatch.shapeCount, 1)
  assert.match(annotated.annotationBatch.promptSuffix, /rectangle at x=0\.120/)
  assert.equal(annotated.artifact?.version, 3)
  await attachAssetBackedHtml(harness, variationId, annotated.artifact!.id)

  const preview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(preview, /version 3/)
  assert.match(preview, /iframe-ready HTML/)
  assert.match(preview, /\/api\/variations\/var_.*\/assets\/styles\/share-preview\.css/)
  assert.match(preview, /\/api\/variations\/var_.*\/assets\/images\/mark\.svg/)
  const variationCss = await fetch(`${baseUrl}/api/variations/${variationId}/assets/styles/share-preview.css`)
  assert.equal(variationCss.ok, true)
  assert.equal(variationCss.headers.get('content-type'), 'text/css; charset=utf-8')
  assert.match(await variationCss.text(), /--share-accent/)

  const exported = await postJson<ExportVariationResponse>(`/api/variations/${variationId}/export`, {})
  assert.equal(exported.artifact.version, 3)
  assert.match(exported.artifact.filename, /variation-01-v3\.html/)
  assert.match(exported.artifact.html, /version 3/)
  assert.equal(exported.exportArtifact?.kind, 'export_zip')
  assert.match(exported.exportArtifact?.filename ?? '', /variation-01-v3\.zip/)
  assert.match(exported.exportArtifact?.contentHash ?? '', /^sha256:/)
  assert.deepEqual(exported.exportArtifact?.files, ['index.html', 'images/mark.svg', 'styles/share-preview.css'])
  assert.equal(exported.exportArtifact?.downloadUrl, `/api/artifacts/${exported.exportArtifact?.id}/download`)
  const exportZip = await fetch(`${baseUrl}${exported.exportArtifact!.downloadUrl}`)
  assert.equal(exportZip.ok, true)
  assert.equal(exportZip.headers.get('content-type'), 'application/zip')
  assert.match(exportZip.headers.get('content-disposition') ?? '', /variation-01-v3\.zip/)
  assert.deepEqual(listZipEntries(new Uint8Array(await exportZip.arrayBuffer())), [
    'index.html',
    'images/mark.svg',
    'styles/share-preview.css',
    'dudesign-export.json',
  ])

  const shared = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  })
  assert.ok(shared.share.token.startsWith('share_'))
  assert.match(shared.share.url, /^\/share\/share_/)

  const shareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(shareDetail.variation.id, variationId)
  assert.equal(shareDetail.artifact.version, 3)
  assert.match(shareDetail.artifact.html ?? '', /version 3/)
  assert.ok((shareDetail.artifact.html ?? '').includes(`/api/shares/${shared.share.token}/assets/styles/share-preview.css`))
  assert.ok((shareDetail.artifact.html ?? '').includes(`/api/shares/${shared.share.token}/assets/images/mark.svg`))
  const shareCss = await fetch(`${baseUrl}/api/shares/${shared.share.token}/assets/styles/share-preview.css`)
  assert.equal(shareCss.ok, true)
  assert.equal(shareCss.headers.get('cache-control'), 'public, max-age=300')
  assert.match(await shareCss.text(), /--share-accent/)

  const driftRefined = await postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
    prompt: 'Create a later edit that should not change the existing share.',
    baseArtifactId: shareDetail.artifact.id,
    deviceContext: 'desktop',
  })
  assert.equal(driftRefined.artifact?.version, 4)
  const driftPreview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(driftPreview, /version 4/)
  const stableShareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(stableShareDetail.artifact.id, shareDetail.artifact.id)
  assert.equal(stableShareDetail.artifact.version, 3)
  assert.match(stableShareDetail.artifact.html ?? '', /version 3/)
  assert.doesNotMatch(stableShareDetail.artifact.html ?? '', /version 4/)

  const expiredShare = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
    expiresAt: '2000-01-01T00:00:00.000Z',
  })
  const expiredResponse = await fetch(`${baseUrl}/api/shares/${expiredShare.share.token}`)
  assert.equal(expiredResponse.status, 410)
  const expiredPayload = await expiredResponse.json() as { error: { code: string } }
  assert.equal(expiredPayload.error.code, 'SHARE_EXPIRED')

  for (const visibility of ['private', 'password'] as const) {
    const restrictedShare = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
      visibility,
    })
    const restrictedResponse = await fetch(`${baseUrl}/api/shares/${restrictedShare.share.token}`)
    assert.equal(restrictedResponse.status, 403)
    const restrictedPayload = await restrictedResponse.json() as { error: { code: string } }
    assert.equal(restrictedPayload.error.code, 'SHARE_FORBIDDEN')
  }

  const shareToRevoke = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  })
  const revokeForbidden = await fetch(`${baseUrl}/api/shares/${shareToRevoke.share.token}/revoke`, {
    method: 'POST',
    headers: {
      'x-dudesign-user-id': 'usr_alt',
    },
  })
  assert.equal(revokeForbidden.status, 403)
  const revoked = await postJson<{ share: { token: string; revokedAt: string } }>(`/api/shares/${shareToRevoke.share.token}/revoke`, {})
  assert.equal(revoked.share.token, shareToRevoke.share.token)
  assert.match(revoked.share.revokedAt, /^\d{4}-/)
  const revokedResponse = await fetch(`${baseUrl}/api/shares/${shareToRevoke.share.token}`)
  assert.equal(revokedResponse.status, 410)
  const revokedPayload = await revokedResponse.json() as { error: { code: string } }
  assert.equal(revokedPayload.error.code, 'SHARE_REVOKED')

  const forbiddenJob = await fetch(`${baseUrl}/api/design-jobs/${createdJob.job.id}`, {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(forbiddenJob.status, 403)
  const forbiddenPayload = await forbiddenJob.json() as { error: { code: string } }
  assert.equal(forbiddenPayload.error.code, 'JOB_FORBIDDEN')

  const altBootstrap = await getJson<{ workspace: { id: string } }>('/api/dev/bootstrap', {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(altBootstrap.workspace.id, 'ws_alt')

  const altSessions = await getJson<{ sessions: unknown[] }>('/api/sessions', {
    headers: { 'x-dudesign-user-id': 'usr_alt' },
  })
  assert.equal(altSessions.sessions.length, 0)

  const runtimeHealth = await getJson<{ runtime: { status: string }; contract: { status: string } }>('/api/admin/runtime/health', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(runtimeHealth.runtime.status, 'compatible')
  assert.equal(runtimeHealth.contract.status, 'compatible')

  const adminJobs = await getJson<{ jobs: Array<{ id: string; status: string; completedVariationCount: number }> }>('/api/admin/jobs', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.ok(adminJobs.jobs.some(job => job.id === createdJob.job.id && job.completedVariationCount === 3))

  const adminArtifacts = await getJson<{
    artifacts: Array<{
      id: string
      jobId: string | null
      variationId: string | null
      kind: string
      storageKey: string
      contentHash: string
      previewUrl: string | null
      shareCount: number
    }>
  }>(`/api/admin/artifacts?jobId=${createdJob.job.id}&kind=html`, {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.ok(adminArtifacts.artifacts.some(artifact =>
    artifact.jobId === createdJob.job.id
    && artifact.variationId === variationId
    && artifact.kind === 'html'
    && artifact.storageKey.endsWith('/index.html')
    && artifact.contentHash.startsWith('sha256:')
    && artifact.previewUrl === `/api/variations/${variationId}/preview`
    && artifact.shareCount >= 1,
  ))

  const supportLookup = await getJson<{
    users: Array<{
      user: { id: string; email: string }
      sessions: Array<{
        id: string
        resumeState: string
        lastPromptPreview: string | null
        latestJob: { id: string; status: string } | null
        failureSummary: { severity: string; message: string; failedVariationCount: number }
      }>
    }>
  }>('/api/admin/support/users?userId=usr_dev', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(supportLookup.users[0]?.user.id, 'usr_dev')
  const supportSession = supportLookup.users[0]?.sessions.find(session => session.id === createdSession.session.id)
  assert.equal(supportSession?.resumeState, 'runtime_session_available')
  assert.equal(supportSession?.latestJob?.id, createdJob.job.id)
  assert.equal(supportSession?.failureSummary.severity, 'ok')
  assert.ok(typeof supportSession?.lastPromptPreview === 'string' || supportSession?.lastPromptPreview === null)

  const cancellableJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: 'Generated job for admin cancellation',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })

  const cancelForbidden = await fetch(`${baseUrl}/api/admin/jobs/${cancellableJob.job.id}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'support',
    },
    body: JSON.stringify({ reason: 'support cannot cancel' }),
  })
  assert.equal(cancelForbidden.status, 403)

  const cancelResponse = await fetch(`${baseUrl}/api/admin/jobs/${cancellableJob.job.id}/cancel`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'operator',
    },
    body: JSON.stringify({ reason: 'operator cancel smoke' }),
  })
  if (cancelResponse.status === 200) {
	    const cancelled = await cancelResponse.json() as {
	      job: { id: string; status: string }
	      runtime: { cancelled: boolean; cancelledVariationCount?: number }
	      audit: { action: string; targetId: string; reason: string }
	    }
	    assert.ok(['cancelled', 'completed'].includes(cancelled.job.status))
	    assert.equal(cancelled.runtime.cancelled, true)
	    assert.equal(cancelled.runtime.cancelledVariationCount, 1)
	    assert.equal(cancelled.audit.action, 'job.cancel')
    assert.equal(cancelled.audit.targetId, cancellableJob.job.id)
  } else {
    assert.equal(cancelResponse.status, 409)
    const cancelPayload = await cancelResponse.json() as { error: { code: string } }
    assert.equal(cancelPayload.error.code, 'JOB_NOT_CANCELLABLE')
  }

  const costSummary = await getJson<{
    totals: { jobCount: number; usageEventCount: number; inputTokens: number; outputTokens: number; costCents: number }
    byUser: Array<{ userId: string; usageEventCount: number; costCents: number }>
  }>('/api/admin/costs/summary', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.equal(costSummary.totals.usageEventCount >= 12, true)
  assert.equal(costSummary.totals.costCents >= 30, true)
  assert.equal(costSummary.byUser[0]?.userId, 'usr_dev')
  assert.equal(costSummary.byUser[0]?.usageEventCount >= 12, true)

  const retried = await postJson<{
    retry: { job: { id: string; variationCount: number } }
    audit: { action: string; targetId: string; metadata: { retriedJobId: string } }
  }>(`/api/admin/jobs/${createdJob.job.id}/retry`, {
    reason: 'operator retry smoke',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.notEqual(retried.retry.job.id, createdJob.job.id)
  assert.equal(retried.retry.job.variationCount, 3)
  assert.equal(retried.audit.action, 'job.retry')
  assert.equal(retried.audit.targetId, createdJob.job.id)
  assert.equal(retried.audit.metadata.retriedJobId, retried.retry.job.id)

  const auditLogs = await getJson<{ auditLogs: Array<{ action: string; targetId: string }> }>('/api/admin/audit-logs', {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(auditLogs.auditLogs[0]?.action, 'job.retry')
  assert.equal(auditLogs.auditLogs[0]?.targetId, createdJob.job.id)

  const retrySnapshot = await waitForJob(retried.retry.job.id)
  assert.equal(retrySnapshot.job.status, 'completed')
  assert.equal(retrySnapshot.variations.length, 3)
}

async function attachAssetBackedHtml(harness: ApiFlowHarness, variationId: string, htmlArtifactId: string): Promise<void> {
  const artifact = await harness.service.store.getArtifactById(htmlArtifactId)
  assert.ok(artifact)
  const html = [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<link rel="stylesheet" href="./styles/share-preview.css">',
    '</head>',
    '<body>',
    '<main>iframe-ready HTML version 3</main>',
    '<img src="images/mark.svg" alt="mark">',
    '</body>',
    '</html>',
  ].join('')
  const storedHtml = await harness.service.artifacts.put({
    workspaceId: artifact.workspaceId,
    artifactId: artifact.id,
    relativePath: `v${artifact.version}/${artifact.entryPath ?? 'index.html'}`,
    contentType: 'text/html; charset=utf-8',
    body: html,
    metadata: { kind: 'html', test: 'share-assets' },
  })
  await harness.service.store.saveArtifact({
    ...artifact,
    storageKey: storedHtml.storageKey,
    contentHash: storedHtml.contentHash,
    sizeBytes: storedHtml.sizeBytes,
  })
  await createAssetArtifact(harness, artifact, variationId, 'styles/share-preview.css', 'text/css; charset=utf-8', ':root { --share-accent: #2454ff; }')
  await createAssetArtifact(harness, artifact, variationId, 'images/mark.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')
}

async function createAssetArtifact(
  harness: ApiFlowHarness,
  htmlArtifact: Artifact,
  variationId: string,
  assetPath: string,
  contentType: string,
  body: string,
): Promise<void> {
  const assetArtifactId = `asset_${htmlArtifact.id}_${assetPath.replaceAll(/[^a-zA-Z0-9]+/g, '_')}`
  const stored = await harness.service.artifacts.put({
    workspaceId: htmlArtifact.workspaceId,
    artifactId: assetArtifactId,
    relativePath: `v${htmlArtifact.version}/${assetPath}`,
    contentType,
    body,
    metadata: { kind: 'asset', htmlArtifactId: htmlArtifact.id },
  })
  await harness.service.store.createArtifact({
    workspaceId: htmlArtifact.workspaceId,
    sessionId: htmlArtifact.sessionId,
    variationId,
    parentArtifactId: htmlArtifact.id,
    kind: 'asset',
    version: htmlArtifact.version,
    storageKey: stored.storageKey,
    entryPath: assetPath,
    contentHash: stored.contentHash,
    sizeBytes: stored.sizeBytes,
    metadata: { test: 'share-assets', htmlArtifactId: htmlArtifact.id },
  })
}

function listZipEntries(zip: Uint8Array): string[] {
  const names: string[] = []
  const decoder = new TextDecoder()
  let offset = 0
  while (offset + 46 <= zip.byteLength) {
    const signature = readU32(zip, offset)
    if (signature === 0x02014b50) {
      const nameLength = readU16(zip, offset + 28)
      const extraLength = readU16(zip, offset + 30)
      const commentLength = readU16(zip, offset + 32)
      const nameStart = offset + 46
      names.push(decoder.decode(zip.slice(nameStart, nameStart + nameLength)))
      offset = nameStart + nameLength + extraLength + commentLength
      continue
    }
    offset += 1
  }
  return names
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true)
}
