import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { createRuntimeAdapterServer } from './app.js'
import { NexusClient } from './nexusClient.js'
import { createRuntimeLaneRegistryFromConfigs } from './runtimeLane.js'

type FakeNexusBackend = {
  id: string
  workspaceRoot: string
  baseUrl: string
  sessionCwds: string[]
  executeCwds: string[]
  executeCount: number
  close: () => Promise<void>
}

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    await cleanup.pop()?.()
  }
})

describe('Runtime adapter multi-lane fake Nexus integration', () => {
  it('dispatches three variation streams across three HTTP Nexus lanes', async () => {
    const laneA = await startFakeNexusBackend('lane-a')
    const laneB = await startFakeNexusBackend('lane-b')
    const laneC = await startFakeNexusBackend('lane-c')
    const registry = createRuntimeLaneRegistryFromConfigs([
      { id: 'lane-a', backendId: 'backend-a', baseUrl: laneA.baseUrl, workspaceRoot: laneA.workspaceRoot, maxConcurrent: 1 },
      { id: 'lane-b', backendId: 'backend-b', baseUrl: laneB.baseUrl, workspaceRoot: laneB.workspaceRoot, maxConcurrent: 1 },
      { id: 'lane-c', backendId: 'backend-c', baseUrl: laneC.baseUrl, workspaceRoot: laneC.workspaceRoot, maxConcurrent: 1 },
    ], config => new NexusClient({ baseUrl: config.baseUrl }))
    const adapter = await startServer(createRuntimeAdapterServer({
      nexus: new NexusClient({ baseUrl: laneA.baseUrl }),
      runtimeLaneRegistry: registry,
    }))

    const spawned = await Promise.all([1, 2, 3].map(index => postJson<{
      streamId: string
      runtimeLaneId: string
      runtimeBackendId: string
    }>(adapter.baseUrl, '/v1/agents', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_multi_lane',
      jobId: 'job_multi_lane',
      prompt: `Build variation ${index}`,
      sourceMode: 'new_html',
      variationCount: 3,
      variationIndex: index,
      workspaceRoot: `workspaces/workspace_1/runtime-jobs/job_multi_lane/variation_${String(index).padStart(2, '0')}`,
      memoryNamespace: 'memory:user_1',
      templateRequirements: {},
    })))

    assert.deepEqual(spawned.map(item => item.runtimeLaneId).sort(), ['lane-a', 'lane-b', 'lane-c'])
    assert.deepEqual(spawned.map(item => item.runtimeBackendId).sort(), ['backend-a', 'backend-b', 'backend-c'])

    const streams = await Promise.all(spawned.map(item => getText(adapter.baseUrl, `/v1/stream?streamId=${item.streamId}`)))

    assert.equal(laneA.executeCount, 1)
    assert.equal(laneB.executeCount, 1)
    assert.equal(laneC.executeCount, 1)
    assert.equal(new Set([laneA.executeCwds[0], laneB.executeCwds[0], laneC.executeCwds[0]]).size, 3)
    assert.ok(streams.some(stream => stream.includes('Fake Nexus lane-a artifact')))
    assert.ok(streams.some(stream => stream.includes('Fake Nexus lane-b artifact')))
    assert.ok(streams.some(stream => stream.includes('Fake Nexus lane-c artifact')))
    assert.equal(registry.get('lane-a')?.inflight, 0)
    assert.equal(registry.get('lane-b')?.inflight, 0)
    assert.equal(registry.get('lane-c')?.inflight, 0)
  })

  it('keeps completed lanes usable when one fake Nexus lane fails', async () => {
    const laneA = await startFakeNexusBackend('lane-a')
    const laneB = await startFakeNexusBackend('lane-b', { executeStatus: 503 })
    const laneC = await startFakeNexusBackend('lane-c')
    const registry = createRuntimeLaneRegistryFromConfigs([
      { id: 'lane-a', backendId: 'backend-a', baseUrl: laneA.baseUrl, workspaceRoot: laneA.workspaceRoot, maxConcurrent: 1 },
      { id: 'lane-b', backendId: 'backend-b', baseUrl: laneB.baseUrl, workspaceRoot: laneB.workspaceRoot, maxConcurrent: 1 },
      { id: 'lane-c', backendId: 'backend-c', baseUrl: laneC.baseUrl, workspaceRoot: laneC.workspaceRoot, maxConcurrent: 1 },
    ], config => new NexusClient({ baseUrl: config.baseUrl }))
    const adapter = await startServer(createRuntimeAdapterServer({
      nexus: new NexusClient({ baseUrl: laneA.baseUrl }),
      runtimeLaneRegistry: registry,
      executeRetryAttempts: 0,
      laneRetryAttempts: 0,
    }))

    const spawned = await Promise.all([1, 2, 3].map(index => postJson<{
      streamId: string
      runtimeLaneId: string
    }>(adapter.baseUrl, '/v1/agents', {
      userId: 'user_1',
      workspaceId: 'workspace_1',
      sessionId: 'session_partial_lane',
      jobId: 'job_partial_lane',
      prompt: `Build partial variation ${index}`,
      sourceMode: 'new_html',
      variationCount: 3,
      variationIndex: index,
      workspaceRoot: `workspaces/workspace_1/runtime-jobs/job_partial_lane/variation_${String(index).padStart(2, '0')}`,
      memoryNamespace: 'memory:user_1',
      templateRequirements: {},
    })))

    const streams = await Promise.all(spawned.map(item => getText(adapter.baseUrl, `/v1/stream?streamId=${item.streamId}`)))
    const completed = streams.filter(stream => stream.includes('"type":"result"'))
    const failed = streams.filter(stream => stream.includes('"type":"error"'))

    assert.equal(completed.length, 2)
    assert.equal(failed.length, 1)
    assert.ok(streams.some(stream => stream.includes('Fake Nexus lane-a artifact')))
    assert.ok(streams.some(stream => stream.includes('Fake Nexus lane-c artifact')))
    assert.ok(failed[0]?.includes('ADAPTER_STREAM_FAILED'))
    assert.equal(registry.get('lane-a')?.inflight, 0)
    assert.equal(registry.get('lane-b')?.inflight, 0)
    assert.equal(registry.get('lane-c')?.inflight, 0)
  })
})

