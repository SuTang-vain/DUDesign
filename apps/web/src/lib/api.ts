import type {
  CreateDesignJobRequest,
  CreateDesignJobResponse,
  CreateAnnotationBatchRequest,
  CreateAnnotationBatchResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  DesignEvent,
  ExportVariationResponse,
  RefineVariationRequest,
  RefineVariationResponse,
  SharedVariationResponse,
  ShareVariationRequest,
  ShareVariationResponse,
  VariationDetailResponse,
} from '@dudesign/contracts'

const API_BASE = process.env.NEXT_PUBLIC_DUDESIGN_API_URL ?? 'http://127.0.0.1:4000'

export type BootstrapResponse = {
  user: {
    id: string
    email: string
    name: string | null
    memoryNamespace: string
  }
  workspace: {
    id: string
    name: string
    storageKey: string
  }
}

export type JobSnapshot = {
  job: {
    id: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    prompt: string
    variationCount: number
  }
  variations: VariationSnapshot[]
  artifacts: Array<{
    id: string
    variationId: string | null
    entryPath: string | null
  }>
}

export type SessionSnapshot = {
  id: string
  workspaceId: string
  title: string
  mode: 'new_html' | 'from_existing_html'
  sourceArtifactId: string | null
  runtimeSessionId: string | null
  status: 'active' | 'archived'
  lastPrompt: string | null
  createdAt: string
  updatedAt: string
}

export type ResumeSessionSnapshot = {
  session: SessionSnapshot
  messages: unknown[]
  jobs: Array<{
    id: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    createdAt: string
    updatedAt: string
  }>
  variations: VariationSnapshot[]
  artifacts: unknown[]
  runtime: {
    status: 'resumed' | 'rebuilt' | 'unavailable'
    message?: string
  }
}

export type VariationSnapshot = {
  id: string
  index: number
  title: string | null
  status: 'queued' | 'running' | 'streaming' | 'rendering_preview' | 'completed' | 'failed' | 'cancelled'
  currentArtifactId: string | null
  previewUrl: string | null
  inputTokens: number
  outputTokens: number
  costCents: number
  errorCode: string | null
  errorMessage: string | null
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

export async function getBootstrap(): Promise<BootstrapResponse> {
  return getJson('/api/dev/bootstrap')
}

export async function createSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
  return postJson('/api/sessions', input)
}

export async function listSessions(): Promise<{ sessions: SessionSnapshot[] }> {
  return getJson('/api/sessions')
}

export async function resumeSession(sessionId: string): Promise<ResumeSessionSnapshot> {
  return postJson(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {})
}

export async function createDesignJob(input: CreateDesignJobRequest): Promise<CreateDesignJobResponse> {
  return postJson('/api/design-jobs', input)
}

export async function getDesignJob(jobId: string): Promise<JobSnapshot> {
  return getJson(`/api/design-jobs/${encodeURIComponent(jobId)}`)
}

export async function getVariation(variationId: string): Promise<VariationDetailResponse> {
  return getJson(`/api/variations/${encodeURIComponent(variationId)}`)
}

export async function refineVariation(
  variationId: string,
  input: RefineVariationRequest,
): Promise<RefineVariationResponse> {
  return postJson(`/api/variations/${encodeURIComponent(variationId)}/refine`, input)
}

export async function createAnnotationBatch(
  variationId: string,
  input: CreateAnnotationBatchRequest,
): Promise<CreateAnnotationBatchResponse> {
  return postJson(`/api/variations/${encodeURIComponent(variationId)}/annotations`, input)
}

export async function exportVariation(variationId: string): Promise<ExportVariationResponse> {
  return postJson(`/api/variations/${encodeURIComponent(variationId)}/export`, {})
}

export async function shareVariation(
  variationId: string,
  input: ShareVariationRequest,
): Promise<ShareVariationResponse> {
  return postJson(`/api/variations/${encodeURIComponent(variationId)}/share`, input)
}

export async function getSharedVariation(token: string): Promise<SharedVariationResponse> {
  return getJson(`/api/shares/${encodeURIComponent(token)}`)
}

export function subscribeToJob(
  jobId: string,
  handlers: {
    onEvent: (event: DesignEvent) => void
    onError?: (error: Event) => void
    onOpen?: () => void
  },
): () => void {
  const source = new EventSource(apiUrl(`/api/design-jobs/${encodeURIComponent(jobId)}/stream`))
  source.onopen = () => handlers.onOpen?.()
  source.onerror = error => handlers.onError?.(error)
  const eventTypes: DesignEvent['type'][] = [
    'design.job_started',
    'design.variation_queued',
    'design.variation_streaming',
    'design.variation_artifact_updated',
    'design.variation_preview_ready',
    'design.variation_completed',
    'design.variation_failed',
    'design.permission_required',
    'design.runtime_warning',
    'design.job_completed',
  ]
  for (const type of eventTypes) {
    source.addEventListener(type, message => {
      handlers.onEvent(JSON.parse((message as MessageEvent).data) as DesignEvent)
    })
  }
  return () => source.close()
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(apiUrl(path), { cache: 'no-store' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

async function errorMessage(res: Response): Promise<string> {
  const payload = await res.json().catch(() => null)
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error as { message?: unknown }
    if (typeof error.message === 'string') return error.message
  }
  return `HTTP ${res.status}`
}
