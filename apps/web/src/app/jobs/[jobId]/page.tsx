'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { DesignEvent } from '@dudesign/contracts'
import { CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { UserActionCluster } from '@/components/UserActionCluster'
import { Icon } from '@/components/Icon'
import { useLanguage } from '@/components/LanguageProvider'
import { apiUrl, getDesignJob, subscribeToJob, type JobSnapshot, type VariationSnapshot } from '@/lib/api'
import { toUserFacingError, type UserFacingError } from '@/lib/userErrors'

type ArtifactQuality = NonNullable<JobSnapshot['artifacts'][number]['quality']>

type StreamLine = {
  id: string
  variationId?: string
  variationLabel: string
  stage: 'queued' | 'thinking' | 'writing' | 'preview' | 'completed' | 'failed' | 'warning' | 'job'
  summary: string
  detail?: string
}

type RawStreamLine = {
  id: string
  variationLabel: string
  channel: string
  delta: string
}

type CodeStreamState = {
  path: string
  language: CodeFile['language']
  text: string
  totalChars: number
  truncatedChars: number
  sequence: number
  isFinal: boolean
}

type CodeFileSet = {
  files: Record<string, CodeStreamState>
  activePath: string
}

type JobOutcome = {
  kind: 'partial' | 'failed'
  title: string
  message: string
}

export default function JobPage(props: { params: Promise<{ jobId: string }> }): React.JSX.Element {
  const { t } = useLanguage()
  const [jobId, setJobId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null)
  const [streamLines, setStreamLines] = useState<StreamLine[]>([])
  const [rawStreamLines, setRawStreamLines] = useState<RawStreamLine[]>([])
  const [qualityByVariation, setQualityByVariation] = useState<Record<string, ArtifactQuality>>({})
  const [codeStreams, setCodeStreams] = useState<Record<string, CodeFileSet>>({})
  const [streamState, setStreamState] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting')
  const [error, setError] = useState<string | null>(null)
  const activitySequence = useRef(0)

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
  const totalCount = variations.length || snapshot?.job.variationCount || 0
  const latestJobActivity = streamLines.find(line => line.stage === 'job')
  const runtimeProgress = totalCount > 0 ? Math.round(((completedCount + failedCount) / totalCount) * 100) : 0
  const jobOutcome = snapshot ? jobOutcomeForSnapshot(snapshot, completedCount, failedCount) : null
  const jobNotice = error
    ? toUserFacingError({ message: error, scope: 'job' })
    : streamState === 'error'
      ? toUserFacingError({ scope: 'stream', message: 'The live event stream disconnected.' })
      : null
  const activeCodeVariation = variations.find(variation => codeStreams[variation.id] && variation.status !== 'completed' && variation.status !== 'failed')
    ?? variations.find(variation => codeStreams[variation.id])
  const activeCodeSet = activeCodeVariation ? codeStreams[activeCodeVariation.id] : null

  function applyEvent(event: DesignEvent): void {
    const activity = activityFromEvent(event, snapshot?.variations ?? [])
    if (activity) {
      const lineId = `${event.timestamp}-${activitySequence.current++}`
      setStreamLines(lines => [
        { ...activity, id: lineId },
        ...lines,
      ].slice(0, 24))
    }
    if (event.type === 'design.variation_streaming') {
      const rawLine = rawStreamLineFromEvent(event, snapshot?.variations ?? [], activitySequence.current++)
      setRawStreamLines(lines => [rawLine, ...lines].slice(0, 32))
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
        const previousTotal = previousFile?.totalChars ?? previousFile?.text.length ?? 0
        const totalChars = previousTotal + event.payload.delta.length
        const nextText = `${previousFile?.text ?? ''}${event.payload.delta}`
        const retainedText = nextText.slice(-6000)
        const truncatedChars = Math.max(previousFile?.truncatedChars ?? 0, totalChars - retainedText.length)
        const nextFile = {
          path: event.payload.path,
          language: event.payload.language,
          text: retainedText,
          totalChars,
          truncatedChars,
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

  const streaming = streamState === 'open' || streamState === 'connecting'

  return (
    <main className="job-shell">
      <header className="job-topbar">
        <div className="left">
          <a href="/" className="back-link"><Icon name="arrowLeft" size={15} /> {t('backToWorkspace')}</a>
          <div>
            <span className="eyebrow">{t('jobEyebrow')} · #{jobId ?? '…'}</span>
            <h1>{pageTitle}</h1>
            <p>
              {completedCount} / {totalCount} {t('variationsCompleted')}
              {failedCount > 0 ? ` · ${failedCount} ${t('failedLabel')}` : ''}
              {' '}· {streamState}
            </p>
          </div>
        </div>
        <div className="right">
          {streaming ? (
            <span className="chip info"><span className="dot live pulse"></span>{t('streaming')}</span>
          ) : null}
          <UserActionCluster />
        </div>
      </header>

      {jobNotice ? <UserNotice notice={jobNotice} onRetry={() => window.location.reload()} /> : null}
      {jobOutcome ? <JobOutcomeBanner outcome={jobOutcome} /> : null}

      <div className="job-progress">
        <div className="meta">
          <div className="label">
            <span className={`dot ${streaming ? 'live pulse' : 'ok'}`}></span>
            Runtime · BabeL-O
          </div>
          <div className="stats">
            <div><b>{completedCount}</b><span>/{totalCount} {t('completed')}</span></div>
            <div><b>{Math.max(totalCount - completedCount - failedCount, 0)}</b><span>{t('running')}</span></div>
            <div><b>{failedCount}</b><span>{t('failedLabel')}</span></div>
          </div>
          <div className="bar" style={{ '--bar-fill': `${runtimeProgress}%` } as React.CSSProperties}><i></i></div>
        </div>
        <div className="rt">
          <div className="pct">{runtimeProgress}<span>%</span></div>
          <small>{latestJobActivity?.summary ?? runtimeProgressLabel(completedCount, failedCount, totalCount, streamState)}</small>
        </div>
      </div>

      <section data-testid="variation-grid" className="var-grid">
        {variations.map(variation => {
          const codeFiles = codeStreams[variation.id]
          const showCode = Boolean(codeFiles) && !variation.previewUrl && !variation.screenshotUrl
          const quality = qualityByVariation[variation.id] ?? qualityForVariation(snapshot, variation)
          return (
            <article key={variation.id} data-testid="variation-card" className={`var-card ${variation.status === 'failed' ? 'failed' : ''}`}>
              <div className="var-head">
                <span className="label"><i className={`status-dot ${variation.status}`} /> {variation.title ?? `Variation ${variation.index}`}</span>
                <span className="id">{variation.id.slice(0, 12)}</span>
              </div>
              {quality && quality.status !== 'pass' ? (
                <div className={`var-quality ${quality.status}`} data-testid="variation-quality-banner">
                  <strong>{quality.status === 'fail' ? 'Quality failed' : 'Quality · warn'}</strong>
                  <span>{quality.issues[0] ?? 'Generated artifact needs attention.'}</span>
                </div>
              ) : null}
              <div className="var-preview" data-testid="variation-card-preview-frame-container">
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
                  <div className="shot"><img alt={variation.title ?? `Variation ${variation.index}`} src={apiUrl(variation.screenshotUrl)} /></div>
                ) : variation.previewUrl ? (
                  <iframe title={variation.title ?? variation.id} src={apiUrl(variation.previewUrl)} sandbox="" />
                ) : (
                  <div className="ph">
                    {variation.status === 'failed'
                      ? <span className="ph-msg">{userErrorForVariation(variation).message}</span>
                      : <div className="ring" />}
                  </div>
                )}
                <span className={`badge chip ${variation.status === 'completed' ? 'ok' : variation.status === 'failed' ? 'err' : 'info'}`}>
                  <span className={`dot ${variation.status === 'completed' ? 'ok' : variation.status === 'failed' ? 'err' : 'live pulse'}`}></span>
                  {variation.status}
                </span>
              </div>
              {variation.status === 'failed' ? (
                <UserNotice notice={userErrorForVariation(variation)} compact onRetry={() => window.location.href = '/'} />
              ) : null}
              <div className="var-foot">
                <span>{variation.outputTokens.toLocaleString()} tok</span>
                <span className="mono">${(variation.costCents / 100).toFixed(2)}</span>
              </div>
              <div className="var-actions">
                {variation.status === 'failed' && !variation.currentArtifactId ? (
                  <button type="button" disabled>{t('unavailable')}</button>
                ) : (
                  <a data-testid="open-variation-link" href={`/variations/${variation.id}`}>{t('openInEditor')} <Icon name="arrowRight" size={14} style={{ marginLeft: 4 }} /></a>
                )}
              </div>
            </article>
          )
        })}
      </section>

      <aside className="stream" data-testid="runtime-activity">
        <div className="stream-head">
          <div className="title">
            <span className={`dot ${streaming ? 'live pulse' : 'ok'}`}></span>
            <span>{t('runtimeActivity')}</span>
            <span className="mono">SSE · /api/design-jobs/{jobId ?? ''}/stream</span>
          </div>
          <div className="acts">
            <button className="btn ghost sm" type="button">{t('copyLatestEvent')}</button>
            <button className="btn ghost sm" type="button">{t('viewRawStream')}</button>
          </div>
        </div>
        <div className="stream-grid">
          <div className="stream-code">
            {activeCodeSet ? (
              <CodeFileViewer
                files={codeFilesForViewer(activeCodeSet)}
                activePath={activeCodeSet.activePath}
                statusLabel={activeStatusLabel(activeCodeSet)}
                onSelectPath={path => {
                  if (!activeCodeVariation) return
                  setCodeStreams(current => current[activeCodeVariation.id] ? {
                    ...current,
                    [activeCodeVariation.id]: { ...current[activeCodeVariation.id]!, activePath: path },
                  } : current)
                }}
              />
            ) : (
              <div className="ph-msg" style={{ color: 'var(--muted)' }}>
                {streaming ? t('waitingCodeStream') : t('noCodeStream')}
              </div>
            )}
          </div>
          <div className="stream-side">
            <div className="runtime-overview">
              <div>
                <span>{t('overall')}</span>
                <strong>{latestJobActivity?.summary ?? runtimeOverviewTitle(streamState, completedCount, failedCount, totalCount)}</strong>
                <p>{latestJobActivity?.detail ?? runtimeProgressLabel(completedCount, failedCount, totalCount, streamState)}</p>
              </div>
              <meter min={0} max={100} value={runtimeProgress} aria-label="Runtime progress" />
            </div>

            <h4>{t('variationStatus')}</h4>
            <div className="runtime-status-grid">
              {variations.map(variation => {
                const latest = latestActivityForVariation(streamLines, variation)
                const stage = latest?.stage ?? stageFromVariationStatus(variation.status)
                return (
                  <article key={variation.id} className="rt-card" data-stage={stage}>
                    <div className="top"><span>{`Variation ${String(variation.index).padStart(2, '0')}`}</span><strong>{stageLabel(stage, variation.status)}</strong></div>
                    <p>{latest?.summary ?? summaryForVariationStatus(variation.status)}</p>
                    {latest?.detail ? <small>{latest.detail}</small> : null}
                  </article>
                )
              })}
            </div>

            {streamLines.length > 0 ? (
              <div className="activity">
                <h4>{t('activity')}</h4>
                {streamLines.slice(0, 8).map(line => (
                  <div className="row" key={line.id}>
                    <span className="t">{line.variationLabel}</span>
                    <span className="s">{line.summary}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="side-empty">{t('noActivity')}</p>
            )}

            <details className="raw-stream-debug" data-testid="raw-stream-debug">
              <summary>Debug raw assistant stream</summary>
              {rawStreamLines.length === 0 ? <p className="side-empty">No raw assistant delta captured.</p> : null}
              {rawStreamLines.map(line => (
                <div key={line.id} className="raw-stream-row">
                  <span>{line.variationLabel} · {line.channel}</span>
                  <code>{line.delta}</code>
                </div>
              ))}
            </details>
          </div>
        </div>
      </aside>
    </main>
  )
}

function JobOutcomeBanner(props: { outcome: JobOutcome }): React.JSX.Element {
  return (
    <section className={`job-outcome-banner ${props.outcome.kind}`} data-testid="job-outcome-banner">
      <strong>{props.outcome.title}</strong>
      <p>{props.outcome.message}</p>
    </section>
  )
}

function UserNotice(props: { notice: UserFacingError; compact?: boolean; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className={`user-notice ${props.notice.severity}${props.compact ? ' compact' : ''}`} data-testid="user-facing-error">
      <strong>{props.notice.title}</strong>
      <p>{props.notice.message}</p>
      {props.notice.detail ? <small>{props.notice.detail}</small> : null}
      {props.notice.retryable && props.onRetry ? (
        <button type="button" onClick={props.onRetry}>{props.notice.action}</button>
      ) : null}
    </div>
  )
}

function latestActivityForVariation(streamLines: StreamLine[], variation: VariationSnapshot): StreamLine | null {
  return streamLines.find(line => line.variationId === variation.id) ?? null
}

function stageFromVariationStatus(status: VariationSnapshot['status']): StreamLine['stage'] {
  if (status === 'queued') return 'queued'
  if (status === 'running' || status === 'streaming') return 'writing'
  if (status === 'rendering_preview') return 'preview'
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  return 'queued'
}

function stageLabel(stage: StreamLine['stage'], status: VariationSnapshot['status']): string {
  if (status === 'completed') return 'DONE'
  if (status === 'failed') return 'FAILED'
  if (status === 'cancelled') return 'CANCELLED'
  if (stage === 'preview') return 'PREVIEW'
  if (stage === 'thinking') return 'THINKING'
  if (stage === 'writing') return 'WRITING'
  if (stage === 'warning') return 'WARN'
  return 'QUEUED'
}

function summaryForVariationStatus(status: VariationSnapshot['status']): string {
  if (status === 'completed') return 'Preview is ready.'
  if (status === 'failed') return 'Runtime stopped before a usable result.'
  if (status === 'cancelled') return 'Generation was cancelled.'
  if (status === 'rendering_preview') return 'Preparing a visual preview.'
  if (status === 'running' || status === 'streaming') return 'Agent is working on this variation.'
  return 'Waiting for an agent.'
}

function runtimeOverviewTitle(
  streamState: 'connecting' | 'open' | 'closed' | 'error',
  completedCount: number,
  failedCount: number,
  totalCount: number,
): string {
  if (failedCount > 0 && completedCount === 0) return 'Generation needs attention'
  if (totalCount > 0 && completedCount + failedCount >= totalCount) return 'Parallel generation finished'
  if (streamState === 'connecting') return 'Connecting to runtime'
  if (streamState === 'error') return 'Runtime stream disconnected'
  return 'Generating variations'
}

function runtimeProgressLabel(
  completedCount: number,
  failedCount: number,
  totalCount: number,
  streamState: 'connecting' | 'open' | 'closed' | 'error',
): string {
  const base = `${completedCount} completed · ${failedCount} failed`
  if (totalCount === 0) return `Waiting for variations · stream ${streamState}`
  return `${base} · ${Math.max(totalCount - completedCount - failedCount, 0)} running`
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
        summary: event.payload.channel === 'thinking' ? 'Planning the design' : activitySummaryForDelta(event.payload.delta),
        detail: activityDetailForDelta(event.payload.delta),
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
      {
        const failure = toUserFacingError({
          code: event.payload.errorCode,
          message: event.payload.message,
          recoverable: event.payload.recoverable,
          scope: 'variation',
        })
        return {
          variationId: event.variationId,
          variationLabel,
          stage: 'failed',
          summary: failure.title,
          detail: failure.message,
        }
      }
    case 'design.runtime_warning':
      {
        const warning = toUserFacingError({
          code: event.payload.code,
          message: event.payload.message,
          scope: 'runtime',
        })
        return {
          variationId: event.variationId,
          variationLabel,
          stage: 'warning',
          summary: warning.title,
          detail: warning.message,
        }
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

function rawStreamLineFromEvent(event: Extract<DesignEvent, { type: 'design.variation_streaming' }>, variations: VariationSnapshot[], sequence: number): RawStreamLine {
  const variation = event.variationId ? variations.find(item => item.id === event.variationId) : null
  const inferredIndex = variation?.index ?? inferVariationIndex(event)
  return {
    id: `${event.timestamp}-${event.variationId ?? 'job'}-${sequence}`,
    variationLabel: inferredIndex ? `Variation ${String(inferredIndex).padStart(2, '0')}` : 'Variation',
    channel: event.payload.channel,
    delta: event.payload.delta.replace(/\s+/g, ' ').trim().slice(0, 420),
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

function activitySummaryForDelta(delta: string): string {
  const normalized = delta.replace(/\s+/g, ' ').trim()
  if (/BabeL-O execution started/i.test(normalized)) return 'Runtime started'
  if (/index\.html|doctype|html/i.test(normalized)) return 'Preparing HTML structure'
  if (/style|css|layout|visual/i.test(normalized)) return 'Shaping layout and style'
  if (/script|javascript|interaction/i.test(normalized)) return 'Checking interactions'
  if (/error|failed|timeout/i.test(normalized)) return 'Runtime reported a problem'
  return 'Working on the page'
}

function activityDetailForDelta(delta: string): string | undefined {
  const normalized = delta.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  if (/error|failed|timeout/i.test(normalized)) return normalized.slice(0, 160)
  if (/index\.html/i.test(normalized)) return 'Agent is updating index.html.'
  if (/style|css/i.test(normalized)) return 'Agent is adjusting CSS and visual hierarchy.'
  if (/script|javascript|interaction/i.test(normalized)) return 'Agent is checking client-side behavior.'
  return undefined
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
    retainedChars: file.text.length,
    truncatedChars: file.truncatedChars,
  }))
}

function activeStatusLabel(fileSet: CodeFileSet): string {
  const active = fileSet.files[fileSet.activePath] ?? Object.values(fileSet.files)[0]
  return active?.isFinal ? 'readying preview' : 'writing'
}

function userErrorForVariation(variation: VariationSnapshot): UserFacingError {
  return toUserFacingError({
    code: variation.errorCode,
    message: variation.errorMessage,
    scope: 'variation',
  })
}

function jobOutcomeForSnapshot(snapshot: JobSnapshot, completedCount: number, failedCount: number): JobOutcome | null {
  const totalCount = snapshot.variations.length || snapshot.job.variationCount
  if (failedCount === 0) return null
  if (snapshot.job.status === 'failed' || completedCount === 0) {
    return {
      kind: 'failed',
      title: 'Generation failed',
      message: completedCount > 0
        ? `${completedCount} variation${completedCount === 1 ? '' : 's'} completed before the job failed. You can still open completed drafts.`
        : 'No usable variation was completed. Start a new generation or adjust the prompt and model settings.',
    }
  }
  return {
    kind: 'partial',
    title: 'Partial results available',
    message: `${completedCount} of ${totalCount} variation${totalCount === 1 ? '' : 's'} completed. ${failedCount} failed and can be ignored while you inspect the completed drafts.`,
  }
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
