import type { ArtifactQualitySummary, AutomationLoopProfile } from '@dudesign/contracts'

export type AutomationLoopStopReason =
  | 'max_attempts_reached'
  | 'max_cost_reached'
  | 'max_duration_reached'
  | 'quality_failed'
  | 'quality_passed'
  | 'runtime_unavailable'
  | 'runtime_contract_mismatch'
  | 'repeated_failure'
  | 'cancelled'

export type AutomationLoopStopDecision = {
  shouldStop: boolean
  reason: AutomationLoopStopReason | null
  message: string | null
  recoverable: boolean
}

export type AutomationLoopEvaluationInput = {
  profile: AutomationLoopProfile
  attempts: number
  elapsedMs: number
  costCents: number
  quality: ArtifactQualitySummary
  runtimeStatus?: 'available' | 'unavailable' | 'contract_mismatch'
  cancelled?: boolean
  previousIssueFingerprints?: string[]
}

export type AutomationRepairFinding = {
  id: string
  source: 'static_rule' | 'template_rule' | 'pixel_gate'
  severity: 'error' | 'warning'
  message: string
  repairHint: string
}

export function evaluateAutomationLoopStop(input: AutomationLoopEvaluationInput): AutomationLoopStopDecision {
  if (input.cancelled) return stop('cancelled')
  if (input.runtimeStatus === 'contract_mismatch') return stop('runtime_contract_mismatch')
  if (input.runtimeStatus === 'unavailable') return stop('runtime_unavailable')
  if (input.quality.status === 'pass') return stop('quality_passed')
  if (input.elapsedMs >= input.profile.maxDurationMs) return stop('max_duration_reached')
  if (input.profile.maxCostCents !== null && input.costCents >= input.profile.maxCostCents) return stop('max_cost_reached')
  if (isRepeatedFailure(input.quality.issues, input.previousIssueFingerprints ?? [])) return stop('repeated_failure')
  if (input.attempts >= input.profile.maxRepairAttempts) {
    return stop(input.quality.status === 'fail' ? 'max_attempts_reached' : 'quality_failed')
  }
  return {
    shouldStop: false,
    reason: null,
    message: null,
    recoverable: true,
  }
}

export function automationLoopUserMessage(reason: AutomationLoopStopReason): string {
  switch (reason) {
    case 'quality_passed':
      return 'The generated page passed the configured quality checks.'
    case 'max_attempts_reached':
      return 'Automatic repair reached its attempt limit. The current version is preserved and you can continue with a manual instruction.'
    case 'max_cost_reached':
      return 'Automatic repair stopped to avoid exceeding the configured cost limit. The current version is preserved.'
    case 'max_duration_reached':
      return 'Automatic repair took too long and was stopped to avoid blocking the task. The current version is preserved.'
    case 'quality_failed':
      return 'The page still has quality issues. Add a more specific instruction to continue refining it.'
    case 'runtime_unavailable':
      return 'The design runtime is temporarily unavailable. The current artifact is preserved and the task can be continued later.'
    case 'runtime_contract_mismatch':
      return 'The runtime compatibility contract changed, so automatic repair stopped to protect this task.'
    case 'repeated_failure':
      return 'Automatic repair encountered the same quality issue repeatedly. A manual instruction is needed to move forward.'
    case 'cancelled':
      return 'Automatic repair was cancelled.'
  }
}

