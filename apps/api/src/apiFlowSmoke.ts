import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type {
  CreateAnnotationBatchResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  CreateSourceArtifactResponse,
  DesignJobSnapshotResponse,
  ExportVariationResponse,
  RefineVariationResponse,
  RestoreVariationVersionResponse,
  SharedVariationResponse,
  ShareVariationResponse,
  VariationDetailResponse,
  VariationFilesResponse,
  ListCapabilitiesResponse,
} from '@dudesign/contracts'
import type { Artifact } from '@dudesign/domain'
import { ApplicationService } from './service.js'
import { createApiServer } from './server.js'

type JobSnapshot = DesignJobSnapshotResponse

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
    close: async () => {
      await service.flushBackgroundTasks()
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
    },
  }
}

export async function runApiFlowSmoke(harness: ApiFlowHarness): Promise<void> {
  const { baseUrl } = harness
  const sensitivePrompt = [
    'A landing page for a freelancer invoicing app',
    'Contact owner@example.com',
    'api_key=sk-test-admin-redaction-123456789',
    'Use local screenshot /Users/tangyaoyue/Desktop/private/mock.png',
  ].join(' ')

  async function waitForJob(jobId: string): Promise<JobSnapshot> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 2000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      if (snapshot.job.status === 'completed') return snapshot
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for job ${jobId}`)
  }

  async function waitForScreenshot(
    jobId: string,
    variationId: string,
    parentArtifactId?: string | null,
  ): Promise<JobSnapshot['artifacts'][number]> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 5000) {
      const snapshot = await getJson<JobSnapshot>(`/api/design-jobs/${jobId}`)
      const screenshot = snapshot.artifacts.find(artifact =>
        artifact.kind === 'screenshot'
        && artifact.variationId === variationId
        && artifact.screenshotDevice === 'desktop'
        && (!parentArtifactId || artifact.parentArtifactId === parentArtifactId)
      )
      const variation = snapshot.variations.find(candidate => candidate.id === variationId)
      if (screenshot?.url && variation?.screenshotUrl === screenshot.url) return screenshot
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Timed out waiting for screenshot for ${variationId}`)
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

  async function putJson<T>(path: string, body: unknown, init?: Omit<RequestInit, 'body' | 'method'>): Promise<T> {
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      method: 'PUT',
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

  const capabilities = await getJson<ListCapabilitiesResponse>('/api/capabilities')
  assert.equal(capabilities.schemaVersion, '2026-07-01.dudesign-capabilities.v2')
  assert.ok(capabilities.domainTemplates.some(template => template.id === capabilities.defaults.domainTemplateId))
  assert.ok(capabilities.aestheticProfiles.some(profile => profile.id === capabilities.defaults.aestheticProfileId))
  assert.ok(capabilities.colorPalettes.some(palette => palette.id === capabilities.defaults.colorPaletteId))
  assert.ok(capabilities.brandStyleReferences.some(reference => reference.id === 'brand_apple_inspired'))
  const premiumMinimal = capabilities.aestheticProfiles.find(profile => profile.id === 'aes_premium_minimal')
  assert.ok(premiumMinimal?.mood.includes('premium'))
  assert.ok(premiumMinimal?.bestFor.includes('premium product pages'))
  assert.ok(capabilities.automationLoopProfiles.some(profile => profile.id === capabilities.defaults.loopProfileId))

  const defaultPreferences = await getJson<{
    capabilityPreference: {
      domainTemplateId: string | null
      aestheticProfileId: string | null
      colorPaletteId: string | null
      loopProfileId: string | null
    }
  }>('/api/preferences')
  assert.equal(defaultPreferences.capabilityPreference.domainTemplateId, capabilities.defaults.domainTemplateId)
  const updatedPreferences = await putJson<typeof defaultPreferences>('/api/preferences', {
    capabilityPreference: {
      domainTemplateId: 'tpl_premium_product_page',
      aestheticProfileId: 'aes_premium_minimal',
      colorPaletteId: 'pal_minimal_mono',
      loopProfileId: 'loop_standard',
    },
  })
  assert.equal(updatedPreferences.capabilityPreference.domainTemplateId, 'tpl_premium_product_page')
  assert.equal(updatedPreferences.capabilityPreference.aestheticProfileId, 'aes_premium_minimal')
  assert.equal(updatedPreferences.capabilityPreference.colorPaletteId, 'pal_minimal_mono')

  const sourceArtifact = await postJson<CreateSourceArtifactResponse>('/api/source-artifacts', {
    workspaceId: bootstrap.workspace.id,
    filename: 'uploaded-source.html',
    html: '<!doctype html><html><body><main><h1>Uploaded source page</h1><p>Base layout.</p></main></body></html>',
  })
  assert.ok(sourceArtifact.artifact.id.startsWith('art_'))
  assert.equal(sourceArtifact.artifact.entryPath, 'uploaded-source.html')
  assert.equal(sourceArtifact.artifact.kind, 'html')

  const existingSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'from_existing_html',
    sourceArtifactId: sourceArtifact.artifact.id,
    title: 'Existing HTML source smoke',
  })
  const existingJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: existingSession.session.id,
    prompt: 'Improve the uploaded source page without changing its product promise.',
    sourceMode: 'from_existing_html',
    sourceArtifactId: sourceArtifact.artifact.id,
    variationCount: 1,
    templateRequirements: {
      styles: ['existing-source'],
      deviceTargets: ['desktop'],
    },
  })
  const existingSnapshot = await waitForJob(existingJob.job.id)
  assert.equal(existingSnapshot.job.status, 'completed')
  const existingStoredSession = await harness.service.store.getSessionById(existingSession.session.id)
  assert.equal(existingStoredSession?.sourceArtifactId, sourceArtifact.artifact.id)
  const existingStoredJob = await harness.service.store.getJobById(existingJob.job.id)
  assert.equal(existingStoredJob?.sourceMode, 'from_existing_html')

  const createdSession = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'new_html',
    title: 'Smoke session',
  })
  assert.ok(createdSession.session.id.startsWith('ses_'))

  const createdJob = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: createdSession.session.id,
    prompt: sensitivePrompt,
    sourceMode: 'new_html',
    variationCount: 3,
    capabilityRequirements: {
      template: {
        domainTemplateId: 'tpl_fintech_trust',
        aestheticProfileId: 'aes_trustworthy_saas',
        colorPaletteId: 'pal_blue_white_trust',
        brandStyleReferenceId: 'brand_apple_inspired',
      },
      automation: {
        loopProfileId: 'loop_standard',
        maxRepairAttempts: 1,
      },
    },
    templateRequirements: {
      styles: ['minimal', 'editorial'],
      deviceTargets: ['desktop', 'mobile'],
      advancedConstraints: {
        colorPaletteId: 'pal_blue_white_trust',
        styleNotes: ['minimal', 'editorial'],
        brandStyleReferenceId: 'brand_apple_inspired',
        referenceBrand: 'Apple-inspired',
        negativeRequirements: ['No busy gradients'],
      },
    },
  })
  assert.equal(createdJob.variations.length, 3)

  const jobSnapshot = await waitForJob(createdJob.job.id)
  assert.equal(jobSnapshot.job.status, 'completed')
  const storedCreatedJob = await harness.service.store.getJobById(createdJob.job.id)
  const capabilitySnapshot = storedCreatedJob?.templateRequirements.capabilitySnapshot as {
    schemaVersion?: string
    template?: {
      domainTemplate?: { id?: string }
      aestheticProfile?: { id?: string }
      colorPalette?: { id?: string }
      brandStyleReference?: { id?: string } | null
    }
    automation?: {
      loopProfile?: { id?: string }
      maxRepairAttempts?: number
    }
  } | undefined
  assert.equal(capabilitySnapshot?.schemaVersion, '2026-07-01.dudesign-capabilities.v2')
  assert.equal(capabilitySnapshot?.template?.domainTemplate?.id, 'tpl_fintech_trust')
  assert.equal(capabilitySnapshot?.template?.aestheticProfile?.id, 'aes_trustworthy_saas')
  assert.equal(capabilitySnapshot?.template?.colorPalette?.id, 'pal_blue_white_trust')
  assert.equal(capabilitySnapshot?.template?.brandStyleReference?.id, 'brand_apple_inspired')
  assert.equal(capabilitySnapshot?.automation?.loopProfile?.id, 'loop_standard')
  assert.equal(capabilitySnapshot?.automation?.maxRepairAttempts, 1)
  const advancedConstraints = storedCreatedJob?.templateRequirements.advancedConstraints as {
    brandStyleReferenceId?: string | null
    negativeRequirements?: string[]
  } | undefined
  assert.equal(advancedConstraints?.brandStyleReferenceId, 'brand_apple_inspired')
  assert.deepEqual(advancedConstraints?.negativeRequirements, ['No busy gradients'])
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.domainTemplate.id, 'tpl_fintech_trust')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.aestheticProfile.id, 'aes_trustworthy_saas')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.colorPalette.id, 'pal_blue_white_trust')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.template.brandStyleReference?.id, 'brand_apple_inspired')
  assert.equal(jobSnapshot.job.capabilitySnapshot?.automation.loopProfile.id, 'loop_standard')
  assert.equal(jobSnapshot.variations.length, 3)
  assert.ok(jobSnapshot.variations.every(variation => variation.status === 'completed'))
  assert.equal(jobSnapshot.artifacts.filter(artifact => artifact.kind === 'html').length, 3)
  const firstScreenshot = await waitForScreenshot(createdJob.job.id, jobSnapshot.variations[0]!.id)
  const snapshotWithScreenshot = await getJson<JobSnapshot>(`/api/design-jobs/${createdJob.job.id}`)
  assert.equal(snapshotWithScreenshot.variations[0]!.screenshotUrl, firstScreenshot.url)
  const screenshotResponse = await fetch(`${baseUrl}${firstScreenshot.url}`)
  assert.equal(screenshotResponse.ok, true)
  assert.equal(screenshotResponse.headers.get('content-type'), 'image/png')
  assert.equal(new Uint8Array(await screenshotResponse.arrayBuffer()).slice(0, 4).join(','), '137,80,78,71')

  const sseReplay = await getText(`/api/design-jobs/${createdJob.job.id}/stream`)
  assert.match(sseReplay, /event: design\.variation_streaming/)
  assert.match(sseReplay, /event: design\.job_completed/)

  const variationId = jobSnapshot.variations[0]!.id
  const beforeRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(beforeRefine.currentArtifact?.version, 1)
  assert.equal(beforeRefine.job.capabilitySnapshot?.template.domainTemplate.id, 'tpl_fintech_trust')
  assert.equal(beforeRefine.job.capabilitySnapshot?.template.aestheticProfile.id, 'aes_trustworthy_saas')

  const refined = await postJson<RefineVariationResponse>(`/api/variations/${variationId}/refine`, {
    prompt: 'Make the hero more confident and improve mobile spacing.',
    baseArtifactId: beforeRefine.currentArtifact!.id,
    deviceContext: 'mobile',
  })
  assert.ok(refined.artifact)
  assert.equal(refined.artifact.version, 2)

  const afterRefine = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(afterRefine.currentArtifact?.version, 2)
  assert.deepEqual(afterRefine.artifacts.filter(artifact => artifact.kind === 'html').map(artifact => artifact.version), [2, 1])
  await waitForScreenshot(createdJob.job.id, variationId, afterRefine.currentArtifact?.id)
  const afterRefineWithScreenshot = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(afterRefineWithScreenshot.artifacts.some(artifact =>
    artifact.kind === 'screenshot'
    && artifact.parentArtifactId === afterRefine.currentArtifact?.id
    && artifact.screenshotDevice === 'desktop'
    && artifact.url?.includes('/screenshots/'),
  ), true)
  assert.equal(afterRefine.artifacts.find(artifact => artifact.id === afterRefine.currentArtifact?.id)?.isCurrent, true)

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

  const historicalFiles = await getJson<VariationFilesResponse>(
    `/api/variations/${variationId}/files?artifactId=${beforeRefine.currentArtifact!.id}`,
  )
  const currentFiles = await getJson<VariationFilesResponse>(
    `/api/variations/${variationId}/files?artifactId=${annotated.artifact!.id}`,
  )
  const historicalIndex = findFile(historicalFiles, 'index.html')
  const currentIndex = findFile(currentFiles, 'index.html')
  assert.equal(historicalFiles.artifact.id, beforeRefine.currentArtifact!.id)
  assert.equal(historicalFiles.artifact.version, 1)
  assert.equal(currentFiles.artifact.id, annotated.artifact!.id)
  assert.equal(currentFiles.artifact.version, 3)
  assert.equal(historicalIndex.kind, 'html')
  assert.match(historicalIndex.content, /version 1/)
  assert.doesNotMatch(historicalIndex.content, /iframe-ready HTML version 3/)
  assert.match(currentIndex.content, /iframe-ready HTML version 3/)
  assert.equal(findFile(currentFiles, 'styles/share-preview.css').kind, 'asset')

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
  const detailWithExport = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.ok(detailWithExport.artifacts.some(artifact =>
    artifact.kind === 'asset'
    && artifact.parentArtifactId === annotated.artifact!.id
    && artifact.entryPath === 'styles/share-preview.css',
  ))
  assert.ok(detailWithExport.artifacts.some(artifact =>
    artifact.kind === 'export_zip'
    && artifact.exportedFromArtifactId === annotated.artifact!.id
    && artifact.entryPath === exported.exportArtifact!.filename,
  ))

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

  const restored = await postJson<RestoreVariationVersionResponse>(
    `/api/variations/${variationId}/versions/${beforeRefine.currentArtifact!.id}/restore`,
    {},
  )
  assert.equal(restored.artifact.version, 1)
  assert.equal(restored.variation.currentArtifactId, beforeRefine.currentArtifact!.id)
  const restoredDetail = await getJson<VariationDetailResponse>(`/api/variations/${variationId}`)
  assert.equal(restoredDetail.currentArtifact?.id, beforeRefine.currentArtifact!.id)
  assert.equal(restoredDetail.artifacts.find(artifact => artifact.id === beforeRefine.currentArtifact!.id)?.isCurrent, true)
  const restoredPreview = await getText(`/api/variations/${variationId}/preview`)
  assert.match(restoredPreview, /version 1/)
  const restoredExport = await postJson<ExportVariationResponse>(`/api/variations/${variationId}/export`, {})
  assert.equal(restoredExport.artifact.version, 1)
  assert.match(restoredExport.artifact.filename, /variation-01-v1\.html/)
  const postRestoreShareDetail = await getJson<SharedVariationResponse>(`/api/shares/${shared.share.token}`)
  assert.equal(postRestoreShareDetail.artifact.id, shareDetail.artifact.id)
  assert.equal(postRestoreShareDetail.artifact.version, 3)
  assert.match(postRestoreShareDetail.artifact.html ?? '', /version 3/)

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

  const adminJobs = await getJson<{
    jobs: Array<{
      id: string
      status: string
      prompt: string
      userId: string
      workspaceId: string
      sessionId: string
      completedVariationCount: number
      variations: Array<{ id: string; status: string; errorMessage: string | null }>
    }>
  }>('/api/admin/jobs', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  assert.ok(adminJobs.jobs.some(job => job.id === createdJob.job.id && job.completedVariationCount === 3))
  const adminJob = adminJobs.jobs.find(job => job.id === createdJob.job.id)
  assert.ok(adminJob)
  assert.equal(adminJob.variations.length, 3)
  assert.ok(adminJob.variations.some(variation => variation.id === variationId && variation.status === 'completed'))
  assert.match(adminJob.prompt, /\[redacted-email\]/)
  assert.match(adminJob.prompt, /\[redacted-secret\]/)
  assert.match(adminJob.prompt, /\[redacted-path\]/)
  assert.doesNotMatch(adminJob.prompt, /owner@example\.com/)
  assert.doesNotMatch(adminJob.prompt, /sk-test-admin-redaction/)
  assert.doesNotMatch(adminJob.prompt, /\/Users\/tangyaoyue/)

  const filteredAdminJobs = await getJson<{ jobs: Array<{ id: string }> }>(
    `/api/admin/jobs?userId=usr_dev&workspaceId=${encodeURIComponent(adminJob.workspaceId)}&sessionId=${encodeURIComponent(adminJob.sessionId)}&status=completed`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.ok(filteredAdminJobs.jobs.some(job => job.id === createdJob.job.id))

  const timeFilteredAdminJobs = await getJson<{ jobs: Array<{ id: string }> }>(
    `/api/admin/jobs?createdFrom=${encodeURIComponent('2000-01-01T00:00:00.000Z')}&createdTo=${encodeURIComponent('2999-01-01T00:00:00.000Z')}`,
    { headers: { 'x-dudesign-admin-role': 'support' } },
  )
  assert.ok(timeFilteredAdminJobs.jobs.some(job => job.id === createdJob.job.id))

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
  assert.equal(supportSession?.latestJob?.status, 'completed')
  assert.equal(supportSession?.failureSummary.severity, 'ok')
  assert.ok(typeof supportSession?.lastPromptPreview === 'string' || supportSession?.lastPromptPreview === null)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-email\]/)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-secret\]/)
  assert.match(supportSession?.lastPromptPreview ?? '', /\[redacted-path\]/)

  const retryVariationForbidden = await fetch(`${baseUrl}/api/admin/jobs/${createdJob.job.id}/variations/${variationId}/retry`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dudesign-admin-role': 'support',
    },
    body: JSON.stringify({ reason: 'support cannot retry variation' }),
  })
  assert.equal(retryVariationForbidden.status, 403)

  const retriedVariation = await postJson<{
    retry: { job: { id: string; variationCount: number } }
    audit: { action: string; targetId: string; metadata: { originalJobId: string; retriedJobId: string } }
  }>(`/api/admin/jobs/${createdJob.job.id}/variations/${variationId}/retry`, {
    reason: 'operator retry variation smoke',
  }, {
    headers: { 'x-dudesign-admin-role': 'operator' },
  })
  assert.equal(retriedVariation.retry.job.variationCount, 1)
  assert.equal(retriedVariation.audit.action, 'variation.retry')
  assert.equal(retriedVariation.audit.targetId, variationId)
  assert.equal(retriedVariation.audit.metadata.originalJobId, createdJob.job.id)
  assert.equal(retriedVariation.audit.metadata.retriedJobId, retriedVariation.retry.job.id)

  const sessionForFailure = await harness.service.store.getSessionById(createdSession.session.id)
  assert.ok(sessionForFailure)
  const failedJob = await harness.service.store.createJob({
    session: sessionForFailure,
    prompt: 'Failure summary redaction smoke',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const [failedVariation] = await harness.service.store.createVariations({ job: failedJob, count: 1 })
  assert.ok(failedVariation)
  await harness.service.store.applyVariationEvent({
    variationId: failedVariation.id,
    status: 'failed',
    errorCode: 'RUNTIME_FAILED',
    errorMessage: 'Failed for owner@example.com with token=ghp_admin_redaction_123456789 at /Users/tangyaoyue/Desktop/private/input.html',
  })
  await harness.service.store.setJobStatus(failedJob.id, 'failed')

  const failedSupportLookup = await getJson<{
    users: Array<{
      sessions: Array<{
        id: string
        latestJob: { id: string; status: string } | null
        failureSummary: {
          severity: string
          examples: Array<{ message: string | null }>
        }
      }>
    }>
  }>('/api/admin/support/users?userId=usr_dev', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  const failedSupportSession = failedSupportLookup.users[0]?.sessions.find(session => session.id === createdSession.session.id)
  const failureExampleMessage = failedSupportSession?.failureSummary.examples[0]?.message ?? ''
  assert.equal(failedSupportSession?.latestJob?.id, failedJob.id)
  assert.equal(failedSupportSession?.failureSummary.severity, 'blocked')
  assert.match(failureExampleMessage, /\[redacted-email\]/)
  assert.match(failureExampleMessage, /\[redacted-secret\]/)
  assert.match(failureExampleMessage, /\[redacted-path\]/)
  assert.doesNotMatch(failureExampleMessage, /owner@example\.com/)
  assert.doesNotMatch(failureExampleMessage, /ghp_admin_redaction/)
  assert.doesNotMatch(failureExampleMessage, /\/Users\/tangyaoyue/)

  const memoryGovernance = await getJson<{
    users: Array<{
      userId: string
      memoryNamespace: string
      isolationStatus: string
      sessionCount: number
      runtimeSessionCount: number
      memoryRefCount: number
    }>
    totals: { userCount: number; isolatedUserCount: number; conflictUserCount: number }
    capabilities: { memoryNotes: string; memoryRefs: string }
  }>('/api/admin/memory', {
    headers: { 'x-dudesign-admin-role': 'support' },
  })
  const devMemory = memoryGovernance.users.find(user => user.userId === 'usr_dev')
  const altMemory = memoryGovernance.users.find(user => user.userId === 'usr_alt')
  assert.equal(devMemory?.memoryNamespace, 'memory:user:usr_dev')
  assert.equal(altMemory?.memoryNamespace, 'memory:user:usr_alt')
  assert.equal(devMemory?.isolationStatus, 'isolated')
  assert.equal(altMemory?.isolationStatus, 'isolated')
  assert.equal(memoryGovernance.totals.conflictUserCount, 0)
  assert.equal(memoryGovernance.totals.isolatedUserCount >= 2, true)
  assert.equal(memoryGovernance.capabilities.memoryNotes, 'not_configured')
  assert.equal(memoryGovernance.capabilities.memoryRefs, 'event_stream_only')

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
  assert.ok(auditLogs.auditLogs.some(audit => audit.action === 'job.retry' && audit.targetId === createdJob.job.id))

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

function findFile(files: VariationFilesResponse, path: string): VariationFilesResponse['files'][number] {
  const file = files.files.find(item => item.path === path)
  assert.ok(file, `Expected variation files to include ${path}`)
  return file
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
