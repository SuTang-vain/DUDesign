import type { AdvancedTemplateConstraints, CapabilitySnapshot, DesignEvent, DesignTemplatePack, DeviceTarget, ID, ImageGenerationUsageContext, InteractionParadigm, ProductMode, ResearchContextArtifactReference, SourceMode } from '@dudesign/contracts'
import type { RuntimeExplorationContextV1 } from './runtimeExplorationContext.js'

export type RuntimeContractStatus = 'compatible' | 'degraded' | 'unavailable' | 'contract_mismatch'
export type RuntimeProviderId = 'mock' | 'babel-o' | 'cli-agent' | (string & {})

export type RuntimeHealth = {
  status: RuntimeContractStatus
  runtime: RuntimeProviderId
  runtimeVersion: string | null
  contractVersion: string
  checkedAt: string
  message?: string
}

export type RuntimeContract = {
  runtime: RuntimeProviderId
  runtimeVersion: string | null
  contractVersion: string
  status: RuntimeContractStatus
  requiredEndpoints: string[]
  optionalEndpoints?: string[]
  requiredEvents: string[]
  eventMappings: Record<string, DesignEvent['type']>
}

export type RuntimeSessionRef = {
  runtimeSessionId: string
}

export type CreateRuntimeSessionInput = {
  requestId?: ID
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
  productMode?: ProductMode
  sourceArtifactId?: ID | null
  variationCount: number
  workspaceRoot: string
  memoryNamespace: string
  modelServiceId?: ID
  modelId?: string
  modelProvider?: string
  explorationContexts?: RuntimeExplorationContextV1[]
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
    advancedConstraints?: AdvancedTemplateConstraints
    capabilitySnapshot?: CapabilitySnapshot
    designTemplatePackIds?: ID[]
    designTemplatePacks?: DesignTemplatePack[]
    researchContextArtifactIds?: ID[]
    researchContexts?: ResearchContextArtifactReference[]
    imageGenerationArtifacts?: Array<{
      artifactId?: ID
      storageKey?: string
      contentHash?: string
      sizeBytes?: number
      schemaVersion?: string
      provider?: string
      model?: string
      usageContext?: ImageGenerationUsageContext | string
      contentSafetyStatus?: string
      costCents?: number
      createdAt?: string
    }>
    interactionParadigm?: InteractionParadigm
    variationTemplateAssignments?: Array<{
      variationIndex: number
      designTemplatePackId: ID
      designTemplatePack: DesignTemplatePack
      interactionParadigmId?: ID
      interactionParadigm?: InteractionParadigm
    }>
  }
}

export type RefineVariationInput = {
  requestId?: ID
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId?: ID
  productMode?: ProductMode
  variationId: ID
  variationIndex?: number
  runtimeChildSessionId: string | null
  runtimeLaneId?: string | null
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
  explorationContext?: RuntimeExplorationContextV1
  /**
   * Keep the assigned template snapshot attached to refinement. A refinement
   * must preserve the same template contract as the artifact it edits.
   */
  templateRequirements?: SpawnVariationAgentsInput['templateRequirements']
}

export type CancelRuntimeJobInput = {
  jobId: ID
  requestId?: ID
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

export type RuntimeRefineOperationInput = {
  requestId: ID
  sessionId: ID
  jobId: ID
  variationId: ID
}

export type RuntimeRefineOperationSnapshot = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'not_found' | 'unsupported'
  terminalEvent?: DesignEvent
  message?: string
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
  discoveryStatus?: 'supported' | 'unsupported'
  message?: string
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
  getRefineOperation?(input: RuntimeRefineOperationInput): Promise<RuntimeRefineOperationSnapshot>
  recoverRefineOperation?(input: RuntimeRefineOperationInput): AsyncIterable<DesignEvent>
}
