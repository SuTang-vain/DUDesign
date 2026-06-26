import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import type { Artifact, DesignJob, DesignSession, DesignVariation, Share, UsageEvent, User, Workspace } from '@dudesign/domain'
import { InMemoryStore, type AnnotationBatch, type AuditLog, type SessionMessage } from './store.js'
import type {
  ApplyVariationEventInput,
  CreateAnnotationBatchInput,
  CreateArtifactInput,
  CreateHtmlArtifactInput,
  CreateJobInput,
  CreateSessionInput,
  CreateShareInput,
} from './repository.js'

export type PostgresRepositoryOptions = {
  connectionString: string
  migrationsDir?: string
  schema?: string
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
    await repository.hydrate()
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
    for (const row of (await this.pool.query('select * from annotation_batches')).rows) this.annotationBatches.set(row.id, mapAnnotationBatch(row))
    for (const row of (await this.pool.query('select * from audit_logs order by created_at')).rows) this.auditLogs.push(mapAuditLog(row))
    for (const row of (await this.pool.query('select * from usage_events order by created_at')).rows) this.usageEvents.push(mapUsageEvent(row))
  }

  override createSession(input: CreateSessionInput): DesignSession {
    const session = super.createSession(input)
    this.enqueueWrite(() => this.persistSession(session))
    return session
  }

  override saveSession(session: DesignSession): void {
    super.saveSession(session)
    this.enqueueWrite(() => this.persistSession(session))
  }

  override appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): SessionMessage {
    const created = super.appendMessage(message)
    this.enqueueWrite(() => this.persistMessage(created))
    return created
  }

  override createJob(input: CreateJobInput): DesignJob {
    const job = super.createJob(input)
    this.enqueueWrite(async () => {
      await this.persistSession(this.sessions.get(input.session.id)!)
      await this.persistJob(job)
    })
    return job
  }

  override createVariations(input: { job: DesignJob; count: number }): DesignVariation[] {
    const variations = super.createVariations(input)
    this.enqueueWrite(async () => {
      for (const variation of variations) await this.persistVariation(variation)
    })
    return variations
  }

  override setJobStatus(jobId: string, status: DesignJob['status']): void {
    super.setJobStatus(jobId, status)
    const job = this.jobs.get(jobId)
    if (job) this.enqueueWrite(() => this.persistJob(job))
  }

  override createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
    const audit = super.createAuditLog(input)
    this.enqueueWrite(() => this.persistAuditLog(audit))
    return audit
  }

  override createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): UsageEvent {
    const event = super.createUsageEvent(input)
    this.enqueueWrite(() => this.persistUsageEvent(event))
    return event
  }

  override applyVariationEvent(input: ApplyVariationEventInput): void {
    super.applyVariationEvent(input)
    const variation = this.variations.get(input.variationId)
    if (variation) this.enqueueWrite(() => this.persistVariation(variation))
  }

  override createMockArtifact(input: CreateHtmlArtifactInput): Artifact {
    const artifact = super.createMockArtifact(input)
    this.enqueueWrite(() => this.persistArtifact(artifact))
    return artifact
  }

  override createArtifact(input: CreateArtifactInput): Artifact {
    const artifact = super.createArtifact(input)
    this.enqueueWrite(() => this.persistArtifact(artifact))
    return artifact
  }

  override saveArtifact(artifact: Artifact): void {
    super.saveArtifact(artifact)
    this.enqueueWrite(() => this.persistArtifact(artifact))
  }

  override createAnnotationBatch(input: CreateAnnotationBatchInput): AnnotationBatch {
    const batch = super.createAnnotationBatch(input)
    this.enqueueWrite(() => this.persistAnnotationBatch(batch))
    return batch
  }

  override createShare(input: CreateShareInput): Share {
    const share = super.createShare(input)
    this.enqueueWrite(() => this.persistShare(share))
    return share
  }

  override revokeShare(token: string): Share | null {
    const share = super.revokeShare(token)
    if (share) this.enqueueWrite(() => this.persistShare(share))
    return share
  }

  private enqueueWrite(write: () => Promise<unknown>): void {
    this.writeTail = this.writeTail.then(write, write)
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

  private async persistUsageEvent(event: UsageEvent): Promise<void> {
    await this.pool.query(`
      insert into usage_events (id, kind, user_id, workspace_id, session_id, job_id, variation_id, artifact_id, input_tokens, output_tokens, cost_cents, metadata, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
      on conflict (id) do nothing
    `, [
      event.id, event.kind, event.userId, event.workspaceId, event.sessionId, event.jobId, event.variationId,
      event.artifactId, event.inputTokens, event.outputTokens, event.costCents, JSON.stringify(event.metadata), event.createdAt,
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
