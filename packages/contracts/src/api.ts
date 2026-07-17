import type {
  BatchExplorationPlanV1,
  ExplorationRequestV1,
  RequirementModuleGraphV1,
  VariationExplorationPlanV1,
} from './exploration.js'
import type {
  EncyclopediaDemocaseExperienceProfile,
  EncyclopediaGuidanceAnalysisV2,
} from './guidance.js'

export type ID = string

export type SourceMode = 'new_html' | 'from_existing_html'

export type ProductMode = 'web_app' | 'dynamic_encyclopedia_card'

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

export type InteractionParadigm = {
  id: ID
  name: string
  category: string
  description: string
  bestFor: string[]
  avoidFor: string[]
  requiredDataShape: string[]
  compatibleTemplatePackIds: ID[]
}

export type ResearchContextPlatform =
  | 'web'
  | 'github'
  | 'social'
  | 'video'
  | 'community'
  | 'unknown'

export type ResearchContextSource = {
  url: string
  title?: string | null
  platform?: ResearchContextPlatform
  retrievedAt: string
  licenseHint?: string | null
}

export type ResearchContextCitation = {
  sourceUrl: string
  quote?: string
  note: string
}

export type ResearchContextArtifact = {
  schemaVersion: string
  query: string
  sources: ResearchContextSource[]
  summary: string
  citations: ResearchContextCitation[]
  confidence: 'low' | 'medium' | 'high'
  freshness: 'unknown' | 'stale' | 'recent'
  riskFlags: string[]
  rawPayloadHash: string
  reviewStatus: 'auto_reviewed' | 'human_review_required' | 'rejected'
}

export type ResearchContextArtifactReference = {
  artifactId: ID
  storageKey: string
  contentHash: string
  sizeBytes: number
  schemaVersion: string
  reviewStatus: ResearchContextArtifact['reviewStatus']
  query: string
  sourceCount: number
  provenance?: 'reviewed_external' | 'mock'
  createdAt?: string
}

export type ImageGenerationUsageContext =
  | 'template_hero'
  | 'template_illustration'
  | 'background_texture'
  | 'reference_mood'
  | 'dynamic_encyclopedia_card'

export type ImageGenerationRequest = {
  schemaVersion: '2026-07-06.dudesign-image-generation-request.v1'
  prompt: string
  model: string
  size: '1K' | '2K' | '4K' | string
  watermark: boolean
  usageContext: ImageGenerationUsageContext
  variationId?: ID | null
  templatePackId?: ID | null
  contentSafety?: {
    policy: 'standard' | 'strict'
    allowBrandReference: boolean
  }
}

export type ImageGenerationArtifact = {
  schemaVersion: '2026-07-06.dudesign-image-generation-artifact.v1'
  provider: 'mock' | 'ark_seedream' | string
  model: string
  promptHash: string
  imageUrl: string
  size: string
  watermark: boolean
  usageContext: ImageGenerationUsageContext
  contentType: string
  contentSafety: {
    status: 'passed' | 'blocked' | 'review_required'
    policy: 'standard' | 'strict'
    reason?: string | null
  }
  costCents: number
  artifactId?: ID | null
  createdAt: string
}

export type DataIntakeInputSource =
  | 'prompt'
  | 'url'
  | 'pasted_text'
  | 'table'
  | 'json'
  | 'uploaded_asset'
  | 'democase'
  | 'research_artifact'
  | 'existing_html'
  | 'memory'

export type DataIntakeField = {
  name: string
  value?: string | null
  missing?: boolean
  confidence?: number
  source?: DataIntakeInputSource
}

export type DataIntakeEntity = {
  name: string
  type: string
  confidence: number
  source?: DataIntakeInputSource
}

export type DataIntakeRecommendation = {
  id: ID
  reason: string
  confidence: number
}

export type DataIntakeAnalysis = {
  schemaVersion: string
  inputSources: DataIntakeInputSource[]
  topicSummary: string
  entities: DataIntakeEntity[]
  fields: DataIntakeField[]
  missingFields: string[]
  recommendedScenarioTemplates: DataIntakeRecommendation[]
  recommendedDesignTemplatePacks: DataIntakeRecommendation[]
  recommendedSkills: DataIntakeRecommendation[]
  riskFlags: string[]
  reviewStatus: 'auto_reviewed' | 'human_review_required' | 'rejected'
}

export type AnalyzeDataIntakeRequest = {
  workspaceId: ID
  prompt?: string | null
  url?: string | null
  pastedText?: string | null
  tableText?: string | null
  jsonText?: string | null
  uploadedAssetIds?: ID[]
  democaseIds?: ID[]
  researchArtifactIds?: ID[]
  existingHtmlArtifactId?: ID | null
  memoryNoteIds?: ID[]
}

