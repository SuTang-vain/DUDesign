import assert from 'node:assert/strict'
import http from 'node:http'
import { afterEach, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import { HttpMcpExecutor } from './mcpExecutor.js'
import type { McpInvocationRequest } from '@dudesign/contracts'

describe('HttpMcpExecutor', () => {
  let server: http.Server | null = null

  afterEach(async () => {
    if (!server) return
    await new Promise<void>(resolve => server?.close(() => resolve()))
    server = null
  })

  it('posts a standard invocation envelope and normalizes a standard result', async () => {
    let received: unknown
    const baseUrl = await startServer(async (req, res) => {
      received = await readJson(req)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        result: {
          invocationId: request.invocationId,
          status: 'ok',
          mcpToolId: request.mcpToolId,
          source: {
            serverName: request.serverName,
            toolName: request.toolName,
            scopes: request.scopes,
          },
          summary: 'HTTP MCP executed.',
          references: [{ id: 'ref_1', title: 'Reference 1' }],
          completedAt: '2026-07-06T00:00:00.000Z',
        },
      }))
    })
    const executor = new HttpMcpExecutor({
      baseUrl,
      endpointPath: '/invoke',
      apiKey: 'test-key',
      authHeaderName: 'x-mcp-key',
    })

    const result = await executor.execute(request)

    assert.equal((received as { request?: { invocationId?: string } }).request?.invocationId, request.invocationId)
    assert.equal(result.status, 'ok')
    assert.equal(result.summary, 'HTTP MCP executed.')
  })

  it('normalizes HTTP failures into unavailable results', async () => {
    const baseUrl = await startServer(async (_req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('service down')
    })
    const executor = new HttpMcpExecutor({ baseUrl, endpointPath: '/invoke' })

    const result = await executor.execute(request)

    assert.equal(result.status, 'unavailable')
    assert.equal(result.error?.code, 'MCP_UNAVAILABLE')
    assert.match(result.error?.message ?? '', /500/)
  })

  it('normalizes endpoint paths without a leading slash', async () => {
    let requestedUrl = ''
    const baseUrl = await startServer(async (req, res) => {
      requestedUrl = req.url ?? ''
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        result: {
          invocationId: request.invocationId,
          status: 'ok',
          mcpToolId: request.mcpToolId,
          source: {
            serverName: request.serverName,
            toolName: request.toolName,
            scopes: request.scopes,
          },
          summary: 'HTTP MCP executed.',
          references: [],
          completedAt: '2026-07-06T00:00:00.000Z',
        },
      }))
    })
    const executor = new HttpMcpExecutor({ baseUrl, endpointPath: 'invoke' })

    const result = await executor.execute(request)

    assert.equal(result.status, 'ok')
    assert.equal(requestedUrl, '/invoke')
  })

  async function startServer(handler: http.RequestListener): Promise<string> {
    server = http.createServer(handler)
    await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}`
  }
})

const request: McpInvocationRequest = {
  invocationId: 'mcpinv_http_test',
  mode: 'authorized_invocation',
  userId: 'usr_dev',
  workspaceId: 'ws_dev',
  sessionId: 'sess_dev',
  jobId: 'job_dev',
  variationId: 'var_dev',
  runtimeSessionId: null,
  mcpToolId: 'mcp_accessibility_validate',
  serverName: 'quality-tools',
  toolName: 'validateAccessibility',
  scopes: ['validation_only'],
  input: { artifactId: 'art_1' },
  reason: 'Test HTTP MCP executor.',
  requestedAt: '2026-07-06T00:00:00.000Z',
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
