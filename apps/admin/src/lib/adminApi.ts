const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_DUDESIGN_API_URL)

export type AdminRole = 'support' | 'operator' | 'developer'

export type RuntimeHealthResponse = {
  runtime: {
    status: 'compatible' | 'degraded' | 'unavailable' | 'contract_mismatch'
    runtime: 'babel-o'
    runtimeVersion: string | null
    contractVersion: string
    checkedAt: string
    message?: string
  }
  contract: {
    runtime: 'babel-o'
    runtimeVersion: string
    contractVersion: string
    status: 'compatible' | 'degraded' | 'unavailable' | 'contract_mismatch'
    requiredEndpoints: string[]
    requiredEvents: string[]
    eventMappings: Record<string, string>
  }
  observability?: {
    latencyMs: number
    degraded: boolean
    unavailable: boolean
    contractMismatch: boolean
    drift: boolean
    degradedMode: string
    rollbackAvailable: boolean
    rollbackMode: string
  }
}

export type AdminModel = {
  id: string
  provider: string
  modelId: string
  displayName: string
  description: string | null
  enabled: boolean
  isDefault: boolean
  capabilities: string[]
  contextWindow: number | null
  inputTokenCostCents: number
  outputTokenCostCents: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type AdminModelsResponse = {
  models: AdminModel[]
}

export type SyncAdminModelsResponse = AdminModelsResponse & {
  createdCount: number
  updatedCount: number
  missingCount: number
  disabledMissingCount: number
  diff: Array<{
    modelServiceId: string
    modelId: string
    displayName: string
    runtimeProviderId: string | null
    changeType: 'created' | 'updated' | 'missing'
    previousContextWindow?: number | null
    nextContextWindow?: number | null
    previousInputTokenCostCents?: number
    nextInputTokenCostCents?: number
    previousOutputTokenCostCents?: number
    nextOutputTokenCostCents?: number
  }>
  runtime: {
    type: 'runtime_models'
    discoveryStatus?: 'supported' | 'unsupported'
    message?: string | null
    version: number | string | null
    providerCount: number
    modelCount: number
    defaultModel: string | null
    activeProfile: string | null
    syncedAt: string
  }
  audit: AuditLog
}

export type AdminUserModelAccess = {
  id: string
  userId: string
  modelServiceId: string
  enabled: boolean
  dailyTokenLimit: number | null
  monthlyCostLimitCents: number | null
  usage: {
    inputTokens: number
    outputTokens: number
    costCents: number
    usageEventCount: number
  }
  createdAt: string
  updatedAt: string
}

export type AdminUserModelAccessResponse = {
  userId: string
  access: AdminUserModelAccess[]
}

export type AuditLog = {
  id: string
  requestId: string
  operatorUserId: string
  operatorRole: AdminRole
  action: string
  targetType: string
  targetId: string
  reason: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type AuditLogsResponse = {
  auditLogs: AuditLog[]
}

export type AdminJob = {
  id: string
  userId: string
  workspaceId: string
  sessionId: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  variationCount: number
  completedVariationCount: number
  failedVariationCount: number
  cancelledVariationCount: number
  artifactCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostCents: number
  errorCount: number
  variations: AdminJobVariation[]
  createdAt: string
  updatedAt: string
}

export type AdminJobVariation = {
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
  updatedAt: string
}

export type AdminJobsResponse = {
  jobs: AdminJob[]
}

export type AdminArtifact = {
  id: string
  workspaceId: string
  sessionId: string
  jobId: string | null
  variationId: string | null
  parentArtifactId: string | null
  kind: 'html' | 'asset' | 'screenshot' | 'export_zip'
  version: number
  storageKey: string
  entryPath: string | null
  contentHash: string
  sizeBytes: number
  previewUrl: string | null
  shareCount: number
  createdAt: string
}

export type AdminArtifactsResponse = {
  artifacts: AdminArtifact[]
}

export type AdminArtifactActionResponse = {
  artifact?: {
    id: string
    version?: number
    screenshotUrl?: string | null
    shareCount?: number
  }
  sourceArtifact?: {
    id: string
    version: number
  }
  exportArtifact?: {
    id: string
    kind: 'export_zip'
    filename: string
    sizeBytes: number
    contentHash: string
    downloadUrl: string
    files: string[]
  }
  queueJob?: {
    id: string
    idempotencyKey: string
    kind: string
    status: string
  }
  revokedShares?: Array<{
    id: string
    token: string
    revokedAt: string
  }>
  revokedCount?: number
  audit: AuditLog
}

export type CancelJobResponse = {
  job: {
    id: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  }
  runtime: {
    cancelled: boolean
    message?: string
  }
  audit: AuditLog
}

export type RetryJobResponse = {
  retry: {
    job: {
      id: string
      status: 'queued'
      variationCount: number
    }
  }
  audit: AuditLog
}

export type RetryVariationResponse = RetryJobResponse

export type CostSummaryResponse = {
  totals: {
    jobCount: number
    usageEventCount: number
    inputTokens: number
    outputTokens: number
    costCents: number
  }
  byUser: Array<{
    userId: string
    jobCount: number
    usageEventCount: number
    inputTokens: number
    outputTokens: number
    costCents: number
  }>
}

export type AdminUserSupportSession = {
  id: string
  workspaceId: string
  title: string
  mode: 'new_html' | 'from_existing_html'
  status: 'active' | 'archived'
  resumeState: 'runtime_session_available' | 'runtime_session_missing'
  lastPromptPreview: string | null
  jobCount: number
  latestJob: {
    id: string
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    variationCount: number
    updatedAt: string
  } | null
  variationSummary: {
    queued: number
    running: number
    streaming: number
    renderingPreview: number
    completed: number
    failed: number
    cancelled: number
  }
  failureSummary: {
    severity: 'ok' | 'warning' | 'blocked'
    message: string
    failedVariationCount: number
    examples: Array<{
      variationId: string
      errorCode: string | null
      message: string | null
    }>
  }
  createdAt: string
  updatedAt: string
}

export type AdminUserSupportResponse = {
  users: Array<{
    user: {
      id: string
      email: string
      name: string | null
      status: 'active' | 'disabled'
      createdAt: string
      updatedAt: string
    }
    workspaces: Array<{
      id: string
      name: string
      visibility: 'private' | 'team' | 'public'
      status: 'active' | 'archived'
    }>
    sessions: AdminUserSupportSession[]
  }>
}

export type AdminMemoryGovernanceResponse = {
  users: Array<{
    userId: string
    email: string
    memoryNamespace: string
    isolationStatus: 'isolated' | 'namespace_conflict' | 'missing_namespace'
    workspaceCount: number
    sessionCount: number
    runtimeSessionCount: number
    jobCount: number
    memoryRefCount: number
    pendingMemoryNoteCount: number
    approvedMemoryNoteCount: number
    rejectedMemoryNoteCount: number
    lastSessionAt: string | null
  }>
  totals: {
    userCount: number
    isolatedUserCount: number
    conflictUserCount: number
    missingNamespaceUserCount: number
    memoryRefCount: number
    pendingMemoryNoteCount: number
  }
  capabilities: {
    memoryNotes: 'not_configured' | 'available'
    memoryRefs: 'event_stream_only' | 'available'
  }
}

export async function getRuntimeHealth(role: AdminRole): Promise<RuntimeHealthResponse> {
  return getJson('/api/admin/runtime/health', role)
}

export async function getAdminModels(role: AdminRole): Promise<AdminModelsResponse> {
  return getJson('/api/admin/models', role)
}

export async function syncAdminModels(role: AdminRole): Promise<SyncAdminModelsResponse> {
  return postJson('/api/admin/models/sync', role, {})
}

export async function updateAdminModel(
  role: AdminRole,
  modelServiceId: string,
  input: { enabled?: boolean; isDefault?: boolean },
): Promise<{ model: AdminModel; audit: AuditLog }> {
  return patchJson(`/api/admin/models/${encodeURIComponent(modelServiceId)}`, role, input)
}

export async function getUserModelAccess(role: AdminRole, userId: string): Promise<AdminUserModelAccessResponse> {
  return getJson(`/api/admin/users/${encodeURIComponent(userId)}/models`, role)
}

export async function updateUserModelAccess(
  role: AdminRole,
  userId: string,
  modelServiceId: string,
  input: { enabled?: boolean; dailyTokenLimit?: number | null; monthlyCostLimitCents?: number | null },
): Promise<{ access: AdminUserModelAccess; audit: AuditLog }> {
  return patchJson(`/api/admin/users/${encodeURIComponent(userId)}/models/${encodeURIComponent(modelServiceId)}`, role, input)
}

export async function getAuditLogs(role: AdminRole): Promise<AuditLogsResponse> {
  return getJson('/api/admin/audit-logs', role)
}

export async function getAdminJobs(role: AdminRole, filter: {
  status?: string
  userId?: string
  workspaceId?: string
  sessionId?: string
  createdFrom?: string
  createdTo?: string
} = {}): Promise<AdminJobsResponse> {
  const params = new URLSearchParams()
  if (filter.status) params.set('status', filter.status)
  if (filter.userId) params.set('userId', filter.userId)
  if (filter.workspaceId) params.set('workspaceId', filter.workspaceId)
  if (filter.sessionId) params.set('sessionId', filter.sessionId)
  if (filter.createdFrom) params.set('createdFrom', filter.createdFrom)
  if (filter.createdTo) params.set('createdTo', filter.createdTo)
  return getJson(`/api/admin/jobs${params.size ? `?${params.toString()}` : ''}`, role)
}

export async function getAdminArtifacts(role: AdminRole, filter: { jobId?: string; variationId?: string; kind?: string } = {}): Promise<AdminArtifactsResponse> {
  const params = new URLSearchParams()
  if (filter.jobId) params.set('jobId', filter.jobId)
  if (filter.variationId) params.set('variationId', filter.variationId)
  if (filter.kind) params.set('kind', filter.kind)
  return getJson(`/api/admin/artifacts${params.size ? `?${params.toString()}` : ''}`, role)
}

export async function rebuildArtifactScreenshot(role: AdminRole, artifactId: string, reason?: string): Promise<AdminArtifactActionResponse> {
  return postJson(`/api/admin/artifacts/${encodeURIComponent(artifactId)}/rebuild-screenshot`, role, { reason })
}

export async function repairArtifactExport(role: AdminRole, artifactId: string, reason?: string): Promise<AdminArtifactActionResponse> {
  return postJson(`/api/admin/artifacts/${encodeURIComponent(artifactId)}/repair-export`, role, { reason })
}

export async function revokeArtifactShares(role: AdminRole, artifactId: string, reason?: string): Promise<AdminArtifactActionResponse> {
  return postJson(`/api/admin/artifacts/${encodeURIComponent(artifactId)}/revoke-shares`, role, { reason })
}

export async function getCostSummary(role: AdminRole): Promise<CostSummaryResponse> {
  return getJson('/api/admin/costs/summary', role)
}

export async function getUserSupport(role: AdminRole, filter: { userId?: string; email?: string } = {}): Promise<AdminUserSupportResponse> {
  const params = new URLSearchParams()
  if (filter.userId) params.set('userId', filter.userId)
  if (filter.email) params.set('email', filter.email)
  return getJson(`/api/admin/support/users${params.size ? `?${params.toString()}` : ''}`, role)
}

export async function getMemoryGovernance(role: AdminRole, filter: { userId?: string; email?: string } = {}): Promise<AdminMemoryGovernanceResponse> {
  const params = new URLSearchParams()
  if (filter.userId) params.set('userId', filter.userId)
  if (filter.email) params.set('email', filter.email)
  return getJson(`/api/admin/memory${params.size ? `?${params.toString()}` : ''}`, role)
}

export async function cancelJob(role: AdminRole, jobId: string, reason: string): Promise<CancelJobResponse> {
  return postJson(`/api/admin/jobs/${encodeURIComponent(jobId)}/cancel`, role, { reason })
}

export async function retryJob(role: AdminRole, jobId: string, reason: string): Promise<RetryJobResponse> {
  return postJson(`/api/admin/jobs/${encodeURIComponent(jobId)}/retry`, role, { reason })
}

export async function retryVariation(role: AdminRole, jobId: string, variationId: string, reason: string): Promise<RetryVariationResponse> {
  return postJson(
    `/api/admin/jobs/${encodeURIComponent(jobId)}/variations/${encodeURIComponent(variationId)}/retry`,
    role,
    { reason },
  )
}

async function getJson<T>(path: string, role: AdminRole): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: adminHeaders(role),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

async function postJson<T>(path: string, role: AdminRole, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...adminHeaders(role),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

async function patchJson<T>(path: string, role: AdminRole, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...adminHeaders(role),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json() as Promise<T>
}

function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? '').trim().replace(/\/+$/, '')
  if (!base || base === '/api') return ''
  if (base.endsWith('/api')) return base.slice(0, -4)
  return base
}

function adminHeaders(role: AdminRole): Record<string, string> {
  return {
    'x-dudesign-admin-role': role,
    'x-request-id': `req_admin_${Date.now()}`,
  }
}

async function errorMessage(res: Response): Promise<string> {
  const payload = await res.json().catch(() => null)
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error as { code?: unknown; message?: unknown }
    if (typeof error.message === 'string') {
      return typeof error.code === 'string' ? `${error.code}: ${error.message}` : error.message
    }
  }
  return `HTTP ${res.status}`
}
