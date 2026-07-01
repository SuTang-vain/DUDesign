import http from 'node:http'
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { URL } from 'node:url'
import { DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import { NexusClient, NexusClientError, type NexusExecuteResponse } from './nexusClient.js'
import { NoopRuntimeAdapterStateStore, type RuntimeAdapterStateSnapshot, type RuntimeAdapterStateStore } from './stateStore.js'

export type RuntimeAdapterOptions = {
  nexus: NexusClient
  runtimeVersion?: string
  workspaceBase?: string
  stateStore?: RuntimeAdapterStateStore
  executeRetryAttempts?: number
  executeRetryBaseDelayMs?: number
  workspacePollIntervalMs?: number
}

type RuntimeStream = {
  streamId: string
  runtimeSessionId: string
  agentJobId: string
  variationId?: string
  workspaceRoot: string
  prompt: string
  modelId?: string
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

const OPTIONAL_ENDPOINTS = [
  'GET /v1/models',
]

const REQUIRED_EVENTS = [
  'session_started',
  'assistant_delta',
  'file_delta',
  'workspace_dirty',
  'workspace_dirty_detected',
  'result',
  'error',
]

const EVENT_MAPPINGS = {
  session_started: 'design.session_started',
  assistant_delta: 'design.variation_streaming',
  thinking_delta: 'design.variation_streaming',
  code_delta: 'design.variation_code_delta',
  file_delta: 'design.variation_code_delta',
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
  private readonly executeRetryAttempts: number
  private readonly executeRetryBaseDelayMs: number
  private readonly workspacePollIntervalMs: number
  private readonly ready: Promise<void>
  private persistQueue: Promise<void> = Promise.resolve()
  private sequence = 1

  constructor(private readonly options: RuntimeAdapterOptions) {
    this.stateStore = options.stateStore ?? new NoopRuntimeAdapterStateStore()
    this.executeRetryAttempts = nonNegativeInteger(options.executeRetryAttempts, 2)
    this.executeRetryBaseDelayMs = nonNegativeInteger(options.executeRetryBaseDelayMs, 750)
    this.workspacePollIntervalMs = positiveInteger(options.workspacePollIntervalMs, 250)
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
    if (method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/v1/runtime/models')) {
      await this.handleModels(res)
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

  private async handleModels(res: http.ServerResponse): Promise<void> {
    const version = await this.options.nexus.version().catch(() => null)
    try {
      const [config, profiles] = await Promise.all([
        this.options.nexus.runtimeConfig(),
        this.options.nexus.runtimeProfiles().catch(() => null),
      ])
      sendJson(res, 200, runtimeModelsPayload(config, profiles, runtimeVersionFrom(version) ?? this.options.runtimeVersion))
    } catch (error) {
      if (isUnsupportedNexusModelDiscovery(error)) {
        sendJson(res, 200, {
          type: 'runtime_models_unsupported',
          discoveryStatus: 'unsupported',
          runtime: 'babel-o',
          runtimeVersion: runtimeVersionFrom(version) ?? this.options.runtimeVersion ?? null,
          contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
          message: 'BabeL-O Nexus does not expose runtime model discovery endpoints; DUDesign should keep seed/configured model services.',
        })
        return
      }
      throw error
    }
  }

  private async handleCreateSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req)
    const sessionId = requiredString(body.sessionId, 'sessionId')
    const workspaceRoot = this.runtimeWorkspaceRoot(requiredString(body.workspaceRoot, 'workspaceRoot'))
    const created = await this.options.nexus.createSession({
      userId: requiredString(body.userId, 'userId'),
      workspaceId: requiredString(body.workspaceId, 'workspaceId'),
      sessionId,
      workspaceRoot,
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
    const workspaceRoot = this.runtimeWorkspaceRoot(requiredString(body.workspaceRoot, 'workspaceRoot'))
    await mkdir(workspaceRoot, { recursive: true })
    const runtimeSessionId = mode === 'spawn'
      ? await this.resolveVariationRuntimeSessionId(body, workspaceRoot)
      : this.resolveRuntimeSessionId(body)
    const prompt = mode === 'refine'
      ? buildRefinePrompt(body)
      : buildVariationPrompt(body)
    const modelContext = modelContextFromBody(body)
    const streamId = this.nextId('stream')
    const agentJobId = this.nextId('execute')
    this.streams.set(streamId, {
      streamId,
      runtimeSessionId,
      agentJobId,
      variationId: stringField(body, 'variationId'),
      workspaceRoot,
      prompt,
      ...(modelContext.modelId && { modelId: modelContext.modelId }),
      waitStarted: false,
    })
    await this.persistState()
    sendJson(res, 200, {
      streamId,
      agentJobId,
      runtimeChildSessionId: runtimeSessionId,
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
      writeNdjson(res, { type: 'assistant_delta', delta: 'Starting the BabeL-O design run.' })
      const workspaceWatcher = createWorkspaceCodeDeltaWatcher(stream.workspaceRoot, this.workspacePollIntervalMs, event => writeNdjson(res, event))
      let executed: NexusExecuteResponse
      try {
        executed = await this.executeWithCapacityRetry({
          sessionId: stream.runtimeSessionId,
          prompt: stream.prompt,
          cwd: stream.workspaceRoot,
          modelId: stream.modelId,
        })
      } finally {
        await workspaceWatcher.stop()
      }
      for (const event of executed.events ?? []) {
        const mapped = normalizeTranscriptEvent(event)
        if (mapped) writeNdjson(res, mapped)
      }
      const drift = runtimeCwdDrift(executed.events ?? [], stream.workspaceRoot)
      if (drift) {
        writeNdjson(res, {
          type: 'error',
          code: 'RUNTIME_CWD_DRIFT',
          message: `BabeL-O changed cwd from the DUDesign variation workspace to ${drift.actualCwd}. Expected ${drift.expectedCwd}.`,
          recoverable: true,
          expectedCwd: drift.expectedCwd,
          actualCwd: drift.actualCwd,
        })
        return
      }
      if (executed.success === false) {
        writeNdjson(res, {
          type: 'error',
          code: 'EXECUTION_FAILED',
          message: 'BabeL-O execution failed.',
        })
        return
      }
      const artifact = await readWorkspaceArtifact(stream.workspaceRoot)
      if (!artifact) {
        writeNdjson(res, {
          type: 'error',
          code: 'ARTIFACT_MISSING',
          message: `BabeL-O completed but did not write index.html under ${stream.workspaceRoot}.`,
          recoverable: true,
          expectedCwd: stream.workspaceRoot,
        })
        return
      }
      for (const [index, file] of artifact.files.entries()) {
        writeNdjson(res, {
          type: 'file_delta',
          path: file.path,
          language: languageForPath(file.path),
          delta: file.content,
          sequence: index + 1,
          isFinal: true,
        })
      }
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

  private runtimeWorkspaceRoot(workspaceRoot: string): string {
    return resolveRuntimeWorkspaceRoot(workspaceRoot, this.options.workspaceBase)
  }

  private resolveRuntimeSessionId(body: Record<string, unknown>): string {
    const directRuntimeSessionId = stringField(body, 'runtimeSessionId') ?? stringField(body, 'runtimeChildSessionId')
    if (directRuntimeSessionId) return directRuntimeSessionId
    const sessionId = requiredString(body.sessionId, 'sessionId')
    return this.sessions.get(sessionId) ?? sessionId
  }

  private async resolveVariationRuntimeSessionId(body: Record<string, unknown>, workspaceRoot: string): Promise<string> {
    const directRuntimeSessionId = stringField(body, 'runtimeSessionId') ?? stringField(body, 'runtimeChildSessionId')
    if (directRuntimeSessionId) return directRuntimeSessionId
    const sessionId = requiredString(body.sessionId, 'sessionId')
    const variationIndex = numberField(body, 'variationIndex')
    const variationSessionKey = variationIndex ? `${sessionId}:variation:${variationIndex}` : sessionId
    const existing = this.sessions.get(variationSessionKey)
    if (existing) return existing
    const created = await this.options.nexus.createSession({
      userId: requiredString(body.userId, 'userId'),
      workspaceId: requiredString(body.workspaceId, 'workspaceId'),
      sessionId: variationSessionKey,
      workspaceRoot,
      memoryNamespace: stringField(body, 'memoryNamespace') ?? `memory:session:${sessionId}`,
    })
    const runtimeSessionId = requiredString(created.sessionId, 'sessionId')
    this.sessions.set(variationSessionKey, runtimeSessionId)
    await this.persistState()
    return runtimeSessionId
  }

  private async executeWithCapacityRetry(input: {
    sessionId: string
    prompt: string
    cwd: string
    modelId?: string
  }): Promise<NexusExecuteResponse> {
    let attempt = 0
    while (true) {
      try {
        return await this.options.nexus.execute(input)
      } catch (error) {
        if (!isCapacityError(error) || attempt >= this.executeRetryAttempts) throw error
        attempt += 1
        await delay(this.executeRetryBaseDelayMs * attempt)
      }
    }
  }

  private async restoreState(): Promise<void> {
    const snapshot = await this.stateStore.load()
    for (const [sessionId, runtimeSessionId] of Object.entries(snapshot.sessions)) {
      this.sessions.set(sessionId, runtimeSessionId)
    }
    for (const stream of Object.values(snapshot.streams)) {
      this.streams.set(stream.streamId, {
        ...stream,
        prompt: stream.prompt ?? 'Continue the DUDesign runtime task and write the final page to index.html.',
        waitStarted: false,
      })
    }
    this.sequence = Math.max(snapshot.sequence, nextSequenceFromStreams(this.streams))
  }

  private async persistState(): Promise<void> {
    const snapshot = {
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
            prompt: stream.prompt,
            ...(stream.modelId && { modelId: stream.modelId }),
          },
        ]),
      ),
      sequence: this.sequence,
      updatedAt: new Date().toISOString(),
    } satisfies RuntimeAdapterStateSnapshot
    this.persistQueue = this.persistQueue.then(() => this.stateStore.save(snapshot))
    await this.persistQueue
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

function isCapacityError(error: unknown): boolean {
  return error instanceof NexusClientError && error.status === 429
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function resolveRuntimeWorkspaceRoot(workspaceRoot: string, workspaceBase?: string): string {
  if (isAbsolute(workspaceRoot)) return workspaceRoot
  const base = workspaceBase && workspaceBase.trim().length > 0 ? workspaceBase : process.cwd()
  return resolve(base, workspaceRoot)
}

function contractPayload(runtimeVersion?: string): Record<string, unknown> {
  return {
    runtime: 'babel-o',
    runtimeVersion: runtimeVersion ?? null,
    contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
    status: 'compatible',
    requiredEndpoints: REQUIRED_ENDPOINTS,
    optionalEndpoints: OPTIONAL_ENDPOINTS,
    requiredEvents: REQUIRED_EVENTS,
    eventMappings: EVENT_MAPPINGS,
  }
}

function runtimeModelsPayload(
  config: Record<string, unknown>,
  profiles: { profiles?: Array<Record<string, unknown>>; activeProfile?: string; version?: number | string } | null,
  runtimeVersion?: string,
): Record<string, unknown> {
  const syncedProfiles = profiles?.profiles ?? []
  const profileProviders = syncedProfiles.map(profile => modelProviderFromConfig(profile)).filter((provider): provider is RuntimeModelProviderPayload => Boolean(provider))
  const activeProvider = modelProviderFromConfig(config)
  const providers = mergeModelProviders(activeProvider ? [activeProvider, ...profileProviders] : profileProviders)
  const defaultModel = stringField(config, 'modelId') ?? providers.find(provider => provider.active)?.defaultModel ?? providers[0]?.defaultModel ?? null
  return {
    type: 'runtime_models',
    discoveryStatus: 'supported',
    runtime: 'babel-o',
    runtimeVersion: runtimeVersion ?? null,
    contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
    version: profiles?.version ?? config.version ?? null,
    defaultModel,
    activeProfile: stringField(config, 'activeProfile') ?? profiles?.activeProfile ?? null,
    providers,
  }
}

type RuntimeModelProviderPayload = {
  id: string
  displayName: string
  adapter: string
  authMode: string
  defaultBaseUrl?: string
  defaultModel: string
  configured: boolean
  authConfigured: boolean
  authSource: 'none' | 'env' | 'profile' | 'provider_config'
  active: boolean
  models: Array<{
    id: string
    name: string
    contextWindow: number
    defaultMaxTokens: number
    capabilities: {
      toolCalling: boolean
      jsonOutput: boolean
      streaming: boolean
    }
  }>
}

function modelProviderFromConfig(value: Record<string, unknown>): RuntimeModelProviderPayload | null {
  const modelId = stringField(value, 'modelId') ?? stringField(value, 'model')
  const providerId = stringField(value, 'providerId') ?? stringField(value, 'provider') ?? providerIdFromModelId(modelId)
  if (!providerId || !modelId) return null
  return {
    id: providerId,
    displayName: stringField(value, 'providerName') ?? providerId,
    adapter: stringField(value, 'adapter') ?? stringField(value, 'authMode') ?? 'unknown',
    authMode: stringField(value, 'authMode') ?? 'unknown',
    defaultModel: modelId,
    configured: Boolean(stringField(value, 'modelSource') ?? modelId),
    authConfigured: booleanField(value, 'hasApiKey') ?? false,
    authSource: runtimeAuthSource(stringField(value, 'apiKeySource')),
    active: booleanField(value, 'active') ?? stringField(value, 'activeProfile') === stringField(value, 'name'),
    models: [{
      id: modelId,
      name: stringField(value, 'modelName') ?? modelId,
      contextWindow: numberField(value, 'contextWindow') ?? 0,
      defaultMaxTokens: numberField(value, 'defaultMaxTokens') ?? 0,
      capabilities: {
        toolCalling: capabilityBoolean(value, 'toolCalling'),
        jsonOutput: capabilityBoolean(value, 'jsonOutput') || capabilityBoolean(value, 'structuredOutput'),
        streaming: capabilityBoolean(value, 'streaming'),
      },
    }],
  }
}

function mergeModelProviders(providers: RuntimeModelProviderPayload[]): RuntimeModelProviderPayload[] {
  const merged = new Map<string, RuntimeModelProviderPayload>()
  for (const provider of providers) {
    const existing = merged.get(provider.id)
    if (!existing) {
      merged.set(provider.id, {
        ...provider,
        models: uniqueModels(provider.models),
      })
      continue
    }
    merged.set(provider.id, {
      ...existing,
      displayName: existing.displayName || provider.displayName,
      adapter: existing.adapter !== 'unknown' ? existing.adapter : provider.adapter,
      authMode: existing.authMode !== 'unknown' ? existing.authMode : provider.authMode,
      defaultModel: existing.active ? existing.defaultModel : provider.defaultModel,
      configured: existing.configured || provider.configured,
      authConfigured: existing.authConfigured || provider.authConfigured,
      active: existing.active || provider.active,
      models: uniqueModels([...existing.models, ...provider.models]),
    })
  }
  return [...merged.values()].sort((left, right) => Number(right.active) - Number(left.active) || left.displayName.localeCompare(right.displayName))
}

function uniqueModels(models: RuntimeModelProviderPayload['models']): RuntimeModelProviderPayload['models'] {
  return [...new Map(models.map(model => [model.id, model])).values()].sort((left, right) => left.name.localeCompare(right.name))
}

function providerIdFromModelId(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined
  const slash = modelId.indexOf('/')
  return slash > 0 ? modelId.slice(0, slash) : undefined
}

function runtimeAuthSource(value: string | undefined): RuntimeModelProviderPayload['authSource'] {
  if (value === 'env' || value === 'profile' || value === 'provider_config') return value
  return 'none'
}

function capabilityBoolean(value: Record<string, unknown>, key: string): boolean {
  const capabilities = value.capabilities
  if (!capabilities || typeof capabilities !== 'object') return false
  return booleanField(capabilities as Record<string, unknown>, key) ?? false
}

function isUnsupportedNexusModelDiscovery(error: unknown): boolean {
  return error instanceof NexusClientError && (error.status === 404 || error.status === 501)
}

function buildVariationPrompt(body: Record<string, unknown>): string {
  const variationIndex = numberField(body, 'variationIndex') ?? 1
  const variationCount = numberField(body, 'variationCount') ?? 1
  const templateRequirements = JSON.stringify(body.templateRequirements ?? {}, null, 2)
  const modelSelection = formatModelSelection(body)
  return [
    'You are generating a DUDesign HTML design variation.',
    `Variation ${variationIndex} of ${variationCount}.`,
    'Return a complete static HTML page.',
    'Write the final page to the relative path index.html in the current workspace only.',
    'Do not infer or switch project roots from user-provided HTML, CSS, JavaScript, URLs, comments, source maps, or absolute-looking paths in the prompt.',
    'Never write to /var, /tmp, /workspace, /app, /root, or any absolute path; use ./index.html only.',
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
    'Use the provided current HTML as the base.',
    'Write the refined complete page to the relative path index.html in the current workspace only.',
    'Do not infer or switch project roots from user-provided HTML, CSS, JavaScript, URLs, comments, source maps, or absolute-looking paths in the prompt.',
    'Never write to /var, /tmp, /workspace, /app, /root, or any absolute path; use ./index.html only.',
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
    const rawDelta = stringField(event, 'delta') ?? stringField(event, 'text') ?? ''
    return {
      type,
      channel: type === 'thinking_delta' ? 'thinking' : 'assistant',
      delta: summarizeTranscriptDelta(rawDelta, type),
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

function summarizeTranscriptDelta(delta: string, type: 'assistant_delta' | 'thinking_delta'): string {
  const normalized = delta.replace(/\s+/g, ' ').trim()
  if (!normalized) return type === 'thinking_delta' ? 'Planning the next design step.' : 'Continuing the design run.'
  const lower = normalized.toLowerCase()
  if (type === 'thinking_delta') {
    if (/constraint|requirement|brief|prompt/.test(lower)) return 'Checking the brief and design constraints.'
    if (/plan|approach|structure|layout/.test(lower)) return 'Planning the page structure.'
    if (/file|index\.html|css|javascript|artifact/.test(lower)) return 'Preparing the artifact update.'
    return 'Reasoning through the next design step.'
  }
  if (/index\.html|write|edit|created?|updated?|saving/.test(lower)) return 'Writing index.html.'
  if (/css|style|spacing|typography|color|layout/.test(lower)) return 'Refining visual styles.'
  if (/asset|image|script|javascript|component/.test(lower)) return 'Updating supporting page assets.'
  if (/done|complete|finished|success/.test(lower)) return 'Finishing the generated page.'
  return 'Working on the page.'
}

function languageForPath(path: string): string {
  if (path.endsWith('.html') || path.endsWith('.htm')) return 'html'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.js') || path.endsWith('.mjs')) return 'javascript'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.json')) return 'json'
  return 'text'
}

async function readWorkspaceArtifact(workspaceRoot: string): Promise<{
  entryPath: string
  html: string
  files: Array<{ path: string; content: string }>
} | null> {
  const root = resolve(workspaceRoot)
  const entryCandidates = ['index.html', 'dist/index.html', 'public/index.html']
  for (const entryPath of entryCandidates) {
    const html = await readWorkspaceFile(root, entryPath)
    if (html === null) continue
    const files = [{ path: entryPath, content: html }]
    for (const path of ['styles.css', 'script.js', 'assets.json', 'dist/styles.css', 'dist/script.js', 'dist/assets.json']) {
      if (path === entryPath) continue
      const content = await readWorkspaceFile(root, path)
      if (content !== null) files.push({ path, content })
    }
    return {
      entryPath,
      html,
      files,
    }
  }
  return null
}

function createWorkspaceCodeDeltaWatcher(
  workspaceRoot: string,
  intervalMs: number,
  emit: (event: Record<string, unknown>) => void,
): { stop: () => Promise<void> } {
  const root = resolve(workspaceRoot)
  const snapshots = new Map<string, string>()
  let sequence = 1
  let running: Promise<void> | null = null
  let stopped = false
  const scan = async () => {
    if (stopped) return
    const files = await readWorkspaceCodeFiles(root)
    for (const file of files) {
      const previous = snapshots.get(file.path)
      if (previous === file.content) continue
      snapshots.set(file.path, file.content)
      emit({
        type: 'code_delta',
        path: file.path,
        language: languageForPath(file.path),
        delta: file.content,
        sequence,
        isFinal: false,
      })
      sequence += 1
    }
  }
  const runScan = () => {
    if (running) return
    running = scan().catch(() => undefined).finally(() => {
      running = null
    })
  }
  runScan()
  const timer = setInterval(runScan, intervalMs)
  return {
    stop: async () => {
      clearInterval(timer)
      if (running) await running
      await scan().catch(() => undefined)
      stopped = true
    },
  }
}

async function readWorkspaceCodeFiles(root: string): Promise<Array<{ path: string; content: string }>> {
  const paths = await listWorkspaceCodePaths(root)
  const files: Array<{ path: string; content: string }> = []
  for (const path of paths) {
    const content = await readWorkspaceFile(root, path)
    if (content !== null) files.push({ path, content })
  }
  return files
}

async function listWorkspaceCodePaths(root: string): Promise<string[]> {
  const discovered = new Set<string>()
  for (const path of ['index.html', 'styles.css', 'script.js', 'assets.json', 'dist/index.html', 'dist/styles.css', 'dist/script.js', 'dist/assets.json']) {
    discovered.add(path)
  }
  await collectWorkspaceCodePaths(root, '', discovered, 0).catch(() => undefined)
  return [...discovered].sort((left, right) => fileSortKey(left).localeCompare(fileSortKey(right)))
}

async function collectWorkspaceCodePaths(root: string, relativeDir: string, discovered: Set<string>, depth: number): Promise<void> {
  if (depth > 2) return
  const dir = resolve(root, relativeDir)
  if (!isPathInside(dir, root)) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
    const path = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    if (!isSafeWorkspaceEntryPath(path)) continue
    if (entry.isDirectory()) {
      await collectWorkspaceCodePaths(root, path, discovered, depth + 1)
    } else if (entry.isFile() && isCodeFilePath(path)) {
      discovered.add(path)
    }
  }
}

function fileSortKey(path: string): string {
  return path === 'index.html' ? `0:${path}` : `1:${path}`
}

function isCodeFilePath(path: string): boolean {
  return /\.(html?|css|m?js|tsx?|json|txt|md)$/i.test(path)
}

async function readWorkspaceFile(root: string, entryPath: string): Promise<string | null> {
  if (!isSafeWorkspaceEntryPath(entryPath)) return null
  const fullPath = resolve(root, entryPath)
  if (!fullPath.startsWith(root)) return null
  try {
    const [rootRealPath, fileInfo] = await Promise.all([
      realpath(root),
      lstat(fullPath),
    ])
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) return null
    const fileRealPath = await realpath(fullPath)
    if (!isPathInside(fileRealPath, rootRealPath)) return null
    return await readFile(fullPath, 'utf8')
  } catch {
    return null
  }
}

function isSafeWorkspaceEntryPath(entryPath: string): boolean {
  if (!entryPath || isAbsolute(entryPath) || entryPath.includes('\\')) return false
  const parts = entryPath.split('/')
  return parts.every(part => part.length > 0 && part !== '.' && part !== '..' && !part.startsWith('.'))
}

function runtimeCwdDrift(events: Array<Record<string, unknown>>, expectedCwd: string): { expectedCwd: string; actualCwd: string } | null {
  const expectedRoot = resolve(expectedCwd)
  for (const event of events) {
    const actualCwd = eventCwd(event)
    if (!actualCwd) continue
    const resolvedActual = resolve(actualCwd)
    if (!isPathInside(resolvedActual, expectedRoot)) {
      return { expectedCwd: expectedRoot, actualCwd: resolvedActual }
    }
  }
  return null
}

function eventCwd(event: Record<string, unknown>): string | undefined {
  const direct = stringField(event, 'cwd') ?? stringField(event, 'resolvedCwd') ?? stringField(event, 'requestCwd')
  if (direct) return direct
  const input = fieldRecord(event, 'input')
  const inputPath = input ? stringField(input, 'path') ?? stringField(input, 'cwd') : undefined
  if (inputPath) return cwdFromRuntimePath(inputPath)
  const output = fieldRecord(event, 'output')
  const outputPath = output ? stringField(output, 'path') : undefined
  if (outputPath) return cwdFromRuntimePath(outputPath)
  return undefined
}

function cwdFromRuntimePath(path: string): string | undefined {
  if (!isAbsolute(path)) return undefined
  if (path.endsWith('/index.html')) return resolve(path, '..')
  return path
}

function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function fieldRecord(value: unknown, field: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined
  const fieldValue = (value as Record<string, unknown>)[field]
  return fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)
    ? fieldValue as Record<string, unknown>
    : undefined
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

function booleanField(value: unknown, field: string): boolean | undefined {
  if (!value || typeof value !== 'object') return undefined
  const fieldValue = (value as Record<string, unknown>)[field]
  return typeof fieldValue === 'boolean' ? fieldValue : undefined
}
