import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { Pool } from 'pg'
import { PostgresRepository } from './postgresRepository.js'

const POSTGRES_TEST_URL = process.env.DUDESIGN_POSTGRES_TEST_URL

describe('PostgresRepository integration', { skip: !POSTGRES_TEST_URL }, () => {
  const schema = `dudesign_test_${Date.now().toString(36)}`
  let repository: PostgresRepository

  before(async () => {
    repository = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
    })
  })

  after(async () => {
    await repository?.close()
    const pool = new Pool({ connectionString: POSTGRES_TEST_URL! })
    try {
      await pool.query(`drop schema if exists ${schema} cascade`)
    } finally {
      await pool.end()
    }
  })

  it('migrates, writes through, and hydrates persisted records', async () => {
    const session = await repository.createSession({
      userId: repository.devUser.id,
      workspaceId: repository.devWorkspace.id,
      mode: 'new_html',
      title: 'Postgres smoke',
    })
    await repository.saveSession({
      ...session,
      runtimeSessionId: 'runtime_pg_smoke',
      updatedAt: new Date().toISOString(),
    })
    const message = await repository.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Persist this prompt',
      metadata: { smoke: true },
    })
    const job = await repository.createJob({
      session: repository.sessions.get(session.id)!,
      prompt: 'Persist a design job',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: { styles: ['postgres'] },
    })
    const [variation] = await repository.createVariations({ job, count: 1 })
    assert.ok(variation)
    const artifact = await repository.createArtifact({
      workspaceId: job.workspaceId,
      sessionId: session.id,
      variationId: variation.id,
      kind: 'html',
      version: 1,
      storageKey: `${job.workspaceId}/artifacts/pg-smoke/v1/index.html`,
      entryPath: 'index.html',
      contentHash: 'sha256:postgres-smoke',
      sizeBytes: 128,
      metadata: { smoke: true },
    })
    const cssAsset = await repository.createArtifact({
      workspaceId: job.workspaceId,
      sessionId: session.id,
      variationId: variation.id,
      parentArtifactId: artifact.id,
      kind: 'asset',
      version: artifact.version,
      storageKey: `${job.workspaceId}/artifacts/pg-smoke/v1/styles/app.css`,
      entryPath: 'styles/app.css',
      contentHash: 'sha256:postgres-css',
      sizeBytes: 32,
      metadata: { smoke: true },
    })
    const imageAsset = await repository.createArtifact({
      workspaceId: job.workspaceId,
      sessionId: session.id,
      variationId: variation.id,
      parentArtifactId: artifact.id,
      kind: 'asset',
      version: artifact.version,
      storageKey: `${job.workspaceId}/artifacts/pg-smoke/v1/images/logo.svg`,
      entryPath: 'images/logo.svg',
      contentHash: 'sha256:postgres-svg',
      sizeBytes: 64,
      metadata: { smoke: true },
    })
    await repository.applyVariationEvent({
      variationId: variation.id,
	      status: 'completed',
	      artifactId: artifact.id,
	      previewUrl: `/api/variations/${variation.id}/preview`,
	      runtimeChildSessionId: 'rt_child_pg_smoke',
	      runtimeAgentJobId: 'agent_pg_smoke',
	      inputTokens: 11,
      outputTokens: 22,
      costCents: 3,
    })
    await repository.setJobStatus(job.id, 'completed')
    const share = await repository.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: repository.devUser.id,
      visibility: 'public',
    })
    await repository.createUsageEvent({
      idempotencyKey: `usage:test:${job.id}:${variation.id}:${artifact.id}`,
      kind: 'variation.completed',
      userId: repository.devUser.id,
      workspaceId: repository.devWorkspace.id,
      sessionId: session.id,
      jobId: job.id,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 11,
      outputTokens: 22,
      costCents: 3,
      metadata: { smoke: true },
    })
    await repository.createUsageEvent({
      idempotencyKey: `usage:test:${job.id}:${variation.id}:${artifact.id}`,
      kind: 'variation.completed',
      userId: repository.devUser.id,
      workspaceId: repository.devWorkspace.id,
      sessionId: session.id,
      jobId: job.id,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 999,
      outputTokens: 999,
      costCents: 999,
      metadata: { duplicate: true },
    })
    await repository.saveUserCapabilityPreference(repository.devUser.id, {
      domainTemplateId: 'tpl_apple_like_product',
      aestheticProfileId: 'aes_apple_minimal',
      colorPaletteId: 'pal_minimal_mono',
      loopProfileId: 'loop_standard',
    })

    await repository.flush()
    await repository.close()

    const hydrated = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
    })
    try {
      assert.equal(hydrated.sessions.get(session.id)?.runtimeSessionId, 'runtime_pg_smoke')
      assert.equal(hydrated.userCapabilityPreferences.get(repository.devUser.id)?.domainTemplateId, 'tpl_apple_like_product')
      assert.equal(hydrated.messages.get(session.id)?.[0]?.id, message.id)
      assert.equal(hydrated.jobs.get(job.id)?.prompt, 'Persist a design job')
	      assert.equal(hydrated.variations.get(variation.id)?.currentArtifactId, artifact.id)
	      assert.equal(hydrated.variations.get(variation.id)?.runtimeChildSessionId, 'rt_child_pg_smoke')
	      assert.equal(hydrated.variations.get(variation.id)?.runtimeAgentJobId, 'agent_pg_smoke')
      assert.equal(hydrated.artifacts.get(artifact.id)?.contentHash, 'sha256:postgres-smoke')
      assert.equal(hydrated.artifacts.get(cssAsset.id)?.contentHash, 'sha256:postgres-css')
      assert.equal(hydrated.artifacts.get(imageAsset.id)?.contentHash, 'sha256:postgres-svg')
      assert.equal((await hydrated.getShareByToken(share.token))?.artifactId, artifact.id)
      assert.equal(hydrated.listUsageEvents({ jobId: job.id }).length, 1)
      clearHydratedCache(hydrated)
      assert.equal((await hydrated.getUserById(repository.devUser.id))?.email, repository.devUser.email)
      assert.equal((await hydrated.getWorkspaceById(repository.devWorkspace.id))?.ownerId, repository.devUser.id)
      assert.equal((await hydrated.getPrimaryWorkspaceForUser(repository.devUser.id))?.id, repository.devWorkspace.id)
      assert.equal((await hydrated.getSessionById(session.id))?.runtimeSessionId, 'runtime_pg_smoke')
      assert.equal((await hydrated.getJobById(job.id))?.prompt, 'Persist a design job')
      const sqlVariation = await hydrated.getVariationById(variation.id)
      assert.equal(sqlVariation?.currentArtifactId, artifact.id)
      assert.equal(sqlVariation?.runtimeChildSessionId, 'rt_child_pg_smoke')
      assert.equal(sqlVariation?.runtimeAgentJobId, 'agent_pg_smoke')
      assert.equal((await hydrated.getArtifactById(artifact.id))?.contentHash, 'sha256:postgres-smoke')
      assert.equal((await hydrated.listSessions()).some(candidate => candidate.id === session.id), true)
      assert.equal((await hydrated.getShareByToken(share.token))?.artifactId, artifact.id)
      const adminJobs = await hydrated.listAdminJobs({ userId: repository.devUser.id })
      assert.equal(adminJobs.jobs.length, 1)
      assert.equal(adminJobs.jobs[0]?.id, job.id)
      assert.equal(adminJobs.jobs[0]?.completedVariationCount, 1)
      assert.equal(adminJobs.jobs[0]?.totalCostCents, 3)
      const adminArtifacts = await hydrated.listAdminArtifacts({ jobId: job.id, kind: 'html' })
      assert.equal(adminArtifacts.artifacts.length, 1)
      assert.equal(adminArtifacts.artifacts[0]?.id, artifact.id)
      assert.equal(adminArtifacts.artifacts[0]?.shareCount, 1)
      const support = await hydrated.getAdminUserSupport({ userId: repository.devUser.id })
      assert.equal(support.users.length, 1)
      assert.equal(support.users[0]?.user.id, repository.devUser.id)
      assert.equal(support.users[0]?.sessions[0]?.id, session.id)
      assert.equal(support.users[0]?.sessions[0]?.failureSummary.severity, 'ok')
      const costSummary = await hydrated.getAdminCostSummary()
      assert.equal(costSummary.totals.jobCount, 1)
      assert.equal(costSummary.totals.usageEventCount, 1)
      assert.equal(costSummary.totals.costCents, 3)
      const userModels = await hydrated.listUserModelOptions(repository.devUser.id)
      assert.ok(userModels.defaultModelId)
      assert.ok(userModels.models.some(model => model.id === userModels.defaultModelId))
      const defaultModel = await hydrated.getModelServiceById(userModels.defaultModelId!)
      assert.equal(defaultModel?.enabled, true)
      assert.equal(await hydrated.canUserUseModel(repository.devUser.id, userModels.defaultModelId!), true)
      assert.equal((await hydrated.getUserCapabilityPreference(repository.devUser.id))?.colorPaletteId, 'pal_minimal_mono')
      const adminModels = await hydrated.listAdminModels()
      assert.ok(adminModels.models.some(model => model.id === userModels.defaultModelId))
      const fastModel = await hydrated.updateAdminModel('mdl_babelo_fast', { enabled: true, isDefault: true })
      assert.equal(fastModel?.isDefault, true)
      assert.equal((await hydrated.listAdminModels()).models.filter(model => model.isDefault).length, 1)
      const disabledAccess = await hydrated.updateUserModelAccess(repository.devUser.id, 'mdl_babelo_fast', { enabled: false })
      assert.equal(disabledAccess.enabled, false)
      assert.equal(await hydrated.canUserUseModel(repository.devUser.id, 'mdl_babelo_fast'), false)
      const access = await hydrated.getAdminUserModelAccess(repository.devUser.id)
      assert.ok(access.access.some(item => item.modelServiceId === 'mdl_babelo_fast' && item.enabled === false))
      const variationDetail = await hydrated.getVariationDetailSnapshot(variation.id)
      assert.equal(variationDetail?.currentArtifact?.id, artifact.id)
      assert.equal(variationDetail?.job?.id, job.id)
      const currentArtifact = await hydrated.getCurrentVariationArtifactSnapshot(variation.id)
      assert.equal(currentArtifact.artifact?.id, artifact.id)
      const assets = await hydrated.getVariationAssetArtifacts(variation.id, artifact.id)
      assert.deepEqual(assets.map(candidate => candidate.entryPath), ['images/logo.svg', 'styles/app.css'])
      assert.equal((await hydrated.getVariationAssetArtifact(variation.id, artifact.id, 'styles/app.css'))?.id, cssAsset.id)
      const sharedVariation = await hydrated.getSharedVariationSnapshot(share.token)
      assert.equal(sharedVariation?.variation?.id, variation.id)
      assert.equal(sharedVariation?.artifact?.id, artifact.id)
      const sessionContext = await hydrated.getSessionWorkspaceContext(session.id)
      assert.equal(sessionContext?.workspace?.id, repository.devWorkspace.id)
      const jobSnapshot = await hydrated.getJobSnapshot(job.id)
      assert.equal(jobSnapshot?.variations.length, 1)
      const variationJobContext = await hydrated.getVariationJobContext(variation.id)
      assert.equal(variationJobContext?.job?.id, job.id)
      const refineContext = await hydrated.getVariationRefineContext(variation.id, artifact.id)
      assert.equal(refineContext?.session?.id, session.id)
      assert.equal(refineContext?.baseArtifact?.id, artifact.id)
      const variationArtifactContext = await hydrated.getVariationArtifactContext(variation.id, artifact.id)
      assert.equal(variationArtifactContext.mismatch, false)
      const runtimeContext = await hydrated.getRuntimeSessionContext(session.id)
      assert.equal(runtimeContext?.user?.id, repository.devUser.id)
      assert.equal(runtimeContext?.workspace?.id, repository.devWorkspace.id)
      const revokedShare = await hydrated.revokeShare(share.token)
      assert.equal(revokedShare?.token, share.token)
      clearHydratedCache(hydrated)
      assert.match((await hydrated.getShareByToken(share.token))?.revokedAt ?? '', /^\d{4}-/)
      await hydrated.hydrate()
      assert.equal((await hydrated.getUserCapabilityPreference(repository.devUser.id))?.aestheticProfileId, 'aes_apple_minimal')
      const snapshot = await hydrated.getSessionSnapshot(session.id)
      assert.equal(snapshot?.messages.length, 1)
      assert.equal(snapshot?.jobs.length, 1)
      assert.equal(snapshot?.variations.length, 1)
      assert.equal(snapshot?.artifacts.length, 3)
    } finally {
      await hydrated.close()
    }
  })
})

function clearHydratedCache(repository: PostgresRepository): void {
  repository.users.clear()
  repository.workspaces.clear()
  repository.sessions.clear()
  repository.messages.clear()
  repository.jobs.clear()
  repository.variations.clear()
  repository.artifacts.clear()
  repository.shares.clear()
  repository.modelServices.clear()
  repository.userModelAccess.clear()
  repository.userCapabilityPreferences.clear()
  repository.annotationBatches.clear()
  repository.auditLogs.splice(0, repository.auditLogs.length)
  repository.usageEvents.splice(0, repository.usageEvents.length)
}
