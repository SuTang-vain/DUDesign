export type ID = string

export type SourceMode = 'new_html' | 'from_existing_html'

export type DeviceTarget = 'desktop' | 'tablet' | 'mobile'

export type ModelCapability =
  | 'html_generation'
  | 'html_refine'
  | 'vision_annotation'
  | 'long_context'

export type UserModelOption = {
  id: ID
  modelId: string
  displayName: string
  description: string | null
  provider: string
  isDefault: boolean
  capabilities: ModelCapability[]
  contextWindow: number | null
}

export type ListUserModelsResponse = {
  models: UserModelOption[]
  defaultModelId: ID | null
}

export type WorkspaceOption = {
  id: ID
  name: string
  storageKey: string
}

export type DomainTemplate = {
  id: ID
  name: string
  category: string
  description: string
  contentVersion: string
  structure: {
    sections: string[]
    requiredElements: string[]
    optionalElements: string[]
  }
  constraints: string[]
  variationDirections: string[]
}

export type AestheticProfile = {
  id: ID
  name: string
  description: string
  colorPaletteIds: ID[]
  mood: string[]
  occasion: string[]
  tone: string[]
  formality: string
  density: string
  bestFor: string[]
  avoidFor: string[]
  typographyTone: string
  layoutTone: string
  motionTone: string
  negativeRules: string[]
}

export type ColorPalette = {
  id: ID
  name: string
  colors: string[]
  usage: Record<string, string>
  accessibilityNotes: string[]
}

export type BrandStyleReference = {
  id: ID
  name: string
  description: string
  brandFamily: string
  inspirationOnly: true
  visualPrinciples: string[]
  tokenHints: {
    color?: string[]
    typography?: string[]
    layout?: string[]
    motion?: string[]
    voice?: string[]
  }
  forbiddenRules: string[]
}

export type DesignTemplatePackSource = 'official' | 'user' | 'workspace' | 'imported'

export type DesignTemplatePackFormat = 'dudesign-template-v1' | 'design-md'

export type DesignTemplatePackVisibility = 'private' | 'workspace' | 'public'

export type DesignTemplatePackStatus = 'draft' | 'published' | 'archived' | 'disabled'

export type DesignTemplatePackLintStatus = 'unknown' | 'passed' | 'warning' | 'failed'

export type DesignTokenTypography = {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string | number
  lineHeight?: string | number
  letterSpacing?: string
  fontFeature?: string
  fontVariation?: string
}

export type DesignTemplatePack = {
  schemaVersion: string
  id: ID
  source: DesignTemplatePackSource
  format: DesignTemplatePackFormat
  visibility: DesignTemplatePackVisibility
  status: DesignTemplatePackStatus
  name: string
  description: string | null
  version: string
  designTokens: {
    colors: Record<string, string>
    typography: Record<string, DesignTokenTypography>
    spacing: Record<string, string | number>
    rounded: Record<string, string>
    components: Record<string, Record<string, unknown>>
  }
  rationale: {
    overview: string | null
    colors: string | null
    typography: string | null
    layout: string | null
    elevation: string | null
    shapes: string | null
    components: string | null
    dos: string[]
    donts: string[]
    sections: Record<string, string>
  }
  previewArtifactId: ID | null
  lintStatus: DesignTemplatePackLintStatus
  createdByUserId: ID | null
}

export type DesignTemplatePackLintFinding = {
  severity: 'error' | 'warning' | 'info'
  code: string
  path: string
  message: string
}

export type DesignTemplatePackImportResult = {
  pack: DesignTemplatePack
  findings: DesignTemplatePackLintFinding[]
  summary: {
    errors: number
    warnings: number
    info: number
  }
}

export type PluginPermissionScope =
  | 'readonly_context'
  | 'asset_readonly'
  | 'validation_only'
  | 'artifact_write'
  | 'external_network'

