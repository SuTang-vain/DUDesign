export const DESIGN_EVENT_SCHEMA_VERSION = '2026-06-26.dudesign-event.v1' as const

export type DesignEventSchemaVersion = typeof DESIGN_EVENT_SCHEMA_VERSION

export type DesignEventEnvelope<TType extends string, TPayload extends Record<string, unknown>> = {
  schemaVersion: DesignEventSchemaVersion
  type: TType
  timestamp: string
  requestId?: string
  sessionId?: string
  jobId?: string
  variationId?: string
  payload: TPayload
}

export type DesignSessionStartedEvent = DesignEventEnvelope<
  'design.session_started',
  {
    runtimeSessionRef?: string
    memoryRefs?: Array<{
      id: string
      summary: string
      relevance?: number
    }>
  }
>

export type DesignJobStartedEvent = DesignEventEnvelope<
  'design.job_started',
  {
    variationCount: number
  }
>

export type DesignVariationQueuedEvent = DesignEventEnvelope<
  'design.variation_queued',
  {
    index: number
    runtimeChildSessionId?: string
    runtimeAgentJobId?: string
  }
>

export type DesignVariationStreamingEvent = DesignEventEnvelope<
  'design.variation_streaming',
  {
    delta: string
    channel: 'assistant' | 'thinking' | 'tool' | 'system'
  }
>

export type DesignVariationCodeDeltaEvent = DesignEventEnvelope<
  'design.variation_code_delta',
  {
    path: string
    language: 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text'
    delta: string
    sequence: number
    isFinal?: boolean
  }
>

export type RuntimeArtifactFile = {
  path: string
  content: string
  contentType?: string
}

export type DesignVariationArtifactUpdatedEvent = DesignEventEnvelope<
  'design.variation_artifact_updated',
  {
    artifactId?: string
    entryPath?: string
    changedPaths: string[]
    html?: string
    files?: RuntimeArtifactFile[]
  }
>

export type DesignVariationPreviewReadyEvent = DesignEventEnvelope<
  'design.variation_preview_ready',
  {
    artifactId: string
    previewUrl: string
    screenshotUrl?: string
  }
>

export type DesignVariationCompletedEvent = DesignEventEnvelope<
  'design.variation_completed',
  {
    artifactId?: string
    entryPath?: string
    changedPaths?: string[]
    html?: string
    files?: RuntimeArtifactFile[]
    inputTokens?: number
    outputTokens?: number
    costCents?: number
    durationMs?: number
  }
>

export type DesignVariationFailedEvent = DesignEventEnvelope<
  'design.variation_failed',
  {
    errorCode: string
    message: string
    recoverable: boolean
  }
>

export type DesignPermissionRequiredEvent = DesignEventEnvelope<
  'design.permission_required',
  {
    permissionRequestId: string
    risk: 'read' | 'write' | 'execute' | 'task'
    message: string
    toolName?: string
  }
>

export type DesignRuntimeWarningEvent = DesignEventEnvelope<
  'design.runtime_warning',
  {
    severity: 'info' | 'warn' | 'error'
    code: string
    message: string
  }
>

export type DesignJobCompletedEvent = DesignEventEnvelope<
  'design.job_completed',
  {
    completedVariationCount: number
    failedVariationCount: number
  }
>

export type DesignEvent =
  | DesignSessionStartedEvent
  | DesignJobStartedEvent
  | DesignVariationQueuedEvent
  | DesignVariationStreamingEvent
  | DesignVariationCodeDeltaEvent
  | DesignVariationArtifactUpdatedEvent
  | DesignVariationPreviewReadyEvent
  | DesignVariationCompletedEvent
  | DesignVariationFailedEvent
  | DesignPermissionRequiredEvent
  | DesignRuntimeWarningEvent
  | DesignJobCompletedEvent

export function createDesignEvent<TType extends DesignEvent['type']>(
  event: Omit<Extract<DesignEvent, { type: TType }>, 'schemaVersion' | 'timestamp'> & {
    timestamp?: string
  },
): Extract<DesignEvent, { type: TType }> {
  return {
    schemaVersion: DESIGN_EVENT_SCHEMA_VERSION,
    timestamp: event.timestamp ?? new Date().toISOString(),
    ...event,
  } as Extract<DesignEvent, { type: TType }>
}
