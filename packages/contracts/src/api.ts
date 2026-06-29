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
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
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
  }
  variations: Array<{
    id: ID
    index: number
    title: string | null
    status: 'queued' | 'running' | 'streaming' | 'rendering_preview' | 'completed' | 'failed' | 'cancelled'
    currentArtifactId: ID | null
    previewUrl: string | null
    screenshotUrl: string | null
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
