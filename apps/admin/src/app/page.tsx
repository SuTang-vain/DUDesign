'use client'

import { useEffect, useState } from 'react'
import { ModelServicesPanel } from '@/components/ModelServicesPanel'
import { RuntimeHealthPanel } from '@/components/RuntimeHealthPanel'
import {
  cancelJob,
  getAdminArtifacts,
  getAdminJobs,
  getAdminModels,
  getAuditLogs,
  getCostSummary,
  getMemoryGovernance,
  getRuntimeHealth,
  getUserModelAccess,
  getUserSupport,
  retryJob,
  retryVariation,
  syncAdminModels,
  updateAdminModel,
  updateUserModelAccess,
  type AdminArtifact,
  type AdminJob,
  type AdminModel,
  type AdminRole,
  type AdminMemoryGovernanceResponse,
  type AdminUserModelAccess,
  type AdminUserSupportResponse,
  type AuditLog,
  type CostSummaryResponse,
  type RuntimeHealthResponse,
  type SyncAdminModelsResponse,
} from '@/lib/adminApi'

type AdminSection = 'runtime' | 'models' | 'jobs' | 'artifacts' | 'support' | 'memory' | 'audit'

const adminSections: Array<{ id: AdminSection; label: string }> = [
  { id: 'runtime', label: 'Runtime Health' },
  { id: 'models', label: 'Model Services' },
  { id: 'jobs', label: 'Job Controls' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'support', label: 'User Support' },
  { id: 'memory', label: 'Memory' },
  { id: 'audit', label: 'Audit Log' },
]

