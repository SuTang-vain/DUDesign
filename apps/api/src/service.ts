import { createDesignEvent } from '@dudesign/contracts'
import type {
  AdvancedTemplateConstraints,
  AdminMcpInvocationAuditResponse,
  AdminMcpInvocationSummaryResponse,
  AdminMcpToolHealthSummary,
  AnalyzeDataIntakeRequest,
  AnalyzeDataIntakeResponse,
  AuthorizeMcpInvocationRequest,
  AutomationLoopProfile,
  CapabilityPlugin,
  CreateDesignJobRequest,
  CreateAnnotationBatchRequest,
  DataIntakeAnalysis,
  DataIntakeArtifactReference,
  DataIntakeField,
  DataIntakeInputSource,
  DataIntakeRecommendation,
  EncyclopediaClassificationVector,
  EncyclopediaEntryGuidanceResponse,
  ExecuteMcpInvocationResponse,
  ImageGenerationArtifact,
  CreateSourceArtifactRequest,
  CreateSessionRequest,
  DesignTemplatePack,
  DesignSkill,
  DesignEvent,
  InteractionParadigm,
  ImportDesignTemplatePackRequest,
  RefineVariationRequest,
  ReplayMcpInvocationResponse,
  ResearchContextArtifact,
  ResearchContextArtifactReference,
  ReviewVariationActionRequest,
  SaveVariationTemplateRequest,
  ShareVariationRequest,
  UpdateUserPreferencesRequest,
  UserCapabilityPreference,
  McpInvocationRequest,
  McpInvocationResult,
  McpInvocationAuditRecord,
  McpToolBinding,
} from '@dudesign/contracts'
import { LocalArtifactStore, type ArtifactStore } from '@dudesign/artifact-store'
import {
  authorizeMcpInvocation,
  DUDESIGN_RUNTIME_CONTRACT_VERSION,
  type McpInvocationAuthorization,
  mcpToolPromptContext,
  MockRuntimeGateway,
  type RuntimeGateway,
  type RuntimeModels,
} from '@dudesign/runtime-gateway'
import type { Artifact, DesignVariation, DesignVariationStatus, EntryContentLanguage, ModelService, WorkspaceMemberRole } from '@dudesign/domain'
import type { EncyclopediaEntryGuidance } from '@dudesign/domain'
import { createHash } from 'node:crypto'
import { join, posix } from 'node:path'
import { buildAnnotationPrompt } from './annotationPrompt.js'
import {
  analyzeHtmlArtifactQuality,
  analyzeHtmlArtifactQualityWithPixelGate,
  type ArtifactQualityReport,
} from './artifactQuality.js'
import { reviewDynamicEncyclopediaSpec } from './encyclopediaSpecReview.js'
import { renderHtmlScreenshots } from './screenshotRenderer.js'
import { JobEventBus } from './eventBus.js'
import { InMemoryStore } from './store.js'
import type { ApplicationRepository } from './repository.js'
import type { RequestContext } from './auth.js'
import type { OAuthProvider } from './oauth.js'
import { createId } from './id.js'
import { DYNAMIC_ENCYCLOPEDIA_PRESET, listCapabilities, resolveCapabilitySnapshot } from './capabilities.js'
import { DESIGN_TEMPLATE_PACK_SCHEMA_VERSION, importDesignMd } from './designTemplatePack.js'
import {
  InMemoryDesignJobQueue,
  type DesignJobQueue,
  type DesignJobQueuePayload,
  type RefineJobQueuePayload,
  type ScreenshotJobQueuePayload,
} from './designJobQueue.js'
import { attachDesignJobWorker } from './designJobWorker.js'
import { MockMcpExecutor, type McpExecutor } from './mcpExecutor.js'
import {
  buildAutomationRepairPrompt,
  evaluateAutomationLoopStop,
  type AutomationRepairFinding,
  type AutomationLoopStopReason,
} from './automationLoop.js'
import { lookupEncyclopediaDemocases, type EncyclopediaDemocaseMatch } from './encyclopediaDemocase.js'
import { detectEntryLanguage } from './entryLanguage.js'
import { AuthApplicationService } from './application/authApplicationService.js'
import { AdminRuntimeGovernanceService } from './application/adminRuntimeGovernanceService.js'
import { ArtifactApplicationService } from './application/artifactApplicationService.js'

type ReviewMode = 'off' | 'semi_auto' | 'auto'
const AUTOMATION_REPAIR_PROMPT_PREVIEW_LENGTH = 1200

