'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DesignEvent } from '@dudesign/contracts'
import { CodeFileTrace, CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { apiUrl, getDesignJob, subscribeToJob, type JobSnapshot, type VariationSnapshot } from '@/lib/api'

type ArtifactQuality = NonNullable<JobSnapshot['artifacts'][number]['quality']>

type StreamLine = {
  id: string
  variationId?: string
  variationLabel: string
  stage: 'queued' | 'thinking' | 'writing' | 'preview' | 'completed' | 'failed' | 'warning' | 'job'
  summary: string
  detail?: string
}

type CodeStreamState = {
  path: string
  language: CodeFile['language']
  text: string
  sequence: number
  isFinal: boolean
}

type CodeFileSet = {
  files: Record<string, CodeStreamState>
  activePath: string
}

type VariationViewMode = 'preview' | 'code'

export default function JobPage(props: { params: Promise<{ jobId: string }> }): React.JSX.Element {
  const [jobId, setJobId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null)
  const [streamLines, setStreamLines] = useState<StreamLine[]>([])
  const [qualityByVariation, setQualityByVariation] = useState<Record<string, ArtifactQuality>>({})
  const [codeStreams, setCodeStreams] = useState<Record<string, CodeFileSet>>({})
  const [viewModes, setViewModes] = useState<Record<string, VariationViewMode>>({})
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

  useEffect(() => {
    if (!jobId) return
    if (snapshot?.job.status === 'completed' || snapshot?.job.status === 'failed' || snapshot?.job.status === 'cancelled') return
    const interval = window.setInterval(() => {
      getDesignJob(jobId)
        .then(data => {
          setSnapshot(data)
          if (data.job.status === 'completed' || data.job.status === 'failed' || data.job.status === 'cancelled') {
            setStreamState('closed')
          }
        })
        .catch(err => setError((err as Error).message))
    }, 3000)
    return () => window.clearInterval(interval)
  }, [jobId, snapshot?.job.status])

  const variations = snapshot?.variations ?? []
  const completedCount = variations.filter(variation => variation.status === 'completed').length
  const failedCount = variations.filter(variation => variation.status === 'failed').length

  function applyEvent(event: DesignEvent): void {
    const activity = activityFromEvent(event, snapshot?.variations ?? [])
    if (activity) {
      setStreamLines(lines => [
        { ...activity, id: `${event.timestamp}-${lines.length}` },
        ...lines,
      ].slice(0, 24))
    }
    if (event.type === 'design.runtime_warning' && event.variationId && event.payload.code === 'ARTIFACT_QUALITY_GATE') {
      setQualityByVariation(current => ({
        ...current,
        [event.variationId!]: {
          status: event.payload.severity === 'error' ? 'fail' : 'warn',
          issues: [event.payload.message],
        },
      }))
    }
    if (event.type === 'design.variation_code_delta' && event.variationId) {
      setCodeStreams(current => {
        const previousSet = current[event.variationId!]
        const previousFile = previousSet?.files[event.payload.path]
        const nextText = `${previousFile?.text ?? ''}${event.payload.delta}`
        const nextFile = {
          path: event.payload.path,
          language: event.payload.language,
          text: nextText.slice(-6000),
          sequence: Math.max(previousFile?.sequence ?? 0, event.payload.sequence),
          isFinal: event.payload.isFinal ?? previousFile?.isFinal ?? false,
        }
        return {
          ...current,
          [event.variationId!]: {
            activePath: previousSet?.activePath ?? event.payload.path,
            files: {
              ...(previousSet?.files ?? {}),
              [event.payload.path]: nextFile,
            },
          },
        }
      })
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
          <p>
            {completedCount} of {variations.length || snapshot?.job.variationCount || 0} variations completed
            {failedCount > 0 ? ` · ${failedCount} failed` : ''}
            {' '}· stream {streamState}
          </p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section data-testid="variation-grid" className="variation-grid">
        {variations.map(variation => {
          const codeFiles = codeStreams[variation.id]
          const viewMode = viewModes[variation.id] ?? 'preview'
          const showCode = Boolean(codeFiles) && (!variation.previewUrl || viewMode === 'code')
          const quality = qualityByVariation[variation.id] ?? qualityForVariation(snapshot, variation)
          return (
            <article key={variation.id} data-testid="variation-card" className="variation-card">
              <div className="variation-card-header">
                <span><i className={`status-dot ${variation.status}`} /> {variation.title ?? `Variation ${variation.index}`}</span>
                <span>{variation.status}</span>
              </div>
              {quality && quality.status !== 'pass' ? (
                <div className={`quality-banner ${quality.status}`} data-testid="variation-quality-banner">
                  <strong>{quality.status === 'fail' ? 'Quality failed' : 'Quality warning'}</strong>
                  <span>{quality.issues[0] ?? 'Generated artifact needs attention.'}</span>
                </div>
              ) : null}
              {variation.previewUrl && codeFiles ? (
                <div className="variation-view-tabs" role="tablist" aria-label={`${variation.title ?? variation.id} view`}>
                  <button
                    type="button"
                    className={viewMode === 'preview' ? 'active' : ''}
                    onClick={() => setViewModes(current => ({ ...current, [variation.id]: 'preview' }))}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'code' ? 'active' : ''}
                    onClick={() => setViewModes(current => ({ ...current, [variation.id]: 'code' }))}
                  >
                    Code
                  </button>
                </div>
              ) : null}
              <div className="preview-frame">
                {showCode && codeFiles ? (
                  <CodeFileViewer
                    files={codeFilesForViewer(codeFiles)}
                    activePath={codeFiles.activePath}
                    testId="variation-code-stream"
                    statusLabel={activeStatusLabel(codeFiles)}
                    onSelectPath={path => setCodeStreams(current => ({
                      ...current,
                      [variation.id]: {
                        ...current[variation.id]!,
                        activePath: path,
                      },
                    }))}
                  />
                ) : variation.screenshotUrl ? (
                  <img
                    data-testid="variation-card-preview-frame"
                    className="variation-screenshot"
                    alt={variation.title ?? `Variation ${variation.index} screenshot`}
                    src={apiUrl(variation.screenshotUrl)}
                  />
                ) : variation.previewUrl ? (
                  <iframe
                    data-testid="variation-card-preview-frame"
                    title={variation.title ?? variation.id}
                    src={apiUrl(variation.previewUrl)}
                    sandbox=""
                  />
                ) : (
                  <div className="preview-placeholder">
                    {variation.status === 'failed'
                      ? (variation.errorMessage ?? 'Generation failed')
                      : 'Waiting for preview'}
                  </div>
                )}
              </div>
              {codeFiles && variation.previewUrl && viewMode === 'preview' ? (
                <CodeFileTrace files={codeFilesForViewer(codeFiles)} activePath={codeFiles.activePath} testId="variation-code-stream" />
              ) : null}
              <div className="variation-meta">
                <span>{variation.outputTokens.toLocaleString()} tok</span>
                <span>${(variation.costCents / 100).toFixed(2)}</span>
              </div>
              <div className="variation-actions">
                <a data-testid="open-variation-link" href={`/variations/${variation.id}`}>Open</a>
              </div>
            </article>
          )
        })}
      </section>

      <aside className="stream-panel" data-testid="runtime-activity">
        <strong>Runtime activity</strong>
        {streamLines.length === 0 ? <p>No activity yet.</p> : null}
        {streamLines.map(line => (
          <div key={line.id} className="activity-row" data-stage={line.stage}>
            <span>{line.variationLabel}</span>
            <strong>{line.summary}</strong>
            {line.detail ? <p>{line.detail}</p> : null}
          </div>
        ))}
      </aside>
    </main>
  )
}

function activityFromEvent(event: DesignEvent, variations: VariationSnapshot[]): Omit<StreamLine, 'id'> | null {
  const variation = event.variationId ? variations.find(item => item.id === event.variationId) : null
  const inferredIndex = variation?.index ?? inferVariationIndex(event)
  const variationLabel = inferredIndex
    ? `Variation ${String(inferredIndex).padStart(2, '0')}`
    : event.variationId
      ? 'Variation'
      : 'Job'
  switch (event.type) {
    case 'design.variation_queued':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'queued',
        summary: 'Agent queued',
        detail: runtimeRefs(event.payload.runtimeChildSessionId, event.payload.runtimeAgentJobId),
      }
    case 'design.variation_streaming':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: event.payload.channel === 'thinking' ? 'thinking' : 'writing',
        summary: event.payload.channel === 'thinking' ? 'Planning the design' : 'Working on the page',
        detail: summarizeRuntimeDelta(event.payload.delta),
      }
    case 'design.variation_code_delta':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'writing',
        summary: event.payload.isFinal ? `Finished ${event.payload.path}` : `Writing ${event.payload.path}`,
        detail: `${event.payload.language} · ${event.payload.delta.length.toLocaleString()} chars`,
      }
    case 'design.variation_preview_ready':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'preview',
        summary: 'Preview is ready',
        detail: event.payload.previewUrl,
      }
    case 'design.variation_completed':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'completed',
        summary: 'Agent completed this variation',
        detail: tokenSummary(event.payload.inputTokens, event.payload.outputTokens, event.payload.costCents),
      }
    case 'design.variation_failed':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'failed',
        summary: 'Agent failed',
        detail: `${event.payload.errorCode}: ${event.payload.message}`,
      }
    case 'design.runtime_warning':
      return {
        variationId: event.variationId,
        variationLabel,
        stage: 'warning',
        summary: event.payload.code === 'ARTIFACT_QUALITY_GATE' ? 'Preview quality warning' : 'Runtime warning',
        detail: event.payload.message,
      }
    case 'design.job_completed':
      return {
        variationLabel,
        stage: 'job',
        summary: 'Parallel generation finished',
        detail: `${event.payload.completedVariationCount} completed · ${event.payload.failedVariationCount} failed`,
      }
    default:
      return null
  }
}

