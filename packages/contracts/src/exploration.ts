export const REQUIREMENT_MODULE_GRAPH_SCHEMA_VERSION =
  '2026-07-13.dudesign-requirement-module-graph.v1' as const

export const EXPLORATION_PLAN_SCHEMA_VERSION =
  '2026-07-13.dudesign-exploration-plan.v1' as const

export type RequirementModuleMode = 'always' | 'conditional' | 'sampled' | 'global_rule'

export type RequirementModulePriority = 'critical' | 'high' | 'medium' | 'low'

export type RequirementConditionOperator =
  | 'exists'
  | 'equals'
  | 'not_equals'
  | 'includes'
  | 'greater_than'
  | 'less_than'

export type RequirementConditionV1 = {
  fieldPath: string
  operator: RequirementConditionOperator
  value?: unknown
}

export type SourceEvidenceRefV1 = {
  sourcePath: string
  sourceExcerpt: string
  extractionMethod: 'deterministic' | 'agent_assisted' | 'user_confirmed'
  confidence: number
}

export type RequirementModuleV1 = {
  id: string
  title: string
  description: string
  mode: RequirementModuleMode
  priority: RequirementModulePriority
  minBatchCoverage: number
  maxBatchCoverage?: number
  conditions?: RequirementConditionV1[]
  dependencies?: string[]
  conflicts?: string[]
  compatibleWith?: string[]
  requiredDataFields?: string[]
  interactionCandidates?: string[]
  evidenceRefs: SourceEvidenceRefV1[]
  confidence: number
}

export type RequirementInvariantCategory =
  | 'fact'
  | 'security'
  | 'permission'
  | 'data_contract'
  | 'accessibility'
  | 'brand'

export type RequirementInvariantV1 = {
  id: string
  category: RequirementInvariantCategory
  description: string
  evidenceRefs: SourceEvidenceRefV1[]
}

export type RequirementModuleGraphV1 = {
  schemaVersion: typeof REQUIREMENT_MODULE_GRAPH_SCHEMA_VERSION
  id: string
  capabilityVersion: string
  title: string
  modules: RequirementModuleV1[]
  invariants: RequirementInvariantV1[]
  unresolvedQuestions: string[]
}

export type ExplorationMode = 'faithful' | 'balanced' | 'exploratory' | 'experimental'

export type ExplorationProfileV1 = {
  level: number
  mode: ExplorationMode
  moduleBreadth: number
  moduleNovelty: number
  layoutDivergence: number
  visualDivergence: number
  interactionDivergence: number
  copyToneDivergence: number
  factCreativity: 0
}

export type ExplorationRequestV1 = {
  level: number
  lockedModuleIds?: string[]
  excludedModuleIds?: string[]
}

export type VariationExplorationPlanV1 = {
  variationIndex: number
  focusId: string
  requiredModuleIds: string[]
  sampledModuleIds: string[]
  excludedModuleIds: string[]
  templatePackId?: string
  styleDirectionId?: string
  interactionDirectionIds: string[]
  rationale: string
}

export type ExplorationPlanWarningV1 = {
  code: string
  message: string
  moduleId?: string
  variationIndex?: number
}

export type BatchExplorationPlanV1 = {
  schemaVersion: typeof EXPLORATION_PLAN_SCHEMA_VERSION
  plannerVersion: string
  seed: string
  capabilitySnapshotId: string
  profile: ExplorationProfileV1
  moduleGraphVersion: string
  variations: VariationExplorationPlanV1[]
  coverageSummary: Record<string, number>
  warnings: ExplorationPlanWarningV1[]
}

export type ExplorationContractFinding = {
  severity: 'error' | 'warning'
  code: string
  path: string
  message: string
}

const unitInterval = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100

export function resolveExplorationMode(level: number): ExplorationMode {
  assertExplorationLevel(level)

  if (level <= 20) return 'faithful'
  if (level <= 45) return 'balanced'
  if (level <= 70) return 'exploratory'
  return 'experimental'
}