export type AnalyzeDataIntakeResponse = {
  analysis: DataIntakeAnalysis
  artifact: {
    id: ID
    workspaceId: ID
    kind: 'data_intake_analysis'
    storageKey: string
    contentHash: string
    sizeBytes: number
    createdAt: string
  }
}

export type DataIntakeArtifactReference = {
  artifactId: ID
  storageKey: string
  contentHash: string
  sizeBytes: number
  schemaVersion: string
  reviewStatus: DataIntakeAnalysis['reviewStatus']
  createdAt?: string
}

export type DesignTemplatePackSource = 'official' | 'user' | 'workspace' | 'imported'

/**
 * HTML 示例引用，支持内联字符串或外部文件。
 * 外部文件引用适合大型 React 构建产物，避免在 TS 源码中嵌入巨量模板字符串。
 */
export type HtmlExample = string | HtmlExampleFileRef

export type HtmlExampleFileRef = {
  file: string
}

export type DesignTemplatePackFormat = 'dudesign-template-v1' | 'design-md'

export type DesignTemplatePackVisibility = 'private' | 'workspace' | 'public'

export type DesignTemplatePackStatus = 'draft' | 'published' | 'archived' | 'disabled'

export type DesignTemplatePackLintStatus = 'unknown' | 'passed' | 'warning' | 'failed'

export type DesignTemplatePackRole = 'standalone' | 'parent_pack' | 'child_template'

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
  parentPackId?: ID | null
  templateRole?: DesignTemplatePackRole
  supportedProductModes?: ProductMode[]
  supportedEntryCategories?: string[]
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
  /**
   * 成熟 HTML 示例（few-shot），供 LLM 借鉴风格/结构。
   * 必须满足 v0.4 硬性归束：no-scroll-frame + 至少一个溢出策略组件 + 中文优先 + 禁英文 UI 短语。
   * LLM **不应复制**示例的具体文案/词条名/事实，只借鉴布局/排版/视觉密度。
   *
   * 支持两种形式：
   * - 内联字符串：直接嵌入 HTML（适合小型、无 $ 符号的示例）
   * - 外部文件引用：{ file: 'path/to/example.html' }，由构建/运行时从文件系统读取
   *   （适合大型 React 构建产物，避免在 TS 源码中嵌入巨量模板字符串）
   */
  htmlExamples?: HtmlExample[]
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
  type: 'skill' | 'mcp_tool' | 'mixed'
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

export type CapabilityAuthoringSource =
  | {
      type: 'design_md'
      artifactId?: ID
      contentHash: string
    }
  | {
      type: 'product_spec_markdown'
      artifactId?: ID
      contentHash: string
    }
  | {
      type: 'template_pack_json'
      contentHash: string
    }
  | {
      type: 'capability_bundle_zip'
      contentHash: string
      sourceBundleId: ID
    }
  | {
      type: 'variation_artifact'
      variationId: ID
      artifactId: ID
      artifactVersion: number
      contentHash: string
    }
  | {
      type: 'manual'
      createdByUserId: ID
      contentHash: string
    }

export type CapabilityExtractionEvidence = {
  sourcePath: string
  sourceExcerpt: string
  targetPath: string
  extractionMethod: 'deterministic' | 'agent_assisted' | 'user_confirmed'
  confidence: number
}

export type ResponsiveRule = {
  id: ID
  target: DeviceTarget | 'embedded_iframe' | 'custom'
  minWidth?: number | null
  maxWidth?: number | null
  viewport?: { width: number; height: number } | null
  rules: string[]
}

export type SectionBlueprint = {
  id: ID
  name: string
  role: string
  order: number
  required: boolean
  layout: string | null
  evidencePaths: string[]
}

export type ComponentBlueprint = {
  id: ID
  name: string
  role: string
  repeatable: boolean
  states: string[]
  interactionParadigmIds: ID[]
  evidencePaths: string[]
}

export type HtmlExampleReference = {
  artifactId: ID | null
  artifactVersion: number | null
  authoringAssetId?: ID | null
  contentHash: string
  entryPath: string
  sanitizationStatus: 'pending' | 'passed' | 'failed'
  sanitizedArtifactId?: ID | null
  sanitization?: {
    sanitizedContentHash: string | null
    findings: Array<{
      severity: 'error' | 'warning' | 'info'
      code: string
      path: string
      message: string
    }>
    sanitizedAt: string
  } | null
  previewSmoke?: {
    status: 'pending' | 'passed' | 'warning' | 'failed'
    staticStatus: 'pass' | 'warn' | 'fail'
    pixelStatus: 'not_run' | 'pass' | 'warn' | 'fail'
    issues: string[]
    checkedAt: string
  } | null
  notes: string[]
}

