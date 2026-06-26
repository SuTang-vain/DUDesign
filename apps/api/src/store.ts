import type {
  Artifact,
  DesignJob,
  DesignSession,
  DesignVariation,
  Share,
  User,
  Workspace,
} from '@dudesign/domain'
import { createId, nowIso } from './id.js'

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

export class InMemoryStore {
  readonly users = new Map<string, User>()
  readonly workspaces = new Map<string, Workspace>()
  readonly sessions = new Map<string, DesignSession>()
  readonly messages = new Map<string, SessionMessage[]>()
  readonly jobs = new Map<string, DesignJob>()
  readonly variations = new Map<string, DesignVariation>()
  readonly artifacts = new Map<string, Artifact>()
  readonly shares = new Map<string, Share>()
  readonly annotationBatches = new Map<string, AnnotationBatch>()

  readonly devUser: User
  readonly devWorkspace: Workspace

  constructor() {
    const now = nowIso()
    this.devUser = {
      id: 'usr_dev',
      email: 'dev@dudesign.local',
      name: 'DUDesign Dev',
      avatarUrl: null,
      status: 'active',
      memoryNamespace: 'memory:user:usr_dev',
      createdAt: now,
      updatedAt: now,
    }
    this.devWorkspace = {
      id: 'ws_dev',
      ownerId: this.devUser.id,
      teamId: null,
      name: 'Personal Workspace',
      mode: 'hosted',
      visibility: 'private',
      storageKey: 'workspaces/ws_dev',
      status: 'active',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    this.users.set(this.devUser.id, this.devUser)
    this.workspaces.set(this.devWorkspace.id, this.devWorkspace)
  }

  createSession(input: {
    workspaceId: string
    mode: DesignSession['mode']
    title?: string
    sourceArtifactId?: string | null
    runtimeSessionId?: string | null
  }): DesignSession {
    const now = nowIso()
    const session: DesignSession = {
      id: createId('ses'),
      userId: this.devUser.id,
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
      expiresAt: input.expiresAt ?? null,
      createdAt: nowIso(),
    }
    this.shares.set(share.token, share)
    return share
  }

  getShareByToken(token: string): Share | null {
    return this.shares.get(token) ?? null
  }
}
