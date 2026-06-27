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
import type { AnnotationBatch, AuditLog, SessionMessage } from './store.js'

export type MaybePromise<T> = T | Promise<T>

export type SessionSnapshot = {
  session: DesignSession
  messages: SessionMessage[]
  jobs: DesignJob[]
  variations: DesignVariation[]
  artifacts: Artifact[]
}

export type JobSnapshot = {
  job: DesignJob
  variations: DesignVariation[]
  artifacts: Artifact[]
}

export type VariationDetailSnapshot = {
  variation: DesignVariation
  job: DesignJob | null
  currentArtifact: Artifact | null
  artifacts: Artifact[]
}

export type CurrentVariationArtifactSnapshot = {
  variation: DesignVariation | null
  artifactId: string | null
  artifact: Artifact | null
  mismatch: boolean
}

export type SharedVariationSnapshot = {
  share: Share
  variation: DesignVariation | null
  artifact: Artifact | null
}

export type SessionWorkspaceContext = {
  session: DesignSession
  workspace: Workspace | null
}

export type VariationJobContext = {
  variation: DesignVariation
  job: DesignJob | null
}

export type VariationRefineContext = {
  variation: DesignVariation
  job: DesignJob | null
  session: DesignSession | null
  workspace: Workspace | null
  baseArtifact: Artifact | null
}

export type VariationArtifactContext = {
  variation: DesignVariation | null
  artifact: Artifact | null
  mismatch: boolean
}

export type RuntimeSessionContext = {
  session: DesignSession
  user: User | null
  workspace: Workspace | null
}

export type CreateSessionInput = {
  userId: string
  workspaceId: string
  mode: DesignSession['mode']
  title?: string
  sourceArtifactId?: string | null
  runtimeSessionId?: string | null
}

export type CreateJobInput = {
  session: DesignSession
  prompt: string
  sourceMode: DesignJob['sourceMode']
  variationCount: number
  templateRequirements: Record<string, unknown>
}

export type ApplyVariationEventInput = {
  variationId: string
  status?: DesignVariation['status']
  artifactId?: string
  previewUrl?: string
  inputTokens?: number
  outputTokens?: number
  costCents?: number
  errorCode?: string
  errorMessage?: string
}

export type CreateHtmlArtifactInput = {
  workspaceId: string
  sessionId: string
  variationId: string
  artifactId?: string
  entryPath?: string
  parentArtifactId?: string | null
}

export type CreateArtifactInput = {
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
}

export type CreateAnnotationBatchInput = {
  variationId: string
  artifactId: string
  userId: string
  shapes: unknown[]
  promptSuffix: string
}

export type CreateShareInput = {
  artifactId: string
  variationId: string
  ownerId: string
  visibility: Share['visibility']
  expiresAt?: string | null
}

export type AdminJobsFilter = {
  status?: string | null
  userId?: string | null
}

export type AdminArtifactsFilter = {
  jobId?: string | null
  variationId?: string | null
  kind?: string | null
}

export type AdminUserSupportFilter = {
  userId?: string | null
  email?: string | null
}

export type AdminJobSummary = {
  id: string
  userId: string
  workspaceId: string
  sessionId: string
  prompt: string
  status: DesignJob['status']
  variationCount: number
  completedVariationCount: number
  failedVariationCount: number
  cancelledVariationCount: number
  artifactCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostCents: number
  errorCount: number
  createdAt: string
  updatedAt: string
}

export type AdminArtifactSummary = {
  id: string
  workspaceId: string
  sessionId: string
  jobId: string | null
  variationId: string | null
  parentArtifactId: string | null
  kind: Artifact['kind']
  version: number
  storageKey: string
  entryPath: string | null
  contentHash: string
  sizeBytes: number
  previewUrl: string | null
  shareCount: number
  createdAt: string
}

export type AdminFailureSummary = {
  severity: 'ok' | 'warning' | 'blocked'
  message: string
  failedVariationCount: number
  examples: Array<{
    variationId: string
    errorCode: string | null
    message: string | null
  }>
}

export type AdminSupportSession = {
  id: string
  workspaceId: string
  title: string
  mode: DesignSession['mode']
  status: DesignSession['status']
  resumeState: 'runtime_session_available' | 'runtime_session_missing'
  lastPromptPreview: string | null
  jobCount: number
  latestJob: {
    id: string
    status: DesignJob['status']
    variationCount: number
    updatedAt: string
  } | null
  variationSummary: {
    queued: number
    running: number
    streaming: number
    renderingPreview: number
    completed: number
    failed: number
    cancelled: number
  }
  failureSummary: AdminFailureSummary
  createdAt: string
  updatedAt: string
}

export type AdminUserSupport = {
  user: {
    id: string
    email: string
    name: string | null
    status: User['status']
    createdAt: string
    updatedAt: string
  }
  workspaces: Array<{
    id: string
    name: string
    visibility: Workspace['visibility']
    status: Workspace['status']
  }>
  sessions: AdminSupportSession[]
}