export type DesignTemplateDraftV2 = {
  schemaVersion: 'dudesign-template-draft.v2'
  name: string
  description: string | null
  designTokens: DesignTemplatePack['designTokens']
  rationale: DesignTemplatePack['rationale']
  responsiveRules: ResponsiveRule[]
  sectionBlueprints: SectionBlueprint[]
  componentBlueprints: ComponentBlueprint[]
  interactionParadigmIds: ID[]
  htmlExamples: HtmlExampleReference[]
  sourceEvidence: CapabilityExtractionEvidence[]
  confidence: Record<string, number>
}

export type DesignSkillDraft = {
  schemaVersion: 'dudesign-skill-draft.v1'
  name: string
  description: string
  category: string
  rules: string[]
  promptBlocks: string[]
  negativeRules: string[]
  qualityChecklist: string[]
  allowedTemplateCategories: string[]
  requestedScopes: PluginPermissionScope[]
  safetyLevel: 'safe' | 'review_required'
}

export type InteractionParadigmDraft = {
  schemaVersion: 'dudesign-interaction-draft.v1'
  name: string
  category: string
  description: string
  bestFor: string[]
  avoidFor: string[]
  requiredDataShape: string[]
  sourceEvidence: CapabilityExtractionEvidence[]
}

export type DataContractDraft = {
  schemaVersion: 'dudesign-data-contract-draft.v1'
  name: string
  description: string
  jsonSchema: Record<string, unknown>
  requiredFields: string[]
  sourceEvidence: CapabilityExtractionEvidence[]
}

export type ReviewProfileDraft = {
  schemaVersion: 'dudesign-review-profile-draft.v1'
  name: string
  description: string
  rules: Array<{
    id: ID
    severity: 'error' | 'warning' | 'info'
    description: string
    evidenceRequired: boolean
  }>
  sourceEvidence: CapabilityExtractionEvidence[]
}

export type CapabilityProfileDraft = {
  templateDraftIndexes: number[]
  skillDraftIndexes: number[]
  interactionDraftIndexes: number[]
  dataContractDraftIndexes: number[]
  reviewProfileDraftIndexes: number[]
}

export type CapabilityBundleDraft = {
  templatePacks: DesignTemplateDraftV2[]
  skills: DesignSkillDraft[]
  interactionParadigms: InteractionParadigmDraft[]
  dataContracts: DataContractDraft[]
  reviewProfiles: ReviewProfileDraft[]
  recommendedCapabilityProfile: CapabilityProfileDraft
}

export type CapabilityAuthoringFinding = {
  severity: 'error' | 'warning' | 'info'
  code: string
  path: string
  message: string
  evidence?: CapabilityExtractionEvidence[]
}

export type CapabilityAuthoringDraftStatus =
  | 'analyzing'
  | 'needs_confirmation'
  | 'lint_failed'
  | 'preview_pending'
  | 'ready'
  | 'published_private'
  | 'submitted_for_review'
  | 'rejected'
  | 'archived'

export type CapabilityAuthoringDraft = {
  id: ID
  ownerUserId: ID
  workspaceId: ID
  source: CapabilityAuthoringSource
  status: CapabilityAuthoringDraftStatus
  candidateBundle: CapabilityBundleDraft
  findings: CapabilityAuthoringFinding[]
  confirmedPaths: string[]
  publishedTemplateId?: ID | null
  createdAt: string
  updatedAt: string
}

export type CapabilityAuthoringAsset = {
  id: ID
  draftId: ID
  ownerUserId: ID
  workspaceId: ID
  kind: 'html_example'
  storageKey: string
  entryPath: string
  contentType: 'text/html'
  contentHash: string
  sizeBytes: number
  metadata: Record<string, unknown>
  createdAt: string
}

export type CreateCapabilityAuthoringDraftRequest = {
  workspaceId: ID
  source:
    | {
        type: 'design_md' | 'product_spec_markdown'
        artifactId?: ID
        contentHash?: string
      }
    | {
        type: 'variation_artifact'
        variationId: ID
        artifactId: ID
      }
    | {
        type: 'manual'
        contentHash?: string
      }
  candidateBundle?: CapabilityBundleDraft
}

export type UpdateCapabilityAuthoringDraftRequest = {
  workspaceId: ID
  candidateBundle?: CapabilityBundleDraft
  confirmedPaths?: string[]
}

export type CapabilityAuthoringDraftResponse = {
  draft: CapabilityAuthoringDraft
}

