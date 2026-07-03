import type { CapabilitySnapshot } from '@dudesign/contracts'
import { useLanguage } from './LanguageProvider'
import { useCapabilityI18n } from '@/lib/capabilityI18n'

export function CapabilitySummary(props: {
  snapshot: CapabilitySnapshot | null | undefined
  compact?: boolean
  testId?: string
}): React.JSX.Element | null {
  const snapshot = props.snapshot
  const { t } = useLanguage()
  const c18n = useCapabilityI18n()
  if (!snapshot) return null
  const items = [
    { label: t('domain'), value: c18n.domainName(snapshot.template.domainTemplate.id, snapshot.template.domainTemplate.name) },
    { label: t('aesthetic'), value: c18n.aestheticName(snapshot.template.aestheticProfile.id, snapshot.template.aestheticProfile.name) },
    { label: t('palette'), value: c18n.paletteName(snapshot.template.colorPalette.id, snapshot.template.colorPalette.name) },
    ...(snapshot.template.brandStyleReference ? [{ label: t('referenceBrand'), value: c18n.brandName(snapshot.template.brandStyleReference.id, snapshot.template.brandStyleReference.name) }] : []),
    { label: t('loop'), value: c18n.loopName(snapshot.automation.loopProfile.id, snapshot.automation.loopProfile.name) },
  ]
  return (
    <section className={`capability-snapshot${props.compact ? ' compact' : ''}`} data-testid={props.testId ?? 'capability-snapshot'}>
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
