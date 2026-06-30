export type UserErrorSeverity = 'info' | 'warning' | 'error'

export type UserFacingError = {
  title: string
  message: string
  action: string
  retryable: boolean
  severity: UserErrorSeverity
  detail?: string
}

export type UserErrorInput = {
  code?: string | null
  message?: string | null
  status?: number | null
  recoverable?: boolean | null
  scope?: 'api' | 'job' | 'variation' | 'runtime' | 'stream'
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly userError: UserFacingError

  constructor(input: { status: number; code?: string | null; message?: string | null }) {
    const userError = toUserFacingError({
      status: input.status,
      code: input.code,
      message: input.message,
      scope: 'api',
    })
    super(userError.message)
    this.name = 'ApiClientError'
    this.status = input.status
    this.code = input.code ?? `HTTP_${input.status}`
    this.userError = userError
  }
}

export function toUserFacingError(input: UserErrorInput): UserFacingError {
  const code = normalizeCode(input.code)
  const rawMessage = cleanMessage(input.message)
  const retryable = input.recoverable ?? defaultRetryable(code, input.status)

  if (code === 'RUNTIME_UNAVAILABLE' || code === 'RUNTIME_REQUEST_TIMEOUT' || code === 'RUNTIME_STREAM_IDLE_TIMEOUT') {
    return {
      title: 'Runtime temporarily unavailable',
      message: 'The design runtime did not respond. Saved sessions and artifacts remain available, and you can retry this task.',
      action: 'Retry generation',
      retryable: true,
      severity: 'warning',
      detail: rawMessage,
    }
  }

  if (code === 'MODEL_FORBIDDEN') {
    return {
      title: 'Model unavailable',
      message: 'This model is not enabled for your account. Choose another model or ask an administrator to enable access.',
      action: 'Choose another model',
      retryable: false,
      severity: 'warning',
      detail: rawMessage,
    }
  }

  if (code === 'ARTIFACT_QUALITY_GATE') {
    return {
      title: 'Preview needs attention',
      message: 'The generated page may be blank, too dark, or missing required assets. You can still inspect the code and refine this variation.',
      action: 'Refine this variation',
      retryable: true,
      severity: 'warning',
      detail: rawMessage,
    }
  }

  if (code === 'JOB_NOT_CANCELLABLE') {
    return {
      title: 'Job already finished',
      message: 'This job can no longer be cancelled or retried from its current state.',
      action: 'Start a new generation',
      retryable: false,
      severity: 'info',
      detail: rawMessage,
    }
  }

  if (code === 'SHARE_EXPIRED' || code === 'SHARE_REVOKED' || code === 'SHARE_FORBIDDEN') {
    return {
      title: 'Share link unavailable',
      message: 'This share link is no longer available. Ask the owner to create a new link.',
      action: 'Request a new link',
      retryable: false,
      severity: 'warning',
      detail: rawMessage,
    }
  }

  if (input.scope === 'stream') {
    return {
      title: 'Live updates paused',
      message: 'The task is still saved. Refreshing the snapshot will recover the latest generated state.',
      action: 'Refresh status',
      retryable: true,
      severity: 'warning',
      detail: rawMessage,
    }
  }

  return {
    title: input.scope === 'variation' ? 'This variation failed' : 'Something went wrong',
    message: rawMessage || 'The request could not be completed. You can retry, or continue from the latest saved artifact if one is available.',
    action: retryable ? 'Try again' : 'Review details',
    retryable,
    severity: input.status && input.status >= 500 ? 'error' : 'warning',
    detail: code && code !== 'UNKNOWN_ERROR' ? code : undefined,
  }
}

function normalizeCode(code: string | null | undefined): string {
  return code?.trim().toUpperCase() || 'UNKNOWN_ERROR'
}

function cleanMessage(message: string | null | undefined): string {
  return message?.replace(/\s+/g, ' ').trim() ?? ''
}

function defaultRetryable(code: string, status: number | null | undefined): boolean {
  if (status && status >= 500) return true
  return code.startsWith('RUNTIME_') || code === 'UNKNOWN_ERROR'
}
