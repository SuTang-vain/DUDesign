import {
  ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
  type EncyclopediaGuidanceAnalysisInputV2,
  type EncyclopediaGuidanceAnalysisV2,
} from '@dudesign/contracts'
import type { WorkspaceMemberRole } from '@dudesign/domain'
import {
  validateEncyclopediaGuidanceAnalysis,
  type GuidanceAnalysisGateway,
} from '@dudesign/runtime-gateway'
import type { RequestContext } from '../auth.js'
import { listCapabilities } from '../capabilities.js'
import {
  ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION,
  resolveEncyclopediaDemocaseEvidence,
} from '../encyclopediaGuidanceEvidence.js'
import {
  ENCYCLOPEDIA_TAXONOMY_VERSION,
  resolveEncyclopediaTaxonomyCandidates,
} from '../encyclopediaTaxonomy.js'
import { ENCYCLOPEDIA_PRIMARY_INTENT_IDS } from '../encyclopediaGuidanceIntents.js'
import { createId } from '../id.js'
import type { ApplicationRepository } from '../repository.js'

export type AnalyzeEncyclopediaEntryInput = {
  workspaceId: string
  entry: string
  context?: string | null
  maxTemplateRecommendations?: number
  maxClarificationQuestions?: number
}

export class EncyclopediaGuidanceApplicationService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly gateway: GuidanceAnalysisGateway,
  ) {}

  async analyzeEntry(
    ctx: RequestContext,
    input: AnalyzeEncyclopediaEntryInput,
  ): Promise<EncyclopediaGuidanceAnalysisV2> {
    const normalized = normalizeInput(input)
    await this.requireUser(ctx.userId)
    await this.requireWorkspaceAccess(normalized.workspaceId, ctx.userId, 'viewer')

    const democase = resolveEncyclopediaDemocaseEvidence(`${normalized.entry}\n${normalized.context ?? ''}`, 12)
    const taxonomyCandidates = resolveEncyclopediaTaxonomyCandidates({
      query: `${normalized.entry}\n${normalized.context ?? ''}`,
      categoryHints: democase.categoryHints,
      // Until semantic taxonomy retrieval lands, keep the complete registered
      // candidate set so title-only entries such as songs or people are not
      // excluded by lexical preselection before the AI sees them.
      limit: 48,
    })
    const templates = await this.store.listDesignTemplatePacks(ctx.userId, normalized.workspaceId)
    const allowedTemplatePackIds = templates
      .filter(template => template.status === 'published')
      .filter(template => template.supportedProductModes?.includes('dynamic_encyclopedia_card'))
      .filter(template => template.templateRole === 'child_template')
      .map(template => template.id)
    if (allowedTemplatePackIds.length === 0) {
      throw applicationError(409, 'GUIDANCE_TEMPLATE_REGISTRY_EMPTY', 'No published dynamic encyclopedia child templates are available.')
    }
    const templateIds = new Set(allowedTemplatePackIds)
    const allowedInteractionParadigmIds = listCapabilities().interactionParadigms
      .filter(paradigm => paradigm.compatibleTemplatePackIds.some(templateId => templateIds.has(templateId)))
      .map(paradigm => paradigm.id)
    if (allowedInteractionParadigmIds.length === 0) {
      throw applicationError(409, 'GUIDANCE_INTERACTION_REGISTRY_EMPTY', 'No compatible dynamic encyclopedia interaction paradigms are available.')
    }

    const request: EncyclopediaGuidanceAnalysisInputV2 = {
      schemaVersion: ENCYCLOPEDIA_GUIDANCE_ANALYSIS_SCHEMA_VERSION,
      analysisId: createId('ega'),
      userId: ctx.userId,
      workspaceId: normalized.workspaceId,
      entry: {
        title: normalizeEntryTitle(normalized.entry),
        rawInput: normalized.entry,
        context: normalized.context,
      },
      taxonomy: {
        version: ENCYCLOPEDIA_TAXONOMY_VERSION,
        candidates: taxonomyCandidates,
      },
      democase: {
        indexVersion: ENCYCLOPEDIA_DEMOCASE_INDEX_VERSION,
        evidence: democase.evidence,
      },
      allowedCapabilities: {
        templatePackIds: allowedTemplatePackIds,
        interactionParadigmIds: allowedInteractionParadigmIds,
        primaryIntentIds: [...ENCYCLOPEDIA_PRIMARY_INTENT_IDS],
      },
      limits: {
        maxAlternativeCategories: 3,
        maxTemplateRecommendations: normalized.maxTemplateRecommendations,
        maxClarificationQuestions: normalized.maxClarificationQuestions,
      },
    }
    const result = await this.gateway.analyzeEncyclopediaEntry(request)
    return validateEncyclopediaGuidanceAnalysis(request, result)
  }

  private async requireUser(userId: string): Promise<void> {
    if (!userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    if (!await this.store.getUserById(userId)) throw applicationError(404, 'USER_NOT_FOUND', `User not found: ${userId}`)
  }

  private async requireWorkspaceAccess(
    workspaceId: string,
    userId: string,
    minRole: WorkspaceMemberRole,
  ): Promise<void> {
    const workspace = await this.store.getWorkspaceById(workspaceId)
    if (!workspace) throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${workspaceId}`)
    const member = await this.store.getWorkspaceMember(workspaceId, userId)
    const effectiveRole = member?.status === 'active'
      ? member.role
      : workspace.ownerId === userId
        ? 'owner'
        : null
    if (!effectiveRole || !roleAllows(effectiveRole, minRole)) {
      throw applicationError(403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.')
    }
  }
}

function normalizeInput(input: AnalyzeEncyclopediaEntryInput): Required<Omit<AnalyzeEncyclopediaEntryInput, 'context'>> & { context: string | null } {
  if (!input || typeof input !== 'object') throw applicationError(400, 'INVALID_GUIDANCE_ANALYSIS_INPUT', 'Request body is required.')
  const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId.trim() : ''
  const entry = typeof input.entry === 'string' ? input.entry.trim() : ''
  if (!workspaceId) throw applicationError(400, 'WORKSPACE_ID_REQUIRED', 'workspaceId is required.')
  if (!entry) throw applicationError(400, 'ENTRY_REQUIRED', 'entry is required.')
  return {
    workspaceId,
    entry,
    context: typeof input.context === 'string' && input.context.trim() ? input.context.trim() : null,
    maxTemplateRecommendations: boundedInteger(input.maxTemplateRecommendations, 1, 3, 3),
    maxClarificationQuestions: boundedInteger(input.maxClarificationQuestions, 1, 3, 3),
  }
}

function normalizeEntryTitle(rawInput: string): string {
  const firstLine = rawInput.split(/\r?\n/).find(line => line.trim().length > 0)?.trim() ?? rawInput.trim()
  return firstLine.replace(/^词条[:：]\s*/u, '').replace(/[。；;，,].*$/u, '').slice(0, 80)
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.trunc(value)))
    : fallback
}

function roleAllows(actual: WorkspaceMemberRole, required: WorkspaceMemberRole): boolean {
  const rank: Record<WorkspaceMemberRole, number> = {
    viewer: 1,
    editor: 2,
    admin: 3,
    owner: 4,
  }
  return rank[actual] >= rank[required]
}

function applicationError(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code })
}
