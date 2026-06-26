'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl, createAnnotationBatch, exportVariation, getVariation, refineVariation, shareVariation } from '@/lib/api'
import type { AnnotationShape, VariationDetailResponse } from '@dudesign/contracts'

type AnnotationTool = 'rect' | 'text'
type DraftRect = { startX: number; startY: number; currentX: number; currentY: number }

export default function VariationPage(props: { params: Promise<{ variationId: string }> }): React.JSX.Element {
  const [variationId, setVariationId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VariationDetailResponse | null>(null)
  const [prompt, setPrompt] = useState('Make the hero bolder and switch the accent color to teal.')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [status, setStatus] = useState<'loading' | 'idle' | 'refining' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [previewVersion, setPreviewVersion] = useState(0)
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('rect')
  const [annotations, setAnnotations] = useState<AnnotationShape[]>([])
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    props.params.then(params => setVariationId(params.variationId)).catch(err => {
      setError((err as Error).message)
      setStatus('error')
    })
  }, [props.params])

  useEffect(() => {
    if (!variationId) return
    let cancelled = false
    getVariation(variationId)
      .then(data => {
        if (!cancelled) {
          setDetail(data)
          setStatus('idle')
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError((err as Error).message)
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [variationId, previewVersion])

  const previewUrl = useMemo(() => {
    const url = detail?.variation.previewUrl
    if (!url) return null
    return `${apiUrl(url)}?v=${previewVersion}`
  }, [detail?.variation.previewUrl, previewVersion])

  async function submitRefine(): Promise<void> {
    if (!variationId || !detail?.variation.currentArtifactId || !prompt.trim()) return
    setStatus('refining')
    setError(null)
    setNotice(null)
    try {
      await refineVariation(variationId, {
        prompt: prompt.trim(),
        baseArtifactId: detail.variation.currentArtifactId,
        deviceContext: device,
      })
      setPreviewVersion(version => version + 1)
      setStatus('idle')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  async function submitAnnotations(): Promise<void> {
    if (!variationId || !detail?.variation.currentArtifactId || annotations.length === 0) return
    setStatus('refining')
    setError(null)
    setNotice(null)
    try {
      await createAnnotationBatch(variationId, {
        artifactId: detail.variation.currentArtifactId,
        shapes: annotations,
        prompt: prompt.trim() || undefined,
      })
      setAnnotations([])
      setAnnotationMode(false)
      setPreviewVersion(version => version + 1)
      setStatus('idle')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  async function downloadHtml(): Promise<void> {
    if (!variationId) return
    setError(null)
    setNotice(null)
    try {
      const exported = await exportVariation(variationId)
      const blob = new Blob([exported.artifact.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = exported.artifact.filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setNotice(`Downloaded ${exported.artifact.filename}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function createShareLink(): Promise<void> {
    if (!variationId) return
    setError(null)
    setNotice(null)
    try {
      const shared = await shareVariation(variationId, { visibility: 'public' })
      const absoluteUrl = new URL(shared.share.url, window.location.origin).toString()
      setShareUrl(absoluteUrl)
      setNotice('Share link created.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function normalizedPoint(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (!annotationMode) return
    const point = normalizedPoint(event)
    if (annotationTool === 'text') {
      const text = window.prompt('Annotation note')
      if (text?.trim()) {
        setAnnotations(items => [...items, { type: 'text', anchor: point, text: text.trim(), note: text.trim() }])
      }
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraftRect({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!draftRect) return
    const point = normalizedPoint(event)
    setDraftRect(rect => rect ? { ...rect, currentX: point.x, currentY: point.y } : null)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!draftRect) return
    const point = normalizedPoint(event)
    const x = Math.min(draftRect.startX, point.x)
    const y = Math.min(draftRect.startY, point.y)
    const w = Math.abs(point.x - draftRect.startX)
    const h = Math.abs(point.y - draftRect.startY)
    if (w > 0.01 && h > 0.01) {
      setAnnotations(items => [...items, { type: 'rect', x, y, w, h, color: '#4f46e5', note: 'Marked area to refine' }])
    }
    setDraftRect(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // best effort
    }
  }

  return (
    <main className="variation-editor-shell">
      <header className="variation-editor-header">
        <a href={detail ? `/jobs/${detail.job.id}` : '/'} className="back-link">← All variations</a>
        <div>
          <span className="eyebrow">Refine this design</span>
          <h1>{detail?.variation.title ?? 'Variation'}</h1>
          <p>{detail?.job.prompt ?? 'Loading variation context...'}</p>
        </div>
        <div className="editor-command-bar" aria-label="Variation actions">
          <button data-testid="download-html-button" onClick={() => void downloadHtml()} disabled={!detail?.variation.currentArtifactId}>
            HTML
          </button>
          <button data-testid="share-button" onClick={() => void createShareLink()} disabled={!detail?.variation.currentArtifactId}>
            Share
          </button>
          <button onClick={() => setNotice('This variation is marked as the selected direction for the current session.')}>
            Lock this one
          </button>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? (
        <p data-testid="variation-notice" className="notice-text">
          {notice}
          {shareUrl ? <> <a data-testid="share-link" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></> : null}
        </p>
      ) : null}

      <section className="variation-editor-grid">
        <div className={`device-preview ${device}`}>
          {previewUrl ? (
            <div data-testid="variation-preview" className="annotated-preview-wrap">
              <iframe
                data-testid="variation-preview-frame"
                title={detail?.variation.title ?? 'Variation preview'}
                src={previewUrl}
                sandbox=""
              />
              <div
                ref={overlayRef}
                data-testid="annotation-overlay"
                className={`annotation-overlay ${annotationMode ? 'active' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {annotations.map((shape, index) => (
                  <AnnotationView key={index} shape={shape} index={index} />
                ))}
                {draftRect ? <DraftRectView rect={draftRect} /> : null}
              </div>
            </div>
          ) : (
            <div className="preview-placeholder">Waiting for preview</div>
          )}
        </div>

        <aside className="refine-panel">
          <div className="device-toggle" aria-label="Preview device">
            {(['desktop', 'tablet', 'mobile'] as const).map(item => (
              <button key={item} className={device === item ? 'active' : ''} onClick={() => setDevice(item)}>
                {item}
              </button>
            ))}
          </div>

          <label className="refine-field">
            Refine prompt
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={6} />
          </label>

          <section className="annotation-panel">
            <div className="annotation-panel-header">
              <strong>Annotations</strong>
              <label>
                <input
                  data-testid="annotation-draw-toggle"
                  type="checkbox"
                  checked={annotationMode}
                  onChange={event => setAnnotationMode(event.target.checked)}
                />
                Draw
              </label>
            </div>
            <div className="device-toggle annotation-tools" aria-label="Annotation tool">
              {(['rect', 'text'] as const).map(tool => (
                <button key={tool} className={annotationTool === tool ? 'active' : ''} onClick={() => setAnnotationTool(tool)}>
                  {tool}
                </button>
              ))}
            </div>
            <p>{annotations.length} annotation{annotations.length === 1 ? '' : 's'} staged.</p>
            <div className="annotation-actions">
              <button onClick={() => setAnnotations([])} disabled={annotations.length === 0}>Clear</button>
              <button
                data-testid="apply-annotations-button"
                onClick={() => void submitAnnotations()}
                disabled={status === 'refining' || annotations.length === 0 || !detail?.variation.currentArtifactId}
              >
                Apply marks
              </button>
            </div>
          </section>

          <button
            className="generate-button"
            disabled={status === 'refining' || !detail?.variation.currentArtifactId}
            onClick={() => void submitRefine()}
          >
            {status === 'refining' ? 'Refining...' : 'Refine variation'}
          </button>

          <section className="artifact-panel">
            <strong>Current artifact</strong>
            <p data-testid="current-artifact-version">
              {detail?.currentArtifact ? `v${detail.currentArtifact.version} · ${detail.currentArtifact.id}` : 'No artifact yet'}
            </p>
            <strong>Versions</strong>
            {detail?.artifacts.map(artifact => (
              <p key={artifact.id}>v{artifact.version} · {artifact.entryPath ?? 'index.html'}</p>
            ))}
          </section>
        </aside>
      </section>
    </main>
  )
}

function AnnotationView(props: { shape: AnnotationShape; index: number }): React.JSX.Element | null {
  const { shape, index } = props
  if (shape.type === 'rect') {
    return (
      <div
        data-testid="annotation-rect"
        className="annotation-rect"
        style={{
          left: `${shape.x * 100}%`,
          top: `${shape.y * 100}%`,
          width: `${shape.w * 100}%`,
          height: `${shape.h * 100}%`,
        }}
      >
        <span>{index + 1}</span>
      </div>
    )
  }
  if (shape.type === 'text') {
    return (
      <div className="annotation-text" style={{ left: `${shape.anchor.x * 100}%`, top: `${shape.anchor.y * 100}%` }}>
        {index + 1}. {shape.text}
      </div>
    )
  }
  return null
}

function DraftRectView(props: { rect: DraftRect }): React.JSX.Element {
  const x = Math.min(props.rect.startX, props.rect.currentX)
  const y = Math.min(props.rect.startY, props.rect.currentY)
  const w = Math.abs(props.rect.currentX - props.rect.startX)
  const h = Math.abs(props.rect.currentY - props.rect.startY)
  return (
    <div
      className="annotation-rect draft"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
      }}
    />
  )
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
