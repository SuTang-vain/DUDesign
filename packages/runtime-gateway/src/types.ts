import type { DesignEvent, DeviceTarget, ID, SourceMode } from '@dudesign/contracts'

export type RuntimeContractStatus = 'compatible' | 'degraded' | 'unavailable' | 'contract_mismatch'

export type RuntimeHealth = {
  status: RuntimeContractStatus
  runtime: 'babel-o'
  runtimeVersion: string | null
  contractVersion: string
  checkedAt: string
  message?: string
}

export type RuntimeContract = {
  runtime: 'babel-o'
  runtimeVersion: string | null
  contractVersion: string
  status: RuntimeContractStatus
  requiredEndpoints: string[]
  requiredEvents: string[]
  eventMappings: Record<string, DesignEvent['type']>
}

export type RuntimeSessionRef = {
  runtimeSessionId: string
}

export type CreateRuntimeSessionInput = {
  userId: ID
  workspaceId: ID
  sessionId: ID
  workspaceRoot: string
  memoryNamespace: string
}

export type ResumeRuntimeSessionInput = {
  userId: ID
  workspaceId: ID
  sessionId: ID
  runtimeSessionId: string | null
  workspaceRoot: string
  memoryNamespace: string
  fallbackSummary?: string
}

export type RuntimeResumeResult = {
  status: 'resumed' | 'rebuilt' | 'unavailable'
  runtimeSessionId: string | null
  message?: string
}

export type SpawnVariationAgentsInput = {
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId: ID
  prompt: string
  sourceMode: SourceMode
  sourceArtifactId?: ID | null
  variationCount: number
  workspaceRoot: string
  memoryNamespace: string
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
  }
}

export type RefineVariationInput = {
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId?: ID
  variationId: ID
  runtimeChildSessionId: string | null
  baseArtifactId: ID
  prompt: string
  annotationPromptSuffix?: string
  workspaceRoot: string
  deviceContext?: DeviceTarget
}

export type CancelRuntimeJobInput = {
  jobId: ID
  reason?: string
}

export type CancelRuntimeJobResult = {
  cancelled: boolean
  message?: string
}

export type RuntimeGateway = {
  getRuntimeHealth(): Promise<RuntimeHealth>
  getRuntimeContract(): Promise<RuntimeContract>
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef>
  resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult>
  spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent>
  refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent>
  cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult>
}
