import http from 'node:http'
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { URL } from 'node:url'
import { DUDESIGN_RUNTIME_CONTRACT_VERSION } from '@dudesign/runtime-gateway'
import {
  GuidanceBridgeError,
  assertGuidanceAnalysisInput,
  buildGuidanceAnalysisPrompt,
  buildGuidanceRepairPrompt,
  extractGuidanceAnalysisPayload,
  normalizeAndValidateGuidanceAnalysis,
} from './guidanceAnalysisBridge.js'
import { NexusClient, NexusClientError, type NexusExecuteResponse } from './nexusClient.js'
import { RuntimeLaneRegistry, type RuntimeLane, type RuntimeLaneLease } from './runtimeLane.js'
import { NoopRuntimeAdapterStateStore, type PersistedRuntimeRefineOperation, type RuntimeAdapterStateSnapshot, type RuntimeAdapterStateStore } from './stateStore.js'

export type RuntimeAdapterOptions = {
  nexus: NexusClient
  runtimeLaneRegistry?: RuntimeLaneRegistry
  runtimeVersion?: string
  workspaceBase?: string
  stateStore?: RuntimeAdapterStateStore
  executeRetryAttempts?: number
  executeRetryBaseDelayMs?: number
  laneRetryAttempts?: number
  laneAcquireTimeoutMs?: number
  laneAcquirePollMs?: number
  executeTimeoutMs?: number
  guidanceExecuteTimeoutMs?: number
  guidanceTimeoutRetryAttempts?: number
  watchdogTimeoutMs?: number
  workspacePollIntervalMs?: number
}

type RuntimeStream = {
  streamId: string
  requestId?: string
  userId?: string
  workspaceId?: string
  sessionId?: string
  runtimeSessionId: string
  agentJobId: string
  mode?: 'spawn' | 'refine'
  variationIndex?: number
  memoryNamespace?: string
  runtimeLaneId: string
  runtimeBackendId: string
  runtimeLeaseId?: string
  runtimeLeasePending?: boolean
  variationId?: string
  workspaceRoot: string
  workspaceRootInput?: string
  prompt: string
  modelId?: string
  waitStarted: boolean
}

type RuntimeRefineOperation = PersistedRuntimeRefineOperation

type RuntimeLaneRetryBehavior = {
  markPreviousUnavailable: boolean
}

class RuntimeExecutionFailedError extends NexusClientError {
  constructor(
    readonly failure: {
      code: string
      message: string
      detail?: string
    },
  ) {
    super(failure.message, 502, '/v1/execute')
  }
}

const REQUIRED_ENDPOINTS = [
  'GET /v1/health',
  'GET /v1/contract',
  'POST /v1/sessions',
  'POST /v1/sessions/:sessionId/resume',
  'POST /v1/agents',
  'POST /v1/agents/refine',
  'POST /v1/agents/cancel',
  'POST /v1/guidance/analyze',
  'GET /v1/stream',
]

const OPTIONAL_ENDPOINTS = [
  'GET /v1/models',
  'GET /v1/refine-operations/:requestId',
  'POST /v1/lanes/:laneId/drain',
  'POST /v1/lanes/:laneId/undrain',
]

const GENERIC_EXECUTION_FAILED_MESSAGE = 'BabeL-O execution failed without a detailed runtime error.'

