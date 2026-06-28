import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { Artifact, DesignJob, DesignSession, DesignVariation, ModelService, Share, UsageEvent, User, UserModelAccess, Workspace } from '@dudesign/domain'
import { InMemoryStore, type AnnotationBatch, type AuditLog, type SessionMessage } from './store.js'
import { createId, nowIso } from './id.js'
import type {
  AdminArtifactsFilter,
  AdminArtifactSummary,
  AdminCostSummary,
  AdminJobsFilter,
  AdminJobSummary,
  AdminModelSummary,
  AdminSupportSession,
  AdminUserModelAccess,
  AdminUserSupport,
  AdminUserSupportFilter,
  ApplyVariationEventInput,
  CurrentVariationArtifactSnapshot,
  CreateAnnotationBatchInput,
  CreateArtifactInput,
  CreateHtmlArtifactInput,
  CreateJobInput,
  CreateSessionInput,
  CreateShareInput,
  JobSnapshot,
  RuntimeSessionContext,
  SessionSnapshot,
  SessionWorkspaceContext,
  SharedVariationSnapshot,
  VariationArtifactContext,
  VariationDetailSnapshot,
  VariationJobContext,
  VariationRefineContext,
  UserModelOption,
} from './repository.js'

export type PostgresRepositoryOptions = {
  connectionString: string
  migrationsDir?: string
  schema?: string
  hydrateOnStart?: boolean
}

export class PostgresRepository extends InMemoryStore {
  readonly pool: Pool
  private readonly migrationsDir: string
  private writeTail: Promise<unknown> = Promise.resolve()
  private closed = false

  private constructor(options: PostgresRepositoryOptions) {
    super()
    this.pool = new Pool({
      connectionString: options.connectionString,
      ...(options.schema && { options: `-c search_path=${options.schema}` }),
    })
    this.migrationsDir = options.migrationsDir ?? defaultMigrationsDir()
  }

  static async connect(options: PostgresRepositoryOptions): Promise<PostgresRepository> {
    if (options.schema) await ensureSchema(options.connectionString, options.schema)
    const repository = new PostgresRepository(options)
    await repository.migrate()
    await repository.seedDefaults()
    if (options.hydrateOnStart ?? true) await repository.hydrate()
    return repository
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.flush()
    await this.pool.end()
  }