export function createExplorationProfile(level: number): ExplorationProfileV1 {
  assertExplorationLevel(level)
  const normalized = level / 100

  return {
    level,
    mode: resolveExplorationMode(level),
    moduleBreadth: unitInterval(0.2 + normalized * 0.65),
    moduleNovelty: unitInterval(normalized * 0.8),
    layoutDivergence: unitInterval(0.1 + normalized * 0.8),
    visualDivergence: unitInterval(0.15 + normalized * 0.8),
    interactionDivergence: unitInterval(0.05 + normalized * 0.75),
    copyToneDivergence: unitInterval(normalized * 0.45),
    factCreativity: 0,
  }
}

export function validateRequirementModuleGraph(
  graph: RequirementModuleGraphV1,
): ExplorationContractFinding[] {
  const findings: ExplorationContractFinding[] = []
  const ids = new Set<string>()

  if (graph.schemaVersion !== REQUIREMENT_MODULE_GRAPH_SCHEMA_VERSION) {
    error(findings, 'unsupported_module_graph_schema', 'schemaVersion', 'Unsupported requirement module graph schema version.')
  }
  if (!graph.id.trim()) error(findings, 'graph_id_required', 'id', 'Module graph id is required.')
  if (!graph.capabilityVersion.trim()) {
    error(findings, 'capability_version_required', 'capabilityVersion', 'Capability version is required.')
  }
  if (graph.modules.length === 0) {
    error(findings, 'modules_required', 'modules', 'At least one requirement module is required.')
  }

  for (const [index, module] of graph.modules.entries()) {
    const path = `modules[${index}]`
    if (!module.id.trim()) error(findings, 'module_id_required', `${path}.id`, 'Module id is required.')
    if (ids.has(module.id)) error(findings, 'duplicate_module_id', `${path}.id`, `Duplicate module id: ${module.id}`)
    ids.add(module.id)

    if (!module.title.trim()) error(findings, 'module_title_required', `${path}.title`, 'Module title is required.')
    if (!Number.isInteger(module.minBatchCoverage) || module.minBatchCoverage < 0) {
      error(
        findings,
        'invalid_min_batch_coverage',
        `${path}.minBatchCoverage`,
        'Minimum batch coverage must be a non-negative integer.',
      )
    }
    if (
      module.maxBatchCoverage !== undefined &&
      (!Number.isInteger(module.maxBatchCoverage) || module.maxBatchCoverage < module.minBatchCoverage)
    ) {
      error(
        findings,
        'invalid_max_batch_coverage',
        `${path}.maxBatchCoverage`,
        'Maximum batch coverage must be an integer greater than or equal to minimum coverage.',
      )
    }
    if (module.mode === 'conditional' && (module.conditions?.length ?? 0) === 0) {
      error(
        findings,
        'conditional_module_requires_condition',
        `${path}.conditions`,
        'Conditional modules require at least one eligibility condition.',
      )
    }
    if (!inUnitInterval(module.confidence)) {
      error(findings, 'invalid_module_confidence', `${path}.confidence`, 'Module confidence must be between 0 and 1.')
    }
    if (module.evidenceRefs.length === 0) {
      error(findings, 'module_evidence_required', `${path}.evidenceRefs`, 'Requirement modules require source evidence.')
    }
    for (const [evidenceIndex, evidence] of module.evidenceRefs.entries()) {
      if (!inUnitInterval(evidence.confidence)) {
        error(
          findings,
          'invalid_evidence_confidence',
          `${path}.evidenceRefs[${evidenceIndex}].confidence`,
          'Evidence confidence must be between 0 and 1.',
        )
      }
    }
  }

  for (const [index, module] of graph.modules.entries()) {
    const path = `modules[${index}]`
    validateModuleReferences(findings, ids, module.id, module.dependencies ?? [], `${path}.dependencies`)
    validateModuleReferences(findings, ids, module.id, module.conflicts ?? [], `${path}.conflicts`)
    validateModuleReferences(findings, ids, module.id, module.compatibleWith ?? [], `${path}.compatibleWith`)
  }

  for (const [index, invariant] of graph.invariants.entries()) {
    if (!invariant.id.trim()) {
      error(findings, 'invariant_id_required', `invariants[${index}].id`, 'Invariant id is required.')
    }
    if (invariant.evidenceRefs.length === 0) {
      error(
        findings,
        'invariant_evidence_required',
        `invariants[${index}].evidenceRefs`,
        'Invariants require source evidence.',
      )
    }
    for (const [evidenceIndex, evidence] of invariant.evidenceRefs.entries()) {
      if (!inUnitInterval(evidence.confidence)) {
        error(
          findings,
          'invalid_evidence_confidence',
          `invariants[${index}].evidenceRefs[${evidenceIndex}].confidence`,
          'Evidence confidence must be between 0 and 1.',
        )
      }
    }
  }

  return findings
}