export type ListCapabilityAuthoringDraftsResponse = {
  drafts: CapabilityAuthoringDraft[]
}

export type PublishCapabilityAuthoringDraftRequest = {
  workspaceId: ID
  name?: string
  description?: string | null
}

export type PublishCapabilityAuthoringDraftResponse = {
  draft: CapabilityAuthoringDraft
  template: DesignTemplatePack
  audit: unknown
}

export type RollbackPrivateDesignTemplateRequest = {
  workspaceId: ID
  sourceVersion: string
  reason?: string | null
}

export type RollbackPrivateDesignTemplateResponse = {
  template: DesignTemplatePack
  rolledBackFromVersion: string
  restoredSourceVersion: string
  audit: unknown
}

export type PortableDesignTemplatePack = Pick<
  DesignTemplatePack,
  | 'schemaVersion'
  | 'parentPackId'
  | 'templateRole'
  | 'supportedProductModes'
  | 'supportedEntryCategories'
  | 'format'
  | 'name'
  | 'description'
  | 'version'
  | 'designTokens'
  | 'rationale'
  | 'lintStatus'
>

export type DesignTemplatePackExportDocument = {
  schemaVersion: '2026-07-13.dudesign-template-pack-export.v1'
  manifest: {
    format: 'dudesign-template-pack-json'
    contentHash: string
    exportedAt: string
    sourceTemplateId: ID
    sourceTemplateVersion: string
    examplesIncluded: false
    omittedFields: string[]
  }
  template: PortableDesignTemplatePack
}

export type ImportDesignTemplatePackJsonDraftRequest = {
  workspaceId: ID
  document: DesignTemplatePackExportDocument
}

export type ImportDesignMdDraftRequest = {
  workspaceId: ID
  designMd: string
}

export type CapabilityBundleFileKind =
  | 'portable_draft'
  | 'provenance'
  | 'html_example'

export type CapabilityBundleManifestFile = {
  path: string
  kind: CapabilityBundleFileKind
  mediaType: string
  sizeBytes: number
  contentHash: string
}

export type CapabilityBundlePortableTemplateDraft = Omit<DesignTemplateDraftV2, 'htmlExamples'> & {
  htmlExamplePaths: string[]
}

export type CapabilityBundlePortableDraft = Omit<CapabilityBundleDraft, 'templatePacks'> & {
  templatePacks: CapabilityBundlePortableTemplateDraft[]
}

export type CapabilityBundleProvenance = {
  schemaVersion: '2026-07-13.dudesign-capability-bundle-provenance.v1'
  source: {
    type: CapabilityAuthoringSource['type']
    contentHash: string
  }
  exportedFrom: {
    draftId: ID
    draftStatus: CapabilityAuthoringDraftStatus
    publishedTemplateId: ID | null
  }
  license: {
    declaration: 'user_owned_or_authorized' | 'unspecified'
    notes: string | null
  }
  privacy: {
    ownerIdentityIncluded: false
    workspaceIdentityIncluded: false
    sourceFilesystemPathsIncluded: false
  }
  exportedAt: string
}

export type CapabilityBundleManifest = {
  schemaVersion: '2026-07-13.dudesign-capability-bundle.v1'
  bundleId: ID
  name: string
  format: 'dudesign-capability-bundle-zip'
  portableDraftPath: 'capability/draft.json'
  provenancePath: 'provenance.json'
  files: CapabilityBundleManifestFile[]
  counts: {
    templatePacks: number
    skills: number
    interactionParadigms: number
    dataContracts: number
    reviewProfiles: number
    htmlExamples: number
  }
  createdAt: string
}

export type ExportCapabilityBundleRequest = {
  workspaceId: ID
  licenseDeclaration?: 'user_owned_or_authorized' | 'unspecified'
  licenseNotes?: string | null
}

