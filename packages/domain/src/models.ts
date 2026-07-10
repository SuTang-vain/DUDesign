export type ID = string
export type ISODateTime = string

export type WorkspaceMode = 'hosted'
export type WorkspaceStatus = 'active' | 'archived'
export type WorkspaceVisibility = 'private' | 'team' | 'public'
export type WorkspaceMemberRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type WorkspaceMemberStatus = 'active' | 'invited' | 'removed'

export type SessionStatus = 'active' | 'archived'
export type SourceMode = 'new_html' | 'from_existing_html'
export type ProductMode = 'web_app' | 'dynamic_encyclopedia_card'

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
  | 'capability.template.selected'
  | 'capability.plugin.selected'
  | 'capability.preference.updated'

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
  productMode: ProductMode
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
  runtimeLaneId: string | null
  runtimeBackendId: string | null
  runtimeLeaseId: string | null
  runtimeAttempt: number
  runtimeLastErrorCode: string | null
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

export type EncyclopediaEntryGuidanceStatus = 'draft' | 'needs_confirmation' | 'confirmed'

/**
 * 词条正文预期语种。用于百科规范审查时的"中文优先"豁免判断。
 * 'other' 表示不在已知语种白名单内的字符（如少数民族文字、转写方案等）。
 */
export type EntryContentLanguage = 'zh' | 'en' | 'fr' | 'ja' | 'ko' | 'other' | 'mixed'

export type EncyclopediaEntryGuidance = {
  id: ID
  userId: ID
  workspaceId: ID
  productMode: Extract<ProductMode, 'dynamic_encyclopedia_card'>
  entryTitle: string
  rawInput: string
  context: string | null
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory: string
  confidence: number
  signals: string[]
  recommendedTemplateIds: ID[]
  selectedTemplateIds: ID[]
  interactionParadigmId: ID
  automationMode: 'off' | 'semi_auto' | 'auto'
  /**
   * 是否为"语言类"词条（外语/语言学/翻译/方言/语言研究类）。
   * 此类词条允许正文使用外语，不受"中文优先"硬约束限制。
   * 由 `detectEntryLanguage` 启发式 + democase 信号共同决定。
   */
  isLanguageCategory: boolean
  /**
   * 词条正文预期语种。仅用于 spec review 与未来 i18n 适配，不影响生成。
   */
  entryContentLanguage: EntryContentLanguage
  status: EncyclopediaEntryGuidanceStatus
  confirmedAt: ISODateTime | null
  metadata: Record<string, unknown>
  createdAt: ISODateTime
  updatedAt: ISODateTime
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
