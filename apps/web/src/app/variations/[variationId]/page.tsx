'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { apiUrl, createAnnotationBatch, downloadArtifact, exportVariation, getVariation, getVariationFiles, refineVariation, restoreVariationVersion, shareVariation } from '@/lib/api'
import type { AnnotationShape, ExportVariationResponse, VariationDetailResponse, VariationFilesResponse } from '@dudesign/contracts'

type AnnotationTool = 'rect' | 'text'
type DraftRect = { startX: number; startY: number; currentX: number; currentY: number }
type EditorViewMode = 'preview' | 'code'
type ArtifactQuality = NonNullable<NonNullable<VariationDetailResponse['currentArtifact']>['quality']>
type ExportArtifactSummary = NonNullable<ExportVariationResponse['exportArtifact']>

export default function VariationPage(props: { params: Promise<{ variationId: string }> }): React.JSX.Element {
  const [variationId, setVariationId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VariationDetailResponse | null>(null)
  const [prompt, setPrompt] = useState('Make the hero bolder and switch the accent color to teal.')
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [viewMode, setViewMode] = useState<EditorViewMode>('preview')
  const [status, setStatus] = useState<'loading' | 'idle' | 'refining' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [previewVersion, setPreviewVersion] = useState(0)
  const [files, setFiles] = useState<VariationFilesResponse['files']>([])
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [selectedArtifact, setSelectedArtifact] = useState<VariationFilesResponse['artifact'] | null>(null)
  const [activeFilePath, setActiveFilePath] = useState<string>('index.html')
  const [annotationMode, setAnnotationMode] = useState(false)
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('rect')
  const [annotations, setAnnotations] = useState<AnnotationShape[]>([])
  const [draftRect, setDraftRect] = useState<DraftRect | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [lastExport, setLastExport] = useState<ExportArtifactSummary | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating'>('idle')
  const [restoringArtifactId, setRestoringArtifactId] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const selectedArtifactQuality = qualityForArtifact(detail, selectedArtifactId)

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
          setSelectedArtifactId(current => {
            if (!current) return data.currentArtifact?.id ?? null
            return data.artifacts.some(artifact => artifact.id === current && artifact.kind === 'html')
              ? current
              : data.currentArtifact?.id ?? null
          })
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

  useEffect(() => {
    if (!variationId || !selectedArtifactId) {
      setFiles([])
      setSelectedArtifact(null)
      return
    }
    let cancelled = false
    getVariationFiles(variationId, selectedArtifactId)
      .then(fileData => {
        if (!cancelled) {
          setFiles(fileData.files)
          setSelectedArtifact(fileData.artifact)
          setActiveFilePath(current => fileData.files.some(file => file.path === current)
            ? current
            : fileData.files[0]?.path ?? 'index.html')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([])
          setSelectedArtifact(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [variationId, selectedArtifactId, previewVersion])

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
      setSelectedArtifactId(null)
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
      setSelectedArtifactId(null)
      setPreviewVersion(version => version + 1)
      setStatus('idle')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  async function downloadZip(): Promise<void> {
    if (!variationId || exportStatus === 'exporting') return
    setExportStatus('exporting')
    setError(null)
    setNotice(null)
    try {
      const exported = await exportVariation(variationId)
      if (!exported.exportArtifact) throw new Error('Export artifact was not created.')
      const blob = await downloadArtifact(exported.exportArtifact.downloadUrl)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = exported.exportArtifact.filename
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setLastExport(exported.exportArtifact)
      setNotice(`Downloaded ${exported.exportArtifact.filename}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setExportStatus('idle')
    }
  }

  async function createShareLink(): Promise<void> {
    if (!variationId || shareStatus === 'creating') return
    setShareStatus('creating')
    setError(null)
    setNotice(null)
    try {
      const shared = await shareVariation(variationId, { visibility: 'public' })
      const absoluteUrl = new URL(shared.share.url, window.location.origin).toString()
      setShareUrl(absoluteUrl)
      setNotice('Share link created.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setShareStatus('idle')
    }
  }

  async function restoreVersion(artifactId: string): Promise<void> {
    if (!variationId || restoringArtifactId) return
    setRestoringArtifactId(artifactId)
    setError(null)
    setNotice(null)
    try {
      const restored = await restoreVariationVersion(variationId, artifactId)
      setSelectedArtifactId(restored.artifact.id)
      setViewMode('preview')
      setPreviewVersion(version => version + 1)
      setNotice(`Restored v${restored.artifact.version} as the current artifact.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRestoringArtifactId(null)
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
          <button
            data-testid="download-html-button"
            onClick={() => void downloadZip()}
            disabled={!detail?.variation.currentArtifactId || exportStatus === 'exporting'}
          >
            {exportStatus === 'exporting' ? 'Exporting' : 'ZIP'}
          </button>
          <button
            data-testid="share-button"
            onClick={() => void createShareLink()}
            disabled={!detail?.variation.currentArtifactId || shareStatus === 'creating'}
          >
            {shareStatus === 'creating' ? 'Sharing' : 'Share'}
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
          {lastExport ? <> <span>{formatExportSummary(lastExport)}</span></> : null}
          {shareUrl ? <> <a data-testid="share-link" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></> : null}
        </p>
      ) : null}

      <section className="variation-editor-grid">
        <div className={`device-preview ${device}`}>
          <div className="editor-view-tabs" role="tablist" aria-label="Editor view">
            <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>
              Preview
            </button>
            <button className={viewMode === 'code' ? 'active' : ''} onClick={() => setViewMode('code')} disabled={files.length === 0}>
              Code
            </button>
          </div>
          {viewMode === 'code' ? (
            <div className="editor-code-view">
              <CodeFileViewer
                files={filesForViewer(files)}
                activePath={activeFilePath}
                testId="variation-code-view"
                statusLabel={selectedArtifact ? `v${selectedArtifact.version}` : undefined}
                onSelectPath={setActiveFilePath}
              />
            </div>
          ) : previewUrl ? (
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
            {selectedArtifactQuality && selectedArtifactQuality.status !== 'pass' ? (
              <div className={`quality-banner artifact-quality-summary ${selectedArtifactQuality.status}`} data-testid="artifact-quality-summary">
                <strong>{selectedArtifactQuality.status === 'fail' ? 'Quality failed' : 'Quality warning'}</strong>
                <span>{selectedArtifactQuality.issues[0] ?? 'Generated artifact needs attention.'}</span>
              </div>
            ) : null}
            {lastExport ? (
              <div className="export-summary" data-testid="export-summary">
                <strong>Latest ZIP</strong>
                <p>{lastExport.filename}</p>
                <dl>
                  <div>
                    <dt>Files</dt>
                    <dd>{lastExport.files.length}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(lastExport.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>Hash</dt>
                    <dd title={lastExport.contentHash}>{shortHash(lastExport.contentHash)}</dd>
                  </div>
                </dl>
                <span>{lastExport.reused ? 'Reused existing package' : 'Created from current version'}</span>
              </div>
            ) : null}
            <strong>Versions</strong>
            {detail?.artifacts.map(artifact => (
              <div key={artifact.id} className={`artifact-version-row ${artifact.id === selectedArtifactId ? 'active' : ''}`}>
                <button
                  type="button"
                  data-testid="artifact-version-button"
                  disabled={artifact.kind !== 'html'}
                  onClick={() => {
                    if (artifact.kind !== 'html') return
                    setSelectedArtifactId(artifact.id)
                    setViewMode('code')
                  }}
                >
                  <span>{artifact.kind === 'html' ? `v${artifact.version}` : artifactKindLabel(artifact.kind)}</span>
                  <span>
                    {artifact.entryPath ?? artifact.id}
                    {artifact.isCurrent ? ' · current' : ''}
                    {artifact.exportedFromArtifactId ? ` · from ${shortArtifactId(artifact.exportedFromArtifactId)}` : ''}
                  </span>
                </button>
                {artifact.kind === 'html' && !artifact.isCurrent ? (
                  <button
                    type="button"
                    className="restore-version-button"
                    data-testid="restore-version-button"
                    disabled={Boolean(restoringArtifactId)}
                    onClick={() => void restoreVersion(artifact.id)}
                  >
                    {restoringArtifactId === artifact.id ? 'Restoring' : 'Restore'}
                  </button>
                ) : null}
              </div>
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

function filesForViewer(files: VariationFilesResponse['files']): CodeFile[] {
  return files.map(file => ({
    path: file.path,
    language: file.language,
    content: file.content,
    isFinal: true,
  }))
}

function qualityForArtifact(detail: VariationDetailResponse | null, artifactId: string | null): ArtifactQuality | null {
  if (!detail) return null
  const artifact = artifactId
    ? detail.artifacts.find(item => item.id === artifactId) ?? detail.currentArtifact
    : detail.currentArtifact
  return artifact?.quality ?? null
}

function formatExportSummary(exportArtifact: ExportArtifactSummary): string {
  const fileLabel = `${exportArtifact.files.length} file${exportArtifact.files.length === 1 ? '' : 's'}`
  return `${fileLabel} · ${formatBytes(exportArtifact.sizeBytes)} · ${shortHash(exportArtifact.contentHash)}`
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`
}

function shortHash(value: string): string {
  return value.replace(/^sha256:/, '').slice(0, 12)
}

function shortArtifactId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value
}

function artifactKindLabel(kind: VariationDetailResponse['artifacts'][number]['kind']): string {
  if (kind === 'export_zip') return 'zip'
  return kind
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
