import type { CapabilitySnapshot, DesignEvent, DeviceTarget, ID, SourceMode } from '@dudesign/contracts'

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
  modelServiceId?: ID
  modelId?: string
  modelProvider?: string
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
    capabilitySnapshot?: CapabilitySnapshot
  }
}

export type RefineVariationInput = {
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId?: ID
  variationId: ID
  variationIndex?: number
  runtimeChildSessionId: string | null
  baseArtifactId: ID
  baseArtifactHtml: string
  baseArtifactEntryPath?: string | null
  baseArtifactVersion?: number
  prompt: string
  annotationPromptSuffix?: string
  workspaceRoot: string
  deviceContext?: DeviceTarget
  modelServiceId?: ID
  modelId?: string
  modelProvider?: string
}

export type CancelRuntimeJobInput = {
  jobId: ID
  reason?: string
  variations?: Array<{
    variationId: ID
    runtimeChildSessionId: string | null
    runtimeAgentJobId: string | null
  }>
}

export type CancelRuntimeJobResult = {
  cancelled: boolean
  message?: string
  cancelledVariationCount?: number
  failedVariationCount?: number
}

export type RuntimeModelsCapability = {
  toolCalling: boolean
  jsonOutput: boolean
  streaming: boolean
}

export type RuntimeModelDefinition = {
  id: string
  name: string
  contextWindow: number
  defaultMaxTokens: number
  capabilities: RuntimeModelsCapability
}

export type RuntimeModelProvider = {
  id: string
  displayName: string
  adapter: string
  authMode: string
  defaultBaseUrl?: string
  defaultModel: string
  configured: boolean
  authConfigured: boolean
  authSource: 'none' | 'env' | 'profile' | 'provider_config'
  active: boolean
  models: RuntimeModelDefinition[]
}

export type RuntimeModels = {
  type: 'runtime_models'
  version: number | string | null
  providers: RuntimeModelProvider[]
  defaultModel: string | null
  activeProfile?: string | null
  syncedAt: string
}

export type RuntimeGateway = {
  getRuntimeHealth(): Promise<RuntimeHealth>
  getRuntimeContract(): Promise<RuntimeContract>
  listRuntimeModels(): Promise<RuntimeModels>
  createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef>
  resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult>
  spawnVariationAgents(input: SpawnVariationAgentsInput): AsyncIterable<DesignEvent>
  refineVariation(input: RefineVariationInput): AsyncIterable<DesignEvent>
  cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult>
}