export default function AdminHomePage(): React.JSX.Element {
  const [role, setRole] = useState<AdminRole>('operator')
  const [activeSection, setActiveSection] = useState<AdminSection>('runtime')
  const [runtime, setRuntime] = useState<RuntimeHealthResponse | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [artifacts, setArtifacts] = useState<AdminArtifact[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  const [modelAccess, setModelAccess] = useState<AdminUserModelAccess[]>([])
  const [modelSyncSummary, setModelSyncSummary] = useState<SyncAdminModelsResponse | null>(null)
  const [memoryGovernance, setMemoryGovernance] = useState<AdminMemoryGovernanceResponse | null>(null)
  const [supportUsers, setSupportUsers] = useState<AdminUserSupportResponse['users']>([])
  const [costs, setCosts] = useState<CostSummaryResponse | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [jobUserFilter, setJobUserFilter] = useState('')
  const [jobWorkspaceFilter, setJobWorkspaceFilter] = useState('')
  const [jobSessionFilter, setJobSessionFilter] = useState('')
  const [jobCreatedFromFilter, setJobCreatedFromFilter] = useState('')
  const [jobCreatedToFilter, setJobCreatedToFilter] = useState('')
  const [artifactJobFilter, setArtifactJobFilter] = useState('')
  const [artifactKindFilter, setArtifactKindFilter] = useState('')
  const [supportQuery, setSupportQuery] = useState('usr_dev')
  const [memoryQuery, setMemoryQuery] = useState('')
  const [modelUserId, setModelUserId] = useState('usr_dev')
  const [jobId, setJobId] = useState('')
  const [reason, setReason] = useState('Operator requested cancellation from admin console.')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  useEffect(() => {
    void refreshJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  useEffect(() => {
    void refreshArtifacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, artifactJobFilter, artifactKindFilter])

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [health, audits] = await Promise.all([
        getRuntimeHealth(role),
        role === 'support' ? Promise.resolve({ auditLogs: [] }) : getAuditLogs(role),
      ])
      setRuntime(health)
      setAuditLogs(audits.auditLogs)
      await Promise.all([refreshJobs(), refreshArtifacts(), refreshSupport(), refreshMemory(), refreshModels(), refreshModelAccess()])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshJobs(): Promise<void> {
    try {
      const [jobData, costData] = await Promise.all([
        getAdminJobs(role, {
          status: statusFilter || undefined,
          userId: jobUserFilter.trim() || undefined,
          workspaceId: jobWorkspaceFilter.trim() || undefined,
          sessionId: jobSessionFilter.trim() || undefined,
          createdFrom: dateTimeFilterToIso(jobCreatedFromFilter),
          createdTo: dateTimeFilterToIso(jobCreatedToFilter),
        }),
        getCostSummary(role),
      ])
      setJobs(jobData.jobs)
      setCosts(costData)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshArtifacts(): Promise<void> {
    try {
      const artifactData = await getAdminArtifacts(role, {
        jobId: artifactJobFilter.trim() || undefined,
        kind: artifactKindFilter || undefined,
      })
      setArtifacts(artifactData.artifacts)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshSupport(): Promise<void> {
    try {
      const query = supportQuery.trim()
      const support = await getUserSupport(role, query.includes('@') ? { email: query } : { userId: query || undefined })
      setSupportUsers(support.users)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshMemory(): Promise<void> {
    try {
      const query = memoryQuery.trim()
      const memory = await getMemoryGovernance(role, query.includes('@') ? { email: query } : { userId: query || undefined })
      setMemoryGovernance(memory)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshModels(): Promise<void> {
    try {
      const modelData = await getAdminModels(role)
      setModels(modelData.models)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function syncModels(): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await syncAdminModels(role)
      setModels(result.models)
      setModelSyncSummary(result)
      setNotice(`Synced ${result.runtime.modelCount} runtime models; ${result.createdCount} created, ${result.updatedCount} updated, ${result.missingCount} missing.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshModelAccess(): Promise<void> {
    try {
      const userId = modelUserId.trim() || 'usr_dev'
      const access = await getUserModelAccess(role, userId)
      setModelAccess(access.access)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggleModel(model: AdminModel, enabled: boolean): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await updateAdminModel(role, model.id, { enabled })
      setNotice(`${enabled ? 'Enabled' : 'Disabled'} ${model.displayName}`)
      await refreshModels()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function setDefaultModel(model: AdminModel): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await updateAdminModel(role, model.id, { isDefault: true, enabled: true })
      setNotice(`Set ${model.displayName} as default`)
      await refreshModels()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function toggleUserModelAccess(access: AdminUserModelAccess, enabled: boolean): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      await updateUserModelAccess(role, access.userId, access.modelServiceId, { enabled })
      setNotice(`${enabled ? 'Enabled' : 'Disabled'} ${access.modelServiceId} for ${access.userId}`)
      await refreshModelAccess()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function submitCancel(): Promise<void> {
    if (!jobId.trim()) return
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await cancelJob(role, jobId.trim(), reason.trim())
      setNotice(`Cancelled ${result.job.id}; audit ${result.audit.id}`)
      setJobId('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function cancelFromRow(id: string): Promise<void> {
    setJobId(id)
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await cancelJob(role, id, reason.trim())
      setNotice(`Cancelled ${result.job.id}; audit ${result.audit.id}`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function retryFromRow(id: string): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await retryJob(role, id, `Retry from admin console for ${id}`)
      setNotice(`Retried ${id}; new job ${result.retry.job.id}`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function retryVariationFromRow(jobId: string, variationId: string): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const result = await retryVariation(role, jobId, variationId, `Retry variation ${variationId} from admin console`)
      setNotice(`Retried ${variationId}; new job ${result.retry.job.id}`)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <strong>DUDesign Admin</strong>
        </div>
        <nav className="nav-stack" aria-label="Admin sections">
          {adminSections.map(section => (
            <button
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="main">
        <header className="topline">
          <div>
            <h1>Operations Console</h1>
            <p className="muted">Runtime compatibility, job control, and audited operator actions.</p>
          </div>
          <label className="role-picker">
            Role
            <select data-testid="admin-role-select" value={role} onChange={event => setRole(event.target.value as AdminRole)}>
              <option value="support">support</option>
              <option value="operator">operator</option>
              <option value="developer">developer</option>
            </select>
          </label>
        </header>

        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="success">{notice}</p> : null}

        <div className="section-tabs" role="tablist" aria-label="Admin module tags">
          {adminSections.map(section => (
            <button
              aria-selected={activeSection === section.id}
              className={`section-tab ${activeSection === section.id ? 'active' : ''}`}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              role="tab"
              type="button"
            >
              {section.label}
            </button>
          ))}
        </div>

        <div className="grid">
          {activeSection === 'runtime' ? (
          <RuntimeHealthPanel runtime={runtime} loading={loading} />
          ) : null}

          {activeSection === 'models' ? (
          <ModelServicesPanel
            role={role}
            loading={loading}
            models={models}
            syncSummary={modelSyncSummary}
            onRefresh={() => void refreshModels()}
            onSync={() => void syncModels()}
            onToggleModel={(model, enabled) => void toggleModel(model, enabled)}
            onSetDefault={model => void setDefaultModel(model)}
          />
          ) : null}

          {activeSection === 'models' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <h2>User Model Access</h2>
              <div className="filter-row">
                <input
                  className="compact-input"
                  value={modelUserId}
                  onChange={event => setModelUserId(event.target.value)}
                  placeholder="user id"
                />
                <button className="secondary-button" onClick={() => void refreshModelAccess()} disabled={loading}>
                  Load access
                </button>
              </div>
            </div>
            {modelAccess.length === 0 ? (
              <p className="muted">No model access records loaded.</p>
            ) : (
              <div className="model-table">
                <div className="model-table-head">
                  <span>User model</span>
                  <span>Status</span>
                  <span>Limits</span>
                  <span>Usage</span>
                  <span>Actions</span>
                </div>
                {modelAccess.map(access => (
                  <article className="model-row" key={access.id}>
                    <div>
                      <strong>{modelName(models, access.modelServiceId)}</strong>
                      <p>{access.userId} · {access.modelServiceId}</p>
                    </div>
                    <span className={`status-pill ${access.enabled ? 'compatible' : 'unavailable'}`}>
                      {access.enabled ? 'allowed' : 'blocked'}
                    </span>
                    <div className="compact-metrics">
                      <span>{access.dailyTokenLimit ? `${access.dailyTokenLimit.toLocaleString()} daily tok` : 'no daily token limit'}</span>
                      <span>{access.monthlyCostLimitCents ? `$${(access.monthlyCostLimitCents / 100).toFixed(2)} monthly` : 'no monthly cap'}</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{access.usage.inputTokens + access.usage.outputTokens} tok</span>
                      <span>${(access.usage.costCents / 100).toFixed(2)} · {access.usage.usageEventCount} events</span>
                    </div>
                    <div className="row-actions">
                      <button className="secondary-button" onClick={() => void toggleUserModelAccess(access, !access.enabled)} disabled={loading}>
                        {access.enabled ? 'Block' : 'Allow'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'jobs' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <h2>Job Monitor</h2>
              <div className="filter-row">
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="">all statuses</option>
                  <option value="queued">queued</option>
                  <option value="running">running</option>
                  <option value="completed">completed</option>
                  <option value="failed">failed</option>
                  <option value="cancelled">cancelled</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshJobs()} disabled={loading}>
                  Refresh jobs
                </button>
              </div>
            </div>
            <div className="job-filter-grid">
              <label>
                User
                <input
                  className="compact-input"
                  value={jobUserFilter}
                  onChange={event => setJobUserFilter(event.target.value)}
                  placeholder="usr_..."
                />
              </label>
              <label>
                Workspace
                <input
                  className="compact-input"
                  value={jobWorkspaceFilter}
                  onChange={event => setJobWorkspaceFilter(event.target.value)}
                  placeholder="wrk_..."
                />
              </label>
              <label>
                Session
                <input
                  className="compact-input"
                  value={jobSessionFilter}
                  onChange={event => setJobSessionFilter(event.target.value)}
                  placeholder="ses_..."
                />
              </label>
              <label>
                From
                <input
                  className="compact-input"
                  type="datetime-local"
                  value={jobCreatedFromFilter}
                  onChange={event => setJobCreatedFromFilter(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  className="compact-input"
                  type="datetime-local"
                  value={jobCreatedToFilter}
                  onChange={event => setJobCreatedToFilter(event.target.value)}
                />
              </label>
            </div>
            {jobs.length === 0 ? (
              <p className="muted">No jobs match the current filter.</p>
            ) : (
              <div className="job-table">
                <div className="job-table-head">
                  <span>Job</span>
                  <span>Status</span>
                  <span>Variations</span>
                  <span>Cost</span>
                  <span>Actions</span>
                </div>
                {jobs.map(job => (
                  <article className="job-row" key={job.id}>
                    <div>
                      <strong>{job.id}</strong>
                      <p>{job.prompt}</p>
                      <small>{job.userId} · {job.workspaceId} · {job.sessionId} · {formatTime(job.updatedAt)}</small>
                    </div>
                    <span className={`status-pill ${job.status}`}>{job.status}</span>
                    <div className="compact-metrics">
                      <span>{job.completedVariationCount}/{job.variationCount} done</span>
                      <span>{job.failedVariationCount} failed</span>
                      <span>{job.artifactCount} artifacts</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{job.totalInputTokens + job.totalOutputTokens} tok</span>
                      <span>${(job.totalCostCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        onClick={() => void cancelFromRow(job.id)}
                        disabled={loading || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'}
                      >
                        Cancel
                      </button>
                      <button className="secondary-button" onClick={() => void retryFromRow(job.id)} disabled={loading}>
                        Retry
                      </button>
                    </div>
                    <div className="variation-admin-list">
                      {job.variations.map(variation => (
                        <article className="variation-admin-row" key={variation.id}>
                          <div>
                            <strong>Variation {String(variation.index).padStart(2, '0')}</strong>
                            <p>{variation.id}</p>
                            {variation.errorMessage ? <small>{variation.errorMessage}</small> : null}
                          </div>
                          <span className={`status-pill ${variation.status}`}>{variation.status}</span>
                          <div className="compact-metrics">
                            <span>{variation.inputTokens + variation.outputTokens} tok</span>
                            <span>${(variation.costCents / 100).toFixed(2)}</span>
                          </div>
                          <div className="row-actions">
                            <button
                              className="secondary-button"
                              onClick={() => void retryVariationFromRow(job.id, variation.id)}
                              disabled={loading}
                            >
                              Retry variation
                            </button>
                            {variation.previewUrl ? (
                              <a className="secondary-link" href={variation.previewUrl} target="_blank" rel="noreferrer">
                                Preview
                              </a>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'jobs' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Cancel Job</h2>
              <button className="secondary-button" onClick={() => void refresh()} disabled={loading}>
                Refresh
              </button>
            </div>
            <div className="cancel-form">
              <label>
                Job ID
                <input value={jobId} onChange={event => setJobId(event.target.value)} placeholder="job_..." />
              </label>
              <label>
                Reason
                <textarea rows={4} value={reason} onChange={event => setReason(event.target.value)} />
              </label>
              <button className="primary-button" onClick={() => void submitCancel()} disabled={loading || !jobId.trim()}>
                Cancel job
              </button>
            </div>
          </section>
          ) : null}

          {activeSection === 'jobs' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Cost Summary</h2>
              <span className="status-pill">{costs?.totals.jobCount ?? 0} jobs</span>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <span>Usage events</span>
                <strong>{costs?.totals.usageEventCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Total tokens</span>
                <strong>{(costs?.totals.inputTokens ?? 0) + (costs?.totals.outputTokens ?? 0)}</strong>
              </div>
              <div className="metric">
                <span>Cost</span>
                <strong>${((costs?.totals.costCents ?? 0) / 100).toFixed(2)}</strong>
              </div>
              <div className="metric">
                <span>Users</span>
                <strong>{costs?.byUser.length ?? 0}</strong>
              </div>
            </div>
          </section>
          ) : null}

          {activeSection === 'artifacts' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <h2>Artifact Explorer</h2>
              <div className="filter-row">
                <input
                  className="compact-input"
                  value={artifactJobFilter}
                  onChange={event => setArtifactJobFilter(event.target.value)}
                  placeholder="job id"
                />
                <select value={artifactKindFilter} onChange={event => setArtifactKindFilter(event.target.value)}>
                  <option value="">all kinds</option>
                  <option value="html">html</option>
                  <option value="asset">asset</option>
                  <option value="screenshot">screenshot</option>
                  <option value="export_zip">export zip</option>
                </select>
                <button className="secondary-button" onClick={() => void refreshArtifacts()} disabled={loading}>
                  Refresh artifacts
                </button>
              </div>
            </div>
            {artifacts.length === 0 ? (
              <p className="muted">No artifacts match the current filter.</p>
            ) : (
              <div className="artifact-table">
                <div className="artifact-table-head">
                  <span>Artifact</span>
                  <span>Kind</span>
                  <span>Version</span>
                  <span>Size</span>
                  <span>Links</span>
                </div>
                {artifacts.map(artifact => (
                  <article className="artifact-row" key={artifact.id}>
                    <div>
                      <strong>{artifact.id}</strong>
                      <p>{artifact.storageKey}</p>
                      <small>{artifact.contentHash} · {formatTime(artifact.createdAt)}</small>
                    </div>
                    <span className="status-pill">{artifact.kind}</span>
                    <div className="compact-metrics">
                      <span>v{artifact.version}</span>
                      <span>{artifact.entryPath ?? 'no entry'}</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{formatBytes(artifact.sizeBytes)}</span>
                      <span>{artifact.shareCount} shares</span>
                    </div>
                    <div className="row-actions">
                      {artifact.previewUrl ? (
                        <a className="secondary-link" href={artifact.previewUrl} target="_blank" rel="noreferrer">
                          Preview
                        </a>
                      ) : (
                        <span className="muted">No preview</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'support' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <h2>User Support</h2>
              <div className="filter-row">
                <input
                  className="compact-input"
                  value={supportQuery}
                  onChange={event => setSupportQuery(event.target.value)}
                  placeholder="user id or email"
                />
                <button className="secondary-button" onClick={() => void refreshSupport()} disabled={loading}>
                  Search users
                </button>
              </div>
            </div>
            {supportUsers.length === 0 ? (
              <p className="muted">No users match the current support query.</p>
            ) : (
              <div className="support-list">
                {supportUsers.map(entry => (
                  <article className="support-user" key={entry.user.id}>
                    <header className="support-user-header">
                      <div>
                        <strong>{entry.user.email}</strong>
                        <p>{entry.user.id} · {entry.workspaces.length} workspace(s)</p>
                      </div>
                      <span className={`status-pill ${entry.user.status === 'active' ? 'compatible' : 'unavailable'}`}>
                        {entry.user.status}
                      </span>
                    </header>
                    {entry.sessions.length === 0 ? (
                      <p className="muted">No sessions for this user.</p>
                    ) : (
                      <div className="support-session-table">
                        <div className="support-session-head">
                          <span>Session</span>
                          <span>Resume</span>
                          <span>Latest job</span>
                          <span>Issue</span>
                        </div>
                        {entry.sessions.map(session => (
                          <article className="support-session-row" key={session.id}>
                            <div>
                              <strong>{session.title}</strong>
                              <p>{session.id} · {session.mode}</p>
                              <small>{session.lastPromptPreview ?? 'No prompt yet'}</small>
                            </div>
                            <span className={`status-pill ${session.resumeState === 'runtime_session_available' ? 'compatible' : 'degraded'}`}>
                              {session.resumeState === 'runtime_session_available' ? 'resumable' : 'missing runtime'}
                            </span>
                            <div className="compact-metrics">
                              <span>{session.latestJob?.id ?? 'no job'}</span>
                              <span>{session.latestJob?.status ?? 'none'} · {session.latestJob?.variationCount ?? 0} vars</span>
                              <span>{session.variationSummary.completed} done / {session.variationSummary.failed} failed</span>
                            </div>
                            <div className="compact-metrics">
                              <span className={`severity ${session.failureSummary.severity}`}>{session.failureSummary.severity}</span>
                              <span>{session.failureSummary.message}</span>
                              {session.failureSummary.examples[0] ? (
                                <span>{session.failureSummary.examples[0].variationId}: {session.failureSummary.examples[0].errorCode ?? 'error'}</span>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'memory' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <h2>Memory Governance</h2>
              <div className="filter-row">
                <input
                  className="compact-input"
                  value={memoryQuery}
                  onChange={event => setMemoryQuery(event.target.value)}
                  placeholder="user id or email"
                />
                <button className="secondary-button" onClick={() => void refreshMemory()} disabled={loading}>
                  Load memory
                </button>
              </div>
            </div>
            <div className="metric-grid memory-metrics">
              <div className="metric">
                <span>Users</span>
                <strong>{memoryGovernance?.totals.userCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Isolated</span>
                <strong>{memoryGovernance?.totals.isolatedUserCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Conflicts</span>
                <strong>{memoryGovernance?.totals.conflictUserCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Memory refs</span>
                <strong>{memoryGovernance?.totals.memoryRefCount ?? 0}</strong>
              </div>
            </div>
            <div className="capability-strip">
              <span>notes: {memoryGovernance?.capabilities.memoryNotes ?? 'unknown'}</span>
              <span>refs: {memoryGovernance?.capabilities.memoryRefs ?? 'unknown'}</span>
            </div>
            {!memoryGovernance || memoryGovernance.users.length === 0 ? (
              <p className="muted">No memory namespaces match the current filter.</p>
            ) : (
              <div className="memory-table">
                <div className="memory-table-head">
                  <span>User</span>
                  <span>Namespace</span>
                  <span>Runtime</span>
                  <span>Notes</span>
                </div>
                {memoryGovernance.users.map(user => (
                  <article className="memory-row" key={user.userId}>
                    <div>
                      <strong>{user.email}</strong>
                      <p>{user.userId} · {user.workspaceCount} workspace(s)</p>
                      <small>{user.lastSessionAt ? formatTime(user.lastSessionAt) : 'No sessions yet'}</small>
                    </div>
                    <div className="compact-metrics">
                      <span className={`status-pill ${memoryStatusClass(user.isolationStatus)}`}>
                        {user.isolationStatus}
                      </span>
                      <span>{user.memoryNamespace}</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{user.runtimeSessionCount}/{user.sessionCount} sessions attached</span>
                      <span>{user.jobCount} jobs · {user.memoryRefCount} refs</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{user.pendingMemoryNoteCount} pending</span>
                      <span>{user.approvedMemoryNoteCount} approved · {user.rejectedMemoryNoteCount} rejected</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'audit' ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Audit Log</h2>
              <span className="status-pill">{role === 'support' ? 'restricted' : auditLogs.length}</span>
            </div>
            {role === 'support' ? (
              <p className="muted">Support can read runtime health but cannot view audit logs.</p>
            ) : auditLogs.length === 0 ? (
              <p className="muted">No audited actions yet.</p>
            ) : (
              <div className="list">
                {auditLogs.map(log => (
                  <article className="audit-row" key={log.id}>
                    <header>
                      <strong>{log.action}</strong>
                      <span>{formatTime(log.createdAt)}</span>
                    </header>
                    <p>{log.targetType}: {log.targetId}</p>
                    <p>{log.reason ?? 'No reason provided'}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function dateTimeFilterToIso(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function modelName(models: AdminModel[], modelServiceId: string): string {
  return models.find(model => model.id === modelServiceId)?.displayName ?? modelServiceId
}

function memoryStatusClass(status: AdminMemoryGovernanceResponse['users'][number]['isolationStatus']): string {
  if (status === 'isolated') return 'compatible'
  if (status === 'namespace_conflict') return 'unavailable'
  return 'degraded'
}
