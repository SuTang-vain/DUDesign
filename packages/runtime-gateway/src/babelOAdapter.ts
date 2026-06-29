import { createDesignEvent, type DesignEvent } from '@dudesign/contracts'

export type BabelONexusEvent =
  | {
      type: 'session_started'
      sessionId?: string
      runtimeSessionId?: string
      memoryRefs?: Array<{ id: string; summary: string; relevance?: number }>
      timestamp?: string
    }
  | {
      type: 'assistant_delta' | 'thinking_delta'
      delta?: string
      text?: string
      channel?: 'assistant' | 'thinking' | 'tool' | 'system'
      timestamp?: string
    }
  | {
      type: 'code_delta' | 'file_delta'
      path?: string
      language?: string
      delta?: string
      text?: string
      sequence?: number
      isFinal?: boolean
      timestamp?: string
    }
  | {
      type: 'workspace_dirty' | 'workspace_dirty_detected'
      artifactId?: string
      entryPath?: string
      changedPaths?: string[]
      path?: string
      html?: string
      files?: Array<{ path: string; content: string; contentType?: string }>
      timestamp?: string
    }
  | {
      type: 'permission_request'
      permissionRequestId?: string
      requestId?: string
      risk?: 'read' | 'write' | 'execute' | 'task'
      message?: string
      toolName?: string
      timestamp?: string
    }
  | {
      type: 'result'
      artifactId?: string
      entryPath?: string
      changedPaths?: string[]
      path?: string
      html?: string
      files?: Array<{ path: string; content: string; contentType?: string }>
      inputTokens?: number
      outputTokens?: number
      costCents?: number
      durationMs?: number
      timestamp?: string
    }
  | {
      type: 'error'
      errorCode?: string
      code?: string
      message?: string
      recoverable?: boolean
      timestamp?: string
    }

export type UnknownBabelONexusEvent = {
  type: string
  timestamp?: string
  [key: string]: unknown
}

export type BabelOEventContext = {
  sessionId?: string
  jobId?: string
  variationId?: string
  requestId?: string
}

