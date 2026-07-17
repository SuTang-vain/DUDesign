import { createHash } from 'node:crypto'
import type {
  BatchExplorationPlanV1,
  ExplorationRequestV1,
  RequirementModuleGraphV1,
} from '@dudesign/contracts'
import type { WorkspaceMemberRole } from '@dudesign/domain'
import type { RequestContext } from '../auth.js'
import {
  createBatchExplorationPlan,
  type CreateBatchExplorationPlanInput,
} from '../explorationPlanner.js'
import type { ApplicationRepository } from '../repository.js'

export type ExplorationModuleGraphResolver = (input: {
  requirementModuleGraphId: string
  userId: string
  workspaceId: string
}) => Promise<RequirementModuleGraphV1 | null> | RequirementModuleGraphV1 | null

export type PreviewExplorationPlanInput = {
  sessionId: string
  requirementModuleGraphId: string
  variationCount: number
  exploration: ExplorationRequestV1
  dataContext?: Record<string, unknown>
}

export class ExplorationPlanningApplicationService {
  constructor(
    private readonly store: ApplicationRepository,
    private readonly resolveModuleGraph: ExplorationModuleGraphResolver,
  ) {}

  async previewPlan(ctx: RequestContext, input: PreviewExplorationPlanInput) {
    const resolved = await this.resolveAuthorizedInput(ctx, input)
    return {
      requirementModuleGraph: resolved.graph,
      explorationPlan: this.createValidatedPlan(resolved.plannerInput),
    }
  }

  async createPlanForDesignJob(
    ctx: RequestContext,
    input: PreviewExplorationPlanInput,
  ): Promise<{ requirementModuleGraph: RequirementModuleGraphV1; explorationPlan: BatchExplorationPlanV1 }> {
    return this.previewPlan(ctx, input)
  }

  private async resolveAuthorizedInput(ctx: RequestContext, input: PreviewExplorationPlanInput) {
    assertPreviewInput(input)
    if (!ctx.userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const context = await this.store.getSessionWorkspaceContext(input.sessionId)
    if (!context) throw applicationError(404, 'SESSION_NOT_FOUND', `Session not found: ${input.sessionId}`)
    if (!context.workspace) {
      throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${context.session.workspaceId}`)
    }
    await this.requireWorkspaceAccess(context.workspace.id, ctx.userId, 'editor')

    const graph = await this.resolveModuleGraph({
      requirementModuleGraphId: input.requirementModuleGraphId,
      userId: ctx.userId,
      workspaceId: context.workspace.id,
    })
    if (!graph) {
      throw applicationError(
        404,
        'REQUIREMENT_MODULE_GRAPH_NOT_FOUND',
        `Requirement module graph not found: ${input.requirementModuleGraphId}`,
      )
    }

    const capabilitySnapshotId = stableCapabilitySnapshotId(graph, ctx.userId, context.workspace.id)
    const plannerInput: CreateBatchExplorationPlanInput = {
      graph,
      capabilitySnapshotId,
      variationCount: input.variationCount,
      seed: stableExplorationSeed({
        userId: ctx.userId,
        sessionId: input.sessionId,
        workspaceId: context.workspace.id,
        graph,
        variationCount: input.variationCount,
        exploration: input.exploration,
        dataContext: input.dataContext ?? {},
      }),
      request: input.exploration,
      dataContext: input.dataContext ?? {},
    }
    return { graph, plannerInput }
  }

  private createValidatedPlan(input: CreateBatchExplorationPlanInput): BatchExplorationPlanV1 {
    try {
      return createBatchExplorationPlan(input)
    } catch (cause) {
      if (isApplicationError(cause)) throw cause
      throw applicationError(
        400,
        'INVALID_EXPLORATION_PLAN_INPUT',
        cause instanceof Error ? cause.message : 'Exploration plan input is invalid.',
      )
    }
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

function assertPreviewInput(input: PreviewExplorationPlanInput): void {
  if (!input || typeof input !== 'object') throw applicationError(400, 'INVALID_EXPLORATION_REQUEST', 'Request body is required.')
  if (!input.sessionId?.trim()) throw applicationError(400, 'SESSION_ID_REQUIRED', 'sessionId is required.')
  if (!input.requirementModuleGraphId?.trim()) {
    throw applicationError(400, 'REQUIREMENT_MODULE_GRAPH_ID_REQUIRED', 'requirementModuleGraphId is required.')
  }
}

function stableCapabilitySnapshotId(
  graph: RequirementModuleGraphV1,
  userId: string,
  workspaceId: string,
): string {
  return `capexp_${hashJson({ graphId: graph.id, graphVersion: graph.capabilityVersion, userId, workspaceId }).slice(0, 24)}`
}

function stableExplorationSeed(input: {
  userId: string
  sessionId: string
  workspaceId: string
  graph: RequirementModuleGraphV1
  variationCount: number
  exploration: ExplorationRequestV1
  dataContext: Record<string, unknown>
}): string {
  return `sha256:${hashJson({
    userId: input.userId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    graphId: input.graph.id,
    graphVersion: input.graph.capabilityVersion,
    variationCount: input.variationCount,
    exploration: input.exploration,
    dataContext: input.dataContext,
  })}`
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortJson(value))).digest('hex')
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  )
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

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}

function isApplicationError(value: unknown): value is Error & { status: number; code: string } {
  const error = value as Partial<Error & { status: number; code: string }>
  return Number.isInteger(error?.status) && typeof error?.code === 'string'
}
