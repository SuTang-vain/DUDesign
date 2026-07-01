import type {
  Artifact,
  DesignJob,
  DesignSession,
  DesignVariation,
  ModelService,
  Share,
  UsageEvent,
  User,
  UserModelAccess,
  Workspace,
  WorkspaceMember,
} from '@dudesign/domain'
import { createId, nowIso } from './id.js'
import type {
  AdminArtifactSummary,
  AdminArtifactsFilter,
  AdminCostSummary,
  AdminJobSummary,
  AdminJobsFilter,
  AdminMemoryGovernance,
  AdminMemoryUserSummary,
  AdminModelSummary,
  AdminSupportSession,
  AdminUserModelAccess,
  AdminUserSupport,
  AdminUserSupportFilter,
  ApplicationRepository,
  CurrentVariationArtifactSnapshot,
  MaybePromise,
  ModelSyncDiffItem,
  RuntimeSessionContext,
  SessionWorkspaceContext,
  SharedVariationSnapshot,
  UpsertDiscoveredModelServicesResult,
  VariationArtifactContext,
  VariationDetailSnapshot,
  VariationJobContext,
  VariationRefineContext,
} from './repository.js'
import type { DesignEvent, DesignTemplatePack, UserCapabilityPreference } from '@dudesign/contracts'
import { adminPreviewText, redactAdminStorageKey, summarizeAdminSupportIssue } from './adminRedaction.js'
import { officialDesignTemplatePacks } from './officialDesignTemplatePacks.js'

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

