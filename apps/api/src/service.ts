import type {
  CreateDesignJobRequest,
  CreateAnnotationBatchRequest,
  CreateSessionRequest,
  DesignEvent,
  RefineVariationRequest,
  ShareVariationRequest,
  AnnotationShape,
} from '@dudesign/contracts'
import { MockRuntimeGateway, type RuntimeGateway } from '@dudesign/runtime-gateway'
import type { DesignVariationStatus } from '@dudesign/domain'
import { JobEventBus } from './eventBus.js'
import { InMemoryStore } from './store.js'

export class ApplicationService {
  readonly store: InMemoryStore
  readonly events: JobEventBus
  readonly runtime: RuntimeGateway

  constructor(options: {
    store?: InMemoryStore
    events?: JobEventBus
    runtime?: RuntimeGateway
  } = {}) {
    this.store = options.store ?? new InMemoryStore()
    this.events = options.events ?? new JobEventBus()
    this.runtime = options.runtime ?? new MockRuntimeGateway()
  }

  async createSession(input: CreateSessionRequest) {
    const workspace = this.store.workspaces.get(input.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${input.workspaceId}`)
    const session = this.store.createSession(input)
    const runtime = await this.runtime.createSession({
      userId: this.store.devUser.id,
      workspaceId: workspace.id,
      sessionId: session.id,
      workspaceRoot: workspace.storageKey,
      memoryNamespace: this.store.devUser.memoryNamespace,
    })
    const updated = {
      ...session,
      runtimeSessionId: runtime.runtimeSessionId,
      updatedAt: new Date().toISOString(),
    }
    this.store.sessions.set(session.id, updated)
    return {
      session: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        runtimeSessionId: updated.runtimeSessionId,
        status: updated.status,
      },
    }
  }

  listSessions() {
    return {
      sessions: this.store.listSessions(),
    }
  }

  async resumeSession(sessionId: string) {
    const snapshot = this.store.getSessionSnapshot(sessionId)
    if (!snapshot) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
    const workspace = this.store.workspaces.get(snapshot.session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${snapshot.session.workspaceId}`)
    const runtime = await this.runtime.resumeSession({
      userId: snapshot.session.userId,
      sessionId: snapshot.session.id,
      runtimeSessionId: snapshot.session.runtimeSessionId,
      workspaceRoot: workspace.storageKey,
    })
    return {
      ...snapshot,
      runtime,
    }
  }