export function validateBatchExplorationPlan(
  plan: BatchExplorationPlanV1,
  graph: RequirementModuleGraphV1,
): ExplorationContractFinding[] {
  const findings: ExplorationContractFinding[] = []
  const moduleIds = new Set(graph.modules.map(module => module.id))
  const variationIndexes = new Set<number>()

  if (plan.schemaVersion !== EXPLORATION_PLAN_SCHEMA_VERSION) {
    error(findings, 'unsupported_exploration_plan_schema', 'schemaVersion', 'Unsupported exploration plan schema version.')
  }
  if (!plan.plannerVersion.trim()) error(findings, 'planner_version_required', 'plannerVersion', 'Planner version is required.')
  if (!plan.seed.trim()) error(findings, 'planner_seed_required', 'seed', 'Deterministic planner seed is required.')
  if (!plan.capabilitySnapshotId.trim()) {
    error(findings, 'capability_snapshot_required', 'capabilitySnapshotId', 'Capability snapshot id is required.')
  }
  if (!plan.moduleGraphVersion.trim()) {
    error(findings, 'module_graph_version_required', 'moduleGraphVersion', 'Module graph version is required.')
  }
  if (plan.variations.length === 0) {
    error(findings, 'variations_required', 'variations', 'At least one variation plan is required.')
  }
  if (plan.profile.factCreativity !== 0) {
    error(findings, 'fact_creativity_must_be_zero', 'profile.factCreativity', 'Fact creativity must remain zero.')
  }
  try {
    assertExplorationLevel(plan.profile.level)
    if (plan.profile.mode !== resolveExplorationMode(plan.profile.level)) {
      error(findings, 'exploration_mode_mismatch', 'profile.mode', 'Exploration mode does not match the configured level.')
    }
  } catch (cause) {
    error(findings, 'invalid_exploration_level', 'profile.level', (cause as Error).message)
  }
  for (const key of [
    'moduleBreadth',
    'moduleNovelty',
    'layoutDivergence',
    'visualDivergence',
    'interactionDivergence',
    'copyToneDivergence',
  ] as const) {
    if (!inUnitInterval(plan.profile[key])) {
      error(findings, 'invalid_profile_dimension', `profile.${key}`, 'Exploration profile dimensions must be between 0 and 1.')
    }
  }

  for (const [index, variation] of plan.variations.entries()) {
    const path = `variations[${index}]`
    if (!Number.isInteger(variation.variationIndex) || variation.variationIndex < 1) {
      error(findings, 'invalid_variation_index', `${path}.variationIndex`, 'Variation index must be a positive integer.')
    }
    if (variationIndexes.has(variation.variationIndex)) {
      error(findings, 'duplicate_variation_index', `${path}.variationIndex`, 'Variation indexes must be unique.')
    }
    variationIndexes.add(variation.variationIndex)
    if (!variation.focusId.trim()) error(findings, 'variation_focus_required', `${path}.focusId`, 'Variation focus is required.')
    if (!variation.rationale.trim()) error(findings, 'variation_rationale_required', `${path}.rationale`, 'Variation rationale is required.')

    const required = new Set(variation.requiredModuleIds)
    const sampled = new Set(variation.sampledModuleIds)
    const excluded = new Set(variation.excludedModuleIds)
    for (const moduleId of [...required, ...sampled, ...excluded]) {
      if (!moduleIds.has(moduleId)) {
        error(findings, 'unknown_plan_module', path, `Plan references unknown module: ${moduleId}`)
      }
    }
    for (const moduleId of required) {
      if (sampled.has(moduleId) || excluded.has(moduleId)) {
        error(findings, 'overlapping_module_assignment', path, `Module ${moduleId} has conflicting assignments.`)
      }
    }
    for (const moduleId of sampled) {
      if (excluded.has(moduleId)) {
        error(findings, 'overlapping_module_assignment', path, `Module ${moduleId} has conflicting assignments.`)
      }
    }

    const selected = new Set([...required, ...sampled])
    for (const moduleId of selected) {
      const module = graph.modules.find(candidate => candidate.id === moduleId)
      if (!module) continue
      for (const dependencyId of module.dependencies ?? []) {
        if (!selected.has(dependencyId)) {
          error(findings, 'module_dependency_missing', path, `Module ${moduleId} requires ${dependencyId}.`)
        }
      }
      for (const conflictId of module.conflicts ?? []) {
        if (selected.has(conflictId)) {
          error(findings, 'module_conflict_selected', path, `Modules ${moduleId} and ${conflictId} cannot be selected together.`)
        }
      }
    }
  }

  const expectedIndexes = plan.variations.map((_, index) => index + 1)
  if (expectedIndexes.some(index => !variationIndexes.has(index))) {
    error(findings, 'variation_indexes_not_contiguous', 'variations', 'Variation indexes must be contiguous and start at one.')
  }

  const alwaysModuleIds = graph.modules.filter(module => module.mode === 'always').map(module => module.id)
  for (const moduleId of alwaysModuleIds) {
    plan.variations.forEach((variation, index) => {
      if (!variation.requiredModuleIds.includes(moduleId)) {
        error(
          findings,
          'always_module_missing',
          `variations[${index}].requiredModuleIds`,
          `Always module ${moduleId} must be required by every variation.`,
        )
      }
    })
  }

  const actualCoverage = new Map<string, number>()
  for (const variation of plan.variations) {
    for (const moduleId of new Set([...variation.requiredModuleIds, ...variation.sampledModuleIds])) {
      actualCoverage.set(moduleId, (actualCoverage.get(moduleId) ?? 0) + 1)
    }
  }
  for (const [moduleId, coverage] of Object.entries(plan.coverageSummary)) {
    if (!moduleIds.has(moduleId)) {
      error(findings, 'unknown_coverage_module', `coverageSummary.${moduleId}`, `Coverage references unknown module: ${moduleId}`)
    }
    if (!Number.isInteger(coverage) || coverage < 0) {
      error(findings, 'invalid_coverage_value', `coverageSummary.${moduleId}`, 'Coverage must be a non-negative integer.')
    }
  }
  for (const [moduleId, coverage] of actualCoverage) {
    if (plan.coverageSummary[moduleId] !== coverage) {
      error(
        findings,
        'coverage_summary_mismatch',
        `coverageSummary.${moduleId}`,
        `Coverage summary for ${moduleId} must equal ${coverage}.`,
      )
    }
  }

  for (const module of graph.modules.filter(candidate => candidate.mode === 'sampled')) {
    const coverage = actualCoverage.get(module.id) ?? 0
    const explicitlyExcluded = plan.variations.length > 0
      && plan.variations.every(variation => variation.excludedModuleIds.includes(module.id))
    if (explicitlyExcluded) continue
    if (coverage < module.minBatchCoverage) {
      error(
        findings,
        'sampled_module_under_covered',
        `coverageSummary.${module.id}`,
        `Sampled module ${module.id} requires at least ${module.minBatchCoverage} variation assignments.`,
      )
    }
    if (module.maxBatchCoverage !== undefined && coverage > module.maxBatchCoverage) {
      error(
        findings,
        'module_over_covered',
        `coverageSummary.${module.id}`,
        `Module ${module.id} allows at most ${module.maxBatchCoverage} variation assignments.`,
      )
    }
  }

  return findings
}

function assertExplorationLevel(level: number): void {
  if (!Number.isInteger(level) || level < 0 || level > 100) {
    throw new RangeError('Exploration level must be an integer between 0 and 100.')
  }
}

function validateModuleReferences(
  findings: ExplorationContractFinding[],
  ids: Set<string>,
  moduleId: string,
  references: string[],
  path: string,
): void {
  const seen = new Set<string>()
  for (const reference of references) {
    if (reference === moduleId) error(findings, 'self_module_reference', path, `Module ${moduleId} cannot reference itself.`)
    if (!ids.has(reference)) error(findings, 'unknown_module_reference', path, `Unknown module reference: ${reference}`)
    if (seen.has(reference)) error(findings, 'duplicate_module_reference', path, `Duplicate module reference: ${reference}`)
    seen.add(reference)
  }
}

function inUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function error(findings: ExplorationContractFinding[], code: string, path: string, message: string): void {
  findings.push({ severity: 'error', code, path, message })
}