async function startFakeNexusBackend(id: string, options: { executeStatus?: number } = {}): Promise<FakeNexusBackend> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), `dudesign-fake-nexus-${id}-`))
  const sessionCwds: string[] = []
  const executeCwds: string[] = []
  let executeCount = 0
  let sessionSequence = 0
  const server = http.createServer((req, res) => {
    void handleFakeNexusRequest(req, res, {
      id,
      workspaceRoot,
      sessionCwds,
      executeCwds,
      executeCount: () => {
        executeCount += 1
        return executeCount
      },
      executeStatus: options.executeStatus,
    })
  })
  const harness = await startServer(server)
  return {
    id,
    workspaceRoot,
    baseUrl: harness.baseUrl,
    sessionCwds,
    executeCwds,
    get executeCount() {
      return executeCount
    },
    close: harness.close,
  }
}

async function handleFakeNexusRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  backend: {
    id: string
    workspaceRoot: string
    sessionCwds: string[]
    executeCwds: string[]
    executeCount: () => number
    executeStatus?: number
  },
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok', runtime: 'babel-o', version: 'fake' })
    return
  }
  if (req.method === 'GET' && url.pathname === '/v1/runtime/version') {
    sendJson(res, 200, { type: 'runtime_version', serverVersion: `fake-${backend.id}` })
    return
  }
  if (req.method === 'POST' && url.pathname === '/v1/sessions') {
    const body = await readJson(req)
    const cwd = stringField(body.cwd)
    if (cwd) backend.sessionCwds.push(cwd)
    sendJson(res, 201, {
      type: 'session_created',
      sessionId: `${backend.id}_session_${backend.sessionCwds.length}`,
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/v1/execute') {
    const body = await readJson(req)
    const cwd = stringField(body.cwd)
    if (!cwd) {
      sendJson(res, 400, { type: 'error', code: 'MISSING_CWD' })
      return
    }
    backend.executeCwds.push(cwd)
    backend.executeCount()
    if (backend.executeStatus) {
      sendJson(res, backend.executeStatus, { type: 'error', code: 'FAKE_NEXUS_FAILED' })
      return
    }
    await mkdir(cwd, { recursive: true })
    await writeFile(
      join(cwd, 'index.html'),
      `<!doctype html><html><body><h1>Fake Nexus ${backend.id} artifact</h1></body></html>`,
      'utf8',
    )
    sendJson(res, 200, {
      type: 'execute_result',
      sessionId: stringField(body.sessionId) ?? `${backend.id}_session`,
      success: true,
      events: [
        { type: 'assistant_delta', delta: `Generated from ${backend.id}` },
      ],
    })
    return
  }
  sendJson(res, 404, { type: 'error', code: 'NOT_FOUND' })
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}

async function startServer(server: http.Server): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const harness = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
  cleanup.push(harness.close)
  return harness
}

async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function getText(baseUrl: string, path: string): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`)
  assert.equal(response.ok, true, `${path} failed with ${response.status}`)
  return response.text()
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