export type PluginPermissionPolicy = {
  scopes: PluginPermissionScope[]
  maxPromptChars: number
  allowRuntimeToolUse: boolean
  requiresUserAuth: boolean
  auditLevel: 'none' | 'usage' | 'full'
}

export type CapabilityPlugin = {
  id: ID
  type: 'skill' | 'mcp_tool'
  visibility: 'official' | 'private' | 'workspace' | 'team'
  name: string
  description: string
  category: string
  safetyLevel: 'safe' | 'review_required' | 'disabled'
  status: 'active' | 'archived' | 'disabled'
  permissionPolicy: PluginPermissionPolicy
}

export type DesignSkill = {
  id: ID
  pluginId: ID
  schemaVersion: string
  rules: string[]
  promptBlocks: string[]
  negativeRules: string[]
  qualityChecklist: string[]
  allowedTemplateCategories: string[]
}

export type McpToolBinding = {
  id: ID
  pluginId: ID
  serverName: string
  toolName: string
  scopes: PluginPermissionScope[]
  requiresUserAuth: boolean
  allowedTemplateCategories: string[]
}

export type CapabilityPluginSnapshot = {
  plugins: CapabilityPlugin[]
  skills: DesignSkill[]
  mcpToolBindings: McpToolBinding[]
  toolPolicy: {
    allowedMcpToolIds: ID[]
    scopes: PluginPermissionScope[]
    requiresUserAuth: boolean
    auditLevel: 'none' | 'usage' | 'full'
  }
}

export type AdvancedTemplateConstraints = {
  colorPaletteId?: ID | null
  styleNotes?: string[]
  brandStyleReferenceId?: ID | null
  referenceBrand?: string | null
  negativeRequirements?: string[]
}

export type AutomationLoopProfile = {
  id: ID
  name: string
  description: string
  maxRepairAttempts: number
  maxCostCents: number | null
  maxDurationMs: number
  enablePixelGate: boolean
  qualityGate: 'static' | 'pixel'
  repairStrategy: 'none' | 'minimal_refine' | 'deep_refine'
}

export type CapabilityRequirements = {
  template?: {
    domainTemplateId?: ID | null
    aestheticProfileId?: ID | null
    colorPaletteId?: ID | null
    brandStyleReferenceId?: ID | null
    designTemplatePackIds?: ID[]
    autoDistributeTemplatePacks?: boolean
  }
  plugins?: {
    skillIds?: ID[]
    mcpToolIds?: ID[]
  }
  automation?: {
    loopProfileId?: ID | null
    maxRepairAttempts?: number | null
    maxCostCents?: number | null
    maxDurationMs?: number | null
  }
}

export type CapabilitySnapshot = {
  schemaVersion: string
  template: {
    domainTemplate: DomainTemplate
    aestheticProfile: AestheticProfile
    colorPalette: ColorPalette
    brandStyleReference: BrandStyleReference | null
  }
  plugins: {
    skillIds: ID[]
    mcpToolIds: ID[]
    pluginSnapshot?: CapabilityPluginSnapshot
  }
  automation: {
    loopProfile: AutomationLoopProfile
    maxRepairAttempts: number
    maxCostCents: number | null
    maxDurationMs: number
  }
}

export type ListCapabilitiesResponse = {
  schemaVersion: string
  domainTemplates: DomainTemplate[]
  aestheticProfiles: AestheticProfile[]
  colorPalettes: ColorPalette[]
  brandStyleReferences: BrandStyleReference[]
  plugins: CapabilityPlugin[]
  skills: DesignSkill[]
  mcpToolBindings: McpToolBinding[]
  automationLoopProfiles: AutomationLoopProfile[]
  defaults: {
    domainTemplateId: ID
    aestheticProfileId: ID
    colorPaletteId: ID
    brandStyleReferenceId: ID | null
    loopProfileId: ID
  }
}

