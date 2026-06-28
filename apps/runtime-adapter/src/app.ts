import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { URL } from 'node:url'
import { DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import { NexusClient, type NexusAgentJob } from './nexusClient.js'
import { NoopRuntimeAdapterStateStore, type RuntimeAdapterStateSnapshot, type RuntimeAdapterStateStore } from './stateStore.js'

export type RuntimeAdapterOptions = {
  nexus: NexusClient
  runtimeVersion?: string
  stateStore?: RuntimeAdapterStateStore
}

type RuntimeStream = {
  streamId: string
  runtimeSessionId: string
  agentJobId: string
  variationId?: string
  workspaceRoot: string
  waitStarted: boolean
}

const REQUIRED_ENDPOINTS = [
  'GET /v1/health',
  'GET /v1/contract',
  'POST /v1/sessions',
  'POST /v1/sessions/:sessionId/resume',
  'POST /v1/agents',
  'POST /v1/agents/refine',
  'POST /v1/agents/cancel',
  'GET /v1/stream',
]

const REQUIRED_EVENTS = [
  'session_started',
  'assistant_delta',
  'workspace_dirty',
  'workspace_dirty_detected',
  'result',
  'error',
]

const EVENT_MAPPINGS = {
  session_started: 'design.session_started',
  assistant_delta: 'design.variation_streaming',
  thinking_delta: 'design.variation_streaming',
  workspace_dirty: 'design.variation_artifact_updated',
  workspace_dirty_detected: 'design.variation_artifact_updated',
  result: 'design.variation_completed',
  error: 'design.variation_failed',
}

export function createRuntimeAdapterServer(options: RuntimeAdapterOptions): http.Server {
  const app = new RuntimeAdapterApp(options)
  return http.createServer((req, res) => {
    void app.handle(req, res).catch(error => sendJson(res, 500, {
      type: 'error',
      code: 'ADAPTER_ERROR',
      message: error instanceof Error ? error.message : 'Runtime adapter failed.',
    }))
  })
}

class RuntimeAdapterApp {
  private readonly streams = new Map<string, RuntimeStream>()
  private readonly sessions = new Map<string, string>()
  private readonly stateStore: RuntimeAdapterStateStore
  private readonly ready: Promise<void>
  private sequence = 1

  constructor(private readonly options: RuntimeAdapterOptions) {
    this.stateStore = options.stateStore ?? new NoopRuntimeAdapterStateStore()
    this.ready = this.restoreState()
  }

  async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    await this.ready
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
    const method = req.method ?? 'GET'

    if (method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/health')) {
      await this.handleHealth(res)
      return
    }
    if (method === 'GET' && url.pathname === '/v1/contract') {
      await this.handleContract(res)
      return
    }
    if (method === 'POST' && url.pathname === '/v1/sessions') {
      await this.handleCreateSession(req, res)
      return
    }
    const resumeMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/resume$/)
    if (method === 'POST' && resumeMatch) {
      await this.handleResumeSession(res, decodeURIComponent(resumeMatch[1]!))
      return
    }
    if (method === 'POST' && url.pathname === '/v1/agents') {
      await this.handleSpawnAgent(req, res, 'spawn')
      return
    }
    if (method === 'POST' && url.pathname === '/v1/agents/refine') {
      await this.handleSpawnAgent(req, res, 'refine')
      return
    }
    if (method === 'POST' && url.pathname === '/v1/agents/cancel') {
      await this.handleCancelAgents(req, res)
      return
    }
    if (method === 'GET' && url.pathname === '/v1/stream') {
      await this.handleStream(url, res)
      return
    }

    sendJson(res, 404, {
      type: 'error',
      code: 'NOT_FOUND',
      message: `Route ${method}:${url.pathname} not found.`,
    })
  }

  private async handleHealth(res: http.ServerResponse): Promise<void> {
    const health = await this.options.nexus.health().catch(error => ({
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'BabeL-O Nexus unavailable.',
    }))
    const version = await this.options.nexus.version().catch(() => null)
    sendJson(res, 200, {
      runtime: 'babel-o',
      runtimeVersion: runtimeVersionFrom(version) ?? this.options.runtimeVersion ?? stringField(health, 'version') ?? null,
      contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
      status: stringField(health, 'status') === 'ok' ? 'compatible' : 'unavailable',
      message: stringField(health, 'message') ?? 'DUDesign BabeL-O runtime adapter.',
    })
  }

  private async handleContract(res: http.ServerResponse): Promise<void> {
    const version = await this.options.nexus.version().catch(() => null)
    sendJson(res, 200, contractPayload(runtimeVersionFrom(version) ?? this.options.runtimeVersion))
  }

  private async handleCreateSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req)
    const sessionId = requiredString(body.sessionId, 'sessionId')
    const created = await this.options.nexus.createSession({
      userId: requiredString(body.userId, 'userId'),
      workspaceId: requiredString(body.workspaceId, 'workspaceId'),
      sessionId,
      workspaceRoot: requiredString(body.workspaceRoot, 'workspaceRoot'),
      memoryNamespace: requiredString(body.memoryNamespace, 'memoryNamespace'),
    })
    const runtimeSessionId = requiredString(created.sessionId, 'sessionId')
    this.sessions.set(sessionId, runtimeSessionId)
    await this.persistState()
    sendJson(res, 200, {
      runtimeSessionId,
      sessionId: runtimeSessionId,
    })
  }

  private async handleResumeSession(res: http.ServerResponse, runtimeSessionId: string): Promise<void> {
    const resumed = await this.options.nexus.resumeSession(runtimeSessionId)
    const resolvedRuntimeSessionId = stringField(resumed, 'sessionId') ?? runtimeSessionId
    this.sessions.set(runtimeSessionId, resolvedRuntimeSessionId)
    await this.persistState()
    sendJson(res, 200, {
      status: 'resumed',
      runtimeSessionId: resolvedRuntimeSessionId,
      message: 'BabeL-O Nexus session resumed through DUDesign adapter.',
    })
  }

  private async handleSpawnAgent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    mode: 'spawn' | 'refine',
  ): Promise<void> {
    const body = await readJson(req)
    const runtimeSessionId = this.resolveRuntimeSessionId(body)
    const prompt = mode === 'refine'
      ? buildRefinePrompt(body)
      : buildVariationPrompt(body)
    const modelContext = modelContextFromBody(body)
    const spawned = await this.options.nexus.spawnAgent({
      parentSessionId: runtimeSessionId,
      prompt,
      modelId: modelContext.modelId,
      modelProvider: modelContext.modelProvider,
      metadata: {
        mode,
        jobId: stringField(body, 'jobId'),
        variationId: stringField(body, 'variationId'),
        variationIndex: numberField(body, 'variationIndex'),
        modelServiceId: modelContext.modelServiceId,
        modelId: modelContext.modelId,
        modelProvider: modelContext.modelProvider,
        source: 'dudesign-runtime-adapter',
      },
    })
    const job = requireAgentJob(spawned.job)
    const streamId = this.nextId('stream')
    this.streams.set(streamId, {
      streamId,
      runtimeSessionId: job.childSessionId,
      agentJobId: job.jobId,
      variationId: stringField(body, 'variationId'),
      workspaceRoot: requiredString(body.workspaceRoot, 'workspaceRoot'),
      waitStarted: false,
    })
    await this.persistState()
    sendJson(res, 200, {
      streamId,
      agentJobId: job.jobId,
      runtimeChildSessionId: job.childSessionId,
    })
  }

  private async handleCancelAgents(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req)
    const variations = Array.isArray(body.variations) ? body.variations : []
    let cancelledVariationCount = 0
    let failedVariationCount = 0
    for (const variation of variations) {
      const runtimeAgentJobId = stringField(variation, 'runtimeAgentJobId')
      if (!runtimeAgentJobId) continue
      try {
        await this.options.nexus.cancelAgent(runtimeAgentJobId, stringField(body, 'reason'))
        cancelledVariationCount += 1
      } catch {
        failedVariationCount += 1
      }
    }
    sendJson(res, 200, {
      cancelled: failedVariationCount === 0,
      cancelledVariationCount,
      failedVariationCount,
    })
  }

  private async handleStream(url: URL, res: http.ServerResponse): Promise<void> {
    const streamId = url.searchParams.get('streamId')
    const stream = streamId ? this.streams.get(streamId) : undefined
    if (!stream) {
      sendJson(res, 404, {
        type: 'error',
        code: 'STREAM_NOT_FOUND',
        message: `Runtime stream not found: ${streamId ?? ''}`,
      })
      return
    }
    if (stream.waitStarted) {
      sendJson(res, 409, {
        type: 'error',
        code: 'STREAM_ALREADY_CONSUMED',
        message: `Runtime stream already consumed: ${stream.streamId}`,
      })
      return
    }
    stream.waitStarted = true
    res.writeHead(200, {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    try {
      writeNdjson(res, { type: 'assistant_delta', delta: 'BabeL-O child session started.' })
      const waited = await this.options.nexus.waitForAgent(stream.agentJobId)
      const job = requireAgentJob(waited.job)
      const transcript = await this.options.nexus.getAgentTranscript(stream.agentJobId).catch(() => ({ events: [] }))
      for (const event of transcript.events ?? []) {
        const mapped = normalizeTranscriptEvent(event)
        if (mapped) writeNdjson(res, mapped)
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        writeNdjson(res, {
          type: 'error',
          code: `AGENT_${job.status.toUpperCase()}`,
          message: `BabeL-O agent ${job.status}.`,
        })
        return
      }
      const artifact = await readWorkspaceArtifact(stream.workspaceRoot)
      writeNdjson(res, {
        type: 'result',
        artifactId: `babel_o_${stream.agentJobId}`,
        entryPath: artifact.entryPath,
        html: artifact.html,
      })
    } catch (error) {
      writeNdjson(res, {
        type: 'error',
        code: 'ADAPTER_STREAM_FAILED',
        message: error instanceof Error ? error.message : 'Runtime stream failed.',
      })
    } finally {
      this.streams.delete(stream.streamId)
      await this.persistState()
      res.end()
    }
  }

  private nextId(prefix: string): string {
    const id = `${prefix}_${this.sequence}`
    this.sequence += 1
    return id
  }

  private resolveRuntimeSessionId(body: Record<string, unknown>): string {
    const directRuntimeSessionId = stringField(body, 'runtimeSessionId') ?? stringField(body, 'runtimeChildSessionId')
    if (directRuntimeSessionId) return directRuntimeSessionId
    const sessionId = requiredString(body.sessionId, 'sessionId')
    return this.sessions.get(sessionId) ?? sessionId
  }

  private async restoreState(): Promise<void> {
    const snapshot = await this.stateStore.load()
    for (const [sessionId, runtimeSessionId] of Object.entries(snapshot.sessions)) {
      this.sessions.set(sessionId, runtimeSessionId)
    }
    for (const stream of Object.values(snapshot.streams)) {
      this.streams.set(stream.streamId, {
        ...stream,
        waitStarted: false,
      })
    }
    this.sequence = Math.max(snapshot.sequence, nextSequenceFromStreams(this.streams))
  }

  private async persistState(): Promise<void> {
    await this.stateStore.save({
      version: 1,
      sessions: Object.fromEntries(this.sessions),
      streams: Object.fromEntries(
        Array.from(this.streams.entries()).map(([streamId, stream]) => [
          streamId,
          {
            streamId: stream.streamId,
            runtimeSessionId: stream.runtimeSessionId,
            agentJobId: stream.agentJobId,
            ...(stream.variationId && { variationId: stream.variationId }),
            workspaceRoot: stream.workspaceRoot,
          },
        ]),
      ),
      sequence: this.sequence,
      updatedAt: new Date().toISOString(),
    } satisfies RuntimeAdapterStateSnapshot)
  }
}

function nextSequenceFromStreams(streams: Map<string, RuntimeStream>): number {
  let sequence = 1
  for (const streamId of streams.keys()) {
    const match = streamId.match(/^stream_(\d+)$/)
    if (!match) continue
    sequence = Math.max(sequence, Number(match[1]) + 1)
  }
  return sequence
}

function contractPayload(runtimeVersion?: string): Record<string, unknown> {
  return {
    runtime: 'babel-o',
    runtimeVersion: runtimeVersion ?? null,
    contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
    status: 'compatible',
    requiredEndpoints: REQUIRED_ENDPOINTS,
    requiredEvents: REQUIRED_EVENTS,
    eventMappings: EVENT_MAPPINGS,
  }
}

function buildVariationPrompt(body: Record<string, unknown>): string {
  const variationIndex = numberField(body, 'variationIndex') ?? 1
  const variationCount = numberField(body, 'variationCount') ?? 1
  const templateRequirements = JSON.stringify(body.templateRequirements ?? {}, null, 2)
  const modelSelection = formatModelSelection(body)
  return [
    'You are generating a DUDesign HTML design variation.',
    `Variation ${variationIndex} of ${variationCount}.`,
    'Return a complete static HTML page. Write the final page to index.html in the current workspace.',
    modelSelection,
    '',
    `User prompt:\n${requiredString(body.prompt, 'prompt')}`,
    '',
    `Template requirements:\n${templateRequirements}`,
  ].join('\n')
}

function buildRefinePrompt(body: Record<string, unknown>): string {
  return [
    'You are refining an existing DUDesign HTML artifact.',
    'Use the provided current HTML as the base. Write the refined complete page to index.html in the current workspace.',
    formatModelSelection(body),
    '',
    `Current HTML:\n${stringField(body, 'baseArtifactHtml') ?? ''}`,
    '',
    `Refine request:\n${requiredString(body.prompt, 'prompt')}`,
    '',
    `Annotation feedback:\n${stringField(body, 'annotationPromptSuffix') ?? ''}`,
  ].join('\n')
}

function modelContextFromBody(body: Record<string, unknown>): {
  modelServiceId?: string
  modelId?: string
  modelProvider?: string
} {
  const modelServiceId = stringField(body, 'modelServiceId')
  const modelId = stringField(body, 'modelId')
  const modelProvider = stringField(body, 'modelProvider')
  return {
    ...(modelServiceId && { modelServiceId }),
    ...(modelId && { modelId }),
    ...(modelProvider && { modelProvider }),
  }
}

function formatModelSelection(body: Record<string, unknown>): string {
  const context = modelContextFromBody(body)
  const parts = [
    context.modelServiceId && `service=${context.modelServiceId}`,
    context.modelProvider && `provider=${context.modelProvider}`,
    context.modelId && `model=${context.modelId}`,
  ].filter(Boolean)
  return parts.length > 0
    ? `Model selection: ${parts.join(', ')}. Use this selected model configuration when the runtime supports per-request model routing.`
    : 'Model selection: use the runtime default model.'
}

function normalizeTranscriptEvent(event: Record<string, unknown>): Record<string, unknown> | null {
  const type = stringField(event, 'type')
  if (type === 'assistant_delta' || type === 'thinking_delta') {
    return {
      type,
      delta: stringField(event, 'delta') ?? stringField(event, 'text') ?? '',
    }
  }
  if (type === 'error') {
    return {
      type: 'error',
      code: stringField(event, 'code') ?? 'BABEL_O_ERROR',
      message: stringField(event, 'message') ?? 'BabeL-O agent failed.',
    }
  }
  return null
}

async function readWorkspaceArtifact(workspaceRoot: string): Promise<{ entryPath: string; html: string }> {
  const root = resolve(workspaceRoot)
  const candidates = ['index.html', 'dist/index.html', 'public/index.html']
  for (const entryPath of candidates) {
    const fullPath = resolve(root, entryPath)
    if (!fullPath.startsWith(root)) continue
    try {
      return {
        entryPath,
        html: await readFile(fullPath, 'utf8'),
      }
    } catch {
      // Try the next conventional artifact path.
    }
  }
  return {
    entryPath: 'index.html',
    html: '<!doctype html><html><body><h1>BabeL-O completed without writing index.html</h1></body></html>',
  }
}

function runtimeVersionFrom(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  return stringField(payload, 'serverVersion') ?? stringField(payload, 'version') ?? null
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk)
  }
  if (chunks.length === 0) return {}
  const body = new TextDecoder().decode(Buffer.concat(chunks))
  const parsed = JSON.parse(body)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected a JSON object request body.')
  }
  return parsed as Record<string, unknown>
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload, null, 2))
}

function writeNdjson(res: http.ServerResponse, payload: unknown): void {
  res.write(`${JSON.stringify(payload)}\n`)
}

function requireAgentJob(value: unknown): NexusAgentJob {
  if (!value || typeof value !== 'object') throw new Error('BabeL-O Nexus response did not include an agent job.')
  const job = value as Partial<NexusAgentJob>
  if (!job.jobId || !job.childSessionId || !job.parentSessionId || !job.status || !job.prompt) {
    throw new Error('BabeL-O Nexus response included an invalid agent job.')
  }
  return job as NexusAgentJob
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} is required.`)
  return value
}

function stringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const fieldValue = (value as Record<string, unknown>)[field]
  return typeof fieldValue === 'string' && fieldValue.length > 0 ? fieldValue : undefined
}

function numberField(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== 'object') return undefined
  const fieldValue = (value as Record<string, unknown>)[field]
  return typeof fieldValue === 'number' && Number.isFinite(fieldValue) ? fieldValue : undefined
}
