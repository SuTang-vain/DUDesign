import { NexusClient } from './nexusClient.js'

export type RuntimeLaneStatus = 'healthy' | 'degraded' | 'unavailable' | 'contract_mismatch' | 'draining'

export type RuntimeLane = {
  id: string
  backendId: string
  provider: 'babel-o'
  nexus: NexusClient
  baseUrl: string
  workspaceRoot?: string
  maxConcurrent: number
  weight: number
  status: RuntimeLaneStatus
  contractVersion?: string
  inflight: number
  lastHealthAt?: string
  lastErrorCode?: string
}

export type RuntimeLaneLease = {
  leaseId: string
  laneId: string
  acquiredAt: string
}

export type RuntimeLaneConfig = {
  id: string
  backendId?: string
  provider?: 'babel-o'
  baseUrl: string
  workspaceRoot?: string
  maxConcurrent?: number
  weight?: number
  contractVersion?: string
}

export type RuntimeLaneNexusFactory = (config: RuntimeLaneConfig) => NexusClient

export class RuntimeLaneRegistry {
  private readonly lanes = new Map<string, RuntimeLane>()
  private leaseSequence = 1
  private selectionCursor = 0

  constructor(lanes: RuntimeLane[]) {
    if (lanes.length === 0) {
      throw new Error('RuntimeLaneRegistry requires at least one runtime lane.')
    }
    for (const lane of lanes) {
      if (this.lanes.has(lane.id)) {
        throw new Error(`Duplicate runtime lane id: ${lane.id}`)
      }
      this.lanes.set(lane.id, { ...lane })
    }
  }

  static single(nexus: NexusClient, options: {
    id?: string
    baseUrl?: string
    workspaceRoot?: string
    contractVersion?: string
    maxConcurrent?: number
  } = {}): RuntimeLaneRegistry {
    return new RuntimeLaneRegistry([{
      id: normalizeLaneId(options.id) ?? 'default',
      backendId: normalizeLaneId(options.id) ?? 'default',
      provider: 'babel-o',
      nexus,
      baseUrl: options.baseUrl ?? 'internal',
      ...(options.workspaceRoot && { workspaceRoot: options.workspaceRoot }),
      maxConcurrent: positiveInteger(options.maxConcurrent, 1),
      weight: 1,
      status: 'healthy',
      ...(options.contractVersion && { contractVersion: options.contractVersion }),
      inflight: 0,
    }])
  }

  list(): RuntimeLane[] {
    return Array.from(this.lanes.values()).map(lane => ({ ...lane }))
  }

  primary(): RuntimeLane {
    const lane = this.lanes.values().next().value as RuntimeLane | undefined
    if (!lane) {
      throw new Error('RuntimeLaneRegistry has no runtime lanes.')
    }
    return lane
  }

  get(laneId: string): RuntimeLane | undefined {
    const lane = this.lanes.get(laneId)
    return lane ? { ...lane } : undefined
  }

  plan(options: { excludeLaneIds?: string[]; preferredLaneId?: string; allowDrainingPreferred?: boolean } = {}): RuntimeLane | undefined {
    return options.preferredLaneId
      ? this.selectPreferredLane(options.preferredLaneId, new Set(options.excludeLaneIds ?? []), {
        ignoreCapacity: true,
        allowDraining: Boolean(options.allowDrainingPreferred),
      })
      : this.selectLane(new Set(options.excludeLaneIds ?? []), { ignoreCapacity: true })
  }

  acquire(options: { excludeLaneIds?: string[]; preferredLaneId?: string; allowDrainingPreferred?: boolean } = {}): RuntimeLaneLease {
    const lane = options.preferredLaneId
      ? this.selectPreferredLane(options.preferredLaneId, new Set(options.excludeLaneIds ?? []), {
        allowDraining: Boolean(options.allowDrainingPreferred),
      })
      : this.selectLane(new Set(options.excludeLaneIds ?? []))
    if (!lane) {
      throw new Error('No runtime lane is available.')
    }
    lane.inflight += 1
    const lease = {
      leaseId: `lease_${this.leaseSequence}`,
      laneId: lane.id,
      acquiredAt: new Date().toISOString(),
    }
    this.leaseSequence += 1
    return lease
  }

  release(lease: RuntimeLaneLease): void {
    const lane = this.lanes.get(lease.laneId)
    if (!lane) return
    lane.inflight = Math.max(0, lane.inflight - 1)
  }

  markStatus(laneId: string, status: RuntimeLaneStatus, errorCode?: string): void {
    const lane = this.lanes.get(laneId)
    if (!lane) {
      throw new Error(`Unknown runtime lane: ${laneId}`)
    }
    lane.status = status
    lane.lastHealthAt = new Date().toISOString()
    if (errorCode) lane.lastErrorCode = errorCode
  }