type AdminTemplateLintFinding = {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

type AdminTemplateGovernanceEntry = {
  id: string
  name: string
  description: string | null
  source: DesignTemplatePack['source']
  status: DesignTemplatePack['status']
  visibility: DesignTemplatePack['visibility']
  version: string
  lintStatus: 'passed' | 'warning' | 'failed'
  governanceStatus: 'published' | 'draft' | 'disabled' | 'archived'
  category: 'official-template-pack' | 'business-template-package' | 'user-template'
  colorTokenCount: number
  componentCount: number
  sectionCount: number
  childTemplates: Array<{
    id: string
    name: string
    description: string
  }>
  requiredActions: string[]
  findings: AdminTemplateLintFinding[]
  promptBlockCoverage: {
    colors: boolean
    components: boolean
    sections: boolean
    dos: boolean
    donts: boolean
  }
  previewArtifact: {
    id: string | null
    status: 'available' | 'missing'
  }
  versionDiff: {
    currentVersion: string
    previousVersion: string | null
    status: 'new' | 'unchanged' | 'changed'
    changedFields: string[]
  }
  designMd: {
    importStatus: 'available' | 'missing'
    brokenReferenceCount: number
    dangerousInstructionCount: number
    previewSmokeStatus: 'pass' | 'warn' | 'fail'
  }
}

type AdminCapabilityRegistryAsset = {
  id: string
  name: string
  type: 'scene-template' | 'visual-profile' | 'color-palette' | 'brand-reference' | 'design-template-pack' | 'business-template-package'
  status: 'active' | 'warning' | 'blocked'
  version: string | null
  description: string
  summary: string[]
  requiredActions: string[]
  linkedAssetIds: string[]
}

type AdminCapabilityUsageMetrics = {
  usageCount: number
  successCount: number
  failureCount: number
  successRate: number
  averageCostCents: number
  totalCostCents: number
  lastUsedAt: string | null
  recentFailureReasons: string[]
  recentDriftCount: number
}

type AdminSkillGovernanceEntry = {
  id: string
  pluginId: string
  pluginName: string
  schemaVersion: string
  status: CapabilityPlugin['status']
  safetyLevel: CapabilityPlugin['safetyLevel']
  category: CapabilityPlugin['category']
  promptBlockCount: number
  ruleCount: number
  negativeRuleCount: number
  checklistCount: number
  allowedTemplateCategories: string[]
  visibility: CapabilityPlugin['visibility']
  policyMode: 'prompt_block_only' | 'runtime_tool_policy'
  usage: AdminCapabilityUsageMetrics
  requiredActions: string[]
}

type AdminMcpPluginGovernanceEntry = {
  id: string
  pluginId: string
  pluginName: string
  serverName: string
  toolName: string
  status: CapabilityPlugin['status']
  safetyLevel: CapabilityPlugin['safetyLevel']
  scopes: string[]
  requiresUserAuth: boolean
  auditLevel: CapabilityPlugin['permissionPolicy']['auditLevel']
  policyMode: 'policy_only' | 'mock_enabled' | 'real_invocation_opt_in'
  rolloutState: 'policy_only' | 'mock' | 'staging_real' | 'production_real'
  visibility: CapabilityPlugin['visibility']
  allowedTemplateCategories: string[]
  health: {
    totalCount: number
    successRate: number
    unavailableRate: number
    lastStatus: string | null
    lastErrorCode: string | null
    lastInvokedAt: string | null
  }
  usage: AdminCapabilityUsageMetrics
  requiredActions: string[]
}

type AdminAutomationLoopGovernanceEntry = {
  id: string
  name: string
  qualityGates: AutomationLoopProfile['qualityGates']
  repairStrategy: AutomationLoopProfile['repairStrategy']
  maxRepairAttempts: number
  maxCostCents: number | null
  maxDurationMs: number | null
  usage: AdminCapabilityUsageMetrics
  quality: {
    staticGate: boolean
    pixelGate: boolean
    specGate: boolean
    repairEnabled: boolean
  }
  requiredActions: string[]
}

type AdminCapabilityQualitySummary = {
  templatesWithWarnings: number
  templatesBlocked: number
  riskyPlugins: number
  disabledPlugins: number
  policyOnlyMcpTools: number
  realMcpTools: number
  automationLoopsWithPixelGate: number
  auditLogCount: number
  recentDriftCount: number
  // 硬性归束（v0.4）摘要
  hardConstraints: {
    /** 模板包在硬性归束（no-scroll-frame / 溢出策略 / 中文优先 / 英文 UI 短语）上的合规统计 */
    templates: {
      total: number
      compliant: number
      chineseFirstMissing: number
      englishUiMissing: number
    }
  }
  previewSmoke: {
    status: 'not_configured' | 'available'
    passedCount: number
    warningCount: number
    failedCount: number
  }
  designMd: {
    lintAvailable: boolean
    diffAvailable: boolean
    previewSmokeAvailable: boolean
    message: string
  }
}

type AdminPrivateTemplateSummary = {
  count: number
  latestCreatedAt: string | null
  lint: {
    passed: number
    warning: number
    failed: number
  }
  previewArtifact: {
    available: number
    missing: number
  }
}

type AdminDynamicEncyclopediaGovernance = {
  parentTemplatePackId: string
  childTemplates: Array<{
    id: string
    name: string
    status: 'active' | 'missing'
    parentTemplatePackId: string | null
  }>
  interactionParadigms: Array<{
    id: string
    name: string
    compatibleTemplatePackIds: string[]
    compatibleTemplateCount: number
    mappingStatus: 'mapped' | 'missing_template'
    bestFor: string[]
  }>
  categoryMappings: Array<{
    level: 'L1' | 'L2' | 'L3'
    category: string
    interactionParadigmIds: string[]
    templatePackIds: string[]
  }>
  sourceOfTruth: 'InteractionParadigm.compatibleTemplatePackIds'
}

const LOW_CONFIDENCE_GUIDANCE_THRESHOLD = 0.6

export class ApplicationService {
  readonly store: ApplicationRepository
  readonly events: JobEventBus
  readonly runtime: RuntimeGateway
  readonly artifacts: ArtifactStore
  readonly queue: DesignJobQueue
  readonly mcpExecutor: McpExecutor
  readonly authService: AuthApplicationService
  readonly adminRuntimeGovernance: AdminRuntimeGovernanceService
  readonly artifactService: ArtifactApplicationService
  private readonly backgroundTasks = new Set<Promise<unknown>>()
  private readonly disabledCapabilityPluginIds = new Set<string>()
  private readonly capabilityGovernanceReady: Promise<void>

  constructor(options: {
    store?: ApplicationRepository
    events?: JobEventBus
    runtime?: RuntimeGateway
    artifacts?: ArtifactStore
    queue?: DesignJobQueue
    mcpExecutor?: McpExecutor
    consumeQueue?: boolean
  } = {}) {
    this.store = options.store ?? new InMemoryStore()
    this.events = options.events ?? new JobEventBus()
    this.runtime = options.runtime ?? new MockRuntimeGateway()
    this.artifacts = options.artifacts ?? new LocalArtifactStore({
      rootDir: process.env.DUDESIGN_ARTIFACT_ROOT ?? join(process.cwd(), '.dudesign', 'artifacts'),
    })
    this.queue = options.queue ?? new InMemoryDesignJobQueue()
    this.mcpExecutor = options.mcpExecutor ?? new MockMcpExecutor()
    this.authService = new AuthApplicationService(this.store)
    this.adminRuntimeGovernance = new AdminRuntimeGovernanceService(this.store, this.runtime)
    this.artifactService = new ArtifactApplicationService(this.store, this.artifacts)
    this.capabilityGovernanceReady = this.loadCapabilityGovernanceOverrides()
    if (options.consumeQueue ?? true) {
      attachDesignJobWorker(this.queue, this)
    }
  }

  async flushBackgroundTasks(): Promise<void> {
    while (true) {
      await this.queue.flush?.()
      if (this.backgroundTasks.size === 0) break
      await Promise.allSettled([...this.backgroundTasks])
    }
    await this.queue.flush?.()
  }

  async getBootstrap(ctx: RequestContext) {
    const user = await this.requireUser(ctx.userId)
    const workspace = await this.store.getPrimaryWorkspaceForUser(user.id)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${user.id}`)
    const models = await this.store.listUserModelOptions(user.id)
    return { user, workspace, workspaces: [workspace], models }
  }

  async registerUser(
    _ctx: RequestContext,
    input: { email?: string; password?: string; name?: string | null },
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    return this.authService.registerUser(input, meta)
  }

  async loginUser(
    _ctx: RequestContext,
    input: { email?: string; password?: string },
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    return this.authService.loginUser(input, meta)
  }

  async listOAuthProviders() {
    return this.authService.listOAuthProviders()
  }

  async startOAuthLogin(provider: OAuthProvider) {
    return this.authService.startOAuthLogin(provider)
  }

  async completeOAuthLogin(
    provider: OAuthProvider,
    code: string,
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    return this.authService.completeOAuthLogin(provider, code, meta)
  }

  async logoutUser(ctx: RequestContext) {
    return this.authService.logoutUser(ctx)
  }

  async getCurrentUser(ctx: RequestContext) {
    return this.authService.getCurrentUser(ctx)
  }

  async listUserModels(ctx: RequestContext) {
    const user = await this.requireUser(ctx.userId)
    return this.store.listUserModelOptions(user.id)
  }

  async listCapabilities(ctx: RequestContext) {
    await this.requireUser(ctx.userId)
    await this.ensureCapabilityGovernanceReady()
    return listCapabilities(this.capabilityGovernanceOptions())
  }

  async createEncyclopediaEntryGuidance(
    ctx: RequestContext,
    input: {
      workspaceId?: string | null
      entry?: string
      context?: string | null
      maxTemplateRecommendations?: number
      automationMode?: 'off' | 'semi_auto' | 'auto'
    },
  ): Promise<EncyclopediaEntryGuidanceResponse> {
    const user = await this.requireUser(ctx.userId)
    const workspaceId = input.workspaceId ?? (await this.store.getPrimaryWorkspaceForUser(user.id))?.id ?? null
    if (!workspaceId) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${user.id}`)
    await this.requireWorkspaceAccess(workspaceId, ctx.userId, 'viewer')
    const rawInput = typeof input.entry === 'string' ? input.entry.trim() : ''
    if (!rawInput) throw createHttpError(400, 'ENTRY_REQUIRED', 'entry is required.')

    const title = normalizeEntryTitle(rawInput)
    const context = typeof input.context === 'string' && input.context.trim().length > 0
      ? input.context.trim()
      : null
    const democaseMatches = lookupEncyclopediaDemocases(`${rawInput}\n${context ?? ''}`)
    const classification = applyDemocaseClassification(
      classifyEncyclopediaEntry(`${rawInput}\n${context ?? ''}`),
      democaseMatches,
    )
    const maxTemplateRecommendations = typeof input.maxTemplateRecommendations === 'number'
      ? Math.max(1, Math.min(3, Math.trunc(input.maxTemplateRecommendations)))
      : 3
    const automationMode = input.automationMode ?? 'auto'
    const recommendedTemplates = await this.recommendDynamicEncyclopediaTemplates(
      ctx.userId,
      workspaceId,
      classification.primaryCategory,
      classification.secondaryCategory,
      maxTemplateRecommendations,
      democaseMatches,
    )
    const selectedTemplateIds = recommendedTemplates
      .filter(template => template.selected)
      .map(template => template.designTemplatePackId)
    const interactionParadigmId = democaseMatches[0]?.interactionParadigmId
      ?? recommendedTemplates.find(template => selectedTemplateIds.includes(template.designTemplatePackId))?.interactionParadigmId
      ?? recommendedInteractionParadigmId(classification.primaryCategory, classification.secondaryCategory)
    const classificationVector = buildEncyclopediaClassificationVector(
      classification,
      recommendedTemplates.map(template => template.designTemplatePackId),
    )

    // 词条语言识别（在 guidance 落地前完成，结果会进入 businessContext，
    // 供后续 spec review 的"中文优先"硬约束使用）。
    const languageDetection = detectEntryLanguage(title, context)

    const now = new Date().toISOString()
    const requiresConfirmation = classification.confidence < LOW_CONFIDENCE_GUIDANCE_THRESHOLD
    const guidance = await this.store.saveEncyclopediaEntryGuidance({
      id: createId('eg'),
      userId: ctx.userId,
      workspaceId,
      productMode: 'dynamic_encyclopedia_card',
      entryTitle: title,
      rawInput,
      context,
      primaryCategory: classification.primaryCategory,
      secondaryCategory: classification.secondaryCategory,
      tertiaryCategory: classification.tertiaryCategory,
      confidence: classification.confidence,
      signals: classification.signals,
      recommendedTemplateIds: recommendedTemplates.map(template => template.designTemplatePackId),
      selectedTemplateIds,
      interactionParadigmId,
      automationMode,
      isLanguageCategory: languageDetection.isLanguageCategory,
      entryContentLanguage: languageDetection.entryContentLanguage,
      status: requiresConfirmation ? 'needs_confirmation' : 'draft',
      confirmedAt: null,
      metadata: {
        classificationSource: 'mock_rules',
        classificationVector,
        requiresConfirmation,
        languageDetection, // 保留字符区块分布与触发信号，便于 admin 面板与 audit
        democaseReferences: democaseMatches,
      },
      createdAt: now,
      updatedAt: now,
    })
    return this.toEncyclopediaEntryGuidanceResponse(ctx.userId, guidance)
  }

  async getEncyclopediaEntryGuidance(ctx: RequestContext, guidanceId: string): Promise<EncyclopediaEntryGuidanceResponse> {
    await this.requireUser(ctx.userId)
    const guidance = await this.requireReadableEncyclopediaGuidance(ctx, guidanceId)
    return this.toEncyclopediaEntryGuidanceResponse(ctx.userId, guidance)
  }

  async confirmEncyclopediaEntryGuidance(
    ctx: RequestContext,
    guidanceId: string,
    input: {
      selectedTemplateIds?: string[]
      classificationOverride?: {
        primaryCategory?: string
        secondaryCategory?: string
        tertiaryCategory?: string | null
      }
      automationMode?: 'off' | 'semi_auto' | 'auto'
    },
  ): Promise<EncyclopediaEntryGuidanceResponse> {
    await this.requireUser(ctx.userId)
    const guidance = await this.requireReadableEncyclopediaGuidance(ctx, guidanceId)
    await this.requireWorkspaceAccess(guidance.workspaceId, ctx.userId, 'editor')
    const classificationOverride = normalizeGuidanceClassificationOverride(input.classificationOverride)
    const primaryCategory = classificationOverride?.primaryCategory ?? guidance.primaryCategory
    const secondaryCategory = classificationOverride?.secondaryCategory ?? guidance.secondaryCategory
    const tertiaryCategory = classificationOverride?.tertiaryCategory ?? guidance.tertiaryCategory
    const democaseMatches = guidanceDemocaseMatches(guidance)
    const recommendedTemplates = classificationOverride
      ? await this.recommendDynamicEncyclopediaTemplates(
          ctx.userId,
          guidance.workspaceId,
          primaryCategory,
          secondaryCategory,
          Math.max(1, Math.min(3, guidance.recommendedTemplateIds.length || 3)),
          democaseMatches,
        )
      : []
    const allowedTemplateIds = classificationOverride
      ? recommendedTemplates.map(template => template.designTemplatePackId)
      : guidance.recommendedTemplateIds
    const defaultSelectedTemplateIds = classificationOverride
      ? recommendedTemplates.filter(template => template.selected).map(template => template.designTemplatePackId)
      : guidance.selectedTemplateIds
    const selectedTemplateIds = Array.isArray(input.selectedTemplateIds) && input.selectedTemplateIds.length > 0
      ? input.selectedTemplateIds
          .filter((id): id is string => typeof id === 'string' && allowedTemplateIds.includes(id))
          .slice(0, 3)
      : defaultSelectedTemplateIds
    if (selectedTemplateIds.length === 0) throw createHttpError(400, 'GUIDANCE_TEMPLATE_REQUIRED', 'At least one recommended template must be selected.')
    const interactionParadigmId = selectedTemplateIds
      .map(templateId => interactionParadigmIdForTemplatePack(templateId))
      .find((id): id is string => Boolean(id))
      ?? recommendedInteractionParadigmId(primaryCategory, secondaryCategory)
    const classificationVector = buildEncyclopediaClassificationVector({
      primaryCategory,
      secondaryCategory,
      tertiaryCategory,
      confidence: classificationOverride ? Math.max(guidance.confidence, 0.64) : guidance.confidence,
      signals: classificationOverride ? [...new Set([...guidance.signals.filter(signal => signal !== 'fallback'), 'user_override'])] : guidance.signals,
    }, classificationOverride ? allowedTemplateIds : guidance.recommendedTemplateIds)
    const now = new Date().toISOString()
    const confirmed = await this.store.saveEncyclopediaEntryGuidance({
      ...guidance,
      primaryCategory,
      secondaryCategory,
      tertiaryCategory,
      confidence: classificationOverride ? Math.max(guidance.confidence, 0.64) : guidance.confidence,
      signals: classificationOverride ? [...new Set([...guidance.signals.filter(signal => signal !== 'fallback'), 'user_override'])] : guidance.signals,
      recommendedTemplateIds: classificationOverride ? allowedTemplateIds : guidance.recommendedTemplateIds,
      selectedTemplateIds,
      interactionParadigmId,
      automationMode: input.automationMode ?? guidance.automationMode,
      status: 'confirmed',
      confirmedAt: now,
      metadata: {
        ...guidance.metadata,
        classificationVector,
        classificationOverride: classificationOverride ?? null,
      },
      updatedAt: now,
    })
    return this.toEncyclopediaEntryGuidanceResponse(ctx.userId, confirmed)
  }

  async listDesignTemplatePacks(ctx: RequestContext, workspaceId?: string | null) {
    await this.requireUser(ctx.userId)
    return {
      templates: await this.store.listDesignTemplatePacks(ctx.userId, workspaceId ?? null),
    }
  }

  async importDesignTemplatePack(ctx: RequestContext, input: ImportDesignTemplatePackRequest) {
    await this.requireUser(ctx.userId)
    if (!input.designMd?.trim()) throw createHttpError(400, 'INVALID_DESIGN_MD', 'designMd is required.')
    const result = importDesignMd(input.designMd, {
      id: createId('dtp'),
      source: 'user',
      visibility: 'private',
      status: 'published',
      createdByUserId: ctx.userId,
    })
    const template = {
      ...result.pack,
      name: input.name?.trim() || result.pack.name,
      createdByUserId: ctx.userId,
    }
    await this.store.saveDesignTemplatePack(template)
    return {
      template,
      findings: result.findings,
      summary: result.summary,
    }
  }

  async saveVariationAsTemplate(ctx: RequestContext, variationId: string, input: SaveVariationTemplateRequest = {}) {
    const snapshot = await this.store.getVariationDetailSnapshot(variationId)
    if (!snapshot) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const { variation, job, currentArtifact } = snapshot
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId, 'editor')
    const requestedArtifact = input.artifactId ? await this.store.getArtifactById(input.artifactId) : currentArtifact
    if (!requestedArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', 'A current or requested artifact is required to save a template.')
    if (requestedArtifact.variationId !== variation.id) throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')

    const templateRequirements = normalizeTemplateRequirements(job.templateRequirements)
    const assignedPack = assignedTemplatePackForVariation(variation.index, templateRequirements?.variationTemplateAssignments ?? [])
    const template: DesignTemplatePack = {
      ...(assignedPack ?? fallbackDesignTemplatePackFromVariation(variation, job)),
      id: createId('dtp'),
      source: 'user',
      format: 'dudesign-template-v1',
      visibility: 'private',
      status: 'published',
      name: input.name?.trim() || `${variation.title ?? `Variation ${variation.index}`} Template`,
      description: input.description?.trim() || `Saved from ${variation.title ?? `variation ${variation.index}`} in job ${job.id}.`,
      version: '1.0.0',
      previewArtifactId: requestedArtifact.id,
      lintStatus: assignedPack?.lintStatus ?? 'unknown',
      createdByUserId: ctx.userId,
    }
    await this.store.saveDesignTemplatePack(template)
    return {
      template,
      findings: [],
      summary: { errors: 0, warnings: 0, info: 0 },
    }
  }

  async getUserPreferences(ctx: RequestContext) {
    const user = await this.requireUser(ctx.userId)
    const preference = await this.store.getUserCapabilityPreference(user.id)
    return { capabilityPreference: withCapabilityPreferenceDefaults(preference) }
  }

  async updateUserPreferences(ctx: RequestContext, input: UpdateUserPreferencesRequest) {
    const user = await this.requireUser(ctx.userId)
    const current = withCapabilityPreferenceDefaults(await this.store.getUserCapabilityPreference(user.id))
    const next = normalizeCapabilityPreference({
      ...current,
      ...(input.capabilityPreference ?? {}),
    })
    const saved = await this.store.saveUserCapabilityPreference(user.id, next)
    const workspace = await this.store.getPrimaryWorkspaceForUser(user.id)
    if (workspace) {
      await this.recordUsageEvent({
        idempotencyKey: `usage:capability.preference.updated:user:${user.id}:at:${Date.now()}`,
        kind: 'capability.preference.updated',
        userId: user.id,
        workspaceId: workspace.id,
        sessionId: null,
        jobId: null,
        variationId: null,
        artifactId: null,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        metadata: {
          preference: saved,
        },
      })
    }
    return { capabilityPreference: saved }
  }

  async createSourceArtifact(ctx: RequestContext, input: CreateSourceArtifactRequest) {
    const user = await this.requireUser(ctx.userId)
    const workspace = await this.store.getWorkspaceById(input.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${input.workspaceId}`)
    await this.requireWorkspaceAccess(workspace.id, user.id, 'editor')
    const entryPath = normalizeUploadedHtmlFilename(input.filename)
    const html = validateUploadedHtml(input.html)
    const quality = await this.analyzeArtifactQuality(html)
    const artifactId = createId('src')
    const sourceSession = await this.store.createSession({
      userId: user.id,
      workspaceId: workspace.id,
      mode: 'from_existing_html',
      title: `Source upload: ${entryPath}`,
      sourceArtifactId: null,
      runtimeSessionId: null,
    })
    const stored = await this.artifacts.put({
      workspaceId: workspace.id,
      artifactId,
      relativePath: entryPath,
      contentType: 'text/html; charset=utf-8',
      body: html,
      metadata: {
        kind: 'source_html',
        userId: user.id,
        qualityStatus: quality.status,
        qualityIssues: quality.issues.join('\n'),
      },
    })
    const artifact = await this.store.createArtifact({
      workspaceId: workspace.id,
      sessionId: sourceSession.id,
      variationId: null,
      parentArtifactId: null,
      kind: 'html',
      version: 1,
      storageKey: stored.storageKey,
      entryPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        source: 'user-upload',
        filename: input.filename,
        uploadedByUserId: user.id,
        quality,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        workspaceId: artifact.workspaceId,
        kind: 'html' as const,
        version: artifact.version,
        entryPath: artifact.entryPath ?? entryPath,
        sizeBytes: artifact.sizeBytes,
        contentHash: artifact.contentHash,
        quality: artifactQualitySummary(artifact.metadata.quality),
      },
    }
  }

  async createSession(ctx: RequestContext, input: CreateSessionRequest) {
    const user = await this.requireUser(ctx.userId)
    const workspace = await this.store.getWorkspaceById(input.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${input.workspaceId}`)
    await this.requireWorkspaceAccess(workspace.id, user.id, 'editor')
    const session = await this.store.createSession({
      ...input,
      userId: user.id,
      mode: input.mode ?? 'new_html',
    })
    const runtime = await this.tryCreateRuntimeSession({
      userId: user.id,
      workspaceId: workspace.id,
      sessionId: session.id,
      workspaceRoot: workspace.storageKey,
      memoryNamespace: user.memoryNamespace,
    })
    const updated = {
      ...session,
      runtimeSessionId: runtime.runtimeSessionId,
      updatedAt: new Date().toISOString(),
    }
    await this.store.saveSession(updated)
    return {
      session: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        runtimeSessionId: updated.runtimeSessionId,
        status: updated.status,
      },
    }
  }

  async analyzeDataIntake(ctx: RequestContext, input: AnalyzeDataIntakeRequest): Promise<AnalyzeDataIntakeResponse> {
    const workspaceId = stringValue(input.workspaceId)
    if (!workspaceId) throw createHttpError(400, 'WORKSPACE_ID_REQUIRED', 'workspaceId is required.')
    const workspace = await this.store.getWorkspaceById(workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    await this.requireWorkspaceAccess(workspace.id, ctx.userId, 'editor')

    const analysis = buildDataIntakeAnalysis(input)
    const artifactId = createId('dia')
    const createdAt = new Date().toISOString()
    const stored = await this.artifacts.put({
      workspaceId: workspace.id,
      artifactId,
      relativePath: 'capabilities/data-intake/analysis.json',
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        artifactId,
        workspaceId: workspace.id,
        createdAt,
        analysis,
      }, null, 2),
      metadata: {
        kind: 'data_intake_analysis',
        userId: ctx.userId,
        schemaVersion: analysis.schemaVersion,
        reviewStatus: analysis.reviewStatus,
      },
    })

    return {
      analysis,
      artifact: {
        id: artifactId,
        workspaceId: workspace.id,
        kind: 'data_intake_analysis',
        storageKey: stored.storageKey,
        contentHash: stored.contentHash,
        sizeBytes: stored.sizeBytes,
        createdAt,
      },
    }
  }

  async listSessions(ctx: RequestContext) {
    const sessions = await this.store.listSessions()
    const visibleSessions = []
    for (const session of sessions) {
      if (await this.canAccessWorkspace(session.workspaceId, ctx.userId, 'viewer')) visibleSessions.push(session)
    }
    return {
      sessions: visibleSessions,
    }
  }

  private async tryCreateRuntimeSession(input: Parameters<RuntimeGateway['createSession']>[0]) {
    try {
      return await this.runtime.createSession(input)
    } catch (error) {
      return {
        runtimeSessionId: null,
        message: error instanceof Error ? error.message : 'Runtime unavailable.',
      }
    }
  }

  async resumeSession(ctx: RequestContext, sessionId: string) {
    const snapshot = await this.store.getSessionSnapshot(sessionId)
    if (!snapshot) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    await this.requireSessionAccess(snapshot.session.id, ctx.userId, 'editor')
    const workspace = await this.store.getWorkspaceById(snapshot.session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${snapshot.session.workspaceId}`)
    const user = await this.requireUser(snapshot.session.userId)
    const runtime = await this.runtime.resumeSession({
      userId: snapshot.session.userId,
      workspaceId: workspace.id,
      sessionId: snapshot.session.id,
      runtimeSessionId: snapshot.session.runtimeSessionId,
      workspaceRoot: workspace.storageKey,
      memoryNamespace: user.memoryNamespace,
    })
    const session = runtime.runtimeSessionId && runtime.runtimeSessionId !== snapshot.session.runtimeSessionId
      ? {
          ...snapshot.session,
          runtimeSessionId: runtime.runtimeSessionId,
          updatedAt: new Date().toISOString(),
        }
      : snapshot.session
    if (session !== snapshot.session) {
      await this.store.saveSession(session)
    }
    return {
      ...snapshot,
      session,
      runtime,
    }
  }

  async createDesignJob(ctx: RequestContext, input: CreateDesignJobRequest) {
    validateVariationCount(input.variationCount)
    const context = await this.store.getSessionWorkspaceContext(input.sessionId)
    if (!context) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${input.sessionId}`)
    const { session, workspace } = context
    await this.requireSessionAccess(session.id, ctx.userId, 'editor')
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${session.workspaceId}`)
    const jobInput = await this.withDynamicEncyclopediaGuidanceSnapshot(ctx, workspace.id, input)
    const selectedModel = await this.resolveUserModel(ctx.userId, jobInput.modelServiceId ?? null)
    await this.ensureCapabilityGovernanceReady()
    const capabilitySnapshot = resolveCapabilitySnapshot(jobInput.capabilityRequirements, this.capabilityGovernanceOptions())
    const designTemplatePacks = await this.resolveDesignTemplatePacksForJob(ctx.userId, workspace.id, jobInput)
    const variationTemplateAssignments = assignDesignTemplatePacks(jobInput.variationCount, designTemplatePacks)
    const dataIntake = await this.resolveDataIntakeArtifactReference(workspace.id, jobInput.templateRequirements?.dataIntakeArtifactId ?? jobInput.templateRequirements?.dataIntake?.artifactId ?? null)
    const researchContexts = await this.resolveResearchContextArtifactReferences(workspace.id, [
      ...(jobInput.templateRequirements?.researchContextArtifactIds ?? []),
      ...(jobInput.templateRequirements?.researchContexts ?? []).map(reference => reference.artifactId),
    ])
    await this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: jobInput.prompt,
      metadata: {
        sourceMode: jobInput.sourceMode,
        productMode: jobInput.productMode ?? 'web_app',
        sourceArtifactId: jobInput.sourceArtifactId ?? null,
        variationCount: jobInput.variationCount,
        modelServiceId: selectedModel.id,
        capabilitySnapshot,
        designTemplatePackIds: designTemplatePacks.map(template => template.id),
        designTemplatePackVersions: designTemplatePacks.map(template => ({
          id: template.id,
          version: template.version,
        })),
        dataIntake,
        researchContexts,
        variationTemplateAssignments: variationTemplateAssignments.map(assignment => ({
          variationIndex: assignment.variationIndex,
          designTemplatePackId: assignment.designTemplatePackId,
        })),
      },
    })
    const job = await this.store.createJob({
      session,
      prompt: jobInput.prompt,
      sourceMode: jobInput.sourceMode,
      productMode: jobInput.productMode ?? 'web_app',
      variationCount: jobInput.variationCount,
      templateRequirements: {
        ...(jobInput.templateRequirements ?? {}),
        capabilitySnapshot,
        capabilityProfileVersion: capabilitySnapshot.profileVersion ?? capabilitySnapshot.schemaVersion,
        designTemplatePackIds: designTemplatePacks.map(template => template.id),
        designTemplatePackVersions: designTemplatePacks.map(template => ({
          id: template.id,
          version: template.version,
        })),
        designTemplatePacks,
        variationTemplateAssignments,
        ...(dataIntake ? { dataIntakeArtifactId: dataIntake.artifactId, dataIntake } : {}),
        ...(researchContexts.length > 0
          ? {
              researchContextArtifactIds: researchContexts.map(reference => reference.artifactId),
              researchContexts,
            }
          : {}),
        modelServiceId: selectedModel.id,
        modelId: selectedModel.modelId,
        modelProvider: selectedModel.provider,
      },
    })
    await this.recordCapabilityUsageEvents({
      userId: ctx.userId,
      workspaceId: workspace.id,
      sessionId: session.id,
      jobId: job.id,
      capabilitySnapshot,
      designTemplatePacks,
    })
    const variations = await this.store.createVariations({ job, count: jobInput.variationCount })

    await this.queue.enqueueDesignJob({
      jobId: job.id,
      sessionId: session.id,
      variationIds: variations.map(variation => variation.id),
      sourceArtifactId: jobInput.sourceArtifactId ?? null,
      runtimeSessionId: session.runtimeSessionId,
      modelServiceId: selectedModel.id,
      idempotencyKey: designJobQueueIdempotencyKey(job.id),
      userId: session.userId,
      workspaceId: workspace.id,
      createdAt: new Date().toISOString(),
    })

    return {
      job: {
        id: job.id,
        status: job.status,
        variationCount: job.variationCount,
      },
      variations: variations.map(variation => ({
        id: variation.id,
        index: variation.index,
        status: variation.status,
      })),
    }
  }

  async getDesignJob(ctx: RequestContext, jobId: string) {
    const snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    await this.requireJobAccess(snapshot.job.id, ctx.userId, 'viewer')
    const templateRequirements = normalizeTemplateRequirements(snapshot.job.templateRequirements)
    const designTemplatePacks = templateRequirements?.designTemplatePacks ?? []
    const assignments = templateRequirements?.variationTemplateAssignments ?? []
    const reviewActionsByVariation = latestVariationReviewActions(snapshot.messages)
    return {
      job: {
        ...snapshot.job,
        capabilitySnapshot: templateRequirements?.capabilitySnapshot ?? null,
        designTemplatePacks,
      },
      variations: snapshot.variations.map(variation => ({
        id: variation.id,
        index: variation.index,
        title: variation.title,
        status: variation.status,
        currentArtifactId: variation.currentArtifactId,
        previewUrl: variation.previewUrl,
        inputTokens: variation.inputTokens,
        outputTokens: variation.outputTokens,
        costCents: variation.costCents,
        errorCode: variation.errorCode,
        errorMessage: variation.errorMessage,
        designTemplatePack: assignedTemplatePackForVariation(variation.index, assignments),
        screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
        execution: userVariationExecution(variation),
        reviewAction: reviewActionsByVariation.get(variation.id) ?? null,
      })),
      artifacts: snapshot.artifacts.map(artifact => ({
        id: artifact.id,
        variationId: artifact.variationId,
        version: artifact.version,
        kind: artifact.kind,
        entryPath: artifact.entryPath,
        parentArtifactId: artifact.parentArtifactId,
        screenshotDevice: artifact.kind === 'screenshot' ? screenshotDeviceFromArtifact(artifact) : null,
        url: artifact.kind === 'screenshot' ? screenshotUrlForArtifact(artifact) : null,
        quality: artifactQualitySummary(artifact.metadata.quality),
      })),
    }
  }

  async authorizeMcpInvocation(ctx: RequestContext, input: AuthorizeMcpInvocationRequest) {
    const job = await this.store.getJobById(input.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${input.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId, 'editor')
    if (job.userId !== input.userId || job.workspaceId !== input.workspaceId || job.sessionId !== input.sessionId) {
      throw createHttpError(400, 'MCP_INVOCATION_CONTEXT_MISMATCH', 'MCP invocation context does not match the design job.')
    }
    if (input.variationId) {
      const variation = await this.store.getVariationById(input.variationId)
      if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${input.variationId}`)
      if (variation.jobId !== job.id || variation.sessionId !== job.sessionId) {
        throw createHttpError(400, 'MCP_INVOCATION_VARIATION_MISMATCH', 'MCP invocation variation does not belong to the design job.')
      }
    }

    const templateRequirements = normalizeTemplateRequirements(job.templateRequirements)
    const capabilitySnapshot = templateRequirements?.capabilitySnapshot
    if (!capabilitySnapshot) throw createHttpError(409, 'MCP_POLICY_MISSING', 'Design job does not include an MCP tool policy.')

    const request = {
      ...input,
      invocationId: input.invocationId ?? createId('mcpinv'),
      mode: input.mode ?? 'authorized_invocation',
      requestedAt: input.requestedAt ?? new Date().toISOString(),
    }
    const authorization = authorizeMcpInvocation(capabilitySnapshot, request)
    const completedAt = new Date().toISOString()
    const result = mcpAuthorizationResult(request, authorization, completedAt)
    const policySnapshotHash = mcpPolicySnapshotHash(capabilitySnapshot.plugins.pluginSnapshot ?? null)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: authorization.status === 'authorized' ? 'mcp.invocation.authorized' : 'mcp.invocation.denied',
      targetType: 'mcp_invocation',
      targetId: request.invocationId,
      reason: request.reason,
      metadata: {
        jobId: job.id,
        variationId: request.variationId ?? null,
        mcpToolId: request.mcpToolId,
        mode: request.mode,
        request,
        authorization: auditAuthorizationMetadata(authorization),
      },
    })
    const invocationAuditRecord = await this.store.saveMcpInvocationAuditRecord({
      invocationId: request.invocationId,
      request,
      result,
      policySnapshotHash,
      runtimeContractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
      replayKey: `mcp-replay:${request.invocationId}`,
      createdAt: request.requestedAt,
      completedAt,
    })

    return {
      invocationId: request.invocationId,
      status: authorization.status,
      ...(authorization.status === 'denied' ? { code: authorization.code, message: authorization.message } : {}),
      request,
      audit,
      invocationAuditRecord,
    }
  }

  async executeMcpInvocation(ctx: RequestContext, input: AuthorizeMcpInvocationRequest): Promise<ExecuteMcpInvocationResponse> {
    const authorizationResponse = await this.authorizeMcpInvocation(ctx, input)
    if (authorizationResponse.status === 'denied') {
      return {
        ...authorizationResponse,
        result: authorizationResponse.invocationAuditRecord.result,
        toolContext: null,
      }
    }

    const rawResult = await this.mcpExecutor.execute(authorizationResponse.request)
    const result = await this.persistMcpCapabilityArtifacts(authorizationResponse.request, rawResult)
    const invocationAuditRecord = await this.store.saveMcpInvocationAuditRecord({
      ...authorizationResponse.invocationAuditRecord,
      result,
      completedAt: result.completedAt,
    })
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: result.status === 'ok' ? 'mcp.invocation.executed' : 'mcp.invocation.unavailable',
      targetType: 'mcp_invocation',
      targetId: authorizationResponse.invocationId,
      reason: authorizationResponse.request.reason,
      metadata: {
        jobId: authorizationResponse.request.jobId,
        variationId: authorizationResponse.request.variationId ?? null,
        mcpToolId: authorizationResponse.request.mcpToolId,
        mode: authorizationResponse.request.mode,
        result,
      },
    })
    if (result.status === 'unavailable') {
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.runtime_warning',
        sessionId: authorizationResponse.request.sessionId,
        jobId: authorizationResponse.request.jobId,
        variationId: authorizationResponse.request.variationId,
        payload: {
          severity: 'warn',
          code: result.error?.code ?? 'MCP_UNAVAILABLE',
          message: result.error?.message ?? result.summary,
        },
      }))
    }

    return {
      ...authorizationResponse,
      audit,
      invocationAuditRecord,
      result,
      toolContext: mcpToolPromptContext(result),
    }
  }

  async replayMcpInvocation(ctx: RequestContext, replayKey: string): Promise<ReplayMcpInvocationResponse> {
    const invocationAuditRecord = await this.store.getMcpInvocationAuditRecordByReplayKey(replayKey)
    if (!invocationAuditRecord) throw createHttpError(404, 'MCP_REPLAY_NOT_FOUND', `MCP replay record not found: ${replayKey}`)
    const job = await this.store.getJobById(invocationAuditRecord.request.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${invocationAuditRecord.request.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId, 'viewer')
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole ?? 'support',
      action: 'mcp.invocation.replayed',
      targetType: 'mcp_invocation',
      targetId: invocationAuditRecord.invocationId,
      reason: 'Replay MCP invocation from audit record.',
      metadata: {
        replayKey,
        jobId: invocationAuditRecord.request.jobId,
        variationId: invocationAuditRecord.request.variationId ?? null,
        mcpToolId: invocationAuditRecord.request.mcpToolId,
        resultStatus: invocationAuditRecord.result.status,
      },
    })
    return {
      invocationId: invocationAuditRecord.invocationId,
      replayKey: invocationAuditRecord.replayKey,
      request: invocationAuditRecord.request,
      result: invocationAuditRecord.result,
      invocationAuditRecord,
      toolContext: mcpToolPromptContext(invocationAuditRecord.result),
      audit,
    }
  }

  async getVariationDetail(ctx: RequestContext, variationId: string) {
    const snapshot = await this.store.getVariationDetailSnapshot(variationId)
    if (!snapshot) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const { variation, job, currentArtifact, artifacts } = snapshot
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId, 'viewer')
    const templateRequirements = normalizeTemplateRequirements(job.templateRequirements)
    const variationTemplatePack = assignedTemplatePackForVariation(variation.index, templateRequirements?.variationTemplateAssignments ?? [])
    const capabilityNotices = (await this.store.listMcpInvocationAuditRecords({ variationId, limit: 5 }))
      .map(record => record.result)
      .filter(result => result.status !== 'ok')
    return {
      variation: {
        ...variation,
        screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
        designTemplatePack: variationTemplatePack,
      },
      job: {
        id: job.id,
        prompt: job.prompt,
        status: job.status,
        capabilitySnapshot: templateRequirements?.capabilitySnapshot ?? null,
        designTemplatePacks: templateRequirements?.designTemplatePacks ?? [],
      },
      currentArtifact: currentArtifact
        ? {
          id: currentArtifact.id,
          kind: currentArtifact.kind,
          version: currentArtifact.version,
          entryPath: currentArtifact.entryPath,
          parentArtifactId: currentArtifact.parentArtifactId,
          screenshotDevice: currentArtifact.kind === 'screenshot' ? screenshotDeviceFromArtifact(currentArtifact) : null,
          url: currentArtifact.kind === 'screenshot' ? screenshotUrlForArtifact(currentArtifact) : null,
          createdAt: currentArtifact.createdAt,
          quality: artifactQualitySummary(currentArtifact.metadata.quality),
        }
        : null,
      artifacts: artifacts.map(artifact => ({
        id: artifact.id,
        kind: artifact.kind,
        version: artifact.version,
        entryPath: artifact.entryPath,
        parentArtifactId: artifact.parentArtifactId,
        isCurrent: artifact.id === variation.currentArtifactId,
        exportedFromArtifactId: artifact.kind === 'export_zip' ? artifact.parentArtifactId : null,
        screenshotDevice: artifact.kind === 'screenshot' ? screenshotDeviceFromArtifact(artifact) : null,
        url: artifact.kind === 'screenshot' ? screenshotUrlForArtifact(artifact) : null,
        createdAt: artifact.createdAt,
        quality: artifactQualitySummary(artifact.metadata.quality),
      })),
      capabilityNotices,
    }
  }

  async restoreVariationVersion(ctx: RequestContext, variationId: string, artifactId: string) {
    const context = await this.store.getVariationArtifactContext(variationId, artifactId)
    const variation = context.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const artifact = context.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    if (context.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (artifact.kind !== 'html') {
      throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Only HTML artifact versions can be restored.')
    }
    const previewUrl = `/api/variations/${variationId}/preview`
    const updated = await this.store.setVariationCurrentArtifact(variationId, artifact.id, previewUrl)
    if (!updated) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.enqueueScreenshotJob({
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      variation: updated,
      htmlArtifactId: artifact.id,
      source: 'repair',
      reason: 'restore_requested',
      jobId: updated.jobId,
    })
    await this.store.appendMessage({
      sessionId: variation.sessionId,
      role: 'system',
      content: `Restored ${variation.title ?? variation.id} to artifact v${artifact.version}.`,
      metadata: {
        kind: 'variation_restore',
        variationId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
      },
    })
    return {
      variation: {
        id: updated.id,
        currentArtifactId: artifact.id,
        previewUrl: updated.previewUrl,
      },
      artifact: {
        id: artifact.id,
        kind: 'html' as const,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
      },
    }
  }

  async repairVariationPreview(ctx: RequestContext, variationId: string, input: { artifactId?: string | null } = {}) {
    const snapshot = input.artifactId
      ? await this.store.getVariationArtifactContext(variationId, input.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    if (snapshot.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    const artifact = snapshot.artifact
    if (!artifact) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an HTML artifact to repair.')
    if (artifact.kind !== 'html') {
      throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Preview repair requires an HTML artifact.')
    }
    await this.readArtifactHtml(artifact.storageKey)
    const previewUrl = `/api/variations/${encodeURIComponent(variationId)}/preview`
    const updated = variation.currentArtifactId === artifact.id
      ? await this.store.setVariationCurrentArtifact(variationId, artifact.id, previewUrl)
      : variation
    const queueJob = await this.enqueueScreenshotJob({
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      variation,
      htmlArtifactId: artifact.id,
      source: 'repair',
      reason: 'repair_requested',
      jobId: variation.jobId,
    })
    await this.store.appendMessage({
      sessionId: variation.sessionId,
      role: 'system',
      content: `Queued preview repair for ${variation.title ?? variation.id} artifact v${artifact.version}.`,
      metadata: {
        kind: 'variation_preview_repair',
        variationId,
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        queueJobIdempotencyKey: queueJob.idempotencyKey,
      },
    })
    return {
      variation: {
        id: variation.id,
        currentArtifactId: updated?.currentArtifactId ?? variation.currentArtifactId ?? artifact.id,
        previewUrl: updated?.previewUrl ?? variation.previewUrl ?? previewUrl,
        screenshotUrl: screenshotUrlForArtifactId(updated?.screenshotArtifactId ?? variation.screenshotArtifactId, variation.id),
      },
      artifact: {
        id: artifact.id,
        kind: 'html' as const,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
        quality: artifactQualitySummary(artifact.metadata.quality),
      },
      queueJob: {
        idempotencyKey: queueJob.idempotencyKey,
        kind: 'screenshot_job' as const,
        status: queueJob.status,
      },
    }
  }

  async reviewVariationAction(ctx: RequestContext, variationId: string, input: ReviewVariationActionRequest) {
    const snapshot = input.artifactId
      ? await this.store.getVariationArtifactContext(variationId, input.artifactId)
      : await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    if (snapshot.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }

    const action = input.action
    if (action !== 'confirm_repair' && action !== 'skip') {
      throw createHttpError(400, 'REVIEW_ACTION_UNSUPPORTED', 'Unsupported review action.')
    }

    const artifact = snapshot.artifact
    if (action === 'confirm_repair') {
      if (!artifact) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an HTML artifact to repair.')
      if (artifact.kind !== 'html') {
        throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Review repair requires an HTML artifact.')
      }
      const context = await this.store.getVariationRefineContext(variationId, artifact.id)
      if (!context) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
      if (!context.job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
      const quality = artifactQualitySummary(artifact.metadata.quality)
      const issues = quality?.issues.length ? quality.issues : ['The generated artifact needs to be brought back into the product specification.']
      const attempt = Math.max(1, artifact.version)
      const prompt = buildAutomationRepairPrompt({
        issues,
        specFindings: specFindingsFromArtifactMetadata(artifact.metadata),
        originalPrompt: context.job.prompt,
        templateSummary: automationTemplateSummaryForVariation(context.variation.index, context.job.templateRequirements),
      })
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.loop_repair_planned',
        sessionId: variation.sessionId,
        jobId: variation.jobId,
        variationId,
        payload: {
          artifactId: artifact.id,
          attempt,
          reason: 'review_confirmed',
          promptPreview: automationRepairPromptPreview(prompt),
        },
      }))
      await this.enqueueAutomationLoopRepair({
        sessionId: variation.sessionId,
        job: context.job,
        variation: context.variation,
        artifact,
        prompt,
        attempt,
      })
      const idempotencyKey = automationRepairQueueIdempotencyKey(artifact.id, attempt)
      await this.store.appendMessage({
        sessionId: variation.sessionId,
        role: 'system',
        content: `Queued spec review repair for ${variation.title ?? variation.id} artifact v${artifact.version}.`,
        metadata: {
          kind: 'variation_review_action',
          action,
          variationId,
          artifactId: artifact.id,
          artifactVersion: artifact.version,
          queueJobIdempotencyKey: idempotencyKey,
          note: input.note ?? null,
        },
      })
      return {
        action,
        status: 'repair_queued' as const,
        variation: {
          id: variation.id,
          currentArtifactId: variation.currentArtifactId,
          previewUrl: variation.previewUrl,
          screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
        },
        artifact: {
          id: artifact.id,
          kind: 'html' as const,
          version: artifact.version,
          entryPath: artifact.entryPath,
          createdAt: artifact.createdAt,
          quality,
        },
        queueJob: {
          idempotencyKey,
          kind: 'automation_refine_job' as const,
          status: 'queued' as const,
        },
        message: 'Repair request queued.',
      }
    }

    await this.store.appendMessage({
      sessionId: variation.sessionId,
      role: 'system',
      content: `Skipped spec review repair for ${variation.title ?? variation.id}${artifact ? ` artifact v${artifact.version}` : ''}.`,
      metadata: {
        kind: 'variation_review_action',
        action,
        variationId,
        artifactId: artifact?.id ?? null,
        artifactVersion: artifact?.version ?? null,
        note: input.note ?? null,
      },
    })
    return {
      action,
      status: 'skipped' as const,
      variation: {
        id: variation.id,
        currentArtifactId: variation.currentArtifactId,
        previewUrl: variation.previewUrl,
        screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
      },
      artifact: artifact && artifact.kind === 'html'
        ? {
          id: artifact.id,
          kind: 'html' as const,
          version: artifact.version,
          entryPath: artifact.entryPath,
          createdAt: artifact.createdAt,
          quality: artifactQualitySummary(artifact.metadata.quality),
        }
        : null,
      message: 'Review repair skipped.',
    }
  }

  async refineVariation(ctx: RequestContext, variationId: string, input: RefineVariationRequest) {
    const context = await this.store.getVariationRefineContext(variationId, input.baseArtifactId)
    if (!context) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const { variation, job, session, workspace, baseArtifact } = context
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    await this.requireJobAccess(job.id, ctx.userId, 'editor')
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${variation.sessionId}`)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    if (!input.prompt.trim()) throw createHttpError(400, 'INVALID_PROMPT', 'prompt is required.')
    if (!baseArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.baseArtifactId}`)
    const baseArtifactHtml = await this.readArtifactHtml(baseArtifact.storageKey)
    const modelContext = modelContextFromTemplateRequirements(job.templateRequirements)

    await this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        kind: 'variation_refine',
        variationId,
        baseArtifactId: input.baseArtifactId,
        deviceContext: input.deviceContext ?? null,
      },
    })

    for await (const event of this.runtime.refineVariation({
      userId: session.userId,
      workspaceId: workspace.id,
      sessionId: session.id,
      jobId: job.id,
      variationId,
      variationIndex: variation.index,
      runtimeChildSessionId: variation.runtimeChildSessionId,
      runtimeLaneId: variation.runtimeLaneId,
      baseArtifactId: input.baseArtifactId,
      baseArtifactHtml,
      baseArtifactEntryPath: baseArtifact.entryPath,
      baseArtifactVersion: baseArtifact.version,
      prompt: input.prompt,
      annotationPromptSuffix: input.annotationPromptSuffix,
      workspaceRoot: workspace.storageKey,
      deviceContext: input.deviceContext,
      modelServiceId: modelContext.modelServiceId,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
    })) {
      await this.applyEventSideEffects(event)
      await this.publishDesignEvent(event)
    }

    const current = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const updated = current.variation!
    const artifact = current.artifact
    return {
      variation: {
        id: updated.id,
        status: updated.status,
        currentArtifactId: updated.currentArtifactId,
        previewUrl: updated.previewUrl,
        screenshotUrl: screenshotUrlForArtifactId(updated.screenshotArtifactId, updated.id),
      },
      ...(artifact && {
        artifact: {
          id: artifact.id,
          version: artifact.version,
          entryPath: artifact.entryPath,
        },
      }),
    }
  }

  async annotateVariation(ctx: RequestContext, variationId: string, input: CreateAnnotationBatchRequest) {
    const context = await this.store.getVariationArtifactContext(variationId, input.artifactId)
    const variation = context.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const artifact = context.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
    if (context.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (!Array.isArray(input.shapes) || input.shapes.length === 0) {
      throw createHttpError(400, 'ANNOTATION_REQUIRED', 'At least one annotation shape is required.')
    }
    const promptSuffix = buildAnnotationPrompt(input.shapes, input.prompt)
    const batch = await this.store.createAnnotationBatch({
      variationId,
      artifactId: input.artifactId,
      userId: ctx.userId,
      shapes: input.shapes,
      promptSuffix,
    })
    const refined = await this.refineVariation(ctx, variationId, {
      prompt: promptSuffix,
      baseArtifactId: input.artifactId,
      annotationPromptSuffix: promptSuffix,
    })
    return {
      ...refined,
      annotationBatch: {
        id: batch.id,
        shapeCount: input.shapes.length,
        promptSuffix,
      },
    }
  }

  async getVariationPreview(
    ctx: RequestContext,
    variationId: string,
    options: { artifactId?: string | null } = {},
  ): Promise<string> {
    return this.artifactService.getVariationPreview(ctx, variationId, options)
  }

  async getVariationAsset(
    ctx: RequestContext,
    variationId: string,
    assetPath: string,
    options: { artifactId?: string | null } = {},
  ): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    return this.artifactService.getVariationAsset(ctx, variationId, assetPath, options)
  }

  async getVariationScreenshot(ctx: RequestContext, variationId: string, screenshotArtifactId: string): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    return this.artifactService.getVariationScreenshot(ctx, variationId, screenshotArtifactId)
  }

  async getVariationFiles(ctx: RequestContext, variationId: string, options: { artifactId?: string | null } = {}) {
    return this.artifactService.getVariationFiles(ctx, variationId, options)
  }

  async getSharedVariationAsset(token: string, assetPath: string): Promise<{
    contentType: string
    body: Uint8Array
  }> {
    return this.artifactService.getSharedVariationAsset(token, assetPath)
  }

  async exportVariation(ctx: RequestContext, variationId: string) {
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    const job = await this.store.getJobById(variation.jobId)
    const html = await this.readArtifactHtml(artifact.storageKey)
    const filename = `${variation.title ?? variation.id}-v${artifact.version}.html`.replaceAll(/\s+/g, '-').toLowerCase()
    const existingExportArtifact = await this.findExistingExportArtifact(variation.id, artifact.id)
    const exportArtifact = existingExportArtifact ?? await this.createExportZipArtifact({
      variation,
      sourceArtifact: artifact,
      filename: filename.replace(/\.html$/, '.zip'),
      html,
    })
    await this.recordUsageEvent({
      idempotencyKey: `usage:export.created:export:${exportArtifact.id}:source:${artifact.id}`,
      kind: 'export.created',
      userId: ctx.userId,
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      jobId: variation.jobId,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      metadata: {
        artifactVersion: artifact.version,
        exportArtifactId: exportArtifact.id,
        jobStatus: job?.status ?? null,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        version: artifact.version,
        filename,
        html,
      },
      exportArtifact: {
        id: exportArtifact.id,
        kind: 'export_zip',
        filename: exportArtifact.entryPath ?? filename.replace(/\.html$/, '.zip'),
        sizeBytes: exportArtifact.sizeBytes,
        contentHash: exportArtifact.contentHash,
        downloadUrl: `/api/artifacts/${encodeURIComponent(exportArtifact.id)}/download`,
        files: Array.isArray(exportArtifact.metadata.files) ? exportArtifact.metadata.files as string[] : [],
        reused: Boolean(existingExportArtifact),
      },
    }
  }

  async downloadArtifact(ctx: RequestContext, artifactId: string): Promise<{
    filename: string
    contentType: string
    body: Uint8Array
  }> {
    return this.artifactService.downloadArtifact(ctx, artifactId)
  }

  async shareVariation(ctx: RequestContext, variationId: string, input: ShareVariationRequest) {
    await this.requireVariationAccess(variationId, ctx.userId, 'editor')
    const { variation, artifact } = await this.requireCurrentVariationArtifact(variationId)
    if (!['public', 'private', 'password'].includes(input.visibility)) {
      throw createHttpError(400, 'INVALID_SHARE_VISIBILITY', 'visibility must be public, private, or password.')
    }
    const share = await this.store.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: ctx.userId,
      visibility: input.visibility,
      expiresAt: input.expiresAt ?? null,
    })
    await this.recordUsageEvent({
      idempotencyKey: `usage:share.created:share:${share.id}`,
      kind: 'share.created',
      userId: ctx.userId,
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      jobId: variation.jobId,
      variationId: variation.id,
      artifactId: artifact.id,
      inputTokens: 0,
      outputTokens: 0,
      costCents: 0,
      metadata: {
        shareId: share.id,
        visibility: share.visibility,
        artifactVersion: artifact.version,
      },
    })
    return {
      share: {
        id: share.id,
        token: share.token,
        url: `/share/${share.token}`,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
      },
    }
  }

  async getSharedVariation(token: string) {
    return this.artifactService.getSharedVariation(token)
  }

  async revokeShare(ctx: RequestContext, token: string) {
    const share = await this.store.getShareByToken(token)
    if (!share) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    if (share.ownerId !== ctx.userId) {
      throw createHttpError(403, 'SHARE_FORBIDDEN', 'You do not have access to this share link.')
    }
    const revoked = await this.store.revokeShare(token)
    if (!revoked) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    return {
      share: {
        id: revoked.id,
        token: revoked.token,
        revokedAt: revoked.revokedAt!,
      },
    }
  }

  async getAdminRuntimeHealth(ctx: RequestContext) {
    return this.adminRuntimeGovernance.getRuntimeHealth(ctx)
  }

  async rollbackAdminRuntimeConfig(ctx: RequestContext, input: { reason?: string | null } = {}) {
    return this.adminRuntimeGovernance.requestRuntimeRollback(ctx, input)
  }

  async listAuditLogs(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    return {
      auditLogs: this.store.listAuditLogs(),
    }
  }

  async listAdminMcpInvocationAudits(ctx: RequestContext, filter: {
    jobId?: string | null
    variationId?: string | null
    mcpToolId?: string | null
    status?: McpInvocationResult['status'] | null
    limit?: number | null
  } = {}): Promise<AdminMcpInvocationAuditResponse> {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const limit = clampInteger(filter.limit ?? 50, 1, 200)
    const records = await this.store.listMcpInvocationAuditRecords({
      jobId: cleanFilterValue(filter.jobId),
      variationId: cleanFilterValue(filter.variationId),
      mcpToolId: cleanFilterValue(filter.mcpToolId),
      limit: filter.status ? 200 : limit,
    })
    const status = validMcpInvocationStatus(filter.status) ? filter.status : null
    return {
      invocations: records
        .filter(record => !status || record.result.status === status)
        .slice(0, limit)
        .map(adminMcpInvocationAuditEntry),
      filters: {
        jobId: cleanFilterValue(filter.jobId) ?? null,
        variationId: cleanFilterValue(filter.variationId) ?? null,
        mcpToolId: cleanFilterValue(filter.mcpToolId) ?? null,
        status,
        limit,
      },
    }
  }

  async getAdminMcpInvocationSummary(ctx: RequestContext, filter: {
    mcpToolId?: string | null
    createdFrom?: string | null
    createdTo?: string | null
    limit?: number | null
  } = {}): Promise<AdminMcpInvocationSummaryResponse> {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    const limit = clampInteger(filter.limit ?? 1000, 1, 1000)
    const mcpToolId = cleanFilterValue(filter.mcpToolId)
    const createdFrom = cleanFilterValue(filter.createdFrom)
    const createdTo = cleanFilterValue(filter.createdTo)
    const records = await this.store.listMcpInvocationAuditRecords({
      mcpToolId,
      limit,
    })
    const scopedRecords = records.filter(record => recordInIsoRange(record.completedAt, createdFrom, createdTo))
    return {
      totals: mcpInvocationTotals(scopedRecords),
      tools: mcpToolHealthSummaries(scopedRecords),
      democase: democaseMcpHealthSummary(scopedRecords),
      filters: {
        mcpToolId: mcpToolId ?? null,
        createdFrom: createdFrom ?? null,
        createdTo: createdTo ?? null,
        limit,
      },
    }
  }

  async listAdminJobs(ctx: RequestContext, filter: {
    status?: string | null
    userId?: string | null
    workspaceId?: string | null
    sessionId?: string | null
    createdFrom?: string | null
    createdTo?: string | null
  } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.listAdminJobs(filter)
  }

  async listAdminArtifacts(ctx: RequestContext, filter: { jobId?: string | null; variationId?: string | null; kind?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.listAdminArtifacts(filter)
  }

  async rebuildArtifactScreenshotAsAdmin(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    if (artifact.kind !== 'html') throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Screenshot rebuild requires an HTML artifact.')
    if (!artifact.variationId) throw createHttpError(400, 'ARTIFACT_VARIATION_MISSING', 'Artifact is not attached to a variation.')
    const variation = await this.store.getVariationById(artifact.variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${artifact.variationId}`)
    const queueJob = await this.enqueueScreenshotJob({
      workspaceId: artifact.workspaceId,
      sessionId: artifact.sessionId,
      variation,
      htmlArtifactId: artifact.id,
      source: 'repair',
      reason: 'repair_requested',
      jobId: variation.jobId,
    })
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.screenshot_rebuild',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: artifact.variationId,
        queueJobIdempotencyKey: queueJob.idempotencyKey,
        queueJobStatus: queueJob.status,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        version: artifact.version,
        screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
      },
      queueJob: {
        idempotencyKey: queueJob.idempotencyKey,
        kind: queueJob.kind,
        status: queueJob.status,
      },
      variation: {
        id: variation.id,
        screenshotUrl: screenshotUrlForArtifactId(variation.screenshotArtifactId, variation.id),
      },
      audit,
    }
  }

  async repairExportArtifactAsAdmin(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    const sourceArtifact = await this.resolveExportRepairSourceArtifact(artifact)
    if (!sourceArtifact.variationId) throw createHttpError(400, 'ARTIFACT_VARIATION_MISSING', 'Export repair source is not attached to a variation.')
    const variation = await this.store.getVariationById(sourceArtifact.variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${sourceArtifact.variationId}`)
    const html = await this.readArtifactHtml(sourceArtifact.storageKey)
    const filename = `${variation.title ?? variation.id}-v${sourceArtifact.version}.zip`.replaceAll(/\s+/g, '-').toLowerCase()
    const exportArtifact = await this.createExportZipArtifact({
      variation,
      sourceArtifact,
      filename,
      html,
      reuseKey: createId('repair_export'),
    })
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.export_repair',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: variation.id,
        sourceArtifactId: sourceArtifact.id,
        exportArtifactId: exportArtifact.id,
        repairedFromKind: artifact.kind,
      },
    })
    return {
      sourceArtifact: {
        id: sourceArtifact.id,
        version: sourceArtifact.version,
      },
      exportArtifact: {
        id: exportArtifact.id,
        kind: 'export_zip',
        filename: exportArtifact.entryPath ?? filename,
        sizeBytes: exportArtifact.sizeBytes,
        contentHash: exportArtifact.contentHash,
        downloadUrl: `/api/artifacts/${encodeURIComponent(exportArtifact.id)}/download`,
        files: Array.isArray(exportArtifact.metadata.files) ? exportArtifact.metadata.files as string[] : [],
      },
      audit,
    }
  }

  async revokeArtifactSharesAsAdmin(ctx: RequestContext, artifactId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    const shares = await this.store.listSharesForArtifact(artifact.id)
    const activeShares = shares.filter(share => !share.revokedAt)
    const revoked = []
    for (const share of activeShares) {
      const next = await this.store.revokeShare(share.token)
      if (next) revoked.push(next)
    }
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'artifact.shares_revoke',
      targetType: 'artifact',
      targetId: artifact.id,
      reason: input.reason ?? null,
      metadata: {
        variationId: artifact.variationId,
        revokedCount: revoked.length,
        totalShareCount: shares.length,
      },
    })
    return {
      artifact: {
        id: artifact.id,
        shareCount: shares.length,
      },
      revokedShares: revoked.map(share => ({
        id: share.id,
        token: share.token,
        revokedAt: share.revokedAt!,
      })),
      revokedCount: revoked.length,
      audit,
    }
  }

  async getAdminUserSupport(ctx: RequestContext, filter: { userId?: string | null; email?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.getAdminUserSupport(filter)
  }

  async getAdminMemoryGovernance(ctx: RequestContext, filter: { userId?: string | null; email?: string | null } = {}) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.getAdminMemoryGovernance(filter)
  }

  async getAdminCostSummary(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    return this.store.getAdminCostSummary()
  }

  async listAdminModels(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    return this.store.listAdminModels()
  }

  async listAdminTemplateGovernance(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    await this.ensureCapabilityGovernanceReady()
    const templates = await this.store.listDesignTemplatePacks(ctx.userId)
    const entries = templates.map(adminTemplateGovernanceEntry)
    const capabilities = listCapabilities(this.capabilityGovernanceOptions())
    const registryAssets = adminCapabilityRegistryAssets(capabilities, entries)
    const usageEvents = this.store.listUsageEvents({ limit: 5000 })
    const auditLogs = ctx.adminRole === 'support' ? [] : this.store.listAuditLogs({ limit: 500 })
    const mcpSummary = await this.getAdminMcpInvocationSummary(ctx, { limit: 1000 })
    const skillGovernance = capabilities.skills.map(skill => adminSkillGovernanceEntry(
      skill,
      capabilities.plugins,
      usageEvents,
      auditLogs,
    ))
    const mcpPluginGovernance = capabilities.mcpToolBindings.map(binding => adminMcpPluginGovernanceEntry(
      binding,
      capabilities.plugins,
      mcpSummary.tools.find(tool => tool.mcpToolId === binding.id) ?? null,
      usageEvents,
      auditLogs,
    ))
    const automationLoopGovernance = capabilities.automationLoopProfiles.map(loop => adminAutomationLoopGovernanceEntry(loop, usageEvents, auditLogs))
    const totals = entries.reduce(
      (acc, entry) => {
        acc.total += 1
        acc[entry.lintStatus] += 1
        if (entry.category === 'business-template-package') acc.businessTemplatePackages += 1
        if (entry.source === 'official') acc.official += 1
        if (entry.source !== 'official') acc.privateOrWorkspace += 1
        return acc
      },
      { total: 0, official: 0, privateOrWorkspace: 0, businessTemplatePackages: 0, passed: 0, warning: 0, failed: 0 },
    )
    return {
      templates: entries,
      totals,
      privateTemplates: adminPrivateTemplateSummary(entries),
      dynamicEncyclopedia: adminDynamicEncyclopediaGovernance(capabilities, templates),
      registryAssets,
      skillGovernance,
      mcpPluginGovernance,
      automationLoopGovernance,
      registryTotals: registryAssets.reduce(
        (acc, asset) => {
          acc.total += 1
          acc[asset.type] = (acc[asset.type] ?? 0) + 1
          acc[asset.status] += 1
          return acc
        },
        {
          total: 0,
          active: 0,
          warning: 0,
          blocked: 0,
        } as Record<string, number>,
      ),
      governance: {
        canEditRegistry: ctx.adminRole === 'developer',
        canPublish: ctx.adminRole === 'operator' || ctx.adminRole === 'developer',
        writeMode: 'enabled' as const,
        auditMode: ctx.adminRole === 'support' ? 'restricted' as const : 'visible' as const,
        writeAuditAction: 'capability.governance.change',
        message: 'Risk plugin disable/enable is active and audited. Template publish/version actions remain planned.',
      },
      quality: adminCapabilityQualitySummary(entries, skillGovernance, mcpPluginGovernance, automationLoopGovernance, auditLogs),
    }
  }

  async updateAdminCapabilityPluginGovernance(
    ctx: RequestContext,
    pluginId: string,
    input: { status?: CapabilityPlugin['status']; reason?: string | null } = {},
  ) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    await this.ensureCapabilityGovernanceReady()
    const basePlugin = listCapabilities().plugins.find(plugin => plugin.id === pluginId)
    if (!basePlugin) throw createHttpError(404, 'CAPABILITY_PLUGIN_NOT_FOUND', `Capability plugin not found: ${pluginId}`)
    const nextStatus = input.status
    if (nextStatus !== 'active' && nextStatus !== 'disabled') {
      throw createHttpError(400, 'CAPABILITY_PLUGIN_STATUS_INVALID', 'Capability plugin status must be active or disabled.')
    }
    const previousPlugin = listCapabilities(this.capabilityGovernanceOptions()).plugins.find(plugin => plugin.id === pluginId) ?? basePlugin
    await this.store.upsertCapabilityGovernanceOverride({
      pluginId,
      status: nextStatus,
      reason: input.reason ?? null,
      updatedByUserId: ctx.userId,
      updatedByRole: ctx.adminRole ?? null,
      metadata: {
        previousStatus: previousPlugin.status,
        nextStatus,
        pluginName: basePlugin.name,
        pluginType: basePlugin.type,
      },
    })
    this.setCapabilityPluginDisabled(pluginId, nextStatus === 'disabled')
    const capabilities = listCapabilities(this.capabilityGovernanceOptions())
    const plugin = capabilities.plugins.find(item => item.id === pluginId)
    if (!plugin) throw createHttpError(404, 'CAPABILITY_PLUGIN_NOT_FOUND', `Capability plugin not found: ${pluginId}`)
    const affectedSkills = capabilities.skills.filter(skill => skill.pluginId === pluginId).map(skill => skill.id)
    const affectedMcpToolBindings = capabilities.mcpToolBindings.filter(binding => binding.pluginId === pluginId).map(binding => binding.id)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'capability.governance.change',
      targetType: 'capability_plugin',
      targetId: pluginId,
      reason: input.reason ?? null,
      metadata: {
        previousStatus: previousPlugin.status,
        nextStatus: plugin.status,
        previousSafetyLevel: previousPlugin.safetyLevel,
        nextSafetyLevel: plugin.safetyLevel,
        pluginName: basePlugin.name,
        pluginType: basePlugin.type,
        affectedSkills,
        affectedMcpToolBindings,
        effect: plugin.status === 'disabled'
          ? 'selected jobs using this plugin will be rejected before runtime dispatch'
          : 'selected jobs using this plugin may resolve again',
      },
    })
    return {
      plugin,
      affectedSkills,
      affectedMcpToolBindings,
      audit,
    }
  }

  async syncAdminModels(ctx: RequestContext) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const runtimeModels = await this.runtime.listRuntimeModels()
    if (runtimeModels.discoveryStatus === 'unsupported') {
      const existing = await this.store.listAdminModels()
      const audit = await this.store.createAuditLog({
        requestId: ctx.requestId,
        operatorUserId: ctx.userId,
        operatorRole: ctx.adminRole!,
        action: 'model.sync.unsupported',
        targetType: 'model_service',
        targetId: 'runtime_discovery',
        reason: null,
        metadata: {
          runtimeDiscoveryStatus: 'unsupported',
          runtimeMessage: runtimeModels.message ?? null,
          runtimeVersion: runtimeModels.version,
        },
      })
      return {
        ...existing,
        createdCount: 0,
        updatedCount: 0,
        missingCount: 0,
        disabledMissingCount: 0,
        diff: [],
        runtime: {
          type: runtimeModels.type,
          discoveryStatus: runtimeModels.discoveryStatus,
          message: runtimeModels.message ?? null,
          version: runtimeModels.version,
          providerCount: 0,
          modelCount: 0,
          defaultModel: runtimeModels.defaultModel,
          activeProfile: runtimeModels.activeProfile ?? null,
          syncedAt: runtimeModels.syncedAt,
        },
        audit,
      }
    }
    const discovered = runtimeModelsToModelServices(runtimeModels)
    const result = await this.store.upsertDiscoveredModelServices(discovered)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'model.sync',
      targetType: 'model_service',
      targetId: 'runtime_discovery',
      reason: null,
      metadata: {
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        missingCount: result.missingCount,
        disabledMissingCount: result.disabledMissingCount,
        diffCount: result.diff.length,
        runtimeProviderCount: runtimeModels.providers.length,
        runtimeModelCount: discovered.length,
        runtimeDefaultModel: runtimeModels.defaultModel,
        runtimeVersion: runtimeModels.version,
      },
    })
    return {
      ...result,
      runtime: {
        type: runtimeModels.type,
        version: runtimeModels.version,
        providerCount: runtimeModels.providers.length,
        modelCount: discovered.length,
        defaultModel: runtimeModels.defaultModel,
        activeProfile: runtimeModels.activeProfile ?? null,
        syncedAt: runtimeModels.syncedAt,
      },
      audit,
    }
  }

  async updateAdminModel(ctx: RequestContext, modelServiceId: string, input: { enabled?: boolean; isDefault?: boolean }) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const model = await this.store.updateAdminModel(modelServiceId, input)
    if (!model) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'model.update',
      targetType: 'model_service',
      targetId: modelServiceId,
      reason: null,
      metadata: input,
    })
    return { model, audit }
  }

  async getAdminUserModelAccess(ctx: RequestContext, userId: string) {
    await this.requireAdminRole(ctx, ['support', 'operator', 'developer'])
    await this.requireUser(userId)
    return this.store.getAdminUserModelAccess(userId)
  }

  async updateUserModelAccess(
    ctx: RequestContext,
    userId: string,
    modelServiceId: string,
    input: { enabled?: boolean; dailyTokenLimit?: number | null; monthlyCostLimitCents?: number | null },
  ) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    await this.requireUser(userId)
    const model = await this.store.getModelServiceById(modelServiceId)
    if (!model) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    const access = await this.store.updateUserModelAccess(userId, modelServiceId, input)
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'user_model_access.update',
      targetType: 'user_model_access',
      targetId: access.id,
      reason: null,
      metadata: {
        userId,
        modelServiceId,
        ...input,
      },
    })
    return { access, audit }
  }

  async cancelJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string }) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (snapshot.job.status === 'completed' || snapshot.job.status === 'failed' || snapshot.job.status === 'cancelled') {
      throw createHttpError(409, 'JOB_NOT_CANCELLABLE', `Job ${jobId} is already ${snapshot.job.status}.`)
    }
	    const runtime = await this.runtime.cancelRuntimeJob({
	      jobId,
	      reason: input.reason,
	      variations: snapshot.variations
	        .filter(variation => variation.status !== 'completed' && variation.status !== 'failed' && variation.status !== 'cancelled')
	        .map(variation => ({
	          variationId: variation.id,
	          runtimeChildSessionId: variation.runtimeChildSessionId,
	          runtimeAgentJobId: variation.runtimeAgentJobId,
	        })),
	    })
    await this.store.setJobStatus(jobId, 'cancelled')
    for (const variation of snapshot.variations) {
      if (variation.status !== 'completed' && variation.status !== 'failed' && variation.status !== 'cancelled') {
        await this.store.applyVariationEvent({ variationId: variation.id, status: 'cancelled' })
      }
    }
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'job.cancel',
      targetType: 'design_job',
      targetId: jobId,
      reason: input.reason ?? null,
      metadata: {
        runtimeCancelled: runtime.cancelled,
        runtimeMessage: runtime.message,
      },
    })
    return {
      job: await this.store.getJobById(jobId),
      runtime,
      audit,
    }
  }

  async retryJobAsAdmin(ctx: RequestContext, jobId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const original = await this.store.getJobById(jobId)
    if (!original) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    const session = await this.store.getSessionById(original.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${original.sessionId}`)
    const retry = await this.createDesignJob(
      { ...ctx, userId: original.userId },
      {
        sessionId: original.sessionId,
        prompt: original.prompt,
        sourceMode: original.sourceMode,
        variationCount: original.variationCount,
        templateRequirements: normalizeTemplateRequirements(original.templateRequirements),
        modelServiceId: stringValue(original.templateRequirements.modelServiceId) ?? undefined,
      },
    )
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'job.retry',
      targetType: 'design_job',
      targetId: jobId,
      reason: input.reason ?? null,
      metadata: {
        retriedJobId: retry.job.id,
      },
    })
    return {
      retry,
      audit,
    }
  }

  async retryVariationAsAdmin(ctx: RequestContext, jobId: string, variationId: string, input: { reason?: string } = {}) {
    await this.requireAdminRole(ctx, ['operator', 'developer'])
    const original = await this.store.getJobById(jobId)
    if (!original) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    const variation = await this.store.getVariationById(variationId)
    if (!variation || variation.jobId !== jobId) {
      throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation ${variationId} not found for job ${jobId}.`)
    }
    const session = await this.store.getSessionById(original.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${original.sessionId}`)
    const templateRequirements = normalizeTemplateRequirements(original.templateRequirements)
    const retryNote = `Admin variation retry: job=${original.id}; variation=${variation.id}; index=${variation.index}.`
    const retry = await this.createDesignJob(
      { ...ctx, userId: original.userId },
      {
        sessionId: original.sessionId,
        prompt: original.prompt,
        sourceMode: original.sourceMode,
        variationCount: 1,
        templateRequirements: {
          ...templateRequirements,
          notes: templateRequirements?.notes ? `${templateRequirements.notes}\n${retryNote}` : retryNote,
        },
        modelServiceId: stringValue(original.templateRequirements.modelServiceId) ?? undefined,
      },
    )
    const audit = await this.store.createAuditLog({
      requestId: ctx.requestId,
      operatorUserId: ctx.userId,
      operatorRole: ctx.adminRole!,
      action: 'variation.retry',
      targetType: 'design_variation',
      targetId: variationId,
      reason: input.reason ?? null,
      metadata: {
        originalJobId: original.id,
        retriedJobId: retry.job.id,
        retryVariationCount: retry.job.variationCount,
      },
    })
    return {
      retry,
      audit,
    }
  }

  private async requireCurrentVariationArtifact(variationId: string) {
    const snapshot = await this.store.getCurrentVariationArtifactSnapshot(variationId)
    const variation = snapshot.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    if (!snapshot.artifactId) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const artifact = snapshot.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${snapshot.artifactId}`)
    if (snapshot.mismatch) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    return { variation, artifact }
  }

  private async requireUser(userId: string) {
    if (!userId) throw createHttpError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const user = await this.store.getUserById(userId)
    if (!user) throw createHttpError(401, 'UNAUTHENTICATED', `Unknown user: ${userId}`)
    if (user.status !== 'active') throw createHttpError(403, 'USER_DISABLED', `User disabled: ${userId}`)
    return user
  }

  private capabilityGovernanceOptions() {
    return {
      disabledPluginIds: this.disabledCapabilityPluginIds,
    }
  }

  private async loadCapabilityGovernanceOverrides(): Promise<void> {
    const overrides = await this.store.listCapabilityGovernanceOverrides()
    this.disabledCapabilityPluginIds.clear()
    for (const override of overrides) {
      this.setCapabilityPluginDisabled(override.pluginId, override.status === 'disabled')
    }
  }

  private async ensureCapabilityGovernanceReady(): Promise<void> {
    await this.capabilityGovernanceReady
  }

  private setCapabilityPluginDisabled(pluginId: string, disabled: boolean): void {
    if (disabled) {
      this.disabledCapabilityPluginIds.add(pluginId)
    } else {
      this.disabledCapabilityPluginIds.delete(pluginId)
    }
  }

  private async requireAdminRole(ctx: RequestContext, allowed: Array<NonNullable<RequestContext['adminRole']>>): Promise<void> {
    await this.requireUser(ctx.userId)
    if (!ctx.adminRole || !allowed.includes(ctx.adminRole)) {
      throw createHttpError(403, 'ADMIN_FORBIDDEN', 'This admin action requires a higher role.')
    }
  }

  private async requireWorkspaceAccess(workspaceId: string, userId: string, minRole: WorkspaceMemberRole = 'viewer'): Promise<void> {
    const allowed = await this.canAccessWorkspace(workspaceId, userId, minRole)
    if (!allowed) {
      throw createHttpError(403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.')
    }
  }

  private async canAccessWorkspace(workspaceId: string, userId: string, minRole: WorkspaceMemberRole = 'viewer'): Promise<boolean> {
    const workspace = await this.store.getWorkspaceById(workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    const member = await this.store.getWorkspaceMember(workspaceId, userId)
    const effectiveRole = member?.status === 'active'
      ? member.role
      : workspace.ownerId === userId
        ? 'owner'
        : null
    return Boolean(effectiveRole && roleAllows(effectiveRole, minRole))
  }

  private async requireSessionAccess(sessionId: string, userId: string, minRole: WorkspaceMemberRole = 'viewer'): Promise<void> {
    const session = await this.store.getSessionById(sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    if (!await this.canAccessWorkspace(session.workspaceId, userId, minRole)) {
      throw createHttpError(403, 'SESSION_FORBIDDEN', 'You do not have access to this session.')
    }
  }

  private async requireJobAccess(jobId: string, userId: string, minRole: WorkspaceMemberRole = 'viewer'): Promise<void> {
    const job = await this.store.getJobById(jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    if (!await this.canAccessWorkspace(job.workspaceId, userId, minRole)) {
      throw createHttpError(403, 'JOB_FORBIDDEN', 'You do not have access to this design job.')
    }
  }

  private async requireVariationAccess(variationId: string, userId: string, minRole: WorkspaceMemberRole = 'viewer'): Promise<void> {
    const variation = await this.store.getVariationById(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    await this.requireJobAccess(variation.jobId, userId, minRole)
  }

  private async resolveUserModel(userId: string, requestedModelServiceId: string | null) {
    const options = await this.store.listUserModelOptions(userId)
    const modelServiceId = requestedModelServiceId ?? options.defaultModelId
    if (!modelServiceId) throw createHttpError(409, 'NO_MODEL_AVAILABLE', 'No model service is available for this user.')
    const allowed = await this.store.canUserUseModel(userId, modelServiceId)
    if (!allowed) throw createHttpError(403, 'MODEL_FORBIDDEN', 'This model is not enabled for this user.')
    const model = await this.store.getModelServiceById(modelServiceId)
    if (!model || !model.enabled) throw createHttpError(404, 'MODEL_NOT_FOUND', `Model service not found: ${modelServiceId}`)
    return model
  }

  private async requireReadableEncyclopediaGuidance(ctx: RequestContext, guidanceId: string): Promise<EncyclopediaEntryGuidance> {
    const guidance = await this.store.getEncyclopediaEntryGuidanceById(guidanceId)
    if (!guidance) throw createHttpError(404, 'ENTRY_GUIDANCE_NOT_FOUND', `Entry guidance not found: ${guidanceId}`)
    await this.requireWorkspaceAccess(guidance.workspaceId, ctx.userId, 'viewer')
    return guidance
  }

  private async toEncyclopediaEntryGuidanceResponse(
    userId: string,
    guidance: EncyclopediaEntryGuidance,
  ): Promise<EncyclopediaEntryGuidanceResponse> {
    const recommendedTemplates = await this.enrichDynamicEncyclopediaTemplateRecommendations(userId, guidance)
    const classificationVector = guidanceClassificationVector(guidance)
    const interactionParadigm = listCapabilities().interactionParadigms.find(candidate => candidate.id === guidance.interactionParadigmId)
      ?? listCapabilities().interactionParadigms.find(candidate => candidate.id === 'ip_entity_summary')
    if (!interactionParadigm) throw createHttpError(500, 'INTERACTION_PARADIGM_NOT_FOUND', 'Default interaction paradigm is missing.')
    return {
      guidanceId: guidance.id,
      productMode: guidance.productMode,
      status: guidance.status,
      requiresConfirmation: guidance.status === 'needs_confirmation',
      confirmedAt: guidance.confirmedAt,
      entry: {
        title: guidance.entryTitle,
        rawInput: guidance.rawInput,
        context: guidance.context,
      },
      isLanguageCategory: guidance.isLanguageCategory,
      entryContentLanguage: guidance.entryContentLanguage,
      classification: {
        primaryCategory: guidance.primaryCategory,
        secondaryCategory: guidance.secondaryCategory,
        tertiaryCategory: guidance.tertiaryCategory,
        confidence: guidance.confidence,
        signals: guidance.signals,
        source: 'mock_rules',
      },
      democaseReferences: guidanceDemocaseReferences(guidance),
      recommendedTemplates,
      interactionParadigm,
      capabilityRequirements: {
        template: {
          domainTemplateId: DYNAMIC_ENCYCLOPEDIA_PRESET.domainTemplateId,
          designTemplatePackIds: guidance.selectedTemplateIds,
          autoDistributeTemplatePacks: true,
        },
        plugins: {
          skillIds: [...DYNAMIC_ENCYCLOPEDIA_PRESET.skillIds],
          mcpToolIds: [...DYNAMIC_ENCYCLOPEDIA_PRESET.mcpToolIds],
        },
        automation: guidance.automationMode === 'off'
          ? {
              loopProfileId: 'loop_standard',
              maxRepairAttempts: 0,
            }
          : {
              loopProfileId: DYNAMIC_ENCYCLOPEDIA_PRESET.loopProfileId,
              maxRepairAttempts: guidance.automationMode === 'semi_auto' ? 1 : 2,
            },
      },
      templateRequirements: {
        designTemplatePackIds: guidance.selectedTemplateIds,
        interactionParadigm,
        deviceTargets: ['desktop', 'mobile'],
        notes: [
          `Dynamic encyclopedia entry: ${guidance.entryTitle}`,
          `Classification: ${guidance.primaryCategory} / ${guidance.secondaryCategory} / ${guidance.tertiaryCategory}`,
          'Use the selected child template recommendation as the generation direction.',
        ].join('\n'),
        businessContext: {
          guidanceId: guidance.id,
          entryTitle: guidance.entryTitle,
          entryPrimaryCategory: guidance.primaryCategory,
          entrySecondaryCategory: guidance.secondaryCategory,
          entryTertiaryCategory: guidance.tertiaryCategory,
          isLanguageCategory: guidance.isLanguageCategory,
          entryContentLanguage: guidance.entryContentLanguage,
          classification: {
            l1: guidance.primaryCategory,
            l2: guidance.secondaryCategory,
            l3: guidance.tertiaryCategory,
            confidence: guidance.confidence,
            signals: guidance.signals,
            source: 'mock_rules',
          },
          classificationVector,
          interactionParadigmId: guidance.interactionParadigmId,
          interactionParadigm,
          recommendedTemplateIds: guidance.selectedTemplateIds,
          childTemplates: recommendedTemplates.map(template => ({
            designTemplatePackId: template.designTemplatePackId,
            interactionParadigmId: template.interactionParadigmId,
            selected: template.selected,
            confidence: template.confidence,
            reason: template.reason,
          })),
          automationMode: guidance.automationMode,
          reviewMode: guidance.automationMode,
        },
      },
    }
  }

  private async withDynamicEncyclopediaGuidanceSnapshot(
    ctx: RequestContext,
    workspaceId: string,
    input: CreateDesignJobRequest,
  ): Promise<CreateDesignJobRequest> {
    const guidanceId = stringValue(input.templateRequirements?.businessContext?.guidanceId)
    if (!guidanceId) return input
    const guidance = await this.requireReadableEncyclopediaGuidance(ctx, guidanceId)
    if (guidance.workspaceId !== workspaceId) {
      throw createHttpError(400, 'ENTRY_GUIDANCE_WORKSPACE_MISMATCH', 'Entry guidance belongs to a different workspace.')
    }
    if (guidance.status === 'needs_confirmation') {
      throw createHttpError(409, 'ENTRY_GUIDANCE_NEEDS_CONFIRMATION', 'Entry guidance requires classification confirmation before creating a design job.')
    }
    const guidanceResponse = await this.toEncyclopediaEntryGuidanceResponse(ctx.userId, guidance)
    const templateRequirements = input.templateRequirements ?? {}
    return {
      ...input,
      productMode: guidanceResponse.productMode,
      capabilityRequirements: input.capabilityRequirements ?? guidanceResponse.capabilityRequirements,
      templateRequirements: {
        ...guidanceResponse.templateRequirements,
        ...templateRequirements,
        designTemplatePackIds: templateRequirements.designTemplatePackIds ?? guidanceResponse.templateRequirements.designTemplatePackIds,
        interactionParadigm: templateRequirements.interactionParadigm ?? guidanceResponse.templateRequirements.interactionParadigm,
        businessContext: {
          ...guidanceResponse.templateRequirements.businessContext,
          ...(templateRequirements.businessContext ?? {}),
          guidanceId: guidanceResponse.guidanceId,
        },
      },
    }
  }

  private async enrichDynamicEncyclopediaTemplateRecommendations(
    userId: string,
    guidance: EncyclopediaEntryGuidance,
  ): Promise<EncyclopediaEntryGuidanceResponse['recommendedTemplates']> {
    const templates = await this.store.listDesignTemplatePacks(userId, guidance.workspaceId)
    return guidance.recommendedTemplateIds.map((templateId, index) => {
      const template = templates.find(candidate => candidate.id === templateId)
      const recommendation = dynamicEncyclopediaTemplateRecommendation(templateId, `${guidance.primaryCategory} ${guidance.secondaryCategory}`)
      return {
        designTemplatePackId: templateId,
        name: template?.name ?? templateId,
        interactionParadigmId: interactionParadigmIdForTemplatePack(templateId) ?? guidance.interactionParadigmId,
        reason: recommendation.reason,
        confidence: recommendation.confidence,
        selected: guidance.selectedTemplateIds.includes(templateId) || (guidance.selectedTemplateIds.length === 0 && index === 0),
      }
    })
  }

  private async recommendDynamicEncyclopediaTemplates(
    userId: string,
    workspaceId: string | null,
    primaryCategory: string,
    secondaryCategory: string,
    maxTemplateRecommendations: number,
    democaseMatches: EncyclopediaDemocaseMatch[] = [],
  ): Promise<EncyclopediaEntryGuidanceResponse['recommendedTemplates']> {
    const categoryText = `${primaryCategory} ${secondaryCategory}`
    const democasePreferredIds = democaseMatches.flatMap(match => match.preferredTemplateIds)
    const rulePreferredIds = dynamicEncyclopediaRuleTemplateIds(categoryText)
    const preferredIds = [...new Set([...democasePreferredIds, ...rulePreferredIds])]
    const templates = await this.store.listDesignTemplatePacks(userId, workspaceId)
    const results: EncyclopediaEntryGuidanceResponse['recommendedTemplates'] = []

    for (const templateId of preferredIds) {
      const template = templates.find(candidate => candidate.id === templateId)
      if (!template) continue
      const recommendation = dynamicEncyclopediaTemplateRecommendation(template.id, categoryText)
      results.push({
        designTemplatePackId: template.id,
        name: template.name,
        interactionParadigmId: interactionParadigmIdForTemplatePack(template.id) ?? recommendedInteractionParadigmId(primaryCategory, secondaryCategory),
        reason: recommendation.reason,
        confidence: recommendation.confidence,
        selected: results.length < maxTemplateRecommendations,
      })
      if (results.length >= maxTemplateRecommendations) break
    }

    return results
  }

  private async resolveDesignTemplatePacksForJob(
    userId: string,
    workspaceId: string,
    input: CreateDesignJobRequest,
  ): Promise<DesignTemplatePack[]> {
    const explicitIds = [
      ...(input.templateRequirements?.designTemplatePackIds ?? []),
      ...(input.capabilityRequirements?.template?.designTemplatePackIds ?? []),
    ].filter((id, index, all) => typeof id === 'string' && id.trim().length > 0 && all.indexOf(id) === index)

    const resolved: DesignTemplatePack[] = []
    for (const templateId of explicitIds) {
      const template = await this.store.getDesignTemplatePackById(templateId, userId, workspaceId)
      if (!template) throw createHttpError(404, 'DESIGN_TEMPLATE_NOT_FOUND', `Design template not found: ${templateId}`)
      resolved.push(template)
    }

    const shouldAutoDistribute = input.capabilityRequirements?.template?.autoDistributeTemplatePacks
      ?? (explicitIds.length === 0 || input.productMode !== 'dynamic_encyclopedia_card')
    if (shouldAutoDistribute && resolved.length < input.variationCount) {
      const available = await this.store.listDesignTemplatePacks(userId, workspaceId)
      for (const template of available) {
        if (!templatePackSupportsProductMode(template, input.productMode)) continue
        if (resolved.some(existing => existing.id === template.id)) continue
        resolved.push(template)
        if (resolved.length >= input.variationCount) break
      }
    }

    if (
      input.productMode === 'dynamic_encyclopedia_card'
      && resolved.length > 0
      && resolved.length < input.variationCount
    ) {
      const dynamicOnly = resolved.filter(template => templatePackSupportsProductMode(template, input.productMode))
      return dynamicOnly.length > 0 ? dynamicOnly : resolved
    }

    return resolved.slice(0, Math.max(input.variationCount, explicitIds.length))
  }

  async processQueuedDesignJob(payload: DesignJobQueuePayload): Promise<void> {
    const sessionContext = await this.store.getSessionWorkspaceContext(payload.sessionId)
    if (!sessionContext) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${payload.sessionId}`)
    const { session, workspace } = sessionContext
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${session.workspaceId}`)
    const job = await this.store.getJobById(payload.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${payload.jobId}`)
    const modelContext = modelContextFromTemplateRequirements(job.templateRequirements)
    const variations = await Promise.all(payload.variationIds.map(id => this.store.getVariationById(id)))
    const variationIdsByIndex = new Map(
      variations
        .filter((variation): variation is DesignVariation => Boolean(variation))
        .map(variation => [variation.index, variation.id]),
    )
    const preparedTemplateRequirements = await this.prepareDynamicEncyclopediaGenerationContext({
      payload,
      job,
      variations: variations.filter((variation): variation is DesignVariation => Boolean(variation)),
      runtimeSessionId: session.runtimeSessionId,
    })
    await this.runMockJob({
      jobId: job.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      workspaceRoot: workspace.storageKey,
      prompt: job.prompt,
      sourceMode: job.sourceMode,
      productMode: job.productMode,
      sourceArtifactId: payload.sourceArtifactId,
      variationCount: job.variationCount,
      templateRequirements: normalizeTemplateRequirements(preparedTemplateRequirements ?? job.templateRequirements),
      modelServiceId: payload.modelServiceId ?? modelContext.modelServiceId ?? '',
      modelId: modelContext.modelId ?? '',
      modelProvider: modelContext.modelProvider ?? '',
      variationIdsByIndex,
    })
  }

  private async prepareDynamicEncyclopediaGenerationContext(input: {
    payload: DesignJobQueuePayload
    job: NonNullable<Awaited<ReturnType<ApplicationRepository['getJobById']>>>
    variations: DesignVariation[]
    runtimeSessionId: string | null
  }): Promise<Record<string, unknown> | null> {
    if (input.job.productMode !== 'dynamic_encyclopedia_card') return null
    const templateRequirements = normalizeTemplateRequirements(input.job.templateRequirements)
    const capabilitySnapshot = templateRequirements?.capabilitySnapshot
    const toolIds = new Set(capabilitySnapshot?.plugins.mcpToolIds ?? [])
    if (!toolIds.has('mcp_agent_reach_search') && !toolIds.has('mcp_image_generation_ark_seedream')) return null

    const ctx: RequestContext = {
      requestId: createId('req'),
      userId: input.job.userId,
      adminRole: null,
      authMode: 'dev',
      authSessionTokenHash: null,
    }
    const firstVariation = input.variations.find(variation => variation.index === 1) ?? input.variations[0] ?? null
    const researchContexts = [...(templateRequirements?.researchContexts ?? [])]
    const researchContextArtifactIds = new Set(templateRequirements?.researchContextArtifactIds ?? [])
    const imageGenerationArtifacts: Array<Record<string, unknown>> = Array.isArray(input.job.templateRequirements.imageGenerationArtifacts)
      ? [...input.job.templateRequirements.imageGenerationArtifacts.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>]
      : []

    if (toolIds.has('mcp_agent_reach_search') && !researchContexts.length) {
      const executed = await this.executeMcpInvocation(ctx, {
        userId: input.job.userId,
        workspaceId: input.job.workspaceId,
        sessionId: input.job.sessionId,
        jobId: input.job.id,
        variationId: firstVariation?.id,
        runtimeSessionId: input.runtimeSessionId,
        mcpToolId: 'mcp_agent_reach_search',
        serverName: 'agent-reach',
        toolName: 'search',
        scopes: ['readonly_context'],
        input: {
          query: dynamicEncyclopediaResearchQuery(input.job.prompt, templateRequirements),
          topic: dynamicEncyclopediaEntryTitle(input.job.prompt, templateRequirements),
          productMode: input.job.productMode,
        },
        reason: 'Pre-generation dynamic encyclopedia research context.',
      })
      const reference = executed.result.data?.researchContextArtifact
      if (isResearchContextArtifactReference(reference)) {
        researchContexts.push(reference)
        researchContextArtifactIds.add(reference.artifactId)
      }
    }

    if (toolIds.has('mcp_image_generation_ark_seedream') && imageGenerationArtifacts.length === 0) {
      const executed = await this.executeMcpInvocation(ctx, {
        userId: input.job.userId,
        workspaceId: input.job.workspaceId,
        sessionId: input.job.sessionId,
        jobId: input.job.id,
        variationId: firstVariation?.id,
        runtimeSessionId: input.runtimeSessionId,
        mcpToolId: 'mcp_image_generation_ark_seedream',
        serverName: 'image-generation',
        toolName: 'generateArkSeedreamImage',
        scopes: ['artifact_write', 'readonly_context'],
        input: {
          prompt: dynamicEncyclopediaImagePrompt(input.job.prompt, templateRequirements),
          model: 'doubao-seedream-5-0-260128',
          size: '2K',
          watermark: true,
          usageContext: 'dynamic_encyclopedia_card',
          variationId: firstVariation?.id ?? null,
          templatePackId: firstVariation ? assignedTemplatePackIdForVariation(firstVariation.index, templateRequirements?.variationTemplateAssignments ?? []) : null,
          contentSafety: { policy: 'strict', allowBrandReference: false },
        },
        reason: 'Pre-generation dynamic encyclopedia supporting visual asset.',
      })
      const reference = executed.result.data?.imageGenerationArtifact
      if (reference && typeof reference === 'object') {
        imageGenerationArtifacts.push(reference as Record<string, unknown>)
      }
    }

    if (!researchContexts.length && !imageGenerationArtifacts.length) return null
    const nextTemplateRequirements: Record<string, unknown> = {
      ...input.job.templateRequirements,
      ...(researchContexts.length
        ? {
            researchContextArtifactIds: [...researchContextArtifactIds],
            researchContexts,
          }
        : {}),
      ...(imageGenerationArtifacts.length ? { imageGenerationArtifacts } : {}),
    }
    await this.store.updateJobTemplateRequirements(input.job.id, nextTemplateRequirements)
    return nextTemplateRequirements
  }

  async processQueuedRefineJob(_payload: RefineJobQueuePayload): Promise<void> {
    const prompt = _payload.prompt?.trim() ?? ''
    if (!prompt) throw createHttpError(400, 'INVALID_PROMPT', 'prompt is required.')
    const context = await this.store.getVariationRefineContext(_payload.variationId, _payload.baseArtifactId)
    if (!context) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${_payload.variationId}`)
    const { variation, job, session, workspace, baseArtifact } = context
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${variation.sessionId}`)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    if (!baseArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${_payload.baseArtifactId}`)
    if (_payload.jobId && _payload.jobId !== job.id) {
      throw createHttpError(400, 'JOB_VARIATION_MISMATCH', 'Queued refine job does not match the variation job.')
    }
    if (_payload.sessionId !== session.id) {
      throw createHttpError(400, 'SESSION_VARIATION_MISMATCH', 'Queued refine job does not match the variation session.')
    }
    if (_payload.workspaceId !== workspace.id) {
      throw createHttpError(400, 'WORKSPACE_VARIATION_MISMATCH', 'Queued refine job does not match the variation workspace.')
    }
    const baseArtifactHtml = await this.readArtifactHtml(baseArtifact.storageKey)
    const modelContext = modelContextFromTemplateRequirements(job.templateRequirements)
    const attempt = _payload.attempt ?? Math.max(1, baseArtifact.version)

    if (_payload.source === 'automation_loop') {
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.loop_repair_started',
        sessionId: session.id,
        jobId: job.id,
        variationId: variation.id,
        payload: {
          artifactId: baseArtifact.id,
          attempt,
          runtimeChildSessionId: variation.runtimeChildSessionId,
        },
      }))
      await this.store.appendMessage({
        sessionId: session.id,
        role: 'system',
        content: `Automation loop started repair attempt ${attempt} for ${variation.title ?? variation.id}.`,
        metadata: {
          kind: 'automation_loop_repair',
          variationId: variation.id,
          artifactId: baseArtifact.id,
          attempt,
          queueJobIdempotencyKey: _payload.idempotencyKey,
        },
      })
    } else {
      await this.store.appendMessage({
        sessionId: session.id,
        role: 'user',
        content: prompt,
        metadata: {
          kind: 'variation_refine',
          variationId: variation.id,
          baseArtifactId: baseArtifact.id,
          deviceContext: _payload.deviceContext ?? null,
          queueJobIdempotencyKey: _payload.idempotencyKey,
        },
      })
    }

    try {
      for await (const event of this.runtime.refineVariation({
        userId: session.userId,
        workspaceId: workspace.id,
        sessionId: session.id,
        jobId: job.id,
        variationId: variation.id,
        variationIndex: variation.index,
        runtimeChildSessionId: variation.runtimeChildSessionId,
        runtimeLaneId: variation.runtimeLaneId,
        baseArtifactId: baseArtifact.id,
        baseArtifactHtml,
        baseArtifactEntryPath: baseArtifact.entryPath,
        baseArtifactVersion: baseArtifact.version,
        prompt,
        annotationPromptSuffix: _payload.annotationPromptSuffix ?? undefined,
        workspaceRoot: workspace.storageKey,
        deviceContext: _payload.deviceContext ?? undefined,
        modelServiceId: _payload.modelServiceId ?? modelContext.modelServiceId,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
      })) {
        await this.applyEventSideEffects(event)
        await this.publishDesignEvent(event)
      }
    } catch (error) {
      if (_payload.source === 'automation_loop') {
        await this.publishAutomationLoopStoppedForRepair(
          {
            sessionId: session.id,
            job,
            variation,
            artifact: baseArtifact,
            attempt,
          },
          'runtime_unavailable',
          error instanceof Error ? error.message : 'Automation repair failed because the runtime is unavailable.',
        )
      }
      throw error
    }
  }

  private async runMockJob(input: {
    jobId: string
    sessionId: string
    workspaceId: string
    workspaceRoot: string
    prompt: string
    sourceMode: CreateDesignJobRequest['sourceMode']
    productMode: CreateDesignJobRequest['productMode']
    sourceArtifactId: string | null
    variationCount: number
    templateRequirements: CreateDesignJobRequest['templateRequirements']
    modelServiceId: string
    modelId: string
    modelProvider: string
    variationIdsByIndex: Map<number, string>
  }): Promise<void> {
    await this.store.setJobStatus(input.jobId, 'running')
    const runtimeContext = await this.store.getRuntimeSessionContext(input.sessionId)
    try {
      for await (const event of this.runtime.spawnVariationAgents({
        userId: runtimeContext?.session.userId ?? this.store.devUser.id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        prompt: input.prompt,
        sourceMode: input.sourceMode,
        productMode: input.productMode ?? 'web_app',
        sourceArtifactId: input.sourceArtifactId,
        variationCount: input.variationCount,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: runtimeContext?.user?.memoryNamespace ?? this.store.devUser.memoryNamespace,
        templateRequirements: input.templateRequirements,
        modelServiceId: input.modelServiceId,
        modelId: input.modelId,
        modelProvider: input.modelProvider,
      })) {
        const normalized = this.rewriteRuntimeVariationId(event, input.variationIdsByIndex)
        if (normalized.type === 'design.job_completed') {
          continue
        }
        await this.applyEventSideEffects(normalized)
        await this.publishDesignEvent(normalized)
      }
      await this.failUnfinishedVariations(
        input.jobId,
        input.variationIdsByIndex,
        new Error('Runtime completed before all variations reached a terminal state.'),
        'RUNTIME_INCOMPLETE',
      )
    } catch (error) {
      await this.failUnfinishedVariations(input.jobId, input.variationIdsByIndex, error)
    }
    await this.finalizeQueuedDesignJob(input.jobId)
  }

  private rewriteRuntimeVariationId(event: DesignEvent, idsByIndex: Map<number, string>): DesignEvent {
    const variationId = event.variationId
    const index = variationIndexFromRuntimeId(variationId)
    if (!index) return event
    const realId = idsByIndex.get(index)
    if (!realId) return event
    if (event.type === 'design.variation_preview_ready') {
      return {
        ...event,
        variationId: realId,
        payload: {
          ...event.payload,
          previewUrl: `/api/variations/${realId}/preview`,
        },
      }
    }
    return {
      ...event,
      variationId: realId,
    } as DesignEvent
  }

  private async applyEventSideEffects(event: DesignEvent): Promise<void> {
    if (!event.variationId) return
    switch (event.type) {
      case 'design.variation_queued': {
        const current = await this.store.getVariationById(event.variationId)
        if (current && isTerminalVariationStatus(current.status)) break
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'queued',
          runtimeChildSessionId: event.payload.runtimeChildSessionId,
          runtimeAgentJobId: event.payload.runtimeAgentJobId,
        })
        break
      }
      case 'design.variation_streaming': {
        const current = await this.store.getVariationById(event.variationId)
        if (current && isTerminalVariationStatus(current.status)) break
        await this.store.applyVariationEvent({ variationId: event.variationId, status: 'streaming' })
        break
      }
      case 'design.runtime_lane_assigned': {
        const current = await this.store.getVariationById(event.variationId)
        if (current && isTerminalVariationStatus(current.status)) break
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          runtimeLaneId: event.payload.runtimeLaneId,
          runtimeBackendId: event.payload.runtimeBackendId,
          runtimeLeaseId: event.payload.runtimeLeaseId,
          runtimeAttempt: (current?.runtimeAttempt ?? 0) + 1,
        })
        break
      }
      case 'design.runtime_lane_retry_started': {
        const current = await this.store.getVariationById(event.variationId)
        if (current && isTerminalVariationStatus(current.status)) break
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          runtimeLaneId: event.payload.nextRuntimeLaneId,
          runtimeBackendId: event.payload.nextRuntimeBackendId,
          runtimeAttempt: (current?.runtimeAttempt ?? 0) + 1,
        })
        break
      }
      case 'design.variation_artifact_updated':
        {
          const context = await this.store.getVariationJobContext(event.variationId)
          const variation = context?.variation
          const job = context?.job
          const terminalStatus = variation && isTerminalVariationStatus(variation.status) ? variation.status : null
          const artifact = variation
            ? await this.materializeArtifactFromRuntimePayload({
                event,
                workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variation,
                sourceEventType: 'artifact_updated',
              })
            : undefined
          await this.store.applyVariationEvent({
            variationId: event.variationId,
            status: terminalStatus ?? (artifact ? 'rendering_preview' : 'streaming'),
            artifactId: artifact?.id,
            previewUrl: artifact ? `/api/variations/${event.variationId}/preview` : undefined,
          })
        }
        break
      case 'design.variation_preview_ready': {
        const context = await this.store.getVariationJobContext(event.variationId)
        const variation = context?.variation
        const job = context?.job
        const artifact = await this.store.createMockArtifact({
          workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
          sessionId: event.sessionId ?? variation?.sessionId ?? '',
          variationId: event.variationId,
          artifactId: event.payload.artifactId,
        })
        await this.writeMockArtifactBody(artifact.id)
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          status: variation && isTerminalVariationStatus(variation.status) ? variation.status : 'rendering_preview',
          artifactId: artifact.id,
          previewUrl: event.payload.previewUrl,
        })
        break
      }
      case 'design.variation_completed':
        {
          const context = await this.store.getVariationJobContext(event.variationId)
          const variation = context?.variation
          const job = context?.job
          const existingArtifact = event.payload.artifactId
            ? await this.store.getArtifactById(event.payload.artifactId) ?? undefined
            : undefined
          const artifact = existingArtifact ?? (variation
            ? await this.materializeArtifactFromRuntimePayload({
                event,
                workspaceId: job?.workspaceId ?? this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variation,
                sourceEventType: 'completed',
              })
            : undefined)
          await this.store.applyVariationEvent({
            variationId: event.variationId,
            status: 'completed',
            artifactId: artifact?.id ?? event.payload.artifactId,
            previewUrl: artifact ? `/api/variations/${event.variationId}/preview` : undefined,
            inputTokens: event.payload.inputTokens,
            outputTokens: event.payload.outputTokens,
            costCents: event.payload.costCents,
          })
          if (variation && job && artifact) {
            const isRefine = Boolean(artifact.parentArtifactId)
            await this.recordUsageEvent({
              idempotencyKey: `usage:${isRefine ? 'variation.refined' : 'variation.completed'}:job:${job.id}:variation:${variation.id}:artifact:${artifact.id}`,
              kind: isRefine ? 'variation.refined' : 'variation.completed',
              userId: job.userId,
              workspaceId: job.workspaceId,
              sessionId: variation.sessionId,
              jobId: job.id,
              variationId: variation.id,
              artifactId: artifact.id,
              inputTokens: event.payload.inputTokens ?? 0,
              outputTokens: event.payload.outputTokens ?? 0,
              costCents: event.payload.costCents ?? 0,
              metadata: {
                artifactVersion: artifact.version,
                parentArtifactId: artifact.parentArtifactId,
                modelServiceId: stringValue(job.templateRequirements.modelServiceId),
                modelId: stringValue(job.templateRequirements.modelId),
                modelProvider: stringValue(job.templateRequirements.modelProvider),
              },
            })
          }
        }
        break
      case 'design.runtime_warning':
        if (event.payload.code === 'UNKNOWN_RUNTIME_EVENT') {
          await this.store.createAuditLog({
            requestId: event.requestId ?? createId('req_runtime_drift'),
            operatorUserId: this.store.devUser.id,
            operatorRole: 'developer',
            action: 'runtime.drift_detected',
            targetType: 'variation',
            targetId: event.variationId,
            reason: event.payload.message,
            metadata: {
              sessionId: event.sessionId ?? null,
              jobId: event.jobId ?? null,
              variationId: event.variationId,
              severity: event.payload.severity,
              code: event.payload.code,
            },
          })
        }
        break
      case 'design.variation_failed':
        {
          const current = await this.store.getVariationById(event.variationId)
          if (current && isTerminalVariationStatus(current.status)) break
        }
        await this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'failed',
          errorCode: event.payload.errorCode,
          errorMessage: event.payload.message,
          runtimeLastErrorCode: event.payload.errorCode,
        })
        break
      default:
        break
    }
  }

  async listDesignJobEvents(ctx: RequestContext, jobId: string): Promise<DesignEvent[]> {
    await this.requireJobAccess(jobId, ctx.userId, 'viewer')
    return this.store.listDesignEvents(jobId)
  }

  private async publishDesignEvent(event: DesignEvent): Promise<void> {
    await this.store.appendDesignEvent(event)
    this.events.publish(event)
  }

  private async failUnfinishedVariations(
    jobId: string,
    variationIdsByIndex: Map<number, string>,
    error: unknown,
    errorCode = 'RUNTIME_UNAVAILABLE',
  ): Promise<void> {
    const snapshot = await this.store.getJobSnapshot(jobId)
    const message = error instanceof Error ? error.message : 'Runtime unavailable.'
    for (const variationId of variationIdsByIndex.values()) {
      const variation = snapshot?.variations.find(candidate => candidate.id === variationId)
      if (variation && (isTerminalVariationStatus(variation.status) || variation.currentArtifactId)) continue
      const failedEvent = createDesignEvent({
        type: 'design.variation_failed',
        sessionId: snapshot?.job.sessionId,
        jobId,
        variationId,
        payload: {
          errorCode,
          message,
          recoverable: true,
        },
      })
      await this.applyEventSideEffects(failedEvent)
      await this.publishDesignEvent(failedEvent)
    }
  }

  private async finalizeQueuedDesignJob(jobId: string): Promise<void> {
    let snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) return
    await this.reconcileArtifactBackedVariationsBeforeFinalization(snapshot)
    snapshot = await this.store.getJobSnapshot(jobId)
    if (!snapshot) return
    const completedVariationCount = snapshot.variations.filter(variation => variation.status === 'completed').length
    const failedVariationCount = snapshot.variations.filter(variation => variation.status === 'failed').length
    const cancelledVariationCount = snapshot.variations.filter(variation => variation.status === 'cancelled').length
    const terminalCount = completedVariationCount + failedVariationCount + cancelledVariationCount
    const status = completedVariationCount > 0
      ? 'completed'
      : terminalCount === snapshot.variations.length && cancelledVariationCount === snapshot.variations.length
        ? 'cancelled'
        : 'failed'
    await this.store.setJobStatus(jobId, status)
    await this.publishDesignEvent(createDesignEvent({
      type: 'design.job_completed',
      sessionId: snapshot.job.sessionId,
      jobId,
      payload: {
        completedVariationCount,
        failedVariationCount,
      },
    }))
  }

  private async reconcileArtifactBackedVariationsBeforeFinalization(
    snapshot: NonNullable<Awaited<ReturnType<ApplicationRepository['getJobSnapshot']>>>,
  ): Promise<void> {
    for (const variation of snapshot.variations) {
      if (isTerminalVariationStatus(variation.status) || !variation.currentArtifactId) continue
      const previewUrl = variation.previewUrl ?? `/api/variations/${variation.id}/preview`
      await this.store.applyVariationEvent({
        variationId: variation.id,
        status: 'completed',
        artifactId: variation.currentArtifactId,
        previewUrl,
        inputTokens: variation.inputTokens,
        outputTokens: variation.outputTokens,
        costCents: variation.costCents,
      })
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.variation_completed',
        sessionId: variation.sessionId,
        jobId: snapshot.job.id,
        variationId: variation.id,
        payload: {
          artifactId: variation.currentArtifactId,
          inputTokens: variation.inputTokens,
          outputTokens: variation.outputTokens,
          costCents: variation.costCents,
        },
      }))
    }
  }

  private async recordCapabilityUsageEvents(input: {
    userId: string
    workspaceId: string
    sessionId: string
    jobId: string
    capabilitySnapshot: NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['capabilitySnapshot']>
    designTemplatePacks: DesignTemplatePack[]
  }): Promise<void> {
    for (const template of input.designTemplatePacks) {
      await this.recordUsageEvent({
        idempotencyKey: `usage:capability.template.selected:job:${input.jobId}:template:${template.id}:version:${template.version}`,
        kind: 'capability.template.selected',
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: null,
        artifactId: template.previewArtifactId,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        metadata: {
          templateId: template.id,
          templateVersion: template.version,
          source: template.source,
          visibility: template.visibility,
        },
      })
    }
    const pluginSnapshot = input.capabilitySnapshot.plugins.pluginSnapshot
    if (!pluginSnapshot) return
    for (const plugin of pluginSnapshot.plugins) {
      await this.recordUsageEvent({
        idempotencyKey: `usage:capability.plugin.selected:job:${input.jobId}:plugin:${plugin.id}`,
        kind: 'capability.plugin.selected',
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: null,
        artifactId: null,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        metadata: {
          pluginId: plugin.id,
          pluginType: plugin.type,
          auditLevel: plugin.permissionPolicy.auditLevel,
        },
      })
    }
  }

  private async recordUsageEvent(input: Parameters<ApplicationRepository['createUsageEvent']>[0]): Promise<void> {
    await this.store.createUsageEvent(input)
  }

  private async writeMockArtifactBody(artifactId: string): Promise<void> {
    const artifact = await this.store.getArtifactById(artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`)
    const variation = artifact.variationId ? await this.store.getVariationById(artifact.variationId) : null
    const stored = await this.artifacts.put({
      workspaceId: artifact.workspaceId,
      artifactId: artifact.id,
      relativePath: `v${artifact.version}/${artifact.entryPath ?? 'index.html'}`,
      contentType: 'text/html; charset=utf-8',
      body: renderMockVariationHtml(variation, artifact),
      metadata: {
        kind: artifact.kind,
        version: String(artifact.version),
        sessionId: artifact.sessionId,
        variationId: artifact.variationId ?? '',
      },
    })
    await this.store.saveArtifact({
      ...artifact,
      storageKey: stored.storageKey,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        ...artifact.metadata,
        storedBy: 'LocalArtifactStore',
      },
    })
    if (artifact.kind === 'html' && variation) {
      await this.enqueueScreenshotJob({
        workspaceId: artifact.workspaceId,
        sessionId: artifact.sessionId,
        variation,
        htmlArtifactId: artifact.id,
        source: 'mock-runtime',
        reason: 'artifact_created',
        jobId: variation.jobId,
      })
    }
  }

  private async materializeArtifactFromRuntimePayload(input: {
    event: Extract<DesignEvent, { type: 'design.variation_artifact_updated' | 'design.variation_completed' }>
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact | null> {
    if (Array.isArray(input.event.payload.files) && input.event.payload.files.length > 0) {
      return await this.createRuntimeWorkspaceArtifacts({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variation: input.variation,
        runtimeArtifactId: input.event.payload.artifactId,
        jobId: input.event.jobId,
        files: input.event.payload.files,
        entryPath: input.event.payload.entryPath ?? 'index.html',
        sourceEventType: input.sourceEventType,
      })
    }
    if (typeof input.event.payload.html === 'string' && input.event.payload.html.trim()) {
      return await this.createRuntimeHtmlArtifact({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variation: input.variation,
        runtimeArtifactId: input.event.payload.artifactId,
        jobId: input.event.jobId,
        html: input.event.payload.html,
        entryPath: input.event.payload.entryPath ?? 'index.html',
        changedPaths: input.event.payload.changedPaths ?? [],
        sourceEventType: input.sourceEventType,
      })
    }
    if (input.sourceEventType === 'artifact_updated') {
      return null
    }
    const artifact = await this.store.createMockArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      artifactId: input.event.payload.artifactId,
      entryPath: input.event.payload.entryPath,
      parentArtifactId: input.variation.currentArtifactId,
    })
    await this.writeMockArtifactBody(artifact.id)
    return artifact
  }

  private async createRuntimeHtmlArtifact(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    runtimeArtifactId?: string
    jobId?: string
    html: string
    entryPath: string
    changedPaths: string[]
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact> {
    const version = await this.nextHtmlArtifactVersion(input.variation.id)
    const artifactId = input.runtimeArtifactId?.startsWith('art_') ? input.runtimeArtifactId : `art_${input.variation.id}_runtime_${version}`
    const quality = await this.analyzeArtifactQuality(input.html, {
      jobId: input.jobId,
      variationIndex: input.variation.index,
    })
    const stored = await this.artifacts.put({
      workspaceId: input.workspaceId,
      artifactId,
      relativePath: `v${version}/${input.entryPath}`,
      contentType: 'text/html; charset=utf-8',
      body: input.html,
      metadata: {
        kind: 'html',
        source: 'babel-o-runtime',
        sessionId: input.sessionId,
        variationId: input.variation.id,
        runtimeArtifactId: input.runtimeArtifactId ?? '',
        qualityStatus: quality.status,
        qualityIssues: quality.issues.join('\n'),
      },
    })
    const artifact = await this.store.createArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.variation.currentArtifactId,
      kind: 'html',
      version,
      storageKey: stored.storageKey,
      entryPath: input.entryPath,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        source: 'babel-o-runtime',
        sourceEventType: input.sourceEventType,
        runtimeArtifactId: input.runtimeArtifactId ?? null,
        changedPaths: input.changedPaths,
        quality,
      },
    })
    this.publishArtifactQualityWarnings(input.sessionId, input.jobId, input.variation.id, artifact, quality)
    this.publishAutomationLoopEventsForArtifact(input.sessionId, input.jobId, input.variation.id, artifact, quality)
    await this.enqueueScreenshotJob({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variation: input.variation,
      htmlArtifactId: artifact.id,
      source: 'babel-o-runtime',
      reason: 'artifact_created',
      jobId: input.jobId ?? input.variation.jobId,
    })
    return artifact
  }

  private async createRuntimeWorkspaceArtifacts(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    runtimeArtifactId?: string
    jobId?: string
    files: Array<{ path: string; content: string; contentType?: string }>
    entryPath: string
    sourceEventType: 'artifact_updated' | 'completed'
  }): Promise<Artifact> {
    const files = normalizeRuntimeFiles(input.files)
    const entryPath = normalizeRuntimeArtifactPath(input.entryPath)
    const entry = files.find(file => file.path === entryPath) ?? files.find(file => file.path === 'index.html')
    if (!entry) {
      throw createHttpError(400, 'RUNTIME_ARTIFACT_ENTRY_MISSING', 'Runtime artifact files must include index.html.')
    }
    const version = await this.nextHtmlArtifactVersion(input.variation.id)
    const htmlArtifactId = `art_${input.variation.id}_workspace_${version}`
    const quality = await this.analyzeArtifactQuality(entry.content, {
      jobId: input.jobId,
      variationIndex: input.variation.index,
    })
    const storedEntry = await this.artifacts.put({
      workspaceId: input.workspaceId,
      artifactId: htmlArtifactId,
      relativePath: `v${version}/${entry.path}`,
      contentType: entry.contentType ?? contentTypeForPath(entry.path),
      body: entry.content,
      metadata: {
        kind: 'html',
        source: 'babel-o-workspace',
        sessionId: input.sessionId,
        variationId: input.variation.id,
        runtimeArtifactId: input.runtimeArtifactId ?? '',
        qualityStatus: quality.status,
        qualityIssues: quality.issues.join('\n'),
      },
    })
    const htmlArtifact = await this.store.createArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.variation.currentArtifactId,
      kind: 'html',
      version,
      storageKey: storedEntry.storageKey,
      entryPath: entry.path,
      contentHash: storedEntry.contentHash,
      sizeBytes: storedEntry.sizeBytes,
      metadata: {
        source: 'babel-o-workspace',
        sourceEventType: input.sourceEventType,
        runtimeArtifactId: input.runtimeArtifactId ?? null,
        fileCount: files.length,
        quality,
      },
    })
    this.publishArtifactQualityWarnings(input.sessionId, input.jobId, input.variation.id, htmlArtifact, quality)
    this.publishAutomationLoopEventsForArtifact(input.sessionId, input.jobId, input.variation.id, htmlArtifact, quality)

    for (const file of files.filter(file => file.path !== entry.path)) {
      const assetArtifactId = `asset_${input.variation.id}_${version}_${stablePathId(file.path)}`
      const storedAsset = await this.artifacts.put({
        workspaceId: input.workspaceId,
        artifactId: assetArtifactId,
        relativePath: `v${version}/${file.path}`,
        contentType: file.contentType ?? contentTypeForPath(file.path),
        body: file.content,
        metadata: {
          kind: 'asset',
          source: 'babel-o-workspace',
          sessionId: input.sessionId,
          variationId: input.variation.id,
          htmlArtifactId: htmlArtifact.id,
        },
      })
      await this.store.createArtifact({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        variationId: input.variation.id,
        parentArtifactId: htmlArtifact.id,
        kind: 'asset',
        version,
        storageKey: storedAsset.storageKey,
        entryPath: file.path,
        contentHash: storedAsset.contentHash,
        sizeBytes: storedAsset.sizeBytes,
        metadata: {
          source: 'babel-o-workspace',
          htmlArtifactId: htmlArtifact.id,
        },
      })
    }

    await this.enqueueScreenshotJob({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variation: input.variation,
      htmlArtifactId: htmlArtifact.id,
      source: 'babel-o-workspace',
      reason: 'artifact_created',
      jobId: input.jobId ?? input.variation.jobId,
    })

    return htmlArtifact
  }

  private async enqueueScreenshotJob(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    htmlArtifactId: string
    source: ScreenshotJobQueuePayload['source']
    reason: ScreenshotJobQueuePayload['reason']
    jobId?: string | null
  }) {
    const job = input.jobId ? await this.store.getJobById(input.jobId) : null
    return await this.queue.enqueueScreenshotJob({
      jobId: input.jobId ?? input.variation.jobId,
      sessionId: input.sessionId,
      variationId: input.variation.id,
      artifactId: input.htmlArtifactId,
      idempotencyKey: screenshotQueueIdempotencyKey(input.htmlArtifactId, input.reason),
      userId: job?.userId ?? this.store.devUser.id,
      workspaceId: input.workspaceId,
      source: input.source,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    })
  }

  async processQueuedScreenshotJob(payload: ScreenshotJobQueuePayload): Promise<void> {
    const context = await this.store.getVariationArtifactContext(payload.variationId, payload.artifactId)
    const variation = context.variation
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${payload.variationId}`)
    if (context.mismatch) throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    const artifact = context.artifact
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${payload.artifactId}`)
    if (artifact.kind !== 'html') throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Screenshot jobs require an HTML artifact.')
    const html = await this.readArtifactHtml(artifact.storageKey)
    await this.createScreenshotArtifacts({
      workspaceId: payload.workspaceId,
      sessionId: payload.sessionId,
      variation,
      htmlArtifact: artifact,
      html,
      source: payload.source,
    })
  }

  private async createScreenshotArtifacts(input: {
    workspaceId: string
    sessionId: string
    variation: DesignVariation
    htmlArtifact: Artifact
    html: string
    source: string
  }): Promise<Artifact[]> {
    try {
      const screenshotHtml = await this.inlineArtifactAssetsForRendering(input.variation.id, input.htmlArtifact, input.html)
      const screenshots = await renderHtmlScreenshots(screenshotHtml)
      const artifacts: Artifact[] = []
      for (const screenshot of screenshots) {
        const artifactId = `shot_${input.variation.id}_${input.htmlArtifact.version}_${screenshot.device}`
        const entryPath = `screenshots/${screenshot.device}.png`
        const stored = await this.artifacts.put({
          workspaceId: input.workspaceId,
          artifactId,
          relativePath: `v${input.htmlArtifact.version}/${entryPath}`,
          contentType: 'image/png',
          body: screenshot.body,
          metadata: {
            kind: 'screenshot',
            source: input.source,
            sessionId: input.sessionId,
            variationId: input.variation.id,
            htmlArtifactId: input.htmlArtifact.id,
            device: screenshot.device,
            width: String(screenshot.width),
            height: String(screenshot.height),
          },
        })
        artifacts.push(await this.store.createArtifact({
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          variationId: input.variation.id,
          parentArtifactId: input.htmlArtifact.id,
          kind: 'screenshot',
          version: input.htmlArtifact.version,
          storageKey: stored.storageKey,
          entryPath,
          contentHash: stored.contentHash,
          sizeBytes: stored.sizeBytes,
          metadata: {
            source: input.source,
            htmlArtifactId: input.htmlArtifact.id,
            device: screenshot.device,
            width: screenshot.width,
            height: screenshot.height,
          },
        }))
      }
      const desktop = artifacts.find(artifact => artifact.metadata.device === 'desktop') ?? artifacts[0]
      if (desktop) {
        await this.store.applyVariationEvent({
          variationId: input.variation.id,
          screenshotArtifactId: desktop.id,
        })
      }
      return artifacts
    } catch (error) {
      await this.store.saveArtifact({
        ...input.htmlArtifact,
        metadata: {
          ...input.htmlArtifact.metadata,
          screenshotStatus: 'failed',
          screenshotError: error instanceof Error ? error.message : 'unknown screenshot render error',
        },
      })
      return []
    }
  }

  private trackBackgroundTask(task: Promise<unknown>): void {
    this.backgroundTasks.add(task)
    task
      .catch(() => undefined)
      .finally(() => {
        this.backgroundTasks.delete(task)
      })
  }

  private publishArtifactQualityWarnings(
    sessionId: string,
    jobId: string | undefined,
    variationId: string,
    artifact: Artifact,
    quality: ArtifactQualityReport,
  ): void {
    if (quality.status === 'pass') return
    const event = createDesignEvent({
      type: 'design.runtime_warning',
      sessionId,
      jobId,
      variationId,
      payload: {
        severity: quality.status === 'fail' ? 'error' : 'warn',
        code: 'ARTIFACT_QUALITY_GATE',
        message: `Artifact v${artifact.version} needs attention: ${quality.issues.join('; ')}`,
      },
    })
    this.trackBackgroundTask(this.publishDesignEvent(event))
  }

  private publishAutomationLoopEventsForArtifact(
    sessionId: string,
    jobId: string | undefined,
    variationId: string,
    artifact: Artifact,
    quality: ArtifactQualityReport,
  ): void {
    if (!jobId) return
    this.trackBackgroundTask(this.publishAutomationLoopEventsForArtifactNow({
      sessionId,
      jobId,
      variationId,
      artifact,
      quality,
    }))
  }

  private async publishAutomationLoopEventsForArtifactNow(input: {
    sessionId: string
    jobId: string
    variationId: string
    artifact: Artifact
    quality: ArtifactQualityReport
  }): Promise<void> {
    const job = await this.store.getJobById(input.jobId)
    const variation = await this.store.getVariationById(input.variationId)
    if (!job || !variation) return
    const templateRequirements = normalizeTemplateRequirements(job.templateRequirements)
    const capabilitySnapshot = templateRequirements?.capabilitySnapshot
    const automation = capabilitySnapshot?.automation
    if (!automation) return
    const reviewMode = reviewModeFromTemplateRequirements(templateRequirements)

    const profile = automation.loopProfile
    const attempt = Math.max(0, input.artifact.version - 1)
    const startedAt = job.startedAt ? Date.parse(job.startedAt) : Date.parse(job.createdAt)
    const elapsedMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : 0
    const costCents = Math.max(job.totalCostCents, variation.costCents)
    const decision = evaluateAutomationLoopStop({
      profile: {
        ...profile,
        maxRepairAttempts: automation.maxRepairAttempts,
        maxCostCents: automation.maxCostCents,
        maxDurationMs: automation.maxDurationMs,
      },
      attempts: attempt,
      elapsedMs,
      costCents,
      quality: input.quality,
    })

    await this.publishDesignEvent(createDesignEvent({
      type: 'design.loop_started',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        profileId: profile.id,
        maxRepairAttempts: automation.maxRepairAttempts,
        qualityGates: profile.qualityGates,
        reviewMode,
      },
    }))
    await this.publishDesignEvent(createDesignEvent({
      type: 'design.loop_quality_checked',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        artifactId: input.artifact.id,
        attempt,
        gates: profile.qualityGates,
        status: input.quality.status,
        issues: input.quality.issues,
        reviewMode,
      },
    }))

    if (!decision.shouldStop) {
      const prompt = buildAutomationRepairPrompt({
        issues: input.quality.issues,
        specFindings: specFindingsFromArtifactMetadata(input.artifact.metadata),
        originalPrompt: job.prompt,
        templateSummary: automationTemplateSummaryForVariation(variation.index, job.templateRequirements),
      })
      await this.planAutomationRepairByReviewMode({
        sessionId: input.sessionId,
        job,
        variation,
        artifact: input.artifact,
        prompt,
        attempt: attempt + 1,
        reason: `quality_${input.quality.status}`,
        reviewMode,
      })
      return
    }

    if (decision.reason === 'quality_passed') {
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.loop_completed',
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
        payload: {
          artifactId: input.artifact.id,
          attempts: attempt,
          reason: 'quality_passed',
        },
      }))
      return
    }

    await this.publishDesignEvent(createDesignEvent({
      type: 'design.loop_stopped',
      sessionId: input.sessionId,
      jobId: input.jobId,
      variationId: input.variationId,
      payload: {
        artifactId: input.artifact.id,
        attempts: attempt,
        reason: loopStoppedEventReason(decision.reason),
        message: decision.message ?? 'Automation loop stopped.',
        recoverable: decision.recoverable,
      },
    }))
  }

  private async enqueueAutomationLoopRepair(input: {
    sessionId: string
    job: NonNullable<Awaited<ReturnType<ApplicationRepository['getJobById']>>>
    variation: DesignVariation
    artifact: Artifact
    prompt: string
    attempt: number
  }): Promise<void> {
    const sessionContext = await this.store.getSessionWorkspaceContext(input.sessionId)
    const session = sessionContext?.session
    const workspace = sessionContext?.workspace
    if (!session || !workspace) {
      await this.publishAutomationLoopStoppedForRepair(input, 'runtime_unavailable', 'Automation repair could not start because the session workspace is unavailable.')
      return
    }
    const modelContext = modelContextFromTemplateRequirements(input.job.templateRequirements)
    await this.queue.enqueueRefineJob({
      jobId: input.job.id,
      sessionId: input.sessionId,
      variationIds: [input.variation.id],
      sourceArtifactId: input.artifact.id,
      runtimeSessionId: input.variation.runtimeChildSessionId,
      modelServiceId: modelContext.modelServiceId ?? null,
      idempotencyKey: automationRepairQueueIdempotencyKey(input.artifact.id, input.attempt),
      userId: session.userId,
      workspaceId: workspace.id,
      variationId: input.variation.id,
      baseArtifactId: input.artifact.id,
      prompt: input.prompt,
      source: 'automation_loop',
      attempt: input.attempt,
      createdAt: new Date().toISOString(),
    })
  }

  private async planAutomationRepairByReviewMode(input: {
    sessionId: string
    job: NonNullable<Awaited<ReturnType<ApplicationRepository['getJobById']>>>
    variation: DesignVariation
    artifact: Artifact
    prompt: string
    attempt: number
    reason: string
    reviewMode: ReviewMode
  }): Promise<void> {
    if (input.reviewMode === 'off') {
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.loop_stopped',
        sessionId: input.sessionId,
        jobId: input.job.id,
        variationId: input.variation.id,
        payload: {
          artifactId: input.artifact.id,
          attempts: input.attempt - 1,
          reason: 'review_disabled',
          message: 'Review mode is off; artifact quality findings were recorded without repair.',
          recoverable: true,
        },
      }))
      return
    }

    await this.publishDesignEvent(createDesignEvent({
      type: 'design.loop_repair_planned',
      sessionId: input.sessionId,
      jobId: input.job.id,
      variationId: input.variation.id,
      payload: {
        artifactId: input.artifact.id,
        attempt: input.attempt,
        reason: input.reason,
        promptPreview: automationRepairPromptPreview(input.prompt),
        reviewMode: input.reviewMode,
        requiresConfirmation: input.reviewMode === 'semi_auto',
      },
    }))

    if (input.reviewMode === 'semi_auto') {
      await this.publishDesignEvent(createDesignEvent({
        type: 'design.loop_stopped',
        sessionId: input.sessionId,
        jobId: input.job.id,
        variationId: input.variation.id,
        payload: {
          artifactId: input.artifact.id,
          attempts: input.attempt - 1,
          reason: 'review_pending_confirmation',
          message: 'Review mode is semi_auto; repair is waiting for user confirmation.',
          recoverable: true,
        },
      }))
      return
    }

    await this.enqueueAutomationLoopRepair({
      sessionId: input.sessionId,
      job: input.job,
      variation: input.variation,
      artifact: input.artifact,
      prompt: input.prompt,
      attempt: input.attempt,
    })
  }

  private async publishAutomationLoopStoppedForRepair(
    input: {
      sessionId: string
      job: NonNullable<Awaited<ReturnType<ApplicationRepository['getJobById']>>>
      variation: DesignVariation
      artifact: Artifact
      attempt: number
    },
    reason: 'runtime_unavailable' | 'runtime_contract_mismatch' | 'cancelled',
    message: string,
  ): Promise<void> {
    await this.publishDesignEvent(createDesignEvent({
      type: 'design.loop_stopped',
      sessionId: input.sessionId,
      jobId: input.job.id,
      variationId: input.variation.id,
      payload: {
        artifactId: input.artifact.id,
        attempts: input.attempt,
        reason,
        message,
        recoverable: reason !== 'cancelled',
      },
    }))
  }

  private async analyzeArtifactQuality(
    html: string,
    context?: { jobId?: string | null; variationIndex?: number | null } | string | null,
  ): Promise<ArtifactQualityReport> {
    const qualityContext = typeof context === 'string' || context === null
      ? { jobId: context, variationIndex: null }
      : context
    const profileGate = qualityContext?.jobId
      ? await this.resolveArtifactQualityGateForJob(qualityContext.jobId, qualityContext.variationIndex)
      : null
    const baseQuality = await analyzeHtmlArtifactQualityWithPixelGate(html, {
      enabled: profileGate ? profileGate.qualityGates.includes('pixel') : pixelQualityGateEnabled(),
      timeoutMs: pixelQualityGateTimeoutMs(),
    })
    if (!profileGate?.qualityGates.includes('spec')) return baseQuality
    const specReview = reviewDynamicEncyclopediaSpec({
      html,
      templatePackIds: profileGate.designTemplatePackIds,
      interactionParadigmId: profileGate.interactionParadigmId,
      ...(profileGate.entryContext ? {
        entryTitle: profileGate.entryContext.entryTitle,
        isLanguageCategory: profileGate.entryContext.isLanguageCategory,
        entryContentLanguage: profileGate.entryContext.entryContentLanguage,
        classificationVector: profileGate.entryContext.classificationVector,
      } : {}),
    })
    if (specReview.status === 'pass') return baseQuality
    const specIssues = specReview.findings.map(finding => `${finding.message} ${finding.repairHint}`)
    return {
      status: baseQuality.status === 'fail' || specReview.status === 'fail'
        ? 'fail'
        : baseQuality.status === 'warn' || specReview.status === 'warn'
          ? 'warn'
          : 'pass',
      issues: [...baseQuality.issues, ...specIssues],
      specFindings: [...baseQuality.specFindings ?? [], ...specReview.findings],
    }
  }

  private async resolveArtifactQualityGateForJob(jobId: string, variationIndex?: number | null): Promise<{
    qualityGates: Array<'static' | 'pixel' | 'spec'>
    designTemplatePackIds: string[]
    interactionParadigmId: string | null
    /**
     * 词条上下文（用于百科规范审查的"中文优先"判断）。
     * 仅当 productMode === 'dynamic_encyclopedia_card' 时有意义。
     */
    entryContext: {
      entryTitle: string
      isLanguageCategory: boolean
      entryContentLanguage: EntryContentLanguage
      classificationVector: EncyclopediaClassificationVector | null
    } | null
  } | null> {
    const job = await this.store.getJobById(jobId)
    if (!job) return null
    const requirements = normalizeTemplateRequirements(job.templateRequirements)
    const businessContext = job.templateRequirements.businessContext as Record<string, unknown> | undefined
    const automation = requirements?.capabilitySnapshot?.automation
    if (!automation) return null
    const assignedTemplatePackId = typeof variationIndex === 'number'
      ? assignedTemplatePackIdForVariation(variationIndex, requirements?.variationTemplateAssignments ?? [])
      : null
    const qualityGates = [
      ...new Set([
        ...automation.loopProfile.qualityGates,
        ...(job.productMode === 'dynamic_encyclopedia_card' ? ['spec' as const] : []),
      ]),
    ]
    const entryContext: {
      entryTitle: string
      isLanguageCategory: boolean
      entryContentLanguage: EntryContentLanguage
      classificationVector: EncyclopediaClassificationVector | null
    } | null = job.productMode === 'dynamic_encyclopedia_card' && businessContext
      ? {
          entryTitle: typeof businessContext.entryTitle === 'string' ? businessContext.entryTitle : '',
          isLanguageCategory: businessContext.isLanguageCategory === true,
          entryContentLanguage: isEntryContentLanguage(businessContext.entryContentLanguage) ? businessContext.entryContentLanguage : 'zh',
          classificationVector: isEncyclopediaClassificationVector(businessContext.classificationVector)
            ? businessContext.classificationVector
            : null,
        }
      : null
    return {
      qualityGates,
      designTemplatePackIds: assignedTemplatePackId ? [assignedTemplatePackId] : requirements?.designTemplatePackIds ?? [],
      interactionParadigmId: typeof businessContext?.interactionParadigmId === 'string'
        ? businessContext.interactionParadigmId
        : null,
      entryContext,
    }
  }

  private async nextHtmlArtifactVersion(variationId: string): Promise<number> {
    const detail = await this.store.getVariationDetailSnapshot(variationId)
    const versions = detail?.artifacts
      .filter(artifact => artifact.kind === 'html')
      .map(artifact => artifact.version) ?? []
    return versions.length > 0 ? Math.max(...versions) + 1 : 1
  }

  private async readArtifactHtml(storageKey: string): Promise<string> {
    const artifact = await this.artifacts.get(storageKey)
    return new TextDecoder().decode(artifact.body)
  }

  private async inlineArtifactAssetsForRendering(
    variationId: string,
    htmlArtifact: Artifact,
    html: string,
  ): Promise<string> {
    const assets = await this.store.getVariationAssetArtifacts(variationId, htmlArtifact.id)
    if (assets.length === 0) return html
    const dataUrls = new Map<string, string>()
    for (const asset of assets) {
      if (!asset.entryPath) continue
      const stored = await this.artifacts.get(asset.storageKey)
      dataUrls.set(asset.entryPath, dataUrl(stored.contentType || contentTypeForPath(asset.entryPath), stored.body))
    }
    const baseDir = htmlArtifact.entryPath?.includes('/')
      ? htmlArtifact.entryPath.split('/').slice(0, -1).join('/')
      : ''
    return rewriteHtmlAssetUrls(html, value => {
      const resolved = resolveHtmlAssetPath(value, baseDir)
      return resolved ? dataUrls.get(resolved) ?? value : value
    })
  }

  private async createExportZipArtifact(input: {
    variation: DesignVariation
    sourceArtifact: Artifact
    filename: string
    html: string
    reuseKey?: string
  }): Promise<Artifact> {
    const exportArtifactId = input.reuseKey
      ? `export_${input.sourceArtifact.id}_${input.reuseKey}`
      : `export_${input.sourceArtifact.id}`
    const assets = await this.store.getVariationAssetArtifacts(input.variation.id, input.sourceArtifact.id)
    const files: Array<{ path: string; body: Uint8Array | string }> = [
      {
        path: input.sourceArtifact.entryPath ?? 'index.html',
        body: input.html,
      },
    ]
    for (const asset of assets) {
      if (!asset.entryPath) continue
      const stored = await this.artifacts.get(asset.storageKey)
      files.push({
        path: asset.entryPath,
        body: stored.body,
      })
    }
    const manifest = {
      kind: 'dudesign.export',
      variationId: input.variation.id,
      sourceArtifactId: input.sourceArtifact.id,
      sourceVersion: input.sourceArtifact.version,
      files: files.map(file => file.path),
      exportedAt: new Date().toISOString(),
    }
    const body = createZipArchive([
      ...files,
      {
        path: 'dudesign-export.json',
        body: JSON.stringify(manifest, null, 2),
      },
    ])
    const stored = await this.artifacts.put({
      workspaceId: input.sourceArtifact.workspaceId,
      artifactId: exportArtifactId,
      relativePath: input.filename,
      contentType: 'application/zip',
      body,
      metadata: {
        kind: 'export_zip',
        sourceArtifactId: input.sourceArtifact.id,
        variationId: input.variation.id,
        files: manifest.files.join('\n'),
      },
    })
    return await this.store.createArtifact({
      workspaceId: input.sourceArtifact.workspaceId,
      sessionId: input.sourceArtifact.sessionId,
      variationId: input.variation.id,
      parentArtifactId: input.sourceArtifact.id,
      kind: 'export_zip',
      version: input.sourceArtifact.version,
      storageKey: stored.storageKey,
      entryPath: input.filename,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: {
        sourceArtifactId: input.sourceArtifact.id,
        files: manifest.files,
      },
    })
  }

  private async resolveExportRepairSourceArtifact(artifact: Artifact): Promise<Artifact> {
    if (artifact.kind === 'html') return artifact
    if (artifact.kind !== 'export_zip') {
      throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Export repair requires an HTML or export artifact.')
    }
    const sourceArtifactId = typeof artifact.metadata.sourceArtifactId === 'string'
      ? artifact.metadata.sourceArtifactId
      : artifact.parentArtifactId
    if (!sourceArtifactId) {
      throw createHttpError(400, 'EXPORT_SOURCE_ARTIFACT_MISSING', 'Export artifact does not record its source HTML artifact.')
    }
    const sourceArtifact = await this.store.getArtifactById(sourceArtifactId)
    if (!sourceArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Source artifact not found: ${sourceArtifactId}`)
    if (sourceArtifact.kind !== 'html') throw createHttpError(400, 'ARTIFACT_KIND_UNSUPPORTED', 'Export source artifact must be HTML.')
    return sourceArtifact
  }

  private async findExistingExportArtifact(variationId: string, sourceArtifactId: string): Promise<Artifact | null> {
    return this.store.getExportArtifactForSource(variationId, sourceArtifactId)
  }

  private async resolveDataIntakeArtifactReference(workspaceId: string, artifactId: string | null | undefined): Promise<DataIntakeArtifactReference | undefined> {
    if (!artifactId) return undefined
    const relativePath = 'capabilities/data-intake/analysis.json'
    const storageKey = `${workspaceId}/artifacts/${artifactId}/${relativePath}`
    const stored = await this.artifacts.get(storageKey).catch(() => null)
    if (!stored) throw createHttpError(404, 'DATA_INTAKE_ARTIFACT_NOT_FOUND', `Data intake artifact not found: ${artifactId}`)
    if (stored.metadata.kind !== 'data_intake_analysis') {
      throw createHttpError(400, 'DATA_INTAKE_ARTIFACT_INVALID', `Artifact is not a data intake analysis: ${artifactId}`)
    }
    let parsed: { analysis?: DataIntakeAnalysis; createdAt?: string } = {}
    try {
      parsed = JSON.parse(new TextDecoder().decode(stored.body)) as { analysis?: DataIntakeAnalysis; createdAt?: string }
    } catch {
      throw createHttpError(400, 'DATA_INTAKE_ARTIFACT_INVALID_JSON', `Data intake artifact is not valid JSON: ${artifactId}`)
    }
    const schemaVersion = typeof parsed.analysis?.schemaVersion === 'string'
      ? parsed.analysis.schemaVersion
      : stored.metadata.schemaVersion ?? 'unknown'
    const reviewStatus = parsed.analysis?.reviewStatus === 'auto_reviewed' || parsed.analysis?.reviewStatus === 'human_review_required' || parsed.analysis?.reviewStatus === 'rejected'
      ? parsed.analysis.reviewStatus
      : stored.metadata.reviewStatus === 'auto_reviewed' || stored.metadata.reviewStatus === 'human_review_required' || stored.metadata.reviewStatus === 'rejected'
        ? stored.metadata.reviewStatus
        : 'human_review_required'
    return {
      artifactId,
      storageKey,
      contentHash: stored.metadata.contentHash ?? `sha256:${createHash('sha256').update(stored.body).digest('hex')}`,
      sizeBytes: stored.sizeBytes,
      schemaVersion,
      reviewStatus,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
    }
  }

  private async resolveResearchContextArtifactReferences(workspaceId: string, artifactIds: string[]): Promise<ResearchContextArtifactReference[]> {
    const uniqueArtifactIds = [...new Set(artifactIds.filter(Boolean))]
    const references: ResearchContextArtifactReference[] = []
    for (const artifactId of uniqueArtifactIds) {
      references.push(await this.resolveResearchContextArtifactReference(workspaceId, artifactId))
    }
    return references
  }

  private async resolveResearchContextArtifactReference(workspaceId: string, artifactId: string): Promise<ResearchContextArtifactReference> {
    const relativePath = 'capabilities/research/context.json'
    const storageKey = `${workspaceId}/artifacts/${artifactId}/${relativePath}`
    const stored = await this.artifacts.get(storageKey).catch(() => null)
    if (!stored) throw createHttpError(404, 'RESEARCH_CONTEXT_ARTIFACT_NOT_FOUND', `Research context artifact not found: ${artifactId}`)
    if (stored.metadata.kind !== 'research_context') {
      throw createHttpError(400, 'RESEARCH_CONTEXT_ARTIFACT_INVALID', `Artifact is not a research context: ${artifactId}`)
    }
    let parsed: { researchContext?: ResearchContextArtifact; createdAt?: string } = {}
    try {
      parsed = JSON.parse(new TextDecoder().decode(stored.body)) as { researchContext?: ResearchContextArtifact; createdAt?: string }
    } catch {
      throw createHttpError(400, 'RESEARCH_CONTEXT_ARTIFACT_INVALID_JSON', `Research context artifact is not valid JSON: ${artifactId}`)
    }
    if (!isResearchContextArtifact(parsed.researchContext)) {
      throw createHttpError(400, 'RESEARCH_CONTEXT_ARTIFACT_INVALID_SCHEMA', `Research context artifact has an invalid schema: ${artifactId}`)
    }
    return {
      artifactId,
      storageKey,
      contentHash: stored.metadata.contentHash ?? `sha256:${createHash('sha256').update(stored.body).digest('hex')}`,
      sizeBytes: stored.sizeBytes,
      schemaVersion: parsed.researchContext.schemaVersion,
      reviewStatus: parsed.researchContext.reviewStatus,
      query: parsed.researchContext.query,
      sourceCount: parsed.researchContext.sources.length,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
    }
  }

  private async persistMcpCapabilityArtifacts(
    request: McpInvocationRequest,
    result: McpInvocationResult,
  ): Promise<McpInvocationResult> {
    const withResearchContext = await this.persistMcpResearchContextArtifact(request, result)
    return await this.persistMcpImageGenerationArtifact(request, withResearchContext)
  }

  private async persistMcpResearchContextArtifact(
    request: McpInvocationRequest,
    result: McpInvocationResult,
  ): Promise<McpInvocationResult> {
    if (result.status !== 'ok') return result
    const researchContext = isResearchContextArtifact(result.data?.researchContext)
      ? result.data.researchContext
      : undefined
    if (!researchContext) return result

    const artifactId = createId('rctx')
    const createdAt = result.completedAt
    const body = JSON.stringify({
      kind: 'research_context',
      invocationId: request.invocationId,
      mcpToolId: request.mcpToolId,
      researchContext,
      createdAt,
    }, null, 2)
    const stored = await this.artifacts.put({
      workspaceId: request.workspaceId,
      artifactId,
      relativePath: 'capabilities/research/context.json',
      contentType: 'application/json',
      body,
      metadata: {
        kind: 'research_context',
        invocationId: request.invocationId,
        mcpToolId: request.mcpToolId,
        schemaVersion: researchContext.schemaVersion,
        reviewStatus: researchContext.reviewStatus,
        query: researchContext.query,
      },
    })
    const reference: ResearchContextArtifactReference = {
      artifactId,
      storageKey: stored.storageKey,
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      schemaVersion: researchContext.schemaVersion,
      reviewStatus: researchContext.reviewStatus,
      query: researchContext.query,
      sourceCount: researchContext.sources.length,
      createdAt,
    }
    return {
      ...result,
      data: {
        ...(result.data ?? {}),
        researchContextArtifact: reference,
      },
    }
  }

  private async persistMcpImageGenerationArtifact(
    request: McpInvocationRequest,
    result: McpInvocationResult,
  ): Promise<McpInvocationResult> {
    if (result.status !== 'ok') return result
    const imageGeneration = isImageGenerationArtifact(result.data?.imageGeneration)
      ? result.data.imageGeneration
      : undefined
    if (!imageGeneration) return result

    const artifactId = createId('img')
    const createdAt = result.completedAt
    const persisted: ImageGenerationArtifact = {
      ...imageGeneration,
      artifactId,
      imageUrl: `/api/capability-artifacts/${encodeURIComponent(artifactId)}`,
      createdAt,
    }
    const body = JSON.stringify({
      kind: 'image_generation',
      invocationId: request.invocationId,
      mcpToolId: request.mcpToolId,
      imageGeneration: persisted,
      createdAt,
    }, null, 2)
    const stored = await this.artifacts.put({
      workspaceId: request.workspaceId,
      artifactId,
      relativePath: 'capabilities/image-generation/image.json',
      contentType: 'application/json',
      body,
      metadata: {
        kind: 'image_generation',
        invocationId: request.invocationId,
        mcpToolId: request.mcpToolId,
        schemaVersion: persisted.schemaVersion,
          artifactId,
          provider: persisted.provider,
          model: persisted.model,
        usageContext: persisted.usageContext,
        contentSafetyStatus: persisted.contentSafety.status,
      },
    })

    return {
      ...result,
      references: [{ id: artifactId, title: 'Generated image asset', url: persisted.imageUrl }],
      data: {
        ...(result.data ?? {}),
        imageGeneration: persisted,
        imageGenerationArtifact: {
          artifactId,
          storageKey: stored.storageKey,
          contentHash: stored.contentHash,
          sizeBytes: stored.sizeBytes,
          schemaVersion: persisted.schemaVersion,
          provider: persisted.provider,
          model: persisted.model,
          usageContext: persisted.usageContext,
          contentSafetyStatus: persisted.contentSafety.status,
          costCents: persisted.costCents,
          createdAt,
        },
      },
    }
  }
}

