import type {
  CancelRuntimeJobInput,
  CancelRuntimeJobResult,
  RefineVariationInput,
  CreateRuntimeSessionInput,
  ResumeRuntimeSessionInput,
  RuntimeContract,
  RuntimeContractStatus,
  RuntimeHealth,
  RuntimeResumeResult,
  RuntimeSessionRef,
  SpawnVariationAgentsInput,
} from './types.js'

export const DUDESIGN_RUNTIME_CONTRACT_VERSION = '2026-06-26.dudesign-runtime.v1'

export type RuntimeGatewayErrorCode =
  | 'RUNTIME_UNAVAILABLE'
  | 'RUNTIME_CONTRACT_MISMATCH'
  | 'RUNTIME_BAD_RESPONSE'
  | 'RUNTIME_REQUEST_TIMEOUT'
  | 'RUNTIME_STREAM_IDLE_TIMEOUT'
  | 'RUNTIME_STREAM_NOT_IMPLEMENTED'
  | 'RUNTIME_CANCEL_NOT_IMPLEMENTED'

export class RuntimeGatewayError extends Error {
  constructor(
    public readonly code: RuntimeGatewayErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'RuntimeGatewayError'
  }
}

export type BabelORuntimeClientConfig = {
  baseUrl: string
  apiKey?: string
  authHeaderName?: string
  timeoutMs?: number
  streamIdleTimeoutMs?: number
  streamReconnectAttempts?: number
  expectedContractVersion?: string
  fetch?: typeof fetch
}

export type BabelORuntimeHealthResponse = {
  runtime?: string
  runtimeVersion?: string
  version?: string
  contractVersion?: string
  status?: string
  message?: string
}

export type BabelORuntimeContractResponse = {
  runtime?: string
  runtimeVersion?: string
  version?: string
  contractVersion?: string
  requiredEndpoints?: string[]
  requiredEvents?: string[]
  eventMappings?: Record<string, string>
  status?: string
}

export type BabelORuntimeSessionResponse = {
  runtimeSessionId?: string
  sessionId?: string
}

export type BabelORuntimeResumeResponse = {
  status?: string
  runtimeSessionId?: string | null
  message?: string
}

export type BabelORuntimeAgentResponse = {
  streamId?: string
  agentJobId?: string
  runtimeChildSessionId?: string
}

export type BabelORuntimeCancelResponse = {
  cancelled?: boolean
  message?: string
  cancelledVariationCount?: number
  failedVariationCount?: number
}

export type BabelORuntimeStreamRequest = {
  streamId?: string
  runtimeSessionId?: string
  agentJobId?: string
}