  private selectPreferredLane(
    laneId: string,
    excludeLaneIds: Set<string>,
    options: { ignoreCapacity?: boolean; allowDraining?: boolean } = {},
  ): RuntimeLane | undefined {
    const lane = this.lanes.get(laneId)
    if (!lane || excludeLaneIds.has(lane.id)) return undefined
    if (lane.status !== 'healthy' && lane.status !== 'degraded' && !(options.allowDraining && lane.status === 'draining')) return undefined
    if (!options.ignoreCapacity && lane.inflight >= lane.maxConcurrent) return undefined
    return lane
  }

  private selectLane(excludeLaneIds: Set<string> = new Set(), options: { ignoreCapacity?: boolean } = {}): RuntimeLane | undefined {
    const lanes = Array.from(this.lanes.values())
    const candidates = lanes
      .filter(lane => !excludeLaneIds.has(lane.id))
      .filter(lane => lane.status === 'healthy' || lane.status === 'degraded')
      .filter(lane => options.ignoreCapacity || lane.inflight < lane.maxConcurrent)
    if (candidates.length === 0) return undefined
    const lowestInflight = Math.min(...candidates.map(lane => lane.inflight))
    const leastLoaded = candidates.filter(lane => lane.inflight === lowestInflight)
    const highestWeight = Math.max(...leastLoaded.map(lane => lane.weight))
    const weighted = leastLoaded.filter(lane => lane.weight === highestWeight)
    const rotated = [...lanes.slice(this.selectionCursor), ...lanes.slice(0, this.selectionCursor)]
    const selected = rotated.find(lane => weighted.includes(lane)) ?? weighted[0]
    if (!selected) return undefined
    this.selectionCursor = (lanes.findIndex(lane => lane.id === selected.id) + 1) % lanes.length
    return selected
  }
}

export function createRuntimeLaneRegistryFromConfigs(
  configs: RuntimeLaneConfig[],
  createNexus: RuntimeLaneNexusFactory,
): RuntimeLaneRegistry {
  if (configs.length === 0) {
    throw new Error('Runtime lane config must contain at least one lane.')
  }
  return new RuntimeLaneRegistry(configs.map(config => createRuntimeLaneFromConfig(config, createNexus(config))))
}

export function parseRuntimeLaneConfigsJson(value: string | undefined): RuntimeLaneConfig[] | undefined {
  if (!value || value.trim().length === 0) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    throw new Error(`DUDESIGN_RUNTIME_LANES_JSON is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('DUDESIGN_RUNTIME_LANES_JSON must be a JSON array.')
  }
  return parsed.map((item, index) => runtimeLaneConfigFromUnknown(item, index))
}

export function createRuntimeLaneFromConfig(config: RuntimeLaneConfig, nexus: NexusClient): RuntimeLane {
  const id = normalizeLaneId(config.id)
  if (!id) {
    throw new Error('Runtime lane id is required.')
  }
  if (!config.baseUrl || config.baseUrl.trim().length === 0) {
    throw new Error(`Runtime lane ${id} requires baseUrl.`)
  }
  return {
    id,
    backendId: normalizeLaneId(config.backendId) ?? id,
    provider: config.provider ?? 'babel-o',
    nexus,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
    ...(config.workspaceRoot && { workspaceRoot: config.workspaceRoot }),
    maxConcurrent: positiveInteger(config.maxConcurrent, 1),
    weight: positiveInteger(config.weight, 1),
    status: 'healthy',
    ...(config.contractVersion && { contractVersion: config.contractVersion }),
    inflight: 0,
  }
}

function runtimeLaneConfigFromUnknown(value: unknown, index: number): RuntimeLaneConfig {
  if (!value || typeof value !== 'object') {
    throw new Error(`Runtime lane config at index ${index} must be an object.`)
  }
  const record = value as Record<string, unknown>
  const id = normalizeLaneId(record.id)
  const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : undefined
  if (!id) {
    throw new Error(`Runtime lane config at index ${index} requires id.`)
  }
  if (!baseUrl) {
    throw new Error(`Runtime lane config ${id} requires baseUrl.`)
  }
  const provider = record.provider === undefined ? undefined : record.provider
  if (provider !== undefined && provider !== 'babel-o') {
    throw new Error(`Runtime lane config ${id} has unsupported provider: ${String(provider)}`)
  }
  return {
    id,
    ...(typeof record.backendId === 'string' && record.backendId.trim().length > 0 && { backendId: record.backendId.trim() }),
    ...(provider && { provider }),
    baseUrl,
    ...(typeof record.workspaceRoot === 'string' && record.workspaceRoot.trim().length > 0 && { workspaceRoot: record.workspaceRoot.trim() }),
    ...(typeof record.maxConcurrent === 'number' && { maxConcurrent: record.maxConcurrent }),
    ...(typeof record.weight === 'number' && { weight: record.weight }),
    ...(typeof record.contractVersion === 'string' && record.contractVersion.trim().length > 0 && { contractVersion: record.contractVersion.trim() }),
  }
}

function normalizeLaneId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}
