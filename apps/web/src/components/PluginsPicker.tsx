'use client'

import type { CapabilityPlugin, DesignSkill, McpToolBinding, PluginPermissionScope } from '@dudesign/contracts'
import { Icon } from '@/components/Icon'
import { useCapabilityI18n } from '@/lib/capabilityI18n'

export type PluginsPickerLabels = {
  pluginsPill: string
  selectPlugins: string
  pluginsHint: string
  pluginTypeSkill: string
  pluginTypeMcp: string
  safetyLevel: string
  safe: string
  reviewRequired: string
  scopes: string
  ruleSummary: string
}

const scopePhrases: Record<PluginPermissionScope, string> = {
  readonly_context: 'readonly_context',
  asset_readonly: 'asset_readonly',
  validation_only: 'validation_only',
  artifact_write: 'artifact_write',
  external_network: 'external_network',
}

export function PluginsPicker(props: {
  plugins: CapabilityPlugin[]
  skills: DesignSkill[]
  mcpToolBindings: McpToolBinding[]
  selectedSkillIds: string[]
  selectedMcpToolIds: string[]
  labels: PluginsPickerLabels
  onToggleSkill: (id: string) => void
  onToggleMcpTool: (id: string) => void
}): React.JSX.Element {
  const c18n = useCapabilityI18n()
  const skillByPlugin = new Map(props.skills.map(skill => [skill.pluginId, skill]))
  const bindingByPlugin = new Map(props.mcpToolBindings.map(binding => [binding.pluginId, binding]))
  // 统一展示官方、active 的插件(skill + mcp_tool),按安全等级标注
  const officialPlugins = props.plugins.filter(plugin =>
    plugin.visibility === 'official' && plugin.status === 'active'
  )

  return (
    <div className="skills-picker" data-testid="plugins-picker">
      <p className="skills-hint">{props.labels.pluginsHint}</p>
      <div className="skill-cards">
        {officialPlugins.map(plugin => {
          const isSkill = plugin.type === 'skill'
          const skill = isSkill ? skillByPlugin.get(plugin.id) : undefined
          const binding = !isSkill ? bindingByPlugin.get(plugin.id) : undefined
          const selected = isSkill
            ? (skill ? props.selectedSkillIds.includes(skill.id) : false)
            : (binding ? props.selectedMcpToolIds.includes(binding.id) : false)
          const selectableId = isSkill ? skill?.id : binding?.id
          if (!selectableId) return null
          const onToggle = () => isSkill ? props.onToggleSkill(selectableId) : props.onToggleMcpTool(selectableId)
          const safetyChip = plugin.safetyLevel === 'safe' ? 'ok' : plugin.safetyLevel === 'review_required' ? 'warn' : 'err'
          const safetyText = plugin.safetyLevel === 'safe' ? props.labels.safe
            : plugin.safetyLevel === 'review_required' ? props.labels.reviewRequired
            : plugin.safetyLevel
          const scopes = plugin.permissionPolicy.scopes.map(scope => scopePhrases[scope])
          const ruleLine = isSkill && skill ? (c18n.skillRules(skill.id, skill.rules)[0] ?? '') : ''
          return (
            <button
              key={plugin.id}
              type="button"
              className={`skill-card${selected ? ' active' : ''}`}
              data-testid={`plugin-card-${plugin.id}`}
              onClick={onToggle}
            >
              <span className="skill-head">
                <strong>{plugin.name}</strong>
                <span className="chip info skill-mini">{isSkill ? props.labels.pluginTypeSkill : props.labels.pluginTypeMcp}</span>
                <span className={`chip ${safetyChip} skill-mini`}>{safetyText}</span>
                <i className={`skill-check${selected ? ' active' : ''}`} aria-hidden="true">
                  <Icon name="check" size={14} />
                </i>
              </span>
              <span className="skill-desc">{plugin.description}</span>
              {ruleLine ? <span className="skill-rule-line">{ruleLine}</span> : null}
              <span className="skill-block">
                <small>{props.labels.scopes}</small>
                <span className="skill-chips">
                  {scopes.map(scope => (
                    <span key={scope} className="chip skill-mini">{scope}</span>
                  ))}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
