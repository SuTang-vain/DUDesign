'use client'

import { useEffect, useState } from 'react'
import { ModelServicesPanel } from '@/components/ModelServicesPanel'
import { RuntimeHealthPanel } from '@/components/RuntimeHealthPanel'
import {
  cancelJob,
  getAdminArtifacts,
  getAdminJobs,
  getAdminMcpInvocations,
  getAdminMcpSummary,
  getAdminModels,
  getAuditLogs,
  getCostSummary,
  getMemoryGovernance,
  getRuntimeHealth,
  getAdminTemplateGovernance,
  getUserModelAccess,
  getUserSupport,
  rebuildArtifactScreenshot,
  repairArtifactExport,
  retryJob,
  retryVariation,
  revokeArtifactShares,
  syncAdminModels,
  updateAdminModel,
  updateUserModelAccess,
  type AdminArtifact,
  type AdminJob,
  type AdminMcpInvocationAuditEntry,
  type AdminMcpInvocationSummaryResponse,
  type AdminModel,
  type AdminRole,
  type AdminMemoryGovernanceResponse,
  type AdminTemplateGovernanceResponse,
  type AdminUserModelAccess,
  type AdminUserSupportResponse,
  type AuditLog,
  type CostSummaryResponse,
  type RuntimeHealthResponse,
  type SyncAdminModelsResponse,
} from '@/lib/adminApi'

type AdminSection = 'runtime' | 'models' | 'templates' | 'jobs' | 'artifacts' | 'support' | 'memory' | 'audit'

const adminSections: Array<{ id: AdminSection; label: string }> = [
  { id: 'runtime', label: 'Runtime Health' },
  { id: 'models', label: 'Model Services' },
  { id: 'templates', label: 'Templates' },
  { id: 'jobs', label: 'Job Controls' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'support', label: 'User Support' },
  { id: 'memory', label: 'Memory' },
  { id: 'audit', label: 'Audit & MCP' },
]