function renderMockVariationHtml(variation: DesignVariation | null, artifact: Artifact | null): string {
  const title = variation?.title ?? 'DUDesign Variation'
  const version = artifact?.version ?? 1
  const variationIndex = variation?.index ?? 1
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; background: #f7f4ed; color: #191714; display: grid; place-items: center; }
      main { width: min(1080px, calc(100vw - 48px)); min-height: 620px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; }
      h1 { font-size: clamp(48px, 8vw, 112px); line-height: 0.92; margin: 0; letter-spacing: 0; }
      p { font-size: 18px; line-height: 1.65; color: #5f5a52; max-width: 560px; }
      .accent { color: #4f46e5; }
      .panel { background: #fffefa; border: 1px solid #e5ded2; border-radius: 8px; padding: 28px; box-shadow: 0 24px 80px rgba(40, 35, 24, 0.12); }
      .invoice { border: 2px solid #191714; padding: 24px; aspect-ratio: 4 / 5; display: grid; align-content: space-between; }
      .row { display: flex; justify-content: space-between; border-bottom: 1px solid #d8d0c2; padding: 12px 0; font-size: 14px; }
      button { border: 0; background: #191714; color: #fffefa; border-radius: 6px; padding: 14px 18px; font-weight: 700; }
      @media (max-width: 760px) { main { grid-template-columns: 1fr; padding: 32px 0; } h1 { font-size: 56px; } }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Send the invoice.<br />Get <span class="accent">paid</span> faster.</h1>
        <p>Mock preview for ${escapeHtml(title)} version ${version}. This hosted artifact proves the DUDesign API can create variations, attach artifacts, and serve iframe-ready HTML before the real BabeL-O adapter is connected.</p>
        <button>${version > 1 ? 'Refined version' : 'Start free'}</button>
      </section>
      <section class="panel">
        <div class="invoice">
          <strong>Invoice #${escapeHtml(variationIndex.toString().padStart(2, '0'))} · v${version}</strong>
          <div>
            <div class="row"><span>Design exploration</span><strong>$2,400</strong></div>
            <div class="row"><span>Frontend build</span><strong>$900</strong></div>
            <div class="row"><span>Final polish</span><strong>$700</strong></div>
          </div>
          <strong>Total due: $4,000</strong>
        </div>
      </section>
    </main>
  </body>
</html>`
}

function validateVariationCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw createHttpError(400, 'INVALID_VARIATION_COUNT', 'variationCount must be an integer from 1 to 6.')
  }
}

function normalizeTemplateRequirements(value: Record<string, unknown>): CreateDesignJobRequest['templateRequirements'] {
  return {
    styles: Array.isArray(value.styles) ? value.styles.filter((item): item is string => typeof item === 'string') : undefined,
    deviceTargets: Array.isArray(value.deviceTargets)
      ? value.deviceTargets.filter((item): item is 'desktop' | 'tablet' | 'mobile' => item === 'desktop' || item === 'tablet' || item === 'mobile')
      : undefined,
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    advancedConstraints: normalizeAdvancedTemplateConstraints(value.advancedConstraints),
    capabilitySnapshot: isCapabilitySnapshot(value.capabilitySnapshot) ? value.capabilitySnapshot : undefined,
    designTemplatePackIds: Array.isArray(value.designTemplatePackIds)
      ? value.designTemplatePackIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    designTemplatePacks: Array.isArray(value.designTemplatePacks)
      ? value.designTemplatePacks.filter(isDesignTemplatePack)
      : undefined,
    interactionParadigm: isInteractionParadigm(value.interactionParadigm) ? value.interactionParadigm : undefined,
    dataIntakeArtifactId: typeof value.dataIntakeArtifactId === 'string' ? value.dataIntakeArtifactId : undefined,
    dataIntake: isDataIntakeArtifactReference(value.dataIntake) ? value.dataIntake : undefined,
    researchContextArtifactIds: Array.isArray(value.researchContextArtifactIds)
      ? value.researchContextArtifactIds.filter((item): item is string => typeof item === 'string')
      : undefined,
    researchContexts: Array.isArray(value.researchContexts)
      ? value.researchContexts.filter(isResearchContextArtifactReference)
      : undefined,
    imageGenerationArtifacts: Array.isArray(value.imageGenerationArtifacts)
      ? value.imageGenerationArtifacts.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      : undefined,
    businessContext: isDynamicEncyclopediaBusinessContext(value.businessContext) ? value.businessContext : undefined,
    variationTemplateAssignments: Array.isArray(value.variationTemplateAssignments)
      ? value.variationTemplateAssignments.filter(isVariationTemplateAssignment)
      : undefined,
  }
}

function assignDesignTemplatePacks(
  variationCount: number,
  designTemplatePacks: DesignTemplatePack[],
): NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['variationTemplateAssignments']> {
  if (designTemplatePacks.length === 0) return []
  return Array.from({ length: variationCount }, (_, index) => {
    const template = designTemplatePacks[index % designTemplatePacks.length]!
    return {
      variationIndex: index + 1,
      designTemplatePackId: template.id,
      designTemplatePack: template,
    }
  })
}

function templatePackSupportsProductMode(
  template: DesignTemplatePack,
  productMode: CreateDesignJobRequest['productMode'],
): boolean {
  if (!productMode) return true
  const supportedProductModes = template.supportedProductModes ?? []
  if (supportedProductModes.length > 0) return supportedProductModes.includes(productMode)
  if (productMode !== 'dynamic_encyclopedia_card') return true
  return template.parentPackId === 'dtp_dynamic_encyclopedia_card'
    || template.id === 'dtp_dynamic_encyclopedia_card'
    || template.id.startsWith('dtp_de_')
}

function assignedTemplatePackForVariation(
  variationIndex: number,
  assignments: NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['variationTemplateAssignments']>,
): DesignTemplatePack | null {
  return assignments.find(assignment => assignment.variationIndex === variationIndex)?.designTemplatePack ?? null
}

function assignedTemplatePackIdForVariation(
  variationIndex: number,
  assignments: NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['variationTemplateAssignments']>,
): string | null {
  return assignments.find(assignment => assignment.variationIndex === variationIndex)?.designTemplatePackId ?? null
}

function automationTemplateSummaryForVariation(variationIndex: number, templateRequirements: Record<string, unknown>): string | null {
  const normalized = normalizeTemplateRequirements(templateRequirements)
  const templatePack = assignedTemplatePackForVariation(variationIndex, normalized?.variationTemplateAssignments ?? [])
  if (!templatePack) return null
  return [
    templatePack.name,
    templatePack.description,
    templatePack.rationale.overview,
    ...templatePack.rationale.dos.slice(0, 3).map(item => `Do: ${item}`),
    ...templatePack.rationale.donts.slice(0, 3).map(item => `Do not: ${item}`),
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join('\n')
}

function automationRepairPromptPreview(prompt: string): string {
  return prompt.slice(0, AUTOMATION_REPAIR_PROMPT_PREVIEW_LENGTH)
}

function reviewModeFromTemplateRequirements(requirements: CreateDesignJobRequest['templateRequirements'] | null | undefined): ReviewMode {
  const mode = requirements?.businessContext?.reviewMode
  return mode === 'off' || mode === 'semi_auto' || mode === 'auto' ? mode : 'auto'
}

function loopStoppedEventReason(reason: AutomationLoopStopReason | null): Exclude<AutomationLoopStopReason, 'quality_passed'> {
  return reason && reason !== 'quality_passed' ? reason : 'quality_failed'
}

function isVariationTemplateAssignment(value: unknown): value is NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['variationTemplateAssignments']>[number] {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.variationIndex === 'number'
    && typeof record.designTemplatePackId === 'string'
    && isDesignTemplatePack(record.designTemplatePack)
}

function isInteractionParadigm(value: unknown): value is InteractionParadigm {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.category === 'string'
    && typeof record.description === 'string'
    && Array.isArray(record.bestFor)
    && Array.isArray(record.avoidFor)
    && Array.isArray(record.requiredDataShape)
    && Array.isArray(record.compatibleTemplatePackIds)
}

function isDynamicEncyclopediaBusinessContext(value: unknown): value is NonNullable<NonNullable<CreateDesignJobRequest['templateRequirements']>['businessContext']> {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (!('guidanceId' in record) || typeof record.guidanceId === 'string')
    && (!('entryTitle' in record) || typeof record.entryTitle === 'string')
    && (!('entryPrimaryCategory' in record) || typeof record.entryPrimaryCategory === 'string')
    && (!('entrySecondaryCategory' in record) || typeof record.entrySecondaryCategory === 'string')
    && (!('entryTertiaryCategory' in record) || typeof record.entryTertiaryCategory === 'string')
    && (!('classification' in record) || isDynamicEncyclopediaClassificationSnapshot(record.classification))
    && (!('interactionParadigmId' in record) || typeof record.interactionParadigmId === 'string')
    && (!('interactionParadigm' in record) || isInteractionParadigm(record.interactionParadigm))
    && (!('recommendedTemplateIds' in record) || (Array.isArray(record.recommendedTemplateIds) && record.recommendedTemplateIds.every(item => typeof item === 'string')))
    && (!('childTemplates' in record) || (Array.isArray(record.childTemplates) && record.childTemplates.every(isDynamicEncyclopediaChildTemplateSnapshot)))
    && (!('automationMode' in record) || record.automationMode === 'off' || record.automationMode === 'semi_auto' || record.automationMode === 'auto')
    && (!('reviewMode' in record) || record.reviewMode === 'off' || record.reviewMode === 'semi_auto' || record.reviewMode === 'auto')
}

function isDynamicEncyclopediaClassificationSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.l1 === 'string'
    && typeof record.l2 === 'string'
    && typeof record.l3 === 'string'
    && typeof record.confidence === 'number'
    && Array.isArray(record.signals)
    && record.signals.every(item => typeof item === 'string')
    && record.source === 'mock_rules'
}

function isDynamicEncyclopediaChildTemplateSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.designTemplatePackId === 'string'
    && typeof record.interactionParadigmId === 'string'
    && typeof record.selected === 'boolean'
    && typeof record.confidence === 'number'
    && typeof record.reason === 'string'
}

function isDataIntakeArtifactReference(value: unknown): value is DataIntakeArtifactReference {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.artifactId === 'string'
    && typeof record.storageKey === 'string'
    && typeof record.contentHash === 'string'
    && typeof record.sizeBytes === 'number'
    && typeof record.schemaVersion === 'string'
    && (record.reviewStatus === 'auto_reviewed' || record.reviewStatus === 'human_review_required' || record.reviewStatus === 'rejected')
}

function isResearchContextArtifactReference(value: unknown): value is ResearchContextArtifactReference {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.artifactId === 'string'
    && typeof record.storageKey === 'string'
    && typeof record.contentHash === 'string'
    && typeof record.sizeBytes === 'number'
    && typeof record.schemaVersion === 'string'
    && typeof record.query === 'string'
    && typeof record.sourceCount === 'number'
    && (record.reviewStatus === 'auto_reviewed' || record.reviewStatus === 'human_review_required' || record.reviewStatus === 'rejected')
}

function isResearchContextArtifact(value: unknown): value is ResearchContextArtifact {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.schemaVersion === 'string'
    && typeof record.query === 'string'
    && Array.isArray(record.sources)
    && record.sources.every(isResearchContextSource)
    && typeof record.summary === 'string'
    && Array.isArray(record.citations)
    && record.citations.every(isResearchContextCitation)
    && (record.confidence === 'low' || record.confidence === 'medium' || record.confidence === 'high')
    && (record.freshness === 'unknown' || record.freshness === 'stale' || record.freshness === 'recent')
    && Array.isArray(record.riskFlags)
    && record.riskFlags.every(item => typeof item === 'string')
    && typeof record.rawPayloadHash === 'string'
    && (record.reviewStatus === 'auto_reviewed' || record.reviewStatus === 'human_review_required' || record.reviewStatus === 'rejected')
}

function isImageGenerationArtifact(value: unknown): value is ImageGenerationArtifact {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const safety = record.contentSafety
  return record.schemaVersion === '2026-07-06.dudesign-image-generation-artifact.v1'
    && typeof record.provider === 'string'
    && typeof record.model === 'string'
    && typeof record.promptHash === 'string'
    && typeof record.imageUrl === 'string'
    && typeof record.size === 'string'
    && typeof record.watermark === 'boolean'
    && typeof record.usageContext === 'string'
    && typeof record.contentType === 'string'
    && safety !== null
    && typeof safety === 'object'
    && !Array.isArray(safety)
    && (safety as Record<string, unknown>).status !== 'blocked'
    && ((safety as Record<string, unknown>).status === 'passed' || (safety as Record<string, unknown>).status === 'review_required')
    && ((safety as Record<string, unknown>).policy === 'standard' || (safety as Record<string, unknown>).policy === 'strict')
    && typeof record.costCents === 'number'
    && typeof record.createdAt === 'string'
}

function isResearchContextSource(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.url === 'string'
    && typeof record.retrievedAt === 'string'
    && (record.platform === undefined
      || record.platform === 'web'
      || record.platform === 'github'
      || record.platform === 'social'
      || record.platform === 'video'
      || record.platform === 'community'
      || record.platform === 'unknown')
}

function isResearchContextCitation(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.sourceUrl === 'string'
    && typeof record.note === 'string'
    && (record.quote === undefined || typeof record.quote === 'string')
}

function isDesignTemplatePack(value: unknown): value is DesignTemplatePack {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.schemaVersion === 'string'
    && typeof record.designTokens === 'object'
    && typeof record.rationale === 'object'
}

function fallbackDesignTemplatePackFromVariation(variation: DesignVariation, job: { id: string; prompt: string }): DesignTemplatePack {
  return {
    schemaVersion: DESIGN_TEMPLATE_PACK_SCHEMA_VERSION,
    id: createId('dtp_fallback'),
    source: 'user',
    format: 'dudesign-template-v1',
    visibility: 'private',
    status: 'draft',
    name: `${variation.title ?? `Variation ${variation.index}`} Template`,
    description: `Template inferred from job prompt: ${job.prompt.slice(0, 120)}`,
    version: '1.0.0',
    designTokens: {
      colors: {},
      typography: {},
      spacing: {},
      rounded: {},
      components: {},
    },
    rationale: {
      overview: `Saved from ${variation.title ?? `variation ${variation.index}`}.`,
      colors: null,
      typography: null,
      layout: null,
      elevation: null,
      shapes: null,
      components: null,
      dos: ['Preserve the saved variation direction as reusable inspiration.'],
      donts: ['Do not copy public brand trade dress or proprietary assets.'],
      sections: {},
    },
    previewArtifactId: null,
    lintStatus: 'unknown',
    createdByUserId: null,
  }
}

function normalizeAdvancedTemplateConstraints(value: unknown): AdvancedTemplateConstraints | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  return {
    colorPaletteId: typeof record.colorPaletteId === 'string' ? record.colorPaletteId : null,
    styleNotes: Array.isArray(record.styleNotes) ? record.styleNotes.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined,
    brandStyleReferenceId: typeof record.brandStyleReferenceId === 'string' ? record.brandStyleReferenceId : null,
    referenceBrand: typeof record.referenceBrand === 'string' ? record.referenceBrand : null,
    negativeRequirements: Array.isArray(record.negativeRequirements)
      ? record.negativeRequirements.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined,
  }
}

function runtimeModelsToModelServices(runtimeModels: RuntimeModels): ModelService[] {
  const now = runtimeModels.syncedAt
  return runtimeModels.providers.flatMap(provider =>
    provider.models
      .filter(model => model.id && model.id !== 'unknown')
      .map(model => {
        const longContext = model.contextWindow >= 64000
        return {
          id: runtimeModelServiceId(provider.id, model.id),
          provider: 'babel-o',
          modelId: model.id,
          displayName: model.name || model.id,
          description: `${provider.displayName} model discovered from BabeL-O runtime.`,
          enabled: false,
          isDefault: false,
          capabilities: [
            'html_generation',
            'html_refine',
            ...(longContext ? ['long_context'] as const : []),
          ],
          contextWindow: model.contextWindow || null,
          inputTokenCostCents: 0,
          outputTokenCostCents: 0,
          metadata: {
            source: 'runtime_discovery',
            runtime: 'babel-o',
            runtimeSyncedAt: now,
            runtimeVersion: runtimeModels.version,
            runtimeDefaultModel: runtimeModels.defaultModel,
            runtimeActiveProfile: runtimeModels.activeProfile ?? null,
            runtimeProviderId: provider.id,
            runtimeProviderName: provider.displayName,
            runtimeProviderAdapter: provider.adapter,
            runtimeProviderAuthMode: provider.authMode,
            runtimeProviderConfigured: provider.configured,
            runtimeProviderAuthConfigured: provider.authConfigured,
            runtimeProviderAuthSource: provider.authSource,
            runtimeProviderActive: provider.active,
            runtimeProviderDefaultModel: provider.defaultModel,
            runtimeModelDefaultMaxTokens: model.defaultMaxTokens,
            runtimeModelCapabilities: model.capabilities,
          },
          createdAt: now,
          updatedAt: now,
        } satisfies ModelService
      }),
  )
}

function runtimeModelServiceId(providerId: string, modelId: string): string {
  return `mdl_runtime_${slugId(`${providerId}_${modelId}`)}`
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 96) || 'model'
}

function isCapabilitySnapshot(value: unknown): value is NonNullable<CreateDesignJobRequest['templateRequirements']>['capabilitySnapshot'] {
  return Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).schemaVersion === 'string')
}

function auditAuthorizationMetadata(authorization: McpInvocationAuthorization): Record<string, unknown> {
  if (authorization.status === 'denied') {
    return {
      status: authorization.status,
      code: authorization.code,
      message: authorization.message,
    }
  }
  return {
    status: authorization.status,
    bindingId: authorization.binding.id,
    serverName: authorization.binding.serverName,
    toolName: authorization.binding.toolName,
    scopes: authorization.binding.scopes,
    requiresUserAuth: authorization.binding.requiresUserAuth,
  }
}

function adminMcpInvocationAuditEntry(record: McpInvocationAuditRecord): AdminMcpInvocationAuditResponse['invocations'][number] {
  return {
    invocationId: record.invocationId,
    replayKey: record.replayKey,
    userId: record.request.userId,
    workspaceId: record.request.workspaceId,
    sessionId: record.request.sessionId,
    jobId: record.request.jobId,
    variationId: record.request.variationId ?? null,
    mcpToolId: record.request.mcpToolId,
    serverName: record.request.serverName,
    toolName: record.request.toolName,
    mode: record.request.mode,
    status: record.result.status,
    summary: adminAuditPreview(record.result.summary, 220) ?? '',
    errorCode: record.result.error?.code ?? null,
    errorMessage: adminAuditPreview(record.result.error?.message ?? null, 220),
    policySnapshotHash: record.policySnapshotHash,
    runtimeContractVersion: record.runtimeContractVersion,
    referenceCount: record.result.references.length,
    requestedAt: record.request.requestedAt,
    completedAt: record.completedAt,
  }
}

function mcpInvocationTotals(records: McpInvocationAuditRecord[]): AdminMcpInvocationSummaryResponse['totals'] {
  const counts = mcpStatusCounts(records)
  return {
    ...counts,
    successRate: ratio(counts.okCount, counts.totalCount),
    unavailableRate: ratio(counts.unavailableCount, counts.totalCount),
  }
}

function mcpToolHealthSummaries(records: McpInvocationAuditRecord[]): AdminMcpToolHealthSummary[] {
  const groups = new Map<string, McpInvocationAuditRecord[]>()
  for (const record of records) {
    const existing = groups.get(record.request.mcpToolId) ?? []
    existing.push(record)
    groups.set(record.request.mcpToolId, existing)
  }
  return [...groups.entries()]
    .map(([mcpToolId, toolRecords]) => {
      const sorted = [...toolRecords].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      const latest = sorted[0] ?? null
      const counts = mcpStatusCounts(sorted)
      return {
        mcpToolId,
        serverName: latest?.request.serverName ?? '',
        toolName: latest?.request.toolName ?? '',
        ...counts,
        successRate: ratio(counts.okCount, counts.totalCount),
        unavailableRate: ratio(counts.unavailableCount, counts.totalCount),
        lastStatus: latest?.result.status ?? null,
        lastErrorCode: latest?.result.error?.code ?? null,
        lastErrorMessage: adminAuditPreview(latest?.result.error?.message ?? null, 180),
        lastInvokedAt: latest?.completedAt ?? null,
        lastReplayKey: latest?.replayKey ?? null,
      }
    })
    .sort((a, b) => (b.lastInvokedAt ?? '').localeCompare(a.lastInvokedAt ?? ''))
}

function democaseMcpHealthSummary(records: McpInvocationAuditRecord[]): AdminMcpInvocationSummaryResponse['democase'] {
  const democaseRecords = records.filter(record => record.request.mcpToolId === 'mcp_encyclopedia_democase_readonly')
  const sorted = [...democaseRecords].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  const latest = sorted[0] ?? null
  const counts = mcpStatusCounts(sorted)
  return {
    mcpToolId: 'mcp_encyclopedia_democase_readonly',
    totalCount: counts.totalCount,
    okCount: counts.okCount,
    unavailableCount: counts.unavailableCount,
    errorCount: counts.errorCount,
    healthStatus: democaseHealthStatus(counts, latest),
    lastInvokedAt: latest?.completedAt ?? null,
    lastErrorCode: latest?.result.error?.code ?? null,
    lastErrorMessage: adminAuditPreview(latest?.result.error?.message ?? null, 180),
  }
}

function mcpStatusCounts(records: McpInvocationAuditRecord[]): {
  totalCount: number
  okCount: number
  deniedCount: number
  unavailableCount: number
  errorCount: number
} {
  return records.reduce((counts, record) => {
    counts.totalCount += 1
    if (record.result.status === 'ok') counts.okCount += 1
    else if (record.result.status === 'denied') counts.deniedCount += 1
    else if (record.result.status === 'unavailable') counts.unavailableCount += 1
    else counts.errorCount += 1
    return counts
  }, {
    totalCount: 0,
    okCount: 0,
    deniedCount: 0,
    unavailableCount: 0,
    errorCount: 0,
  })
}

function democaseHealthStatus(
  counts: ReturnType<typeof mcpStatusCounts>,
  latest: McpInvocationAuditRecord | null,
): AdminMcpInvocationSummaryResponse['democase']['healthStatus'] {
  if (!latest || counts.totalCount === 0) return 'no_data'
  if (latest.result.status === 'unavailable' || latest.result.status === 'error') return 'unavailable'
  if (counts.unavailableCount > 0 || counts.errorCount > 0 || counts.deniedCount > 0) return 'degraded'
  return 'healthy'
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 1000) / 1000
}

function cleanFilterValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function validMcpInvocationStatus(value: unknown): value is McpInvocationResult['status'] {
  return value === 'ok' || value === 'denied' || value === 'unavailable' || value === 'error'
}

function recordInIsoRange(value: string, from?: string, to?: string): boolean {
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function adminAuditPreview(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}...`
}

function mcpAuthorizationResult(
  request: McpInvocationRequest,
  authorization: McpInvocationAuthorization,
  completedAt: string,
): McpInvocationResult {
  if (authorization.status === 'denied') {
    return {
      invocationId: request.invocationId,
      status: 'denied',
      mcpToolId: request.mcpToolId,
      source: {
        serverName: request.serverName,
        toolName: request.toolName,
        scopes: request.scopes,
      },
      summary: 'MCP invocation denied before execution.',
      references: [],
      error: {
        code: authorization.code,
        message: authorization.message,
        retryable: false,
      },
      completedAt,
    }
  }
  return {
    invocationId: request.invocationId,
    status: 'ok',
    mcpToolId: request.mcpToolId,
    source: {
      serverName: request.serverName,
      toolName: request.toolName,
      scopes: request.scopes,
    },
    summary: 'MCP invocation authorized; execution pending.',
    references: [],
    data: {
      authorizationStatus: 'authorized',
      mode: request.mode,
    },
    completedAt,
  }
}

function mcpPolicySnapshotHash(pluginSnapshot: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(pluginSnapshot ?? null))
    .digest('hex')
}

function withCapabilityPreferenceDefaults(value: UserCapabilityPreference | null | undefined): UserCapabilityPreference {
  const defaults = listCapabilities().defaults
  return normalizeCapabilityPreference({
    domainTemplateId: value?.domainTemplateId ?? defaults.domainTemplateId,
    aestheticProfileId: value?.aestheticProfileId ?? defaults.aestheticProfileId,
    colorPaletteId: value?.colorPaletteId ?? defaults.colorPaletteId,
    brandStyleReferenceId: value?.brandStyleReferenceId ?? defaults.brandStyleReferenceId,
    loopProfileId: value?.loopProfileId ?? defaults.loopProfileId,
    designTemplatePackId: value?.designTemplatePackId ?? null,
    skillId: value?.skillId ?? null,
    mcpToolId: value?.mcpToolId ?? null,
    advancedConstraints: value?.advancedConstraints ?? null,
  })
}

function normalizeCapabilityPreference(input: Partial<UserCapabilityPreference>): UserCapabilityPreference {
  const capabilities = listCapabilities()
  const defaults = capabilities.defaults
  const domainTemplateId = capabilities.domainTemplates.some(item => item.id === input.domainTemplateId)
    ? input.domainTemplateId!
    : defaults.domainTemplateId
  const aestheticProfileId = capabilities.aestheticProfiles.some(item => item.id === input.aestheticProfileId)
    ? input.aestheticProfileId!
    : defaults.aestheticProfileId
  const aesthetic = capabilities.aestheticProfiles.find(item => item.id === aestheticProfileId)
  const colorPaletteId = capabilities.colorPalettes.some(item => item.id === input.colorPaletteId)
    && (!aesthetic || aesthetic.colorPaletteIds.includes(input.colorPaletteId!))
    ? input.colorPaletteId!
    : defaults.colorPaletteId
  const loopProfileId = capabilities.automationLoopProfiles.some(item => item.id === input.loopProfileId)
    ? input.loopProfileId!
    : defaults.loopProfileId
  const brandStyleReferenceId = input.brandStyleReferenceId && capabilities.brandStyleReferences.some(item => item.id === input.brandStyleReferenceId)
    ? input.brandStyleReferenceId
    : defaults.brandStyleReferenceId
  const designTemplatePackId = typeof input.designTemplatePackId === 'string' && input.designTemplatePackId.trim()
    ? input.designTemplatePackId
    : null
  const skillId = input.skillId && capabilities.skills.some(item => item.id === input.skillId)
    ? input.skillId
    : null
  const mcpToolId = input.mcpToolId && capabilities.mcpToolBindings.some(item => item.id === input.mcpToolId)
    ? input.mcpToolId
    : null
  return {
    domainTemplateId,
    aestheticProfileId,
    colorPaletteId,
    brandStyleReferenceId,
    loopProfileId,
    designTemplatePackId,
    skillId,
    mcpToolId,
    advancedConstraints: normalizeAdvancedConstraints(input.advancedConstraints),
  }
}

function normalizeAdvancedConstraints(input: UserCapabilityPreference['advancedConstraints'] | undefined): UserCapabilityPreference['advancedConstraints'] {
  if (!input) return null
  return {
    colorPaletteId: typeof input.colorPaletteId === 'string' ? input.colorPaletteId : null,
    styleNotes: Array.isArray(input.styleNotes) ? input.styleNotes.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
    brandStyleReferenceId: typeof input.brandStyleReferenceId === 'string' ? input.brandStyleReferenceId : null,
    referenceBrand: typeof input.referenceBrand === 'string' ? input.referenceBrand.slice(0, 120) : null,
    negativeRequirements: Array.isArray(input.negativeRequirements) ? input.negativeRequirements.filter((item): item is string => typeof item === 'string').slice(0, 12) : [],
  }
}

function modelContextFromTemplateRequirements(value: Record<string, unknown>): {
  modelServiceId?: string
  modelId?: string
  modelProvider?: string
} {
  const modelServiceId = stringValue(value.modelServiceId)
  const modelId = stringValue(value.modelId)
  const modelProvider = stringValue(value.modelProvider)
  return {
    ...(modelServiceId && { modelServiceId }),
    ...(modelId && { modelId }),
    ...(modelProvider && { modelProvider }),
  }
}

function normalizeEntryTitle(rawInput: string): string {
  const firstLine = rawInput.split(/\r?\n/).find(line => line.trim().length > 0)?.trim() ?? rawInput.trim()
  return firstLine
    .replace(/^词条[:：]\s*/u, '')
    .replace(/[。；;，,].*$/u, '')
    .slice(0, 80)
}

function classifyEncyclopediaEntry(text: string): {
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory: string
  confidence: number
  signals: string[]
} {
  const normalized = text.toLowerCase()
  const signals: string[] = []
  const has = (patterns: string[]) => {
    const matched = patterns.filter(pattern => normalized.includes(pattern.toLowerCase()))
    signals.push(...matched)
    return matched.length > 0
  }

  if (has(['电影', '影片', '院线', '上映', '票房', '导演', '主演', '演员表', '系列电影', '续集', '前传', '翻拍', '同ip', '同IP', '相似电影'])) {
    return { primaryCategory: '影视作品', secondaryCategory: '电影', tertiaryCategory: filmTertiaryCategory(normalized), confidence: 0.86, signals: [...new Set(signals)] }
  }
  if (has(['电视剧', '剧集', '连续剧', '播出', '集数', '季数', '分集剧情', '角色关系', '角色是谁', '伏笔', '追剧'])) {
    return { primaryCategory: '影视作品', secondaryCategory: '电视剧', tertiaryCategory: tvTertiaryCategory(normalized), confidence: 0.86, signals: [...new Set(signals)] }
  }
  if (has(['历史人物', '皇帝', '帝王', '君臣', '血缘', '家族关系', '师承', '对手', '朝代', '变法', '战役'])) {
    return { primaryCategory: '名人', secondaryCategory: '历史人物', tertiaryCategory: historyPersonTertiaryCategory(normalized), confidence: 0.84, signals: [...new Set(signals)] }
  }
  if (has(['成语', '词语', '释义', '意思', '含义', '读音', '拼音', '出处', '典故', '寓言', '近义词', '反义词', '辨析', '造句'])) {
    return { primaryCategory: '知识术语', secondaryCategory: '文化类词语', tertiaryCategory: culturalPhraseTertiaryCategory(normalized), confidence: 0.82, signals: [...new Set(signals)] }
  }
  if (has(['景区', '景点', '风景区', '旅游区', '公园', '导览', '路线', '游览', '坐标', '地图', 'poi', 'POI', '必看景点', '推荐路线'])) {
    return { primaryCategory: '地域建筑', secondaryCategory: '景区景点', tertiaryCategory: scenicSpotTertiaryCategory(normalized), confidence: 0.84, signals: [...new Set(signals)] }
  }
  if (has(['公司', '企业', '集团', '融资', '上市', '创始人', 'ceo', '产品线'])) {
    return { primaryCategory: '机构组织', secondaryCategory: '企业', tertiaryCategory: organizationTertiaryCategory(normalized), confidence: 0.84, signals: [...new Set(signals)] }
  }
  if (has(['大学', '学院', '学校', '校区', '学科'])) {
    return { primaryCategory: '机构组织', secondaryCategory: '学校', tertiaryCategory: normalized.includes('校区') ? '校区院系' : '教育机构', confidence: 0.82, signals: [...new Set(signals)] }
  }
  if (has(['人物', '出生', '逝世', '演员', '导演', '作家', '科学家', '歌手', '运动员'])) {
    return { primaryCategory: '名人', secondaryCategory: normalized.includes('历史') ? '历史人物' : '娱乐明星', tertiaryCategory: personTertiaryCategory(normalized), confidence: 0.8, signals: [...new Set(signals)] }
  }
  if (has(['小说', '文学', '作者', '出版', '章节', '诗歌'])) {
    return { primaryCategory: '文学著作', secondaryCategory: normalized.includes('诗') ? '诗歌' : '小说著作', tertiaryCategory: normalized.includes('诗') ? '诗歌作品' : '小说作品', confidence: 0.79, signals: [...new Set(signals)] }
  }
  if (has(['游戏', '玩法', '关卡', '角色', '发行', '平台'])) {
    return { primaryCategory: '游戏', secondaryCategory: '电子游戏', tertiaryCategory: normalized.includes('角色') ? '角色玩法' : '发行平台', confidence: 0.78, signals: [...new Set(signals)] }
  }
  if (has(['产品', '设备', '型号', '参数', '发布', '功能'])) {
    return { primaryCategory: '物品产品', secondaryCategory: '产品设备', tertiaryCategory: normalized.includes('参数') || normalized.includes('型号') ? '参数型号' : '功能产品', confidence: 0.72, signals: [...new Set(signals)] }
  }
  if (has(['概念', '定义', '理论', '技术', '算法', '协议', '模型'])) {
    return { primaryCategory: '知识术语', secondaryCategory: normalized.includes('算法') || normalized.includes('模型') || normalized.includes('协议') ? '技术模型' : '概念定义', tertiaryCategory: normalized.includes('算法') || normalized.includes('模型') || normalized.includes('协议') ? '技术模型' : '概念定义', confidence: 0.74, signals: [...new Set(signals)] }
  }
  return { primaryCategory: '知识术语', secondaryCategory: '概念定义', tertiaryCategory: '通用', confidence: 0.52, signals: ['fallback'] }
}

function organizationTertiaryCategory(normalized: string): string {
  if (normalized.includes('融资') || normalized.includes('上市')) return '融资上市'
  if (normalized.includes('产品线') || normalized.includes('产品')) return '产品业务'
  if (normalized.includes('人工智能') || normalized.includes('知识服务') || normalized.includes('搜索')) return '知识服务'
  return '企业概况'
}

function personTertiaryCategory(normalized: string): string {
  if (normalized.includes('演员') || normalized.includes('导演') || normalized.includes('歌手')) return '文艺人物'
  if (normalized.includes('科学家') || normalized.includes('学者')) return '学术人物'
  if (normalized.includes('运动员')) return '体育人物'
  return '人物概况'
}

function historyPersonTertiaryCategory(normalized: string): string {
  if (normalized.includes('皇帝') || normalized.includes('帝王') || normalized.includes('君主')) return '帝王君主'
  if (normalized.includes('将军') || normalized.includes('战役') || normalized.includes('名将')) return '将相军事'
  if (normalized.includes('诗') || normalized.includes('文学') || normalized.includes('词')) return '文人学者'
  if (normalized.includes('女性') || normalized.includes('皇后') || normalized.includes('公主')) return '女性历史人物'
  return '历史人物概况'
}

function filmTertiaryCategory(normalized: string): string {
  if (normalized.includes('悬疑') || normalized.includes('犯罪') || normalized.includes('惊悚')) return '悬疑犯罪片'
  if (normalized.includes('科幻') || normalized.includes('奇幻')) return '科幻奇幻片'
  if (normalized.includes('动作') || normalized.includes('战争')) return '动作战争片'
  if (normalized.includes('爱情') || normalized.includes('剧情') || normalized.includes('文艺')) return '爱情剧情片'
  if (normalized.includes('动画') || normalized.includes('喜剧')) return '喜剧动画片'
  return '电影作品概况'
}

function tvTertiaryCategory(normalized: string): string {
  if (normalized.includes('悬疑') || normalized.includes('刑侦') || normalized.includes('犯罪')) return '悬疑刑侦剧'
  if (normalized.includes('古装') || normalized.includes('历史') || normalized.includes('权谋')) return '古装历史剧'
  if (normalized.includes('都市') || normalized.includes('情感')) return '都市情感剧'
  if (normalized.includes('科幻') || normalized.includes('奇幻')) return '科幻奇幻剧'
  if (normalized.includes('季') || normalized.includes('系列')) return '系列季播剧'
  return '电视剧作品概况'
}

function culturalPhraseTertiaryCategory(normalized: string): string {
  if (normalized.includes('典故') || normalized.includes('故事') || normalized.includes('寓言') || normalized.includes('出处')) return '出处典故'
  if (normalized.includes('近义词') || normalized.includes('反义词') || normalized.includes('关联')) return '关联词语'
  if (normalized.includes('辨析') || normalized.includes('区别') || normalized.includes('易混')) return '词义辨析'
  if (normalized.includes('读音') || normalized.includes('拼音')) return '读音字形'
  return '文化词语概况'
}

function scenicSpotTertiaryCategory(normalized: string): string {
  if (normalized.includes('路线') || normalized.includes('导览') || normalized.includes('游览')) return '导览路线'
  if (normalized.includes('坐标') || normalized.includes('地图') || normalized.includes('poi')) return '地图坐标'
  if (normalized.includes('公园')) return '公园景点'
  if (normalized.includes('风景区') || normalized.includes('旅游区')) return '风景旅游区'
  return '景区概况'
}

function applyDemocaseClassification(
  classification: {
    primaryCategory: string
    secondaryCategory: string
    tertiaryCategory: string
    confidence: number
    signals: string[]
  },
  democaseMatches: EncyclopediaDemocaseMatch[],
): {
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory: string
  confidence: number
  signals: string[]
} {
  const bestMatch = democaseMatches[0]
  if (!bestMatch || bestMatch.score < 0.2) return classification
  return {
    primaryCategory: bestMatch.primaryCategory,
    secondaryCategory: bestMatch.secondaryCategory,
    tertiaryCategory: classification.tertiaryCategory,
    confidence: Math.max(classification.confidence, Math.min(0.92, 0.72 + bestMatch.score)),
    signals: [...new Set([...classification.signals.filter(signal => signal !== 'fallback'), ...bestMatch.matchedKeywords])],
  }
}

function buildEncyclopediaClassificationVector(
  classification: {
    primaryCategory: string
    secondaryCategory: string
    tertiaryCategory: string
    confidence: number
    signals: string[]
  },
  preferredTemplateIds: string[],
): EncyclopediaClassificationVector {
  const categoryText = `${classification.primaryCategory} ${classification.secondaryCategory} ${classification.tertiaryCategory}`
  return {
    schemaVersion: '2026-07-08.dudesign-encyclopedia-classification-vector.v1',
    l1: classification.primaryCategory,
    l2: classification.secondaryCategory,
    l3: classification.tertiaryCategory,
    confidence: classification.confidence,
    signals: [...new Set(classification.signals)],
    source: 'mock_rules',
    recommendedModulePriorities: encyclopediaModulePriorities(categoryText),
    preferredTemplateIds: [...new Set(preferredTemplateIds)],
    riskFlags: encyclopediaClassificationRiskFlags(categoryText),
  }
}

function guidanceClassificationVector(guidance: EncyclopediaEntryGuidance): EncyclopediaClassificationVector {
  const value = guidance.metadata.classificationVector
  if (isEncyclopediaClassificationVector(value)) return value
  return buildEncyclopediaClassificationVector({
    primaryCategory: guidance.primaryCategory,
    secondaryCategory: guidance.secondaryCategory,
    tertiaryCategory: guidance.tertiaryCategory,
    confidence: guidance.confidence,
    signals: guidance.signals,
  }, guidance.recommendedTemplateIds)
}

function isEncyclopediaClassificationVector(value: unknown): value is EncyclopediaClassificationVector {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.schemaVersion === '2026-07-08.dudesign-encyclopedia-classification-vector.v1'
    && typeof record.l1 === 'string'
    && typeof record.l2 === 'string'
    && typeof record.l3 === 'string'
    && typeof record.confidence === 'number'
    && Array.isArray(record.signals)
    && record.signals.every(item => typeof item === 'string')
    && record.source === 'mock_rules'
    && Array.isArray(record.recommendedModulePriorities)
    && record.recommendedModulePriorities.every(item => typeof item === 'string')
    && Array.isArray(record.preferredTemplateIds)
    && record.preferredTemplateIds.every(item => typeof item === 'string')
    && Array.isArray(record.riskFlags)
    && record.riskFlags.every(item => typeof item === 'string')
}

function encyclopediaModulePriorities(categoryText: string): string[] {
  if (categoryText.includes('历史人物')) {
    return ['relationship_graph', 'event_causal_chain', 'ranking_list', 'works_reference']
  }
  if (categoryText.includes('电影')) {
    return ['cast_role_network', 'series_navigation', 'similar_recommendation', 'plot_chain', 'rating_box_office_summary']
  }
  if (categoryText.includes('电视剧')) {
    return ['character_relation_graph', 'episode_causal_chain', 'series_navigation', 'role_quick_answer', 'spoiler_control']
  }
  if (categoryText.includes('文化类词语')) {
    return ['related_phrase_graph', 'origin_story', 'meaning_compare', 'usage_examples', 'quick_choice']
  }
  if (categoryText.includes('景区景点')) {
    return ['route_guide', 'poi_map', 'visit_tips', 'coordinate_status', 'scenic_fact_summary']
  }
  if (categoryText.includes('产品') || categoryText.includes('设备')) {
    return ['summary_facts', 'spec_compare', 'version_difference']
  }
  if (categoryText.includes('企业') || categoryText.includes('机构') || categoryText.includes('学校')) {
    return ['summary_facts', 'timeline_milestones', 'relation_navigation']
  }
  return ['summary_facts', 'key_facts', 'expandable_details']
}

function encyclopediaClassificationRiskFlags(categoryText: string): string[] {
  const flags: string[] = []
  if (categoryText.includes('影视作品') || categoryText.includes('电影') || categoryText.includes('电视剧')) {
    flags.push('media_resource_link_blocked', 'no_piracy_or_playback_resources', 'plot_hallucination_risk')
  }
  if (categoryText.includes('电视剧')) {
    flags.push('episode_count_hallucination_risk', 'spoiler_control_required')
  }
  if (categoryText.includes('历史人物')) {
    flags.push('relationship_hallucination_risk', 'event_causality_source_required')
  }
  if (categoryText.includes('文化类词语')) {
    flags.push('origin_source_required', 'related_phrase_type_required')
  }
  if (categoryText.includes('景区景点')) {
    flags.push('coordinate_source_required', 'travel_realtime_hallucination_risk', 'external_navigation_blocked')
  }
  return flags
}

function guidanceDemocaseReferences(guidance: EncyclopediaEntryGuidance): EncyclopediaEntryGuidanceResponse['democaseReferences'] {
  const value = guidance.metadata.democaseReferences
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is EncyclopediaDemocaseMatch => Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).caseId === 'string'))
    .map(item => ({
      caseId: item.caseId,
      title: item.title,
      score: item.score,
      matchedKeywords: item.matchedKeywords,
      summary: item.summary,
    }))
}

function guidanceDemocaseMatches(guidance: EncyclopediaEntryGuidance): EncyclopediaDemocaseMatch[] {
  const value = guidance.metadata.democaseReferences
  if (!Array.isArray(value)) return []
  return value.filter((item): item is EncyclopediaDemocaseMatch =>
    Boolean(item && typeof item === 'object' && typeof (item as Record<string, unknown>).caseId === 'string'),
  )
}

function normalizeGuidanceClassificationOverride(input: unknown): {
  primaryCategory: string
  secondaryCategory: string
  tertiaryCategory?: string | null
} | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>
  const primaryCategory = typeof record.primaryCategory === 'string' ? record.primaryCategory.trim() : ''
  const secondaryCategory = typeof record.secondaryCategory === 'string' ? record.secondaryCategory.trim() : ''
  const tertiaryCategory = typeof record.tertiaryCategory === 'string' ? record.tertiaryCategory.trim() : null
  if (!primaryCategory || !secondaryCategory) return null
  const allowedPairs = [
    ['机构组织', '企业'],
    ['机构组织', '学校'],
    ['人物', '名人'],
    ['人物', '历史人物'],
    ['名人', '娱乐明星'],
    ['名人', '历史人物'],
    ['作品', '影视作品'],
    ['作品', '文学著作'],
    ['作品', '游戏'],
    ['影视作品', '电影'],
    ['影视作品', '电视剧'],
    ['文学著作', '诗歌'],
    ['文学著作', '小说著作'],
    ['游戏', '电子游戏'],
    ['物品产品', '产品设备'],
    ['知识', '知识术语'],
    ['知识术语', '文化类词语'],
    ['知识术语', '概念定义'],
    ['知识术语', '技术模型'],
    ['地域建筑', '景区景点'],
  ]
  const allowed = allowedPairs.some(([primary, secondary]) => primary === primaryCategory && secondary === secondaryCategory)
  if (!allowed) throw createHttpError(400, 'GUIDANCE_CLASSIFICATION_INVALID', 'Unsupported guidance classification override.')
  return { primaryCategory, secondaryCategory, tertiaryCategory }
}

function recommendedInteractionParadigmId(primaryCategory: string, secondaryCategory: string): string {
  const categoryText = `${primaryCategory} ${secondaryCategory}`
  if (categoryText.includes('电影') && (categoryText.includes('系列') || categoryText.includes('影视作品'))) {
    return 'ip_series_navigation'
  }
  if (categoryText.includes('景区景点') || categoryText.includes('导览') || categoryText.includes('路线')) {
    return 'ip_route_guide'
  }
  if (categoryText.includes('电视剧') || categoryText.includes('事件链') || categoryText.includes('因果')) {
    return 'ip_causal_event_chain'
  }
  if (categoryText.includes('对比') || categoryText.includes('辨析') || categoryText.includes('产品') || categoryText.includes('设备')) {
    return 'ip_fact_compare'
  }
  if (categoryText.includes('历史')
    || categoryText.includes('影视')
    || categoryText.includes('文学')
    || categoryText.includes('游戏')
    || categoryText.includes('事件')
    || categoryText.includes('时间')) {
    return 'ip_timeline_story'
  }
  if (categoryText.includes('关系') || categoryText.includes('角色') || categoryText.includes('组织')) {
    return 'ip_relation_map'
  }
  return 'ip_entity_summary'
}

function dynamicEncyclopediaRuleTemplateIds(categoryText: string): string[] {
  if (categoryText.includes('历史人物')) {
    return [
      'dtp_de_history_person_relationship',
      'dtp_de_history_person_event_chain',
      'dtp_dynamic_encyclopedia_summary_card',
    ]
  }
  if (categoryText.includes('电影')) {
    return [
      'dtp_de_film_cast_role_network',
      'dtp_de_film_series_navigation',
      'dtp_dynamic_encyclopedia_summary_card',
    ]
  }
  if (categoryText.includes('电视剧')) {
    return [
      'dtp_de_tv_character_relation',
      'dtp_de_tv_episode_chain',
      'dtp_dynamic_encyclopedia_summary_card',
    ]
  }
  if (categoryText.includes('文化类词语') || categoryText.includes('成语') || categoryText.includes('典故')) {
    return [
      'dtp_de_cultural_phrase_relation_graph',
      'dtp_de_cultural_phrase_origin_story',
      'dtp_dynamic_encyclopedia_compare_card',
    ]
  }
  if (categoryText.includes('景区景点') || categoryText.includes('景区') || categoryText.includes('景点') || categoryText.includes('导览') || categoryText.includes('路线')) {
    return [
      'dtp_de_scenic_spot_route_guide',
      'dtp_de_scenic_spot_map_poi',
      'dtp_dynamic_encyclopedia_summary_card',
    ]
  }
  if (categoryText.includes('历史') || categoryText.includes('影视') || categoryText.includes('文学') || categoryText.includes('游戏') || categoryText.includes('事件') || categoryText.includes('时间')) {
    return [
      'dtp_dynamic_encyclopedia_timeline_card',
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_relation_card',
    ]
  }
  if (categoryText.includes('产品') || categoryText.includes('设备') || categoryText.includes('对比') || categoryText.includes('辨析')) {
    return [
      'dtp_dynamic_encyclopedia_compare_card',
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_expandable_card',
    ]
  }
  if (categoryText.includes('知识') || categoryText.includes('术语') || categoryText.includes('概念')) {
    return [
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_compare_card',
      'dtp_dynamic_encyclopedia_expandable_card',
    ]
  }
  if (categoryText.includes('企业') || categoryText.includes('机构') || categoryText.includes('学校')) {
    return [
      'dtp_dynamic_encyclopedia_summary_card',
      'dtp_dynamic_encyclopedia_timeline_card',
      'dtp_dynamic_encyclopedia_relation_card',
    ]
  }
  return [
    'dtp_dynamic_encyclopedia_summary_card',
    'dtp_dynamic_encyclopedia_timeline_card',
    'dtp_dynamic_encyclopedia_expandable_card',
  ]
}

function dynamicEncyclopediaTemplateRecommendation(templatePackId: string, categoryText: string): { reason: string; confidence: number } {
  if (templatePackId === 'dtp_de_history_person_relationship') {
    return {
      reason: '历史人物的最大延伸需求是亲属、君臣、师承、对手等人物关系，适合用关系图谱承接。',
      confidence: categoryText.includes('历史人物') ? 0.9 : 0.76,
    }
  }
  if (templatePackId === 'dtp_de_history_person_event_chain') {
    return {
      reason: '历史人物适合补充事件因果链，展示起因、经过、结果和影响。',
      confidence: categoryText.includes('历史人物') ? 0.82 : 0.7,
    }
  }
  if (templatePackId === 'dtp_de_film_cast_role_network') {
    return {
      reason: '电影用户最强延伸路径是演员/角色和人物关联，适合用演员-角色网络组织。',
      confidence: categoryText.includes('电影') ? 0.9 : 0.72,
    }
  }
  if (templatePackId === 'dtp_de_film_series_navigation') {
    return {
      reason: '电影存在续集、前传、同 IP 或相似推荐需求，适合用系列导航承接。',
      confidence: categoryText.includes('电影') ? 0.84 : 0.7,
    }
  }
  if (templatePackId === 'dtp_de_tv_character_relation') {
    return {
      reason: '电视剧深度浏览常围绕角色身份、人物关系、阵营和情感线展开，适合用角色关系图谱。',
      confidence: categoryText.includes('电视剧') ? 0.9 : 0.72,
    }
  }
  if (templatePackId === 'dtp_de_tv_episode_chain') {
    return {
      reason: '电视剧具备分集剧情、伏笔回收和因果链需求，适合用分集剧情关系链组织。',
      confidence: categoryText.includes('电视剧') ? 0.84 : 0.7,
    }
  }
  if (templatePackId === 'dtp_de_cultural_phrase_relation_graph') {
    return {
      reason: '文化词语最大的二次需求是关联词跳转，适合用近义、反义、同源和易混词关系图谱承接。',
      confidence: categoryText.includes('文化类词语') ? 0.9 : 0.72,
    }
  }
  if (templatePackId === 'dtp_de_cultural_phrase_origin_story') {
    return {
      reason: '文化词语的高价值增量是出处、典故和故事深化，适合用起因-经过-结果-寓意结构。',
      confidence: categoryText.includes('文化类词语') ? 0.84 : 0.7,
    }
  }
  if (templatePackId === 'dtp_de_scenic_spot_route_guide') {
    return {
      reason: '景区景点 case 标准强调智能导览、路线推荐和游览顺序，适合用路线导览结构承接。',
      confidence: categoryText.includes('景区景点') ? 0.9 : 0.72,
    }
  }
  if (templatePackId === 'dtp_de_scenic_spot_map_poi') {
    return {
      reason: '景区景点 case 标准包含地图、坐标和 POI 分布信号，适合用景点分布与 POI 概览组织。',
      confidence: categoryText.includes('景区景点') ? 0.84 : 0.7,
    }
  }
  if (templatePackId.includes('timeline')) {
    return {
      reason: '词条具备时间线、阶段、作品演进或发展史信号，适合用时间轴结构组织。',
      confidence: categoryText.includes('历史') || categoryText.includes('影视') || categoryText.includes('文学') || categoryText.includes('游戏') || categoryText.includes('企业') ? 0.82 : 0.68,
    }
  }
  if (templatePackId.includes('relation')) {
    return {
      reason: '词条包含人物、组织、作品、角色或概念之间的连接关系，适合用轻量关系图谱组织。',
      confidence: categoryText.includes('人物') || categoryText.includes('企业') || categoryText.includes('机构') || categoryText.includes('游戏') || categoryText.includes('作品') ? 0.78 : 0.66,
    }
  }
  if (templatePackId.includes('compare')) {
    return {
      reason: '词条存在概念辨析、规格差异或横向比较需求，适合用对比辨析结构。',
      confidence: categoryText.includes('知识') || categoryText.includes('术语') || categoryText.includes('产品') || categoryText.includes('设备') ? 0.8 : 0.64,
    }
  }
  if (templatePackId.includes('expandable')) {
    return {
      reason: '词条内容层级较多或细节较长，适合用可展开事实区做渐进披露。',
      confidence: categoryText.includes('知识') || categoryText.includes('文学') || categoryText.includes('影视') || categoryText.includes('历史') ? 0.76 : 0.62,
    }
  }
  return {
    reason: '词条适合先呈现身份、摘要、关键事实和紧凑标签，适合作为默认首选结构。',
    confidence: 0.86,
  }
}

function interactionParadigmIdForTemplatePack(templatePackId: string): string | null {
  const paradigm = listCapabilities().interactionParadigms.find(candidate =>
    candidate.compatibleTemplatePackIds.includes(templatePackId),
  )
  return paradigm?.id ?? null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function buildDataIntakeAnalysis(input: AnalyzeDataIntakeRequest): DataIntakeAnalysis {
  const sources = dataIntakeSources(input)
  const text = [
    input.prompt,
    input.url,
    input.pastedText,
    input.tableText,
    input.jsonText,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join('\n')
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  const fields = dataIntakeFields(input, normalizedText)
  const entities = dataIntakeEntities(input, normalizedText)
  const missingFields = dataIntakeMissingFields(fields, normalizedText)
  const riskFlags = dataIntakeRiskFlags(input, normalizedText, missingFields)
  const recommendedScenarioTemplates = dataIntakeScenarioRecommendations(normalizedText)
  const recommendedDesignTemplatePacks = dataIntakeTemplatePackRecommendations(normalizedText, recommendedScenarioTemplates)
  const recommendedSkills = dataIntakeSkillRecommendations(input, normalizedText)
  const reviewStatus: DataIntakeAnalysis['reviewStatus'] = riskFlags.some(flag =>
    flag === 'external-source-unreviewed'
    || flag === 'private-memory-context'
    || flag === 'missing-core-fields',
  )
    ? 'human_review_required'
    : 'auto_reviewed'

  return {
    schemaVersion: '2026-07-06.dudesign-data-intake.v1',
    inputSources: sources,
    topicSummary: dataIntakeTopicSummary(normalizedText, sources),
    entities,
    fields,
    missingFields,
    recommendedScenarioTemplates,
    recommendedDesignTemplatePacks,
    recommendedSkills,
    riskFlags,
    reviewStatus,
  }
}

function dataIntakeSources(input: AnalyzeDataIntakeRequest): DataIntakeInputSource[] {
  const sources: DataIntakeInputSource[] = []
  if (stringValue(input.prompt)) sources.push('prompt')
  if (stringValue(input.url)) sources.push('url')
  if (stringValue(input.pastedText)) sources.push('pasted_text')
  if (stringValue(input.tableText)) sources.push('table')
  if (stringValue(input.jsonText)) sources.push('json')
  if (input.uploadedAssetIds?.length) sources.push('uploaded_asset')
  if (input.democaseIds?.length) sources.push('democase')
  if (input.researchArtifactIds?.length) sources.push('research_artifact')
  if (stringValue(input.existingHtmlArtifactId)) sources.push('existing_html')
  if (input.memoryNoteIds?.length) sources.push('memory')
  return [...new Set(sources)]
}

function dataIntakeTopicSummary(text: string, sources: DataIntakeInputSource[]): string {
  if (!text) return sources.length ? `Structured brief from ${sources.join(', ')} inputs.` : 'No substantive input was provided.'
  const sentence = text.split(/(?<=[.!?。！？])\s+/)[0] ?? text
  return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence
}

function dataIntakeFields(input: AnalyzeDataIntakeRequest, text: string): DataIntakeField[] {
  const fields: DataIntakeField[] = []
  const url = stringValue(input.url) ?? text.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null
  if (url) fields.push({ name: 'url', value: url, confidence: 0.94, source: stringValue(input.url) ? 'url' : 'pasted_text' })
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null
  if (email) fields.push({ name: 'contactEmail', value: email, confidence: 0.92, source: 'prompt' })
  const jsonKeys = extractJsonKeys(input.jsonText)
  for (const key of jsonKeys.slice(0, 8)) fields.push({ name: key, confidence: 0.76, source: 'json' })
  const tableHeaders = extractTableHeaders(input.tableText)
  for (const header of tableHeaders.slice(0, 8)) fields.push({ name: header, confidence: 0.72, source: 'table' })
  if (/动态百科|百科|词条|entry|encyclopedia/i.test(text)) {
    fields.push({ name: 'entryTitle', value: inferEntryTitle(text), confidence: 0.7, source: 'prompt' })
    fields.push({ name: 'entryCategory', missing: !/(企业|人物|作品|产品|学校|游戏|概念|术语)/.test(text), confidence: 0.55, source: 'prompt' })
  }
  return dedupeDataIntakeFields(fields)
}

function dataIntakeEntities(input: AnalyzeDataIntakeRequest, text: string): DataIntakeAnalysis['entities'] {
  const entities: DataIntakeAnalysis['entities'] = []
  const title = inferEntryTitle(text)
  if (title) {
    entities.push({
      name: title,
      type: /企业|公司|company|corp|inc/i.test(text) ? 'company' : /人物|artist|founder|ceo/i.test(text) ? 'person' : 'topic',
      confidence: 0.72,
      source: input.prompt ? 'prompt' : input.pastedText ? 'pasted_text' : 'url',
    })
  }
  for (const id of input.democaseIds?.slice(0, 5) ?? []) {
    entities.push({ name: id, type: 'democase', confidence: 0.6, source: 'democase' })
  }
  return entities
}

function dataIntakeMissingFields(fields: DataIntakeField[], text: string): string[] {
  const missing = new Set<string>()
  if (/动态百科|百科|词条|entry|encyclopedia/i.test(text)) {
    if (!fields.some(field => field.name === 'entryTitle' && field.value)) missing.add('entryTitle')
    if (!fields.some(field => field.name === 'entryCategory' && !field.missing)) missing.add('entryCategory')
    if (!/(事实|摘要|时间|关系|对比|指标|定义|背景)/.test(text)) missing.add('sourceAwareFacts')
  }
  if (!text) missing.add('promptOrSourceContent')
  return [...missing]
}

function dataIntakeRiskFlags(input: AnalyzeDataIntakeRequest, text: string, missingFields: string[]): string[] {
  const flags = new Set<string>()
  if (stringValue(input.url) || input.researchArtifactIds?.length) flags.add('external-source-unreviewed')
  if (input.memoryNoteIds?.length) flags.add('private-memory-context')
  if (missingFields.length) flags.add('missing-core-fields')
  if (/api[_-]?key|password|token|secret|sk-[a-z0-9-]+/i.test(text)) flags.add('sensitive-secret-like-input')
  if (/Apple|Google|Microsoft|百度|抖音|Tesla|Nike|Coca-Cola/i.test(text)) flags.add('brand-reference-review-required')
  return [...flags]
}

function dataIntakeScenarioRecommendations(text: string): DataIntakeRecommendation[] {
  if (/动态百科|百科|词条|entry|encyclopedia/i.test(text)) {
    return [{ id: 'tpl_dynamic_encyclopedia_entry', reason: 'The input describes an encyclopedia entry or dynamic knowledge card.', confidence: 0.88 }]
  }
  if (/invoice|fintech|金融|支付|账单|财务/i.test(text)) {
    return [{ id: 'tpl_fintech_trust', reason: 'The input mentions finance, payments, invoices, or trust-heavy transaction flows.', confidence: 0.74 }]
  }
  if (/portfolio|作品集|artist|studio|摄影|设计师/i.test(text)) {
    return [{ id: 'tpl_creative_studio', reason: 'The input is oriented around creative work or portfolio presentation.', confidence: 0.72 }]
  }
  return [{ id: 'tpl_premium_product_page', reason: 'The input is broad; a premium product narrative is a conservative starting point.', confidence: 0.48 }]
}

function dataIntakeTemplatePackRecommendations(text: string, scenarios: DataIntakeRecommendation[]): DataIntakeRecommendation[] {
  if (scenarios.some(item => item.id === 'tpl_dynamic_encyclopedia_entry')) {
    if (/时间|历程|发展|timeline|history/i.test(text)) {
      return [{ id: 'dtp_dynamic_encyclopedia_timeline_card', reason: 'The input suggests ordered milestones or history.', confidence: 0.8 }]
    }
    if (/关系|关联|人物|组织|network|relation/i.test(text)) {
      return [{ id: 'dtp_dynamic_encyclopedia_relation_card', reason: 'The input suggests related entities or relationship mapping.', confidence: 0.76 }]
    }
    if (/对比|区别|compare|versus|vs/i.test(text)) {
      return [{ id: 'dtp_dynamic_encyclopedia_compare_card', reason: 'The input asks for differences or comparison.', confidence: 0.78 }]
    }
    return [{ id: 'dtp_dynamic_encyclopedia_summary_card', reason: 'The input is best served by a compact source-aware summary first.', confidence: 0.82 }]
  }
  return [{ id: 'dtp_premium_product_launch', reason: 'The input can start from a polished official product template pack.', confidence: 0.46 }]
}

function dataIntakeSkillRecommendations(input: AnalyzeDataIntakeRequest, text: string): DataIntakeRecommendation[] {
  const recommendations: DataIntakeRecommendation[] = [{
    id: 'sk_data_intake_analysis',
    reason: 'The request contains loose or mixed inputs that should be converted into a structured brief.',
    confidence: 0.9,
  }]
  if (/动态百科|百科|词条|entry|encyclopedia/i.test(text) || input.democaseIds?.length) {
    recommendations.push({ id: 'sk_encyclopedia_entry_guidance', reason: 'The input maps to encyclopedia entry classification and child-template guidance.', confidence: 0.84 })
  }
  return recommendations
}

function dynamicEncyclopediaEntryTitle(prompt: string, requirements: CreateDesignJobRequest['templateRequirements'] | null | undefined): string {
  const businessContext = requirements?.businessContext
  return businessContext?.entryTitle || inferEntryTitle(prompt) || prompt.slice(0, 40) || '动态百科词条'
}

function dynamicEncyclopediaResearchQuery(prompt: string, requirements: CreateDesignJobRequest['templateRequirements'] | null | undefined): string {
  const title = dynamicEncyclopediaEntryTitle(prompt, requirements)
  const category = requirements?.businessContext
    ? [
        requirements.businessContext.entryPrimaryCategory,
        requirements.businessContext.entrySecondaryCategory,
        requirements.businessContext.entryTertiaryCategory,
      ].filter(Boolean).join(' ')
    : ''
  return [title, category, '百科 事实 来源 卡片 规范'].filter(Boolean).join(' ')
}

function dynamicEncyclopediaImagePrompt(prompt: string, requirements: CreateDesignJobRequest['templateRequirements'] | null | undefined): string {
  const title = dynamicEncyclopediaEntryTitle(prompt, requirements)
  const category = requirements?.businessContext
    ? [
        requirements.businessContext.entryPrimaryCategory,
        requirements.businessContext.entrySecondaryCategory,
        requirements.businessContext.entryTertiaryCategory,
      ].filter(Boolean).join(' / ')
    : '百科词条'
  return [
    `原创动态百科卡片辅助视觉，主题为"${title}"，分类为${category}。`,
    '使用抽象信息图、几何层级、知识节点、柔和光影和现代中文百科气质。',
    '不要使用品牌 logo、真实人物肖像、影视剧照、版权角色、商标外观或可识别受保护素材。',
    '画面应适合作为 390x844 或桌面预览中的辅助插画背景，留出文字可读空间。',
  ].join(' ')
}

function inferEntryTitle(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  const explicit = cleaned.match(/(?:词条|entry|title|主题)[:：]\s*([^,，。；;]+)/i)?.[1]?.trim()
  if (explicit) return explicit.slice(0, 80)
  const beforeColon = cleaned.match(/^([^:：。.!?]{2,40})[:：]/)?.[1]?.trim()
  if (beforeColon) return beforeColon
  return cleaned ? cleaned.slice(0, 40) : null
}

function extractJsonKeys(jsonText: string | null | undefined): string[] {
  if (!jsonText || typeof jsonText !== 'string') return []
  try {
    const parsed = JSON.parse(jsonText) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.keys(parsed as Record<string, unknown>).filter(Boolean)
  } catch {
    return []
  }
}

function extractTableHeaders(tableText: string | null | undefined): string[] {
  if (!tableText || typeof tableText !== 'string') return []
  const firstLine = tableText.trim().split(/\r?\n/)[0] ?? ''
  return firstLine.split(/\t|,|\|/).map(item => item.trim()).filter(Boolean)
}

function dedupeDataIntakeFields(fields: DataIntakeField[]): DataIntakeField[] {
  const seen = new Set<string>()
  return fields.filter(field => {
    const key = field.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function designJobQueueIdempotencyKey(jobId: string): string {
  return `queue:design-job:${jobId}`
}

function screenshotQueueIdempotencyKey(artifactId: string, reason: ScreenshotJobQueuePayload['reason']): string {
  if (reason === 'repair_requested') return `queue:screenshot:${reason}:${artifactId}:${createId('repair')}`
  return `queue:screenshot:${reason}:${artifactId}`
}

function automationRepairQueueIdempotencyKey(artifactId: string, attempt: number): string {
  return `queue:refine:automation-loop:${artifactId}:attempt:${attempt}`
}

function artifactQualitySummary(value: unknown): ArtifactQualityReport | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const status = record.status
  const issues = record.issues
  if (status !== 'pass' && status !== 'warn' && status !== 'fail') return null
  if (!Array.isArray(issues) || !issues.every(issue => typeof issue === 'string')) return null
  const specFindings = normalizeAutomationRepairFindings(record.specFindings)
  return { status, issues, ...(specFindings.length ? { specFindings } : {}) }
}

function specFindingsFromArtifactMetadata(metadata: Record<string, unknown>): AutomationRepairFinding[] {
  const quality = artifactQualitySummary(metadata.quality)
  return quality?.specFindings ?? []
}

function normalizeAutomationRepairFindings(value: unknown): AutomationRepairFinding[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const severity = record.severity === 'error' || record.severity === 'warning' ? record.severity : null
    const source = record.source === 'static_rule' || record.source === 'template_rule' || record.source === 'pixel_gate'
      ? record.source
      : null
    if (!severity || typeof record.id !== 'string' || typeof record.message !== 'string') return []
    return [{
      id: record.id,
      source: source ?? 'template_rule',
      severity,
      message: record.message,
      repairHint: typeof record.repairHint === 'string' ? record.repairHint : 'Repair the reported specification issue.',
    }]
  })
}

function latestVariationReviewActions(messages: { metadata: Record<string, unknown>; createdAt: string }[]): Map<string, {
  action: 'confirm_repair' | 'skip'
  status: 'repair_queued' | 'skipped'
  artifactId: string | null
  artifactVersion: number | null
  createdAt: string
}> {
  const actions = new Map<string, {
    action: 'confirm_repair' | 'skip'
    status: 'repair_queued' | 'skipped'
    artifactId: string | null
    artifactVersion: number | null
    createdAt: string
  }>()
  for (const message of messages) {
    const metadata = message.metadata
    if (metadata.kind !== 'variation_review_action') continue
    const variationId = typeof metadata.variationId === 'string' ? metadata.variationId : null
    if (!variationId) continue
    const action = metadata.action === 'confirm_repair' || metadata.action === 'skip' ? metadata.action : null
    if (!action) continue
    actions.set(variationId, {
      action,
      status: action === 'confirm_repair' ? 'repair_queued' : 'skipped',
      artifactId: typeof metadata.artifactId === 'string' ? metadata.artifactId : null,
      artifactVersion: typeof metadata.artifactVersion === 'number' ? metadata.artifactVersion : null,
      createdAt: message.createdAt,
    })
  }
  return actions
}

function screenshotUrlForArtifact(artifact: Artifact): string | null {
  if (!artifact.variationId || artifact.kind !== 'screenshot') return null
  return screenshotUrlForArtifactId(artifact.id, artifact.variationId)
}

function screenshotUrlForArtifactId(artifactId: string | null, variationId?: string | null): string | null {
  if (!artifactId) return null
  const inferredVariationId = variationId ?? artifactId.match(/^shot_(var_[^_]+(?:_[^_]+)*)_\d+_/i)?.[1] ?? null
  if (!inferredVariationId) return null
  return `/api/variations/${encodeURIComponent(inferredVariationId)}/screenshots/${encodeURIComponent(artifactId)}`
}

function screenshotDeviceFromArtifact(artifact: Artifact): 'desktop' | 'tablet' | 'mobile' | null {
  const device = artifact.metadata.device
  return device === 'desktop' || device === 'tablet' || device === 'mobile' ? device : null
}

function dataUrl(contentType: string, body: Uint8Array): string {
  return `data:${contentType};base64,${Buffer.from(body).toString('base64')}`
}

function pixelQualityGateEnabled(): boolean {
  return process.env.DUDESIGN_ARTIFACT_PIXEL_GATE === '1'
    || process.env.DUDESIGN_ARTIFACT_PIXEL_GATE?.toLowerCase() === 'true'
}

function pixelQualityGateTimeoutMs(): number | undefined {
  const value = Number(process.env.DUDESIGN_ARTIFACT_PIXEL_GATE_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function variationIndexFromRuntimeId(variationId: string | undefined): number | null {
  if (!variationId) return null
  const match = variationId.match(/^(?:mock|runtime)_variation_(\d+)$/)
  if (!match) return null
  const index = Number(match[1])
  return Number.isInteger(index) && index > 0 ? index : null
}

function normalizeRuntimeFiles(files: Array<{ path: string; content: string; contentType?: string }>): Array<{
  path: string
  content: string
  contentType?: string
}> {
  const normalized = files.map(file => ({
    ...file,
    path: normalizeRuntimeArtifactPath(file.path),
  }))
  const seen = new Set<string>()
  for (const file of normalized) {
    if (seen.has(file.path)) throw createHttpError(400, 'RUNTIME_ARTIFACT_DUPLICATE_PATH', `Duplicate runtime artifact path: ${file.path}`)
    seen.add(file.path)
  }
  return normalized
}

function normalizeRuntimeArtifactPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-zA-Z]:\//.test(normalized)) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_INVALID_PATH', `Invalid runtime artifact path: ${path}`)
  }
  if (normalized.split('/').some(part => part === '..' || part === '')) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
  }
  const clean = posix.normalize(normalized)
  if (clean === '.' || clean.startsWith('../') || clean === '..' || posix.isAbsolute(clean)) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_PATH_ESCAPE', `Runtime artifact path escapes workspace: ${path}`)
  }
  if (clean.split('/').some(part => part === '' || part === '..')) {
    throw createHttpError(400, 'RUNTIME_ARTIFACT_INVALID_PATH', `Invalid runtime artifact path: ${path}`)
  }
  return clean
}