export class BabelORuntimeClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly streamIdleTimeoutMs: number
  private readonly streamReconnectAttempts: number
  private readonly expectedContractVersion: string
  private readonly fetchImpl: typeof fetch

  constructor(private readonly config: BabelORuntimeClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl)
    this.timeoutMs = config.timeoutMs ?? 5000
    this.streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? 30000
    this.streamReconnectAttempts = config.streamReconnectAttempts ?? 0
    this.expectedContractVersion = config.expectedContractVersion ?? DUDESIGN_RUNTIME_CONTRACT_VERSION
    this.fetchImpl = config.fetch ?? fetch
  }

  async getRuntimeHealth(): Promise<RuntimeHealth> {
    try {
      const response = await this.requestJson<BabelORuntimeHealthResponse>('/v1/health')
      const contractVersion = optionalString(response.contractVersion) ?? 'unknown'
      const runtimeVersion = optionalString(response.runtimeVersion) ?? optionalString(response.version) ?? null
      const status = this.resolveStatus(contractVersion, response.status)
      return {
        status,
        runtime: 'babel-o',
        runtimeVersion,
        contractVersion,
        checkedAt: new Date().toISOString(),
        message: optionalString(response.message) ?? statusMessage(status),
      }
    } catch (error) {
      return {
        status: 'unavailable',
        runtime: 'babel-o',
        runtimeVersion: null,
        contractVersion: this.expectedContractVersion,
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Runtime health check failed.',
      }
    }
  }

  async getRuntimeContract(): Promise<RuntimeContract> {
    try {
      const response = await this.requestJson<BabelORuntimeContractResponse>('/v1/contract')
      const contractVersion = optionalString(response.contractVersion) ?? 'unknown'
      const status = this.resolveStatus(contractVersion, response.status)
      return {
        runtime: 'babel-o',
        runtimeVersion: optionalString(response.runtimeVersion) ?? optionalString(response.version) ?? null,
        contractVersion,
        status,
        requiredEndpoints: stringArray(response.requiredEndpoints),
        requiredEvents: stringArray(response.requiredEvents),
        eventMappings: designEventMappings(response.eventMappings),
      }
    } catch {
      return {
        runtime: 'babel-o',
        runtimeVersion: null,
        contractVersion: this.expectedContractVersion,
        status: 'unavailable',
        requiredEndpoints: [],
        requiredEvents: [],
        eventMappings: {},
      }
    }
  }

  async createSession(input: CreateRuntimeSessionInput): Promise<RuntimeSessionRef> {
    const response = await this.requestJson<BabelORuntimeSessionResponse>('/v1/sessions', {
      method: 'POST',
      body: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: input.memoryNamespace,
      },
    })
    const runtimeSessionId = optionalString(response.runtimeSessionId) ?? optionalString(response.sessionId)
    if (!runtimeSessionId) {
      throw new RuntimeGatewayError('RUNTIME_BAD_RESPONSE', 'BabeL-O runtime did not return a runtime session id.')
    }
    return { runtimeSessionId }
  }

  async resumeSession(input: ResumeRuntimeSessionInput): Promise<RuntimeResumeResult> {
    if (!input.runtimeSessionId) {
      try {
        const created = await this.createSession({
          userId: input.userId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          workspaceRoot: input.workspaceRoot,
          memoryNamespace: input.memoryNamespace,
        })
        return {
          status: 'rebuilt',
          runtimeSessionId: created.runtimeSessionId,
          message: 'Runtime session was rebuilt because no previous runtime session id was available.',
        }
      } catch (error) {
        return unavailableResume(error)
      }
    }

    try {
      const response = await this.requestJson<BabelORuntimeResumeResponse>(`/v1/sessions/${encodeURIComponent(input.runtimeSessionId)}/resume`, {
        method: 'POST',
        body: {
          userId: input.userId,
          sessionId: input.sessionId,
          workspaceRoot: input.workspaceRoot,
          fallbackSummary: input.fallbackSummary,
        },
      })
      const status = resumeStatus(response.status)
      return {
        status,
        runtimeSessionId: optionalString(response.runtimeSessionId) ?? input.runtimeSessionId,
        message: optionalString(response.message),
      }
    } catch (error) {
      try {
        const created = await this.createSession({
          userId: input.userId,
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          workspaceRoot: input.workspaceRoot,
          memoryNamespace: input.memoryNamespace,
        })
        return {
          status: 'rebuilt',
          runtimeSessionId: created.runtimeSessionId,
          message: `Runtime session was rebuilt after resume failed: ${errorMessage(error)}`,
        }
      } catch (rebuildError) {
        return unavailableResume(rebuildError)
      }
    }
  }

  async spawnVariationAgent(input: SpawnVariationAgentsInput & { variationIndex: number }): Promise<BabelORuntimeAgentResponse> {
    return this.requestJson<BabelORuntimeAgentResponse>('/v1/agents', {
      method: 'POST',
      body: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        prompt: input.prompt,
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId ?? null,
        variationCount: input.variationCount,
        variationIndex: input.variationIndex,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: input.memoryNamespace,
        templateRequirements: input.templateRequirements ?? null,
      },
    })
  }

  async createRefineAgent(input: RefineVariationInput): Promise<BabelORuntimeAgentResponse> {
    return this.requestJson<BabelORuntimeAgentResponse>('/v1/agents/refine', {
      method: 'POST',
      body: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        variationId: input.variationId,
        runtimeChildSessionId: input.runtimeChildSessionId,
        baseArtifactId: input.baseArtifactId,
        baseArtifactHtml: input.baseArtifactHtml,
        baseArtifactEntryPath: input.baseArtifactEntryPath ?? null,
        baseArtifactVersion: input.baseArtifactVersion,
        prompt: input.prompt,
        annotationPromptSuffix: input.annotationPromptSuffix,
        workspaceRoot: input.workspaceRoot,
        deviceContext: input.deviceContext,
      },
    })
  }

  streamRuntimeEvents(request: BabelORuntimeStreamRequest): AsyncIterable<Record<string, unknown>> {
    const search = new URLSearchParams()
    if (request.streamId) search.set('streamId', request.streamId)
    if (request.runtimeSessionId) search.set('runtimeSessionId', request.runtimeSessionId)
    if (request.agentJobId) search.set('agentJobId', request.agentJobId)
    return this.streamJsonWithReconnect(`/v1/stream${search.size > 0 ? `?${search}` : ''}`)
  }

  async cancelRuntimeJob(input: CancelRuntimeJobInput): Promise<CancelRuntimeJobResult> {
    const response = await this.requestJson<BabelORuntimeCancelResponse>('/v1/agents/cancel', {
      method: 'POST',
      body: {
        jobId: input.jobId,
        reason: input.reason,
        variations: input.variations ?? [],
      },
    })
    return {
      cancelled: optionalBoolean(response.cancelled) ?? true,
      message: optionalString(response.message),
      cancelledVariationCount: optionalNumber(response.cancelledVariationCount),
      failedVariationCount: optionalNumber(response.failedVariationCount),
    }
  }

  private resolveStatus(contractVersion: string, runtimeStatus: unknown): RuntimeContractStatus {
    if (contractVersion !== this.expectedContractVersion) return 'contract_mismatch'
    const status = optionalString(runtimeStatus)
    if (status === 'degraded') return 'degraded'
    if (status === 'unavailable') return 'unavailable'
    if (status === 'contract_mismatch') return 'contract_mismatch'
    return 'compatible'
  }

  private async requestJson<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST'
      body?: Record<string, unknown>
    } = {},
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: this.headers(options.body !== undefined),
        ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new RuntimeGatewayError('RUNTIME_UNAVAILABLE', `BabeL-O runtime returned HTTP ${response.status}.`)
      }
      const payload = await response.json()
      if (!payload || typeof payload !== 'object') {
        throw new RuntimeGatewayError('RUNTIME_BAD_RESPONSE', 'BabeL-O runtime returned an invalid JSON payload.')
      }
      return payload as T
    } catch (error) {
      if (isAbortError(error)) {
        throw new RuntimeGatewayError('RUNTIME_REQUEST_TIMEOUT', `BabeL-O runtime request exceeded ${this.timeoutMs}ms.`, error)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private async *streamJsonWithReconnect(path: string): AsyncIterable<Record<string, unknown>> {
    let attempt = 0
    while (true) {
      let emitted = false
      try {
        for await (const event of this.streamJsonOnce(path)) {
          emitted = true
          yield event
        }
        return
      } catch (error) {
        if (emitted || attempt >= this.streamReconnectAttempts || !isRetryableStreamError(error)) throw error
        attempt += 1
      }
    }
  }

  private async *streamJsonOnce(path: string): AsyncIterable<Record<string, unknown>> {
    const controller = new AbortController()
    let connectTimeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'GET',
        headers: this.headers(),
        signal: controller.signal,
      })
      if (connectTimeout) clearTimeout(connectTimeout)
      connectTimeout = undefined
      if (!response.ok) {
        throw new RuntimeGatewayError('RUNTIME_UNAVAILABLE', `BabeL-O runtime returned HTTP ${response.status}.`)
      }
      if (!response.body) {
        throw new RuntimeGatewayError('RUNTIME_BAD_RESPONSE', 'BabeL-O runtime stream did not include a response body.')
      }
      const decoder = new TextDecoder()
      let buffer = ''
      const reader = response.body.getReader()
      while (true) {
        const result = await readWithIdleTimeout(reader, this.streamIdleTimeoutMs)
        if (result.done) break
        buffer += decoder.decode(result.value, { stream: true })
        const [complete, rest] = splitCompleteLines(buffer)
        buffer = rest
        for (const line of complete) {
          const parsed = parseStreamLine(line)
          if (parsed) yield parsed
        }
      }
      buffer += decoder.decode()
      for (const line of buffer.split(/\r?\n/)) {
        const parsed = parseStreamLine(line)
        if (parsed) yield parsed
      }
    } catch (error) {
      if (error instanceof RuntimeGatewayError) throw error
      if (isAbortError(error)) {
        throw new RuntimeGatewayError('RUNTIME_REQUEST_TIMEOUT', `BabeL-O runtime stream connect exceeded ${this.timeoutMs}ms.`, error)
      }
      throw error
    } finally {
      if (connectTimeout) clearTimeout(connectTimeout)
    }
  }

  private headers(hasBody = false): HeadersInit {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (hasBody) {
      headers['content-type'] = 'application/json'
    }
    if (this.config.apiKey) {
      headers[this.config.authHeaderName ?? 'authorization'] = this.config.authHeaderName
        ? this.config.apiKey
        : `Bearer ${this.config.apiKey}`
    }
    return headers
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : []
}

