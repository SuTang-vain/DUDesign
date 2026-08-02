import type { RequirementModuleGraphV1 } from '@dudesign/contracts'
import { productShowcaseRequirementModuleGraph } from './fixtures/productShowcaseRequirementModuleGraph.js'

const officialRequirementModuleGraphs = [
  productShowcaseRequirementModuleGraph,
] as const

export function getAuthorizedRequirementModuleGraphById(
  requirementModuleGraphId: string,
  _userId: string,
  _workspaceId: string,
): RequirementModuleGraphV1 | null {
  return officialRequirementModuleGraphs.find(graph => (graph as RequirementModuleGraphV1).id === requirementModuleGraphId) ?? null
}

export function listOfficialRequirementModuleGraphs(): RequirementModuleGraphV1[] {
  return [...officialRequirementModuleGraphs]
}