function inferVariationIndex(event: DesignEvent): number | null {
  if (event.type === 'design.variation_queued' && typeof event.payload.index === 'number') return event.payload.index
  if (event.variationId) {
    const match = event.variationId.match(/(?:variation_|runtime_variation_)(\d+)/)
    if (match?.[1]) return Number(match[1])
  }
  if (event.type === 'design.variation_streaming') {
    const match = event.payload.delta.match(/variation\s+(\d+)/i)
    if (match?.[1]) return Number(match[1])
  }
  return null
}

function summarizeRuntimeDelta(delta: string): string | undefined {
  const normalized = delta.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (/BabeL-O execution started/i.test(normalized)) return 'Started BabeL-O execution.'
  if (/index\.html/i.test(normalized)) return 'Preparing the HTML entry file.'
  if (/style|css/i.test(normalized)) return 'Working on layout and visual styling.'
  if (/script|javascript|interaction/i.test(normalized)) return 'Checking interactive behavior.'
  if (/error|failed|timeout/i.test(normalized)) return normalized.slice(0, 160)
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
}

function runtimeRefs(runtimeChildSessionId?: string, runtimeAgentJobId?: string): string | undefined {
  const parts = [
    runtimeChildSessionId && `session ${runtimeChildSessionId}`,
    runtimeAgentJobId && `agent ${runtimeAgentJobId}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function tokenSummary(inputTokens?: number, outputTokens?: number, costCents?: number): string | undefined {
  const tokens = [inputTokens, outputTokens].some(value => typeof value === 'number')
    ? `${(inputTokens ?? 0).toLocaleString()} in · ${(outputTokens ?? 0).toLocaleString()} out`
    : null
  const cost = typeof costCents === 'number' ? `$${(costCents / 100).toFixed(2)}` : null
  return [tokens, cost].filter(Boolean).join(' · ') || undefined
}

function codeFilesForViewer(fileSet: CodeFileSet): CodeFile[] {
  return Object.values(fileSet.files).map(file => ({
    path: file.path,
    language: file.language,
    content: file.text,
    isFinal: file.isFinal,
  }))
}

function activeStatusLabel(fileSet: CodeFileSet): string {
  const active = fileSet.files[fileSet.activePath] ?? Object.values(fileSet.files)[0]
  return active?.isFinal ? 'readying preview' : 'writing'
}

function qualityForVariation(snapshot: JobSnapshot | null, variation: VariationSnapshot): ArtifactQuality | null {
  if (!snapshot || !variation.currentArtifactId) return null
  return snapshot.artifacts.find(artifact => artifact.id === variation.currentArtifactId)?.quality ?? null
}

function updateVariationFromEvent(variation: VariationSnapshot, event: DesignEvent): VariationSnapshot {
  if (variation.id !== event.variationId) return variation
  switch (event.type) {
    case 'design.variation_queued':
      return { ...variation, status: 'queued' }
    case 'design.variation_streaming':
      return { ...variation, status: 'streaming' }
    case 'design.variation_code_delta':
      return { ...variation, status: 'streaming' }
    case 'design.variation_preview_ready':
      return {
        ...variation,
        status: 'rendering_preview',
        currentArtifactId: event.payload.artifactId,
        previewUrl: event.payload.previewUrl,
        screenshotUrl: event.payload.screenshotUrl ?? variation.screenshotUrl,
      }
    case 'design.variation_completed':
      return {
        ...variation,
        status: 'completed',
        currentArtifactId: event.payload.artifactId ?? variation.currentArtifactId,
        screenshotUrl: event.payload.screenshotUrl ?? variation.screenshotUrl,
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