function normalizeUploadedHtmlFilename(filename: string): string {
  const normalized = normalizeRuntimeArtifactPath(filename || 'index.html')
  if (!/\.html?$/i.test(normalized)) {
    throw createHttpError(400, 'SOURCE_ARTIFACT_UNSUPPORTED_TYPE', 'Only .html files can be used as source artifacts in the MVP.')
  }
  return normalized
}

function validateUploadedHtml(html: string): string {
  if (typeof html !== 'string' || html.trim().length === 0) {
    throw createHttpError(400, 'SOURCE_ARTIFACT_EMPTY', 'Uploaded HTML is empty.')
  }
  const sizeBytes = new TextEncoder().encode(html).byteLength
  if (sizeBytes > 2_000_000) {
    throw createHttpError(413, 'SOURCE_ARTIFACT_TOO_LARGE', 'Uploaded HTML must be 2 MB or smaller.')
  }
  if (!/<html[\s>]/i.test(html) && !/<body[\s>]/i.test(html)) {
    throw createHttpError(400, 'SOURCE_ARTIFACT_INVALID_HTML', 'Uploaded source must look like an HTML document.')
  }
  return html
}

function contentTypeForPath(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.css')) return 'text/css; charset=utf-8'
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  return 'application/octet-stream'
}

function adminCapabilityRegistryAssets(
  capabilities: ReturnType<typeof listCapabilities>,
  templateEntries: AdminTemplateGovernanceEntry[],
): AdminCapabilityRegistryAsset[] {
  return [
    ...capabilities.domainTemplates.map(template => {
      const requiredActions = [
        ...(template.structure.sections.length ? [] : ['Scene template needs recommended sections.']),
        ...(template.structure.requiredElements.length ? [] : ['Scene template needs required elements.']),
        ...(template.constraints.length ? [] : ['Scene template needs constraints.']),
        ...(template.variationDirections.length ? [] : ['Scene template needs variation directions.']),
      ]
      return {
        id: template.id,
        name: template.name,
        type: 'scene-template' as const,
        status: requiredActions.length ? 'warning' as const : 'active' as const,
        version: template.contentVersion,
        description: template.description,
        summary: [
          `category: ${template.category}`,
          `${template.structure.sections.length} sections`,
          `${template.constraints.length} constraints`,
          `${template.variationDirections.length} variation directions`,
        ],
        requiredActions,
        linkedAssetIds: [],
      }
    }),
    ...capabilities.aestheticProfiles.map(profile => {
      const missingPaletteIds = profile.colorPaletteIds.filter(id => !capabilities.colorPalettes.some(palette => palette.id === id))
      const requiredActions = [
        ...(profile.mood.length ? [] : ['Visual profile needs mood metadata.']),
        ...(profile.bestFor.length ? [] : ['Visual profile needs bestFor metadata.']),
        ...(profile.avoidFor.length ? [] : ['Visual profile needs avoidFor metadata.']),
        ...(missingPaletteIds.length ? [`Missing linked palettes: ${missingPaletteIds.join(', ')}.`] : []),
      ]
      return {
        id: profile.id,
        name: profile.name,
        type: 'visual-profile' as const,
        status: missingPaletteIds.length ? 'blocked' as const : requiredActions.length ? 'warning' as const : 'active' as const,
        version: null,
        description: profile.description,
        summary: [
          `density: ${profile.density}`,
          `formality: ${profile.formality}`,
          `${profile.colorPaletteIds.length} linked palettes`,
          `${profile.negativeRules.length} negative rules`,
        ],
        requiredActions,
        linkedAssetIds: profile.colorPaletteIds,
      }
    }),
    ...capabilities.colorPalettes.map(palette => {
      const requiredActions = [
        ...(palette.colors.length >= 3 ? [] : ['Palette should contain at least 3 colors.']),
        ...(palette.usage.primary ? [] : ['Palette needs primary usage token.']),
        ...(palette.usage.background ? [] : ['Palette needs background usage token.']),
        ...(palette.accessibilityNotes.length ? [] : ['Palette needs accessibility notes.']),
      ]
      return {
        id: palette.id,
        name: palette.name,
        type: 'color-palette' as const,
        status: requiredActions.length ? 'warning' as const : 'active' as const,
        version: null,
        description: palette.colors.join(', '),
        summary: [
          `${palette.colors.length} colors`,
          `${Object.keys(palette.usage).length} usage tokens`,
          `${palette.accessibilityNotes.length} accessibility notes`,
        ],
        requiredActions,
        linkedAssetIds: [],
      }
    }),
    ...capabilities.brandStyleReferences.map(brand => {
      const requiredActions = [
        ...(brand.inspirationOnly ? [] : ['Brand reference must be inspiration-only.']),
        ...(brand.visualPrinciples.length ? [] : ['Brand reference needs visual principles.']),
        ...(brand.forbiddenRules.length ? [] : ['Brand reference needs forbidden rules.']),
      ]
      return {
        id: brand.id,
        name: brand.name,
        type: 'brand-reference' as const,
        status: requiredActions.length ? 'warning' as const : 'active' as const,
        version: null,
        description: brand.description,
        summary: [
          brand.brandFamily,
          `${brand.visualPrinciples.length} principles`,
          `${brand.forbiddenRules.length} forbidden rules`,
          'inspiration only',
        ],
        requiredActions,
        linkedAssetIds: [],
      }
    }),
    ...templateEntries.map(template => ({
      id: template.id,
      name: template.name,
      type: template.category === 'business-template-package' ? 'business-template-package' as const : 'design-template-pack' as const,
      status: template.lintStatus === 'failed' ? 'blocked' as const : template.lintStatus === 'warning' ? 'warning' as const : 'active' as const,
      version: template.version,
      description: template.description ?? 'No description.',
      summary: [
        `${template.colorTokenCount} colors`,
        `${template.componentCount} components`,
        `${template.sectionCount} sections`,
        `${template.childTemplates.length} child drafts`,
      ],
      requiredActions: template.requiredActions,
      linkedAssetIds: [],
    })),
  ]
}

