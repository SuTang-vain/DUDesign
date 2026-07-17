import type { UserCapabilitySnapshot } from '@dudesign/contracts'
import { useLanguage } from './LanguageProvider'
import { useCapabilityI18n } from '@/lib/capabilityI18n'

export function CapabilitySummary(props: {
  snapshot: UserCapabilitySnapshot | null | undefined
  compact?: boolean
  variant?: 'cards' | 'inline'
  testId?: string
}): React.JSX.Element | null {
  const snapshot = props.snapshot
  const { t } = useLanguage()
  const c18n = useCapabilityI18n()
  if (!snapshot) return null
  const selectedPlugins = snapshot.plugins.pluginSnapshot?.plugins ?? []
  const selectedSkills = snapshot.plugins.pluginSnapshot?.skills ?? []
  const selectedMcpTools = snapshot.plugins.pluginSnapshot?.mcpToolBindings ?? []
  const pluginNamesById = new Map(selectedPlugins.map(plugin => [plugin.id, plugin.name]))
  const items = [
    { label: t('domain'), value: c18n.domainName(snapshot.template.domainTemplate.id, snapshot.template.domainTemplate.name) },
    { label: t('aesthetic'), value: c18n.aestheticName(snapshot.template.aestheticProfile.id, snapshot.template.aestheticProfile.name) },
    { label: t('palette'), value: c18n.paletteName(snapshot.template.colorPalette.id, snapshot.template.colorPalette.name) },
    ...(snapshot.template.brandStyleReference ? [{ label: t('referenceBrand'), value: c18n.brandName(snapshot.template.brandStyleReference.id, snapshot.template.brandStyleReference.name) }] : []),
    ...(selectedSkills.length ? [{
      label: t('skills'),
      value: selectedSkills.map(skill => c18n.skillName(skill.id, pluginNamesById.get(skill.pluginId) ?? skill.id)).join(' · '),
    }] : []),
    ...(selectedMcpTools.length ? [{
      label: t('mcp'),
      value: selectedMcpTools.map(tool => tool.id).join(' · '),
    }] : []),
    { label: t('loop'), value: c18n.loopName(snapshot.automation.loopProfile.id, snapshot.automation.loopProfile.name) },
  ]
  return (
    <section className={`capability-snapshot${props.compact ? ' compact' : ''}${props.variant === 'inline' ? ' inline' : ''}`} data-testid={props.testId ?? 'capability-snapshot'}>
      <strong>{t('designDirection')}</strong>
      <div>
        {items.map(item => (
          <span key={item.label}>
            <small>{item.label}</small>
            {item.value}
          </span>
        ))}
      </div>
    </section>
  )
}