function designEventMappings(value: unknown): RuntimeContract['eventMappings'] {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, RuntimeContract['eventMappings'][string]] =>
      isDesignEventType(entry[1]),
    ),
  )
}

function isDesignEventType(value: unknown): value is RuntimeContract['eventMappings'][string] {
  return (
    value === 'design.session_started' ||
    value === 'design.job_started' ||
    value === 'design.variation_queued' ||
    value === 'design.variation_streaming' ||
    value === 'design.variation_artifact_updated' ||
    value === 'design.variation_preview_ready' ||
    value === 'design.variation_completed' ||
    value === 'design.variation_failed' ||
    value === 'design.permission_required' ||
    value === 'design.runtime_warning' ||
    value === 'design.job_completed'
  )
}

function statusMessage(status: RuntimeContractStatus): string {
  if (status === 'compatible') return 'BabeL-O runtime is compatible.'
  if (status === 'degraded') return 'BabeL-O runtime is degraded.'
  if (status === 'contract_mismatch') return 'BabeL-O runtime contract does not match DUDesign expectations.'
  return 'BabeL-O runtime is unavailable.'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function isRetryableStreamError(error: unknown): boolean {
  return error instanceof RuntimeGatewayError
    && (error.code === 'RUNTIME_UNAVAILABLE' || error.code === 'RUNTIME_REQUEST_TIMEOUT' || error.code === 'RUNTIME_STREAM_IDLE_TIMEOUT')
}

function resumeStatus(value: unknown): RuntimeResumeResult['status'] {
  if (value === 'rebuilt') return 'rebuilt'
  if (value === 'unavailable') return 'unavailable'
  return 'resumed'
}

function unavailableResume(error: unknown): RuntimeResumeResult {
  return {
    status: 'unavailable',
    runtimeSessionId: null,
    message: errorMessage(error),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Runtime resume failed.'
}

function splitCompleteLines(buffer: string): [string[], string] {
  const lines = buffer.split(/\r?\n/)
  return [lines.slice(0, -1), lines.at(-1) ?? '']
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new RuntimeGatewayError(
            'RUNTIME_STREAM_IDLE_TIMEOUT',
            `BabeL-O runtime stream was idle for more than ${idleTimeoutMs}ms.`,
          ))
          void reader.cancel().catch(() => undefined)
        }, idleTimeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function parseStreamLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  if (/^[a-zA-Z-]+:/.test(trimmed) && !trimmed.startsWith('data:')) return null
  const payload = trimmed.startsWith('data:') ? trimmed.slice('data:'.length).trim() : trimmed
  if (!payload || payload === '[DONE]') return null
  const parsed = JSON.parse(payload)
  return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
}