  async flush(): Promise<void> {
    await this.writeTail
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `)
    await mkdir(this.migrationsDir, { recursive: true })
    const files = (await readdir(this.migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort()
    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const applied = await this.pool.query('select version from schema_migrations where version = $1', [version])
      if (applied.rowCount) continue
      const sql = await readFile(join(this.migrationsDir, file), 'utf8')
      const client = await this.pool.connect()
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into schema_migrations (version) values ($1)', [version])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    }
  }

  async seedDefaults(): Promise<void> {
    for (const user of [this.devUser, this.altUser]) {
      await this.pool.query(`
        insert into users (id, email, name, avatar_url, status, memory_namespace, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do nothing
      `, [
        user.id,
        user.email,
        user.name,
        user.avatarUrl,
        user.status,
        user.memoryNamespace,
        user.createdAt,
        user.updatedAt,
      ])
    }
    for (const workspace of [this.devWorkspace, this.altWorkspace]) {
      await this.pool.query(`
        insert into workspaces (id, owner_id, team_id, name, mode, visibility, storage_key, status, metadata, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        on conflict (id) do nothing
      `, [
        workspace.id,
        workspace.ownerId,
        workspace.teamId,
        workspace.name,
        workspace.mode,
        workspace.visibility,
        workspace.storageKey,
        workspace.status,
        JSON.stringify(workspace.metadata),
        workspace.createdAt,
        workspace.updatedAt,
      ])
    }
    for (const model of this.modelServices.values()) {
      await this.persistModelService(model)
    }
  }

  async hydrate(): Promise<void> {
    this.users.clear()
    this.workspaces.clear()
    this.sessions.clear()
    this.messages.clear()
    this.jobs.clear()
    this.variations.clear()
    this.artifacts.clear()
    this.shares.clear()
    this.modelServices.clear()
    this.userModelAccess.clear()
    this.annotationBatches.clear()
    this.auditLogs.splice(0, this.auditLogs.length)
    this.usageEvents.splice(0, this.usageEvents.length)

    for (const row of (await this.pool.query('select * from users')).rows) this.users.set(row.id, mapUser(row))
    for (const row of (await this.pool.query('select * from workspaces')).rows) this.workspaces.set(row.id, mapWorkspace(row))
    for (const row of (await this.pool.query('select * from design_sessions')).rows) {
      const session = mapSession(row)
      this.sessions.set(session.id, session)
      this.messages.set(session.id, [])
    }
    for (const row of (await this.pool.query('select * from session_messages order by created_at')).rows) {
      const message = mapMessage(row)
      const list = this.messages.get(message.sessionId) ?? []
      list.push(message)
      this.messages.set(message.sessionId, list)
    }
    for (const row of (await this.pool.query('select * from design_jobs')).rows) this.jobs.set(row.id, mapJob(row))
    for (const row of (await this.pool.query('select * from design_variations')).rows) this.variations.set(row.id, mapVariation(row))
    for (const row of (await this.pool.query('select * from artifacts')).rows) this.artifacts.set(row.id, mapArtifact(row))
    for (const row of (await this.pool.query('select * from shares')).rows) this.shares.set(row.token, mapShare(row))
    for (const row of (await this.pool.query('select * from model_services')).rows) this.modelServices.set(row.id, mapModelService(row))
    for (const row of (await this.pool.query('select * from user_model_access')).rows) {
      const access = mapUserModelAccess(row)
      this.userModelAccess.set(userModelAccessKey(access.userId, access.modelServiceId), access)
    }
    for (const row of (await this.pool.query('select * from annotation_batches')).rows) this.annotationBatches.set(row.id, mapAnnotationBatch(row))
    for (const row of (await this.pool.query('select * from audit_logs order by created_at')).rows) this.auditLogs.push(mapAuditLog(row))
    for (const row of (await this.pool.query('select * from usage_events order by created_at')).rows) this.usageEvents.push(mapUsageEvent(row))
  }

  override async createSession(input: CreateSessionInput): Promise<DesignSession> {
    const now = nowIso()
    const session: DesignSession = {
      id: createId('ses'),
      userId: input.userId,
      workspaceId: input.workspaceId,
      title: input.title ?? 'Untitled design session',
      mode: input.mode,
      sourceArtifactId: input.sourceArtifactId ?? null,
      runtimeSessionId: input.runtimeSessionId ?? null,
      status: 'active',
      lastPrompt: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    await this.persistSession(session)
    this.sessions.set(session.id, session)
    this.messages.set(session.id, [])
    return session
  }

  override async saveSession(session: DesignSession): Promise<void> {
    await this.persistSession(session)
    this.sessions.set(session.id, session)
  }

  override async appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): Promise<SessionMessage> {
    const created: SessionMessage = {
      id: createId('msg'),
      createdAt: nowIso(),
      ...message,
    }
    await this.persistMessage(created)
    const list = this.messages.get(message.sessionId) ?? []
    list.push(created)
    this.messages.set(message.sessionId, list)
    return created
  }

  override async createJob(input: CreateJobInput): Promise<DesignJob> {
    const now = nowIso()
    const job: DesignJob = {
      id: createId('job'),
      sessionId: input.session.id,
      userId: input.session.userId,
      workspaceId: input.session.workspaceId,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      variationCount: input.variationCount,
      templateRequirements: input.templateRequirements,
      status: 'queued',
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostCents: 0,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    const updatedSession = {
      ...input.session,
      lastPrompt: input.prompt,
      updatedAt: now,
    }
    await this.withWrite(async () => {
      await this.persistSession(updatedSession)
      await this.persistJob(job)
    })
    this.jobs.set(job.id, job)
    this.sessions.set(input.session.id, updatedSession)
    return job
  }

  override async createVariations(input: { job: DesignJob; count: number }): Promise<DesignVariation[]> {
    const now = nowIso()
    const variations: DesignVariation[] = []
    for (let index = 1; index <= input.count; index += 1) {
      variations.push({
        id: createId('var'),
        jobId: input.job.id,
        sessionId: input.job.sessionId,
        index,
        title: `Variation ${String(index).padStart(2, '0')}`,
        runtimeChildSessionId: null,
        runtimeAgentJobId: null,
        status: 'queued',
        currentArtifactId: null,
        previewUrl: null,
        screenshotArtifactId: null,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        errorCode: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      })
    }
    await this.withWrite(async () => {
      for (const variation of variations) await this.persistVariation(variation)
    })
    for (const variation of variations) this.variations.set(variation.id, variation)
    return variations
  }

  override async setJobStatus(jobId: string, status: DesignJob['status']): Promise<void> {
    const existing = await this.getJobById(jobId)
    if (!existing) return
    const now = nowIso()
    const job: DesignJob = {
      ...existing,
      status,
      startedAt: existing.startedAt ?? (status === 'running' ? now : null),
      completedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? now : existing.completedAt,
      updatedAt: now,
    }
    await this.persistJob(job)
    this.jobs.set(jobId, job)
  }

  override async createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const audit: AuditLog = {
      id: createId('aud'),
      createdAt: nowIso(),
      ...input,
    }
    await this.persistAuditLog(audit)
    this.auditLogs.push(audit)
    return audit
  }

  override async createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): Promise<UsageEvent> {
    const event: UsageEvent = {
      id: createId('use'),
      createdAt: nowIso(),
      ...input,
    }
    const persisted = await this.persistUsageEvent(event)
    const existingIndex = this.usageEvents.findIndex(candidate => candidate.idempotencyKey === persisted.idempotencyKey)
    if (existingIndex >= 0) this.usageEvents[existingIndex] = persisted
    else this.usageEvents.push(persisted)
    return persisted
  }

  override async applyVariationEvent(input: ApplyVariationEventInput): Promise<void> {
    const existing = await this.getVariationById(input.variationId)
    if (!existing) return
    const variation: DesignVariation = {
      ...existing,
      status: input.status ?? existing.status,
      currentArtifactId: input.artifactId ?? existing.currentArtifactId,
      previewUrl: input.previewUrl ?? existing.previewUrl,
      runtimeChildSessionId: input.runtimeChildSessionId ?? existing.runtimeChildSessionId,
      runtimeAgentJobId: input.runtimeAgentJobId ?? existing.runtimeAgentJobId,
      inputTokens: input.inputTokens ?? existing.inputTokens,
      outputTokens: input.outputTokens ?? existing.outputTokens,
      costCents: input.costCents ?? existing.costCents,
      errorCode: input.errorCode ?? existing.errorCode,
      errorMessage: input.errorMessage ?? existing.errorMessage,
      updatedAt: nowIso(),
    }
    await this.persistVariation(variation)
    this.variations.set(input.variationId, variation)
  }

  override async createMockArtifact(input: CreateHtmlArtifactInput): Promise<Artifact> {
    await this.flush()
    const versionRow = (await this.pool.query(`
      select coalesce(max(version), 0)::int + 1 as next_version
      from artifacts
      where variation_id = $1 and kind = 'html'
    `, [input.variationId])).rows[0]
    const version = versionRow?.next_version ?? 1
    const artifact: Artifact = {
      id: input.artifactId ?? createId('art'),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variationId,
      parentArtifactId: input.parentArtifactId ?? null,
      kind: 'html',
      version,
      storageKey: `${input.workspaceId}/${input.variationId}/v${version}/index.html`,
      entryPath: input.entryPath ?? 'index.html',
      contentHash: createId('hash'),
      sizeBytes: 1024 + version,
      metadata: { mock: true, version },
      createdAt: nowIso(),
    }
    await this.persistArtifact(artifact)
    this.artifacts.set(artifact.id, artifact)
    return artifact
  }

  override async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    const artifact: Artifact = {
      id: createId('art'),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variationId ?? null,
      parentArtifactId: input.parentArtifactId ?? null,
      kind: input.kind,
      version: input.version ?? 1,
      storageKey: input.storageKey,
      entryPath: input.entryPath ?? null,
      contentHash: input.contentHash,
      sizeBytes: input.sizeBytes,
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    }
    await this.persistArtifact(artifact)
    this.artifacts.set(artifact.id, artifact)
    return artifact
  }

  override async saveArtifact(artifact: Artifact): Promise<void> {
    await this.persistArtifact(artifact)
    this.artifacts.set(artifact.id, artifact)
  }

  override async createAnnotationBatch(input: CreateAnnotationBatchInput): Promise<AnnotationBatch> {
    const batch: AnnotationBatch = {
      id: createId('ann'),
      createdAt: nowIso(),
      ...input,
    }
    await this.persistAnnotationBatch(batch)
    this.annotationBatches.set(batch.id, batch)
    return batch
  }

  override async createShare(input: CreateShareInput): Promise<Share> {
    const share: Share = {
      id: createId('shr'),
      artifactId: input.artifactId,
      variationId: input.variationId,
      ownerId: input.ownerId,
      token: createId('share'),
      visibility: input.visibility,
      passwordHash: null,
      revokedAt: null,
      expiresAt: input.expiresAt ?? null,
      createdAt: nowIso(),
    }
    await this.persistShare(share)
    this.shares.set(share.token, share)
    return share
  }

  override async getUserById(userId: string): Promise<User | null> {
    await this.flush()
    const row = (await this.pool.query('select * from users where id = $1', [userId])).rows[0]
    return row ? mapUser(row) : null
  }

  override async getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    await this.flush()
    const row = (await this.pool.query('select * from workspaces where id = $1', [workspaceId])).rows[0]
    return row ? mapWorkspace(row) : null
  }

  override async getPrimaryWorkspaceForUser(userId: string): Promise<Workspace | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select *
      from workspaces
      where owner_id = $1
      order by created_at asc, id asc
      limit 1
    `, [userId])).rows[0]
    return row ? mapWorkspace(row) : null
  }

  override async listUserModelOptions(userId: string): Promise<{ models: UserModelOption[]; defaultModelId: string | null }> {
    await this.flush()
    const rows = (await this.pool.query(`
      select ms.*
      from model_services ms
      left join user_model_access uma
        on uma.model_service_id = ms.id
        and uma.user_id = $1
      where ms.enabled = true
        and coalesce(uma.enabled, true) = true
      order by ms.is_default desc, ms.display_name asc
    `, [userId])).rows
    const models = rows.map(row => toUserModelOption(mapModelService(row)))
    return {
      models,
      defaultModelId: models.find(model => model.isDefault)?.id ?? models[0]?.id ?? null,
    }
  }

