'use client'

import type { RuntimeHealthResponse } from '@/lib/adminApi'

type RuntimeHealthPanelProps = {
  runtime: RuntimeHealthResponse | null
  loading: boolean
}

export function RuntimeHealthPanel({ runtime, loading }: RuntimeHealthPanelProps): React.JSX.Element {
  const status = runtime?.runtime.status ?? (loading ? 'loading' : 'unknown')
  const mappedEventCount = runtime ? Object.keys(runtime.contract.eventMappings).length : 0
  const requiredEndpoints = runtime?.contract.requiredEndpoints ?? []

  return (
    <>
      <section className="panel" data-testid="runtime-health-panel">
        <div className="panel-header">
          <h2>Runtime Health</h2>
          <span className={`status-pill ${runtime?.runtime.status ?? ''}`} data-testid="runtime-status-pill">
            {status}
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
        {runtime?.runtime.message ? <p className="muted">{runtime.runtime.message}</p> : null}
      </section>

      <section className="panel" data-testid="runtime-endpoints-panel">
        <div className="panel-header">
          <h2>Required Endpoints</h2>
          <span className="status-pill">{requiredEndpoints.length}</span>
        </div>
        {requiredEndpoints.length === 0 ? (
          <p className="muted">No required endpoints loaded.</p>
        ) : (
          <div className="list">
            {requiredEndpoints.map(endpoint => (
              <div className="audit-row" key={endpoint}>
                <strong>{endpoint}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
