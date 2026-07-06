import assert from 'node:assert/strict'
import http from 'node:http'
import { afterEach, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import { HttpMcpExecutor, MockMcpExecutor } from './mcpExecutor.js'
import type { ImageGenerationArtifact, McpInvocationRequest, ResearchContextArtifact } from '@dudesign/contracts'

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

describe('MockMcpExecutor', () => {
  it('normalizes Agent-Reach search into a reviewed research context artifact', async () => {
    const executor = new MockMcpExecutor()

    const result = await executor.execute({
      ...request,
      invocationId: 'mcpinv_research_test',
      mcpToolId: 'mcp_agent_reach_search',
      serverName: 'agent-reach',
      toolName: 'search',
      scopes: ['readonly_context'],
      input: { query: 'dynamic encyclopedia card interaction patterns' },
      reason: 'Gather reviewed context for a design brief.',
    })

    const researchContext = result.data?.researchContext as ResearchContextArtifact | undefined
    assert.equal(result.status, 'ok')
    assert.equal(result.source.serverName, 'agent-reach')
    assert.equal(result.references.length, 1)
    assert.equal(researchContext?.schemaVersion, '2026-07-06.dudesign-research-context.v1')
    assert.equal(researchContext?.query, 'dynamic encyclopedia card interaction patterns')
    assert.equal(researchContext?.reviewStatus, 'auto_reviewed')
    assert.equal(researchContext?.sources[0]?.retrievedAt, result.completedAt)
    assert.match(researchContext?.rawPayloadHash ?? '', /^[a-f0-9]{64}$/)
  })

  it('normalizes image generation into a reviewed image artifact payload', async () => {
    const executor = new MockMcpExecutor()

    const result = await executor.execute({
      ...request,
      invocationId: 'mcpinv_image_test',
      mcpToolId: 'mcp_image_generation_ark_seedream',
      serverName: 'image-generation',
      toolName: 'generateArkSeedreamImage',
      scopes: ['artifact_write', 'readonly_context'],
      input: {
        prompt: 'Original blue abstract knowledge-card illustration with soft geometric depth.',
        model: 'doubao-seedream-5-0-260128',
        size: '2K',
        watermark: true,
        usageContext: 'dynamic_encyclopedia_card',
        contentSafety: { policy: 'strict', allowBrandReference: false },
      },
      reason: 'Generate a reviewed card illustration asset.',
    })

    const imageGeneration = result.data?.imageGeneration as ImageGenerationArtifact | undefined
    assert.equal(result.status, 'ok')
    assert.equal(result.source.serverName, 'image-generation')
    assert.equal(result.references.length, 1)
    assert.equal(imageGeneration?.schemaVersion, '2026-07-06.dudesign-image-generation-artifact.v1')
    assert.equal(imageGeneration?.provider, 'mock')
    assert.equal(imageGeneration?.usageContext, 'dynamic_encyclopedia_card')
    assert.equal(imageGeneration?.contentSafety.status, 'passed')
    assert.equal(imageGeneration?.contentSafety.policy, 'strict')
    assert.equal(imageGeneration?.costCents, 12)
    assert.match(imageGeneration?.promptHash ?? '', /^[a-f0-9]{64}$/)
  })

  it('blocks unsafe image generation requests before artifact use', async () => {
    const executor = new MockMcpExecutor()

    const result = await executor.execute({
      ...request,
      invocationId: 'mcpinv_image_blocked_test',
      mcpToolId: 'mcp_image_generation_ark_seedream',
      serverName: 'image-generation',
      toolName: 'generateArkSeedreamImage',
      scopes: ['artifact_write', 'readonly_context'],
      input: {
        prompt: 'Exact brand trade dress with logo and copyrighted character.',
        usageContext: 'template_hero',
        contentSafety: { policy: 'strict', allowBrandReference: false },
      },
      reason: 'Validate image safety blocking.',
    })

    const imageGeneration = result.data?.imageGeneration as ImageGenerationArtifact | undefined
    assert.equal(result.status, 'error')
    assert.equal(result.error?.code, 'IMAGE_CONTENT_SAFETY_BLOCKED')
    assert.equal(imageGeneration?.contentSafety.status, 'blocked')
    assert.equal(imageGeneration?.artifactId, null)
    assert.equal(result.references.length, 0)
  })
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
