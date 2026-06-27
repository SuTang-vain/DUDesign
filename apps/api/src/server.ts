import http from 'node:http'
import { pathToFileURL, URL } from 'node:url'
import type { DesignEvent } from '@dudesign/contracts'
import { ApplicationService, type HttpError } from './service.js'
import { createApplicationServiceFromEnv } from './serviceFactory.js'
import { createRequestContext, type RequestContext } from './auth.js'

const defaultPort = Number(process.env.PORT ?? 4000)
const defaultHost = process.env.HOST ?? '127.0.0.1'

export function createApiServer(service = new ApplicationService()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      await handleRequest(req, res, service)
    } catch (error) {
      sendError(res, error)
    }
  })
}

export async function startApiServer(options: {
  service?: ApplicationService
  port?: number
  host?: string
} = {}): Promise<http.Server> {
  const port = options.port ?? defaultPort
  const host = options.host ?? defaultHost
  const service = options.service ?? await createApplicationServiceFromEnv()
  const server = createApiServer(service)
  server.listen(port, host, () => {
    console.log(`DUDesign API listening on http://${host}:${port}`)
  })
  return server
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, service: ApplicationService): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${defaultHost}:${defaultPort}`}`)
  const method = req.method ?? 'GET'

  if (method === 'OPTIONS') {
    sendCorsPreflight(res)
    return
  }
  const ctx = createRequestContext(req.headers)
  res.setHeader('x-request-id', ctx.requestId)

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, requestId: ctx.requestId })
    return
  }

  if (method === 'GET' && url.pathname === '/api/dev/bootstrap') {
    sendJson(res, 200, await service.getBootstrap(ctx))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/runtime/health') {
    sendJson(res, 200, await service.getAdminRuntimeHealth(ctx))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/audit-logs') {
    sendJson(res, 200, await service.listAuditLogs(ctx))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/jobs') {
    sendJson(res, 200, await service.listAdminJobs(ctx, {
      status: url.searchParams.get('status'),
      userId: url.searchParams.get('userId'),
    }))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/artifacts') {
    sendJson(res, 200, await service.listAdminArtifacts(ctx, {
      jobId: url.searchParams.get('jobId'),
      variationId: url.searchParams.get('variationId'),
      kind: url.searchParams.get('kind'),
    }))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/support/users') {
    sendJson(res, 200, await service.getAdminUserSupport(ctx, {
      userId: url.searchParams.get('userId'),
      email: url.searchParams.get('email'),
    }))
    return
  }

  if (method === 'GET' && url.pathname === '/api/admin/costs/summary') {
    sendJson(res, 200, await service.getAdminCostSummary(ctx))
    return
  }

  if (method === 'POST' && url.pathname === '/api/sessions') {
    sendJson(res, 201, await service.createSession(ctx, await readJson(req)))
    return
  }

  if (method === 'GET' && url.pathname === '/api/sessions') {
    sendJson(res, 200, await service.listSessions(ctx))
    return
  }

  const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume$/)
  if (method === 'POST' && resumeMatch) {
    sendJson(res, 200, await service.resumeSession(ctx, decodeURIComponent(resumeMatch[1]!)))
    return
  }

  if (method === 'POST' && url.pathname === '/api/design-jobs') {
    sendJson(res, 201, await service.createDesignJob(ctx, await readJson(req)))
    return
  }

  const jobStreamMatch = url.pathname.match(/^\/api\/design-jobs\/([^/]+)\/stream$/)
  if (method === 'GET' && jobStreamMatch) {
    await streamJobEvents(res, service, ctx, decodeURIComponent(jobStreamMatch[1]!))
    return
  }

  const adminJobCancelMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/cancel$/)
  if (method === 'POST' && adminJobCancelMatch) {
    sendJson(res, 200, await service.cancelJobAsAdmin(ctx, decodeURIComponent(adminJobCancelMatch[1]!), await readJson(req)))
    return
  }

  const adminJobRetryMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/retry$/)
  if (method === 'POST' && adminJobRetryMatch) {
    sendJson(res, 200, await service.retryJobAsAdmin(ctx, decodeURIComponent(adminJobRetryMatch[1]!), await readJson(req)))
    return
  }

  const variationPreviewMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/preview$/)
  if (method === 'GET' && variationPreviewMatch) {
    sendHtml(res, 200, await service.getVariationPreview(ctx, decodeURIComponent(variationPreviewMatch[1]!)))
    return
  }

  const variationAssetMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/assets\/(.+)$/)
  if (method === 'GET' && variationAssetMatch) {
    const asset = await service.getVariationAsset(
      ctx,
      decodeURIComponent(variationAssetMatch[1]!),
      decodeURIComponent(variationAssetMatch[2]!),
    )
    sendAsset(res, 200, asset)
    return
  }

  const variationRefineMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/refine$/)
  if (method === 'POST' && variationRefineMatch) {
    sendJson(res, 200, await service.refineVariation(ctx, decodeURIComponent(variationRefineMatch[1]!), await readJson(req)))
    return
  }

  const variationAnnotationMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/annotations$/)
  if (method === 'POST' && variationAnnotationMatch) {
    sendJson(res, 200, await service.annotateVariation(ctx, decodeURIComponent(variationAnnotationMatch[1]!), await readJson(req)))
    return
  }

  const variationExportMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/export$/)
  if (method === 'POST' && variationExportMatch) {
    sendJson(res, 200, await service.exportVariation(ctx, decodeURIComponent(variationExportMatch[1]!)))
    return
  }

  const artifactDownloadMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/download$/)
  if (method === 'GET' && artifactDownloadMatch) {
    const download = await service.downloadArtifact(ctx, decodeURIComponent(artifactDownloadMatch[1]!))
    sendDownload(res, 200, download)
    return
  }

  const variationShareMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/share$/)
  if (method === 'POST' && variationShareMatch) {
    sendJson(res, 200, await service.shareVariation(ctx, decodeURIComponent(variationShareMatch[1]!), await readJson(req)))
    return
  }

  const shareRevokeMatch = url.pathname.match(/^\/api\/shares\/([^/]+)\/revoke$/)
  if (method === 'POST' && shareRevokeMatch) {
    sendJson(res, 200, await service.revokeShare(ctx, decodeURIComponent(shareRevokeMatch[1]!)))
    return
  }

  const shareAssetMatch = url.pathname.match(/^\/api\/shares\/([^/]+)\/assets\/(.+)$/)
  if (method === 'GET' && shareAssetMatch) {
    const asset = await service.getSharedVariationAsset(
      decodeURIComponent(shareAssetMatch[1]!),
      decodeURIComponent(shareAssetMatch[2]!),
    )
    sendAsset(res, 200, asset, 'public, max-age=300')
    return
  }

  const shareMatch = url.pathname.match(/^\/api\/shares\/([^/]+)$/)
  if (method === 'GET' && shareMatch) {
    sendJson(res, 200, await service.getSharedVariation(decodeURIComponent(shareMatch[1]!)))
    return
  }

  const variationMatch = url.pathname.match(/^\/api\/variations\/([^/]+)$/)
  if (method === 'GET' && variationMatch) {
    sendJson(res, 200, await service.getVariationDetail(ctx, decodeURIComponent(variationMatch[1]!)))
    return
  }

  const jobMatch = url.pathname.match(/^\/api\/design-jobs\/([^/]+)$/)
  if (method === 'GET' && jobMatch) {
    sendJson(res, 200, await service.getDesignJob(ctx, decodeURIComponent(jobMatch[1]!)))
    return
  }

  sendJson(res, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `${method} ${url.pathname} not found.`,
    },
  })
}

