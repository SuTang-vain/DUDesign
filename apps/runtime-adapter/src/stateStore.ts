import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type PersistedRuntimeStream = {
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
  runtimeLaneId?: string
  runtimeBackendId?: string
  runtimeLeaseId?: string
  variationId?: string
  workspaceRoot: string
  workspaceRootInput?: string
  prompt?: string
  modelId?: string
}

export type PersistedRuntimeRefineOperation = {
  requestId: string
  streamId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  variationId?: string
  runtimeSessionId: string
  agentJobId: string
  workspaceRoot: string
  terminalEvent?: Record<string, unknown>
  updatedAt: string
}

export type RuntimeAdapterStateSnapshot = {
  version: 1
  sessions: Record<string, string>
  streams: Record<string, PersistedRuntimeStream>
  refineOperations: Record<string, PersistedRuntimeRefineOperation>
  sequence: number
  updatedAt: string
}

export interface RuntimeAdapterStateStore {
  load(): Promise<RuntimeAdapterStateSnapshot>
  save(snapshot: RuntimeAdapterStateSnapshot): Promise<void>
}

export class NoopRuntimeAdapterStateStore implements RuntimeAdapterStateStore {
  async load(): Promise<RuntimeAdapterStateSnapshot> {
    return emptySnapshot()
  }

  async save(_snapshot: RuntimeAdapterStateSnapshot): Promise<void> {
    // Intentionally no-op for local tests and ephemeral adapter instances.
  }
}

export class FileRuntimeAdapterStateStore implements RuntimeAdapterStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<RuntimeAdapterStateSnapshot> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      return normalizeSnapshot(JSON.parse(raw))
    } catch (error) {
      if (isNotFoundError(error)) return emptySnapshot()
      throw error
    }
  }

  async save(snapshot: RuntimeAdapterStateSnapshot): Promise<void> {
    const normalized = normalizeSnapshot(snapshot)
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(tmpPath, this.filePath)
  }
}

export function emptySnapshot(): RuntimeAdapterStateSnapshot {
  return {
    version: 1,
    sessions: {},
    streams: {},
    refineOperations: {},
    sequence: 1,
    updatedAt: new Date(0).toISOString(),
  }
}

function normalizeSnapshot(value: unknown): RuntimeAdapterStateSnapshot {
  if (!value || typeof value !== 'object') return emptySnapshot()
  const input = value as Record<string, unknown>
  const sessions = recordOfStrings(input.sessions)
  const streams = recordOfStreams(input.streams)
  const refineOperations = recordOfRefineOperations(input.refineOperations)
  const sequence = typeof input.sequence === 'number' && Number.isInteger(input.sequence) && input.sequence > 0
    ? input.sequence
    : 1
  const updatedAt = typeof input.updatedAt === 'string' && input.updatedAt.length > 0
    ? input.updatedAt
    : new Date(0).toISOString()
  return {
    version: 1,
    sessions,
    streams,
    refineOperations,
    sequence,
    updatedAt,
  }
}

function recordOfRefineOperations(value: unknown): Record<string, PersistedRuntimeRefineOperation> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, PersistedRuntimeRefineOperation> = {}
  for (const [key, item] of Object.entries(value)) {
    const operation = normalizeRefineOperation(item)
    if (operation && operation.requestId === key) output[key] = operation
  }
  return output
}

function normalizeRefineOperation(value: unknown): PersistedRuntimeRefineOperation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const requestId = stringField(input.requestId)
  const streamId = stringField(input.streamId)
  const status = refineOperationStatus(input.status)
  const runtimeSessionId = stringField(input.runtimeSessionId)
  const agentJobId = stringField(input.agentJobId)
  const workspaceRoot = stringField(input.workspaceRoot)
  const updatedAt = stringField(input.updatedAt)
  if (!requestId || !streamId || !status || !runtimeSessionId || !agentJobId || !workspaceRoot || !updatedAt) return null
  const terminalEvent = input.terminalEvent && typeof input.terminalEvent === 'object' && !Array.isArray(input.terminalEvent)
    ? input.terminalEvent as Record<string, unknown>
    : undefined
  return {
    requestId,
    streamId,
    status,
    ...(stringField(input.variationId) && { variationId: stringField(input.variationId) }),
    runtimeSessionId,
    agentJobId,
    workspaceRoot,
    ...(terminalEvent && { terminalEvent }),
    updatedAt,
  }
}

function recordOfStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item.length > 0) output[key] = item
  }
  return output
}

function recordOfStreams(value: unknown): Record<string, PersistedRuntimeStream> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const output: Record<string, PersistedRuntimeStream> = {}
  for (const [key, item] of Object.entries(value)) {
    const stream = normalizeStream(item)
    if (stream && stream.streamId === key) output[key] = stream
  }
  return output
}

function normalizeStream(value: unknown): PersistedRuntimeStream | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const streamId = stringField(input.streamId)
  const requestId = stringField(input.requestId)
  const userId = stringField(input.userId)
  const workspaceId = stringField(input.workspaceId)
  const sessionId = stringField(input.sessionId)
  const runtimeSessionId = stringField(input.runtimeSessionId)
  const agentJobId = stringField(input.agentJobId)
  const mode = streamMode(input.mode)
  const variationIndex = numberField(input.variationIndex)
  const memoryNamespace = stringField(input.memoryNamespace)
  const runtimeLaneId = stringField(input.runtimeLaneId)
  const runtimeBackendId = stringField(input.runtimeBackendId)
  const runtimeLeaseId = stringField(input.runtimeLeaseId)
  const workspaceRoot = stringField(input.workspaceRoot)
  if (!streamId || !runtimeSessionId || !agentJobId || !workspaceRoot) return null
  const variationId = stringField(input.variationId)
  const workspaceRootInput = stringField(input.workspaceRootInput)
  const prompt = stringField(input.prompt)
  const modelId = stringField(input.modelId)
  return {
    streamId,
    ...(requestId && { requestId }),
    ...(userId && { userId }),
    ...(workspaceId && { workspaceId }),
    ...(sessionId && { sessionId }),
    runtimeSessionId,
    agentJobId,
    ...(mode && { mode }),
    ...(variationIndex && { variationIndex }),
    ...(memoryNamespace && { memoryNamespace }),
    ...(runtimeLaneId && { runtimeLaneId }),
    ...(runtimeBackendId && { runtimeBackendId }),
    ...(runtimeLeaseId && { runtimeLeaseId }),
    ...(variationId && { variationId }),
    workspaceRoot,
    ...(workspaceRootInput && { workspaceRootInput }),
    ...(prompt && { prompt }),
    ...(modelId && { modelId }),
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function refineOperationStatus(value: unknown): PersistedRuntimeRefineOperation['status'] | undefined {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled'
    ? value
    : undefined
}

function streamMode(value: unknown): 'spawn' | 'refine' | undefined {
  return value === 'spawn' || value === 'refine' ? value : undefined
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
}