function adminSkillGovernanceEntry(
  skill: DesignSkill,
  plugins: CapabilityPlugin[],
  usageEvents: ReturnType<ApplicationRepository['listUsageEvents']>,
  auditLogs: ReturnType<ApplicationRepository['listAuditLogs']>,
): AdminSkillGovernanceEntry {
  const plugin = plugins.find(item => item.id === skill.pluginId)
  const pluginStatus = plugin?.status ?? 'disabled'
  const requiredActions = [
    ...(plugin ? [] : ['Plugin binding is missing.']),
    ...(pluginStatus === 'disabled' ? ['Skill is disabled; keep hidden from generation defaults.'] : []),
    ...(skill.promptBlocks.length === 0 ? ['Add at least one runtime prompt block before publication.'] : []),
  ]
  return {
    id: skill.id,
    pluginId: skill.pluginId,
    pluginName: plugin?.name ?? skill.pluginId,
    schemaVersion: skill.schemaVersion,
    status: pluginStatus,
    safetyLevel: plugin?.safetyLevel ?? 'disabled',
    category: plugin?.category ?? 'workflow',
    promptBlockCount: skill.promptBlocks.length,
    ruleCount: skill.rules.length,
    negativeRuleCount: skill.negativeRules.length,
    checklistCount: skill.qualityChecklist.length,
    allowedTemplateCategories: skill.allowedTemplateCategories,
    visibility: plugin?.visibility ?? 'official',
    policyMode: plugin?.permissionPolicy.allowRuntimeToolUse ? 'runtime_tool_policy' : 'prompt_block_only',
    usage: capabilityUsageMetrics(usageEvents, auditLogs, [skill.id, skill.pluginId], ['design_skill', 'capability_plugin']),
    requiredActions,
  }
}