  override async getModelServiceById(modelServiceId: string): Promise<ModelService | null> {
    await this.flush()
    const row = (await this.pool.query('select * from model_services where id = $1', [modelServiceId])).rows[0]
    return row ? mapModelService(row) : null
  }

  override async canUserUseModel(userId: string, modelServiceId: string): Promise<boolean> {
    await this.flush()
    const row = (await this.pool.query(`
      select ms.enabled as model_enabled, coalesce(uma.enabled, true) as access_enabled
      from model_services ms
      left join user_model_access uma
        on uma.model_service_id = ms.id
        and uma.user_id = $1
      where ms.id = $2
    `, [userId, modelServiceId])).rows[0]
    return Boolean(row?.model_enabled && row.access_enabled)
  }

  override async getSessionById(sessionId: string): Promise<DesignSession | null> {
    await this.flush()
    const row = (await this.pool.query('select * from design_sessions where id = $1', [sessionId])).rows[0]
    return row ? mapSession(row) : null
  }

  override async getJobById(jobId: string): Promise<DesignJob | null> {
    await this.flush()
    const row = (await this.pool.query('select * from design_jobs where id = $1', [jobId])).rows[0]
    return row ? mapJob(row) : null
  }

  override async getVariationById(variationId: string): Promise<DesignVariation | null> {
    await this.flush()
    const row = (await this.pool.query('select * from design_variations where id = $1', [variationId])).rows[0]
    return row ? mapVariation(row) : null
  }

  override async getArtifactById(artifactId: string): Promise<Artifact | null> {
    await this.flush()
    const row = (await this.pool.query('select * from artifacts where id = $1', [artifactId])).rows[0]
    return row ? mapArtifact(row) : null
  }

  override async listSessions(): Promise<DesignSession[]> {
    await this.flush()
    return (await this.pool.query(`
      select *
      from design_sessions
      order by updated_at desc
    `)).rows.map(mapSession)
  }

  override async getShareByToken(token: string): Promise<Share | null> {
    await this.flush()
    const row = (await this.pool.query('select * from shares where token = $1', [token])).rows[0]
    return row ? mapShare(row) : null
  }

  override async revokeShare(token: string): Promise<Share | null> {
    const existing = await this.getShareByToken(token)
    if (!existing) return null
    const revoked = {
      ...existing,
      revokedAt: new Date().toISOString(),
    }
    await this.persistShare(revoked)
    this.shares.set(token, revoked)
    return revoked
  }

  override async getVariationDetailSnapshot(variationId: string): Promise<VariationDetailSnapshot | null> {
    await this.flush()
    const variationRow = (await this.pool.query('select * from design_variations where id = $1', [variationId])).rows[0]
    if (!variationRow) return null
    const variation = mapVariation(variationRow)
    const jobRow = (await this.pool.query('select * from design_jobs where id = $1', [variation.jobId])).rows[0]
    const artifactRows = (await this.pool.query(`
      select * from artifacts
      where variation_id = $1 and kind = 'html'
      order by version desc, created_at desc
    `, [variationId])).rows
    const artifacts = artifactRows.map(mapArtifact)
    let currentArtifact = variation.currentArtifactId
      ? artifacts.find(artifact => artifact.id === variation.currentArtifactId) ?? null
      : artifacts[0] ?? null
    if (variation.currentArtifactId && !currentArtifact) {
      const currentArtifactRow = (await this.pool.query('select * from artifacts where id = $1', [variation.currentArtifactId])).rows[0]
      currentArtifact = currentArtifactRow ? mapArtifact(currentArtifactRow) : null
    }
    return {
      variation,
      job: jobRow ? mapJob(jobRow) : null,
      currentArtifact,
      artifacts,
    }
  }