export type UserCapabilityPreference = {
  domainTemplateId: ID | null
  aestheticProfileId: ID | null
  colorPaletteId: ID | null
  loopProfileId: ID | null
}

export type UserPreferencesResponse = {
  capabilityPreference: UserCapabilityPreference
}

export type UpdateUserPreferencesRequest = {
  capabilityPreference?: Partial<UserCapabilityPreference>
}

export type AdminModelService = UserModelOption & {
  enabled: boolean
  inputTokenCostCents: number
  outputTokenCostCents: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AdminUserModelAccess = {
  id: ID
  userId: ID
  modelServiceId: ID
  enabled: boolean
  dailyTokenLimit: number | null
  monthlyCostLimitCents: number | null
  usage: {
    inputTokens: number
    outputTokens: number
    costCents: number
    usageEventCount: number
  }
  createdAt: string
  updatedAt: string
}

export type AdminModelsResponse = {
  models: AdminModelService[]
}

export type RuntimeModelDiscoveryStatus = 'supported' | 'unsupported'

export type SyncAdminModelsResponse = AdminModelsResponse & {
  createdCount: number
  updatedCount: number
  missingCount: number
  disabledMissingCount: number
  diff: Array<{
    modelServiceId: ID
    modelId: string
    displayName: string
    runtimeProviderId: string | null
    changeType: 'created' | 'updated' | 'missing'
    previousContextWindow?: number | null
    nextContextWindow?: number | null
    previousInputTokenCostCents?: number
    nextInputTokenCostCents?: number
    previousOutputTokenCostCents?: number
    nextOutputTokenCostCents?: number
  }>
  runtime: {
    type: 'runtime_models'
    discoveryStatus?: RuntimeModelDiscoveryStatus
    message?: string | null
    version: number | string | null
    providerCount: number
    modelCount: number
    defaultModel: string | null
    activeProfile: string | null
    syncedAt: string
  }
  audit: unknown
}

export type UpdateAdminModelRequest = {
  enabled?: boolean
  isDefault?: boolean
}

export type AdminUserModelAccessResponse = {
  userId: ID
  access: AdminUserModelAccess[]
}

export type UpdateUserModelAccessRequest = {
  enabled?: boolean
  dailyTokenLimit?: number | null
  monthlyCostLimitCents?: number | null
}

export type RegisterUserRequest = {
  email: string
  password: string
  name?: string | null
}

export type LoginUserRequest = {
  email: string
  password: string
}

export type AuthWorkspace = {
  id: ID
  ownerId: ID
  teamId: ID | null
  name: string
  mode: 'hosted'
  visibility: 'private' | 'team' | 'public'
  storageKey: string
  status: 'active' | 'archived'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AuthUserResponse = {
  user: {
    id: ID
    email: string
    name: string | null
    avatarUrl: string | null
    status: 'active' | 'disabled'
    memoryNamespace: string
    metadata: Record<string, unknown>
    createdAt: string
    updatedAt: string
  }
  workspace: AuthWorkspace
  workspaces: AuthWorkspace[]
}

export type LogoutResponse = {
  ok: true
}

export type CreateSessionRequest = {
  workspaceId: ID
  mode?: SourceMode
  title?: string
  sourceArtifactId?: ID | null
}

export type CreateSessionResponse = {
  session: {
    id: ID
    workspaceId: ID
    runtimeSessionId: string | null
    status: 'active' | 'archived'
  }
}

export type ResumeSessionResponse = {
  session: unknown
  messages: unknown[]
  jobs: unknown[]
  variations: unknown[]
  artifacts: unknown[]
  runtime: {
    status: 'resumed' | 'rebuilt' | 'unavailable'
    runtimeSessionId?: string | null
    message?: string
  }
}

export type CreateDesignJobRequest = {
  sessionId: ID
  prompt: string
  sourceMode: SourceMode
  sourceArtifactId?: ID | null
  modelServiceId?: ID | null
  variationCount: number
  capabilityRequirements?: CapabilityRequirements
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
    advancedConstraints?: AdvancedTemplateConstraints
    capabilitySnapshot?: CapabilitySnapshot
    designTemplatePackIds?: ID[]
    designTemplatePacks?: DesignTemplatePack[]
    variationTemplateAssignments?: Array<{
      variationIndex: number
      designTemplatePackId: ID
      designTemplatePack: DesignTemplatePack
    }>
  }
}

export type CreateDesignJobResponse = {
  job: {
    id: ID
    status: 'queued'
    variationCount: number
  }
  variations: Array<{
    id: ID
    index: number
    status: 'queued'
  }>
}

export type CreateSourceArtifactRequest = {
  workspaceId: ID
  filename: string
  html: string
}

export type ListDesignTemplatePacksResponse = {
  templates: DesignTemplatePack[]
}

export type ImportDesignTemplatePackRequest = {
  designMd: string
  name?: string | null
}

export type SaveVariationTemplateRequest = {
  name?: string | null
  description?: string | null
  artifactId?: ID | null
}

export type SaveDesignTemplatePackResponse = {
  template: DesignTemplatePack
  findings: DesignTemplatePackLintFinding[]
  summary: {
    errors: number
    warnings: number
    info: number
  }
}

export type CreateSourceArtifactResponse = {
  artifact: {
    id: ID
    workspaceId: ID
    kind: 'html'
    version: number
    entryPath: string
    sizeBytes: number
    contentHash: string
    quality: ArtifactQualitySummary | null
  }
}

export type ArtifactQualitySummary = {
  status: 'pass' | 'warn' | 'fail'
  issues: string[]
}

export type DesignJobSnapshotResponse = {
  job: {
    id: ID
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    prompt: string
    variationCount: number
    capabilitySnapshot: CapabilitySnapshot | null
    designTemplatePacks: DesignTemplatePack[]
  }
  variations: Array<{
    id: ID
    index: number
    title: string | null
    status: 'queued' | 'running' | 'streaming' | 'rendering_preview' | 'completed' | 'failed' | 'cancelled'
    currentArtifactId: ID | null
    previewUrl: string | null
    screenshotUrl: string | null
    designTemplatePack: DesignTemplatePack | null
    inputTokens: number
    outputTokens: number
    costCents: number
    errorCode: string | null
    errorMessage: string | null
  }>
  artifacts: Array<{
    id: ID
    variationId: ID | null
    version: number
    kind: 'html' | 'asset' | 'screenshot' | 'export_zip'
    entryPath: string | null
    parentArtifactId: ID | null
    screenshotDevice: DeviceTarget | null
    url: string | null
    quality: ArtifactQualitySummary | null
  }>
}

export type RefineVariationRequest = {
  prompt: string
  baseArtifactId: ID
  annotationPromptSuffix?: string
  deviceContext?: DeviceTarget
}

export type RefineVariationResponse = {
  variation: {
    id: ID
    status: 'streaming' | 'rendering_preview' | 'completed' | 'failed'
    currentArtifactId: ID | null
    previewUrl: string | null
    screenshotUrl: string | null
  }
  artifact?: {
    id: ID
    version: number
    entryPath: string | null
  }
}

export type VariationDetailResponse = {
  variation: {
    id: ID
    jobId: ID
    sessionId: ID
    index: number
    title: string | null
    status: 'queued' | 'running' | 'streaming' | 'rendering_preview' | 'completed' | 'failed' | 'cancelled'
    currentArtifactId: ID | null
    previewUrl: string | null
    screenshotUrl: string | null
    designTemplatePack: DesignTemplatePack | null
    inputTokens: number
    outputTokens: number
    costCents: number
    errorCode: string | null
    errorMessage: string | null
  }
  job: {
    id: ID
    prompt: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    capabilitySnapshot: CapabilitySnapshot | null
    designTemplatePacks: DesignTemplatePack[]
  }
  currentArtifact: {
    id: ID
    kind: 'html' | 'asset' | 'screenshot' | 'export_zip'
    version: number
    entryPath: string | null
    parentArtifactId: ID | null
    screenshotDevice: DeviceTarget | null
    url: string | null
    createdAt: string
    quality: ArtifactQualitySummary | null
  } | null
  artifacts: Array<{
    id: ID
    kind: 'html' | 'asset' | 'screenshot' | 'export_zip'
    version: number
    entryPath: string | null
    parentArtifactId: ID | null
    isCurrent: boolean
    exportedFromArtifactId: ID | null
    screenshotDevice: DeviceTarget | null
    url: string | null
    createdAt: string
    quality: ArtifactQualitySummary | null
  }>
}

export type RestoreVariationVersionResponse = {
  variation: {
    id: ID
    currentArtifactId: ID
    previewUrl: string | null
  }
  artifact: {
    id: ID
    kind: 'html'
    version: number
    entryPath: string | null
    createdAt: string
  }
}

export type RepairVariationPreviewResponse = {
  variation: {
    id: ID
    currentArtifactId: ID
    previewUrl: string | null
    screenshotUrl: string | null
  }
  artifact: {
    id: ID
    kind: 'html'
    version: number
    entryPath: string | null
    createdAt: string
    quality: ArtifactQualitySummary | null
  }
  queueJob: {
    idempotencyKey: string
    kind: 'screenshot_job'
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  }
}

export type VariationFilesResponse = {
  artifact: {
    id: ID
    version: number
    entryPath: string | null
    createdAt: string
  }
  files: Array<{
    path: string
    language: 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text'
    content: string
    artifactId: ID
    kind: 'html' | 'asset'
  }>
}

export type AnnotationShape =
  | {
      type: 'rect'
      x: number
      y: number
      w: number
      h: number
      color?: string
      note?: string
    }
  | {
      type: 'circle'
      cx: number
      cy: number
      r: number
      color?: string
      note?: string
    }
  | {
      type: 'arrow'
      from: { x: number; y: number }
      to: { x: number; y: number }
      color?: string
      note?: string
    }
  | {
      type: 'pen'
      points: Array<{ x: number; y: number }>
      color?: string
      note?: string
    }
  | {
      type: 'text'
      anchor: { x: number; y: number }
      text: string
      color?: string
      note?: string
    }

export type CreateAnnotationBatchRequest = {
  artifactId: ID
  shapes: AnnotationShape[]
  prompt?: string
}

export type CreateAnnotationBatchResponse = RefineVariationResponse & {
  annotationBatch: {
    id: ID
    shapeCount: number
    promptSuffix: string
  }
}

export type ShareVariationRequest = {
  visibility: 'public' | 'private' | 'password'
  expiresAt?: string | null
}

export type ExportVariationResponse = {
  artifact: {
    id: ID
    version: number
    filename: string
    html: string
  }
  exportArtifact?: {
    id: ID
    kind: 'export_zip'
    filename: string
    sizeBytes: number
    contentHash: string
    downloadUrl: string
    files: string[]
    reused?: boolean
  }
}

export type ShareVariationResponse = {
  share: {
    id: ID
    token: string
    url: string
    visibility: 'public' | 'private' | 'password'
    expiresAt: string | null
  }
}

export type SharedVariationResponse = {
  share: {
    id: ID
    token: string
    visibility: 'public' | 'private' | 'password'
    revokedAt: string | null
    expiresAt: string | null
    createdAt: string
  }
  variation: {
    id: ID
    title: string | null
    previewUrl: string | null
  }
  artifact: {
    id: ID
    version: number
    entryPath: string | null
    html?: string
  }
}

export type RevokeShareResponse = {
  share: {
    id: ID
    token: string
    revokedAt: string
  }
}