function adminMcpPluginGovernanceEntry(
  binding: McpToolBinding,
  plugins: CapabilityPlugin[],
  health: AdminMcpToolHealthSummary | null,
  usageEvents: ReturnType<ApplicationRepository['listUsageEvents']>,
  auditLogs: ReturnType<ApplicationRepository['listAuditLogs']>,
): AdminMcpPluginGovernanceEntry {
  const plugin = plugins.find(item => item.id === binding.pluginId)
  const policyMode = health && health.totalCount > 0 ? 'real_invocation_opt_in' : 'policy_only'
  const unavailableCount = health?.unavailableCount ?? 0
  const totalCount = health?.totalCount ?? 0
  const successCount = health?.okCount ?? 0
  const requiredActions = [
    ...(plugin ? [] : ['Plugin binding is missing.']),
    ...(plugin?.status === 'disabled' ? ['Plugin is disabled; keep hidden from users.'] : []),
    ...(plugin?.safetyLevel === 'review_required' ? ['Review-required plugin needs explicit visibility and permission review before broad rollout.'] : []),
    ...(policyMode === 'policy_only' ? ['No real invocation audit yet; this tool is effectively policy-only.'] : []),
    ...(!binding.scopes.includes('readonly_context') ? ['MCP binding should declare readonly_context for MVP-safe generation.'] : []),
  ]
  return {
    id: binding.id,
    pluginId: binding.pluginId,
    pluginName: plugin?.name ?? binding.pluginId,
    serverName: binding.serverName,
    toolName: binding.toolName,
    status: plugin?.status ?? 'disabled',
    safetyLevel: plugin?.safetyLevel ?? 'disabled',
    scopes: binding.scopes,
    requiresUserAuth: binding.requiresUserAuth,
    auditLevel: plugin?.permissionPolicy.auditLevel ?? 'full',
    policyMode,
    rolloutState: policyMode === 'real_invocation_opt_in' ? 'staging_real' : 'policy_only',
    visibility: plugin?.visibility ?? 'official',
    allowedTemplateCategories: binding.allowedTemplateCategories,
    health: {
      totalCount,
      successRate: totalCount > 0 ? successCount / totalCount : 0,
      unavailableRate: totalCount > 0 ? unavailableCount / totalCount : 0,
      lastStatus: health?.lastStatus ?? null,
      lastErrorCode: health?.lastErrorCode ?? null,
      lastInvokedAt: health?.lastInvokedAt ?? null,
    },
    usage: capabilityUsageMetrics(usageEvents, auditLogs, [binding.id, binding.pluginId], ['mcp_tool', 'capability_plugin']),
    requiredActions,
  }
}

