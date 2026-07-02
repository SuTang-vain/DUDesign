import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { Artifact, DesignJob, DesignSession, DesignVariation, ModelService, Share, UsageEvent, User, UserModelAccess, Workspace, WorkspaceMember } from '@dudesign/domain'
import type { DesignEvent, DesignTemplatePack, UserCapabilityPreference } from '@dudesign/contracts'
import { InMemoryStore, type AnnotationBatch, type AuditLog, type AuthIdentity, type AuthSession, type SessionMessage } from './store.js'
import { createId, nowIso } from './id.js'
import { officialDesignTemplatePacks } from './officialDesignTemplatePacks.js'
import { adminPreviewText, redactAdminStorageKey, summarizeAdminSupportIssue } from './adminRedaction.js'
import type {
  AdminArtifactsFilter,
  AdminArtifactSummary,
  AdminCostSummary,
  AdminJobsFilter,
  AdminJobSummary,
  AdminMemoryGovernance,
  AdminMemoryUserSummary,
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
  DesignTemplatePackVersion,
  JobSnapshot,
  ModelSyncDiffItem,
  RuntimeSessionContext,
  SessionSnapshot,
  SessionWorkspaceContext,
  SharedVariationSnapshot,
  UpsertDiscoveredModelServicesResult,
  VariationArtifactContext,
  VariationDetailSnapshot,
  VariationJobContext,
  VariationRefineContext,
  UserModelOption,
} from './repository.js'
import { createHash } from 'node:crypto'

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
      .filter(file => /^\d+.*\.sql$/.test(file))
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
        insert into users (id, email, name, avatar_url, status, memory_namespace, metadata, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        on conflict (id) do nothing
      `, [
        user.id,
        user.email,
        user.name,
        user.avatarUrl,
        user.status,
        user.memoryNamespace,
        JSON.stringify(user.metadata),
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
      await this.persistWorkspaceMember({
        workspaceId: workspace.id,
        userId: workspace.ownerId,
        role: 'owner',
        status: 'active',
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
    }
    for (const model of this.modelServices.values()) {
      await this.persistModelService(model)
    }
    for (const template of officialDesignTemplatePacks) {
      await this.persistDesignTemplatePack(template)
    }
  }

  async hydrate(): Promise<void> {
    this.users.clear()
    this.workspaces.clear()
    this.workspaceMembers.clear()
    this.sessions.clear()
    this.messages.clear()
    this.jobs.clear()
    this.variations.clear()
    this.artifacts.clear()
    this.shares.clear()
    this.modelServices.clear()
    this.userModelAccess.clear()
    this.userCapabilityPreferences.clear()
    this.designTemplatePacks.clear()
    this.designTemplatePackVersions.clear()
    this.annotationBatches.clear()
    this.auditLogs.splice(0, this.auditLogs.length)
    this.usageEvents.splice(0, this.usageEvents.length)
    this.designEvents.clear()
    this.authIdentities.clear()
    this.authSessions.clear()

    for (const row of (await this.pool.query('select * from users')).rows) this.users.set(row.id, mapUser(row))
    for (const row of (await this.pool.query('select * from workspaces')).rows) this.workspaces.set(row.id, mapWorkspace(row))
    for (const row of (await this.pool.query('select * from workspace_members')).rows) {
      const member = mapWorkspaceMember(row)
      this.workspaceMembers.set(workspaceMemberKey(member.workspaceId, member.userId), member)
    }
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
    for (const row of (await this.pool.query('select * from user_preferences')).rows) {
      this.userCapabilityPreferences.set(row.user_id, mapUserCapabilityPreference(row))
    }
    for (const row of (await this.pool.query(`
      select t.*, v.pack
      from design_templates t
      left join design_template_versions v on v.template_id = t.id and v.version = t.current_version
    `)).rows) {
      this.designTemplatePacks.set(row.id, mapDesignTemplatePackRow(row))
    }
    for (const row of (await this.pool.query('select * from design_template_versions order by created_at')).rows) {
      const version = mapDesignTemplatePackVersion(row)
      this.designTemplatePackVersions.set(designTemplatePackVersionKey(version.templateId, version.version), version)
    }
    for (const row of (await this.pool.query('select * from annotation_batches')).rows) this.annotationBatches.set(row.id, mapAnnotationBatch(row))
    for (const row of (await this.pool.query('select * from audit_logs order by created_at')).rows) this.auditLogs.push(mapAuditLog(row))
    for (const row of (await this.pool.query('select * from usage_events order by created_at')).rows) this.usageEvents.push(mapUsageEvent(row))
    for (const row of (await this.pool.query('select * from auth_identities')).rows) {
      const identity = mapAuthIdentity(row)
      this.authIdentities.set(authIdentityKey(identity.provider, identity.providerSubject), identity)
    }
    for (const row of (await this.pool.query('select * from auth_sessions')).rows) {
      const session = mapAuthSession(row)
      this.authSessions.set(session.tokenHash, session)
    }
    for (const row of (await this.pool.query('select event from design_events order by created_at, id')).rows) {
      const event = mapDesignEvent(row)
      if (!event.jobId) continue
      const events = this.designEvents.get(event.jobId) ?? []
      events.push(event)
      this.designEvents.set(event.jobId, events)
    }
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

  override async saveUserCapabilityPreference(userId: string, preference: UserCapabilityPreference): Promise<UserCapabilityPreference> {
    await this.persistUserCapabilityPreference(userId, preference)
    this.userCapabilityPreferences.set(userId, preference)
    return preference
  }

  override async getUserCapabilityPreference(userId: string): Promise<UserCapabilityPreference | null> {
    const cached = this.userCapabilityPreferences.get(userId)
    if (cached) return cached

    const row = (await this.pool.query('select * from user_preferences where user_id = $1', [userId])).rows[0]
    if (!row) return null

    const preference = mapUserCapabilityPreference(row)
    this.userCapabilityPreferences.set(userId, preference)
    return preference
  }

  override async listDesignTemplatePacks(userId: string, workspaceId?: string | null): Promise<DesignTemplatePack[]> {
    const rows = (await this.pool.query(`
      select t.*, v.pack
      from design_templates t
      left join design_template_versions v on v.template_id = t.id and v.version = t.current_version
      where t.status not in ('archived', 'disabled')
        and (
          (t.source = 'official' and t.visibility = 'public')
          or t.created_by_user_id = $1
          or ($2::text is not null and t.visibility = 'workspace' and t.workspace_id = $2)
        )
      order by
        case when t.source = 'official' then 0 else 1 end,
        t.sort_key asc,
        t.name asc,
        t.id asc
    `, [userId, workspaceId ?? null])).rows
    const templates = rows.map(mapDesignTemplatePackRow)
    for (const template of templates) this.designTemplatePacks.set(template.id, template)
    return templates
  }

  override async getDesignTemplatePackById(templateId: string, userId: string, workspaceId?: string | null): Promise<DesignTemplatePack | null> {
    const row = (await this.pool.query(`
      select t.*, v.pack
      from design_templates t
      left join design_template_versions v on v.template_id = t.id and v.version = t.current_version
      where t.id = $1
        and t.status not in ('archived', 'disabled')
        and (
          (t.source = 'official' and t.visibility = 'public')
          or t.created_by_user_id = $2
          or ($3::text is not null and t.visibility = 'workspace' and t.workspace_id = $3)
        )
    `, [templateId, userId, workspaceId ?? null])).rows[0]
    if (!row) return null
    const template = mapDesignTemplatePackRow(row)
    this.designTemplatePacks.set(template.id, template)
    return template
  }

  override async saveDesignTemplatePack(template: DesignTemplatePack): Promise<DesignTemplatePack> {
    await this.persistDesignTemplatePack(template)
    this.designTemplatePacks.set(template.id, template)
    const version = await this.getDesignTemplatePackVersion(template.id, template.version, template.createdByUserId ?? this.devUser.id)
    if (version) this.designTemplatePackVersions.set(designTemplatePackVersionKey(version.templateId, version.version), version)
    return template
  }

  override async getDesignTemplatePackVersion(templateId: string, version: string, userId: string, workspaceId?: string | null): Promise<DesignTemplatePackVersion | null> {
    const readable = await this.getDesignTemplatePackById(templateId, userId, workspaceId)
    if (!readable) return null
    const row = (await this.pool.query(`
      select *
      from design_template_versions
      where template_id = $1 and version = $2
    `, [templateId, version])).rows[0]
    if (!row) return null
    const templateVersion = mapDesignTemplatePackVersion(row)
    this.designTemplatePackVersions.set(designTemplatePackVersionKey(templateVersion.templateId, templateVersion.version), templateVersion)
    return templateVersion
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

  override async appendDesignEvent(event: DesignEvent): Promise<DesignEvent> {
    const jobId = event.jobId
    if (!jobId) return event
    const normalized = normalizeDesignEventForPersistence(event)
    await this.persistDesignEvent(normalized)
    const events = this.designEvents.get(jobId) ?? []
    events.push(normalized)
    this.designEvents.set(jobId, events)
    return normalized
  }

  override async listDesignEvents(jobId: string): Promise<DesignEvent[]> {
    const rows = (await this.pool.query(`
      select event
      from design_events
      where job_id = $1
      order by created_at, id
    `, [jobId])).rows
    return rows.map(mapDesignEvent)
  }

  override async applyVariationEvent(input: ApplyVariationEventInput): Promise<void> {
    const existing = await this.getVariationById(input.variationId)
    if (!existing) return
    const variation: DesignVariation = {
      ...existing,
      status: input.status ?? existing.status,
      currentArtifactId: input.artifactId ?? existing.currentArtifactId,
      previewUrl: input.previewUrl ?? existing.previewUrl,
      screenshotArtifactId: input.screenshotArtifactId ?? existing.screenshotArtifactId,
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

  override async setVariationCurrentArtifact(variationId: string, artifactId: string, previewUrl: string | null): Promise<DesignVariation | null> {
    const existing = await this.getVariationById(variationId)
    if (!existing) return null
    const variation: DesignVariation = {
      ...existing,
      currentArtifactId: artifactId,
      previewUrl,
      updatedAt: nowIso(),
    }
    await this.persistVariation(variation)
    this.variations.set(variationId, variation)
    return variation
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
    const version = input.version ?? await this.nextArtifactVersion(input.variationId ?? null, input.kind)
    const artifact: Artifact = {
      id: createId('art'),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variationId ?? null,
      parentArtifactId: input.parentArtifactId ?? null,
      kind: input.kind,
      version,
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

  private async nextArtifactVersion(variationId: string | null, kind: Artifact['kind']): Promise<number> {
    if (!variationId || kind !== 'html') return 1
    await this.flush()
    const row = (await this.pool.query(`
      select coalesce(max(version), 0)::int + 1 as next_version
      from artifacts
      where variation_id = $1
        and kind = 'html'
    `, [variationId])).rows[0]
    return row?.next_version ?? 1
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

  override async getUserByEmail(email: string): Promise<User | null> {
    await this.flush()
    const row = (await this.pool.query('select * from users where lower(email) = lower($1)', [email.trim()])).rows[0]
    return row ? mapUser(row) : null
  }

  override async updateUserStatus(userId: string, status: User['status']): Promise<User | null> {
    const row = (await this.pool.query(`
      update users
      set status = $2,
          updated_at = $3
      where id = $1
      returning *
    `, [userId, status, nowIso()])).rows[0]
    if (!row) return null
    const user = mapUser(row)
    this.users.set(user.id, user)
    return user
  }

  override async updateUserMetadata(userId: string, metadata: Record<string, unknown>): Promise<User | null> {
    const row = (await this.pool.query(`
      update users
      set metadata = $2::jsonb,
          updated_at = $3
      where id = $1
      returning *
    `, [userId, JSON.stringify(metadata), nowIso()])).rows[0]
    if (!row) return null
    const user = mapUser(row)
    this.users.set(user.id, user)
    return user
  }

  override async createUserWithWorkspace(input: { email: string; name?: string | null }): Promise<{ user: User; workspace: Workspace }> {
    const now = nowIso()
    const user: User = {
      id: createId('usr'),
      email: input.email.trim().toLowerCase(),
      name: input.name?.trim() || null,
      avatarUrl: null,
      status: 'active',
      memoryNamespace: '',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    const normalizedUser = {
      ...user,
      memoryNamespace: `memory:user:${user.id}`,
    }
    const workspace: Workspace = {
      id: createId('ws'),
      ownerId: normalizedUser.id,
      teamId: null,
      name: 'Personal Workspace',
      mode: 'hosted',
      visibility: 'private',
      storageKey: '',
      status: 'active',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    const normalizedWorkspace = {
      ...workspace,
      storageKey: `workspaces/${workspace.id}`,
    }
    await this.withWrite(async () => {
      await this.persistUser(normalizedUser)
      await this.persistWorkspace(normalizedWorkspace)
      await this.persistWorkspaceMember({
        workspaceId: normalizedWorkspace.id,
        userId: normalizedUser.id,
        role: 'owner',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    })
    this.users.set(normalizedUser.id, normalizedUser)
    this.workspaces.set(normalizedWorkspace.id, normalizedWorkspace)
    this.workspaceMembers.set(workspaceMemberKey(normalizedWorkspace.id, normalizedUser.id), {
      workspaceId: normalizedWorkspace.id,
      userId: normalizedUser.id,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    return { user: normalizedUser, workspace: normalizedWorkspace }
  }

  override async getAuthIdentityByProvider(provider: AuthIdentity['provider'], providerSubject: string): Promise<AuthIdentity | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select *
      from auth_identities
      where provider = $1 and provider_subject = $2
    `, [provider, providerSubject.trim().toLowerCase()])).rows[0]
    return row ? mapAuthIdentity(row) : null
  }

  override async createAuthIdentity(input: {
    userId: string
    provider: AuthIdentity['provider']
    providerSubject: string
    passwordHash?: string | null
    verifiedAt?: string | null
  }): Promise<AuthIdentity> {
    const now = nowIso()
    const identity: AuthIdentity = {
      id: createId('aid'),
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject.trim().toLowerCase(),
      passwordHash: input.passwordHash ?? null,
      verifiedAt: input.verifiedAt ?? null,
      createdAt: now,
      updatedAt: now,
    }
    await this.persistAuthIdentity(identity)
    this.authIdentities.set(authIdentityKey(identity.provider, identity.providerSubject), identity)
    return identity
  }

  override async createAuthSession(input: {
    userId: string
    tokenHash: string
    userAgent?: string | null
    ipHash?: string | null
    expiresAt: string
  }): Promise<AuthSession> {
    const now = nowIso()
    const session: AuthSession = {
      id: createId('authses'),
      userId: input.userId,
      tokenHash: input.tokenHash,
      userAgent: input.userAgent ?? null,
      ipHash: input.ipHash ?? null,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: now,
      lastSeenAt: now,
    }
    await this.persistAuthSession(session)
    this.authSessions.set(session.tokenHash, session)
    return session
  }

  override async getAuthSessionByTokenHash(tokenHash: string): Promise<AuthSession | null> {
    await this.flush()
    const row = (await this.pool.query('select * from auth_sessions where token_hash = $1', [tokenHash])).rows[0]
    return row ? mapAuthSession(row) : null
  }

  override async touchAuthSession(tokenHash: string): Promise<AuthSession | null> {
    const row = (await this.pool.query(`
      update auth_sessions
      set last_seen_at = $2
      where token_hash = $1
      returning *
    `, [tokenHash, nowIso()])).rows[0]
    if (!row) return null
    const session = mapAuthSession(row)
    this.authSessions.set(session.tokenHash, session)
    return session
  }

  override async revokeAuthSession(tokenHash: string): Promise<AuthSession | null> {
    const row = (await this.pool.query(`
      update auth_sessions
      set revoked_at = coalesce(revoked_at, $2)
      where token_hash = $1
      returning *
    `, [tokenHash, nowIso()])).rows[0]
    if (!row) return null
    const session = mapAuthSession(row)
    this.authSessions.set(session.tokenHash, session)
    return session
  }

  override async getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
    await this.flush()
    const row = (await this.pool.query('select * from workspaces where id = $1', [workspaceId])).rows[0]
    return row ? mapWorkspace(row) : null
  }

  override async getPrimaryWorkspaceForUser(userId: string): Promise<Workspace | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select w.*
      from workspaces w
      left join workspace_members wm
        on wm.workspace_id = w.id
        and wm.user_id = $1
        and wm.status = 'active'
      where w.owner_id = $1
        or wm.user_id is not null
      order by w.created_at asc, w.id asc
      limit 1
    `, [userId])).rows[0]
    return row ? mapWorkspace(row) : null
  }

  override async getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select *
      from workspace_members
      where workspace_id = $1 and user_id = $2
    `, [workspaceId, userId])).rows[0]
    return row ? mapWorkspaceMember(row) : null
  }

  override async upsertWorkspaceMember(input: {
    workspaceId: string
    userId: string
    role: WorkspaceMember['role']
    status?: WorkspaceMember['status']
  }): Promise<WorkspaceMember> {
    const existing = await this.getWorkspaceMember(input.workspaceId, input.userId)
    const now = nowIso()
    const member: WorkspaceMember = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await this.persistWorkspaceMember(member)
    this.workspaceMembers.set(workspaceMemberKey(member.workspaceId, member.userId), member)
    return member
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

  override async listSharesForArtifact(artifactId: string): Promise<Share[]> {
    await this.flush()
    return (await this.pool.query(`
      select *
      from shares
      where artifact_id = $1
      order by created_at desc
    `, [artifactId])).rows.map(mapShare)
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
      where variation_id = $1
      order by version desc,
        case kind
          when 'html' then 0
          when 'asset' then 1
          when 'export_zip' then 2
          else 3
        end asc,
        coalesce(entry_path, id) asc,
        created_at desc
    `, [variationId])).rows
    const artifacts = artifactRows.map(mapArtifact)
    let currentArtifact = variation.currentArtifactId
      ? artifacts.find(artifact => artifact.id === variation.currentArtifactId) ?? null
      : artifacts.find(artifact => artifact.kind === 'html') ?? null
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

  override async getExportArtifactForSource(variationId: string, sourceArtifactId: string): Promise<Artifact | null> {
    await this.flush()
    const row = (await this.pool.query(`
      select *
      from artifacts
      where variation_id = $1
        and parent_artifact_id = $2
        and kind = 'export_zip'
      order by created_at desc
      limit 1
    `, [variationId, sourceArtifactId])).rows[0]
    return row ? mapArtifact(row) : null
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
        u.metadata as user_metadata,
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
            metadata: row.user_metadata,
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
    const workspaceId = filter.workspaceId || null
    const sessionId = filter.sessionId || null
    const createdFrom = filter.createdFrom || null
    const createdTo = filter.createdTo || null
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
        and ($3::text is null or j.workspace_id = $3)
        and ($4::text is null or j.session_id = $4)
        and ($5::timestamptz is null or j.created_at >= $5)
        and ($6::timestamptz is null or j.created_at <= $6)
      order by j.updated_at desc
      limit 100
    `, [status, userId, workspaceId, sessionId, createdFrom, createdTo])).rows

    const jobIds = rows.map(row => row.id)
    const variationRows = jobIds.length > 0
      ? (await this.pool.query(`
        select *
        from design_variations
        where job_id = any($1::text[])
        order by job_id asc, index asc, created_at asc
      `, [jobIds])).rows
      : []
    const variationsByJob = new Map<string, AdminJobSummary['variations']>()
    for (const row of variationRows) {
      const list = variationsByJob.get(row.job_id) ?? []
      list.push({
        id: row.id,
        index: row.index,
        title: row.title,
        status: row.status,
        currentArtifactId: row.current_artifact_id,
        previewUrl: row.preview_url,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        costCents: row.cost_cents,
        errorCode: row.error_code,
        errorMessage: adminPreviewText(row.error_message, 160),
        updatedAt: toIso(row.updated_at),
      })
      variationsByJob.set(row.job_id, list)
    }

    return {
      jobs: rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        prompt: adminPreviewText(row.prompt, 180) ?? '',
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
        variations: variationsByJob.get(row.id) ?? [],
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
          storageKey: redactAdminStorageKey(artifact.storageKey),
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

  override async getAdminMemoryGovernance(filter: AdminUserSupportFilter = {}): Promise<AdminMemoryGovernance> {
    await this.flush()
    const userId = filter.userId?.trim() || null
    const email = filter.email?.trim().toLowerCase() || null
    const rows = (await this.pool.query(`
      with namespace_counts as (
        select memory_namespace, count(*)::int as namespace_count
        from users
        where coalesce(memory_namespace, '') <> ''
        group by memory_namespace
      ),
      workspace_summary as (
        select owner_id as user_id, count(*)::int as workspace_count
        from workspaces
        group by owner_id
      ),
      session_summary as (
        select
          user_id,
          count(*)::int as session_count,
          count(*) filter (where runtime_session_id is not null)::int as runtime_session_count,
          max(updated_at) as last_session_at
        from design_sessions
        group by user_id
      ),
      job_summary as (
        select user_id, count(*)::int as job_count
        from design_jobs
        group by user_id
      )
      select
        u.id,
        u.email,
        u.memory_namespace,
        coalesce(ns.namespace_count, 0)::int as namespace_count,
        coalesce(ws.workspace_count, 0)::int as workspace_count,
        coalesce(ss.session_count, 0)::int as session_count,
        coalesce(ss.runtime_session_count, 0)::int as runtime_session_count,
        coalesce(js.job_count, 0)::int as job_count,
        ss.last_session_at
      from users u
      left join namespace_counts ns on ns.memory_namespace = u.memory_namespace
      left join workspace_summary ws on ws.user_id = u.id
      left join session_summary ss on ss.user_id = u.id
      left join job_summary js on js.user_id = u.id
      where ($1::text is null or u.id = $1)
        and ($2::text is null or lower(u.email) like '%' || $2 || '%')
      order by u.email asc
      limit 100
    `, [userId, email])).rows

    const users: AdminMemoryUserSummary[] = rows.map(row => ({
      userId: row.id,
      email: row.email,
      memoryNamespace: row.memory_namespace,
      isolationStatus: sqlMemoryIsolationStatus(row.memory_namespace, row.namespace_count),
      workspaceCount: row.workspace_count,
      sessionCount: row.session_count,
      runtimeSessionCount: row.runtime_session_count,
      jobCount: row.job_count,
      memoryRefCount: 0,
      pendingMemoryNoteCount: 0,
      approvedMemoryNoteCount: 0,
      rejectedMemoryNoteCount: 0,
      lastSessionAt: row.last_session_at ? toIso(row.last_session_at) : null,
    }))

    return buildSqlMemoryGovernanceResponse(users)
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

  override async upsertDiscoveredModelServices(models: ModelService[]): Promise<UpsertDiscoveredModelServicesResult> {
    await this.flush()
    let createdCount = 0
    let updatedCount = 0
    let missingCount = 0
    let disabledMissingCount = 0
    const diff: ModelSyncDiffItem[] = []
    const discoveredIds = new Set(models.map(model => model.id))
    const syncTime = models[0]?.updatedAt ?? nowIso()
    for (const model of models) {
      const existing = await this.getModelServiceById(model.id)
      if (existing) {
        updatedCount += 1
        const merged: ModelService = {
          ...model,
          enabled: existing.enabled,
          isDefault: existing.isDefault,
          createdAt: existing.createdAt,
        }
        if (hasModelServiceRuntimeDiff(existing, merged)) {
          diff.push(modelSyncDiffItem('updated', existing, merged))
        }
        merged.metadata = {
          ...merged.metadata,
          runtimeMissingSinceLastSync: false,
        }
        await this.persistModelService(merged)
        this.modelServices.set(merged.id, merged)
      } else {
        createdCount += 1
        diff.push(modelSyncDiffItem('created', null, model))
        await this.persistModelService(model)
        this.modelServices.set(model.id, model)
      }
    }
    for (const existing of [...this.modelServices.values()]) {
      if (existing.metadata.source !== 'runtime_discovery' || discoveredIds.has(existing.id)) continue
      missingCount += 1
      if (existing.enabled) disabledMissingCount += 1
      const missing: ModelService = {
        ...existing,
        enabled: false,
        metadata: {
          ...existing.metadata,
          runtimeMissingAt: syncTime,
          runtimeMissingSinceLastSync: true,
        },
        updatedAt: syncTime,
      }
      diff.push(modelSyncDiffItem('missing', existing, missing))
      await this.persistModelService(missing)
      this.modelServices.set(missing.id, missing)
    }
    const { models: summaries } = await this.listAdminModels()
    return {
      createdCount,
      updatedCount,
      missingCount,
      disabledMissingCount,
      diff,
      models: summaries,
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
      lastPromptPreview: adminPreviewText(session.lastPrompt, 140),
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
      failureSummary: summarizeAdminSupportIssue(latestJob, failedVariations),
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

  private async persistUser(user: User): Promise<void> {
    await this.pool.query(`
      insert into users (id, email, name, avatar_url, status, memory_namespace, metadata, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
      on conflict (id) do update set
        email = excluded.email,
        name = excluded.name,
        avatar_url = excluded.avatar_url,
        status = excluded.status,
        memory_namespace = excluded.memory_namespace,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      user.id, user.email, user.name, user.avatarUrl, user.status, user.memoryNamespace, JSON.stringify(user.metadata), user.createdAt, user.updatedAt,
    ])
  }

  private async persistWorkspace(workspace: Workspace): Promise<void> {
    await this.pool.query(`
      insert into workspaces (id, owner_id, team_id, name, mode, visibility, storage_key, status, metadata, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
      on conflict (id) do update set
        owner_id = excluded.owner_id,
        team_id = excluded.team_id,
        name = excluded.name,
        visibility = excluded.visibility,
        storage_key = excluded.storage_key,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      workspace.id, workspace.ownerId, workspace.teamId, workspace.name, workspace.mode, workspace.visibility,
      workspace.storageKey, workspace.status, JSON.stringify(workspace.metadata), workspace.createdAt, workspace.updatedAt,
    ])
  }

  private async persistWorkspaceMember(member: WorkspaceMember): Promise<void> {
    await this.pool.query(`
      insert into workspace_members (workspace_id, user_id, role, status, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6)
      on conflict (workspace_id, user_id) do update set
        role = excluded.role,
        status = excluded.status,
        updated_at = excluded.updated_at
    `, [
      member.workspaceId, member.userId, member.role, member.status, member.createdAt, member.updatedAt,
    ])
  }

  private async persistAuthIdentity(identity: AuthIdentity): Promise<void> {
    await this.pool.query(`
      insert into auth_identities (id, user_id, provider, provider_subject, password_hash, verified_at, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (provider, provider_subject) do update set
        password_hash = excluded.password_hash,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
    `, [
      identity.id, identity.userId, identity.provider, identity.providerSubject, identity.passwordHash,
      identity.verifiedAt, identity.createdAt, identity.updatedAt,
    ])
  }

  private async persistAuthSession(session: AuthSession): Promise<void> {
    await this.pool.query(`
      insert into auth_sessions (id, user_id, token_hash, user_agent, ip_hash, expires_at, revoked_at, created_at, last_seen_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (token_hash) do update set
        user_agent = excluded.user_agent,
        ip_hash = excluded.ip_hash,
        expires_at = excluded.expires_at,
        revoked_at = excluded.revoked_at,
        last_seen_at = excluded.last_seen_at
    `, [
      session.id, session.userId, session.tokenHash, session.userAgent, session.ipHash, session.expiresAt,
      session.revokedAt, session.createdAt, session.lastSeenAt,
    ])
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

  private async persistDesignEvent(event: DesignEvent): Promise<void> {
    if (!event.jobId) return
    const normalized = normalizeDesignEventForPersistence(event)
    await this.pool.query(`
      insert into design_events (job_id, session_id, variation_id, type, schema_version, payload, event, created_at)
      values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
    `, [
      normalized.jobId,
      normalized.sessionId ?? null,
      normalized.variationId ?? null,
      normalized.type,
      normalized.schemaVersion,
      JSON.stringify(normalized.payload),
      JSON.stringify(normalized),
      normalized.timestamp,
    ])
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

  private async persistUserCapabilityPreference(userId: string, preference: UserCapabilityPreference): Promise<void> {
    const now = nowIso()
    await this.pool.query(`
      insert into user_preferences (
        user_id, domain_template_id, aesthetic_profile_id, color_palette_id, loop_profile_id,
        design_template_pack_id, skill_id, mcp_tool_id, brand_style_reference_id, advanced_constraints,
        metadata, created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)
      on conflict (user_id) do update set
        domain_template_id = excluded.domain_template_id,
        aesthetic_profile_id = excluded.aesthetic_profile_id,
        color_palette_id = excluded.color_palette_id,
        loop_profile_id = excluded.loop_profile_id,
        design_template_pack_id = excluded.design_template_pack_id,
        skill_id = excluded.skill_id,
        mcp_tool_id = excluded.mcp_tool_id,
        brand_style_reference_id = excluded.brand_style_reference_id,
        advanced_constraints = excluded.advanced_constraints,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      userId,
      preference.domainTemplateId,
      preference.aestheticProfileId,
      preference.colorPaletteId,
      preference.loopProfileId,
      preference.designTemplatePackId ?? null,
      preference.skillId ?? null,
      preference.mcpToolId ?? null,
      preference.brandStyleReferenceId ?? null,
      JSON.stringify(preference.advancedConstraints ?? {}),
      JSON.stringify({ kind: 'capability_preference' }),
      now,
      now,
    ])
  }

  private async persistDesignTemplatePack(template: DesignTemplatePack): Promise<void> {
    const now = nowIso()
    const workspaceId = designTemplateWorkspaceId(template)
    const sortKey = designTemplateSortKey(template)
    const contentHash = createHash('sha256').update(JSON.stringify(template)).digest('hex')
    await this.pool.query(`
      insert into design_templates (
        id, source, format, visibility, status, name, description, created_by_user_id,
        workspace_id, current_version, schema_version, preview_artifact_id, lint_status, sort_key, metadata,
        created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
      on conflict (id) do update set
        source = excluded.source,
        format = excluded.format,
        visibility = excluded.visibility,
        status = excluded.status,
        name = excluded.name,
        description = excluded.description,
        created_by_user_id = excluded.created_by_user_id,
        workspace_id = excluded.workspace_id,
        current_version = excluded.current_version,
        schema_version = excluded.schema_version,
        preview_artifact_id = excluded.preview_artifact_id,
        lint_status = excluded.lint_status,
        sort_key = excluded.sort_key,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `, [
      template.id,
      template.source,
      template.format,
      template.visibility,
      template.status,
      template.name,
      template.description,
      template.createdByUserId,
      workspaceId,
      template.version,
      template.schemaVersion,
      template.previewArtifactId,
      template.lintStatus,
      sortKey,
      JSON.stringify({ schemaVersion: template.schemaVersion }),
      now,
      now,
    ])
    await this.pool.query(`
      insert into design_template_versions (
        id, template_id, version, schema_version, pack, design_tokens, rationale,
        content_hash, created_by_user_id, created_at
      )
      values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10)
      on conflict (template_id, version) do nothing
    `, [
      createId('dtpv'),
      template.id,
      template.version,
      template.schemaVersion,
      JSON.stringify(template),
      JSON.stringify(template.designTokens),
      JSON.stringify(template.rationale),
      contentHash,
      template.createdByUserId,
      now,
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
    metadata: row.metadata ?? {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapUserCapabilityPreference(row: any): UserCapabilityPreference {
  return {
    domainTemplateId: row.domain_template_id,
    aestheticProfileId: row.aesthetic_profile_id,
    colorPaletteId: row.color_palette_id,
    loopProfileId: row.loop_profile_id,
    designTemplatePackId: row.design_template_pack_id ?? null,
    skillId: row.skill_id ?? null,
    mcpToolId: row.mcp_tool_id ?? null,
    brandStyleReferenceId: row.brand_style_reference_id ?? null,
    advancedConstraints: Object.keys(row.advanced_constraints ?? {}).length > 0 ? row.advanced_constraints : null,
  }
}

function mapDesignTemplatePackRow(row: any): DesignTemplatePack {
  const pack = row.pack
  if (isDesignTemplatePack(pack)) return pack
  return {
    schemaVersion: row.schema_version,
    id: row.id,
    source: row.source,
    format: row.format,
    visibility: row.visibility,
    status: row.status,
    name: row.name,
    description: row.description,
    version: row.current_version,
    designTokens: isPlainObject(row.design_tokens) ? row.design_tokens as DesignTemplatePack['designTokens'] : {
      colors: {},
      typography: {},
      spacing: {},
      rounded: {},
      components: {},
    },
    rationale: isPlainObject(row.rationale) ? row.rationale as DesignTemplatePack['rationale'] : {
      overview: null,
      colors: null,
      typography: null,
      layout: null,
      elevation: null,
      shapes: null,
      components: null,
      dos: [],
      donts: [],
      sections: {},
    },
    previewArtifactId: row.preview_artifact_id,
    lintStatus: row.lint_status,
    createdByUserId: row.created_by_user_id,
  }
}

function mapDesignTemplatePackVersion(row: any): DesignTemplatePackVersion {
  const pack = isDesignTemplatePack(row.pack) ? row.pack : mapDesignTemplatePackRow(row)
  return {
    id: row.id,
    templateId: row.template_id,
    version: row.version,
    schemaVersion: row.schema_version ?? pack.schemaVersion,
    pack,
    contentHash: row.content_hash ?? createHash('sha256').update(JSON.stringify(pack)).digest('hex'),
    createdByUserId: row.created_by_user_id,
    createdAt: toIso(row.created_at),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isDesignTemplatePack(value: unknown): value is DesignTemplatePack {
  if (!isPlainObject(value)) return false
  return typeof value.id === 'string'
    && typeof value.schemaVersion === 'string'
    && typeof value.name === 'string'
    && typeof value.version === 'string'
    && isPlainObject(value.designTokens)
    && isPlainObject(value.rationale)
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

function mapWorkspaceMember(row: any): WorkspaceMember {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
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

function mapAuthIdentity(row: any): AuthIdentity {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    providerSubject: row.provider_subject,
    passwordHash: row.password_hash,
    verifiedAt: row.verified_at ? toIso(row.verified_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapAuthSession(row: any): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    userAgent: row.user_agent,
    ipHash: row.ip_hash,
    expiresAt: toIso(row.expires_at),
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
    createdAt: toIso(row.created_at),
    lastSeenAt: toIso(row.last_seen_at),
  }
}

function mapDesignEvent(row: any): DesignEvent {
  const value = row.event
  return normalizeDesignEventForPersistence((typeof value === 'string' ? JSON.parse(value) : value) as DesignEvent)
}

function normalizeDesignEventForPersistence(event: DesignEvent): DesignEvent {
  const record = event as DesignEvent & { createdAt?: string }
  const timestamp = record.timestamp ?? record.createdAt ?? nowIso()
  return {
    ...event,
    timestamp,
  }
}

function authIdentityKey(provider: AuthIdentity['provider'], providerSubject: string): string {
  return `${provider}:${providerSubject.trim().toLowerCase()}`
}

function workspaceMemberKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`
}

function userModelAccessKey(userId: string, modelServiceId: string): string {
  return `${userId}:${modelServiceId}`
}

function designTemplatePackVersionKey(templateId: string, version: string): string {
  return `${templateId}:${version}`
}

function designTemplateWorkspaceId(template: DesignTemplatePack): string | null {
  const templateRecord = template as unknown as Record<string, unknown>
  const metadataWorkspaceId = typeof templateRecord.workspaceId === 'string'
    ? templateRecord.workspaceId
    : null
  if (metadataWorkspaceId) return metadataWorkspaceId
  const metadata = isPlainObject(templateRecord.metadata) ? templateRecord.metadata : null
  const workspaceId = metadata && typeof metadata.workspaceId === 'string' ? metadata.workspaceId : null
  if (workspaceId) return workspaceId
  if (template.id.startsWith('dtp_ws_')) {
    const match = template.id.match(/^dtp_ws_([^_]+(?:_[^_]+)?)_/)
    return match?.[1] ?? null
  }
  return null
}

function designTemplateSortKey(template: DesignTemplatePack): string {
  return `${template.source === 'official' ? '0' : '1'}:${template.name.toLowerCase()}:${template.id}`
}

function hasModelServiceRuntimeDiff(previous: ModelService, next: ModelService): boolean {
  return previous.displayName !== next.displayName
    || previous.contextWindow !== next.contextWindow
    || previous.inputTokenCostCents !== next.inputTokenCostCents
    || previous.outputTokenCostCents !== next.outputTokenCostCents
}

function modelSyncDiffItem(
  changeType: ModelSyncDiffItem['changeType'],
  previous: ModelService | null,
  next: ModelService,
): ModelSyncDiffItem {
  return {
    modelServiceId: next.id,
    modelId: next.modelId,
    displayName: next.displayName,
    runtimeProviderId: metadataText(next.metadata, 'runtimeProviderId') ?? metadataText(previous?.metadata, 'runtimeProviderId'),
    changeType,
    previousContextWindow: previous?.contextWindow ?? null,
    nextContextWindow: next.contextWindow,
    previousInputTokenCostCents: previous?.inputTokenCostCents ?? 0,
    nextInputTokenCostCents: next.inputTokenCostCents,
    previousOutputTokenCostCents: previous?.outputTokenCostCents ?? 0,
    nextOutputTokenCostCents: next.outputTokenCostCents,
  }
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function sqlMemoryIsolationStatus(memoryNamespace: string | null, namespaceCount: number): AdminMemoryUserSummary['isolationStatus'] {
  if (!memoryNamespace?.trim()) return 'missing_namespace'
  return namespaceCount > 1 ? 'namespace_conflict' : 'isolated'
}

function buildSqlMemoryGovernanceResponse(users: AdminMemoryUserSummary[]): AdminMemoryGovernance {
  return {
    users,
    totals: {
      userCount: users.length,
      isolatedUserCount: users.filter(user => user.isolationStatus === 'isolated').length,
      conflictUserCount: users.filter(user => user.isolationStatus === 'namespace_conflict').length,
      missingNamespaceUserCount: users.filter(user => user.isolationStatus === 'missing_namespace').length,
      memoryRefCount: users.reduce((sum, user) => sum + user.memoryRefCount, 0),
      pendingMemoryNoteCount: users.reduce((sum, user) => sum + user.pendingMemoryNoteCount, 0),
    },
    capabilities: {
      memoryNotes: 'not_configured',
      memoryRefs: 'event_stream_only',
    },
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