export type AuthIdentity = {
  id: string
  userId: string
  provider: 'password'
  providerSubject: string
  passwordHash: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export type AuthSession = {
  id: string
  userId: string
  tokenHash: string
  userAgent: string | null
  ipHash: string | null
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  lastSeenAt: string
}

export class InMemoryStore implements ApplicationRepository {
  readonly users = new Map<string, User>()
  readonly workspaces = new Map<string, Workspace>()
  readonly workspaceMembers = new Map<string, WorkspaceMember>()
  readonly sessions = new Map<string, DesignSession>()
  readonly messages = new Map<string, SessionMessage[]>()
  readonly jobs = new Map<string, DesignJob>()
  readonly variations = new Map<string, DesignVariation>()
  readonly artifacts = new Map<string, Artifact>()
  readonly shares = new Map<string, Share>()
  readonly modelServices = new Map<string, ModelService>()
  readonly userModelAccess = new Map<string, UserModelAccess>()
  readonly userCapabilityPreferences = new Map<string, UserCapabilityPreference>()
  readonly designTemplatePacks = new Map<string, DesignTemplatePack>()
  readonly annotationBatches = new Map<string, AnnotationBatch>()
  readonly auditLogs: AuditLog[] = []
  readonly usageEvents: UsageEvent[] = []
  readonly designEvents = new Map<string, DesignEvent[]>()
  readonly authIdentities = new Map<string, AuthIdentity>()
  readonly authSessions = new Map<string, AuthSession>()

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
    this.seedModelServices(now)
    this.seedDesignTemplatePacks()
  }

  getUserById(userId: string): MaybePromise<User | null> {
    return this.users.get(userId) ?? null
  }

  getUserByEmail(email: string): MaybePromise<User | null> {
    const normalized = normalizeEmail(email)
    return [...this.users.values()].find(user => user.email.toLowerCase() === normalized) ?? null
  }

  updateUserStatus(userId: string, status: User['status']): MaybePromise<User | null> {
    const user = this.users.get(userId)
    if (!user) return null
    const updated = {
      ...user,
      status,
      updatedAt: nowIso(),
    }
    this.users.set(userId, updated)
    return updated
  }

  updateUserMetadata(userId: string, metadata: Record<string, unknown>): MaybePromise<User | null> {
    const user = this.users.get(userId)
    if (!user) return null
    const updated = {
      ...user,
      metadata,
      updatedAt: nowIso(),
    }
    this.users.set(userId, updated)
    return updated
  }

  createUserWithWorkspace(input: {
    email: string
    name?: string | null
  }): MaybePromise<{ user: User; workspace: Workspace }> {
    const now = nowIso()
    const userId = createId('usr')
    const workspaceId = createId('ws')
    const user: User = {
      id: userId,
      email: normalizeEmail(input.email),
      name: input.name?.trim() || null,
      avatarUrl: null,
      status: 'active',
      memoryNamespace: `memory:user:${userId}`,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    const workspace: Workspace = {
      id: workspaceId,
      ownerId: user.id,
      teamId: null,
      name: 'Personal Workspace',
      mode: 'hosted',
      visibility: 'private',
      storageKey: `workspaces/${workspaceId}`,
      status: 'active',
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    this.users.set(user.id, user)
    this.workspaces.set(workspace.id, workspace)
    this.workspaceMembers.set(workspaceMemberKey(workspace.id, user.id), {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    return { user, workspace }
  }

  getAuthIdentityByProvider(provider: AuthIdentity['provider'], providerSubject: string): MaybePromise<AuthIdentity | null> {
    return this.authIdentities.get(authIdentityKey(provider, providerSubject)) ?? null
  }

  createAuthIdentity(input: {
    userId: string
    provider: AuthIdentity['provider']
    providerSubject: string
    passwordHash?: string | null
    verifiedAt?: string | null
  }): MaybePromise<AuthIdentity> {
    const now = nowIso()
    const identity: AuthIdentity = {
      id: createId('aid'),
      userId: input.userId,
      provider: input.provider,
      providerSubject: normalizeEmail(input.providerSubject),
      passwordHash: input.passwordHash ?? null,
      verifiedAt: input.verifiedAt ?? null,
      createdAt: now,
      updatedAt: now,
    }
    this.authIdentities.set(authIdentityKey(identity.provider, identity.providerSubject), identity)
    return identity
  }

  createAuthSession(input: {
    userId: string
    tokenHash: string
    userAgent?: string | null
    ipHash?: string | null
    expiresAt: string
  }): MaybePromise<AuthSession> {
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
    this.authSessions.set(session.tokenHash, session)
    return session
  }

  getAuthSessionByTokenHash(tokenHash: string): MaybePromise<AuthSession | null> {
    return this.authSessions.get(tokenHash) ?? null
  }

  touchAuthSession(tokenHash: string): MaybePromise<AuthSession | null> {
    const session = this.authSessions.get(tokenHash)
    if (!session) return null
    const updated = {
      ...session,
      lastSeenAt: nowIso(),
    }
    this.authSessions.set(tokenHash, updated)
    return updated
  }

  revokeAuthSession(tokenHash: string): MaybePromise<AuthSession | null> {
    const session = this.authSessions.get(tokenHash)
    if (!session) return null
    const revoked = {
      ...session,
      revokedAt: nowIso(),
    }
    this.authSessions.set(tokenHash, revoked)
    return revoked
  }

  getUserCapabilityPreference(userId: string): MaybePromise<UserCapabilityPreference | null> {
    return this.userCapabilityPreferences.get(userId) ?? null
  }

  saveUserCapabilityPreference(userId: string, preference: UserCapabilityPreference): MaybePromise<UserCapabilityPreference> {
    this.userCapabilityPreferences.set(userId, preference)
    return preference
  }

  listDesignTemplatePacks(userId: string, _workspaceId?: string | null): MaybePromise<DesignTemplatePack[]> {
    return [...this.designTemplatePacks.values()]
      .filter(template => template.source === 'official' || template.createdByUserId === userId)
      .filter(template => template.status !== 'archived' && template.status !== 'disabled')
      .sort((a, b) => Number(a.source !== 'official') - Number(b.source !== 'official') || a.name.localeCompare(b.name))
  }

  getDesignTemplatePackById(templateId: string, userId: string, workspaceId?: string | null): MaybePromise<DesignTemplatePack | null> {
    const template = this.designTemplatePacks.get(templateId) ?? null
    if (!template) return null
    if (template.source === 'official' && template.visibility === 'public') return template
    if (template.createdByUserId === userId) return template
    if (workspaceId && template.visibility === 'workspace' && template.id.startsWith(`dtp_ws_${workspaceId}_`)) return template
    return null
  }

  saveDesignTemplatePack(template: DesignTemplatePack): MaybePromise<DesignTemplatePack> {
    this.designTemplatePacks.set(template.id, template)
    return template
  }

  getWorkspaceById(workspaceId: string): MaybePromise<Workspace | null> {
    return this.workspaces.get(workspaceId) ?? null
  }

  getPrimaryWorkspaceForUser(userId: string): MaybePromise<Workspace | null> {
    const activeMembershipWorkspaceIds = new Set(
      [...this.workspaceMembers.values()]
        .filter(member => member.userId === userId && member.status === 'active')
        .map(member => member.workspaceId),
    )
    return [...this.workspaces.values()]
      .find(candidate => candidate.ownerId === userId || activeMembershipWorkspaceIds.has(candidate.id)) ?? null
  }

  getWorkspaceMember(workspaceId: string, userId: string): MaybePromise<WorkspaceMember | null> {
    return this.workspaceMembers.get(workspaceMemberKey(workspaceId, userId)) ?? null
  }

  upsertWorkspaceMember(input: {
    workspaceId: string
    userId: string
    role: WorkspaceMember['role']
    status?: WorkspaceMember['status']
  }): MaybePromise<WorkspaceMember> {
    const now = nowIso()
    const existing = this.workspaceMembers.get(workspaceMemberKey(input.workspaceId, input.userId))
    const member: WorkspaceMember = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.workspaceMembers.set(workspaceMemberKey(member.workspaceId, member.userId), member)
    return member
  }

  listUserModelOptions(userId: string): MaybePromise<{ models: Array<{
    id: string
    provider: ModelService['provider']
    modelId: string
    displayName: string
    description: string | null
    isDefault: boolean
    capabilities: ModelService['capabilities']
    contextWindow: number | null
  }>; defaultModelId: string | null }> {
    const models = [...this.modelServices.values()]
      .filter(model => model.enabled && this.isUserModelEnabled(userId, model.id))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName))
      .map(model => ({
        id: model.id,
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
        description: model.description,
        isDefault: model.isDefault,
        capabilities: model.capabilities,
        contextWindow: model.contextWindow,
      }))
    return {
      models,
      defaultModelId: models.find(model => model.isDefault)?.id ?? models[0]?.id ?? null,
    }
  }

  getModelServiceById(modelServiceId: string): MaybePromise<ModelService | null> {
    return this.modelServices.get(modelServiceId) ?? null
  }

  canUserUseModel(userId: string, modelServiceId: string): MaybePromise<boolean> {
    const model = this.modelServices.get(modelServiceId)
    return Boolean(model?.enabled && this.isUserModelEnabled(userId, modelServiceId))
  }

  getSessionById(sessionId: string): MaybePromise<DesignSession | null> {
    return this.sessions.get(sessionId) ?? null
  }

  getJobById(jobId: string): MaybePromise<DesignJob | null> {
    return this.jobs.get(jobId) ?? null
  }

  getVariationById(variationId: string): MaybePromise<DesignVariation | null> {
    return this.variations.get(variationId) ?? null
  }

  getArtifactById(artifactId: string): MaybePromise<Artifact | null> {
    return this.artifacts.get(artifactId) ?? null
  }

  getSessionWorkspaceContext(sessionId: string): MaybePromise<SessionWorkspaceContext | null> {
    const session = this.sessions.get(sessionId) ?? null
    if (!session) return null
    return {
      session,
      workspace: this.workspaces.get(session.workspaceId) ?? null,
    }
  }

  getVariationJobContext(variationId: string): MaybePromise<VariationJobContext | null> {
    const variation = this.variations.get(variationId) ?? null
    if (!variation) return null
    return {
      variation,
      job: this.jobs.get(variation.jobId) ?? null,
    }
  }

  getVariationRefineContext(variationId: string, baseArtifactId: string): MaybePromise<VariationRefineContext | null> {
    const variation = this.variations.get(variationId) ?? null
    if (!variation) return null
    const job = this.jobs.get(variation.jobId) ?? null
    return {
      variation,
      job,
      session: this.sessions.get(variation.sessionId) ?? null,
      workspace: job ? this.workspaces.get(job.workspaceId) ?? null : null,
      baseArtifact: this.artifacts.get(baseArtifactId) ?? null,
    }
  }

  getVariationArtifactContext(variationId: string, artifactId: string): MaybePromise<VariationArtifactContext> {
    const variation = this.variations.get(variationId) ?? null
    const artifact = this.artifacts.get(artifactId) ?? null
    return {
      variation,
      artifact,
      mismatch: Boolean(variation && artifact && artifact.variationId !== variation.id),
    }
  }

  getRuntimeSessionContext(sessionId: string): MaybePromise<RuntimeSessionContext | null> {
    const session = this.sessions.get(sessionId) ?? null
    if (!session) return null
    return {
      session,
      user: this.users.get(session.userId) ?? null,
      workspace: this.workspaces.get(session.workspaceId) ?? null,
    }
  }

  createSession(input: {
    userId: string
    workspaceId: string
    mode: DesignSession['mode']
    title?: string
    sourceArtifactId?: string | null
    runtimeSessionId?: string | null
  }): MaybePromise<DesignSession> {
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

  saveSession(session: DesignSession): MaybePromise<void> {
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
      metadata: {},
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
    this.workspaceMembers.set(workspaceMemberKey(workspace.id, user.id), {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
      status: 'active',
      createdAt: input.now,
      updatedAt: input.now,
    })
    return { user, workspace }
  }

  private seedModelServices(now: string): void {
    const models: ModelService[] = [
      {
        id: 'mdl_babelo_default',
        provider: 'babel-o',
        modelId: 'babel-o-default',
        displayName: 'BabeL-O Default',
        description: 'Default BabeL-O runtime model for HTML generation and refinement.',
        enabled: true,
        isDefault: true,
        capabilities: ['html_generation', 'html_refine', 'long_context'],
        contextWindow: 128000,
        inputTokenCostCents: 0,
        outputTokenCostCents: 0,
        metadata: { source: 'seed' },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mdl_babelo_fast',
        provider: 'babel-o',
        modelId: 'babel-o-fast',
        displayName: 'BabeL-O Fast',
        description: 'Lower-latency option for quick drafts and short refinement loops.',
        enabled: true,
        isDefault: false,
        capabilities: ['html_generation', 'html_refine'],
        contextWindow: 64000,
        inputTokenCostCents: 0,
        outputTokenCostCents: 0,
        metadata: { source: 'seed' },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mdl_mock_design',
        provider: 'mock',
        modelId: 'mock-design',
        displayName: 'Mock Design Runtime',
        description: 'Development-only model option backed by DUDesign mock runtime.',
        enabled: false,
        isDefault: false,
        capabilities: ['html_generation', 'html_refine'],
        contextWindow: 16000,
        inputTokenCostCents: 0,
        outputTokenCostCents: 0,
        metadata: { source: 'seed', developmentOnly: true },
        createdAt: now,
        updatedAt: now,
      },
    ]
    for (const model of models) this.modelServices.set(model.id, model)
  }

  private seedDesignTemplatePacks(): void {
    for (const template of officialDesignTemplatePacks) {
      this.designTemplatePacks.set(template.id, template)
    }
  }

  appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): MaybePromise<SessionMessage> {
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
  }): MaybePromise<DesignJob> {
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

  createVariations(input: { job: DesignJob; count: number }): MaybePromise<DesignVariation[]> {
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

  listSessions(): MaybePromise<DesignSession[]> {
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
      .filter(artifact => artifact.variationId === variationId)
      .sort((a, b) => artifactSortKey(a).localeCompare(artifactSortKey(b)))
    const currentArtifact = variation.currentArtifactId
      ? this.artifacts.get(variation.currentArtifactId) ?? null
      : artifacts.find(artifact => artifact.kind === 'html') ?? null
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

  getVariationAssetArtifacts(variationId: string, parentArtifactId: string): MaybePromise<Artifact[]> {
    return [...this.artifacts.values()]
      .filter(artifact =>
        artifact.kind === 'asset'
        && artifact.variationId === variationId
        && artifact.parentArtifactId === parentArtifactId
        && typeof artifact.entryPath === 'string',
      )
      .sort((a, b) => (a.entryPath ?? '').localeCompare(b.entryPath ?? ''))
  }

  getVariationAssetArtifact(variationId: string, parentArtifactId: string, assetPath: string): MaybePromise<Artifact | null> {
    return [...this.artifacts.values()].find(artifact =>
      artifact.kind === 'asset'
      && artifact.variationId === variationId
      && artifact.parentArtifactId === parentArtifactId
      && artifact.entryPath === assetPath,
    ) ?? null
  }

  getExportArtifactForSource(variationId: string, sourceArtifactId: string): MaybePromise<Artifact | null> {
    return [...this.artifacts.values()]
      .filter(artifact =>
        artifact.kind === 'export_zip'
        && artifact.variationId === variationId
        && artifact.parentArtifactId === sourceArtifactId,
      )
      .sort(compareRecent)[0] ?? null
  }

  setJobStatus(jobId: string, status: DesignJob['status']): MaybePromise<void> {
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

  createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): MaybePromise<AuditLog> {
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

  createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): MaybePromise<UsageEvent> {
    const existing = this.usageEvents.find(event => event.idempotencyKey === input.idempotencyKey)
    if (existing) return existing
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

  appendDesignEvent(event: DesignEvent): MaybePromise<DesignEvent> {
    if (!event.jobId) return event
    const events = this.designEvents.get(event.jobId) ?? []
    events.push(event)
    this.designEvents.set(event.jobId, events)
    return event
  }

  listDesignEvents(jobId: string): MaybePromise<DesignEvent[]> {
    return [...(this.designEvents.get(jobId) ?? [])]
  }

  applyVariationEvent(input: {
    variationId: string
    status?: DesignVariation['status']
	    artifactId?: string
	    previewUrl?: string
    runtimeChildSessionId?: string
    runtimeAgentJobId?: string
    screenshotArtifactId?: string | null
    inputTokens?: number
    outputTokens?: number
    costCents?: number
    errorCode?: string
    errorMessage?: string
  }): MaybePromise<void> {
    const variation = this.variations.get(input.variationId)
    if (!variation) return
    this.variations.set(input.variationId, {
      ...variation,
      status: input.status ?? variation.status,
	      currentArtifactId: input.artifactId ?? variation.currentArtifactId,
	      previewUrl: input.previewUrl ?? variation.previewUrl,
	      screenshotArtifactId: input.screenshotArtifactId ?? variation.screenshotArtifactId,
	      runtimeChildSessionId: input.runtimeChildSessionId ?? variation.runtimeChildSessionId,
	      runtimeAgentJobId: input.runtimeAgentJobId ?? variation.runtimeAgentJobId,
	      inputTokens: input.inputTokens ?? variation.inputTokens,
      outputTokens: input.outputTokens ?? variation.outputTokens,
      costCents: input.costCents ?? variation.costCents,
      errorCode: input.errorCode ?? variation.errorCode,
      errorMessage: input.errorMessage ?? variation.errorMessage,
      updatedAt: nowIso(),
    })
  }

  setVariationCurrentArtifact(variationId: string, artifactId: string, previewUrl: string | null): MaybePromise<DesignVariation | null> {
    const variation = this.variations.get(variationId)
    if (!variation) return null
    const updated: DesignVariation = {
      ...variation,
      currentArtifactId: artifactId,
      previewUrl,
      updatedAt: nowIso(),
    }
    this.variations.set(variationId, updated)
    return updated
  }

  createMockArtifact(input: {
    workspaceId: string
    sessionId: string
    variationId: string
    artifactId?: string
    entryPath?: string
    parentArtifactId?: string | null
  }): MaybePromise<Artifact> {
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
  }): MaybePromise<Artifact> {
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

  saveArtifact(artifact: Artifact): MaybePromise<void> {
    this.artifacts.set(artifact.id, artifact)
  }

  createAnnotationBatch(input: {
    variationId: string
    artifactId: string
    userId: string
    shapes: unknown[]
    promptSuffix: string
  }): MaybePromise<AnnotationBatch> {
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
  }): MaybePromise<Share> {
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

  getShareByToken(token: string): MaybePromise<Share | null> {
    return this.shares.get(token) ?? null
  }

  listSharesForArtifact(artifactId: string): MaybePromise<Share[]> {
    return [...this.shares.values()]
      .filter(share => share.artifactId === artifactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getSharedVariationSnapshot(token: string): MaybePromise<SharedVariationSnapshot | null> {
    const share = this.shares.get(token) ?? null
    if (!share) return null
    return {
      share,
      variation: this.variations.get(share.variationId) ?? null,
      artifact: this.artifacts.get(share.artifactId) ?? null,
    }
  }

  revokeShare(token: string): MaybePromise<Share | null> {
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
      .filter(job => !filter.workspaceId || job.workspaceId === filter.workspaceId)
      .filter(job => !filter.sessionId || job.sessionId === filter.sessionId)
      .filter(job => !filter.createdFrom || job.createdAt >= filter.createdFrom)
      .filter(job => !filter.createdTo || job.createdAt <= filter.createdTo)
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
          prompt: adminPreviewText(job.prompt, 180) ?? '',
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
          variations: variations
            .sort((a, b) => a.index - b.index)
            .map(variation => ({
              id: variation.id,
              index: variation.index,
              title: variation.title,
              status: variation.status,
              currentArtifactId: variation.currentArtifactId,
              previewUrl: variation.previewUrl,
              inputTokens: variation.inputTokens,
              outputTokens: variation.outputTokens,
              costCents: variation.costCents,
              errorCode: variation.errorCode,
              errorMessage: adminPreviewText(variation.errorMessage, 160),
              updatedAt: variation.updatedAt,
            })),
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
          storageKey: redactAdminStorageKey(artifact.storageKey),
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
              .sort(compareRecent)
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
                queued: variationSummary.queued ?? 0,
                running: variationSummary.running ?? 0,
                streaming: variationSummary.streaming ?? 0,
                renderingPreview: variationSummary.rendering_preview ?? 0,
                completed: variationSummary.completed ?? 0,
                failed: variationSummary.failed ?? 0,
                cancelled: variationSummary.cancelled ?? 0,
              },
              failureSummary: summarizeAdminSupportIssue(latestJob, failedVariations),
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
            }
            return supportSession
          }),
        }
      }),
    }
  }

  listAdminModels(): MaybePromise<{ models: AdminModelSummary[] }> {
    return {
      models: [...this.modelServices.values()]
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName))
        .map(model => ({
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          enabled: model.enabled,
          isDefault: model.isDefault,
          capabilities: model.capabilities,
          contextWindow: model.contextWindow,
          inputTokenCostCents: model.inputTokenCostCents,
          outputTokenCostCents: model.outputTokenCostCents,
          metadata: model.metadata,
          createdAt: model.createdAt,
          updatedAt: model.updatedAt,
        })),
    }
  }

  upsertDiscoveredModelServices(models: ModelService[]): MaybePromise<UpsertDiscoveredModelServicesResult> {
    let createdCount = 0
    let updatedCount = 0
    let missingCount = 0
    let disabledMissingCount = 0
    const diff: ModelSyncDiffItem[] = []
    const discoveredIds = new Set(models.map(model => model.id))
    const syncTime = models[0]?.updatedAt ?? nowIso()
    for (const model of models) {
      const existing = this.modelServices.get(model.id)
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
        this.modelServices.set(model.id, {
          ...merged,
          metadata: {
            ...merged.metadata,
            runtimeMissingSinceLastSync: false,
          },
        })
      } else {
        createdCount += 1
        diff.push(modelSyncDiffItem('created', null, model))
        this.modelServices.set(model.id, model)
      }
    }
    for (const existing of this.modelServices.values()) {
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
      this.modelServices.set(existing.id, missing)
    }
    return {
      createdCount,
      updatedCount,
      missingCount,
      disabledMissingCount,
      diff,
      models: [...this.modelServices.values()]
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.displayName.localeCompare(b.displayName))
        .map(model => ({
          id: model.id,
          provider: model.provider,
          modelId: model.modelId,
          displayName: model.displayName,
          description: model.description,
          enabled: model.enabled,
          isDefault: model.isDefault,
          capabilities: model.capabilities,
          contextWindow: model.contextWindow,
          inputTokenCostCents: model.inputTokenCostCents,
          outputTokenCostCents: model.outputTokenCostCents,
          metadata: model.metadata,
          createdAt: model.createdAt,
          updatedAt: model.updatedAt,
        })),
    }
  }

  updateAdminModel(modelServiceId: string, input: { enabled?: boolean; isDefault?: boolean }): MaybePromise<ModelService | null> {
    const model = this.modelServices.get(modelServiceId)
    if (!model) return null
    const now = nowIso()
    if (input.isDefault === true) {
      for (const candidate of this.modelServices.values()) {
        if (candidate.id !== modelServiceId && candidate.isDefault) {
          this.modelServices.set(candidate.id, {
            ...candidate,
            isDefault: false,
            updatedAt: now,
          })
        }
      }
    }
    const updated: ModelService = {
      ...model,
      ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
      ...(typeof input.isDefault === 'boolean' && { isDefault: input.isDefault }),
      updatedAt: now,
    }
    this.modelServices.set(updated.id, updated)
    return updated
  }

  getAdminUserModelAccess(userId: string): MaybePromise<{ userId: string; access: AdminUserModelAccess[] }> {
    return {
      userId,
      access: [...this.modelServices.values()]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map(model => {
          const access = this.getOrCreateUserModelAccess(userId, model.id)
          return {
            ...access,
            usage: this.getUserModelUsage(userId, model.id),
          }
        }),
    }
  }

  updateUserModelAccess(
    userId: string,
    modelServiceId: string,
    input: {
      enabled?: boolean
      dailyTokenLimit?: number | null
      monthlyCostLimitCents?: number | null
    },
  ): MaybePromise<UserModelAccess> {
    const access = this.getOrCreateUserModelAccess(userId, modelServiceId)
    const updated: UserModelAccess = {
      ...access,
      ...(typeof input.enabled === 'boolean' && { enabled: input.enabled }),
      ...(input.dailyTokenLimit !== undefined && { dailyTokenLimit: input.dailyTokenLimit }),
      ...(input.monthlyCostLimitCents !== undefined && { monthlyCostLimitCents: input.monthlyCostLimitCents }),
      updatedAt: nowIso(),
    }
    this.userModelAccess.set(userModelAccessKey(userId, modelServiceId), updated)
    return updated
  }

  getAdminMemoryGovernance(filter: AdminUserSupportFilter = {}): MaybePromise<AdminMemoryGovernance> {
    const userId = filter.userId?.trim()
    const email = filter.email?.trim().toLowerCase()
    const users = [...this.users.values()]
      .filter(user => !userId || user.id === userId)
      .filter(user => !email || user.email.toLowerCase().includes(email))
      .sort((a, b) => a.email.localeCompare(b.email))
    const namespaceCounts = countMemoryNamespaces([...this.users.values()])
    const summaries: AdminMemoryUserSummary[] = users.map(user => {
      const workspaces = [...this.workspaces.values()].filter(workspace => workspace.ownerId === user.id)
      const sessions = [...this.sessions.values()].filter(session => session.userId === user.id)
      const sessionIds = new Set(sessions.map(session => session.id))
      const jobs = [...this.jobs.values()].filter(job => job.userId === user.id || sessionIds.has(job.sessionId))
      return {
        userId: user.id,
        email: user.email,
        memoryNamespace: user.memoryNamespace,
        isolationStatus: memoryIsolationStatus(user.memoryNamespace, namespaceCounts),
        workspaceCount: workspaces.length,
        sessionCount: sessions.length,
        runtimeSessionCount: sessions.filter(session => Boolean(session.runtimeSessionId)).length,
        jobCount: jobs.length,
        memoryRefCount: 0,
        pendingMemoryNoteCount: 0,
        approvedMemoryNoteCount: 0,
        rejectedMemoryNoteCount: 0,
        lastSessionAt: sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt ?? null,
      }
    })
    return buildMemoryGovernanceResponse(summaries)
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

  private isUserModelEnabled(userId: string, modelServiceId: string): boolean {
    return this.userModelAccess.get(userModelAccessKey(userId, modelServiceId))?.enabled ?? true
  }

  private getOrCreateUserModelAccess(userId: string, modelServiceId: string): UserModelAccess {
    const key = userModelAccessKey(userId, modelServiceId)
    const existing = this.userModelAccess.get(key)
    if (existing) return existing
    const now = nowIso()
    const access: UserModelAccess = {
      id: createId('uma'),
      userId,
      modelServiceId,
      enabled: true,
      dailyTokenLimit: null,
      monthlyCostLimitCents: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    }
    this.userModelAccess.set(key, access)
    return access
  }

  private getUserModelUsage(userId: string, modelServiceId: string): AdminUserModelAccess['usage'] {
    const events = this.listUsageEvents({ userId })
      .filter(event => event.metadata.modelServiceId === modelServiceId)
    return events.reduce(
      (acc, event) => {
        acc.inputTokens += event.inputTokens
        acc.outputTokens += event.outputTokens
        acc.costCents += event.costCents
        acc.usageEventCount += 1
        return acc
      },
      { inputTokens: 0, outputTokens: 0, costCents: 0, usageEventCount: 0 },
    )
  }
}

