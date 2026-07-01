import type {
  CreateDesignJobRequest,
  CreateDesignJobResponse,
  CreateAnnotationBatchRequest,
  CreateAnnotationBatchResponse,
  ListCapabilitiesResponse,
  CreateSourceArtifactRequest,
  CreateSourceArtifactResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  DesignJobSnapshotResponse,
  DesignEvent,
  ExportVariationResponse,
  RefineVariationRequest,
  RefineVariationResponse,
  RestoreVariationVersionResponse,
  SharedVariationResponse,
  ShareVariationRequest,
  ShareVariationResponse,
  UpdateUserPreferencesRequest,
  UserPreferencesResponse,
  VariationDetailResponse,
  VariationFilesResponse,
} from '@dudesign/contracts'
import { ApiClientError } from './userErrors'

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_DUDESIGN_API_URL)

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
  workspaces: Array<{
    id: string
    name: string
    storageKey: string
  }>
  models: ModelsResponse
}

export type ModelOption = {
  id: string
  modelId: string
  displayName: string
  description: string | null
  provider: string
  isDefault: boolean
  capabilities: string[]
  contextWindow: number | null
}

export type ModelsResponse = {
  models: ModelOption[]
  defaultModelId: string | null
}

export type CapabilitiesResponse = ListCapabilitiesResponse

export type JobSnapshot = DesignJobSnapshotResponse

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
  screenshotUrl: string | null
  inputTokens: number
  outputTokens: number
  costCents: number
  errorCode: string | null
  errorMessage: string | null
}

export function apiUrl(path: string): string {
  return `${runtimeApiBase()}${path}`
}

function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? '').trim().replace(/\/+$/, '')
  if (!base || base === '/api') return ''
  if (base.endsWith('/api')) return base.slice(0, -4)
  return base
}

function runtimeApiBase(): string {
  if (API_BASE) return API_BASE
  if (typeof window !== 'undefined' && window.location.port === '3301') {
    return 'http://127.0.0.1:4100'
  }
  if (typeof window !== 'undefined' && ['3000', '3001'].includes(window.location.port)) {
    return 'http://127.0.0.1:4000'
  }
  return ''
}

export async function getBootstrap(): Promise<BootstrapResponse> {
  return getJson('/api/dev/bootstrap')
}

export async function listModels(): Promise<ModelsResponse> {
  return getJson('/api/models')
}

export async function getCapabilities(): Promise<ListCapabilitiesResponse> {
  return getJson('/api/capabilities')
}

export async function getUserPreferences(): Promise<UserPreferencesResponse> {
  return getJson('/api/preferences')
}

export async function updateUserPreferences(input: UpdateUserPreferencesRequest): Promise<UserPreferencesResponse> {
  return putJson('/api/preferences', input)
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

export async function createSourceArtifact(input: CreateSourceArtifactRequest): Promise<CreateSourceArtifactResponse> {
  return postJson('/api/source-artifacts', input)
}

export async function getDesignJob(jobId: string): Promise<JobSnapshot> {
  return getJson(`/api/design-jobs/${encodeURIComponent(jobId)}`)
}

export async function getVariation(variationId: string): Promise<VariationDetailResponse> {
  return getJson(`/api/variations/${encodeURIComponent(variationId)}`)
}

export async function getVariationFiles(variationId: string, artifactId?: string | null): Promise<VariationFilesResponse> {
  const query = artifactId ? `?artifactId=${encodeURIComponent(artifactId)}` : ''
  return getJson(`/api/variations/${encodeURIComponent(variationId)}/files${query}`)
}

export async function refineVariation(
  variationId: string,
  input: RefineVariationRequest,
): Promise<RefineVariationResponse> {
  return postJson(`/api/variations/${encodeURIComponent(variationId)}/refine`, input)
}

export async function restoreVariationVersion(variationId: string, artifactId: string): Promise<RestoreVariationVersionResponse> {
  return postJson(
    `/api/variations/${encodeURIComponent(variationId)}/versions/${encodeURIComponent(artifactId)}/restore`,
    {},
  )
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

export async function downloadArtifact(path: string): Promise<Blob> {
  const res = await fetch(apiUrl(path), { cache: 'no-store' })
  if (!res.ok) throw await apiError(res)
  return res.blob()
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
    'design.variation_code_delta',
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
  if (!res.ok) throw await apiError(res)
  return res.json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiError(res)
  return res.json() as Promise<T>
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await apiError(res)
  return res.json() as Promise<T>
}

async function errorMessage(res: Response): Promise<string> {
  const parsed = await errorPayload(res)
  if (parsed.message) return parsed.message
  return `HTTP ${res.status}`
}

async function errorPayload(res: Response): Promise<{ code?: string; message?: string }> {
  const payload = await res.json().catch(() => null)
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error as { code?: unknown; message?: unknown }
    return {
      code: typeof error.code === 'string' ? error.code : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
    }
  }
  return {}
}

async function apiError(res: Response): Promise<ApiClientError> {
  const payload = await errorPayload(res)
  return new ApiClientError({
    status: res.status,
    code: payload.code,
    message: payload.message,
  })
}
