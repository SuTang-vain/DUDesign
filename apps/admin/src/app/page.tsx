'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  cancelJob,
  getAdminArtifacts,
  getAdminJobs,
  getAuditLogs,
  getCostSummary,
  getRuntimeHealth,
  getUserSupport,
  retryJob,
  type AdminArtifact,
  type AdminJob,
  type AdminRole,
  type AdminUserSupportResponse,
  type AuditLog,
  type CostSummaryResponse,
  type RuntimeHealthResponse,
} from '@/lib/adminApi'

export default function AdminHomePage(): React.JSX.Element {
  const [role, setRole] = useState<AdminRole>('operator')
  const [runtime, setRuntime] = useState<RuntimeHealthResponse | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [artifacts, setArtifacts] = useState<AdminArtifact[]>([])
  const [supportUsers, setSupportUsers] = useState<AdminUserSupportResponse['users']>([])
  const [costs, setCosts] = useState<CostSummaryResponse | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [artifactJobFilter, setArtifactJobFilter] = useState('')
  const [artifactKindFilter, setArtifactKindFilter] = useState('')
  const [supportQuery, setSupportQuery] = useState('usr_dev')
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
  }, [role, statusFilter])

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
      await Promise.all([refreshJobs(), refreshArtifacts(), refreshSupport()])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshJobs(): Promise<void> {
    try {
      const [jobData, costData] = await Promise.all([
        getAdminJobs(role, { status: statusFilter || undefined }),
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

  const mappedEventCount = useMemo(() => {
    return runtime ? Object.keys(runtime.contract.eventMappings).length : 0
  }, [runtime])

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <strong>DUDesign Admin</strong>
        </div>
        <nav className="nav-stack" aria-label="Admin sections">
          <button className="nav-item active">Runtime Health</button>
          <button className="nav-item active">Job Controls</button>
          <button className="nav-item active">Artifacts</button>
          <button className="nav-item active">User Support</button>
          <button className="nav-item active">Audit Log</button>
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
            <select value={role} onChange={event => setRole(event.target.value as AdminRole)}>
              <option value="support">support</option>
              <option value="operator">operator</option>
              <option value="developer">developer</option>
            </select>
          </label>
        </header>

        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="success">{notice}</p> : null}

        <div className="grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Runtime Health</h2>
              <span className={`status-pill ${runtime?.runtime.status ?? ''}`}>
                {runtime?.runtime.status ?? (loading ? 'loading' : 'unknown')}
              </span>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <span>Runtime</span>
                <strong>{runtime?.runtime.runtime ?? 'babel-o'}</strong>
              </div>
              <div className="metric">
                <span>Runtime version</span>
                <strong>{runtime?.runtime.runtimeVersion ?? 'unknown'}</strong>
              </div>
              <div className="metric">
                <span>Contract</span>
                <strong>{runtime?.contract.contractVersion ?? 'not loaded'}</strong>
              </div>
              <div className="metric">
                <span>Event mappings</span>
                <strong>{mappedEventCount}</strong>
              </div>
            </div>
          </section>

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
                      <small>{job.userId} · {formatTime(job.updatedAt)}</small>
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
                  </article>
                ))}
              </div>
            )}
          </section>

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

          <section className="panel">
            <div className="panel-header">
              <h2>Required Endpoints</h2>
              <span className="status-pill">{runtime?.contract.requiredEndpoints.length ?? 0}</span>
            </div>
            <div className="list">
              {(runtime?.contract.requiredEndpoints ?? []).map((endpoint: string) => (
                <div className="audit-row" key={endpoint}>
                  <strong>{endpoint}</strong>
                </div>
              ))}
            </div>
          </section>

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