async function streamJobEvents(res: http.ServerResponse, service: ApplicationService, ctx: RequestContext, jobId: string): Promise<void> {
  try {
    await service.getDesignJob(ctx, jobId)
  } catch (error) {
    sendJson(res, 404, {
      error: {
        code: (error as Partial<HttpError>).code ?? 'JOB_NOT_FOUND',
        message: error instanceof Error ? error.message : `Design job not found: ${jobId}`,
      },
    })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'access-control-allow-origin': '*',
  })

  const replayedEvents = service.events.replay(jobId)
  for (const event of replayedEvents) {
    writeSse(res, event)
  }

  if (replayedEvents.some(event => event.type === 'design.job_completed')) {
    res.end()
    return
  }

  const unsubscribe = service.events.subscribe(jobId, event => {
    writeSse(res, event)
    if (event.type === 'design.job_completed') {
      res.end()
      unsubscribe()
    }
  })

  res.on('close', unsubscribe)
}

function writeSse(res: http.ServerResponse, event: DesignEvent): void {
  res.write(`event: ${event.type}\n`)
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(payload, null, 2))
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-security-policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self' data: https:; font-src 'self' data:; frame-ancestors 'self'",
  })
  res.end(html)
}

function sendAsset(
  res: http.ServerResponse,
  status: number,
  asset: { contentType: string; body: Uint8Array },
  cacheControl = 'private, max-age=60',
): void {
  res.writeHead(status, {
    'content-type': asset.contentType,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': cacheControl,
  })
  res.end(Buffer.from(asset.body))
}

function sendDownload(
  res: http.ServerResponse,
  status: number,
  download: { filename: string; contentType: string; body: Uint8Array },
): void {
  res.writeHead(status, {
    'content-type': download.contentType,
    'content-disposition': `attachment; filename="${download.filename.replaceAll(/["\\\r\n]/g, '_')}"`,
    'content-length': String(download.body.byteLength),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'private, max-age=60',
  })
  res.end(Buffer.from(download.body))
}

function sendCorsPreflight(res: http.ServerResponse): void {
  res.writeHead(204, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
  })
  res.end()
}

function sendError(res: http.ServerResponse, error: unknown): void {
  const err = error as Partial<HttpError>
  const status = typeof err.status === 'number' ? err.status : 500
  sendJson(res, status, {
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startApiServer()
}
