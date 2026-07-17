import {
  validateBatchExplorationPlan,
  validateRequirementModuleGraph,
  type BatchExplorationPlanV1,
  type RequirementModuleGraphV1,
  type RequirementModuleV1,
} from '@dudesign/contracts'

export const RUNTIME_EXPLORATION_CONTEXT_SCHEMA_VERSION =
  '2026-07-13.dudesign-runtime-exploration-context.v1' as const

export type RuntimeExplorationModuleV1 = {
  id: string
  title: string
  description: string
  requiredDataFields: string[]
  interactionCandidates: string[]
}

export type RuntimeExplorationContextV1 = {
  schemaVersion: typeof RUNTIME_EXPLORATION_CONTEXT_SCHEMA_VERSION
  source: {
    plannerVersion: string
    capabilitySnapshotId: string
    moduleGraphId: string
    moduleGraphVersion: string
    variationIndex: number
  }
  focus: RuntimeExplorationModuleV1
  requiredModules: RuntimeExplorationModuleV1[]
  sampledModules: RuntimeExplorationModuleV1[]
  excludedModuleIds: string[]
  interactionDirectionIds: string[]
  designDivergence: {
    moduleBreadth: number
    moduleNovelty: number
    layout: number
    visual: number
    interaction: number
    copyTone: number
  }
  invariants: Array<{
    id: string
    category: string
    description: string
  }>
  globalRules: RuntimeExplorationModuleV1[]
  safety: {
    factCreativity: 0
    mayExpandToolPolicy: false
    mayReassignModules: false
  }
}

export type CliAgentExplorationFixtureV1 = {
  schemaVersion: '2026-07-13.dudesign-cli-agent-exploration-fixture.v1'
  context: RuntimeExplorationContextV1
  promptBlock: string
}

export function compileRuntimeExplorationContexts(
  graph: RequirementModuleGraphV1,
  plan: BatchExplorationPlanV1,
): RuntimeExplorationContextV1[] {
  const graphFindings = validateRequirementModuleGraph(graph)
  if (graphFindings.length > 0) {
    throw new Error(`Invalid requirement module graph: ${graphFindings.map(finding => finding.code).join(', ')}`)
  }
  const planFindings = validateBatchExplorationPlan(plan, graph)
  if (planFindings.length > 0) {
    throw new Error(`Invalid exploration plan: ${planFindings.map(finding => finding.code).join(', ')}`)
  }

  const modulesById = new Map(graph.modules.map(module => [module.id, module]))
  const globalRules = graph.modules.filter(module => module.mode === 'global_rule').map(runtimeModule)
  const invariants = graph.invariants.map(invariant => ({
    id: invariant.id,
    category: invariant.category,
    description: invariant.description,
  }))

  return plan.variations.map(variation => {
    const requiredModules = variation.requiredModuleIds.map(moduleId => requiredModule(modulesById, moduleId))
    const sampledModules = variation.sampledModuleIds.map(moduleId => requiredModule(modulesById, moduleId))
    const focus = modulesById.get(variation.focusId)
      ?? sampledModules[0]
      ?? requiredModules[0]
    if (!focus) throw new Error(`Exploration variation ${variation.variationIndex} does not have a resolvable focus module.`)

    return {
      schemaVersion: RUNTIME_EXPLORATION_CONTEXT_SCHEMA_VERSION,
      source: {
        plannerVersion: plan.plannerVersion,
        capabilitySnapshotId: plan.capabilitySnapshotId,
        moduleGraphId: graph.id,
        moduleGraphVersion: graph.capabilityVersion,
        variationIndex: variation.variationIndex,
      },
      focus: runtimeModule(focus),
      requiredModules,
      sampledModules,
      excludedModuleIds: [...variation.excludedModuleIds],
      interactionDirectionIds: [...variation.interactionDirectionIds],
      designDivergence: {
        moduleBreadth: plan.profile.moduleBreadth,
        moduleNovelty: plan.profile.moduleNovelty,
        layout: plan.profile.layoutDivergence,
        visual: plan.profile.visualDivergence,
        interaction: plan.profile.interactionDivergence,
        copyTone: plan.profile.copyToneDivergence,
      },
      invariants,
      globalRules,
      safety: {
        factCreativity: 0,
        mayExpandToolPolicy: false,
        mayReassignModules: false,
      },
    }
  })
}

export function runtimeExplorationContextForVariation(
  contexts: RuntimeExplorationContextV1[] | undefined,
  variationIndex: number | undefined,
): RuntimeExplorationContextV1 | undefined {
  if (!variationIndex) return undefined
  return contexts?.find(context => context.source.variationIndex === variationIndex)
}

export function runtimeExplorationPromptBlock(context: RuntimeExplorationContextV1 | undefined): string {
  if (!context) return ''
  const moduleLines = [
    ...context.requiredModules.map(module => `- Required module: ${module.title} (${module.id}) — ${module.description}`),
    ...context.sampledModules.map(module => `- Selected module: ${module.title} (${module.id}) — ${module.description}`),
  ]
  const dataFields = [...new Set(
    [...context.requiredModules, ...context.sampledModules].flatMap(module => module.requiredDataFields),
  )]
  return [
    'DUDesign controlled exploration context:',
    `- Variation focus: ${context.focus.title} (${context.focus.id}) — ${context.focus.description}`,
    ...moduleLines,
    context.excludedModuleIds.length > 0
      ? `- Explicitly excluded modules: ${context.excludedModuleIds.join(', ')}. Do not add them back.`
      : '',
    context.interactionDirectionIds.length > 0
      ? `- Preferred interaction directions: ${context.interactionDirectionIds.join(', ')}.`
      : '',
    dataFields.length > 0
      ? `- Required data fields: ${dataFields.join(', ')}. Missing values must remain unknown; never invent them.`
      : '',
    `- Design divergence: module breadth ${context.designDivergence.moduleBreadth}, module novelty ${context.designDivergence.moduleNovelty}, layout ${context.designDivergence.layout}, visual ${context.designDivergence.visual}, interaction ${context.designDivergence.interaction}, copy tone ${context.designDivergence.copyTone}.`,
    ...context.globalRules.map(rule => `- Global rule: ${rule.description}`),
    ...context.invariants.map(invariant => `- Invariant (${invariant.category}): ${invariant.description}`),
    '- Keep fact creativity at zero. Do not invent facts, relationships, dates, works, data fields, or source claims.',
    '- Do not expand tool permissions or request tools outside the separately supplied DUDesign tool policy.',
    '- Do not reassign, remove, or add requirement modules. Execute this fixed variation plan.',
  ].filter(line => line.length > 0).join('\n')
}

export function createCliAgentExplorationFixture(
  context: RuntimeExplorationContextV1,
): CliAgentExplorationFixtureV1 {
  return {
    schemaVersion: '2026-07-13.dudesign-cli-agent-exploration-fixture.v1',
    context,
    promptBlock: runtimeExplorationPromptBlock(context),
  }
}

function requiredModule(
  modulesById: Map<string, RequirementModuleV1>,
  moduleId: string,
): RuntimeExplorationModuleV1 {
  const module = modulesById.get(moduleId)
  if (!module) throw new Error(`Unknown requirement module in exploration plan: ${moduleId}`)
  return runtimeModule(module)
}

function runtimeModule(module: RequirementModuleV1 | RuntimeExplorationModuleV1): RuntimeExplorationModuleV1 {
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    requiredDataFields: [...(module.requiredDataFields ?? [])],
    interactionCandidates: [...(module.interactionCandidates ?? [])],
  }
}
