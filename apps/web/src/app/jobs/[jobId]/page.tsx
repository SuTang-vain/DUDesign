'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DesignEvent } from '@dudesign/contracts'
import { apiUrl, getDesignJob, subscribeToJob, type JobSnapshot, type VariationSnapshot } from '@/lib/api'

type StreamLine = {
  id: string
  variationId?: string
  text: string
}

export default function JobPage(props: { params: Promise<{ jobId: string }> }): React.JSX.Element {
  const [jobId, setJobId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null)
  const [streamLines, setStreamLines] = useState<StreamLine[]>([])
  const [streamState, setStreamState] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    props.params.then(params => setJobId(params.jobId)).catch(err => setError((err as Error).message))
  }, [props.params])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    getDesignJob(jobId)
      .then(data => {
        if (!cancelled) setSnapshot(data)
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    if (!jobId) return
    const unsubscribe = subscribeToJob(jobId, {
      onOpen: () => setStreamState('open'),
      onError: () => setStreamState(state => (state === 'closed' ? state : 'error')),
      onEvent: event => {
        applyEvent(event)
        if (event.type === 'design.job_completed') setStreamState('closed')
      },
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const variations = snapshot?.variations ?? []
  const completedCount = variations.filter(variation => variation.status === 'completed').length

  function applyEvent(event: DesignEvent): void {
    if (event.type === 'design.variation_streaming') {
      setStreamLines(lines => [
        {
          id: `${event.timestamp}-${lines.length}`,
          variationId: event.variationId,
          text: event.payload.delta,
        },
        ...lines,
      ].slice(0, 24))
    }
    setSnapshot(current => {
      if (!current) return current
      if (event.type === 'design.job_completed') {
        return { ...current, job: { ...current.job, status: 'completed' } }
      }
      if (!event.variationId) return current
      return {
        ...current,
        variations: current.variations.map(variation => updateVariationFromEvent(variation, event)),
      }
    })
  }

  const pageTitle = useMemo(() => {
    if (!snapshot) return 'Building variations'
    return snapshot.job.prompt.length > 96 ? `${snapshot.job.prompt.slice(0, 96)}...` : snapshot.job.prompt
  }, [snapshot])

  return (
    <main className="job-shell">
      <header className="job-header">
        <a href="/" className="back-link">← New prompt</a>
        <div>
          <span className="eyebrow">Building from</span>
          <h1>{pageTitle}</h1>
          <p>{completedCount} of {variations.length || snapshot?.job.variationCount || 0} variations completed · stream {streamState}</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section data-testid="variation-grid" className="variation-grid">
        {variations.map(variation => (
          <article key={variation.id} data-testid="variation-card" className="variation-card">
            <div className="variation-card-header">
              <span><i className={`status-dot ${variation.status}`} /> {variation.title ?? `Variation ${variation.index}`}</span>
              <span>{variation.status}</span>
            </div>
            <div className="preview-frame">
              {variation.previewUrl ? (
                <iframe title={variation.title ?? variation.id} src={apiUrl(variation.previewUrl)} sandbox="" />
              ) : (
                <div className="preview-placeholder">Waiting for preview</div>
              )}
            </div>
            <div className="variation-meta">
              <span>{variation.outputTokens.toLocaleString()} tok</span>
              <span>${(variation.costCents / 100).toFixed(2)}</span>
            </div>
            <div className="variation-actions">
              <a data-testid="open-variation-link" href={`/variations/${variation.id}`}>Open</a>
            </div>
          </article>
        ))}
      </section>

      <aside className="stream-panel">
        <strong>Runtime stream</strong>
        {streamLines.length === 0 ? <p>No stream lines yet.</p> : null}
        {streamLines.map(line => (
          <p key={line.id}>{line.text}</p>
        ))}
      </aside>
    </main>
  )
}

function updateVariationFromEvent(variation: VariationSnapshot, event: DesignEvent): VariationSnapshot {
  if (variation.id !== event.variationId) return variation
  switch (event.type) {
    case 'design.variation_queued':
      return { ...variation, status: 'queued' }
    case 'design.variation_streaming':
      return { ...variation, status: 'streaming' }
    case 'design.variation_preview_ready':
      return {
        ...variation,
        status: 'rendering_preview',
        currentArtifactId: event.payload.artifactId,
        previewUrl: event.payload.previewUrl,
      }
    case 'design.variation_completed':
      return {
        ...variation,
        status: 'completed',
        currentArtifactId: event.payload.artifactId ?? variation.currentArtifactId,
        inputTokens: event.payload.inputTokens ?? variation.inputTokens,
        outputTokens: event.payload.outputTokens ?? variation.outputTokens,
        costCents: event.payload.costCents ?? variation.costCents,
      }
    case 'design.variation_failed':
      return {
        ...variation,
        status: 'failed',
        errorCode: event.payload.errorCode,
        errorMessage: event.payload.message,
      }
    default:
      return variation
  }
}