function adminAutomationLoopGovernanceEntry(
  loop: AutomationLoopProfile,
  usageEvents: ReturnType<ApplicationRepository['listUsageEvents']>,
  auditLogs: ReturnType<ApplicationRepository['listAuditLogs']>,
): AdminAutomationLoopGovernanceEntry {
  const quality = {
    staticGate: loop.qualityGates.includes('static'),
    pixelGate: loop.qualityGates.includes('pixel'),
    specGate: loop.qualityGates.includes('spec'),
    repairEnabled: loop.repairStrategy === 'spec_review_refine',
  }
  const requiredActions = [
    ...(quality.repairEnabled && !quality.specGate ? ['Spec repair loops should include the spec quality gate.'] : []),
    ...(loop.maxRepairAttempts > 1 && loop.maxCostCents === null ? ['Set a cost cap before allowing multi-attempt repair loops.'] : []),
  ]
  return {
    id: loop.id,
    name: loop.name,
    qualityGates: loop.qualityGates,
    repairStrategy: loop.repairStrategy,
    maxRepairAttempts: loop.maxRepairAttempts,
    maxCostCents: loop.maxCostCents,
    maxDurationMs: loop.maxDurationMs,
    usage: capabilityUsageMetrics(usageEvents, auditLogs, [loop.id], ['automation_loop']),
    quality,
    requiredActions,
  }
}

