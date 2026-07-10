import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type PersistedRuntimeStream = {
  streamId: string
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

export type RuntimeAdapterStateSnapshot = {
  version: 1
  sessions: Record<string, string>
  streams: Record<string, PersistedRuntimeStream>
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
    sequence: 1,
    updatedAt: new Date(0).toISOString(),
  }
}

function normalizeSnapshot(value: unknown): RuntimeAdapterStateSnapshot {
  if (!value || typeof value !== 'object') return emptySnapshot()
  const input = value as Record<string, unknown>
  const sessions = recordOfStrings(input.sessions)
  const streams = recordOfStreams(input.streams)
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
    sequence,
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

function streamMode(value: unknown): 'spawn' | 'refine' | undefined {
  return value === 'spawn' || value === 'refine' ? value : undefined
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT'
}
