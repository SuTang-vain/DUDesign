import {
  EXPLORATION_PLAN_SCHEMA_VERSION,
  createExplorationProfile,
  validateBatchExplorationPlan,
  validateRequirementModuleGraph,
  type BatchExplorationPlanV1,
  type ExplorationRequestV1,
  type RequirementConditionV1,
  type RequirementModuleGraphV1,
  type RequirementModuleV1,
  type VariationExplorationPlanV1,
} from '@dudesign/contracts'

export const DETERMINISTIC_EXPLORATION_PLANNER_VERSION = '2026-07-13.dudesign-deterministic-planner.v1'

export type CreateBatchExplorationPlanInput = {
  graph: RequirementModuleGraphV1
  capabilitySnapshotId: string
  variationCount: number
  seed: string
  request: ExplorationRequestV1
  dataContext?: Record<string, unknown>
}

export function createBatchExplorationPlan(input: CreateBatchExplorationPlanInput): BatchExplorationPlanV1 {
  assertPlannerInput(input)
  const profile = createExplorationProfile(input.request.level)
  const modulesById = new Map(input.graph.modules.map(module => [module.id, module]))
  const excluded = new Set(input.request.excludedModuleIds ?? [])
  const locked = new Set(input.request.lockedModuleIds ?? [])
  validateSelections(modulesById, excluded, locked)

  const alwaysModules = input.graph.modules.filter(module => module.mode === 'always')
  const optionalModules = input.graph.modules.filter(module => {
    if (module.mode === 'always' || module.mode === 'global_rule') return false
    if (excluded.has(module.id)) return false
    if (module.mode === 'conditional') return conditionsMatch(module.conditions ?? [], input.dataContext ?? {})
    return true
  })

  const assignments = Array.from({ length: input.variationCount }, (_, variationIndex) => ({
    variationIndex: variationIndex + 1,
    required: new Set(alwaysModules.map(module => module.id)),
    sampled: new Set<string>(),
  }))

  const orderedModules = [...optionalModules].sort((left, right) => {
    const lockedDelta = Number(locked.has(right.id)) - Number(locked.has(left.id))
    if (lockedDelta !== 0) return lockedDelta
    const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority)
    if (priorityDelta !== 0) return priorityDelta
    return stableHash(`${input.seed}:${left.id}`) - stableHash(`${input.seed}:${right.id}`)
  })

  for (const module of orderedModules) {
    const targetCoverage = coverageTarget(module, input.variationCount, input.request.level, locked.has(module.id))
    const candidates = [...assignments].sort((left, right) => {
      const loadDelta = left.sampled.size - right.sampled.size
      if (loadDelta !== 0) return loadDelta
      return stableHash(`${input.seed}:${module.id}:${left.variationIndex}`)
        - stableHash(`${input.seed}:${module.id}:${right.variationIndex}`)
    })

    for (const assignment of candidates.slice(0, targetCoverage)) {
      addModuleWithDependencies(assignment, module, modulesById, excluded)
    }
  }

  const excludedModuleIds = [...excluded].sort()
  const variations = assignments.map(assignment => variationPlan(
    assignment.variationIndex,
    assignment.required,
    assignment.sampled,
    excludedModuleIds,
    modulesById,
    profile.mode,
  ))
  const coverageSummary = calculateCoverage(variations)
  const plan: BatchExplorationPlanV1 = {
    schemaVersion: EXPLORATION_PLAN_SCHEMA_VERSION,
    plannerVersion: DETERMINISTIC_EXPLORATION_PLANNER_VERSION,
    seed: input.seed,
    capabilitySnapshotId: input.capabilitySnapshotId,
    profile,
    moduleGraphVersion: input.graph.capabilityVersion,
    variations,
    coverageSummary,
    warnings: optionalModules.length === 0
      ? [{ code: 'no_optional_modules_eligible', message: 'Only required modules are eligible for this generation.' }]
      : [],
  }

  const findings = validateBatchExplorationPlan(plan, input.graph)
  if (findings.length > 0) {
    const summary = findings.map(finding => `${finding.code}@${finding.path}`).join(', ')
    throw new Error(`Generated exploration plan failed validation: ${summary}`)
  }
  return plan
}

function assertPlannerInput(input: CreateBatchExplorationPlanInput): void {
  const graphFindings = validateRequirementModuleGraph(input.graph)
  if (graphFindings.length > 0) {
    throw new Error(`Requirement module graph is invalid: ${graphFindings.map(finding => finding.code).join(', ')}`)
  }
  if (!input.capabilitySnapshotId.trim()) throw new Error('Capability snapshot id is required.')
  if (!input.seed.trim()) throw new Error('Deterministic planner seed is required.')
  if (!Number.isInteger(input.variationCount) || input.variationCount < 1 || input.variationCount > 6) {
    throw new RangeError('Variation count must be an integer between 1 and 6.')
  }
  createExplorationProfile(input.request.level)
}