function adminPrivateTemplateSummary(entries: AdminTemplateGovernanceEntry[]): AdminPrivateTemplateSummary {
  const privateEntries = entries.filter(entry => entry.source !== 'official')
  return {
    count: privateEntries.length,
    latestCreatedAt: null,
    lint: {
      passed: privateEntries.filter(entry => entry.lintStatus === 'passed').length,
      warning: privateEntries.filter(entry => entry.lintStatus === 'warning').length,
      failed: privateEntries.filter(entry => entry.lintStatus === 'failed').length,
    },
    previewArtifact: {
      available: privateEntries.filter(entry => entry.previewArtifact.status === 'available').length,
      missing: privateEntries.filter(entry => entry.previewArtifact.status === 'missing').length,
    },
  }
}

function adminDynamicEncyclopediaGovernance(
  capabilities: ReturnType<typeof listCapabilities>,
  templates: DesignTemplatePack[],
): AdminDynamicEncyclopediaGovernance {
  const parentTemplatePackId = 'dtp_dynamic_encyclopedia_card'
  const childTemplates = templates
    .filter(template => template.parentPackId === parentTemplatePackId)
    .map(template => ({
      id: template.id,
      name: template.name,
      status: 'active' as const,
      parentTemplatePackId: template.parentPackId ?? null,
    }))
  const templateIds = new Set(templates.map(template => template.id))
  const interactionParadigms = capabilities.interactionParadigms
    .filter(paradigm => paradigm.category === 'encyclopedia')
    .map(paradigm => {
      const missingTemplateIds = paradigm.compatibleTemplatePackIds.filter(id => !templateIds.has(id))
      return {
        id: paradigm.id,
        name: paradigm.name,
        compatibleTemplatePackIds: paradigm.compatibleTemplatePackIds,
        compatibleTemplateCount: paradigm.compatibleTemplatePackIds.length,
        mappingStatus: missingTemplateIds.length > 0 ? 'missing_template' as const : 'mapped' as const,
        bestFor: paradigm.bestFor,
      }
    })
  const categoryMappings = [...new Set(interactionParadigms.flatMap(paradigm => paradigm.bestFor))]
    .sort((a, b) => a.localeCompare(b))
    .map(category => {
      const matched = interactionParadigms.filter(paradigm => paradigm.bestFor.includes(category))
      return {
        level: category.includes('/') ? 'L3' as const : category.length > 4 ? 'L2' as const : 'L1' as const,
        category,
        interactionParadigmIds: matched.map(paradigm => paradigm.id),
        templatePackIds: [...new Set(matched.flatMap(paradigm => paradigm.compatibleTemplatePackIds))],
      }
    })
  return {
    parentTemplatePackId,
    childTemplates,
    interactionParadigms,
    categoryMappings,
    sourceOfTruth: 'InteractionParadigm.compatibleTemplatePackIds',
  }
}

function adminCapabilityQualitySummary(
  templates: AdminTemplateGovernanceEntry[],
  skills: AdminSkillGovernanceEntry[],
  mcpTools: AdminMcpPluginGovernanceEntry[],
  loops: AdminAutomationLoopGovernanceEntry[],
  auditLogs: ReturnType<ApplicationRepository['listAuditLogs']>,
): AdminCapabilityQualitySummary {
  const failedPreviewCount = templates.filter(template => template.requiredActions.some(action => action.toLowerCase().includes('preview'))).length
  // 硬性归束（v0.4）：统计 dynamic encyclopedia 模板的硬性归束合规情况。
  const encyclopediaTemplates = templates.filter(template =>
    template.id === 'dtp_dynamic_encyclopedia_card'
    || template.id.startsWith('dtp_dynamic_encyclopedia_'),
  )
  const hardConstraintsCompliant = encyclopediaTemplates.filter(template => {
    const findingCodes = new Set(template.findings.map(f => f.code))
    return !findingCodes.has('dynamic-card-chinese-first')
      && !findingCodes.has('dynamic-card-english-ui-blocked')
      && !findingCodes.has('dynamic-card-child-english-ui')
      && template.lintStatus !== 'failed'
  }).length
  return {
    templatesWithWarnings: templates.filter(template => template.lintStatus === 'warning').length,
    templatesBlocked: templates.filter(template => template.governanceStatus === 'disabled' || template.lintStatus === 'failed').length,
    riskyPlugins: [...skills, ...mcpTools].filter(item => item.safetyLevel === 'review_required').length,
    disabledPlugins: [...skills, ...mcpTools].filter(item => item.status === 'disabled').length,
    policyOnlyMcpTools: mcpTools.filter(tool => tool.policyMode === 'policy_only').length,
    realMcpTools: mcpTools.filter(tool => tool.policyMode === 'real_invocation_opt_in').length,
    automationLoopsWithPixelGate: loops.filter(loop => loop.quality.pixelGate).length,
    auditLogCount: auditLogs.length,
    recentDriftCount: [...skills, ...mcpTools, ...loops].reduce((sum, item) => sum + item.usage.recentDriftCount, 0),
    hardConstraints: {
      templates: {
        total: encyclopediaTemplates.length,
        compliant: hardConstraintsCompliant,
        chineseFirstMissing: encyclopediaTemplates.filter(template =>
          template.findings.some(f => f.code === 'dynamic-card-chinese-first'),
        ).length,
        englishUiMissing: encyclopediaTemplates.filter(template =>
          template.findings.some(f => f.code === 'dynamic-card-english-ui-blocked' || f.code === 'dynamic-card-child-english-ui'),
        ).length,
      },
    },
    previewSmoke: {
      status: templates.length > 0 ? 'available' : 'not_configured',
      passedCount: templates.filter(template => template.lintStatus === 'passed').length,
      warningCount: templates.filter(template => template.lintStatus === 'warning').length,
      failedCount: failedPreviewCount,
    },
    designMd: {
      lintAvailable: true,
      diffAvailable: true,
      previewSmokeAvailable: true,
      message: 'DESIGN.md import lint, template diff metadata, and preview smoke readiness are exposed for admin governance; write actions remain audited follow-up work.',
    },
  }
}

function capabilityUsageMetrics(
  usageEvents: ReturnType<ApplicationRepository['listUsageEvents']>,
  auditLogs: ReturnType<ApplicationRepository['listAuditLogs']>,
  targetIds: string[],
  targetTypes: string[],
): AdminCapabilityUsageMetrics {
  const matchedEvents = usageEvents.filter(event => {
    const metadata = JSON.stringify(event.metadata)
    return targetIds.some(id => metadata.includes(id))
      || targetTypes.some(type => event.kind.includes(type.replace('_', '.')))
  })
  const matchedAuditLogs = auditLogs.filter(log => {
    if (targetIds.includes(log.targetId)) return true
    return targetIds.some(id => JSON.stringify(log.metadata).includes(id))
  })
  const successEvents = matchedEvents.filter(event => event.kind.endsWith('selected') || event.kind.endsWith('completed') || event.kind.endsWith('refined'))
  const failureEvents = matchedEvents.filter(event => String(event.metadata.errorCode ?? '').length > 0)
  const totalCostCents = matchedEvents.reduce((sum, event) => sum + event.costCents, 0)
  const recentFailureReasons = [...new Set(
    failureEvents
      .map(event => String(event.metadata.errorCode ?? event.metadata.status ?? event.kind))
      .filter(Boolean),
  )].slice(0, 3)
  const lastUsedAt = matchedEvents
    .map(event => event.createdAt)
    .sort()
    .at(-1) ?? null
  return {
    usageCount: matchedEvents.length,
    successCount: successEvents.length,
    failureCount: failureEvents.length,
    successRate: matchedEvents.length > 0 ? successEvents.length / matchedEvents.length : 0,
    averageCostCents: matchedEvents.length > 0 ? Math.round(totalCostCents / matchedEvents.length) : 0,
    totalCostCents,
    lastUsedAt,
    recentFailureReasons,
    recentDriftCount: matchedAuditLogs.filter(log => Boolean(log.metadata.drift)).length,
  }
}

function adminTemplateGovernanceEntry(pack: DesignTemplatePack): AdminTemplateGovernanceEntry {
  const findings = lintAdminTemplatePack(pack)
  const hasErrors = findings.some(finding => finding.severity === 'error')
  const hasWarnings = findings.some(finding => finding.severity === 'warning')
  const promptBlockCoverage = {
    colors: Object.keys(pack.designTokens.colors).length > 0,
    components: Object.keys(pack.designTokens.components).length > 0,
    sections: Object.keys(pack.rationale.sections).length > 0,
    dos: pack.rationale.dos.length > 0,
    donts: pack.rationale.donts.length > 0,
  }
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    source: pack.source,
    status: pack.status,
    visibility: pack.visibility,
    version: pack.version,
    lintStatus: hasErrors ? 'failed' : hasWarnings ? 'warning' : 'passed',
    governanceStatus: pack.status,
    category: pack.id === 'dtp_dynamic_encyclopedia_card'
      ? 'business-template-package'
      : pack.source === 'official'
        ? 'official-template-pack'
        : 'user-template',
    colorTokenCount: Object.keys(pack.designTokens.colors).length,
    componentCount: Object.keys(pack.designTokens.components).length,
    sectionCount: Object.keys(pack.rationale.sections).length,
    childTemplates: childTemplateDrafts(pack),
    requiredActions: findings.filter(finding => finding.severity !== 'info').map(finding => finding.message),
    findings,
    promptBlockCoverage,
    previewArtifact: {
      id: pack.previewArtifactId,
      status: pack.previewArtifactId ? 'available' : 'missing',
    },
    versionDiff: {
      currentVersion: pack.version,
      previousVersion: null,
      status: 'new',
      changedFields: ['initial version'],
    },
    designMd: {
      importStatus: pack.format === 'design-md' ? 'available' : 'missing',
      brokenReferenceCount: findings.filter(finding => /reference|missing|linked/i.test(finding.code) || /reference|missing|linked/i.test(finding.message)).length,
      dangerousInstructionCount: findings.filter(finding => /unsafe|danger|override|absolute filesystem|curl|wget/i.test(finding.code) || /unsafe|danger|override|absolute filesystem|curl|wget/i.test(finding.message)).length,
      previewSmokeStatus: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
    },
  }
}

function lintAdminTemplatePack(pack: DesignTemplatePack): AdminTemplateLintFinding[] {
  const findings: AdminTemplateLintFinding[] = []
  if (pack.schemaVersion !== DESIGN_TEMPLATE_PACK_SCHEMA_VERSION) {
    findings.push({ severity: 'error', code: 'schema-version', message: `Unexpected schema version ${pack.schemaVersion}.` })
  }
  if (pack.source === 'official' && pack.visibility !== 'public') {
    findings.push({ severity: 'error', code: 'official-visibility', message: 'Official templates must be public.' })
  }
  if (pack.source === 'official' && pack.status !== 'published') {
    findings.push({ severity: 'warning', code: 'official-status', message: 'Official templates should be published or explicitly disabled.' })
  }
  if (!pack.designTokens.colors.primary) {
    findings.push({ severity: 'error', code: 'missing-primary-color', message: 'Missing primary color token.' })
  }
  if (!pack.designTokens.colors.surface && !pack.designTokens.colors.background) {
    findings.push({ severity: 'warning', code: 'missing-surface-color', message: 'Missing surface/background color token.' })
  }
  if (Object.keys(pack.designTokens.typography).length === 0) {
    findings.push({ severity: 'warning', code: 'missing-typography', message: 'Missing typography tokens.' })
  }
  if (Object.keys(pack.designTokens.components).length === 0) {
    findings.push({ severity: 'error', code: 'missing-components', message: 'Missing component rules; runtime prompt block would be too weak.' })
  }
  if (pack.rationale.donts.length === 0) {
    findings.push({ severity: 'error', code: 'missing-negative-rules', message: 'Missing forbidden/negative rules.' })
  }
  if (!pack.rationale.donts.some(rule => /copy|imitate|trade dress/i.test(rule))) {
    findings.push({ severity: 'warning', code: 'missing-trade-dress-guardrail', message: 'Missing explicit anti-clone or trade dress guardrail.' })
  }
  if (Object.keys(pack.rationale.sections).length === 0) {
    findings.push({ severity: 'warning', code: 'missing-sections', message: 'Missing rationale sections; detailed constraints will not appear in runtime prompt.' })
  }
  if (pack.id === 'dtp_dynamic_encyclopedia_card') {
    lintDynamicEncyclopediaTemplatePack(pack, findings)
  }
  if (findings.length === 0) {
    findings.push({ severity: 'info', code: 'lint-passed', message: 'Template pack passes CAP-6 governance lint.' })
  }
  return findings
}

function lintDynamicEncyclopediaTemplatePack(pack: DesignTemplatePack, findings: AdminTemplateLintFinding[]): void {
  const components = pack.designTokens.components
  const sectionsText = Object.values(pack.rationale.sections).join('\n')
  const pcFrame = components['pc-card-frame']
  const wiseFrame = components['wise-standard-frame']
  if (!componentNumber(pcFrame, 'width', 788) || !componentNumber(pcFrame, 'height', 492)) {
    findings.push({ severity: 'error', code: 'dynamic-card-pc-size', message: 'Dynamic encyclopedia PC frame must be exactly 788x492.' })
  }
  if (!componentNumber(wiseFrame, 'width', 380) || !componentNumber(wiseFrame, 'height', 456)) {
    findings.push({ severity: 'error', code: 'dynamic-card-wise-size', message: 'Dynamic encyclopedia WISE standard frame must be exactly 380x456.' })
  }
  // 硬性归束（v0.4）：scroll-container 已被 no-scroll-frame + tab-bar / page-switcher / modal 取代。
  // 模板禁止声明 overflow:auto/scroll 组件；如果还存在 scroll-container 也算违规。
  if (components['scroll-container'] && componentString(components['scroll-container'], 'overflowY', 'auto')) {
    findings.push({ severity: 'error', code: 'dynamic-card-scroll-container', message: 'Dynamic encyclopedia template must not define an overflow:auto scroll container. Use .no-scroll-frame + tab-bar / page-switcher / modal instead.' })
  }
  if (!componentString(components['no-scroll-frame'], 'overflow', 'hidden')) {
    findings.push({ severity: 'error', code: 'dynamic-card-no-scroll-frame', message: 'Dynamic encyclopedia template must define .no-scroll-frame with overflow:hidden.' })
  }
  const hasOverflowStrategy = Boolean(components['tab-bar'] ?? components['page-switcher'] ?? components['modal-overlay'])
  if (!hasOverflowStrategy) {
    findings.push({ severity: 'error', code: 'dynamic-card-overflow-strategy', message: 'Dynamic encyclopedia template must declare at least one overflow strategy component (tab-bar / page-switcher / modal-overlay).' })
  }
  // iframe 兼容性约束保留（iframe / touch / mobile gesture 仍需提及）。
  if (!/touchmove|touch-action/i.test(sectionsText) || !/iframe/i.test(sectionsText)) {
    findings.push({ severity: 'error', code: 'dynamic-card-touch-constraints', message: 'Dynamic encyclopedia template must include iframe + touch gesture compatibility constraints.' })
  }
  if (!/summary-card/i.test(sectionsText) || !/timeline-card/i.test(sectionsText) || !/relation-card/i.test(sectionsText)) {
    findings.push({ severity: 'warning', code: 'dynamic-card-child-drafts', message: 'Dynamic encyclopedia template package should list summary, timeline, relation, comparison, and expandable child drafts.' })
  }
  // 硬性归束（v0.4）：dos/donts 必须包含"中文优先"和"英文 UI 短语"阻断
  const dosJoined = pack.rationale.dos.join(' \n ')
  const dontsJoined = pack.rationale.donts.join(' \n ')
  if (!/Simplified Chinese|中文/.test(dosJoined)) {
    findings.push({ severity: 'warning', code: 'dynamic-card-chinese-first', message: 'Dynamic encyclopedia template should explicitly default to Simplified Chinese.' })
  }
  if (!/English UI phrases|英文 UI 短语/i.test(dontsJoined)) {
    findings.push({ severity: 'warning', code: 'dynamic-card-english-ui-blocked', message: 'Dynamic encyclopedia template should block English UI phrases in non-language-category entries.' })
  }
  if (pack.templateRole === 'parent_pack') return
  // 以下是子模板专属规则（父包已通过上面大部分校验）。
  lintDynamicEncyclopediaChildTemplate(pack, findings)
}

function lintDynamicEncyclopediaChildTemplate(pack: DesignTemplatePack, findings: AdminTemplateLintFinding[]): void {
  // 子模板必须显式声明至少一个溢出策略组件（独立于父包）。
  const components = pack.designTokens.components
  if (!componentString(components['no-scroll-frame'], 'overflow', 'hidden')) {
    findings.push({ severity: 'error', code: 'dynamic-card-child-no-scroll-frame', message: `${pack.id} must declare .no-scroll-frame with overflow:hidden.` })
  }
  const hasOverflowStrategy = Boolean(components['tab-bar'] ?? components['page-switcher'] ?? components['modal-overlay'])
  if (!hasOverflowStrategy) {
    findings.push({ severity: 'error', code: 'dynamic-card-child-overflow-strategy', message: `${pack.id} must declare at least one overflow strategy component (tab-bar / page-switcher / modal-overlay).` })
  }
  if (components['scroll-container']) {
    findings.push({ severity: 'error', code: 'dynamic-card-child-legacy-scroll', message: `${pack.id} must not define the legacy .scroll-container component.` })
  }
  const dontsJoined = pack.rationale.donts.join(' \n ')
  if (!/English UI phrases|英文 UI 短语/i.test(dontsJoined)) {
    findings.push({ severity: 'warning', code: 'dynamic-card-child-english-ui', message: `${pack.id} should block English UI phrases in non-language-category entries.` })
  }
}

function childTemplateDrafts(pack: DesignTemplatePack): AdminTemplateGovernanceEntry['childTemplates'] {
  if (pack.id !== 'dtp_dynamic_encyclopedia_card') return []
  return [
    { id: 'summary-card', name: '摘要卡', description: '实体标题、摘要、关键事实和主要行动。' },
    { id: 'timeline-card', name: '时间线卡', description: '事件、版本、历史沿革或生命周期节点。' },
    { id: 'relation-card', name: '关系卡', description: '相关实体、轻量关系图和跳转替代型本地交互。' },
    { id: 'comparison-card', name: '对比卡', description: '两个或多个实体的关键事实横向比较。' },
    { id: 'expandable-fact-card', name: '展开事实卡', description: '长百科内容的渐进展开与局部滚动。' },
  ]
}

function componentNumber(component: Record<string, unknown> | undefined, key: string, expected: number): boolean {
  return typeof component?.[key] === 'number' && component[key] === expected
}

function componentString(component: Record<string, unknown> | undefined, key: string, expected: string): boolean {
  return typeof component?.[key] === 'string' && component[key] === expected
}

function stablePathId(path: string): string {
  return path.replaceAll(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'asset'
}

function rewriteHtmlAssetUrls(html: string, rewrite: (value: string) => string): string {
  return html.replace(
    /\b(src|href)\s*=\s*(["'])([^"']+)\2/gi,
    (match: string, attr: string, quote: string, value: string) => {
      const next = rewrite(value)
      return next === value ? match : `${attr}=${quote}${escapeHtmlAttribute(next)}${quote}`
    },
  )
}

function resolveHtmlAssetPath(value: string, baseDir: string): string | null {
  const trimmed = value.trim()
  if (
    !trimmed
    || trimmed.startsWith('#')
    || trimmed.startsWith('?')
    || trimmed.startsWith('/')
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    || trimmed.startsWith('//')
  ) {
    return null
  }
  const pathOnly = trimmed.split(/[?#]/, 1)[0] ?? ''
  if (!pathOnly) return null
  const candidate = baseDir ? `${baseDir}/${pathOnly}` : pathOnly
  try {
    return normalizeRuntimeArtifactPath(candidate)
  } catch {
    return null
  }
}

function createZipArchive(files: Array<{ path: string; body: Uint8Array | string }>): Uint8Array {
  const encoder = new TextEncoder()
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const path = normalizeRuntimeArtifactPath(file.path)
    const name = encoder.encode(path)
    const body = typeof file.body === 'string' ? encoder.encode(file.body) : file.body
    const crc = crc32(body)
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.byteLength),
      u32(body.byteLength),
      u16(name.byteLength),
      u16(0),
      name,
    ])
    localParts.push(localHeader, body)
    centralParts.push(concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.byteLength),
      u32(body.byteLength),
      u16(name.byteLength),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]))
    offset += localHeader.byteLength + body.byteLength
  }
  const centralDirectory = concatBytes(centralParts)
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.byteLength),
    u32(offset),
    u16(0),
  ])
  return concatBytes([...localParts, centralDirectory, end])
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2)
  const view = new DataView(out.buffer)
  view.setUint16(0, value, true)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  const view = new DataView(out.buffer)
  view.setUint32(0, value >>> 0, true)
  return out
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

export type HttpError = Error & {
  status: number
  code: string
}

export function createHttpError(status: number, code: string, message: string): HttpError {
  const error = new Error(message) as HttpError
  error.status = status
  error.code = code
  return error
}

const WORKSPACE_ROLE_RANK: Record<WorkspaceMemberRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
}

function roleAllows(actual: WorkspaceMemberRole, required: WorkspaceMemberRole): boolean {
  return WORKSPACE_ROLE_RANK[actual] >= WORKSPACE_ROLE_RANK[required]
}

const ENTRY_CONTENT_LANGUAGES: ReadonlySet<EntryContentLanguage> = new Set<EntryContentLanguage>([
  'zh', 'en', 'fr', 'ja', 'ko', 'other', 'mixed',
])

function isEntryContentLanguage(value: unknown): value is EntryContentLanguage {
  return typeof value === 'string' && ENTRY_CONTENT_LANGUAGES.has(value as EntryContentLanguage)
}

function isTerminalVariationStatus(status: DesignVariationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function userVariationExecution(variation: DesignVariation): {
  phase: 'queued' | 'generating' | 'rendering' | 'completed' | 'failed' | 'cancelled'
  retrying: boolean
  degraded: boolean
  attempt: number
  message: string | null
} {
  const phase = variation.status === 'queued'
    ? 'queued'
    : variation.status === 'rendering_preview'
      ? 'rendering'
      : variation.status === 'completed'
        ? 'completed'
        : variation.status === 'failed'
          ? 'failed'
          : variation.status === 'cancelled'
            ? 'cancelled'
            : 'generating'
  const retrying = variation.runtimeAttempt > 1 && !isTerminalVariationStatus(variation.status)
  const degraded = Boolean(variation.runtimeLastErrorCode) && variation.status !== 'completed'
  const message = retrying
    ? 'The system switched execution capacity and is retrying this design.'
    : degraded
      ? 'Design execution is continuing with reduced runtime availability.'
      : null
  return {
    phase,
    retrying,
    degraded,
    attempt: Math.max(variation.runtimeAttempt, 0),
    message,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