export type ImportCapabilityBundleDraftRequest = {
  workspaceId: ID
  bundleBase64: string
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

export type McpInvocationMode = 'policy_only' | 'authorized_invocation' | 'replay'

export type McpInvocationRequest = {
  invocationId: ID
  mode: Extract<McpInvocationMode, 'authorized_invocation' | 'replay'>
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId: ID
  variationId?: ID
  runtimeSessionId?: string | null
  mcpToolId: ID
  serverName: string
  toolName: string
  scopes: PluginPermissionScope[]
  input: Record<string, unknown>
  reason: string
  requestedAt: string
}

export type McpInvocationResult = {
  invocationId: ID
  status: 'ok' | 'denied' | 'unavailable' | 'error'
  mcpToolId: ID
  source: {
    serverName: string
    toolName: string
    scopes: PluginPermissionScope[]
  }
  summary: string
  references: Array<{ id: ID; title?: string; url?: string }>
  data?: Record<string, unknown>
  error?: {
    code: string
    message: string
    retryable: boolean
  }
  completedAt: string
}

export type McpInvocationAuditRecord = {
  invocationId: ID
  request: McpInvocationRequest
  result: McpInvocationResult
  policySnapshotHash: string
  runtimeContractVersion: string
  replayKey: string
  createdAt: string
  completedAt: string
}

export type McpToolPromptContext = {
  invocationId: ID
  mcpToolId: ID
  status: McpInvocationResult['status']
  source: McpInvocationResult['source']
  summary: string
  references: McpInvocationResult['references']
  contextText: string
}

export type AuthorizeMcpInvocationRequest = Omit<McpInvocationRequest, 'invocationId' | 'mode' | 'requestedAt'> & {
  invocationId?: ID
  mode?: Extract<McpInvocationMode, 'authorized_invocation' | 'replay'>
  requestedAt?: string
}

export type AuthorizeMcpInvocationResponse = {
  invocationId: ID
  status: 'authorized' | 'denied'
  code?: string
  message?: string
  request: McpInvocationRequest
  invocationAuditRecord: McpInvocationAuditRecord
  audit: unknown
}

export type ExecuteMcpInvocationRequest = AuthorizeMcpInvocationRequest

export type ExecuteMcpInvocationResponse = AuthorizeMcpInvocationResponse & {
  result: McpInvocationResult
  toolContext: McpToolPromptContext | null
}

export type ReplayMcpInvocationResponse = {
  invocationId: ID
  replayKey: string
  request: McpInvocationRequest
  result: McpInvocationResult
  invocationAuditRecord: McpInvocationAuditRecord
  toolContext: McpToolPromptContext | null
  audit: unknown
}

export type AdminMcpInvocationAuditEntry = {
  invocationId: ID
  replayKey: string
  userId: ID
  workspaceId: ID
  sessionId: ID
  jobId: ID
  variationId: ID | null
  mcpToolId: ID
  serverName: string
  toolName: string
  mode: McpInvocationRequest['mode']
  status: McpInvocationResult['status']
  summary: string
  errorCode: string | null
  errorMessage: string | null
  policySnapshotHash: string
  runtimeContractVersion: string
  referenceCount: number
  requestedAt: string
  completedAt: string
}

export type AdminMcpInvocationAuditResponse = {
  invocations: AdminMcpInvocationAuditEntry[]
  filters: {
    jobId: ID | null
    variationId: ID | null
    mcpToolId: ID | null
    status: McpInvocationResult['status'] | null
    limit: number
  }
}

export type AdminMcpToolHealthSummary = {
  mcpToolId: ID
  serverName: string
  toolName: string
  totalCount: number
  okCount: number
  deniedCount: number
  unavailableCount: number
  errorCount: number
  successRate: number
  unavailableRate: number
  lastStatus: McpInvocationResult['status'] | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  lastInvokedAt: string | null
  lastReplayKey: string | null
}

export type AdminMcpInvocationSummaryResponse = {
  totals: {
    totalCount: number
    okCount: number
    deniedCount: number
    unavailableCount: number
    errorCount: number
    successRate: number
    unavailableRate: number
  }
  tools: AdminMcpToolHealthSummary[]
  democase: {
    mcpToolId: ID
    totalCount: number
    okCount: number
    unavailableCount: number
    errorCount: number
    healthStatus: 'healthy' | 'degraded' | 'unavailable' | 'no_data'
    lastInvokedAt: string | null
    lastErrorCode: string | null
    lastErrorMessage: string | null
  }
  filters: {
    mcpToolId: ID | null
    createdFrom: string | null
    createdTo: string | null
    limit: number
  }
}

export type AdvancedTemplateConstraints = {
  colorPaletteId?: ID | null
  styleNotes?: string[]
  brandStyleReferenceId?: ID | null
  referenceBrand?: string | null
  negativeRequirements?: string[]
}

export type AutomationQualityGate = 'static' | 'pixel' | 'spec'

export type AutomationLoopProfile = {
  id: ID
  name: string
  description: string
  maxRepairAttempts: number
  maxCostCents: number | null
  maxDurationMs: number
  qualityGates: AutomationQualityGate[]
  repairStrategy: 'none' | 'minimal_refine' | 'deep_refine' | 'spec_review_refine'
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

export type EncyclopediaEntryGuidanceRequest = {
  workspaceId?: ID | null
  entry: string
  context?: string | null
  maxTemplateRecommendations?: number
  automationMode?: 'off' | 'semi_auto' | 'auto'
}

export type ConfirmEncyclopediaEntryGuidanceRequest = {
  selectedTemplateIds?: ID[]
  classificationOverride?: {
    primaryCategory: string
    secondaryCategory: string
    tertiaryCategory?: string | null
  }
  automationMode?: 'off' | 'semi_auto' | 'auto'
}

/**
 * 词条正文预期语种。用于百科规范审查的"中文优先"豁免判断。
 * 与 domain 层 EncyclopediaEntryGuidance.entryContentLanguage 保持一致。
 */
export type EntryContentLanguage = 'zh' | 'en' | 'fr' | 'ja' | 'ko' | 'other' | 'mixed'

export type EncyclopediaClassificationSource = 'mock_rules' | 'ai_guidance_v2'

export type EncyclopediaClassificationVector = {
  schemaVersion: '2026-07-08.dudesign-encyclopedia-classification-vector.v1'
  l1: string
  l2: string
  l3: string
  confidence: number
  signals: string[]
  source: EncyclopediaClassificationSource
  recommendedModulePriorities: string[]
  preferredTemplateIds: ID[]
  riskFlags: string[]
}

export type EncyclopediaEntryGuidanceResponse = {
  guidanceId: ID
  productMode: Extract<ProductMode, 'dynamic_encyclopedia_card'>
  status: 'draft' | 'needs_confirmation' | 'confirmed'
  requiresConfirmation: boolean
  confirmedAt: string | null
  entry: {
    title: string
    rawInput: string
    context: string | null
  }
  /**
   * 是否为语言类词条（外语/语言学/翻译/方言/语言研究）。
   * true 时百科规范审查豁免"中文优先"硬约束，允许外语正文。
   */
  isLanguageCategory: boolean
  /**
   * 词条正文预期语种。基于 `entryLanguage` 启发式 + democase 信号推断。
   * 仅用于 spec review 与未来 i18n 适配，不影响生成。
   */
  entryContentLanguage: EntryContentLanguage
  analysis: EncyclopediaGuidanceAnalysisV2 | null
  classification: {
    primaryCategory: string
    secondaryCategory: string
    tertiaryCategory: string
    confidence: number
    signals: string[]
    source: EncyclopediaClassificationSource
  }
  democaseReferences: Array<{
    caseId: ID
    title: string
    score: number
    matchedKeywords: string[]
    summary: string
    experienceProfile?: EncyclopediaDemocaseExperienceProfile
  }>
  recommendedTemplates: Array<{
    designTemplatePackId: ID
    name: string
    interactionParadigmId: ID
    reason: string
    confidence: number
    selected: boolean
  }>
  interactionParadigm: InteractionParadigm
  explorationRecommendation: {
    level: number
    reason: string
    confidence: number
    requirementModuleGraphId: ID
  }
  capabilityRequirements: CapabilityRequirements
  templateRequirements: NonNullable<CreateDesignJobRequest['templateRequirements']> & {
    interactionParadigm: InteractionParadigm
    businessContext: {
      guidanceId: ID
      entryTitle: string
      entryPrimaryCategory: string
      entrySecondaryCategory: string
      entryTertiaryCategory: string
      isLanguageCategory: boolean
      entryContentLanguage: EntryContentLanguage
      classification: {
        l1: string
        l2: string
        l3: string
        confidence: number
        signals: string[]
        source: EncyclopediaClassificationSource
      }
      classificationVector: EncyclopediaClassificationVector
      interactionParadigmId: ID
      interactionParadigm: InteractionParadigm
      recommendedTemplateIds: ID[]
      childTemplates: Array<{
        designTemplatePackId: ID
        interactionParadigmId: ID
        selected: boolean
        confidence: number
        reason: string
      }>
      democaseExperienceProfiles: Array<{
        caseId: ID
        title: string
        score: number
        experienceProfile: EncyclopediaDemocaseExperienceProfile
      }>
      automationMode: 'off' | 'semi_auto' | 'auto'
      reviewMode: 'off' | 'semi_auto' | 'auto'
    }
  }
}

export type CapabilitySnapshot = {
  schemaVersion: string
  profileVersion?: string
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

export type UserCapabilityPluginSnapshot = Omit<CapabilityPluginSnapshot, 'mcpToolBindings'> & {
  mcpToolBindings: Array<Omit<McpToolBinding, 'serverName' | 'toolName'>>
}

export type UserCapabilitySnapshot = Omit<CapabilitySnapshot, 'plugins'> & {
  plugins: Omit<CapabilitySnapshot['plugins'], 'pluginSnapshot'> & {
    pluginSnapshot?: UserCapabilityPluginSnapshot
  }
}

export type CapabilityPreset = {
  id: ID
  productMode: ProductMode
  name: string
  description: string
  domainTemplateId: ID
  designTemplatePackIds: ID[]
  skillIds: ID[]
  mcpToolIds: ID[]
  loopProfileId: ID
  requirementModuleGraphId?: ID
  selectionPolicy: {
    requiredTemplatePackIds: ID[]
    requiredSkillIds: ID[]
    requiredMcpToolIds: ID[]
    allowedLoopProfileIds: ID[]
  }
  explorationDefaults: {
    level: number
    experimentalConfirmationThreshold: number
    forceReviewAtOrAbove: number
  }
}

export type CapabilitySelectionSource =
  | 'official_preset'
  | 'entry_guidance'
  | 'user_override'
  | 'job_snapshot'

export type CapabilitySelectionSnapshotV1 = {
  schemaVersion: '2026-07-14.dudesign-capability-selection.v1'
  presetId: ID
  guidanceId: ID | null
  confirmedAt: string
  selectedTemplatePackIds: ID[]
  selectedSkillIds: ID[]
  selectedMcpToolIds: ID[]
  loopProfileId: ID
  reviewMode: 'off' | 'semi_auto' | 'auto'
  explorationRequest: ExplorationRequestV1
  sourceByCapabilityId: Record<ID, CapabilitySelectionSource>
}

export type ListCapabilitiesResponse = {
  schemaVersion: string
  domainTemplates: DomainTemplate[]
  aestheticProfiles: AestheticProfile[]
  colorPalettes: ColorPalette[]
  brandStyleReferences: BrandStyleReference[]
  interactionParadigms: InteractionParadigm[]
  plugins: CapabilityPlugin[]
  skills: DesignSkill[]
  mcpToolBindings: McpToolBinding[]
  automationLoopProfiles: AutomationLoopProfile[]
  capabilityPresets: CapabilityPreset[]
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
  designTemplatePackId?: ID | null
  skillId?: ID | null
  mcpToolId?: ID | null
  brandStyleReferenceId?: ID | null
  advancedConstraints?: AdvancedTemplateConstraints | null
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

export type OAuthProvider = 'google' | 'github'

export type OAuthProviderStatus = {
  provider: OAuthProvider
  configured: boolean
}

export type OAuthProvidersResponse = {
  providers: OAuthProviderStatus[]
}

export type OAuthStartResponse = {
  provider: OAuthProvider
  authorizationUrl: string
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
  models: ListUserModelsResponse
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

export type UpdateSessionRequest = {
  title: string
}

export type UpdateSessionResponse = {
  session: unknown
}

export type DeleteSessionResponse = {
  ok: true
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
  productMode?: ProductMode
  sourceArtifactId?: ID | null
  modelServiceId?: ID | null
  variationCount: number
  requirementModuleGraphId?: ID
  exploration?: ExplorationRequestV1
  explorationDataContext?: Record<string, unknown>
  capabilityRequirements?: CapabilityRequirements
  templateRequirements?: {
    styles?: string[]
    deviceTargets?: DeviceTarget[]
    notes?: string
    advancedConstraints?: AdvancedTemplateConstraints
    capabilitySnapshot?: CapabilitySnapshot
    capabilitySelectionSnapshot?: CapabilitySelectionSnapshotV1
    designTemplatePackIds?: ID[]
    designTemplatePacks?: DesignTemplatePack[]
    interactionParadigm?: InteractionParadigm
    dataIntakeArtifactId?: ID | null
    dataIntake?: DataIntakeArtifactReference
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
    businessContext?: {
      guidanceId?: ID
      entryTitle?: string
      entryPrimaryCategory?: string
      entrySecondaryCategory?: string
      entryTertiaryCategory?: string
      classification?: {
        l1: string
        l2: string
        l3: string
        confidence: number
        signals: string[]
        source: EncyclopediaClassificationSource
      }
      interactionParadigmId?: ID
      interactionParadigm?: InteractionParadigm
      recommendedTemplateIds?: ID[]
      childTemplates?: Array<{
        designTemplatePackId: ID
        interactionParadigmId: ID
        selected: boolean
        confidence: number
        reason: string
      }>
      democaseExperienceProfiles?: Array<{
        caseId: ID
        title: string
        score: number
        experienceProfile: EncyclopediaDemocaseExperienceProfile
      }>
      automationMode?: 'off' | 'semi_auto' | 'auto'
      reviewMode?: 'off' | 'semi_auto' | 'auto'
    }
    variationTemplateAssignments?: Array<{
      variationIndex: number
      designTemplatePackId: ID
      designTemplatePack: DesignTemplatePack
      interactionParadigmId?: ID
      interactionParadigm?: InteractionParadigm
    }>
  }
}

export type CreateDesignJobResponse = {
  job: {
    id: ID
    status: 'queued'
    variationCount: number
    explorationPlan: BatchExplorationPlanV1 | null
    capabilitySelectionSnapshot: CapabilitySelectionSnapshotV1 | null
  }
  variations: Array<{
    id: ID
    index: number
    status: 'queued'
  }>
}

export type PreviewExplorationPlanRequest = {
  sessionId: ID
  requirementModuleGraphId: ID
  variationCount: number
  exploration: ExplorationRequestV1
  dataContext?: Record<string, unknown>
}

export type PreviewExplorationPlanResponse = {
  requirementModuleGraph: RequirementModuleGraphV1
  explorationPlan: BatchExplorationPlanV1
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
  specFindings?: Array<{
    id: string
    source: 'static_rule' | 'template_rule' | 'pixel_gate' | string
    severity: 'error' | 'warning'
    message: string
    repairHint: string
  }>
}

export type UserVariationExecution = {
  phase: 'queued' | 'generating' | 'rendering' | 'completed' | 'failed' | 'cancelled'
  retrying: boolean
  degraded: boolean
  attempt: number
  message: string | null
}

export type AdminVariationRuntimeDiagnostics = {
  runtimeProviderId: string | null
  runtimeLaneId: string | null
  runtimeBackendId: string | null
  runtimeLeaseId: string | null
  runtimeChildSessionId: string | null
  runtimeAgentJobId: string | null
  runtimeAttempt: number
  runtimeLastErrorCode: string | null
}

export type DesignJobSnapshotResponse = {
  job: {
    id: ID
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    prompt: string
    productMode: ProductMode
    variationCount: number
    capabilitySnapshot: UserCapabilitySnapshot | null
    designTemplatePacks: DesignTemplatePack[]
    requirementModuleGraph: RequirementModuleGraphV1 | null
    explorationPlan: BatchExplorationPlanV1 | null
    capabilitySelectionSnapshot: CapabilitySelectionSnapshotV1 | null
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
    explorationPlan: VariationExplorationPlanV1 | null
    execution: UserVariationExecution
    inputTokens: number
    outputTokens: number
    costCents: number
    errorCode: string | null
    errorMessage: string | null
    reviewAction: {
      action: 'confirm_repair' | 'skip'
      status: 'repair_queued' | 'skipped'
      artifactId: ID | null
      artifactVersion: number | null
      createdAt: string
    } | null
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
  requestId?: ID
  prompt: string
  baseArtifactId: ID
  annotationPromptSuffix?: string
  deviceContext?: DeviceTarget
}

export type RefineVariationResponse = {
  requestId?: ID
  variation: {
    id: ID
    status: 'streaming' | 'rendering_preview' | 'completed' | 'failed' | 'cancelled'
    currentArtifactId: ID | null
    previewUrl: string | null
    screenshotUrl: string | null
    errorCode: string | null
    errorMessage: string | null
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
    explorationPlan: VariationExplorationPlanV1 | null
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
    productMode: ProductMode
    capabilitySnapshot: UserCapabilitySnapshot | null
    designTemplatePacks: DesignTemplatePack[]
    requirementModuleGraph: RequirementModuleGraphV1 | null
    explorationPlan: BatchExplorationPlanV1 | null
    capabilitySelectionSnapshot: CapabilitySelectionSnapshotV1 | null
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
  capabilityNotices: McpInvocationResult[]
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

export type ReviewVariationActionRequest = {
  action: 'confirm_repair' | 'skip'
  artifactId?: ID | null
  note?: string | null
}

export type ReviewVariationActionResponse = {
  action: 'confirm_repair' | 'skip'
  status: 'repair_queued' | 'skipped'
  variation: {
    id: ID
    currentArtifactId: ID | null
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
  } | null
  queueJob?: {
    idempotencyKey: string
    kind: 'automation_refine_job'
    status: 'queued'
  }
  message: string
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
  requestId?: ID
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

export type CancelVariationRefineRequest = {
  reason?: string
}

export type CancelVariationRefineResponse = {
  requestId: ID
  variationId: ID
  status: 'cancelling' | 'cancelled' | 'already_finished'
  runtime: {
    cancelled: boolean
    message?: string
    cancelledVariationCount?: number
    failedVariationCount?: number
  }
}

export type VariationRefineOperationSnapshot = {
  requestId: ID
  variationId: ID
  kind: 'prompt' | 'annotations'
  prompt: string
  baseArtifactId: ID
  status: 'starting' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed'
  cancelRequested: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type GetVariationRefineOperationResponse = {
  operation: VariationRefineOperationSnapshot | null
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