export class BabelONexusEventAdapter {
  toDesignEvent(event: BabelONexusEvent | UnknownBabelONexusEvent, context: BabelOEventContext = {}): DesignEvent {
    const raw = event as Record<string, unknown>
    const base = {
      requestId: context.requestId,
      sessionId: context.sessionId,
      jobId: context.jobId,
      variationId: context.variationId,
      timestamp: optionalString(raw.timestamp),
    }

    switch (event.type) {
      case 'session_started':
        return createDesignEvent({
          ...base,
          type: 'design.session_started',
          sessionId: optionalString(raw.sessionId) ?? context.sessionId,
          payload: {
            runtimeSessionRef: optionalString(raw.runtimeSessionId),
            memoryRefs: memoryRefs(raw.memoryRefs),
          },
        })
      case 'assistant_delta':
      case 'thinking_delta':
        return createDesignEvent({
          ...base,
          type: 'design.variation_streaming',
          payload: {
            channel: channel(raw.channel) ?? (event.type === 'thinking_delta' ? 'thinking' : 'assistant'),
            delta: optionalString(raw.delta) ?? optionalString(raw.text) ?? '',
          },
        })
      case 'code_delta':
      case 'file_delta':
        return createDesignEvent({
          ...base,
          type: 'design.variation_code_delta',
          payload: {
            path: optionalString(raw.path) ?? 'index.html',
            language: language(raw.language) ?? languageForPath(optionalString(raw.path)) ?? 'text',
            delta: optionalString(raw.delta) ?? optionalString(raw.text) ?? '',
            sequence: optionalNumber(raw.sequence) ?? 0,
            isFinal: optionalBoolean(raw.isFinal),
          },
        })
      case 'workspace_dirty':
      case 'workspace_dirty_detected':
        return createDesignEvent({
          ...base,
          type: 'design.variation_artifact_updated',
          payload: {
            artifactId: optionalString(raw.artifactId),
            entryPath: optionalString(raw.entryPath) ?? optionalString(raw.path),
            changedPaths: stringArray(raw.changedPaths) ?? (optionalString(raw.path) ? [optionalString(raw.path)!] : []),
            html: optionalString(raw.html),
            files: runtimeFiles(raw.files),
          },
        })
      case 'permission_request':
        return createDesignEvent({
          ...base,
          type: 'design.permission_required',
          payload: {
            permissionRequestId: optionalString(raw.permissionRequestId) ?? optionalString(raw.requestId) ?? 'runtime_permission_request',
            risk: risk(raw.risk) ?? 'task',
            message: optionalString(raw.message) ?? 'Runtime requested permission.',
            toolName: optionalString(raw.toolName),
          },
        })
      case 'result':
        return createDesignEvent({
          ...base,
          type: 'design.variation_completed',
          payload: {
            artifactId: optionalString(raw.artifactId),
            entryPath: optionalString(raw.entryPath) ?? optionalString(raw.path),
            changedPaths: stringArray(raw.changedPaths) ?? (optionalString(raw.path) ? [optionalString(raw.path)!] : undefined),
            html: optionalString(raw.html),
            files: runtimeFiles(raw.files),
            inputTokens: optionalNumber(raw.inputTokens),
            outputTokens: optionalNumber(raw.outputTokens),
            costCents: optionalNumber(raw.costCents),
            durationMs: optionalNumber(raw.durationMs),
          },
        })
      case 'error':
        return createDesignEvent({
          ...base,
          type: 'design.variation_failed',
          payload: {
            errorCode: optionalString(raw.errorCode) ?? optionalString(raw.code) ?? 'RUNTIME_ERROR',
            message: optionalString(raw.message) ?? 'Runtime error.',
            recoverable: optionalBoolean(raw.recoverable) ?? false,
          },
        })
      default:
        return createDesignEvent({
          ...base,
          type: 'design.runtime_warning',
          payload: {
            severity: 'warn',
            code: 'UNKNOWN_RUNTIME_EVENT',
            message: `Ignored unknown BabeL-O event: ${event.type}`,
          },
        })
    }
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function channel(value: unknown): 'assistant' | 'thinking' | 'tool' | 'system' | undefined {
  return value === 'assistant' || value === 'thinking' || value === 'tool' || value === 'system' ? value : undefined
}

function language(value: unknown): 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text' | undefined {
  return value === 'html' || value === 'css' || value === 'javascript' || value === 'typescript' || value === 'json' || value === 'text'
    ? value
    : undefined
}

function languageForPath(path: string | undefined): 'html' | 'css' | 'javascript' | 'typescript' | 'json' | 'text' | undefined {
  if (!path) return undefined
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

function risk(value: unknown): 'read' | 'write' | 'execute' | 'task' | undefined {
  return value === 'read' || value === 'write' || value === 'execute' || value === 'task' ? value : undefined
}

function memoryRefs(value: unknown): Array<{ id: string; summary: string; relevance?: number }> | undefined {
  if (!Array.isArray(value)) return undefined
  const refs = value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const id = optionalString(record.id)
      const summary = optionalString(record.summary)
      if (!id || !summary) return null
      const relevance = optionalNumber(record.relevance)
      return {
        id,
        summary,
        ...(relevance !== undefined && { relevance }),
      }
    })
    .filter(item => item !== null)
  return refs.length > 0 ? refs : undefined
}

function runtimeFiles(value: unknown): Array<{ path: string; content: string; contentType?: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  const files = value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const path = optionalString(record.path)
      const content = optionalString(record.content)
      if (!path || content === undefined) return null
      const contentType = optionalString(record.contentType)
      return {
        path,
        content,
        ...(contentType && { contentType }),
      }
    })
    .filter(item => item !== null)
  return files.length > 0 ? files : undefined
}