export type AdminCostByUser = {
  userId: string
  jobCount: number
  usageEventCount: number
  inputTokens: number
  outputTokens: number
  costCents: number
}

export type AdminCostSummary = {
  totals: {
    jobCount: number
    usageEventCount: number
    inputTokens: number
    outputTokens: number
    costCents: number
  }
  byUser: AdminCostByUser[]
}

export type ApplicationRepository = {
  readonly users: Map<string, User>
  readonly workspaces: Map<string, Workspace>
  readonly sessions: Map<string, DesignSession>
  readonly messages: Map<string, SessionMessage[]>
  readonly jobs: Map<string, DesignJob>
  readonly variations: Map<string, DesignVariation>
  readonly artifacts: Map<string, Artifact>
  readonly shares: Map<string, Share>
  readonly annotationBatches: Map<string, AnnotationBatch>
  readonly auditLogs: AuditLog[]
  readonly usageEvents: UsageEvent[]

  readonly devUser: User
  readonly devWorkspace: Workspace

  getUserById(userId: string): MaybePromise<User | null>
  getWorkspaceById(workspaceId: string): MaybePromise<Workspace | null>
  getPrimaryWorkspaceForUser(userId: string): MaybePromise<Workspace | null>
  getSessionById(sessionId: string): MaybePromise<DesignSession | null>
  getJobById(jobId: string): MaybePromise<DesignJob | null>
  getVariationById(variationId: string): MaybePromise<DesignVariation | null>
  getArtifactById(artifactId: string): MaybePromise<Artifact | null>
  getSessionWorkspaceContext(sessionId: string): MaybePromise<SessionWorkspaceContext | null>
  getVariationJobContext(variationId: string): MaybePromise<VariationJobContext | null>
  getVariationRefineContext(variationId: string, baseArtifactId: string): MaybePromise<VariationRefineContext | null>
  getVariationArtifactContext(variationId: string, artifactId: string): MaybePromise<VariationArtifactContext>
  getRuntimeSessionContext(sessionId: string): MaybePromise<RuntimeSessionContext | null>
  createSession(input: CreateSessionInput): MaybePromise<DesignSession>
  saveSession(session: DesignSession): MaybePromise<void>
  appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): MaybePromise<SessionMessage>
  createJob(input: CreateJobInput): MaybePromise<DesignJob>
  createVariations(input: { job: DesignJob; count: number }): MaybePromise<DesignVariation[]>
  listSessions(): MaybePromise<DesignSession[]>
  getSessionSnapshot(sessionId: string): MaybePromise<SessionSnapshot | null>
  getJobSnapshot(jobId: string): MaybePromise<JobSnapshot | null>
  getVariationDetailSnapshot(variationId: string): MaybePromise<VariationDetailSnapshot | null>
  getCurrentVariationArtifactSnapshot(variationId: string): MaybePromise<CurrentVariationArtifactSnapshot>
  getVariationAssetArtifacts(variationId: string, parentArtifactId: string): MaybePromise<Artifact[]>
  getVariationAssetArtifact(variationId: string, parentArtifactId: string, assetPath: string): MaybePromise<Artifact | null>
  setJobStatus(jobId: string, status: DesignJob['status']): MaybePromise<void>
  createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): MaybePromise<AuditLog>
  listAuditLogs(options?: { limit?: number }): AuditLog[]
  createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): MaybePromise<UsageEvent>
  listUsageEvents(options?: {
    userId?: string
    jobId?: string
    variationId?: string
    limit?: number
  }): UsageEvent[]
  applyVariationEvent(input: ApplyVariationEventInput): MaybePromise<void>
  createMockArtifact(input: CreateHtmlArtifactInput): MaybePromise<Artifact>
  createArtifact(input: CreateArtifactInput): MaybePromise<Artifact>
  saveArtifact(artifact: Artifact): MaybePromise<void>
  createAnnotationBatch(input: CreateAnnotationBatchInput): MaybePromise<AnnotationBatch>
  createShare(input: CreateShareInput): MaybePromise<Share>
  getShareByToken(token: string): MaybePromise<Share | null>
  getSharedVariationSnapshot(token: string): MaybePromise<SharedVariationSnapshot | null>
  revokeShare(token: string): MaybePromise<Share | null>
  listAdminJobs(filter?: AdminJobsFilter): {
    jobs: AdminJobSummary[]
  } | Promise<{ jobs: AdminJobSummary[] }>
  listAdminArtifacts(filter?: AdminArtifactsFilter): {
    artifacts: AdminArtifactSummary[]
  } | Promise<{ artifacts: AdminArtifactSummary[] }>
  getAdminUserSupport(filter?: AdminUserSupportFilter): {
    users: AdminUserSupport[]
  } | Promise<{ users: AdminUserSupport[] }>
  getAdminCostSummary(): MaybePromise<AdminCostSummary>
}
