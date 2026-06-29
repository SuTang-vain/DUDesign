import type { DesignJob, DesignVariation } from '@dudesign/domain'
import type { AdminFailureSummary } from './repository.js'

const REDACTED_EMAIL = '[redacted-email]'
const REDACTED_SECRET = '[redacted-secret]'
const REDACTED_PATH = '[redacted-path]'

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const tokenAssignmentPattern = /\b(api[_-]?key|secret|token|password|pwd)\s*[:=]\s*["']?([A-Za-z0-9_./+=:-]{8,})["']?/gi
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi
const commonSecretPattern = /\b(?:sk|pk|ghp|gho|github_pat|xoxb|xoxp|AKIA)[A-Za-z0-9_=-]{8,}\b/g
const unixPathPattern = /(^|[\s("'`=:[{,])\/(?:Users|home|var|tmp|private|Volumes)\/[^\s"'`<>),\]}]+/g
const windowsPathPattern = /\b[A-Za-z]:\\(?:Users|Temp|Windows|ProgramData)\\[^\s"'`<>),\]}]+/g

export function redactAdminText(value: string | null | undefined): string | null {
  if (value == null) return null
  return value
    .replace(tokenAssignmentPattern, (_, key: string) => `${key}=${REDACTED_SECRET}`)
    .replace(bearerPattern, `Bearer ${REDACTED_SECRET}`)
    .replace(commonSecretPattern, REDACTED_SECRET)
    .replace(emailPattern, REDACTED_EMAIL)
    .replace(unixPathPattern, (_match, prefix: string) => `${prefix}${REDACTED_PATH}`)
    .replace(windowsPathPattern, REDACTED_PATH)
}

export function redactAdminStorageKey(value: string): string {
  return redactAdminText(value) ?? REDACTED_PATH
}

export function adminPreviewText(value: string | null, maxLength: number): string | null {
  const redacted = redactAdminText(value)
  if (!redacted) return null
  const compact = redacted.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 1)}…`
}

export function summarizeAdminSupportIssue(
  latestJob: Pick<DesignJob, 'status' | 'id'> | null,
  failedVariations: Array<Pick<DesignVariation, 'id' | 'errorCode' | 'errorMessage'>>,
): AdminFailureSummary {
  if (!latestJob) {
    return {
      severity: 'warning',
      message: 'No jobs have been created for this session.',
      failedVariationCount: 0,
      examples: [],
    }
  }
  if (latestJob.status === 'failed') {
    return {
      severity: 'blocked',
      message: `Latest job ${latestJob.id} failed.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (failedVariations.length > 0) {
    return {
      severity: 'warning',
      message: `${failedVariations.length} variation(s) reported errors.`,
      failedVariationCount: failedVariations.length,
      examples: failedVariations.slice(0, 3).map(toFailureExample),
    }
  }
  if (latestJob.status === 'queued' || latestJob.status === 'running') {
    return {
      severity: 'warning',
      message: `Latest job ${latestJob.id} is still ${latestJob.status}.`,
      failedVariationCount: 0,
      examples: [],
    }
  }
  return {
    severity: 'ok',
    message: 'No job or variation failures detected.',
    failedVariationCount: 0,
    examples: [],
  }
}

function toFailureExample(variation: Pick<DesignVariation, 'id' | 'errorCode' | 'errorMessage'>) {
  return {
    variationId: variation.id,
    errorCode: variation.errorCode,
    message: adminPreviewText(variation.errorMessage, 120),
  }
}
