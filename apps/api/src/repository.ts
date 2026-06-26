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

  createSession(input: CreateSessionInput): DesignSession
  appendMessage(message: Omit<SessionMessage, 'id' | 'createdAt'>): SessionMessage
  createJob(input: CreateJobInput): DesignJob
  createVariations(input: { job: DesignJob; count: number }): DesignVariation[]
  listSessions(): DesignSession[]
  getSessionSnapshot(sessionId: string): SessionSnapshot | null
  getJobSnapshot(jobId: string): JobSnapshot | null
  setJobStatus(jobId: string, status: DesignJob['status']): void
  createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>): AuditLog
  listAuditLogs(options?: { limit?: number }): AuditLog[]
  createUsageEvent(input: Omit<UsageEvent, 'id' | 'createdAt'>): UsageEvent
  listUsageEvents(options?: {
    userId?: string
    jobId?: string
    variationId?: string
    limit?: number
  }): UsageEvent[]
  applyVariationEvent(input: ApplyVariationEventInput): void
  createMockArtifact(input: CreateHtmlArtifactInput): Artifact
  createArtifact(input: CreateArtifactInput): Artifact
  createAnnotationBatch(input: CreateAnnotationBatchInput): AnnotationBatch
  createShare(input: CreateShareInput): Share
  getShareByToken(token: string): Share | null
  revokeShare(token: string): Share | null
}
