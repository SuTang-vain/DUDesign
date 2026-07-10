import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NexusClient } from './nexusClient.js'
import {
  createRuntimeLaneFromConfig,
  createRuntimeLaneRegistryFromConfigs,
  parseRuntimeLaneConfigsJson,
  RuntimeLaneRegistry,
} from './runtimeLane.js'

describe('Runtime lane registry', () => {
  it('requires at least one runtime lane', () => {
    assert.throws(() => new RuntimeLaneRegistry([]), /at least one runtime lane/)
  })

  it('rejects duplicate lane ids', () => {
    const nexus = mockNexus()
    const lane = createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000' }, nexus)

    assert.throws(() => new RuntimeLaneRegistry([lane, lane]), /Duplicate runtime lane id/)
  })

  it('creates a backwards-compatible single default lane', () => {
    const registry = RuntimeLaneRegistry.single(mockNexus())
    const lanes = registry.list()

    assert.equal(lanes.length, 1)
    assert.equal(lanes[0]?.id, 'default')
    assert.equal(lanes[0]?.provider, 'babel-o')
    assert.equal(lanes[0]?.maxConcurrent, 1)
    assert.equal(lanes[0]?.status, 'healthy')
  })

  it('acquires and releases lane leases', () => {
    const registry = RuntimeLaneRegistry.single(mockNexus(), { id: 'lane-a' })
    const lease = registry.acquire()

    assert.equal(lease.laneId, 'lane-a')
    assert.equal(registry.get('lane-a')?.inflight, 1)

    registry.release(lease)

    assert.equal(registry.get('lane-a')?.inflight, 0)
  })

  it('does not select unavailable or draining lanes', () => {
    const nexus = mockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000' }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', baseUrl: 'http://lane-b:3000' }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-c', baseUrl: 'http://lane-c:3000' }, nexus),
    ])

    registry.markStatus('lane-a', 'draining')
    registry.markStatus('lane-b', 'unavailable', 'RUNTIME_LANE_UNAVAILABLE')

    const lease = registry.acquire()

    assert.equal(lease.laneId, 'lane-c')
    assert.equal(registry.get('lane-b')?.lastErrorCode, 'RUNTIME_LANE_UNAVAILABLE')
  })

  it('selects the least loaded lane', () => {
    const nexus = mockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000', maxConcurrent: 2 }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', baseUrl: 'http://lane-b:3000', maxConcurrent: 2 }, nexus),
    ])
    const first = registry.acquire()
    const second = registry.acquire()

    assert.equal(first.laneId, 'lane-a')
    assert.equal(second.laneId, 'lane-b')
  })

  it('uses round-robin tie break when lanes have equal load', () => {
    const nexus = mockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000', maxConcurrent: 2 }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', baseUrl: 'http://lane-b:3000', maxConcurrent: 2 }, nexus),
    ])
    const first = registry.acquire()
    registry.release(first)
    const second = registry.acquire()

    assert.equal(first.laneId, 'lane-a')
    assert.equal(second.laneId, 'lane-b')
  })

  it('can acquire a preferred healthy lane for follow-up refine work', () => {
    const nexus = mockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000', maxConcurrent: 2 }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', baseUrl: 'http://lane-b:3000', maxConcurrent: 2 }, nexus),
    ])
    const lease = registry.acquire({ preferredLaneId: 'lane-b' })

    assert.equal(lease.laneId, 'lane-b')
    assert.equal(registry.get('lane-a')?.inflight, 0)
    assert.equal(registry.get('lane-b')?.inflight, 1)
  })

  it('rejects preferred lanes that are unavailable or at capacity', () => {
    const nexus = mockNexus()
    const registry = new RuntimeLaneRegistry([
      createRuntimeLaneFromConfig({ id: 'lane-a', baseUrl: 'http://lane-a:3000', maxConcurrent: 1 }, nexus),
      createRuntimeLaneFromConfig({ id: 'lane-b', baseUrl: 'http://lane-b:3000', maxConcurrent: 1 }, nexus),
    ])

    registry.markStatus('lane-b', 'draining')
    assert.throws(() => registry.acquire({ preferredLaneId: 'lane-b' }), /No runtime lane is available/)

    registry.markStatus('lane-b', 'healthy')
    const lease = registry.acquire({ preferredLaneId: 'lane-b' })
    assert.equal(lease.laneId, 'lane-b')
    assert.throws(() => registry.acquire({ preferredLaneId: 'lane-b' }), /No runtime lane is available/)
  })

  it('normalizes lane config defaults', () => {
    const lane = createRuntimeLaneFromConfig({
      id: ' lane-a ',
      baseUrl: 'http://lane-a:3000/',
      maxConcurrent: 0,
      weight: -1,
      contractVersion: '2026-06-26.dudesign-runtime.v1',
    }, mockNexus())

    assert.equal(lane.id, 'lane-a')
    assert.equal(lane.baseUrl, 'http://lane-a:3000')
    assert.equal(lane.maxConcurrent, 1)
    assert.equal(lane.weight, 1)
    assert.equal(lane.contractVersion, '2026-06-26.dudesign-runtime.v1')
  })

  it('parses static lane configs from JSON', () => {
    const configs = parseRuntimeLaneConfigsJson(JSON.stringify([
      {
        id: ' lane-a ',
        backendId: ' backend-a ',
        provider: 'babel-o',
        baseUrl: 'http://lane-a:3000/',
        workspaceRoot: ' /workspace/lane-a ',
        maxConcurrent: 2,
        weight: 3,
        contractVersion: '2026-06-26.dudesign-runtime.v1',
      },
    ]))

    assert.equal(configs?.length, 1)
    assert.equal(configs?.[0]?.id, 'lane-a')
    assert.equal(configs?.[0]?.backendId, 'backend-a')
    assert.equal(configs?.[0]?.baseUrl, 'http://lane-a:3000/')
    assert.equal(configs?.[0]?.workspaceRoot, '/workspace/lane-a')
    assert.equal(configs?.[0]?.maxConcurrent, 2)
    assert.equal(configs?.[0]?.weight, 3)
  })

  it('rejects invalid lane config JSON', () => {
    assert.throws(() => parseRuntimeLaneConfigsJson('{not-json'), /not valid JSON/)
    assert.throws(() => parseRuntimeLaneConfigsJson('{}'), /must be a JSON array/)
    assert.throws(() => parseRuntimeLaneConfigsJson('[{"id":"lane-a"}]'), /requires baseUrl/)
    assert.throws(() => parseRuntimeLaneConfigsJson('[{"id":"lane-a","baseUrl":"http:\/\/lane-a","provider":"other"}]'), /unsupported provider/)
  })

  it('creates a registry from static lane configs', () => {
    const configs = parseRuntimeLaneConfigsJson(JSON.stringify([
      { id: 'lane-a', backendId: 'backend-a', baseUrl: 'http://lane-a:3000' },
      { id: 'lane-b', baseUrl: 'http://lane-b:3000', maxConcurrent: 2 },
    ]))
    assert.ok(configs)
    const registry = createRuntimeLaneRegistryFromConfigs(configs, config => mockNexus(config.baseUrl))

    assert.equal(registry.list().length, 2)
    assert.equal(registry.primary().id, 'lane-a')
    assert.equal(registry.primary().backendId, 'backend-a')
    assert.equal(registry.get('lane-b')?.maxConcurrent, 2)
  })
})

function mockNexus(baseUrl = 'https://nexus.example.test'): NexusClient {
  return new NexusClient({
    baseUrl,
    fetch: async () => new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    }),
  })
}
