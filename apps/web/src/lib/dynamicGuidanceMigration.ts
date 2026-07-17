import type {
  CapabilityPlugin,
  CapabilityPreset,
  DesignSkill,
  DesignTemplatePack,
  EncyclopediaEntryGuidanceResponse,
  McpToolBinding,
} from '@dudesign/contracts'

export type DynamicGuidanceSelectionState = {
  selectedTemplatePackIds: string[]
  selectedSkillIds: string[]
  selectedMcpToolIds: string[]
  loopProfileId: string
  userOverrideCapabilityIds: string[]
}

export type DynamicGuidanceMigrationResult = DynamicGuidanceSelectionState & {
  retainedOverrideIds: string[]
  droppedOverrideIds: string[]
  loopOverrideRetained: boolean
}

export function normalizeGuidanceEntry(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export function hasMeaningfulGuidanceEntryChange(currentValue: string, guidanceValue: string): boolean {
  return normalizeGuidanceEntry(currentValue) !== normalizeGuidanceEntry(guidanceValue)
}

export function migrateDynamicGuidanceSelection(input: {
  guidance: EncyclopediaEntryGuidanceResponse
  preset: CapabilityPreset | null
  templatePacks: DesignTemplatePack[]
  plugins: CapabilityPlugin[]
  skills: DesignSkill[]
  mcpToolBindings: McpToolBinding[]
  current: DynamicGuidanceSelectionState
  preserveCompatibleOverrides: boolean
}): DynamicGuidanceMigrationResult {
  const overrideIds = new Set(input.current.userOverrideCapabilityIds)
  const selectedTemplateIds = new Set(input.current.selectedTemplatePackIds)
  const selectedSkillIds = new Set(input.current.selectedSkillIds)
  const selectedMcpToolIds = new Set(input.current.selectedMcpToolIds)
  const templatesById = new Map(input.templatePacks.map(template => [template.id, template]))
  const skillsById = new Map(input.skills.map(skill => [skill.id, skill]))
  const bindingsById = new Map(input.mcpToolBindings.map(binding => [binding.id, binding]))
  const pluginsById = new Map(input.plugins.map(plugin => [plugin.id, plugin]))
  const requiredTemplateIds = new Set(input.preset?.selectionPolicy.requiredTemplatePackIds ?? [])
  const requiredSkillIds = new Set(input.preset?.selectionPolicy.requiredSkillIds ?? [])
  const requiredMcpToolIds = new Set(input.preset?.selectionPolicy.requiredMcpToolIds ?? [])
  const allowedLoopIds = new Set(input.preset?.selectionPolicy.allowedLoopProfileIds ?? [])
  const retainedOverrideIds = new Set<string>()

  const templateCompatible = (id: string): boolean => {
    const template = templatesById.get(id)
    if (!template || template.status !== 'published') return false
    if (!template.supportedProductModes?.includes('dynamic_encyclopedia_card')) return false
    if (!template.parentPackId || !requiredTemplateIds.has(template.parentPackId)) return false
    const categories = template.supportedEntryCategories ?? []
    if (!categories.length) return true
    const entryCategories = new Set([
      input.guidance.classification.primaryCategory,
      input.guidance.classification.secondaryCategory,
      input.guidance.classification.tertiaryCategory,
    ].filter(Boolean))
    return categories.some(category => entryCategories.has(category))
  }

  const pluginCompatible = (pluginId: string | undefined, allowedTemplateCategories: string[]): boolean => {
    const plugin = pluginId ? pluginsById.get(pluginId) : null
    return Boolean(
      plugin
      && plugin.visibility === 'official'
      && plugin.status === 'active'
      && plugin.safetyLevel === 'safe'
      && allowedTemplateCategories.includes('encyclopedia'),
    )
  }

  const skillCompatible = (id: string): boolean => {
    const skill = skillsById.get(id)
    return Boolean(skill && pluginCompatible(skill.pluginId, skill.allowedTemplateCategories))
  }

  const bindingCompatible = (id: string): boolean => {
    const binding = bindingsById.get(id)
    return Boolean(binding && pluginCompatible(binding.pluginId, binding.allowedTemplateCategories))
  }

  const mergeCapabilityList = (options: {
    baseIds: string[]
    selectedIds: Set<string>
    requiredIds: Set<string>
    compatible: (id: string) => boolean
    limit?: number
  }): string[] => {
    if (!input.preserveCompatibleOverrides) return limitValues(unique(options.baseIds), options.limit)

    const removedBaseIds = new Set(options.baseIds.filter(id => (
      overrideIds.has(id)
      && !options.selectedIds.has(id)
      && !options.requiredIds.has(id)
    )))
    for (const id of removedBaseIds) retainedOverrideIds.add(id)

    const selectedOverrides = [...options.selectedIds].filter(id => (
      overrideIds.has(id)
      && options.compatible(id)
    ))
    const merged = limitValues(unique([
      ...selectedOverrides,
      ...options.baseIds.filter(id => !removedBaseIds.has(id)),
    ]), options.limit)
    for (const id of selectedOverrides) {
      if (merged.includes(id)) retainedOverrideIds.add(id)
    }
    return merged
  }

  const selectedTemplatePackIds = mergeCapabilityList({
    baseIds: input.guidance.templateRequirements.designTemplatePackIds ?? [],
    selectedIds: selectedTemplateIds,
    requiredIds: requiredTemplateIds,
    compatible: templateCompatible,
    limit: 3,
  })
  const selectedSkillIdsResult = mergeCapabilityList({
    baseIds: input.guidance.capabilityRequirements.plugins?.skillIds ?? [],
    selectedIds: selectedSkillIds,
    requiredIds: requiredSkillIds,
    compatible: skillCompatible,
  })
  const selectedMcpToolIdsResult = mergeCapabilityList({
    baseIds: input.guidance.capabilityRequirements.plugins?.mcpToolIds ?? [],
    selectedIds: selectedMcpToolIds,
    requiredIds: requiredMcpToolIds,
    compatible: bindingCompatible,
  })

  const guidedLoopId = input.guidance.capabilityRequirements.automation?.loopProfileId ?? 'loop_encyclopedia_spec_review'
  const loopOverrideRetained = input.preserveCompatibleOverrides
    && overrideIds.has(input.current.loopProfileId)
    && allowedLoopIds.has(input.current.loopProfileId)
  const loopProfileId = loopOverrideRetained ? input.current.loopProfileId : guidedLoopId
  if (loopOverrideRetained) retainedOverrideIds.add(loopProfileId)

  const knownCapabilityIds = new Set([
    ...templatesById.keys(),
    ...skillsById.keys(),
    ...bindingsById.keys(),
    ...(input.preset?.selectionPolicy.allowedLoopProfileIds ?? []),
  ])
  const droppedOverrideIds = [...overrideIds].filter(id => (
    knownCapabilityIds.has(id)
    && !retainedOverrideIds.has(id)
  ))

  return {
    selectedTemplatePackIds,
    selectedSkillIds: selectedSkillIdsResult,
    selectedMcpToolIds: selectedMcpToolIdsResult,
    loopProfileId,
    userOverrideCapabilityIds: [...retainedOverrideIds],
    retainedOverrideIds: [...retainedOverrideIds],
    droppedOverrideIds,
    loopOverrideRetained,
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function limitValues(values: string[], limit: number | undefined): string[] {
  return typeof limit === 'number' ? values.slice(0, limit) : values
}