export default function AdminHomePage(): React.JSX.Element {
  const [role, setRole] = useState<AdminRole>('operator')
  const [activeSection, setActiveSection] = useState<AdminSection>('runtime')
  const [runtime, setRuntime] = useState<RuntimeHealthResponse | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [mcpInvocations, setMcpInvocations] = useState<AdminMcpInvocationAuditEntry[]>([])
  const [mcpSummary, setMcpSummary] = useState<AdminMcpInvocationSummaryResponse | null>(null)
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [artifacts, setArtifacts] = useState<AdminArtifact[]>([])
  const [models, setModels] = useState<AdminModel[]>([])
  const [modelAccess, setModelAccess] = useState<AdminUserModelAccess[]>([])
  const [modelSyncSummary, setModelSyncSummary] = useState<SyncAdminModelsResponse | null>(null)
  const [templateGovernance, setTemplateGovernance] = useState<AdminTemplateGovernanceResponse | null>(null)
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
  const [mcpJobFilter, setMcpJobFilter] = useState('')
  const [mcpVariationFilter, setMcpVariationFilter] = useState('')
  const [mcpToolFilter, setMcpToolFilter] = useState('')
  const [mcpStatusFilter, setMcpStatusFilter] = useState('')
  const [mcpSummaryFromFilter, setMcpSummaryFromFilter] = useState('')
  const [mcpSummaryToFilter, setMcpSummaryToFilter] = useState('')
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

  useEffect(() => {
    void refreshMcpInvocations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, mcpJobFilter, mcpVariationFilter, mcpToolFilter, mcpStatusFilter])

  useEffect(() => {
    void refreshMcpSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, mcpSummaryFromFilter, mcpSummaryToFilter])

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
      await Promise.all([refreshJobs(), refreshArtifacts(), refreshMcpInvocations(), refreshMcpSummary(), refreshSupport(), refreshMemory(), refreshModels(), refreshModelAccess(), refreshTemplateGovernance()])
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

  async function refreshMcpInvocations(): Promise<void> {
    try {
      const data = await getAdminMcpInvocations(role, {
        jobId: mcpJobFilter.trim() || undefined,
        variationId: mcpVariationFilter.trim() || undefined,
        mcpToolId: mcpToolFilter.trim() || undefined,
        status: mcpStatusFilter || undefined,
        limit: 50,
      })
      setMcpInvocations(data.invocations)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function refreshMcpSummary(): Promise<void> {
    try {
      const data = await getAdminMcpSummary(role, {
        createdFrom: dateTimeFilterToIso(mcpSummaryFromFilter),
        createdTo: dateTimeFilterToIso(mcpSummaryToFilter),
        limit: 1000,
      })
      setMcpSummary(data)
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

  async function refreshTemplateGovernance(): Promise<void> {
    try {
      const templates = await getAdminTemplateGovernance(role)
      setTemplateGovernance(templates)
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

  async function runArtifactAction(
    artifact: AdminArtifact,
    action: 'rebuild-screenshot' | 'repair-export' | 'revoke-shares',
  ): Promise<void> {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      if (action === 'rebuild-screenshot') {
        const result = await rebuildArtifactScreenshot(role, artifact.id, `Rebuild screenshot for ${artifact.id}`)
        setNotice(`Queued screenshot rebuild for ${artifact.id}; queue ${result.queueJob?.id ?? 'n/a'}`)
      } else if (action === 'repair-export') {
        const result = await repairArtifactExport(role, artifact.id, `Repair export for ${artifact.id}`)
        setNotice(`Repaired export ${result.exportArtifact?.id ?? artifact.id}`)
      } else {
        const result = await revokeArtifactShares(role, artifact.id, `Revoke shares for ${artifact.id}`)
        setNotice(`Revoked ${result.revokedCount ?? 0} shares for ${artifact.id}`)
      }
      await Promise.all([
        refreshArtifacts(),
        role === 'support' ? Promise.resolve() : getAuditLogs(role).then(data => setAuditLogs(data.auditLogs)),
      ])
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

          {activeSection === 'templates' ? (
          <section className="panel wide-panel">
            <div className="panel-header">
              <div>
                <h2>Template Governance</h2>
                <p className="muted">Official scene templates, visual profiles, palettes, brand references, and business template packages are tracked here as CAP-6 governance assets.</p>
              </div>
              <button className="secondary-button" onClick={() => void refreshTemplateGovernance()} disabled={loading}>
                Refresh templates
              </button>
            </div>
            <div className="metric-grid template-metrics">
              <div className="metric">
                <span>Registry assets</span>
                <strong>{templateGovernance?.registryTotals.total ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Scenes</span>
                <strong>{templateGovernance?.registryTotals['scene-template'] ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Visual / palette / brand</span>
                <strong>{(templateGovernance?.registryTotals['visual-profile'] ?? 0) + (templateGovernance?.registryTotals['color-palette'] ?? 0) + (templateGovernance?.registryTotals['brand-reference'] ?? 0)}</strong>
              </div>
              <div className="metric">
                <span>Lint warnings</span>
                <strong>{(templateGovernance?.registryTotals.warning ?? 0) + (templateGovernance?.registryTotals.blocked ?? 0)}</strong>
              </div>
            </div>
            <div className="capability-strip">
              <span>write mode: {templateGovernance?.governance.writeMode ?? 'unknown'}</span>
              <span>publish: {templateGovernance?.governance.canPublish ? 'allowed' : 'restricted'}</span>
              <span>registry edit: {templateGovernance?.governance.canEditRegistry ? 'developer' : 'restricted'}</span>
            </div>
            <p className="muted">{templateGovernance?.governance.message ?? 'Template governance has not loaded yet.'}</p>
            {!templateGovernance || templateGovernance.templates.length === 0 ? (
              <p className="muted">No template governance entries loaded.</p>
            ) : (
              <>
              <div className="registry-governance-groups">
                {registryGroups(templateGovernance.registryAssets).map(group => (
                  <section className="registry-governance-group" key={group.type}>
                    <header>
                      <h3>{registryGroupTitle(group.type)}</h3>
                      <span className="status-pill">{group.assets.length}</span>
                    </header>
                    <div className="registry-asset-grid">
                      {group.assets.map(asset => (
                        <article className="registry-asset-card" key={asset.id}>
                          <div>
                            <strong>{asset.name}</strong>
                            <p>{asset.description}</p>
                            <small>{asset.id}{asset.version ? ` · v${asset.version}` : ''}</small>
                          </div>
                          <span className={`status-pill ${assetStatusClass(asset.status)}`}>{asset.status}</span>
                          <div className="template-token-grid compact">
                            {asset.summary.slice(0, 4).map(item => <span key={item}>{item}</span>)}
                          </div>
                          {asset.requiredActions.length > 0 ? (
                            <div className="finding-list">
                              {asset.requiredActions.slice(0, 3).map(action => (
                                <span className="severity warning" key={action}>{action}</span>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="template-governance-list">
                {templateGovernance.templates.map(template => (
                  <article className="template-governance-row" key={template.id}>
                    <header>
                      <div>
                        <strong>{template.name}</strong>
                        <p>{template.description ?? 'No description.'}</p>
                        <small>{template.id} · v{template.version} · {template.category}</small>
                      </div>
                      <div className="compact-metrics align-end">
                        <span className={`status-pill ${templateLintClass(template.lintStatus)}`}>{template.lintStatus}</span>
                        <span>{template.source} · {template.governanceStatus}</span>
                      </div>
                    </header>
                    <div className="template-token-grid">
                      <span>{template.colorTokenCount} colors</span>
                      <span>{template.componentCount} components</span>
                      <span>{template.sectionCount} sections</span>
                      <span>{coverageSummary(template.promptBlockCoverage)}</span>
                    </div>
                    {template.childTemplates.length > 0 ? (
                      <div className="subtemplate-strip">
                        {template.childTemplates.map(child => (
                          <span key={child.id} title={child.description}>{child.name}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="finding-list">
                      {template.findings.slice(0, 4).map(finding => (
                        <span className={`severity ${findingSeverityClass(finding.severity)}`} key={`${template.id}-${finding.code}`}>
                          {finding.code}: {finding.message}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              </>
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
                  <span>Actions</span>
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
                    <div className="row-actions artifact-actions">
                      {artifact.kind === 'html' ? (
                        <button className="secondary-button" type="button" onClick={() => void runArtifactAction(artifact, 'rebuild-screenshot')} disabled={loading || role === 'support'}>
                          Rebuild shot
                        </button>
                      ) : null}
                      {artifact.kind === 'html' || artifact.kind === 'export_zip' ? (
                        <button className="secondary-button" type="button" onClick={() => void runArtifactAction(artifact, 'repair-export')} disabled={loading || role === 'support'}>
                          Repair export
                        </button>
                      ) : null}
                      {artifact.shareCount > 0 ? (
                        <button className="secondary-button danger-button" type="button" onClick={() => void runArtifactAction(artifact, 'revoke-shares')} disabled={loading || role === 'support'}>
                          Revoke shares
                        </button>
                      ) : null}
                      {artifact.kind !== 'html' && artifact.kind !== 'export_zip' && artifact.shareCount === 0 ? (
                        <span className="muted">No actions</span>
                      ) : null}
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
          <section className="panel wide-panel" data-testid="mcp-health-panel">
            <div className="panel-header">
              <div>
                <h2>MCP Health</h2>
                <p className="muted">Democase service health, tool success rate, and recent invocation quality.</p>
              </div>
              <button className="secondary-button" onClick={() => void refreshMcpSummary()} disabled={loading}>
                Refresh health
              </button>
            </div>
            <div className="mcp-summary-filter-grid">
              <label>
                From
                <input
                  className="compact-input"
                  type="datetime-local"
                  value={mcpSummaryFromFilter}
                  onChange={event => setMcpSummaryFromFilter(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  className="compact-input"
                  type="datetime-local"
                  value={mcpSummaryToFilter}
                  onChange={event => setMcpSummaryToFilter(event.target.value)}
                />
              </label>
              <div className="compact-metrics">
                <span>range from {mcpSummary?.filters.createdFrom ? formatTime(mcpSummary.filters.createdFrom) : 'beginning'}</span>
                <span>range to {mcpSummary?.filters.createdTo ? formatTime(mcpSummary.filters.createdTo) : 'now'}</span>
              </div>
            </div>
            <div className="metric-grid mcp-health-metrics">
              <div className="metric">
                <span>Democase</span>
                <strong className={`severity ${mcpHealthSeverity(mcpSummary?.democase.healthStatus ?? 'no_data')}`}>
                  {mcpSummary?.democase.healthStatus ?? 'no_data'}
                </strong>
              </div>
              <div className="metric">
                <span>MCP calls</span>
                <strong>{mcpSummary?.totals.totalCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>Success rate</span>
                <strong>{formatRate(mcpSummary?.totals.successRate ?? 0)}</strong>
              </div>
              <div className="metric">
                <span>Unavailable</span>
                <strong>{mcpSummary?.totals.unavailableCount ?? 0}</strong>
              </div>
            </div>
            {mcpSummary?.democase.lastErrorMessage ? (
              <p className="error compact-error">
                {mcpSummary.democase.lastErrorCode ?? 'MCP_ERROR'}: {mcpSummary.democase.lastErrorMessage}
              </p>
            ) : (
              <p className="muted">
                Last democase call: {mcpSummary?.democase.lastInvokedAt ? formatTime(mcpSummary.democase.lastInvokedAt) : 'No democase MCP calls yet.'}
              </p>
            )}
            {!mcpSummary || mcpSummary.tools.length === 0 ? (
              <p className="muted">No MCP tool activity has been recorded yet.</p>
            ) : (
              <div className="mcp-tool-health-list" data-testid="mcp-tool-health-list">
                {mcpSummary.tools.map(tool => (
                  <article className="mcp-tool-health-row" data-testid="mcp-tool-health-row" key={tool.mcpToolId}>
                    <div>
                      <strong>{tool.mcpToolId}</strong>
                      <p>{tool.serverName}.{tool.toolName}</p>
                      {tool.lastErrorMessage ? <small>{tool.lastErrorCode ?? 'MCP_ERROR'}: {tool.lastErrorMessage}</small> : null}
                    </div>
                    <span className={`status-pill ${tool.lastStatus ? mcpStatusClass(tool.lastStatus) : ''}`}>
                      {tool.lastStatus ?? 'no_data'}
                    </span>
                    <div className="compact-metrics">
                      <span>{tool.totalCount} calls</span>
                      <span>{formatRate(tool.successRate)} success</span>
                      <span>{formatRate(tool.unavailableRate)} unavailable</span>
                    </div>
                    <div className="compact-metrics replay-key">
                      <span>{tool.lastInvokedAt ? formatTime(tool.lastInvokedAt) : 'never'}</span>
                      <span>{tool.lastReplayKey ?? 'no replay key'}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'audit' ? (
          <section className="panel wide-panel" data-testid="mcp-invocation-audit-panel">
            <div className="panel-header">
              <div>
                <h2>MCP Invocation Audit</h2>
                <p className="muted">Search authorized tool calls, denials, unavailable transports, and replay keys without exposing raw tool input.</p>
              </div>
              <button className="secondary-button" onClick={() => void refreshMcpInvocations()} disabled={loading}>
                Refresh MCP
              </button>
            </div>
            <div className="mcp-filter-grid">
              <label>
                Job
                <input
                  className="compact-input"
                  value={mcpJobFilter}
                  onChange={event => setMcpJobFilter(event.target.value)}
                  placeholder="job_..."
                />
              </label>
              <label>
                Variation
                <input
                  className="compact-input"
                  value={mcpVariationFilter}
                  onChange={event => setMcpVariationFilter(event.target.value)}
                  placeholder="var_..."
                />
              </label>
              <label>
                MCP tool
                <input
                  className="compact-input"
                  value={mcpToolFilter}
                  onChange={event => setMcpToolFilter(event.target.value)}
                  placeholder="mcp_..."
                />
              </label>
              <label>
                Status
                <select value={mcpStatusFilter} onChange={event => setMcpStatusFilter(event.target.value)}>
                  <option value="">all statuses</option>
                  <option value="ok">ok</option>
                  <option value="denied">denied</option>
                  <option value="unavailable">unavailable</option>
                  <option value="error">error</option>
                </select>
              </label>
            </div>
            {mcpInvocations.length === 0 ? (
              <p className="muted">No MCP invocation records match the current filter.</p>
            ) : (
              <div className="mcp-audit-table" data-testid="mcp-invocation-audit-table">
                <div className="mcp-audit-head">
                  <span>Invocation</span>
                  <span>Status</span>
                  <span>Tool</span>
                  <span>Context</span>
                  <span>Replay</span>
                </div>
                {mcpInvocations.map(invocation => (
                  <article className="mcp-audit-row" data-testid="mcp-invocation-audit-row" key={invocation.invocationId}>
                    <div>
                      <strong>{invocation.invocationId}</strong>
                      <p>{invocation.summary ?? 'No summary.'}</p>
                      {invocation.errorMessage ? <small>{invocation.errorCode ?? 'MCP_ERROR'}: {invocation.errorMessage}</small> : null}
                    </div>
                    <span className={`status-pill ${mcpStatusClass(invocation.status)}`}>{invocation.status}</span>
                    <div className="compact-metrics">
                      <span>{invocation.mcpToolId}</span>
                      <span>{invocation.serverName}.{invocation.toolName}</span>
                      <span>{invocation.referenceCount} refs</span>
                    </div>
                    <div className="compact-metrics">
                      <span>{invocation.jobId}</span>
                      <span>{invocation.variationId ?? 'job-level'}</span>
                      <span>{formatTime(invocation.completedAt)}</span>
                    </div>
                    <div className="compact-metrics replay-key">
                      <span>{invocation.replayKey}</span>
                      <span>{invocation.runtimeContractVersion}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          ) : null}

          {activeSection === 'audit' ? (
          <section className="panel wide-panel">
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

function formatRate(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round(value * 100)}%`
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

function mcpStatusClass(status: AdminMcpInvocationAuditEntry['status']): string {
  if (status === 'ok') return 'compatible'
  if (status === 'denied' || status === 'unavailable') return 'degraded'
  return 'unavailable'
}

function mcpHealthSeverity(status: AdminMcpInvocationSummaryResponse['democase']['healthStatus']): string {
  if (status === 'healthy') return 'ok'
  if (status === 'degraded' || status === 'no_data') return 'warning'
  return 'blocked'
}

function templateLintClass(status: AdminTemplateGovernanceResponse['templates'][number]['lintStatus']): string {
  if (status === 'passed') return 'compatible'
  if (status === 'warning') return 'degraded'
  return 'unavailable'
}

function findingSeverityClass(severity: 'error' | 'warning' | 'info'): string {
  if (severity === 'error') return 'blocked'
  if (severity === 'warning') return 'warning'
  return 'ok'
}

function coverageSummary(coverage: AdminTemplateGovernanceResponse['templates'][number]['promptBlockCoverage']): string {
  const passed = Object.values(coverage).filter(Boolean).length
  return `${passed}/${Object.keys(coverage).length} prompt fields`
}

function registryGroups(assets: AdminTemplateGovernanceResponse['registryAssets']): Array<{
  type: AdminTemplateGovernanceResponse['registryAssets'][number]['type']
  assets: AdminTemplateGovernanceResponse['registryAssets']
}> {
  const order: Array<AdminTemplateGovernanceResponse['registryAssets'][number]['type']> = [
    'scene-template',
    'visual-profile',
    'color-palette',
    'brand-reference',
    'design-template-pack',
    'business-template-package',
  ]
  return order
    .map(type => ({ type, assets: assets.filter(asset => asset.type === type) }))
    .filter(group => group.assets.length > 0)
}

function registryGroupTitle(type: AdminTemplateGovernanceResponse['registryAssets'][number]['type']): string {
  switch (type) {
    case 'scene-template': return 'Official Scene Templates'
    case 'visual-profile': return 'Official Visual Profiles'
    case 'color-palette': return 'Official Palettes'
    case 'brand-reference': return 'Official Brand References'
    case 'business-template-package': return 'Business Template Packages'
    case 'design-template-pack': return 'Official Design Template Packs'
  }
}

function assetStatusClass(status: AdminTemplateGovernanceResponse['registryAssets'][number]['status']): string {
  if (status === 'active') return 'compatible'
  if (status === 'warning') return 'degraded'
  return 'unavailable'
}
