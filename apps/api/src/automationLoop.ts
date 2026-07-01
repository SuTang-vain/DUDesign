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
  originalPrompt: string
  templateSummary?: string | null
}): string {
  const issueList = input.issues.length > 0
    ? input.issues.map(issue => `- ${issue}`).join('\n')
    : '- The artifact did not pass the configured quality gate.'
  const templateSummary = input.templateSummary?.trim()
  return [
    'DUDesign automatic repair request.',
    '',
    'The current HTML artifact failed quality checks:',
    issueList,
    '',
    `Original user goal: ${input.originalPrompt.trim()}`,
    templateSummary ? `Design context to preserve: ${templateSummary}` : '',
    '',
    'Repair only the concrete quality issues above.',
    'Keep the original product goal, visual direction, selected template, and user constraints.',
    'Return a complete static HTML artifact.',
    'Do not introduce external scripts, build steps, absolute paths, shell commands, or unbundled network assets.',
  ].filter(line => line.length > 0).join('\n')
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