const REQUIRED_EVENTS = [
  'session_started',
  'assistant_delta',
  'file_delta',
  'workspace_dirty',
  'workspace_dirty_detected',
  'runtime_lane_assigned',
  'runtime_lane_retry_started',
  'runtime_lane_retry_exhausted',
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
  runtime_lane_assigned: 'design.runtime_lane_assigned',
  runtime_lane_retry_started: 'design.runtime_lane_retry_started',
  runtime_lane_retry_exhausted: 'design.runtime_lane_retry_exhausted',
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
  private readonly refineOperations = new Map<string, RuntimeRefineOperation>()
  private readonly sessions = new Map<string, string>()
  private readonly stateStore: RuntimeAdapterStateStore
  private readonly executeRetryAttempts: number
  private readonly executeRetryBaseDelayMs: number
  private readonly laneRetryAttempts: number
  private readonly laneAcquireTimeoutMs: number
  private readonly laneAcquirePollMs: number
  private readonly executeTimeoutMs: number
  private readonly guidanceExecuteTimeoutMs: number
  private readonly guidanceTimeoutRetryAttempts: number
  private readonly watchdogTimeoutMs: number
  private readonly workspacePollIntervalMs: number
  private readonly runtimeLaneRegistry: RuntimeLaneRegistry
  private readonly ready: Promise<void>
  private persistQueue: Promise<void> = Promise.resolve()
  private sequence = 1

  constructor(private readonly options: RuntimeAdapterOptions) {
    this.stateStore = options.stateStore ?? new NoopRuntimeAdapterStateStore()
    this.executeRetryAttempts = nonNegativeInteger(options.executeRetryAttempts, 2)
    this.executeRetryBaseDelayMs = nonNegativeInteger(options.executeRetryBaseDelayMs, 750)
    this.laneRetryAttempts = nonNegativeInteger(options.laneRetryAttempts, 1)
    this.laneAcquireTimeoutMs = positiveInteger(options.laneAcquireTimeoutMs, 30000)
    this.laneAcquirePollMs = positiveInteger(options.laneAcquirePollMs, 250)
    this.executeTimeoutMs = positiveInteger(options.executeTimeoutMs, 300000)
    this.guidanceExecuteTimeoutMs = positiveInteger(options.guidanceExecuteTimeoutMs, 60000)
    this.guidanceTimeoutRetryAttempts = nonNegativeInteger(options.guidanceTimeoutRetryAttempts, 1)
    this.watchdogTimeoutMs = positiveInteger(options.watchdogTimeoutMs, this.executeTimeoutMs)
    this.workspacePollIntervalMs = positiveInteger(options.workspacePollIntervalMs, 250)
    this.runtimeLaneRegistry = options.runtimeLaneRegistry ?? RuntimeLaneRegistry.single(options.nexus, { maxConcurrent: Number.MAX_SAFE_INTEGER })
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
    const laneDrainMatch = url.pathname.match(/^\/v1\/lanes\/([^/]+)\/drain$/)
    if (method === 'POST' && laneDrainMatch) {
      this.handleLaneDrain(res, decodeURIComponent(laneDrainMatch[1]!), true)
      return
    }
    const laneUndrainMatch = url.pathname.match(/^\/v1\/lanes\/([^/]+)\/undrain$/)
    if (method === 'POST' && laneUndrainMatch) {
      this.handleLaneDrain(res, decodeURIComponent(laneUndrainMatch[1]!), false)
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
    const refineOperationMatch = url.pathname.match(/^\/v1\/refine-operations\/([^/]+)$/)
    if (method === 'GET' && refineOperationMatch) {
      await this.handleRefineOperation(res, decodeURIComponent(refineOperationMatch[1]!))
      return
    }
    if (method === 'POST' && url.pathname === '/v1/guidance/analyze') {
      await this.handleGuidanceAnalysis(req, res)
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
    const health = await this.primaryNexus().health().catch(error => ({
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'BabeL-O Nexus unavailable.',
    }))
    const version = await this.primaryNexus().version().catch(() => null)
    sendJson(res, 200, {
      runtime: 'babel-o',
      runtimeVersion: runtimeVersionFrom(version) ?? this.options.runtimeVersion ?? stringField(health, 'version') ?? null,
      contractVersion: DUDESIGN_RUNTIME_CONTRACT_VERSION,
      status: stringField(health, 'status') === 'ok' ? 'compatible' : 'unavailable',
      message: stringField(health, 'message') ?? 'DUDesign BabeL-O runtime adapter.',
      lanes: this.runtimeLaneRegistry.list().map(lane => ({
        id: lane.id,
        backendId: lane.backendId,
        provider: lane.provider,
        status: lane.status,
        inflight: lane.inflight,
        maxConcurrent: lane.maxConcurrent,
        weight: lane.weight,
        contractVersion: lane.contractVersion ?? null,
        lastHealthAt: lane.lastHealthAt ?? null,
        lastErrorCode: lane.lastErrorCode ?? null,
      })),
    })
  }

  private async handleContract(res: http.ServerResponse): Promise<void> {
    const version = await this.primaryNexus().version().catch(() => null)
    sendJson(res, 200, contractPayload(runtimeVersionFrom(version) ?? this.options.runtimeVersion))
  }

  private async handleModels(res: http.ServerResponse): Promise<void> {
    const version = await this.primaryNexus().version().catch(() => null)
    try {
      const [config, profiles] = await Promise.all([
        this.primaryNexus().runtimeConfig(),
        this.primaryNexus().runtimeProfiles().catch(() => null),
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
    const created = await this.primaryNexus().createSession({
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
    const resumed = await this.primaryNexus().resumeSession(runtimeSessionId)
    const resolvedRuntimeSessionId = stringField(resumed, 'sessionId') ?? runtimeSessionId
    this.sessions.set(runtimeSessionId, resolvedRuntimeSessionId)
    await this.persistState()
    sendJson(res, 200, {
      status: 'resumed',
      runtimeSessionId: resolvedRuntimeSessionId,
      message: 'BabeL-O Nexus session resumed through DUDesign adapter.',
    })
  }

  private handleLaneDrain(res: http.ServerResponse, laneId: string, drain: boolean): void {
    try {
      this.runtimeLaneRegistry.markStatus(laneId, drain ? 'draining' : 'healthy', drain ? 'RUNTIME_LANE_DRAINING' : undefined)
      const lane = this.runtimeLane(laneId)
      sendJson(res, 200, laneControlPayload(lane, drain ? 'drain_started' : 'drain_cleared'))
    } catch (error) {
      sendJson(res, 404, {
        type: 'error',
        code: 'RUNTIME_LANE_NOT_FOUND',
        message: error instanceof Error ? error.message : `Runtime lane not found: ${laneId}`,
      })
    }
  }

  private async handleSpawnAgent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    mode: 'spawn' | 'refine',
  ): Promise<void> {
    const body = await readJson(req)
    const workspaceRootInput = requiredString(body.workspaceRoot, 'workspaceRoot')
    const requestedRuntimeLaneId = mode === 'refine' ? stringField(body, 'runtimeLaneId') : undefined
    const lane = this.planRuntimeLane({ preferredLaneId: requestedRuntimeLaneId })
    if (!lane) {
      throw new Error('No runtime lane is available.')
    }
    const workspaceRoot = this.runtimeWorkspaceRoot(workspaceRootInput, lane.workspaceRoot)
    await mkdir(workspaceRoot, { recursive: true })
    const runtimeSessionId = mode === 'spawn'
      ? await this.resolveVariationRuntimeSessionId(body, workspaceRoot, lane)
      : this.resolveRuntimeSessionId(body)
    const prompt = mode === 'refine'
      ? buildRefinePrompt(body)
      : buildVariationPrompt(body)
    const modelContext = modelContextFromBody(body)
    const streamId = this.nextId('stream')
    const agentJobId = this.nextId('execute')
    this.streams.set(streamId, {
      streamId,
      ...(stringField(body, 'requestId') && { requestId: stringField(body, 'requestId') }),
      userId: requiredString(body.userId, 'userId'),
      workspaceId: requiredString(body.workspaceId, 'workspaceId'),
      sessionId: requiredString(body.sessionId, 'sessionId'),
      runtimeSessionId,
      agentJobId,
      mode,
      ...(numberField(body, 'variationIndex') && { variationIndex: numberField(body, 'variationIndex') }),
      memoryNamespace: stringField(body, 'memoryNamespace') ?? `memory:session:${requiredString(body.sessionId, 'sessionId')}`,
      runtimeLaneId: lane.id,
      runtimeBackendId: lane.backendId,
      runtimeLeasePending: true,
      variationId: stringField(body, 'variationId'),
      workspaceRoot,
      workspaceRootInput,
      prompt,
      ...(modelContext.modelId && { modelId: modelContext.modelId }),
      waitStarted: false,
    })
    const requestId = stringField(body, 'requestId')
    if (mode === 'refine' && requestId) {
      this.refineOperations.set(requestId, {
        requestId,
        streamId,
        status: 'queued',
        ...(stringField(body, 'variationId') && { variationId: stringField(body, 'variationId') }),
        runtimeSessionId,
        agentJobId,
        workspaceRoot,
        updatedAt: new Date().toISOString(),
      })
    }
    await this.persistState()
    sendJson(res, 200, {
      streamId,
      agentJobId,
      runtimeChildSessionId: runtimeSessionId,
      runtimeLaneId: lane.id,
      runtimeBackendId: lane.backendId,
    })
  }

  private async handleCancelAgents(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJson(req)
    const variations = Array.isArray(body.variations) ? body.variations : []
    const requestId = stringField(body, 'requestId')
    const targets = new Map<string, string | undefined>()
    for (const variation of variations) {
      const runtimeAgentJobId = stringField(variation, 'runtimeAgentJobId')
      if (runtimeAgentJobId) targets.set(runtimeAgentJobId, stringField(variation, 'variationId'))
    }
    if (requestId) {
      for (const stream of this.streams.values()) {
        if (stream.mode !== 'refine' || stream.requestId !== requestId) continue
        targets.set(stream.agentJobId, stream.variationId)
      }
    }
    let cancelledVariationCount = 0
    let failedVariationCount = 0
    for (const runtimeAgentJobId of targets.keys()) {
      try {
        await this.primaryNexus().cancelAgent(runtimeAgentJobId, stringField(body, 'reason'))
        cancelledVariationCount += 1
      } catch {
        failedVariationCount += 1
      }
    }
    if (requestId && cancelledVariationCount > 0 && failedVariationCount === 0) {
      const operation = this.refineOperations.get(requestId)
      if (operation) {
        this.refineOperations.set(requestId, {
          ...operation,
          status: 'cancelled',
          updatedAt: new Date().toISOString(),
        })
        await this.persistState()
      }
    }
    sendJson(res, 200, {
      cancelled: cancelledVariationCount > 0 && failedVariationCount === 0,
      ...(requestId && { requestId }),
      cancelledVariationCount,
      failedVariationCount,
    })
  }

  private async handleRefineOperation(res: http.ServerResponse, requestId: string): Promise<void> {
    const operation = this.refineOperations.get(requestId)
    if (!operation) {
      sendJson(res, 404, {
        type: 'refine_operation',
        requestId,
        status: 'not_found',
      })
      return
    }
    let terminalEvent = operation.terminalEvent
    if (operation.status === 'completed') {
      const artifact = await readWorkspaceArtifact(operation.workspaceRoot)
      terminalEvent = artifact ? {
        type: 'result',
        artifactId: `babel_o_${operation.agentJobId}`,
        entryPath: artifact.entryPath,
        html: artifact.html,
        files: artifact.files,
      } : {
        type: 'error',
        code: 'ARTIFACT_MISSING',
        message: `Recovered refine operation ${requestId} has no readable artifact.`,
        recoverable: true,
      }
    }
    sendJson(res, 200, {
      type: 'refine_operation',
      requestId,
      status: operation.status,
      runtimeChildSessionId: operation.runtimeSessionId,
      runtimeAgentJobId: operation.agentJobId,
      ...(terminalEvent && { terminalEvent }),
      updatedAt: operation.updatedAt,
    })
  }

  private async handleGuidanceAnalysis(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let lease: RuntimeLaneLease | undefined
    try {
      const input = assertGuidanceAnalysisInput(await readJson(req))
      lease = await this.acquireRuntimeLane()
      const lane = this.runtimeLane(lease.laneId)
      const workspaceRoot = this.runtimeWorkspaceRoot(
        `.dudesign/guidance/${safePathSegment(input.analysisId)}`,
        lane.workspaceRoot,
      )
      await mkdir(workspaceRoot, { recursive: true })
      const created = await lane.nexus.createSession({
        userId: input.userId,
        workspaceId: input.workspaceId,
        sessionId: `guidance:${input.analysisId}`,
        workspaceRoot,
        memoryNamespace: `memory:guidance:${input.analysisId}`,
      })
      const runtimeSessionId = requiredString(created.sessionId, 'sessionId')
      const startedAt = Date.now()
      const firstExecution = await this.executeGuidanceWithTimeoutRetry({
        sessionId: runtimeSessionId,
        prompt: buildGuidanceAnalysisPrompt(input),
        cwd: workspaceRoot,
        runtimeLaneId: lane.id,
        timeoutMs: this.guidanceExecuteTimeoutMs,
        watchdogTimeoutMs: this.guidanceExecuteTimeoutMs,
        allowedTools: [],
        skipPermissionCheck: true,
      })
      assertGuidanceExecutionSucceeded(firstExecution)

      let previousOutput: unknown = firstExecution.events ?? []
      try {
        previousOutput = extractGuidanceAnalysisPayload(firstExecution.events ?? [])
        const analysis = normalizeAndValidateGuidanceAnalysis(input, previousOutput, {
          durationMs: Date.now() - startedAt,
          repaired: false,
          runtimeVersion: this.options.runtimeVersion ?? null,
        })
        sendJson(res, 200, analysis)
        return
      } catch (error) {
        if (!(error instanceof GuidanceBridgeError) || error.code !== 'GUIDANCE_INVALID_RESPONSE') throw error
        previousOutput = error.payload ?? previousOutput
        const repairExecution = await this.executeGuidanceWithTimeoutRetry({
          sessionId: runtimeSessionId,
          prompt: buildGuidanceRepairPrompt(input, previousOutput, error.message),
          cwd: workspaceRoot,
          runtimeLaneId: lane.id,
          timeoutMs: this.guidanceExecuteTimeoutMs,
          watchdogTimeoutMs: this.guidanceExecuteTimeoutMs,
          allowedTools: [],
          skipPermissionCheck: true,
        }, false)
        assertGuidanceExecutionSucceeded(repairExecution)
        const repairedPayload = extractGuidanceAnalysisPayload(repairExecution.events ?? [])
        const analysis = normalizeAndValidateGuidanceAnalysis(input, repairedPayload, {
          durationMs: Date.now() - startedAt,
          repaired: true,
          runtimeVersion: this.options.runtimeVersion ?? null,
        })
        sendJson(res, 200, analysis)
      }
    } catch (error) {
      sendGuidanceError(res, error)
    } finally {
      if (lease) this.runtimeLaneRegistry.release(lease)
    }
  }

  private async handleStream(url: URL, res: http.ServerResponse): Promise<void> {
    const streamId = url.searchParams.get('streamId')
    const requestId = url.searchParams.get('requestId')
    const stream = streamId
      ? this.streams.get(streamId)
      : requestId
        ? [...this.streams.values()].find(candidate => candidate.mode === 'refine' && candidate.requestId === requestId)
        : undefined
    if (!stream) {
      const operation = requestId ? this.refineOperations.get(requestId) : undefined
      if (operation?.status === 'completed') {
        const artifact = await readWorkspaceArtifact(operation.workspaceRoot)
        if (artifact) {
          res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' })
          writeNdjson(res, {
            type: 'result',
            artifactId: `babel_o_${operation.agentJobId}`,
            entryPath: artifact.entryPath,
            html: artifact.html,
            files: artifact.files,
          })
          res.end()
          return
        }
      }
      if (operation?.status === 'failed' && operation.terminalEvent) {
        res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' })
        writeNdjson(res, operation.terminalEvent)
        res.end()
        return
      }
      if (operation?.status === 'running' || operation?.status === 'queued' || operation?.status === 'cancelled') {
        res.writeHead(204, { 'cache-control': 'no-store' })
        res.end()
        return
      }
      sendJson(res, 404, {
        type: 'error',
        code: 'STREAM_NOT_FOUND',
        message: `Runtime stream not found: ${streamId ?? ''}`,
      })
      return
    }
    if (stream.waitStarted) {
      if (requestId) {
        res.writeHead(204, { 'cache-control': 'no-store' })
        res.end()
        return
      }
      sendJson(res, 409, {
        type: 'error',
        code: 'STREAM_ALREADY_CONSUMED',
        message: `Runtime stream already consumed: ${stream.streamId}`,
      })
      return
    }
    stream.waitStarted = true
    await this.updateRefineOperationForStream(stream, 'running')
    res.writeHead(200, {
      'content-type': 'application/x-ndjson',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    try {
      const lease = await this.acquireRuntimeLane({
        preferredLaneId: stream.runtimeLaneId,
        allowDrainingPreferred: Boolean(stream.runtimeLeasePending),
      })
      const lane = this.runtimeLane(lease.laneId)
      stream.runtimeLaneId = lane.id
      stream.runtimeBackendId = lane.backendId
      stream.runtimeLeaseId = lease.leaseId
      stream.runtimeLeasePending = false
      stream.workspaceRoot = this.runtimeWorkspaceRoot(stream.workspaceRootInput ?? stream.workspaceRoot, lane.workspaceRoot)
      await mkdir(stream.workspaceRoot, { recursive: true })
      await this.persistState()
      writeNdjson(res, {
        type: 'runtime_lane_assigned',
        runtimeLaneId: stream.runtimeLaneId,
        runtimeBackendId: stream.runtimeBackendId,
        runtimeLeaseId: stream.runtimeLeaseId ?? null,
        streamId: stream.streamId,
        agentJobId: stream.agentJobId,
      })
      writeNdjson(res, { type: 'assistant_delta', delta: 'Starting the BabeL-O design run.' })
      const workspaceWatcher = createWorkspaceCodeDeltaWatcher(stream.workspaceRoot, this.workspacePollIntervalMs, event => writeNdjson(res, event))
      let executed: NexusExecuteResponse
      try {
        executed = await this.executeWithLaneRetry(stream, event => writeNdjson(res, event))
      } finally {
        await workspaceWatcher.stop()
      }
      for (const event of executed.events ?? []) {
        const mapped = normalizeTranscriptEvent(event)
        if (mapped) writeNdjson(res, mapped)
      }
      const drift = runtimeCwdDrift(executed.events ?? [], stream.workspaceRoot)
      if (drift) {
        const terminalEvent = {
          type: 'error',
          code: 'RUNTIME_CWD_DRIFT',
          message: `BabeL-O changed cwd from the DUDesign variation workspace to ${drift.actualCwd}. Expected ${drift.expectedCwd}.`,
          recoverable: true,
          expectedCwd: drift.expectedCwd,
          actualCwd: drift.actualCwd,
        }
        await this.updateRefineOperationForStream(stream, 'failed', terminalEvent)
        writeNdjson(res, terminalEvent)
        return
      }
      if (executed.success === false) {
        const failure = await this.summarizeExecutionFailure(stream, executed.events ?? [])
        if (!executionEventsIncludeError(executed.events ?? [], failure.code)) {
          const terminalEvent = {
            type: 'error',
            code: failure.code,
            message: failure.message,
            ...(failure.detail && { detail: failure.detail }),
          }
          await this.updateRefineOperationForStream(stream, 'failed', terminalEvent)
          writeNdjson(res, terminalEvent)
        } else {
          await this.updateRefineOperationForStream(stream, 'failed', {
            type: 'error',
            code: failure.code,
            message: failure.message,
            ...(failure.detail && { detail: failure.detail }),
          })
        }
        return
      }
      const artifact = await readWorkspaceArtifact(stream.workspaceRoot)
      if (!artifact) {
        const terminalEvent = {
          type: 'error',
          code: 'ARTIFACT_MISSING',
          message: `BabeL-O completed but did not write index.html under ${stream.workspaceRoot}.`,
          recoverable: true,
          expectedCwd: stream.workspaceRoot,
        }
        await this.updateRefineOperationForStream(stream, 'failed', terminalEvent)
        writeNdjson(res, terminalEvent)
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
      const resultEvent = {
        type: 'result',
        artifactId: `babel_o_${stream.agentJobId}`,
        entryPath: artifact.entryPath,
        html: artifact.html,
      }
      await this.updateRefineOperationForStream(stream, 'completed')
      writeNdjson(res, resultEvent)
    } catch (error) {
      const terminalEvent = {
        type: 'error',
        code: 'ADAPTER_STREAM_FAILED',
        message: error instanceof Error ? error.message : 'Runtime stream failed.',
      }
      await this.updateRefineOperationForStream(stream, 'failed', terminalEvent)
      writeNdjson(res, terminalEvent)
    } finally {
      if (stream.runtimeLeaseId) {
        this.runtimeLaneRegistry.release({
          leaseId: stream.runtimeLeaseId,
          laneId: stream.runtimeLaneId,
          acquiredAt: new Date(0).toISOString(),
        })
      }
      this.streams.delete(stream.streamId)
      await this.persistState()
      res.end()
    }
  }

  private async updateRefineOperationForStream(
    stream: RuntimeStream,
    status: RuntimeRefineOperation['status'],
    terminalEvent?: Record<string, unknown>,
  ): Promise<void> {
    if (stream.mode !== 'refine' || !stream.requestId) return
    const operation = this.refineOperations.get(stream.requestId)
    if (!operation || operation.status === 'cancelled') return
    this.refineOperations.set(stream.requestId, {
      ...operation,
      status,
      runtimeSessionId: stream.runtimeSessionId,
      agentJobId: stream.agentJobId,
      workspaceRoot: stream.workspaceRoot,
      ...(terminalEvent ? { terminalEvent } : {}),
      updatedAt: new Date().toISOString(),
    })
    await this.persistState()
  }

  private nextId(prefix: string): string {
    const id = `${prefix}_${this.sequence}`
    this.sequence += 1
    return id
  }

  private runtimeWorkspaceRoot(workspaceRoot: string, laneWorkspaceRoot?: string): string {
    return resolveRuntimeWorkspaceRoot(workspaceRoot, laneWorkspaceRoot ?? this.options.workspaceBase)
  }

  private resolveRuntimeSessionId(body: Record<string, unknown>): string {
    const directRuntimeSessionId = stringField(body, 'runtimeSessionId') ?? stringField(body, 'runtimeChildSessionId')
    if (directRuntimeSessionId) return directRuntimeSessionId
    const sessionId = requiredString(body.sessionId, 'sessionId')
    return this.sessions.get(sessionId) ?? sessionId
  }

  private async resolveVariationRuntimeSessionId(body: Record<string, unknown>, workspaceRoot: string, lane: RuntimeLane): Promise<string> {
    const directRuntimeSessionId = stringField(body, 'runtimeSessionId') ?? stringField(body, 'runtimeChildSessionId')
    if (directRuntimeSessionId) return directRuntimeSessionId
    const sessionId = requiredString(body.sessionId, 'sessionId')
    const variationIndex = numberField(body, 'variationIndex')
    const variationSessionKey = variationIndex ? `${sessionId}:variation:${variationIndex}` : sessionId
    const existing = this.sessions.get(variationSessionKey)
    if (existing) return existing
    const created = await lane.nexus.createSession({
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
    runtimeLaneId: string
    timeoutMs?: number
    watchdogTimeoutMs?: number
    allowedTools?: string[]
    skipPermissionCheck?: boolean
  }): Promise<NexusExecuteResponse> {
    const executeInput = {
      ...input,
      timeoutMs: input.timeoutMs ?? this.executeTimeoutMs,
      watchdogTimeoutMs: input.watchdogTimeoutMs ?? this.watchdogTimeoutMs,
    }
    let attempt = 0
    while (true) {
      try {
        return await this.runtimeLane(input.runtimeLaneId).nexus.execute(executeInput)
      } catch (error) {
        if (!isCapacityError(error) || attempt >= this.executeRetryAttempts) throw error
        attempt += 1
        await delay(this.executeRetryBaseDelayMs * attempt)
      }
    }
  }

  private async executeGuidanceWithTimeoutRetry(
    input: Parameters<RuntimeAdapterApp['executeWithCapacityRetry']>[0],
    retryTimeout = true,
  ): Promise<NexusExecuteResponse> {
    let timeoutAttempt = 0
    while (true) {
      try {
        return await this.executeWithCapacityRetry(input)
      } catch (error) {
        if (!retryTimeout
          || !(error instanceof NexusClientError)
          || error.status !== 408
          || timeoutAttempt >= this.guidanceTimeoutRetryAttempts) throw error
        timeoutAttempt += 1
        await delay(this.executeRetryBaseDelayMs * timeoutAttempt)
      }
    }
  }

  private async executeWithLaneRetry(stream: RuntimeStream, emit: (event: Record<string, unknown>) => void): Promise<NexusExecuteResponse> {
    let laneAttempt = 0
    const attemptedLaneIds = new Set<string>()
    while (true) {
      attemptedLaneIds.add(stream.runtimeLaneId)
      try {
        const executed = await this.executeWithCapacityRetry({
          sessionId: stream.runtimeSessionId,
          prompt: stream.prompt,
          cwd: stream.workspaceRoot,
          modelId: stream.modelId,
          runtimeLaneId: stream.runtimeLaneId,
        })
        if (executed.success === false && stream.mode === 'spawn') {
          throw new RuntimeExecutionFailedError(await this.summarizeExecutionFailure(stream, executed.events ?? []))
        }
        return executed
      } catch (error) {
        const reason = runtimeLaneRetryReason(error)
        const retryBehavior = runtimeLaneRetryBehavior(error)
        if (!reason || stream.mode !== 'spawn' || laneAttempt >= this.laneRetryAttempts) {
          if (reason) {
            emit({
              type: 'runtime_lane_retry_exhausted',
              previousRuntimeLaneId: stream.runtimeLaneId,
              previousRuntimeBackendId: stream.runtimeBackendId,
              reason,
              attempts: laneAttempt,
              errorCode: runtimeLaneErrorCode(error),
              message: error instanceof Error ? error.message : 'Runtime lane retry exhausted.',
            })
          }
          if (error instanceof RuntimeExecutionFailedError) {
            return failedExecutionResponse(stream.runtimeSessionId, error.failure)
          }
          throw error
        }

        const previousLaneId = stream.runtimeLaneId
        const previousBackendId = stream.runtimeBackendId
        if (retryBehavior.markPreviousUnavailable) {
          this.runtimeLaneRegistry.markStatus(previousLaneId, 'unavailable', runtimeLaneErrorCode(error))
        }
        if (stream.runtimeLeaseId) {
          this.runtimeLaneRegistry.release({
            leaseId: stream.runtimeLeaseId,
            laneId: previousLaneId,
            acquiredAt: new Date(0).toISOString(),
          })
          stream.runtimeLeaseId = undefined
        }

        let nextLease
        try {
          nextLease = await this.acquireRuntimeLane({ excludeLaneIds: [...attemptedLaneIds] })
        } catch (acquireError) {
          emit({
            type: 'runtime_lane_retry_exhausted',
            previousRuntimeLaneId: previousLaneId,
            previousRuntimeBackendId: previousBackendId,
            reason,
            attempts: laneAttempt,
            errorCode: 'RUNTIME_LANE_UNAVAILABLE',
            message: acquireError instanceof Error ? acquireError.message : 'No runtime lane is available for retry.',
          })
          if (error instanceof RuntimeExecutionFailedError) {
            return failedExecutionResponse(stream.runtimeSessionId, error.failure)
          }
          throw error
        }
        const nextLane = this.runtimeLane(nextLease.laneId)
        laneAttempt += 1
        const nextWorkspaceRoot = this.runtimeWorkspaceRoot(stream.workspaceRootInput ?? stream.workspaceRoot, nextLane.workspaceRoot)
        await mkdir(nextWorkspaceRoot, { recursive: true })
        stream.runtimeLaneId = nextLane.id
        stream.runtimeBackendId = nextLane.backendId
        stream.runtimeLeaseId = nextLease.leaseId
        stream.workspaceRoot = nextWorkspaceRoot
        stream.runtimeSessionId = await this.createRetryRuntimeSession(stream, nextLane, laneAttempt)
        await this.persistState()

        emit({
          type: 'runtime_lane_retry_started',
          previousRuntimeLaneId: previousLaneId,
          previousRuntimeBackendId: previousBackendId,
          nextRuntimeLaneId: nextLane.id,
          nextRuntimeBackendId: nextLane.backendId,
          reason,
          attempt: laneAttempt,
          maxAttempts: this.laneRetryAttempts,
        })
        emit({
          type: 'runtime_lane_assigned',
          runtimeLaneId: stream.runtimeLaneId,
          runtimeBackendId: stream.runtimeBackendId,
          runtimeLeaseId: stream.runtimeLeaseId ?? null,
          streamId: stream.streamId,
          agentJobId: stream.agentJobId,
        })
      }
    }
  }

  private async createRetryRuntimeSession(stream: RuntimeStream, lane: RuntimeLane, attempt: number): Promise<string> {
    if (!stream.userId || !stream.workspaceId || !stream.sessionId) {
      throw new Error('Runtime lane retry cannot create a new session without stream identity context.')
    }
    const retrySessionId = stream.variationIndex
      ? `${stream.sessionId}:variation:${stream.variationIndex}:lane-retry:${attempt}`
      : `${stream.sessionId}:lane-retry:${attempt}`
    const created = await lane.nexus.createSession({
      userId: stream.userId,
      workspaceId: stream.workspaceId,
      sessionId: retrySessionId,
      workspaceRoot: stream.workspaceRoot,
      memoryNamespace: stream.memoryNamespace ?? `memory:session:${stream.sessionId}`,
    })
    return requiredString(created.sessionId, 'sessionId')
  }

  private async summarizeExecutionFailure(
    stream: RuntimeStream,
    executeEvents: Array<Record<string, unknown>>,
  ): Promise<{
    code: string
    message: string
    detail?: string
  }> {
    const directSummary = summarizeExecutionFailureEvents(executeEvents)
    if (directSummary.detail || directSummary.message !== GENERIC_EXECUTION_FAILED_MESSAGE) return directSummary

    try {
      const transcript = await this.runtimeLane(stream.runtimeLaneId).nexus.getAgentTranscript(stream.agentJobId)
      const transcriptEvents = transcript.events ?? []
      const transcriptSummary = summarizeExecutionFailureEvents([...executeEvents, ...transcriptEvents])
      if (transcriptSummary.detail || transcriptSummary.message !== GENERIC_EXECUTION_FAILED_MESSAGE) return transcriptSummary
    } catch {
      // Best-effort diagnostic enrichment only. The original execute failure remains authoritative.
    }

    return directSummary
  }

  private planRuntimeLane(options: { preferredLaneId?: string } = {}): RuntimeLane | undefined {
    return this.runtimeLaneRegistry.plan(options)
  }

  private async acquireRuntimeLane(options: {
    excludeLaneIds?: string[]
    preferredLaneId?: string
    allowDrainingPreferred?: boolean
  } = {}): Promise<RuntimeLaneLease> {
    const deadline = Date.now() + this.laneAcquireTimeoutMs
    while (true) {
      try {
        return this.runtimeLaneRegistry.acquire(options)
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await delay(this.laneAcquirePollMs)
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
        mode: stream.mode ?? 'spawn',
        runtimeLaneId: stream.runtimeLaneId ?? this.runtimeLaneRegistry.primary().id,
        runtimeBackendId: stream.runtimeBackendId ?? this.runtimeLane(stream.runtimeLaneId ?? this.runtimeLaneRegistry.primary().id).backendId,
        waitStarted: false,
      })
    }
    for (const operation of Object.values(snapshot.refineOperations)) {
      this.refineOperations.set(operation.requestId, operation)
    }
    for (const stream of this.streams.values()) {
      if (stream.mode !== 'refine' || !stream.requestId || this.refineOperations.has(stream.requestId)) continue
      this.refineOperations.set(stream.requestId, {
        requestId: stream.requestId,
        streamId: stream.streamId,
        status: 'queued',
        ...(stream.variationId && { variationId: stream.variationId }),
        runtimeSessionId: stream.runtimeSessionId,
        agentJobId: stream.agentJobId,
        workspaceRoot: stream.workspaceRoot,
        updatedAt: new Date().toISOString(),
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
            ...(stream.requestId && { requestId: stream.requestId }),
            ...(stream.userId && { userId: stream.userId }),
            ...(stream.workspaceId && { workspaceId: stream.workspaceId }),
            ...(stream.sessionId && { sessionId: stream.sessionId }),
            runtimeSessionId: stream.runtimeSessionId,
            agentJobId: stream.agentJobId,
            ...(stream.mode && { mode: stream.mode }),
            ...(stream.variationIndex && { variationIndex: stream.variationIndex }),
            ...(stream.memoryNamespace && { memoryNamespace: stream.memoryNamespace }),
            runtimeLaneId: stream.runtimeLaneId,
            runtimeBackendId: stream.runtimeBackendId,
            ...(stream.runtimeLeaseId && { runtimeLeaseId: stream.runtimeLeaseId }),
            ...(stream.runtimeLeasePending && { runtimeLeasePending: stream.runtimeLeasePending }),
            ...(stream.variationId && { variationId: stream.variationId }),
            workspaceRoot: stream.workspaceRoot,
            ...(stream.workspaceRootInput && { workspaceRootInput: stream.workspaceRootInput }),
            prompt: stream.prompt,
            ...(stream.modelId && { modelId: stream.modelId }),
          },
        ]),
      ),
      refineOperations: Object.fromEntries(this.refineOperations),
      sequence: this.sequence,
      updatedAt: new Date().toISOString(),
    } satisfies RuntimeAdapterStateSnapshot
    this.persistQueue = this.persistQueue.then(() => this.stateStore.save(snapshot))
    await this.persistQueue
  }

  private primaryNexus(): NexusClient {
    return this.runtimeLaneRegistry.primary().nexus
  }

  private runtimeLane(laneId: string): RuntimeLane {
    const lane = this.runtimeLaneRegistry.get(laneId)
    if (!lane) {
      throw new Error(`Runtime lane not found: ${laneId}`)
    }
    return lane
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

function runtimeLaneRetryReason(error: unknown): string | null {
  if (error instanceof RuntimeExecutionFailedError) return 'runtime_execution_failed'
  if (!(error instanceof NexusClientError)) return null
  if (error.status === 429) return 'runtime_capacity'
  if (error.status === 408) return 'runtime_request_timeout'
  if (error.status >= 500 && error.status <= 599) return 'runtime_lane_unavailable'
  return null
}

function runtimeLaneRetryBehavior(error: unknown): RuntimeLaneRetryBehavior {
  return {
    markPreviousUnavailable: !(error instanceof RuntimeExecutionFailedError),
  }
}

function runtimeLaneErrorCode(error: unknown): string {
  if (error instanceof RuntimeExecutionFailedError) return error.failure.code
  if (error instanceof NexusClientError) {
    if (error.status === 429) return 'RUNTIME_CAPACITY_EXHAUSTED'
    if (error.status === 408) return 'RUNTIME_REQUEST_TIMEOUT'
    if (error.status >= 500 && error.status <= 599) return 'RUNTIME_LANE_UNAVAILABLE'
    return `RUNTIME_HTTP_${error.status}`
  }
  return 'RUNTIME_LANE_ERROR'
}

function assertGuidanceExecutionSucceeded(executed: NexusExecuteResponse): void {
  if (executed.success !== false) return
  const failure = summarizeExecutionFailureEvents(executed.events ?? [])
  throw new GuidanceBridgeError(
    failure.code === 'RUNTIME_REQUEST_TIMEOUT' ? 'GUIDANCE_TIMEOUT' : 'GUIDANCE_RUNTIME_UNAVAILABLE',
    failure.message,
    failure.code === 'RUNTIME_REQUEST_TIMEOUT' ? 504 : 503,
  )
}

function sendGuidanceError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof GuidanceBridgeError) {
    sendJson(res, error.status, {
      type: 'error',
      code: error.code,
      message: error.message,
    })
    return
  }
  if (error instanceof NexusClientError) {
    const timeout = error.status === 408
    sendJson(res, timeout ? 504 : 503, {
      type: 'error',
      code: timeout ? 'GUIDANCE_TIMEOUT' : 'GUIDANCE_RUNTIME_UNAVAILABLE',
      message: error.message,
    })
    return
  }
  sendJson(res, 503, {
    type: 'error',
    code: 'GUIDANCE_RUNTIME_UNAVAILABLE',
    message: error instanceof Error ? error.message : 'BabeL-O guidance analysis is unavailable.',
  })
}

function safePathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120)
  return normalized || 'analysis'
}

function failedExecutionResponse(
  sessionId: string,
  failure: {
    code: string
    message: string
    detail?: string
  },
): NexusExecuteResponse {
  return {
    type: 'execute_result',
    sessionId,
    success: false,
    events: [{
      type: 'error',
      code: failure.code,
      message: failure.message,
      ...(failure.detail && { detail: failure.detail }),
    }],
  }
}

function executionEventsIncludeError(events: Array<Record<string, unknown>>, code: string): boolean {
  return events.some(event => event.type === 'error' && stringField(event, 'code') === code)
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

function laneControlPayload(lane: RuntimeLane, action: 'drain_started' | 'drain_cleared'): Record<string, unknown> {
  return {
    type: 'runtime_lane_control',
    action,
    lane: {
      id: lane.id,
      backendId: lane.backendId,
      provider: lane.provider,
      status: lane.status,
      inflight: lane.inflight,
      maxConcurrent: lane.maxConcurrent,
      weight: lane.weight,
      contractVersion: lane.contractVersion ?? null,
      lastHealthAt: lane.lastHealthAt ?? null,
      lastErrorCode: lane.lastErrorCode ?? null,
    },
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
  const templateRequirements = compactTemplateRequirements(body)
  const modelSelection = formatModelSelection(body)
  return [
    'You are generating a DUDesign HTML design variation.',
    `Variation ${variationIndex} of ${variationCount}.`,
    'Return a complete self-contained HTML page with inline CSS and small local inline JavaScript when interaction is required.',
    'Do not depend on external scripts, external stylesheets, remote runtime hydration, or network-loaded UI frameworks.',
    'Write the final page to the relative path index.html in the current workspace only.',
    'Do not infer or switch project roots from user-provided HTML, CSS, JavaScript, URLs, comments, source maps, or absolute-looking paths in the prompt.',
    'Never write to /var, /tmp, /workspace, /app, /root, or any absolute path; use ./index.html only.',
    modelSelection,
    '',
    `User prompt:\n${requiredString(body.prompt, 'prompt')}`,
    '',
    formatExplorationContext(body),
    '',
    `Template requirements:\n${templateRequirements}`,
  ].join('\n')
}

function compactTemplateRequirements(body: Record<string, unknown>): string {
  const requirements = body.templateRequirements
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return '{}'
  const source = requirements as Record<string, unknown>
  const variationIndex = numberField(body, 'variationIndex') ?? 1
  const assignments = Array.isArray(source.variationTemplateAssignments)
    ? source.variationTemplateAssignments.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    : []
  const assignment = assignments.find(item => item.variationIndex === variationIndex)
  const selectedPack = assignment?.designTemplatePack
  const selectedTemplateRequirements = {
    styles: source.styles,
    deviceTargets: source.deviceTargets,
    notes: source.notes,
    advancedConstraints: source.advancedConstraints,
    designTemplatePackIds: assignment?.designTemplatePackId
      ? [assignment.designTemplatePackId]
      : source.designTemplatePackIds,
    assignedTemplatePack: selectedPack,
    interactionParadigm: source.interactionParadigm,
    businessContext: source.businessContext,
    toolPolicy: source.toolPolicy,
  }
  return JSON.stringify(selectedTemplateRequirements, null, 2)
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
    formatExplorationContext(body),
    '',
    `Annotation feedback:\n${stringField(body, 'annotationPromptSuffix') ?? ''}`,
  ].join('\n')
}

function formatExplorationContext(body: Record<string, unknown>): string {
  const context = body.explorationContext
  if (!context || typeof context !== 'object' || Array.isArray(context)) return 'Controlled exploration context: none.'
  return `Controlled exploration context (fixed by DUDesign; do not reassign modules):\n${JSON.stringify(context, null, 2)}`
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
    const detail = stringField(event, 'detail')
    return {
      type: 'error',
      code: stringField(event, 'code') ?? 'BABEL_O_ERROR',
      message: stringField(event, 'message') ?? 'BabeL-O agent failed.',
      ...(detail && { detail }),
    }
  }
  return null
}

function summarizeExecutionFailureEvents(events: Array<Record<string, unknown>>): {
  code: string
  message: string
  detail?: string
} {
  const errorEvents = events
    .filter(event => stringField(event, 'type') === 'error' || stringField(event, 'level') === 'error')
    .reverse()
  const latestError = errorEvents[0]
  const code = latestError
    ? stringField(latestError, 'code') ?? stringField(latestError, 'errorCode') ?? 'EXECUTION_FAILED'
    : 'EXECUTION_FAILED'
  const directMessage = latestError
    ? stringField(latestError, 'message') ?? stringField(latestError, 'error') ?? stringField(latestError, 'reason')
    : undefined
  const detail = latestError ? compactJson(latestError) : tailTranscriptSummary(events)
  return {
    code,
    message: directMessage
      ? `BabeL-O execution failed: ${directMessage}`
      : GENERIC_EXECUTION_FAILED_MESSAGE,
    ...(detail && { detail }),
  }
}

function compactJson(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value)
    if (!serialized) return undefined
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}...` : serialized
  } catch {
    return undefined
  }
}

function tailTranscriptSummary(events: Array<Record<string, unknown>>): string | undefined {
  const tail = events.slice(-5).map(event => compactJson(event)).filter((value): value is string => Boolean(value))
  if (tail.length === 0) return undefined
  const joined = tail.join('\n')
  return joined.length > 1200 ? `${joined.slice(0, 1200)}...` : joined
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
