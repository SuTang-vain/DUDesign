import type { CapabilitySnapshot } from '@dudesign/contracts'

export function CapabilitySummary(props: {
  snapshot: CapabilitySnapshot | null | undefined
  compact?: boolean
  testId?: string
}): React.JSX.Element | null {
  const snapshot = props.snapshot
  if (!snapshot) return null
  const items = [
    { label: 'Domain', value: snapshot.template.domainTemplate.name },
    { label: 'Aesthetic', value: snapshot.template.aestheticProfile.name },
    { label: 'Palette', value: snapshot.template.colorPalette.name },
    { label: 'Loop', value: snapshot.automation.loopProfile.name },
  ]
  return (
    <section className={`capability-snapshot${props.compact ? ' compact' : ''}`} data-testid={props.testId ?? 'capability-snapshot'}>
      <strong>Generation direction</strong>
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
