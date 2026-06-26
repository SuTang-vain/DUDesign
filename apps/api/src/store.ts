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
import type { ApplicationRepository } from './repository.js'

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

  getSessionSnapshot(sessionId: string): {
    session: DesignSession
    messages: SessionMessage[]
    jobs: DesignJob[]
    variations: DesignVariation[]
    artifacts: Artifact[]
  } | null {
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

  getJobSnapshot(jobId: string): {
    job: DesignJob
    variations: DesignVariation[]
    artifacts: Artifact[]
  } | null {
    const job = this.jobs.get(jobId)
    if (!job) return null
    const variations = [...this.variations.values()].filter(variation => variation.jobId === jobId)
    const variationIds = new Set(variations.map(variation => variation.id))
    const artifacts = [...this.artifacts.values()].filter(
      artifact => artifact.variationId && variationIds.has(artifact.variationId),
    )
    return { job, variations, artifacts }
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
}
