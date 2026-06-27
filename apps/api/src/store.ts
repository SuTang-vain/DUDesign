import type {
  Artifact,
  DesignJob,
  DesignSession,
  DesignVariation,
  Share,
  UsageEvent,
  User,
  Workspace,
} from '@dudesign/domain'
import { createId, nowIso } from './id.js'
import type {
  AdminArtifactSummary,
  AdminArtifactsFilter,
  AdminCostSummary,
  AdminJobSummary,
  AdminJobsFilter,
  AdminSupportSession,
  AdminUserSupport,
  AdminUserSupportFilter,
  ApplicationRepository,
  CurrentVariationArtifactSnapshot,
  MaybePromise,
  RuntimeSessionContext,
  SessionWorkspaceContext,
  SharedVariationSnapshot,
  VariationArtifactContext,
  VariationDetailSnapshot,
  VariationJobContext,
  VariationRefineContext,
} from './repository.js'

export type SessionMessage = {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type AnnotationBatch = {
  id: string
  variationId: string
  artifactId: string
  userId: string
  shapes: unknown[]
  promptSuffix: string
  createdAt: string
}

export type AuditLog = {
  id: string
  requestId: string
  operatorUserId: string
  operatorRole: 'support' | 'operator' | 'developer'
  action: string
  targetType: string
  targetId: string
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export class InMemoryStore implements ApplicationRepository {
  readonly users = new Map<string, User>()
  readonly workspaces = new Map<string, Workspace>()
  readonly sessions = new Map<string, DesignSession>()
  readonly messages = new Map<string, SessionMessage[]>()
  readonly jobs = new Map<string, DesignJob>()
  readonly variations = new Map<string, DesignVariation>()
  readonly artifacts = new Map<string, Artifact>()
  readonly shares = new Map<string, Share>()
  readonly annotationBatches = new Map<string, AnnotationBatch>()
  readonly auditLogs: AuditLog[] = []
  readonly usageEvents: UsageEvent[] = []

  readonly devUser: User
  readonly devWorkspace: Workspace
  readonly altUser: User
  readonly altWorkspace: Workspace

  constructor() {
    const now = nowIso()
    const primary = this.createSeedUserWorkspace({
      userId: 'usr_dev',
      workspaceId: 'ws_dev',
      email: 'dev@dudesign.local',
      name: 'DUDesign Dev',
      workspaceName: 'Personal Workspace',
      now,
    })
    const alternate = this.createSeedUserWorkspace({
      userId: 'usr_alt',
      workspaceId: 'ws_alt',
      email: 'alt@dudesign.local',
      name: 'DUDesign Alt',
      workspaceName: 'Alt Workspace',
      now,
    })
    this.devUser = primary.user
    this.devWorkspace = primary.workspace
    this.altUser = alternate.user
    this.altWorkspace = alternate.workspace
  }

  getUserById(userId: string): User | null {
    return this.users.get(userId) ?? null
  }

  getWorkspaceById(workspaceId: string): Workspace | null {
    return this.workspaces.get(workspaceId) ?? null
  }

  getPrimaryWorkspaceForUser(userId: string): Workspace | null {
    return [...this.workspaces.values()].find(candidate => candidate.ownerId === userId) ?? null
  }

  getSessionById(sessionId: string): DesignSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  getJobById(jobId: string): DesignJob | null {
    return this.jobs.get(jobId) ?? null
  }

  getVariationById(variationId: string): DesignVariation | null {
    return this.variations.get(variationId) ?? null
  }

  getArtifactById(artifactId: string): Artifact | null {
    return this.artifacts.get(artifactId) ?? null
  }

  getSessionWorkspaceContext(sessionId: string): MaybePromise<SessionWorkspaceContext | null> {
    const session = this.getSessionById(sessionId)
    if (!session) return null
    return {
      session,
      workspace: this.getWorkspaceById(session.workspaceId),
    }
  }

  getVariationJobContext(variationId: string): MaybePromise<VariationJobContext | null> {
    const variation = this.getVariationById(variationId)
    if (!variation) return null
    return {
      variation,
      job: this.getJobById(variation.jobId),
    }
  }

  getVariationRefineContext(variationId: string, baseArtifactId: string): MaybePromise<VariationRefineContext | null> {
    const variation = this.getVariationById(variationId)
    if (!variation) return null
    const job = this.getJobById(variation.jobId)
    return {
      variation,
      job,
      session: this.getSessionById(variation.sessionId),
      workspace: job ? this.getWorkspaceById(job.workspaceId) : null,
      baseArtifact: this.getArtifactById(baseArtifactId),
    }
  }

  getVariationArtifactContext(variationId: string, artifactId: string): MaybePromise<VariationArtifactContext> {
    const variation = this.getVariationById(variationId)
    const artifact = this.getArtifactById(artifactId)
    return {
      variation,
      artifact,
      mismatch: Boolean(variation && artifact && artifact.variationId !== variation.id),
    }
  }

  getRuntimeSessionContext(sessionId: string): MaybePromise<RuntimeSessionContext | null> {
    const session = this.getSessionById(sessionId)
    if (!session) return null
    return {
      session,
      user: this.getUserById(session.userId),
      workspace: this.getWorkspaceById(session.workspaceId),
    }
  }

  createSession(input: {
    userId: string
    workspaceId: string
    mode: DesignSession['mode']
    title?: string
    sourceArtifactId?: string | null
    runtimeSessionId?: string | null
  }): DesignSession {
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
    this.sessions.set(session.id, session)
    this.messages.set(session.id, [])
    return session
  }

  saveSession(session: DesignSession): void {
    this.sessions.set(session.id, session)
  }

  private createSeedUserWorkspace(input: {
    userId: string
    workspaceId: string
    email: string
    name: string
    workspaceName: string
    now: string
  }): { user: User; workspace: Workspace } {
    const user: User = {
      id: input.userId,
      email: input.email,
      name: input.name,
      avatarUrl: null,
      status: 'active',
      memoryNamespace: `memory:user:${input.userId}`,
      createdAt: input.now,
      updatedAt: input.now,
    }
    const workspace: Workspace = {
      id: input.workspaceId,
      ownerId: user.id,
      teamId: null,
      name: input.workspaceName,
      mode: 'hosted',
      visibility: 'private',
      storageKey: `workspaces/${input.workspaceId}`,
      status: 'active',
      metadata: {},
      createdAt: input.now,
      updatedAt: input.now,
    }
    this.users.set(user.id, user)
    this.workspaces.set(workspace.id, workspace)
    return { user, workspace }
  }

  appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): SessionMessage {
    const next: SessionMessage = {
      id: createId('msg'),
      createdAt: nowIso(),
      ...message,
    }
    const list = this.messages.get(message.sessionId) ?? []
    list.push(next)
    this.messages.set(message.sessionId, list)
    return next
  }

  createJob(input: {
    session: DesignSession
    prompt: string
    sourceMode: DesignJob['sourceMode']
    variationCount: number
    templateRequirements: Record<string, unknown>
  }): DesignJob {
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
    this.jobs.set(job.id, job)
    this.sessions.set(input.session.id, {
      ...input.session,
      lastPrompt: input.prompt,
      updatedAt: now,
    })
    return job
  }

  createVariations(input: { job: DesignJob; count: number }): DesignVariation[] {
    const now = nowIso()
    const variations: DesignVariation[] = []
    for (let index = 1; index <= input.count; index += 1) {
      const variation: DesignVariation = {
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
      }
      this.variations.set(variation.id, variation)
      variations.push(variation)
    }
    return variations
  }

  listSessions(): DesignSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getSessionSnapshot(sessionId: string): MaybePromise<{
    session: DesignSession
    messages: SessionMessage[]
    jobs: DesignJob[]
    variations: DesignVariation[]
    artifacts: Artifact[]
  } | null> {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    const jobs = [...this.jobs.values()].filter(job => job.sessionId === sessionId)
    const jobIds = new Set(jobs.map(job => job.id))
    const variations = [...this.variations.values()].filter(variation => jobIds.has(variation.jobId))
    const variationIds = new Set(variations.map(variation => variation.id))
    const artifacts = [...this.artifacts.values()].filter(
      artifact => artifact.sessionId === sessionId || (artifact.variationId && variationIds.has(artifact.variationId)),
    )
    return {
      session,
      messages: this.messages.get(sessionId) ?? [],
      jobs,
      variations,
      artifacts,
    }
  }

  getJobSnapshot(jobId: string): MaybePromise<{
    job: DesignJob
    variations: DesignVariation[]
    artifacts: Artifact[]
  } | null> {
    const job = this.jobs.get(jobId)
    if (!job) return null
    const variations = [...this.variations.values()].filter(variation => variation.jobId === jobId)
    const variationIds = new Set(variations.map(variation => variation.id))
    const artifacts = [...this.artifacts.values()].filter(
      artifact => artifact.variationId && variationIds.has(artifact.variationId),
    )
    return { job, variations, artifacts }
  }

  getVariationDetailSnapshot(variationId: string): MaybePromise<VariationDetailSnapshot | null> {
    const variation = this.variations.get(variationId)
    if (!variation) return null
    const job = this.jobs.get(variation.jobId) ?? null
    const artifacts = [...this.artifacts.values()]
      .filter(artifact => artifact.variationId === variationId && artifact.kind === 'html')
      .sort((a, b) => b.version - a.version)
    const currentArtifact = variation.currentArtifactId
      ? this.artifacts.get(variation.currentArtifactId) ?? null
      : artifacts[0] ?? null
    return {
      variation,
      job,
      currentArtifact,
      artifacts,
    }
  }

  getCurrentVariationArtifactSnapshot(variationId: string): MaybePromise<CurrentVariationArtifactSnapshot> {
    const variation = this.variations.get(variationId) ?? null
    const artifactId = variation?.currentArtifactId ?? null
    const artifact = artifactId ? this.artifacts.get(artifactId) ?? null : null
    return {
      variation,
      artifactId,
      artifact,
      mismatch: Boolean(artifact && artifact.variationId !== variationId),
    }
  }

  setJobStatus(jobId: string, status: DesignJob['status']): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    const now = nowIso()
    this.jobs.set(jobId, {
      ...job,
      status,
      startedAt: job.startedAt ?? (status === 'running' ? now : null),
      completedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? now : job.completedAt,
      updatedAt: now,
    })
  }

  createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog {
    const entry: AuditLog = {
      id: createId('aud'),
      createdAt: nowIso(),
      ...input,
    }
    this.auditLogs.push(entry)
    return entry
  }

  listAuditLogs(options: { limit?: number } = {}): AuditLog[] {
    const limit = options.limit ?? 100
    return [...this.auditLogs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): UsageEvent {
    const event: UsageEvent = {
      id: createId('use'),
      createdAt: nowIso(),
      ...input,
    }
    this.usageEvents.push(event)
    return event
  }

  listUsageEvents(options: {
    userId?: string
    jobId?: string
    variationId?: string
    limit?: number
  } = {}): UsageEvent[] {
    const limit = options.limit ?? 1000
    return [...this.usageEvents]
      .filter(event => !options.userId || event.userId === options.userId)
      .filter(event => !options.jobId || event.jobId === options.jobId)
      .filter(event => !options.variationId || event.variationId === options.variationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  applyVariationEvent(input: {
    variationId: string
    status?: DesignVariation['status']
    artifactId?: string
    previewUrl?: string
    inputTokens?: number
    outputTokens?: number
    costCents?: number
    errorCode?: string
    errorMessage?: string
  }): void {
    const variation = this.variations.get(input.variationId)
    if (!variation) return
    this.variations.set(input.variationId, {
      ...variation,
      status: input.status ?? variation.status,
      currentArtifactId: input.artifactId ?? variation.currentArtifactId,
      previewUrl: input.previewUrl ?? variation.previewUrl,
      inputTokens: input.inputTokens ?? variation.inputTokens,
      outputTokens: input.outputTokens ?? variation.outputTokens,
      costCents: input.costCents ?? variation.costCents,
      errorCode: input.errorCode ?? variation.errorCode,
      errorMessage: input.errorMessage ?? variation.errorMessage,
      updatedAt: nowIso(),
    })
  }

  createMockArtifact(input: {
    workspaceId: string
    sessionId: string
    variationId: string
    artifactId?: string
    entryPath?: string
    parentArtifactId?: string | null
  }): Artifact {
    const now = nowIso()
    const existingVersions = [...this.artifacts.values()]
      .filter(artifact => artifact.variationId === input.variationId && artifact.kind === 'html')
      .map(artifact => artifact.version)
    const version = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1
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
      createdAt: now,
    }
    this.artifacts.set(artifact.id, artifact)
    return artifact
  }

  createArtifact(input: {
    workspaceId: string
    sessionId: string
    variationId?: string | null
    parentArtifactId?: string | null
    kind: Artifact['kind']
    version?: number
    storageKey: string
    entryPath?: string | null
    contentHash: string
    sizeBytes: number
    metadata?: Record<string, unknown>
  }): Artifact {
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
    this.artifacts.set(artifact.id, artifact)
    return artifact
  }

  saveArtifact(artifact: Artifact): void {
    this.artifacts.set(artifact.id, artifact)
  }

  createAnnotationBatch(input: {
    variationId: string
    artifactId: string
    userId: string
    shapes: unknown[]
    promptSuffix: string
  }): AnnotationBatch {
    const batch: AnnotationBatch = {
      id: createId('ann'),
      createdAt: nowIso(),
      ...input,
    }
    this.annotationBatches.set(batch.id, batch)
    return batch
  }

  createShare(input: {
    artifactId: string
    variationId: string
    ownerId: string
    visibility: Share['visibility']
    expiresAt?: string | null
  }): Share {
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
    this.shares.set(share.token, share)
    return share
  }

  getShareByToken(token: string): Share | null {
    return this.shares.get(token) ?? null
  }

  getSharedVariationSnapshot(token: string): MaybePromise<SharedVariationSnapshot | null> {
    const share = this.getShareByToken(token)
    if (!share) return null
    return {
      share,
      variation: this.variations.get(share.variationId) ?? null,
      artifact: this.artifacts.get(share.artifactId) ?? null,
    }
  }

  revokeShare(token: string): Share | null {
    const share = this.shares.get(token)
    if (!share) return null
    const revoked = {
      ...share,
      revokedAt: nowIso(),
    }
    this.shares.set(token, revoked)
    return revoked
  }

  listAdminJobs(filter: AdminJobsFilter = {}): MaybePromise<{ jobs: AdminJobSummary[] }> {
    const jobs = [...this.jobs.values()]
      .filter(job => !filter.status || job.status === filter.status)
      .filter(job => !filter.userId || job.userId === filter.userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 100)

    return {
      jobs: jobs.map(job => {
        const variations = [...this.variations.values()].filter(variation => variation.jobId === job.id)
        const artifacts = [...this.artifacts.values()].filter(artifact =>
          variations.some(variation => variation.id === artifact.variationId),
        )
        const counts = variations.reduce(
          (acc, variation) => {
            acc[variation.status] = (acc[variation.status] ?? 0) + 1
            return acc
          },
          {} as Record<string, number>,
        )
        return {
          id: job.id,
          userId: job.userId,
          workspaceId: job.workspaceId,
          sessionId: job.sessionId,
          prompt: job.prompt,
          status: job.status,
          variationCount: job.variationCount,
          completedVariationCount: counts.completed ?? 0,
          failedVariationCount: counts.failed ?? 0,
          cancelledVariationCount: counts.cancelled ?? 0,
          artifactCount: artifacts.length,
          totalInputTokens: variations.reduce((sum, variation) => sum + variation.inputTokens, 0),
          totalOutputTokens: variations.reduce((sum, variation) => sum + variation.outputTokens, 0),
          totalCostCents: variations.reduce((sum, variation) => sum + variation.costCents, 0),
          errorCount: variations.filter(variation => variation.errorCode).length,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        }
      }),
    }
  }

  listAdminArtifacts(filter: AdminArtifactsFilter = {}): MaybePromise<{ artifacts: AdminArtifactSummary[] }> {
    const variationIdsForJob = filter.jobId
      ? new Set([...this.variations.values()].filter(variation => variation.jobId === filter.jobId).map(variation => variation.id))
      : null

    const artifacts = [...this.artifacts.values()]
      .filter(artifact => !filter.kind || artifact.kind === filter.kind)
      .filter(artifact => !filter.variationId || artifact.variationId === filter.variationId)
      .filter(artifact => !variationIdsForJob || (artifact.variationId ? variationIdsForJob.has(artifact.variationId) : false))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)

    return {
      artifacts: artifacts.map(artifact => {
        const variation = artifact.variationId ? this.variations.get(artifact.variationId) : null
        const shareCount = [...this.shares.values()].filter(share => share.artifactId === artifact.id).length
        return {
          id: artifact.id,
          workspaceId: artifact.workspaceId,
          sessionId: artifact.sessionId,
          jobId: variation?.jobId ?? null,
          variationId: artifact.variationId,
          parentArtifactId: artifact.parentArtifactId,
          kind: artifact.kind,
          version: artifact.version,
          storageKey: artifact.storageKey,
          entryPath: artifact.entryPath,
          contentHash: artifact.contentHash,
          sizeBytes: artifact.sizeBytes,
          previewUrl: variation?.previewUrl ?? null,
          shareCount,
          createdAt: artifact.createdAt,
        }
      }),
    }
  }

  getAdminUserSupport(filter: AdminUserSupportFilter = {}): MaybePromise<{ users: AdminUserSupport[] }> {
    const userId = filter.userId?.trim()
    const email = filter.email?.trim().toLowerCase()
    const users = [...this.users.values()]
      .filter(user => !userId || user.id === userId)
      .filter(user => !email || user.email.toLowerCase().includes(email))
      .sort((a, b) => a.email.localeCompare(b.email))
      .slice(0, 20)

    return {
      users: users.map(user => {
        const workspaces = [...this.workspaces.values()]
          .filter(workspace => workspace.ownerId === user.id)
          .sort((a, b) => a.name.localeCompare(b.name))
        const sessions = [...this.sessions.values()]
          .filter(session => session.userId === user.id)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 50)

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            status: user.status,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
          workspaces: workspaces.map(workspace => ({
            id: workspace.id,
            name: workspace.name,
            visibility: workspace.visibility,
            status: workspace.status,
          })),
          sessions: sessions.map(session => {
            const jobs = [...this.jobs.values()]
              .filter(job => job.sessionId === session.id)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            const jobIds = new Set(jobs.map(job => job.id))
            const variations = [...this.variations.values()].filter(variation => jobIds.has(variation.jobId))
            const variationSummary = variations.reduce(
              (acc, variation) => {
                acc[variation.status] = (acc[variation.status] ?? 0) + 1
                return acc
              },
              {} as Record<string, number>,
            )
            const failedVariations = variations.filter(variation => variation.status === 'failed' || variation.errorCode)
            const latestJob = jobs[0] ?? null

            const supportSession: AdminSupportSession = {
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
                queued: variationSummary.queued ?? 0,
                running: variationSummary.running ?? 0,
                streaming: variationSummary.streaming ?? 0,
                renderingPreview: variationSummary.rendering_preview ?? 0,
                completed: variationSummary.completed ?? 0,
                failed: variationSummary.failed ?? 0,
                cancelled: variationSummary.cancelled ?? 0,
              },
              failureSummary: summarizeSupportIssue(latestJob, failedVariations),
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            }
            return supportSession
          }),
        }
      }),
    }
  }

  getAdminCostSummary(): MaybePromise<AdminCostSummary> {
    const jobs = [...this.jobs.values()]
    const usageEvents = this.listUsageEvents()
    const totals = usageEvents.reduce(
      (acc, event) => {
        acc.inputTokens += event.inputTokens
        acc.outputTokens += event.outputTokens
        acc.costCents += event.costCents
        return acc
      },
      { inputTokens: 0, outputTokens: 0, costCents: 0 },
    )
    const byUser = new Map<string, { userId: string; jobCount: number; usageEventCount: number; inputTokens: number; outputTokens: number; costCents: number }>()
    for (const job of jobs) {
      const row = byUser.get(job.userId) ?? {
        userId: job.userId,
        jobCount: 0,
        usageEventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      }
      row.jobCount += 1
      byUser.set(job.userId, row)
    }
    for (const event of usageEvents) {
      const row = byUser.get(event.userId) ?? {
        userId: event.userId,
        jobCount: 0,
        usageEventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
      }
      row.usageEventCount += 1
      row.inputTokens += event.inputTokens
      row.outputTokens += event.outputTokens
      row.costCents += event.costCents
      byUser.set(event.userId, row)
    }
    return {
      totals: {
        jobCount: jobs.length,
        usageEventCount: usageEvents.length,
        ...totals,
      },
      byUser: [...byUser.values()].sort((a, b) => b.costCents - a.costCents || a.userId.localeCompare(b.userId)),
    }
  }
}

function previewText(value: string | null, maxLength: number): string | null {
  if (!value) return null
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

function summarizeSupportIssue(
  latestJob: { status: string; id: string } | null,
  failedVariations: Array<{ id: string; errorCode: string | null; errorMessage: string | null }>,
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

function toFailureExample(variation: { id: string; errorCode: string | null; errorMessage: string | null }) {
  return {
    variationId: variation.id,
    errorCode: variation.errorCode,
    message: previewText(variation.errorMessage, 120),
  }
}