  override async getSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    await this.flush()
    const sessionRow = (await this.pool.query('select * from design_sessions where id = $1', [sessionId])).rows[0]
    if (!sessionRow) return null
    const session = mapSession(sessionRow)
    const messages = (await this.pool.query(`
      select * from session_messages
      where session_id = $1
      order by created_at
    `, [sessionId])).rows.map(mapMessage)
    const jobs = (await this.pool.query(`
      select * from design_jobs
      where session_id = $1
      order by created_at desc
    `, [sessionId])).rows.map(mapJob)
    const variations = (await this.pool.query(`
      select v.*
      from design_variations v
      join design_jobs j on j.id = v.job_id
      where j.session_id = $1
      order by v.index asc, v.created_at asc
    `, [sessionId])).rows.map(mapVariation)
    const artifacts = (await this.pool.query(`
      select distinct a.*
      from artifacts a
      left join design_variations v on v.id = a.variation_id
      where a.session_id = $1 or v.session_id = $1
      order by a.created_at desc
    `, [sessionId])).rows.map(mapArtifact)
    return { session, messages, jobs, variations, artifacts }
  }

  override async getJobSnapshot(jobId: string): Promise<JobSnapshot | null> {
    await this.flush()
    const jobRow = (await this.pool.query('select * from design_jobs where id = $1', [jobId])).rows[0]
    if (!jobRow) return null
    const job = mapJob(jobRow)
    const variations = (await this.pool.query(`
      select * from design_variations
      where job_id = $1
      order by index asc, created_at asc
    `, [jobId])).rows.map(mapVariation)
    const artifacts = (await this.pool.query(`
      select a.*
      from artifacts a
      join design_variations v on v.id = a.variation_id
      where v.job_id = $1
      order by a.created_at desc
    `, [jobId])).rows.map(mapArtifact)
    return { job, variations, artifacts }
  }

  override async getSessionWorkspaceContext(sessionId: string): Promise<SessionWorkspaceContext | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select
        s.id as session_id,
        s.user_id as session_user_id,
        s.workspace_id as session_workspace_id,
        s.title as session_title,
        s.mode as session_mode,
        s.source_artifact_id as session_source_artifact_id,
        s.runtime_session_id as session_runtime_session_id,
        s.status as session_status,
        s.last_prompt as session_last_prompt,
        s.metadata as session_metadata,
        s.created_at as session_created_at,
        s.updated_at as session_updated_at,
        w.id as workspace_row_id,
        w.owner_id,
        w.team_id,
        w.name as workspace_name,
        w.mode as workspace_mode,
        w.visibility,
        w.storage_key,
        w.status as workspace_status,
        w.metadata as workspace_metadata,
        w.created_at as workspace_created_at,
        w.updated_at as workspace_updated_at
      from design_sessions s
      left join workspaces w on w.id = s.workspace_id
      where s.id = $1
    `, [sessionId])).rows[0]
    if (!row) return null
    return {
      session: mapSessionFromAliasedRow(row),
      workspace: row.workspace_row_id
        ? mapWorkspace({
            id: row.workspace_row_id,
            owner_id: row.owner_id,
            team_id: row.team_id,
            name: row.workspace_name,
            mode: row.workspace_mode,
            visibility: row.visibility,
            storage_key: row.storage_key,
            status: row.workspace_status,
            metadata: row.workspace_metadata,
            created_at: row.workspace_created_at,
            updated_at: row.workspace_updated_at,
          })
        : null,
    }
  }

  override async getVariationJobContext(variationId: string): Promise<VariationJobContext | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select
        v.id as variation_id,
        v.job_id,
        v.session_id as variation_session_id,
        v.index,
        v.title,
        v.runtime_child_session_id,
        v.runtime_agent_job_id,
        v.status as variation_status,
        v.current_artifact_id,
        v.preview_url,
        v.screenshot_artifact_id,
        v.input_tokens,
        v.output_tokens,
        v.cost_cents,
        v.error_code,
        v.error_message,
        v.created_at as variation_created_at,
        v.updated_at as variation_updated_at,
        j.*
      from design_variations v
      left join design_jobs j on j.id = v.job_id
      where v.id = $1
    `, [variationId])).rows[0]
    if (!row) return null
    return {
      variation: mapVariationFromAliasedRow(row),
      job: row.id ? mapJob(row) : null,
    }
  }

  override async getVariationRefineContext(variationId: string, baseArtifactId: string): Promise<VariationRefineContext | null> {
    await this.flush()
    const context = await this.getVariationJobContext(variationId)
    if (!context) return null
    const sessionRow = (await this.pool.query('select * from design_sessions where id = $1', [context.variation.sessionId])).rows[0]
    const workspaceRow = context.job
      ? (await this.pool.query('select * from workspaces where id = $1', [context.job.workspaceId])).rows[0]
      : null
    const baseArtifactRow = (await this.pool.query('select * from artifacts where id = $1', [baseArtifactId])).rows[0]
    return {
      variation: context.variation,
      job: context.job,
      session: sessionRow ? mapSession(sessionRow) : null,
      workspace: workspaceRow ? mapWorkspace(workspaceRow) : null,
      baseArtifact: baseArtifactRow ? mapArtifact(baseArtifactRow) : null,
    }
  }

  override async getVariationArtifactContext(variationId: string, artifactId: string): Promise<VariationArtifactContext> {
    await this.flush()
    const variationRow = (await this.pool.query('select * from design_variations where id = $1', [variationId])).rows[0]
    const artifactRow = (await this.pool.query('select * from artifacts where id = $1', [artifactId])).rows[0]
    const variation = variationRow ? mapVariation(variationRow) : null
    const artifact = artifactRow ? mapArtifact(artifactRow) : null
    return {
      variation,
      artifact,
      mismatch: Boolean(variation && artifact && artifact.variationId !== variation.id),
    }
  }

  override async getRuntimeSessionContext(sessionId: string): Promise<RuntimeSessionContext | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select
        s.id as session_id,
        s.user_id as session_user_id,
        s.workspace_id as session_workspace_id,
        s.title as session_title,
        s.mode as session_mode,
        s.source_artifact_id as session_source_artifact_id,
        s.runtime_session_id as session_runtime_session_id,
        s.status as session_status,
        s.last_prompt as session_last_prompt,
        s.metadata as session_metadata,
        s.created_at as session_created_at,
        s.updated_at as session_updated_at,
        u.id as user_row_id,
        u.email,
        u.name,
        u.avatar_url,
        u.status as user_status,
        u.memory_namespace,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        w.id as workspace_row_id,
        w.owner_id,
        w.team_id,
        w.name as workspace_name,
        w.mode as workspace_mode,
        w.visibility,
        w.storage_key,
        w.status as workspace_status,
        w.metadata as workspace_metadata,
        w.created_at as workspace_created_at,
        w.updated_at as workspace_updated_at
      from design_sessions s
      left join users u on u.id = s.user_id
      left join workspaces w on w.id = s.workspace_id
      where s.id = $1
    `, [sessionId])).rows[0]
    if (!row) return null
    return {
      session: mapSessionFromAliasedRow(row),
      user: row.user_row_id
        ? mapUser({
            id: row.user_row_id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            status: row.user_status,
            memory_namespace: row.memory_namespace,
            created_at: row.user_created_at,
            updated_at: row.user_updated_at,
          })
        : null,
      workspace: row.workspace_row_id
        ? mapWorkspace({
            id: row.workspace_row_id,
            owner_id: row.owner_id,
            team_id: row.team_id,
            name: row.workspace_name,
            mode: row.workspace_mode,
            visibility: row.visibility,
            storage_key: row.storage_key,
            status: row.workspace_status,
            metadata: row.workspace_metadata,
            created_at: row.workspace_created_at,
            updated_at: row.workspace_updated_at,
          })
        : null,
    }
  }

  override async getCurrentVariationArtifactSnapshot(variationId: string): Promise<CurrentVariationArtifactSnapshot> {
    await this.flush()
    const row = (await this.pool.query(`
      select
        v.id as variation_id,
        v.job_id,
        v.session_id as variation_session_id,
        v.index,
        v.title,
        v.runtime_child_session_id,
        v.runtime_agent_job_id,
        v.status as variation_status,
        v.current_artifact_id,
        v.preview_url,
        v.screenshot_artifact_id,
        v.input_tokens,
        v.output_tokens,
        v.cost_cents,
        v.error_code,
        v.error_message,
        v.created_at as variation_created_at,
        v.updated_at,
        a.*
      from design_variations v
      left join artifacts a on a.id = v.current_artifact_id
      where v.id = $1
    `, [variationId])).rows[0]
    if (!row) {
      return {
        variation: null,
        artifactId: null,
        artifact: null,
        mismatch: false,
      }
    }
    const variation = mapVariation({
      id: row.variation_id,
      job_id: row.job_id,
      session_id: row.variation_session_id,
      index: row.index,
      title: row.title,
      runtime_child_session_id: row.runtime_child_session_id,
      runtime_agent_job_id: row.runtime_agent_job_id,
      status: row.variation_status,
      current_artifact_id: row.current_artifact_id,
      preview_url: row.preview_url,
      screenshot_artifact_id: row.screenshot_artifact_id,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      cost_cents: row.cost_cents,
      error_code: row.error_code,
      error_message: row.error_message,
      created_at: row.variation_created_at,
      updated_at: row.updated_at,
    })
    const artifact = row.id ? mapArtifact(row) : null
    return {
      variation,
      artifactId: variation.currentArtifactId,
      artifact,
      mismatch: Boolean(artifact && artifact.variationId !== variationId),
    }
  }

  override async getVariationAssetArtifacts(variationId: string, parentArtifactId: string): Promise<Artifact[]> {
    await this.flush()
    return (await this.pool.query(`
      select *
      from artifacts
      where variation_id = $1
        and parent_artifact_id = $2
        and kind = 'asset'
        and entry_path is not null
      order by entry_path asc
    `, [variationId, parentArtifactId])).rows.map(mapArtifact)
  }

  override async getVariationAssetArtifact(variationId: string, parentArtifactId: string, assetPath: string): Promise<Artifact | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select *
      from artifacts
      where variation_id = $1
        and parent_artifact_id = $2
        and kind = 'asset'
        and entry_path = $3
      limit 1
    `, [variationId, parentArtifactId, assetPath])).rows[0]
    return row ? mapArtifact(row) : null
  }

  override async getSharedVariationSnapshot(token: string): Promise<SharedVariationSnapshot | null> {
    await this.flush()
    const shareRow = (await this.pool.query('select * from shares where token = $1', [token])).rows[0]
    if (!shareRow) return null
    const share = mapShare(shareRow)
    const variationRow = (await this.pool.query('select * from design_variations where id = $1', [share.variationId])).rows[0]
    const artifactRow = (await this.pool.query('select * from artifacts where id = $1', [share.artifactId])).rows[0]
    return {
      share,
      variation: variationRow ? mapVariation(variationRow) : null,
      artifact: artifactRow ? mapArtifact(artifactRow) : null,
    }
  }

  override async listAdminJobs(filter: AdminJobsFilter = {}): Promise<{ jobs: AdminJobSummary[] }> {
    await this.flush()
    const status = filter.status || null
    const userId = filter.userId || null
    const rows = (await this.pool.query(`
      with variation_summary as (
        select
          job_id,
          count(*) filter (where status = 'completed')::int as completed_variation_count,
          count(*) filter (where status = 'failed')::int as failed_variation_count,
          count(*) filter (where status = 'cancelled')::int as cancelled_variation_count,
          coalesce(sum(input_tokens), 0)::int as total_input_tokens_from_variations,
          coalesce(sum(output_tokens), 0)::int as total_output_tokens_from_variations,
          coalesce(sum(cost_cents), 0)::int as total_cost_cents_from_variations,
          count(*) filter (where error_code is not null)::int as error_count
        from design_variations
        group by job_id
      ),
      artifact_summary as (
        select v.job_id, count(a.id)::int as artifact_count
        from design_variations v
        left join artifacts a on a.variation_id = v.id
        group by v.job_id
      )
      select
        j.*,
        coalesce(vs.completed_variation_count, 0)::int as completed_variation_count,
        coalesce(vs.failed_variation_count, 0)::int as failed_variation_count,
        coalesce(vs.cancelled_variation_count, 0)::int as cancelled_variation_count,
        coalesce(ars.artifact_count, 0)::int as artifact_count,
        coalesce(vs.total_input_tokens_from_variations, 0)::int as total_input_tokens_from_variations,
        coalesce(vs.total_output_tokens_from_variations, 0)::int as total_output_tokens_from_variations,
        coalesce(vs.total_cost_cents_from_variations, 0)::int as total_cost_cents_from_variations,
        coalesce(vs.error_count, 0)::int as error_count
      from design_jobs j
      left join variation_summary vs on vs.job_id = j.id
      left join artifact_summary ars on ars.job_id = j.id
      where ($1::text is null or j.status = $1)
        and ($2::text is null or j.user_id = $2)
      order by j.updated_at desc
      limit 100
    `, [status, userId])).rows
    return {
      jobs: rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        prompt: row.prompt,
        status: row.status,
        variationCount: row.variation_count,
        completedVariationCount: row.completed_variation_count,
        failedVariationCount: row.failed_variation_count,
        cancelledVariationCount: row.cancelled_variation_count,
        artifactCount: row.artifact_count,
        totalInputTokens: row.total_input_tokens_from_variations,
        totalOutputTokens: row.total_output_tokens_from_variations,
        totalCostCents: row.total_cost_cents_from_variations,
        errorCount: row.error_count,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
    }
  }

  override async listAdminArtifacts(filter: AdminArtifactsFilter = {}): Promise<{ artifacts: AdminArtifactSummary[] }> {
    await this.flush()
    const jobId = filter.jobId || null
    const variationId = filter.variationId || null
    const kind = filter.kind || null
    const rows = (await this.pool.query(`
      select
        a.*,
        v.job_id,
        v.preview_url,
        count(s.id)::int as share_count
      from artifacts a
      left join design_variations v on v.id = a.variation_id
      left join shares s on s.artifact_id = a.id
      where ($1::text is null or v.job_id = $1)
        and ($2::text is null or a.variation_id = $2)
        and ($3::text is null or a.kind = $3)
      group by a.id, v.job_id, v.preview_url
      order by a.created_at desc
      limit 100
    `, [jobId, variationId, kind])).rows
    return {
      artifacts: rows.map(row => {
        const artifact = mapArtifact(row)
        return {
          id: artifact.id,
          workspaceId: artifact.workspaceId,
          sessionId: artifact.sessionId,
          jobId: row.job_id ?? null,
          variationId: artifact.variationId,
          parentArtifactId: artifact.parentArtifactId,
          kind: artifact.kind,
          version: artifact.version,
          storageKey: artifact.storageKey,
          entryPath: artifact.entryPath,
          contentHash: artifact.contentHash,
          sizeBytes: artifact.sizeBytes,
          previewUrl: row.preview_url ?? null,
          shareCount: row.share_count,
          createdAt: artifact.createdAt,
        }
      }),
    }
  }

  override async getAdminUserSupport(filter: AdminUserSupportFilter = {}): Promise<{ users: AdminUserSupport[] }> {
    await this.flush()
    const userId = filter.userId?.trim() || null
    const email = filter.email?.trim().toLowerCase() || null
    const users = (await this.pool.query(`
      select *
      from users
      where ($1::text is null or id = $1)
        and ($2::text is null or lower(email) like '%' || $2 || '%')
      order by email asc
      limit 20
    `, [userId, email])).rows.map(mapUser)

    const supportUsers: AdminUserSupport[] = []
    for (const user of users) {
      const workspaces = (await this.pool.query(`
        select id, name, visibility, status
        from workspaces
        where owner_id = $1
        order by name asc
      `, [user.id])).rows.map(row => ({
        id: row.id,
        name: row.name,
        visibility: row.visibility,
        status: row.status,
      }))
      const sessions = (await this.pool.query(`
        select *
        from design_sessions
        where user_id = $1
        order by updated_at desc
        limit 50
      `, [user.id])).rows
      const supportSessions: AdminSupportSession[] = []
      for (const sessionRow of sessions) {
        supportSessions.push(await this.getSqlSupportSession(mapSession(sessionRow)))
      }
      supportUsers.push({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        workspaces,
        sessions: supportSessions,
      })
    }
    return { users: supportUsers }
  }

  override async getAdminCostSummary(): Promise<AdminCostSummary> {
    await this.flush()
    const totals = (await this.pool.query(`
      select
        (select count(*)::int from design_jobs) as job_count,
        count(*)::int as usage_event_count,
        coalesce(sum(input_tokens), 0)::int as input_tokens,
        coalesce(sum(output_tokens), 0)::int as output_tokens,
        coalesce(sum(cost_cents), 0)::int as cost_cents
      from usage_events
    `)).rows[0]
    const byUser = (await this.pool.query(`
      with job_counts as (
        select user_id, count(*)::int as job_count
        from design_jobs
        group by user_id
      ),
      usage_counts as (
        select
          user_id,
          count(*)::int as usage_event_count,
          coalesce(sum(input_tokens), 0)::int as input_tokens,
          coalesce(sum(output_tokens), 0)::int as output_tokens,
          coalesce(sum(cost_cents), 0)::int as cost_cents
        from usage_events
        group by user_id
      ),
      user_ids as (
        select user_id from job_counts
        union
        select user_id from usage_counts
      )
      select
        user_ids.user_id,
        coalesce(job_counts.job_count, 0)::int as job_count,
        coalesce(usage_counts.usage_event_count, 0)::int as usage_event_count,
        coalesce(usage_counts.input_tokens, 0)::int as input_tokens,
        coalesce(usage_counts.output_tokens, 0)::int as output_tokens,
        coalesce(usage_counts.cost_cents, 0)::int as cost_cents
      from user_ids
      left join job_counts on job_counts.user_id = user_ids.user_id
      left join usage_counts on usage_counts.user_id = user_ids.user_id
      order by cost_cents desc, user_ids.user_id
    `)).rows
    return {
      totals: {
        jobCount: totals.job_count,
        usageEventCount: totals.usage_event_count,
        inputTokens: totals.input_tokens,
        outputTokens: totals.output_tokens,
        costCents: totals.cost_cents,
      },
      byUser: byUser.map(row => ({
        userId: row.user_id,
        jobCount: row.job_count,
        usageEventCount: row.usage_event_count,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        costCents: row.cost_cents,
      })),
    }
  }

  override async listAdminModels(): Promise<{ models: AdminModelSummary[] }> {
    await this.flush()
    const rows = (await this.pool.query(`
      select *
      from model_services
      order by is_default desc, display_name asc
    `)).rows
    return {
      models: rows.map(row => toAdminModelSummary(mapModelService(row))),
    }
  }

  override async updateAdminModel(modelServiceId: string, input: { enabled?: boolean; isDefault?: boolean }): Promise<ModelService | null> {
    await this.flush()
    const existing = await this.getModelServiceById(modelServiceId)
    if (!existing) return null
    const now = nowIso()
    if (input.isDefault === true) {
      await this.pool.query(`
        update model_services
        set is_default = false, updated_at = $1
        where id <> $2 and is_default = true
      `, [now, modelServiceId])
      for (const candidate of this.modelServices.values()) {
        if (candidate.id !== modelServiceId && candidate.isDefault) {
          this.modelServices.set(candidate.id, { ...candidate, isDefault: false, updatedAt: now })
        }
      }
    }
    const updated: ModelService = {
      ...existing,
      ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
      ...(typeof input.isDefault === 'boolean' && { isDefault: input.isDefault }),
      updatedAt: now,
    }
    await this.persistModelService(updated)
    this.modelServices.set(updated.id, updated)
    return updated
  }

  override async getAdminUserModelAccess(userId: string): Promise<{ userId: string; access: AdminUserModelAccess[] }> {
    await this.flush()
    await this.ensureUserModelAccessRows(userId)
    const rows = (await this.pool.query(`
      with usage_by_model as (
        select
          metadata->>'modelServiceId' as model_service_id,
          coalesce(sum(input_tokens), 0)::int as input_tokens,
          coalesce(sum(output_tokens), 0)::int as output_tokens,
          coalesce(sum(cost_cents), 0)::int as cost_cents,
          count(*)::int as usage_event_count
        from usage_events
        where user_id = $1
          and metadata ? 'modelServiceId'
        group by metadata->>'modelServiceId'
      )
      select
        uma.*,
        coalesce(ubm.input_tokens, 0)::int as usage_input_tokens,
        coalesce(ubm.output_tokens, 0)::int as usage_output_tokens,
        coalesce(ubm.cost_cents, 0)::int as usage_cost_cents,
        coalesce(ubm.usage_event_count, 0)::int as usage_event_count,
        ms.display_name
      from user_model_access uma
      join model_services ms on ms.id = uma.model_service_id
      left join usage_by_model ubm on ubm.model_service_id = uma.model_service_id
      where uma.user_id = $1
      order by ms.display_name asc
    `, [userId])).rows
    return {
      userId,
      access: rows.map(row => ({
        ...mapUserModelAccess(row),
        usage: {
          inputTokens: row.usage_input_tokens,
          outputTokens: row.usage_output_tokens,
          costCents: row.usage_cost_cents,
          usageEventCount: row.usage_event_count,
        },
      })),
    }
  }

  override async updateUserModelAccess(
    userId: string,
    modelServiceId: string,
    input: {
      enabled?: boolean
      dailyTokenLimit?: number | null
      monthlyCostLimitCents?: number | null
    },
  ): Promise<UserModelAccess> {
    await this.flush()
    const now = nowIso()
    const existing = await this.getUserModelAccess(userId, modelServiceId)
    const access: UserModelAccess = {
      id: existing?.id ?? createId('uma'),
      userId,
      modelServiceId,
      enabled: typeof input.enabled === 'boolean' ? input.enabled : existing?.enabled ?? true,
      dailyTokenLimit: input.dailyTokenLimit !== undefined ? input.dailyTokenLimit : existing?.dailyTokenLimit ?? null,
      monthlyCostLimitCents: input.monthlyCostLimitCents !== undefined ? input.monthlyCostLimitCents : existing?.monthlyCostLimitCents ?? null,
      metadata: existing?.metadata ?? {},
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await this.persistUserModelAccess(access)
    this.userModelAccess.set(userModelAccessKey(userId, modelServiceId), access)
    return access
  }

  private async getSqlSupportSession(session: DesignSession): Promise<AdminSupportSession> {
    const jobs = (await this.pool.query(`
      select *
      from design_jobs
      where session_id = $1
      order by updated_at desc
    `, [session.id])).rows.map(mapJob)
    const latestJob = jobs[0] ?? null
    const variationSummaryRow = (await this.pool.query(`
      select
        count(*) filter (where v.status = 'queued')::int as queued,
        count(*) filter (where v.status = 'running')::int as running,
        count(*) filter (where v.status = 'streaming')::int as streaming,
        count(*) filter (where v.status = 'rendering_preview')::int as rendering_preview,
        count(*) filter (where v.status = 'completed')::int as completed,
        count(*) filter (where v.status = 'failed')::int as failed,
        count(*) filter (where v.status = 'cancelled')::int as cancelled
      from design_variations v
      join design_jobs j on j.id = v.job_id
      where j.session_id = $1
    `, [session.id])).rows[0]
    const failedVariations = (await this.pool.query(`
      select *
      from design_variations v
      join design_jobs j on j.id = v.job_id
      where j.session_id = $1
        and (v.status = 'failed' or v.error_code is not null)
      order by v.updated_at desc
      limit 3
    `, [session.id])).rows.map(mapVariation)
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      title: session.title,
      mode: session.mode,
      status: session.status,
      resumeState: session.runtimeSessionId ? 'runtime_session_available' : 'runtime_session_missing',
      lastPromptPreview: previewText(session.lastPrompt, 140),
      jobCount: jobs.length,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            variationCount: latestJob.variationCount,
            updatedAt: latestJob.updatedAt,
          }
        : null,
      variationSummary: {
        queued: variationSummaryRow.queued,
        running: variationSummaryRow.running,
        streaming: variationSummaryRow.streaming,
        renderingPreview: variationSummaryRow.rendering_preview,
        completed: variationSummaryRow.completed,
        failed: variationSummaryRow.failed,
        cancelled: variationSummaryRow.cancelled,
      },
      failureSummary: summarizeSupportIssue(latestJob, failedVariations),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }
  }

  private enqueueWrite(write: () => Promise<unknown>): void {
    this.writeTail = this.writeTail.then(write, write)
  }

  private async withWrite<T>(write: () => Promise<T>): Promise<T> {
    const next = this.writeTail.then(write, write)
    this.writeTail = next.then(() => undefined, () => undefined)
    return next
  }

  private async persistSession(session: DesignSession): Promise<void> {
    await this.pool.query(`
      insert into design_sessions (id, user_id, workspace_id, title, mode, source_artifact_id, runtime_session_id, status, last_prompt, metadata, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
      on conflict (id) do update set
        title = excluded.title,
        runtime_session_id = excluded.runtime_session_id,
        status = excluded.status,
        last_prompt = excluded.last_prompt,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      session.id, session.userId, session.workspaceId, session.title, session.mode, session.sourceArtifactId,
      session.runtimeSessionId, session.status, session.lastPrompt, JSON.stringify(session.metadata), session.createdAt, session.updatedAt,
    ])
  }

  private async persistMessage(message: SessionMessage): Promise<void> {
    await this.pool.query(`
      insert into session_messages (id, session_id, role, content, metadata, created_at)
      values ($1,$2,$3,$4,$5::jsonb,$6)
      on conflict (id) do nothing
    `, [message.id, message.sessionId, message.role, message.content, JSON.stringify(message.metadata), message.createdAt])
  }

  private async persistJob(job: DesignJob): Promise<void> {
    await this.pool.query(`
      insert into design_jobs (id, session_id, user_id, workspace_id, prompt, source_mode, variation_count, template_requirements, status, total_input_tokens, total_output_tokens, total_cost_cents, started_at, completed_at, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)
      on conflict (id) do update set
        status = excluded.status,
        total_input_tokens = excluded.total_input_tokens,
        total_output_tokens = excluded.total_output_tokens,
        total_cost_cents = excluded.total_cost_cents,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    `, [
      job.id, job.sessionId, job.userId, job.workspaceId, job.prompt, job.sourceMode, job.variationCount,
      JSON.stringify(job.templateRequirements), job.status, job.totalInputTokens, job.totalOutputTokens,
      job.totalCostCents, job.startedAt, job.completedAt, job.createdAt, job.updatedAt,
    ])
  }

  private async persistVariation(variation: DesignVariation): Promise<void> {
    await this.pool.query(`
      insert into design_variations (id, job_id, session_id, index, title, runtime_child_session_id, runtime_agent_job_id, status, current_artifact_id, preview_url, screenshot_artifact_id, input_tokens, output_tokens, cost_cents, error_code, error_message, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      on conflict (id) do update set
        title = excluded.title,
        runtime_child_session_id = excluded.runtime_child_session_id,
        runtime_agent_job_id = excluded.runtime_agent_job_id,
        status = excluded.status,
        current_artifact_id = excluded.current_artifact_id,
        preview_url = excluded.preview_url,
        screenshot_artifact_id = excluded.screenshot_artifact_id,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cost_cents = excluded.cost_cents,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `, [
      variation.id, variation.jobId, variation.sessionId, variation.index, variation.title, variation.runtimeChildSessionId,
      variation.runtimeAgentJobId, variation.status, variation.currentArtifactId, variation.previewUrl, variation.screenshotArtifactId,
      variation.inputTokens, variation.outputTokens, variation.costCents, variation.errorCode, variation.errorMessage,
      variation.createdAt, variation.updatedAt,
    ])
  }

  private async persistArtifact(artifact: Artifact): Promise<void> {
    await this.pool.query(`
      insert into artifacts (id, workspace_id, session_id, variation_id, parent_artifact_id, kind, version, storage_key, entry_path, content_hash, size_bytes, metadata, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
      on conflict (id) do update set
        storage_key = excluded.storage_key,
        entry_path = excluded.entry_path,
        content_hash = excluded.content_hash,
        size_bytes = excluded.size_bytes,
        metadata = excluded.metadata
    `, [
      artifact.id, artifact.workspaceId, artifact.sessionId, artifact.variationId, artifact.parentArtifactId,
      artifact.kind, artifact.version, artifact.storageKey, artifact.entryPath, artifact.contentHash,
      artifact.sizeBytes, JSON.stringify(artifact.metadata), artifact.createdAt,
    ])
  }

  private async persistAnnotationBatch(batch: AnnotationBatch): Promise<void> {
    await this.pool.query(`
      insert into annotation_batches (id, variation_id, artifact_id, user_id, shapes, prompt_suffix, created_at)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7)
      on conflict (id) do nothing
    `, [batch.id, batch.variationId, batch.artifactId, batch.userId, JSON.stringify(batch.shapes), batch.promptSuffix, batch.createdAt])
  }

  private async persistShare(share: Share): Promise<void> {
    await this.pool.query(`
      insert into shares (id, artifact_id, variation_id, owner_id, token, visibility, password_hash, revoked_at, expires_at, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (token) do update set
        visibility = excluded.visibility,
        password_hash = excluded.password_hash,
        revoked_at = excluded.revoked_at,
        expires_at = excluded.expires_at
    `, [
      share.id, share.artifactId, share.variationId, share.ownerId, share.token, share.visibility,
      share.passwordHash, share.revokedAt, share.expiresAt, share.createdAt,
    ])
  }

  private async persistUsageEvent(event: UsageEvent): Promise<UsageEvent> {
    const row = (await this.pool.query(`
      insert into usage_events (id, idempotency_key, kind, user_id, workspace_id, session_id, job_id, variation_id, artifact_id, input_tokens, output_tokens, cost_cents, metadata, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
      on conflict (idempotency_key) do nothing
      returning *
    `, [
      event.id, event.idempotencyKey, event.kind, event.userId, event.workspaceId, event.sessionId, event.jobId, event.variationId,
      event.artifactId, event.inputTokens, event.outputTokens, event.costCents, JSON.stringify(event.metadata), event.createdAt,
    ])).rows[0]
    if (row) return mapUsageEvent(row)
    const existing = (await this.pool.query('select * from usage_events where idempotency_key = $1', [event.idempotencyKey])).rows[0]
    return mapUsageEvent(existing)
  }

  private async persistAuditLog(audit: AuditLog): Promise<void> {
    await this.pool.query(`
      insert into audit_logs (id, request_id, operator_user_id, operator_role, action, target_type, target_id, reason, metadata, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
      on conflict (id) do nothing
    `, [
      audit.id, audit.requestId, audit.operatorUserId, audit.operatorRole, audit.action, audit.targetType,
      audit.targetId, audit.reason, JSON.stringify(audit.metadata), audit.createdAt,
    ])
  }

  private async persistModelService(model: ModelService): Promise<void> {
    await this.pool.query(`
      insert into model_services (id, provider, model_id, display_name, description, enabled, is_default, capabilities, context_window, input_token_cost_cents, output_token_cost_cents, metadata, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13,$14)
      on conflict (id) do update set
        provider = excluded.provider,
        model_id = excluded.model_id,
        display_name = excluded.display_name,
        description = excluded.description,
        enabled = excluded.enabled,
        is_default = excluded.is_default,
        capabilities = excluded.capabilities,
        context_window = excluded.context_window,
        input_token_cost_cents = excluded.input_token_cost_cents,
        output_token_cost_cents = excluded.output_token_cost_cents,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      model.id, model.provider, model.modelId, model.displayName, model.description, model.enabled, model.isDefault,
      JSON.stringify(model.capabilities), model.contextWindow, model.inputTokenCostCents, model.outputTokenCostCents,
      JSON.stringify(model.metadata), model.createdAt, model.updatedAt,
    ])
  }

  private async persistUserModelAccess(access: UserModelAccess): Promise<void> {
    await this.pool.query(`
      insert into user_model_access (id, user_id, model_service_id, enabled, daily_token_limit, monthly_cost_limit_cents, metadata, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      on conflict (user_id, model_service_id) do update set
        enabled = excluded.enabled,
        daily_token_limit = excluded.daily_token_limit,
        monthly_cost_limit_cents = excluded.monthly_cost_limit_cents,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      access.id, access.userId, access.modelServiceId, access.enabled, access.dailyTokenLimit,
      access.monthlyCostLimitCents, JSON.stringify(access.metadata), access.createdAt, access.updatedAt,
    ])
  }

  private async getUserModelAccess(userId: string, modelServiceId: string): Promise<UserModelAccess | null> {
    const row = (await this.pool.query(`
      select *
      from user_model_access
      where user_id = $1 and model_service_id = $2
    `, [userId, modelServiceId])).rows[0]
    return row ? mapUserModelAccess(row) : null
  }

  private async ensureUserModelAccessRows(userId: string): Promise<void> {
    const models = (await this.pool.query('select id from model_services')).rows as Array<{ id: string }>
    for (const model of models) {
      const existing = await this.getUserModelAccess(userId, model.id)
      if (existing) continue
      const now = nowIso()
      const access: UserModelAccess = {
        id: createId('uma'),
        userId,
        modelServiceId: model.id,
        enabled: true,
        dailyTokenLimit: null,
        monthlyCostLimitCents: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      }
      await this.persistUserModelAccess(access)
      this.userModelAccess.set(userModelAccessKey(userId, model.id), access)
    }
  }
}

async function ensureSchema(connectionString: string, schema: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid PostgreSQL schema name: ${schema}`)
  }
  const pool = new Pool({ connectionString })
  try {
    await pool.query(`create schema if not exists ${schema}`)
  } finally {
    await pool.end()
  }
}

function defaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../db/migrations')
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
    status: row.status,
    memoryNamespace: row.memory_namespace,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapWorkspace(row: any): Workspace {
  return {
    id: row.id,
    ownerId: row.owner_id,
    teamId: row.team_id,
    name: row.name,
    mode: row.mode,
    visibility: row.visibility,
    storageKey: row.storage_key,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapSession(row: any): DesignSession {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    title: row.title,
    mode: row.mode,
    sourceArtifactId: row.source_artifact_id,
    runtimeSessionId: row.runtime_session_id,
    status: row.status,
    lastPrompt: row.last_prompt,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapSessionFromAliasedRow(row: any): DesignSession {
  return {
    id: row.session_id,
    userId: row.session_user_id,
    workspaceId: row.session_workspace_id,
    title: row.session_title,
    mode: row.session_mode,
    sourceArtifactId: row.session_source_artifact_id,
    runtimeSessionId: row.session_runtime_session_id,
    status: row.session_status,
    lastPrompt: row.session_last_prompt,
    metadata: row.session_metadata ?? {},
    createdAt: toIso(row.session_created_at),
    updatedAt: toIso(row.session_updated_at),
  }
}

function mapMessage(row: any): SessionMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  }
}

function mapJob(row: any): DesignJob {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    prompt: row.prompt,
    sourceMode: row.source_mode,
    variationCount: row.variation_count,
    templateRequirements: row.template_requirements ?? {},
    status: row.status,
    totalInputTokens: row.total_input_tokens,
    totalOutputTokens: row.total_output_tokens,
    totalCostCents: row.total_cost_cents,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapVariation(row: any): DesignVariation {
  return {
    id: row.id,
    jobId: row.job_id,
    sessionId: row.session_id,
    index: row.index,
    title: row.title,
    runtimeChildSessionId: row.runtime_child_session_id,
    runtimeAgentJobId: row.runtime_agent_job_id,
    status: row.status,
    currentArtifactId: row.current_artifact_id,
    previewUrl: row.preview_url,
    screenshotArtifactId: row.screenshot_artifact_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costCents: row.cost_cents,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapVariationFromAliasedRow(row: any): DesignVariation {
  return {
    id: row.variation_id,
    jobId: row.job_id,
    sessionId: row.variation_session_id,
    index: row.index,
    title: row.title,
    runtimeChildSessionId: row.runtime_child_session_id,
    runtimeAgentJobId: row.runtime_agent_job_id,
    status: row.variation_status,
    currentArtifactId: row.current_artifact_id,
    previewUrl: row.preview_url,
    screenshotArtifactId: row.screenshot_artifact_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costCents: row.cost_cents,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: toIso(row.variation_created_at),
    updatedAt: toIso(row.variation_updated_at),
  }
}

function mapArtifact(row: any): Artifact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    variationId: row.variation_id,
    parentArtifactId: row.parent_artifact_id,
    kind: row.kind,
    version: row.version,
    storageKey: row.storage_key,
    entryPath: row.entry_path,
    contentHash: row.content_hash,
    sizeBytes: Number(row.size_bytes),
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  }
}

function mapShare(row: any): Share {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    variationId: row.variation_id,
    ownerId: row.owner_id,
    token: row.token,
    visibility: row.visibility,
    passwordHash: row.password_hash,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    createdAt: toIso(row.created_at),
  }
}

function mapModelService(row: any): ModelService {
  return {
    id: row.id,
    provider: row.provider,
    modelId: row.model_id,
    displayName: row.display_name,
    description: row.description,
    enabled: row.enabled,
    isDefault: row.is_default,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    contextWindow: row.context_window,
    inputTokenCostCents: row.input_token_cost_cents,
    outputTokenCostCents: row.output_token_cost_cents,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapUserModelAccess(row: any): UserModelAccess {
  return {
    id: row.id,
    userId: row.user_id,
    modelServiceId: row.model_service_id,
    enabled: row.enabled,
    dailyTokenLimit: row.daily_token_limit,
    monthlyCostLimitCents: row.monthly_cost_limit_cents,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toUserModelOption(model: ModelService): UserModelOption {
  return {
    id: model.id,
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description,
    isDefault: model.isDefault,
    capabilities: model.capabilities,
    contextWindow: model.contextWindow,
  }
}

function toAdminModelSummary(model: ModelService): AdminModelSummary {
  return {
    ...toUserModelOption(model),
    enabled: model.enabled,
    inputTokenCostCents: model.inputTokenCostCents,
    outputTokenCostCents: model.outputTokenCostCents,
    metadata: model.metadata,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  }
}

function mapAnnotationBatch(row: any): AnnotationBatch {
  return {
    id: row.id,
    variationId: row.variation_id,
    artifactId: row.artifact_id,
    userId: row.user_id,
    shapes: row.shapes ?? [],
    promptSuffix: row.prompt_suffix,
    createdAt: toIso(row.created_at),
  }
}

function mapAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    requestId: row.request_id,
    operatorUserId: row.operator_user_id,
    operatorRole: row.operator_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  }
}

function mapUsageEvent(row: any): UsageEvent {
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    kind: row.kind,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    jobId: row.job_id,
    variationId: row.variation_id,
    artifactId: row.artifact_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costCents: row.cost_cents,
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
  }
}

function previewText(value: string | null, maxLength: number): string | null {
  if (!value) return null
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

function summarizeSupportIssue(
  latestJob: DesignJob | null,
  failedVariations: DesignVariation[],
): { severity: 'ok' | 'warning' | 'blocked'; message: string; failedVariationCount: number; examples: Array<{ variationId: string; errorCode: string | null; message: string | null }> } {
  if (!latestJob) {
    return {
      severity: 'warning',
      message: 'No jobs have been created for this session.',
      failedVariationCount: 0,
      examples: [],
    }
  }
  if (latestJob.status === 'failed') {
    return {
      severity: 'blocked',
      message: `Latest job ${latestJob.id} failed.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (failedVariations.length > 0) {
    return {
      severity: 'warning',
      message: `${failedVariations.length} variation(s) reported errors.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (latestJob.status === 'queued' || latestJob.status === 'running') {
    return {
      severity: 'warning',
      message: `Latest job ${latestJob.id} is still ${latestJob.status}.`,
      failedVariationCount: 0,
      examples: [],
    }
  }
  return {
    severity: 'ok',
    message: 'No job or variation failures detected.',
    failedVariationCount: 0,
    examples: [],
  }
}

function toFailureExample(variation: DesignVariation) {
  return {
    variationId: variation.id,
    errorCode: variation.errorCode,
    message: previewText(variation.errorMessage, 120),
  }
}

function userModelAccessKey(userId: string, modelServiceId: string): string {
  return `${userId}:${modelServiceId}`
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
