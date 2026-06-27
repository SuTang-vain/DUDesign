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
    const session = repository.createSession({
      userId: repository.devUser.id,
      workspaceId: repository.devWorkspace.id,
      mode: 'new_html',
      title: 'Postgres smoke',
    })
    repository.saveSession({
      ...session,
      runtimeSessionId: 'runtime_pg_smoke',
      updatedAt: new Date().toISOString(),
    })
    const message = repository.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Persist this prompt',
      metadata: { smoke: true },
    })
    const job = repository.createJob({
      session: repository.sessions.get(session.id)!,
      prompt: 'Persist a design job',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: { styles: ['postgres'] },
    })
    const [variation] = repository.createVariations({ job, count: 1 })
    assert.ok(variation)
    const artifact = repository.createArtifact({
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
    repository.applyVariationEvent({
      variationId: variation.id,
      status: 'completed',
      artifactId: artifact.id,
      previewUrl: `/api/variations/${variation.id}/preview`,
      inputTokens: 11,
      outputTokens: 22,
      costCents: 3,
    })
    repository.setJobStatus(job.id, 'completed')
    const share = repository.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: repository.devUser.id,
      visibility: 'public',
    })
    repository.createUsageEvent({
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

    await repository.flush()
    await repository.close()

    const hydrated = await PostgresRepository.connect({
      connectionString: POSTGRES_TEST_URL!,
      schema,
    })
    try {
      assert.equal(hydrated.sessions.get(session.id)?.runtimeSessionId, 'runtime_pg_smoke')
      assert.equal(hydrated.messages.get(session.id)?.[0]?.id, message.id)
      assert.equal(hydrated.jobs.get(job.id)?.prompt, 'Persist a design job')
      assert.equal(hydrated.variations.get(variation.id)?.currentArtifactId, artifact.id)
      assert.equal(hydrated.artifacts.get(artifact.id)?.contentHash, 'sha256:postgres-smoke')
      assert.equal(hydrated.getShareByToken(share.token)?.artifactId, artifact.id)
      assert.equal(hydrated.listUsageEvents({ jobId: job.id }).length, 1)
      const adminJobs = hydrated.listAdminJobs({ userId: repository.devUser.id })
      assert.equal(adminJobs.jobs.length, 1)
      assert.equal(adminJobs.jobs[0]?.id, job.id)
      assert.equal(adminJobs.jobs[0]?.completedVariationCount, 1)
      assert.equal(adminJobs.jobs[0]?.totalCostCents, 3)
      const adminArtifacts = hydrated.listAdminArtifacts({ jobId: job.id, kind: 'html' })
      assert.equal(adminArtifacts.artifacts.length, 1)
      assert.equal(adminArtifacts.artifacts[0]?.id, artifact.id)
      assert.equal(adminArtifacts.artifacts[0]?.shareCount, 1)
      const support = hydrated.getAdminUserSupport({ userId: repository.devUser.id })
      assert.equal(support.users.length, 1)
      assert.equal(support.users[0]?.user.id, repository.devUser.id)
      assert.equal(support.users[0]?.sessions[0]?.id, session.id)
      assert.equal(support.users[0]?.sessions[0]?.failureSummary.severity, 'ok')
      const costSummary = hydrated.getAdminCostSummary()
      assert.equal(costSummary.totals.jobCount, 1)
      assert.equal(costSummary.totals.usageEventCount, 1)
      assert.equal(costSummary.totals.costCents, 3)
      const snapshot = hydrated.getSessionSnapshot(session.id)
      assert.equal(snapshot?.messages.length, 1)
      assert.equal(snapshot?.jobs.length, 1)
      assert.equal(snapshot?.variations.length, 1)
      assert.equal(snapshot?.artifacts.length, 1)
    } finally {
      await hydrated.close()
    }
  })
})
