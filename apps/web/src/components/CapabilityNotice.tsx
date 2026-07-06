import type { McpInvocationResult } from '@dudesign/contracts'
import { mcpInvocationToUserError } from '@/lib/capabilityErrors'
import type { UserFacingError } from '@/lib/userErrors'
import { Icon } from './Icon'

export type CapabilityNoticeAction = {
  label: string
  onClick?: () => void
}

export function CapabilityNotice(props: {
  error?: UserFacingError | null
  mcpResult?: McpInvocationResult | null
  actions?: CapabilityNoticeAction[]
  testId?: string
}): React.JSX.Element | null {
  const error = props.error ?? (props.mcpResult ? mcpInvocationToUserError(props.mcpResult) : null)
  if (!error) return null

  return (
    <section
      className={`capability-notice ${error.severity}`}
      data-testid={props.testId ?? 'capability-notice'}
      aria-live="polite"
    >
      <div className="capability-notice-icon" aria-hidden="true">
        <Icon name={error.severity === 'info' ? 'circleDot' : 'sparkles'} size={16} />
      </div>
      <div className="capability-notice-copy">
        <strong>{error.title}</strong>
        <span>{error.message}</span>
      </div>
      <div className="capability-notice-actions">
        <button type="button" className="capability-notice-action primary" onClick={props.actions?.[0]?.onClick}>
          {props.actions?.[0]?.label ?? error.action}
        </button>
        {props.actions?.slice(1).map(action => (
          <button key={action.label} type="button" className="capability-notice-action" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  )
}