function userModelAccessKey(userId: string, modelServiceId: string): string {
  return `${userId}:${modelServiceId}`
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function authIdentityKey(provider: AuthIdentity['provider'], providerSubject: string): string {
  return `${provider}:${normalizeEmail(providerSubject)}`
}

function workspaceMemberKey(workspaceId: string, userId: string): string {
  return `${workspaceId}:${userId}`
}

function artifactSortKey(artifact: Artifact): string {
  const kindRank = artifact.kind === 'html'
    ? '0'
    : artifact.kind === 'asset'
      ? '1'
      : artifact.kind === 'export_zip'
        ? '2'
        : '3'
  return `${String(999999 - artifact.version).padStart(6, '0')}:${kindRank}:${artifact.entryPath ?? artifact.id}`
}

function compareRecent<T extends { id: string; createdAt: string; updatedAt?: string }>(a: T, b: T): number {
  const updated = (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
  if (updated !== 0) return updated
  const created = b.createdAt.localeCompare(a.createdAt)
  if (created !== 0) return created
  return b.id.localeCompare(a.id)
}

function countMemoryNamespaces(users: User[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const user of users) {
    const namespace = user.memoryNamespace.trim()
    if (!namespace) continue
    counts.set(namespace, (counts.get(namespace) ?? 0) + 1)
  }
  return counts
}

function memoryIsolationStatus(memoryNamespace: string, counts: Map<string, number>): AdminMemoryUserSummary['isolationStatus'] {
  const namespace = memoryNamespace.trim()
  if (!namespace) return 'missing_namespace'
  return (counts.get(namespace) ?? 0) > 1 ? 'namespace_conflict' : 'isolated'
}

function buildMemoryGovernanceResponse(users: AdminMemoryUserSummary[]): AdminMemoryGovernance {
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
