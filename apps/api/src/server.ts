import http from 'node:http'
import { pathToFileURL, URL } from 'node:url'
import type { DesignEvent } from '@dudesign/contracts'
import { ApplicationService, type HttpError } from './service.js'

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

export function startApiServer(options: {
  service?: ApplicationService
  port?: number
  host?: string
} = {}): http.Server {
  const port = options.port ?? defaultPort
  const host = options.host ?? defaultHost
  const server = createApiServer(options.service)
  server.listen(port, host, () => {
    console.log(`DUDesign API listening on http://${host}:${port}`)
  })
  return server
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse, service: ApplicationService): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${defaultHost}:${defaultPort}`}`)
  const method = req.method ?? 'GET'

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (method === 'GET' && url.pathname === '/api/dev/bootstrap') {
    sendJson(res, 200, {
      user: service.store.devUser,
      workspace: service.store.devWorkspace,
    })
    return
  }

  if (method === 'POST' && url.pathname === '/api/sessions') {
    sendJson(res, 201, await service.createSession(await readJson(req)))
    return
  }

  if (method === 'GET' && url.pathname === '/api/sessions') {
    sendJson(res, 200, service.listSessions())
    return
  }

  const resumeMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/resume$/)
  if (method === 'POST' && resumeMatch) {
    sendJson(res, 200, await service.resumeSession(decodeURIComponent(resumeMatch[1]!)))
    return
  }

  if (method === 'POST' && url.pathname === '/api/design-jobs') {
    sendJson(res, 201, await service.createDesignJob(await readJson(req)))
    return
  }

  const jobStreamMatch = url.pathname.match(/^\/api\/design-jobs\/([^/]+)\/stream$/)
  if (method === 'GET' && jobStreamMatch) {
    streamJobEvents(res, service, decodeURIComponent(jobStreamMatch[1]!))
    return
  }

  const variationPreviewMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/preview$/)
  if (method === 'GET' && variationPreviewMatch) {
    sendHtml(res, 200, service.getVariationPreview(decodeURIComponent(variationPreviewMatch[1]!)))
    return
  }

  const variationRefineMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/refine$/)
  if (method === 'POST' && variationRefineMatch) {
    sendJson(res, 200, await service.refineVariation(decodeURIComponent(variationRefineMatch[1]!), await readJson(req)))
    return
  }

  const variationAnnotationMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/annotations$/)
  if (method === 'POST' && variationAnnotationMatch) {
    sendJson(res, 200, await service.annotateVariation(decodeURIComponent(variationAnnotationMatch[1]!), await readJson(req)))
    return
  }

  const variationExportMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/export$/)
  if (method === 'POST' && variationExportMatch) {
    sendJson(res, 200, service.exportVariation(decodeURIComponent(variationExportMatch[1]!)))
    return
  }

  const variationShareMatch = url.pathname.match(/^\/api\/variations\/([^/]+)\/share$/)
  if (method === 'POST' && variationShareMatch) {
    sendJson(res, 200, service.shareVariation(decodeURIComponent(variationShareMatch[1]!), await readJson(req)))
    return
  }

  const shareMatch = url.pathname.match(/^\/api\/shares\/([^/]+)$/)
  if (method === 'GET' && shareMatch) {
    sendJson(res, 200, service.getSharedVariation(decodeURIComponent(shareMatch[1]!)))
    return
  }

  const variationMatch = url.pathname.match(/^\/api\/variations\/([^/]+)$/)
  if (method === 'GET' && variationMatch) {
    sendJson(res, 200, service.getVariationDetail(decodeURIComponent(variationMatch[1]!)))
    return
  }

  const jobMatch = url.pathname.match(/^\/api\/design-jobs\/([^/]+)$/)
  if (method === 'GET' && jobMatch) {
    sendJson(res, 200, service.getDesignJob(decodeURIComponent(jobMatch[1]!)))
    return
  }

  sendJson(res, 404, {
    error: {
      code: 'NOT_FOUND',
      message: `${method} ${url.pathname} not found.`,
    },
  })
}

function streamJobEvents(res: http.ServerResponse, service: ApplicationService, jobId: string): void {
  if (!service.store.jobs.has(jobId)) {
    sendJson(res, 404, {
      error: {
        code: 'JOB_NOT_FOUND',
        message: `Design job not found: ${jobId}`,
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
  })
  res.end(JSON.stringify(payload, null, 2))
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'access-control-allow-origin': '*',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src data: https:; frame-ancestors 'self'",
  })
  res.end(html)
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
  startApiServer()
}
