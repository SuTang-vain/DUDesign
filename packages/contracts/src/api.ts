export type ID = string

export type SourceMode = 'new_html' | 'from_existing_html'

export type DeviceTarget = 'desktop' | 'tablet' | 'mobile'

export type CreateSessionRequest = {
  workspaceId: ID
  mode: SourceMode
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
    version: number
    entryPath: string | null
    createdAt: string
  } | null
  artifacts: Array<{
    id: ID
    version: number
    entryPath: string | null
    createdAt: string
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
