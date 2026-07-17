import type { RequirementModuleGraphV1 } from '@dudesign/contracts'
import { starGroupRequirementModuleGraph } from './fixtures/starGroupRequirementModuleGraph.js'
import { dynamicEncyclopediaRequirementModuleGraph } from './fixtures/dynamicEncyclopediaRequirementModuleGraph.js'

const officialRequirementModuleGraphs = [
  starGroupRequirementModuleGraph,
  dynamicEncyclopediaRequirementModuleGraph,
] as const

export function getAuthorizedRequirementModuleGraphById(
  requirementModuleGraphId: string,
  _userId: string,
  _workspaceId: string,
): RequirementModuleGraphV1 | null {
  return officialRequirementModuleGraphs.find(graph => graph.id === requirementModuleGraphId) ?? null
}

export function listOfficialRequirementModuleGraphs(): RequirementModuleGraphV1[] {
  return [...officialRequirementModuleGraphs]
}
