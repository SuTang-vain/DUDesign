import type { AdvancedTemplateConstraints, CapabilitySnapshot, DesignEvent, DesignTemplatePack, DeviceTarget, EncyclopediaClassificationVector, ID, ImageGenerationUsageContext, InteractionParadigm, ProductMode, ResearchContextArtifactReference, SourceMode } from '@dudesign/contracts'

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
  optionalEndpoints?: string[]
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
  productMode?: ProductMode
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
    businessContext?: {
      guidanceId?: ID
      entryTitle?: string
      entryPrimaryCategory?: string
      entrySecondaryCategory?: string
      entryTertiaryCategory?: string
      classification?: {
        l1?: string
        l2?: string
        l3?: string
        confidence?: number
        signals?: string[]
        source?: string
      }
      classificationVector?: EncyclopediaClassificationVector
      isLanguageCategory?: boolean
      entryContentLanguage?: string
      interactionParadigmId?: ID
      interactionParadigm?: InteractionParadigm
      recommendedTemplateIds?: ID[]
      childTemplates?: Array<{
        designTemplatePackId?: ID
        interactionParadigmId?: ID
        selected?: boolean
        confidence?: number
        reason?: string
      }>
      automationMode?: 'off' | 'semi_auto' | 'auto'
      reviewMode?: 'off' | 'semi_auto' | 'auto'
    }
    variationTemplateAssignments?: Array<{
      variationIndex: number
      designTemplatePackId: ID
      designTemplatePack: DesignTemplatePack
    }>
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
}
