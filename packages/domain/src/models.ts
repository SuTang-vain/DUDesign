export type ID = string
export type ISODateTime = string

export type WorkspaceMode = 'hosted'
export type WorkspaceStatus = 'active' | 'archived'
export type WorkspaceVisibility = 'private' | 'team' | 'public'
export type WorkspaceMemberRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type WorkspaceMemberStatus = 'active' | 'invited' | 'removed'

export type SessionStatus = 'active' | 'archived'
export type SourceMode = 'new_html' | 'from_existing_html'

export type DesignJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type DesignVariationStatus =
  | 'queued'
  | 'running'
  | 'streaming'
  | 'rendering_preview'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ArtifactKind = 'html' | 'asset' | 'screenshot' | 'export_zip'
export type ShareVisibility = 'public' | 'private' | 'password'
export type MemoryNoteStatus = 'pending' | 'approved' | 'rejected'
export type UsageEventKind =
  | 'variation.completed'
  | 'variation.refined'
  | 'export.created'
  | 'share.created'

export type ModelServiceProvider = 'babel-o' | 'openai-compatible' | 'mock'

export type ModelCapability =
  | 'html_generation'
  | 'html_refine'
  | 'vision_annotation'
  | 'long_context'

export type ModelService = {
  id: ID
  provider: ModelServiceProvider
  modelId: string
  displayName: string
  description: string | null
  enabled: boolean
  isDefault: boolean
  capabilities: ModelCapability[]
  contextWindow: number | null
  inputTokenCostCents: number
  outputTokenCostCents: number
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type UserModelAccess = {
  id: ID
  userId: ID
  modelServiceId: ID
  enabled: boolean
  dailyTokenLimit: number | null
  monthlyCostLimitCents: number | null
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type User = {
  id: ID
  email: string
  name: string | null
  avatarUrl: string | null
  status: 'active' | 'disabled'
  memoryNamespace: string
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type Workspace = {
  id: ID
  ownerId: ID
  teamId: ID | null
  name: string
  mode: WorkspaceMode
  visibility: WorkspaceVisibility
  storageKey: string
  status: WorkspaceStatus
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type WorkspaceMember = {
  workspaceId: ID
  userId: ID
  role: WorkspaceMemberRole
  status: WorkspaceMemberStatus
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type DesignSession = {
  id: ID
  userId: ID
  workspaceId: ID
  title: string
  mode: SourceMode
  sourceArtifactId: ID | null
  runtimeSessionId: string | null
  status: SessionStatus
  lastPrompt: string | null
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type DesignJob = {
  id: ID
  sessionId: ID
  userId: ID
  workspaceId: ID
  prompt: string
  sourceMode: SourceMode
  variationCount: number
  templateRequirements: Record<string, unknown>
  status: DesignJobStatus
  totalInputTokens: number
  totalOutputTokens: number
  totalCostCents: number
  startedAt: ISODateTime | null
  completedAt: ISODateTime | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type DesignVariation = {
  id: ID
  jobId: ID
  sessionId: ID
  index: number
  title: string | null
  runtimeChildSessionId: string | null
  runtimeAgentJobId: string | null
  status: DesignVariationStatus
  currentArtifactId: ID | null
  previewUrl: string | null
  screenshotArtifactId: ID | null
  inputTokens: number
  outputTokens: number
  costCents: number
  errorCode: string | null
  errorMessage: string | null
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export type Artifact = {
  id: ID
  workspaceId: ID
  sessionId: ID
  variationId: ID | null
  parentArtifactId: ID | null
  kind: ArtifactKind
  version: number
  storageKey: string
  entryPath: string | null
  contentHash: string
  sizeBytes: number
  metadata: Record<string, unknown>
  createdAt: ISODateTime
}

export type Share = {
  id: ID
  artifactId: ID
  variationId: ID
  ownerId: ID
  token: string
  visibility: ShareVisibility
  passwordHash: string | null
  revokedAt: ISODateTime | null
  expiresAt: ISODateTime | null
  createdAt: ISODateTime
}

export type UsageEvent = {
  id: ID
  idempotencyKey: string
  kind: UsageEventKind
  userId: ID
  workspaceId: ID
  sessionId: ID | null
  jobId: ID | null
  variationId: ID | null
  artifactId: ID | null
  inputTokens: number
  outputTokens: number
  costCents: number
  metadata: Record<string, unknown>
  createdAt: ISODateTime
}