export function automationIssueFingerprint(issues: string[]): string {
  return issues
    .map(issue => issue.toLowerCase().replace(/artifact v\d+/g, 'artifact').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .sort()
    .join('|')
}

export function buildAutomationRepairPrompt(input: {
  issues: string[]
  specFindings?: AutomationRepairFinding[]
  originalPrompt: string
  templateSummary?: string | null
}): string {
  const issueList = input.issues.length > 0
    ? input.issues.map(issue => `- ${issue}`).join('\n')
    : '- The artifact did not pass the configured quality gate.'
  const templateSummary = input.templateSummary?.trim()
  const specFindings = input.specFindings ?? []
  const specFindingList = specFindings.length
    ? [
      '',
      'Structured dynamic encyclopedia spec findings:',
      ...specFindings.map(finding =>
        `- [${finding.severity}] ${finding.id} (${finding.source}): ${finding.message} Repair hint: ${finding.repairHint}`,
      ),
    ]
    : []
  const targetedInstructions = targetedRepairInstructions(specFindings)
  return [
    'DUDesign automatic repair request.',
    '',
    'The current HTML artifact failed quality checks:',
    issueList,
    ...specFindingList,
    ...targetedInstructions,
    '',
    `Original user goal: ${input.originalPrompt.trim()}`,
    templateSummary ? `Design context to preserve: ${templateSummary}` : '',
    '',
    'Repair only the concrete quality issues above.',
    'Keep the original product goal, visual direction, selected template, and user constraints.',
    'Return a complete self-contained HTML/CSS/JS artifact.',
    'Small inline JavaScript is allowed only for local UI controls such as tabs, page switchers, accordions, modal dialogs, reveal buttons, and local state updates.',
    'Do not introduce external scripts, build steps, absolute paths, shell commands, remote API calls, or unbundled network assets.',
  ].filter(line => line.length > 0).join('\n')
}

function targetedRepairInstructions(findings: AutomationRepairFinding[]): string[] {
  if (findings.length === 0) return []
  const instructions: string[] = []
  const findingIds = new Set(findings.map(finding => finding.id))

  if (findingIds.has('encyclopedia.fake_tab_interaction')) {
    instructions.push(
      '',
      'Required tab interaction repair:',
      '- Keep visible tab controls only if they are real buttons with role="tab", aria-selected, and aria-controls.',
      '- Add matching role="tabpanel" sections with stable ids and hidden states.',
      '- Add scoped inline JavaScript that switches aria-selected and hidden when a tab is clicked.',
    )
  }

  if (findingIds.has('encyclopedia.fake_page_switcher_interaction')) {
    instructions.push(
      '',
      'Required page switcher repair:',
      '- Keep pagination/page-switch controls only if they switch between local page panels.',
      '- Add hidden states for inactive panels and a scoped inline click handler that updates the active page.',
      '- Do not rely on scrolling to reveal overflow content.',
    )
  }

  if (findingIds.has('encyclopedia.fake_modal_interaction')) {
    instructions.push(
      '',
      'Required modal interaction repair:',
      '- Keep modal/detail/reveal controls only if they open a local modal or detail panel.',
      '- Add accessible open/close buttons, aria-expanded or aria-hidden state updates, and focus-safe local handlers.',
      '- Do not navigate to external pages or call network APIs for modal content.',
    )
  }

  if (findingIds.has('encyclopedia.no_scroll_frame_required')
    || findingIds.has('encyclopedia.overflow_scroll_blocked')
    || findingIds.has('encyclopedia.scroll_container_class_blocked')) {
    instructions.push(
      '',
      'Required no-scroll frame repair:',
      '- Preserve a fixed dynamic encyclopedia frame and set overflow:hidden on the outer frame.',
      '- Remove .scroll-container and overflow:auto/scroll from the card body.',
      '- Route extra content through tabs, page switchers, accordions, or local modal panels.',
    )
  }

  return instructions
}

function stop(reason: AutomationLoopStopReason): AutomationLoopStopDecision {
  return {
    shouldStop: true,
    reason,
    message: automationLoopUserMessage(reason),
    recoverable: reason !== 'quality_passed' && reason !== 'cancelled',
  }
}

function isRepeatedFailure(issues: string[], previousFingerprints: string[]): boolean {
  if (issues.length === 0 || previousFingerprints.length === 0) return false
  return previousFingerprints.includes(automationIssueFingerprint(issues))
}