function validateSelections(
  modulesById: Map<string, RequirementModuleV1>,
  excluded: Set<string>,
  locked: Set<string>,
): void {
  for (const moduleId of new Set([...excluded, ...locked])) {
    if (!modulesById.has(moduleId)) throw new Error(`Unknown requirement module selection: ${moduleId}`)
  }
  for (const moduleId of excluded) {
    const module = modulesById.get(moduleId)!
    if (module.mode === 'always' || module.mode === 'global_rule') {
      throw new Error(`Invariant module cannot be excluded: ${moduleId}`)
    }
    if (locked.has(moduleId)) throw new Error(`Requirement module cannot be both locked and excluded: ${moduleId}`)
  }
}

function coverageTarget(
  module: RequirementModuleV1,
  variationCount: number,
  explorationLevel: number,
  locked: boolean,
): number {
  const minimum = Math.min(variationCount, Math.max(module.minBatchCoverage, locked ? 1 : 0))
  const maximum = Math.min(variationCount, module.maxBatchCoverage ?? variationCount)
  const explorationRatio = explorationLevel / 100
  const priorityFactor = module.priority === 'critical' || module.priority === 'high'
    ? 1
    : module.priority === 'medium' ? 0.75 : 0.5
  const additional = Math.floor((maximum - minimum) * explorationRatio * priorityFactor)
  return Math.min(maximum, minimum + additional)
}

function addModuleWithDependencies(
  assignment: { required: Set<string>; sampled: Set<string> },
  module: RequirementModuleV1,
  modulesById: Map<string, RequirementModuleV1>,
  excluded: Set<string>,
  visiting = new Set<string>(),
): void {
  if (assignment.required.has(module.id) || assignment.sampled.has(module.id)) return
  if (visiting.has(module.id)) throw new Error(`Cyclic requirement module dependency: ${module.id}`)
  if (excluded.has(module.id)) throw new Error(`Selected module depends on excluded module: ${module.id}`)
  visiting.add(module.id)

  for (const dependencyId of module.dependencies ?? []) {
    const dependency = modulesById.get(dependencyId)
    if (!dependency) throw new Error(`Unknown requirement module dependency: ${dependencyId}`)
    addModuleWithDependencies(assignment, dependency, modulesById, excluded, visiting)
  }
  if (module.mode === 'always') assignment.required.add(module.id)
  else if (module.mode !== 'global_rule') assignment.sampled.add(module.id)
  visiting.delete(module.id)
}

function variationPlan(
  variationIndex: number,
  required: Set<string>,
  sampled: Set<string>,
  excludedModuleIds: string[],
  modulesById: Map<string, RequirementModuleV1>,
  mode: string,
): VariationExplorationPlanV1 {
  const sampledModuleIds = [...sampled].sort((left, right) => {
    const priorityDelta = priorityWeight(modulesById.get(right)!.priority) - priorityWeight(modulesById.get(left)!.priority)
    return priorityDelta || left.localeCompare(right)
  })
  const requiredModuleIds = [...required].sort()
  const focusModuleId = sampledModuleIds[0] ?? requiredModuleIds[0]
  const focusModule = modulesById.get(focusModuleId)

  return {
    variationIndex,
    focusId: focusModuleId,
    requiredModuleIds,
    sampledModuleIds,
    excludedModuleIds,
    styleDirectionId: `${mode}:${focusModuleId}`,
    interactionDirectionIds: [...new Set(focusModule?.interactionCandidates ?? [])],
    rationale: sampledModuleIds.length > 0
      ? `Focus on ${focusModule?.title ?? focusModuleId} with ${sampledModuleIds.length} optional requirement modules.`
      : `Preserve the required ${focusModule?.title ?? focusModuleId} structure.`,
  }
}

function calculateCoverage(variations: VariationExplorationPlanV1[]): Record<string, number> {
  const coverage: Record<string, number> = {}
  for (const variation of variations) {
    for (const moduleId of new Set([...variation.requiredModuleIds, ...variation.sampledModuleIds])) {
      coverage[moduleId] = (coverage[moduleId] ?? 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(coverage).sort(([left], [right]) => left.localeCompare(right)))
}

function conditionsMatch(conditions: RequirementConditionV1[], context: Record<string, unknown>): boolean {
  return conditions.every(condition => {
    const actual = getPath(context, condition.fieldPath)
    switch (condition.operator) {
      case 'exists': return actual !== undefined && actual !== null && actual !== false
      case 'equals': return actual === condition.value
      case 'not_equals': return actual !== condition.value
      case 'includes': return Array.isArray(actual)
        ? actual.includes(condition.value)
        : typeof actual === 'string' && typeof condition.value === 'string' && actual.includes(condition.value)
      case 'greater_than': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value
      case 'less_than': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value
    }
  })
}

function getPath(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    return (value as Record<string, unknown>)[segment]
  }, context)
}

function priorityWeight(priority: RequirementModuleV1['priority']): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority]
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
