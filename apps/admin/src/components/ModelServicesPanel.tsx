'use client'

import type { AdminModel, AdminRole, SyncAdminModelsResponse } from '@/lib/adminApi'

type ModelServicesPanelProps = {
  role: AdminRole
  loading: boolean
  models: AdminModel[]
  syncSummary: SyncAdminModelsResponse | null
  onRefresh: () => void
  onSync: () => void
  onToggleModel: (model: AdminModel, enabled: boolean) => void
  onSetDefault: (model: AdminModel) => void
}

export function ModelServicesPanel({
  role,
  loading,
  models,
  syncSummary,
  onRefresh,
  onSync,
  onToggleModel,
  onSetDefault,
}: ModelServicesPanelProps): React.JSX.Element {
  return (
    <section className="panel wide-panel" data-testid="model-services-panel">
      <div className="panel-header">
        <h2>Model Services</h2>
        <div className="filter-row">
          <button className="secondary-button" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
          <button className="primary-button" onClick={onSync} disabled={loading || role === 'support'} data-testid="sync-models-button">
            Sync from Babel-O
          </button>
        </div>
      </div>
      {syncSummary ? <ModelSyncSummary summary={syncSummary} /> : null}
      {models.length === 0 ? (
        <p className="muted">No model services are configured.</p>
      ) : (
        <div className="model-table">
          <div className="model-table-head">
            <span>Model</span>
            <span>Status</span>
            <span>Capabilities</span>
            <span>Cost</span>
            <span>Actions</span>
          </div>
          {models.map(model => (
            <article className="model-row" key={model.id}>
              <div>
                <strong>{model.displayName}</strong>
                <p>{model.provider} · {model.modelId}</p>
                <small>{model.description ?? 'No description'}</small>
                <div className="model-source-row">
                  <span>{modelMetadataText(model, 'source') ?? 'unknown source'}</span>
                  <span>{modelMetadataText(model, 'runtimeProviderId') ?? 'no runtime provider'}</span>
                  <span>{modelMetadataText(model, 'runtimeProviderAuthSource') ?? 'auth unknown'}</span>
                  <span>{formatMetadataTime(modelMetadataText(model, 'runtimeSyncedAt'))}</span>
                  {modelMetadataBool(model, 'runtimeMissingSinceLastSync') ? <span>missing from runtime</span> : null}
                </div>
              </div>
              <div className="compact-metrics">
                <span className={`status-pill ${model.enabled ? 'compatible' : 'unavailable'}`}>
                  {model.enabled ? 'enabled' : 'disabled'}
                </span>
                {model.isDefault ? <span className="status-pill compatible">default</span> : null}
              </div>
              <div className="compact-metrics">
                <span>{model.capabilities.join(', ')}</span>
                <span>{model.contextWindow ? `${model.contextWindow.toLocaleString()} ctx` : 'no ctx limit'}</span>
              </div>
              <div className="compact-metrics">
                <span>in {model.inputTokenCostCents}c</span>
                <span>out {model.outputTokenCostCents}c</span>
              </div>
              <div className="row-actions">
                <button className="secondary-button" onClick={() => onToggleModel(model, !model.enabled)} disabled={loading}>
                  {model.enabled ? 'Disable' : 'Enable'}
                </button>
                <button className="secondary-button" onClick={() => onSetDefault(model)} disabled={loading || model.isDefault}>
                  Make default
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ModelSyncSummary({ summary }: { summary: SyncAdminModelsResponse }): React.JSX.Element {
  return (
    <div className="model-sync-panel" data-testid="model-sync-summary">
      <div className="model-sync-metrics">
        {summary.runtime.discoveryStatus === 'unsupported' ? (
          <span className="status-pill unavailable">discovery unsupported</span>
        ) : null}
        <span>{summary.createdCount} created</span>
        <span>{summary.updatedCount} updated</span>
        <span>{summary.missingCount} missing</span>
        <span>{summary.disabledMissingCount} disabled</span>
        <span>{formatTime(summary.runtime.syncedAt)}</span>
        <span>audit {summary.audit.id}</span>
      </div>
      {summary.diff.length > 0 ? (
        <div className="model-sync-diff" data-testid="model-sync-diff">
          {summary.diff.slice(0, 8).map(item => (
            <div className="model-sync-diff-row" key={`${item.changeType}:${item.modelServiceId}`}>
              <span className={`status-pill ${item.changeType === 'missing' ? 'unavailable' : 'compatible'}`}>
                {item.changeType}
              </span>
              <strong>{item.displayName}</strong>
              <span>{item.runtimeProviderId ?? 'no provider'}</span>
              <span>{formatContextDiff(item.previousContextWindow, item.nextContextWindow)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {summary.runtime.discoveryStatus === 'unsupported'
            ? summary.runtime.message ?? 'Runtime model discovery is unsupported; configured model services were preserved.'
            : 'No model definition changes detected in the last sync.'}
        </p>
      )}
    </div>
  )
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function modelMetadataText(model: AdminModel, key: string): string | null {
  const value = model.metadata[key]
  return typeof value === 'string' && value ? value : null
}

function modelMetadataBool(model: AdminModel, key: string): boolean {
  return model.metadata[key] === true
}

function formatMetadataTime(value: string | null): string {
  return value ? formatTime(value) : 'not synced'
}

function formatContextDiff(previous: number | null | undefined, next: number | null | undefined): string {
  if (previous === next) return next ? `${next.toLocaleString()} ctx` : 'no ctx limit'
  const previousText = previous ? previous.toLocaleString() : 'none'
  const nextText = next ? next.toLocaleString() : 'none'
  return `${previousText} -> ${nextText} ctx`
}