  async createDesignJob(input: CreateDesignJobRequest) {
    validateVariationCount(input.variationCount)
    const session = this.store.sessions.get(input.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${input.sessionId}`)
    const workspace = this.store.workspaces.get(session.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${session.workspaceId}`)
    this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId ?? null,
        variationCount: input.variationCount,
      },
    })
    const job = this.store.createJob({
      session,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      variationCount: input.variationCount,
      templateRequirements: input.templateRequirements ?? {},
    })
    const variations = this.store.createVariations({ job, count: input.variationCount })

    void this.runMockJob({
      jobId: job.id,
      sessionId: session.id,
      workspaceId: workspace.id,
      workspaceRoot: workspace.storageKey,
      prompt: input.prompt,
      sourceMode: input.sourceMode,
      sourceArtifactId: input.sourceArtifactId ?? null,
      variationCount: input.variationCount,
      templateRequirements: input.templateRequirements,
      variationIdsByIndex: new Map(variations.map(variation => [variation.index, variation.id])),
    })

    return {
      job: {
        id: job.id,
        status: job.status,
        variationCount: job.variationCount,
      },
      variations: variations.map(variation => ({
        id: variation.id,
        index: variation.index,
        status: variation.status,
      })),
    }
  }

  getDesignJob(jobId: string) {
    const snapshot = this.store.getJobSnapshot(jobId)
    if (!snapshot) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${jobId}`)
    return snapshot
  }

  getVariationDetail(variationId: string) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const job = this.store.jobs.get(variation.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    const artifacts = [...this.store.artifacts.values()]
      .filter(artifact => artifact.variationId === variationId && artifact.kind === 'html')
      .sort((a, b) => b.version - a.version)
    const currentArtifact = variation.currentArtifactId
      ? this.store.artifacts.get(variation.currentArtifactId) ?? null
      : artifacts[0] ?? null
    return {
      variation,
      job: {
        id: job.id,
        prompt: job.prompt,
        status: job.status,
      },
      currentArtifact: currentArtifact
        ? {
            id: currentArtifact.id,
            version: currentArtifact.version,
            entryPath: currentArtifact.entryPath,
            createdAt: currentArtifact.createdAt,
          }
        : null,
      artifacts: artifacts.map(artifact => ({
        id: artifact.id,
        version: artifact.version,
        entryPath: artifact.entryPath,
        createdAt: artifact.createdAt,
      })),
    }
  }

  async refineVariation(variationId: string, input: RefineVariationRequest) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const job = this.store.jobs.get(variation.jobId)
    if (!job) throw createHttpError(404, 'JOB_NOT_FOUND', `Design job not found: ${variation.jobId}`)
    const session = this.store.sessions.get(variation.sessionId)
    if (!session) throw createHttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${variation.sessionId}`)
    const workspace = this.store.workspaces.get(job.workspaceId)
    if (!workspace) throw createHttpError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found: ${job.workspaceId}`)
    if (!input.prompt.trim()) throw createHttpError(400, 'INVALID_PROMPT', 'prompt is required.')
    const baseArtifact = this.store.artifacts.get(input.baseArtifactId)
    if (!baseArtifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.baseArtifactId}`)

    this.store.appendMessage({
      sessionId: session.id,
      role: 'user',
      content: input.prompt,
      metadata: {
        kind: 'variation_refine',
        variationId,
        baseArtifactId: input.baseArtifactId,
        deviceContext: input.deviceContext ?? null,
      },
    })

    for await (const event of this.runtime.refineVariation({
      userId: session.userId,
      workspaceId: workspace.id,
      sessionId: session.id,
      jobId: job.id,
      variationId,
      runtimeChildSessionId: variation.runtimeChildSessionId,
      baseArtifactId: input.baseArtifactId,
      prompt: input.prompt,
      workspaceRoot: workspace.storageKey,
      deviceContext: input.deviceContext,
    })) {
      this.applyEventSideEffects(event)
      this.events.publish(event)
    }

    const updated = this.store.variations.get(variationId)!
    const artifact = updated.currentArtifactId ? this.store.artifacts.get(updated.currentArtifactId) : null
    return {
      variation: {
        id: updated.id,
        status: updated.status,
        currentArtifactId: updated.currentArtifactId,
        previewUrl: updated.previewUrl,
      },
      ...(artifact && {
        artifact: {
          id: artifact.id,
          version: artifact.version,
          entryPath: artifact.entryPath,
        },
      }),
    }
  }

  async annotateVariation(variationId: string, input: CreateAnnotationBatchRequest) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const artifact = this.store.artifacts.get(input.artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
    if (artifact.variationId !== variationId) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    if (!Array.isArray(input.shapes) || input.shapes.length === 0) {
      throw createHttpError(400, 'ANNOTATION_REQUIRED', 'At least one annotation shape is required.')
    }
    const promptSuffix = buildAnnotationPrompt(input.shapes, input.prompt)
    const batch = this.store.createAnnotationBatch({
      variationId,
      artifactId: input.artifactId,
      userId: this.store.devUser.id,
      shapes: input.shapes,
      promptSuffix,
    })
    const refined = await this.refineVariation(variationId, {
      prompt: promptSuffix,
      baseArtifactId: input.artifactId,
    })
    return {
      ...refined,
      annotationBatch: {
        id: batch.id,
        shapeCount: input.shapes.length,
        promptSuffix,
      },
    }
  }

  getVariationPreview(variationId: string): string {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    const title = variation.title ?? 'DUDesign Variation'
    const artifact = variation.currentArtifactId ? this.store.artifacts.get(variation.currentArtifactId) : null
    const version = artifact?.version ?? 1
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; background: #f7f4ed; color: #191714; display: grid; place-items: center; }
      main { width: min(1080px, calc(100vw - 48px)); min-height: 620px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; }
      h1 { font-size: clamp(48px, 8vw, 112px); line-height: 0.92; margin: 0; letter-spacing: 0; }
      p { font-size: 18px; line-height: 1.65; color: #5f5a52; max-width: 560px; }
      .accent { color: #4f46e5; }
      .panel { background: #fffefa; border: 1px solid #e5ded2; border-radius: 8px; padding: 28px; box-shadow: 0 24px 80px rgba(40, 35, 24, 0.12); }
      .invoice { border: 2px solid #191714; padding: 24px; aspect-ratio: 4 / 5; display: grid; align-content: space-between; }
      .row { display: flex; justify-content: space-between; border-bottom: 1px solid #d8d0c2; padding: 12px 0; font-size: 14px; }
      button { border: 0; background: #191714; color: #fffefa; border-radius: 6px; padding: 14px 18px; font-weight: 700; }
      @media (max-width: 760px) { main { grid-template-columns: 1fr; padding: 32px 0; } h1 { font-size: 56px; } }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Send the invoice.<br />Get <span class="accent">paid</span> faster.</h1>
        <p>Mock preview for ${escapeHtml(title)} version ${version}. This hosted artifact proves the DUDesign API can create variations, attach artifacts, and serve iframe-ready HTML before the real BabeL-O adapter is connected.</p>
        <button>${version > 1 ? 'Refined version' : 'Start free'}</button>
      </section>
      <section class="panel">
        <div class="invoice">
          <strong>Invoice #${escapeHtml(variation.index.toString().padStart(2, '0'))} · v${version}</strong>
          <div>
            <div class="row"><span>Design exploration</span><strong>$2,400</strong></div>
            <div class="row"><span>Frontend build</span><strong>$900</strong></div>
            <div class="row"><span>Final polish</span><strong>$700</strong></div>
          </div>
          <strong>Total due: $4,000</strong>
        </div>
      </section>
    </main>
  </body>
</html>`
  }

  exportVariation(variationId: string) {
    const { variation, artifact } = this.requireCurrentVariationArtifact(variationId)
    return {
      artifact: {
        id: artifact.id,
        version: artifact.version,
        filename: `${variation.title ?? variation.id}-v${artifact.version}.html`.replaceAll(/\s+/g, '-').toLowerCase(),
        html: this.getVariationPreview(variationId),
      },
    }
  }

  shareVariation(variationId: string, input: ShareVariationRequest) {
    const { variation, artifact } = this.requireCurrentVariationArtifact(variationId)
    if (!['public', 'private', 'password'].includes(input.visibility)) {
      throw createHttpError(400, 'INVALID_SHARE_VISIBILITY', 'visibility must be public, private, or password.')
    }
    const share = this.store.createShare({
      artifactId: artifact.id,
      variationId: variation.id,
      ownerId: this.store.devUser.id,
      visibility: input.visibility,
      expiresAt: input.expiresAt ?? null,
    })
    return {
      share: {
        id: share.id,
        token: share.token,
        url: `/share/${share.token}`,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
      },
    }
  }

  getSharedVariation(token: string) {
    const share = this.store.getShareByToken(token)
    if (!share) throw createHttpError(404, 'SHARE_NOT_FOUND', `Share not found: ${token}`)
    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      throw createHttpError(410, 'SHARE_EXPIRED', 'This share link has expired.')
    }
    const variation = this.store.variations.get(share.variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${share.variationId}`)
    const artifact = this.store.artifacts.get(share.artifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${share.artifactId}`)
    return {
      share: {
        id: share.id,
        token: share.token,
        visibility: share.visibility,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
      variation: {
        id: variation.id,
        title: variation.title,
        previewUrl: `/api/variations/${variation.id}/preview`,
      },
      artifact: {
        id: artifact.id,
        version: artifact.version,
        entryPath: artifact.entryPath,
      },
    }
  }

  private requireCurrentVariationArtifact(variationId: string) {
    const variation = this.store.variations.get(variationId)
    if (!variation) throw createHttpError(404, 'VARIATION_NOT_FOUND', `Variation not found: ${variationId}`)
    if (!variation.currentArtifactId) throw createHttpError(409, 'ARTIFACT_NOT_READY', 'Variation does not have an artifact yet.')
    const artifact = this.store.artifacts.get(variation.currentArtifactId)
    if (!artifact) throw createHttpError(404, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${variation.currentArtifactId}`)
    if (artifact.variationId !== variationId) {
      throw createHttpError(400, 'ARTIFACT_VARIATION_MISMATCH', 'Artifact does not belong to this variation.')
    }
    return { variation, artifact }
  }

  private async runMockJob(input: {
    jobId: string
    sessionId: string
    workspaceId: string
    workspaceRoot: string
    prompt: string
    sourceMode: CreateDesignJobRequest['sourceMode']
    sourceArtifactId: string | null
    variationCount: number
    templateRequirements: CreateDesignJobRequest['templateRequirements']
    variationIdsByIndex: Map<number, string>
  }): Promise<void> {
    this.store.setJobStatus(input.jobId, 'running')
    try {
      for await (const event of this.runtime.spawnVariationAgents({
        userId: this.store.devUser.id,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        jobId: input.jobId,
        prompt: input.prompt,
        sourceMode: input.sourceMode,
        sourceArtifactId: input.sourceArtifactId,
        variationCount: input.variationCount,
        workspaceRoot: input.workspaceRoot,
        memoryNamespace: this.store.devUser.memoryNamespace,
        templateRequirements: input.templateRequirements,
      })) {
        const normalized = this.rewriteMockVariationId(event, input.variationIdsByIndex)
        this.applyEventSideEffects(normalized)
        this.events.publish(normalized)
      }
      this.store.setJobStatus(input.jobId, 'completed')
    } catch (error) {
      this.store.setJobStatus(input.jobId, 'failed')
      throw error
    }
  }

  private rewriteMockVariationId(event: DesignEvent, idsByIndex: Map<number, string>): DesignEvent {
    const variationId = event.variationId
    if (!variationId?.startsWith('mock_variation_')) return event
    const index = Number(variationId.replace('mock_variation_', ''))
    const realId = idsByIndex.get(index)
    if (!realId) return event
    if (event.type === 'design.variation_preview_ready') {
      return {
        ...event,
        variationId: realId,
        payload: {
          ...event.payload,
          previewUrl: `/api/variations/${realId}/preview`,
        },
      }
    }
    return {
      ...event,
      variationId: realId,
    } as DesignEvent
  }

  private applyEventSideEffects(event: DesignEvent): void {
    if (!event.variationId) return
    switch (event.type) {
      case 'design.variation_queued':
        this.store.applyVariationEvent({ variationId: event.variationId, status: 'queued' })
        break
      case 'design.variation_streaming':
        this.store.applyVariationEvent({ variationId: event.variationId, status: 'streaming' })
        break
      case 'design.variation_preview_ready': {
        const artifact = this.store.createMockArtifact({
          workspaceId: this.store.devWorkspace.id,
          sessionId: event.sessionId ?? '',
          variationId: event.variationId,
          artifactId: event.payload.artifactId,
        })
        this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'rendering_preview',
          artifactId: artifact.id,
          previewUrl: event.payload.previewUrl,
        })
        break
      }
      case 'design.variation_completed':
        {
          const variation = this.store.variations.get(event.variationId)
          const existingArtifact = event.payload.artifactId
            ? this.store.artifacts.get(event.payload.artifactId)
            : undefined
          const artifact = variation && !existingArtifact
            ? this.store.createMockArtifact({
                workspaceId: this.store.devWorkspace.id,
                sessionId: event.sessionId ?? variation.sessionId,
                variationId: event.variationId,
                artifactId: event.payload.artifactId,
                parentArtifactId: variation.currentArtifactId,
              })
            : existingArtifact
          this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'completed',
          artifactId: artifact?.id ?? event.payload.artifactId,
          inputTokens: event.payload.inputTokens,
          outputTokens: event.payload.outputTokens,
          costCents: event.payload.costCents,
        })
        }
        break
      case 'design.variation_failed':
        this.store.applyVariationEvent({
          variationId: event.variationId,
          status: 'failed',
          errorCode: event.payload.errorCode,
          errorMessage: event.payload.message,
        })
        break
      default:
        break
    }
  }
}

function validateVariationCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    throw createHttpError(400, 'INVALID_VARIATION_COUNT', 'variationCount must be an integer from 1 to 6.')
  }
}

export type HttpError = Error & {
  status: number
  code: string
}

export function createHttpError(status: number, code: string, message: string): HttpError {
  const error = new Error(message) as HttpError
  error.status = status
  error.code = code
  return error
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildAnnotationPrompt(shapes: AnnotationShape[], prompt?: string): string {
  const lines = shapes.map((shape, index) => {
    const label = `Annotation ${index + 1}`
    if (shape.type === 'rect') {
      return `${label}: rectangle at x=${round(shape.x)}, y=${round(shape.y)}, w=${round(shape.w)}, h=${round(shape.h)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'circle') {
      return `${label}: circle at cx=${round(shape.cx)}, cy=${round(shape.cy)}, r=${round(shape.r)}${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'arrow') {
      return `${label}: arrow from (${round(shape.from.x)}, ${round(shape.from.y)}) to (${round(shape.to.x)}, ${round(shape.to.y)})${shape.note ? `; note: ${shape.note}` : ''}`
    }
    if (shape.type === 'pen') {
      return `${label}: freehand stroke with ${shape.points.length} points${shape.note ? `; note: ${shape.note}` : ''}`
    }
    return `${label}: text note at (${round(shape.anchor.x)}, ${round(shape.anchor.y)}): ${shape.text}${shape.note ? `; note: ${shape.note}` : ''}`
  })
  return [
    prompt?.trim() || 'Apply the requested visual changes from these annotations.',
    'Use normalized coordinates where 0,0 is the top-left of the current preview and 1,1 is the bottom-right.',
    ...lines,
  ].join('\n')
}

function round(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '0.000'
}
