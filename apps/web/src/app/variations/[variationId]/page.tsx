'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CapabilitySummary } from '@/components/CapabilitySummary'
import { CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { UserActionCluster } from '@/components/UserActionCluster'
import { apiUrl, createAnnotationBatch, downloadArtifact, exportVariation, getVariation, getVariationFiles, refineVariation, restoreVariationVersion, shareVariation } from '@/lib/api'
import type { AnnotationShape, ExportVariationResponse, VariationDetailResponse, VariationFilesResponse } from '@dudesign/contracts'

type AnnotationTool = 'rect' | 'circle' | 'arrow' | 'pen' | 'text'
type DraftShape =
  | { type: 'rect' | 'circle' | 'arrow'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'pen'; points: Array<{ x: number; y: number }> }
type EditorViewMode = 'preview' | 'code'
type ArtifactQuality = NonNullable<NonNullable<VariationDetailResponse['currentArtifact']>['quality']>
type ExportArtifactSummary = NonNullable<ExportVariationResponse['exportArtifact']>
type LockedVariationVersion = {
  variationId: string
  artifactId: string
  version: number
  entryPath: string | null
  lockedAt: string
}

const lockedVariationStorageKey = 'dudesign.lockedVariationVersions'

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
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState<number | null>(null)
  const [draftShape, setDraftShape] = useState<DraftShape | null>(null)
  const draftShapeRef = useRef<DraftShape | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [lastExport, setLastExport] = useState<ExportArtifactSummary | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating'>('idle')
  const [restoringArtifactId, setRestoringArtifactId] = useState<string | null>(null)
  const [lockedVersion, setLockedVersion] = useState<LockedVariationVersion | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const selectedArtifactQuality = qualityForArtifact(detail, selectedArtifactId)
  const runtimeSummary = runtimeSummaryForVariation(detail)

  useEffect(() => {
    props.params.then(params => setVariationId(params.variationId)).catch(err => {
      setError((err as Error).message)
      setStatus('error')
    })
  }, [props.params])

  useEffect(() => {
    if (!variationId) return
    setLockedVersion(readLockedVariationVersion(variationId))
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
      setSelectedAnnotationIndex(null)
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

  function lockCurrentVersion(): void {
    if (!variationId || !detail?.currentArtifact || detail.currentArtifact.kind !== 'html') return
    const locked = {
      variationId,
      artifactId: detail.currentArtifact.id,
      version: detail.currentArtifact.version,
      entryPath: detail.currentArtifact.entryPath,
      lockedAt: new Date().toISOString(),
    }
    writeLockedVariationVersion(locked)
    setLockedVersion(locked)
    setNotice(`Locked v${locked.version} as the selected direction for this variation.`)
  }

  function normalizedPoint(event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    }
  }

  function setDraft(shape: DraftShape | null): void {
    draftShapeRef.current = shape
    setDraftShape(shape)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (!annotationMode) return
    const point = normalizedPoint(event)
    if (annotationTool === 'text') {
      const text = window.prompt('Annotation note')
      if (text?.trim()) {
        appendAnnotation({ type: 'text', anchor: point, text: text.trim(), note: text.trim() })
      }
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic/browser test pointer events are not capture-eligible.
    }
    if (annotationTool === 'pen') {
      setDraft({ type: 'pen', points: [point] })
      return
    }
    setDraft({ type: annotationTool, startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!draftShapeRef.current) return
    const point = normalizedPoint(event)
    const currentShape = draftShapeRef.current
    const nextShape = currentShape.type === 'pen'
      ? { ...currentShape, points: [...currentShape.points, point].slice(-120) }
      : { ...currentShape, currentX: point.x, currentY: point.y }
    setDraft(nextShape)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const currentShape = draftShapeRef.current
    if (!currentShape) return
    const point = normalizedPoint(event)
    commitDraftShape(currentShape, point)
    setDraft(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // best effort
    }
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>): void {
    const currentShape = draftShapeRef.current
    if (!currentShape || currentShape.type !== 'pen') return
    commitDraftShape(currentShape, normalizedPoint(event))
    setDraft(null)
  }

  function commitDraftShape(currentShape: DraftShape, point: { x: number; y: number }): void {
    if (currentShape.type === 'pen') {
      const points = [...currentShape.points, point]
      if (points.length >= 2) {
        appendAnnotation({ type: 'pen', points, color: '#4f46e5', note: 'Freehand marked area to refine' })
      }
    } else {
      const x = Math.min(currentShape.startX, point.x)
      const y = Math.min(currentShape.startY, point.y)
      const w = Math.abs(point.x - currentShape.startX)
      const h = Math.abs(point.y - currentShape.startY)
      if (w > 0.01 && h > 0.01) {
        if (currentShape.type === 'rect') {
          appendAnnotation({ type: 'rect', x, y, w, h, color: '#4f46e5', note: 'Marked area to refine' })
        } else if (currentShape.type === 'circle') {
          appendAnnotation({
            type: 'circle',
            cx: x + w / 2,
            cy: y + h / 2,
            r: Math.max(w, h) / 2,
            color: '#4f46e5',
            note: 'Circular marked area to refine',
          })
        } else {
          appendAnnotation({
            type: 'arrow',
            from: { x: currentShape.startX, y: currentShape.startY },
            to: point,
            color: '#4f46e5',
            note: 'Arrow points to the area to refine',
          })
        }
      }
    }
  }

  function appendAnnotation(shape: AnnotationShape): void {
    const nextIndex = annotations.length
    setAnnotations(items => [...items, shape])
    setSelectedAnnotationIndex(nextIndex)
  }

  function selectAnnotation(index: number): void {
    setSelectedAnnotationIndex(index)
  }

  function deleteAnnotation(index: number): void {
    setAnnotations(items => items.filter((_item, itemIndex) => itemIndex !== index))
    setSelectedAnnotationIndex(current => {
      if (current === null) return null
      if (current === index) return null
      if (current > index) return current - 1
      return current
    })
  }

  function editTextAnnotation(index: number): void {
    const shape = annotations[index]
    if (!shape || shape.type !== 'text') return
    const text = window.prompt('Edit annotation note', shape.text)
    if (!text?.trim()) return
    setAnnotations(items => items.map((item, itemIndex) => itemIndex === index && item.type === 'text'
      ? { ...item, text: text.trim(), note: text.trim() }
      : item))
    setSelectedAnnotationIndex(index)
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
          <UserActionCluster />
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
          <button
            className="lock-variation-button"
            data-testid="lock-version-button"
            onClick={lockCurrentVersion}
            disabled={!detail?.currentArtifact || detail.currentArtifact.kind !== 'html'}
          >
            {lockedVersion?.artifactId === detail?.currentArtifact?.id ? 'Locked' : 'Lock this version'}
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
          <div className="editor-preview-toolbar">
            <div className="editor-view-tabs" role="tablist" aria-label="Editor view">
              <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>
                Preview
              </button>
              <button className={viewMode === 'code' ? 'active' : ''} onClick={() => setViewMode('code')} disabled={files.length === 0}>
                Code
              </button>
            </div>
            {viewMode === 'preview' ? (
              <div className="device-toggle editor-device-toggle" aria-label="Preview device">
                {(['desktop', 'tablet', 'mobile'] as const).map(item => (
                  <button key={item} className={device === item ? 'active' : ''} onClick={() => setDevice(item)}>
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
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
                onPointerLeave={handlePointerLeave}
              >
                {annotations.map((shape, index) => (
                  <AnnotationView
                    key={index}
                    shape={shape}
                    index={index}
                    selected={selectedAnnotationIndex === index}
                    onSelect={() => selectAnnotation(index)}
                  />
                ))}
                {draftShape ? <DraftShapeView shape={draftShape} /> : null}
              </div>
            </div>
          ) : (
            <div className="preview-placeholder">Waiting for preview</div>
          )}
        </div>

        <aside className="refine-panel">
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
              {(['rect', 'circle', 'arrow', 'pen', 'text'] as const).map(tool => (
                <button
                  key={tool}
                  data-testid={`annotation-tool-${tool}`}
                  aria-pressed={annotationTool === tool}
                  className={annotationTool === tool ? 'active' : ''}
                  onClick={() => setAnnotationTool(tool)}
                >
                  {tool}
                </button>
              ))}
            </div>
            <p>{annotations.length} annotation{annotations.length === 1 ? '' : 's'} staged.</p>
            {annotations.length > 0 ? (
              <div className="annotation-list" data-testid="annotation-list">
                {annotations.map((shape, index) => (
                  <div
                    key={index}
                    className={`annotation-list-row ${selectedAnnotationIndex === index ? 'active' : ''}`}
                    data-testid="annotation-list-row"
                  >
                    <button type="button" onClick={() => selectAnnotation(index)}>
                      <span>{String(index + 1).padStart(2, '0')} · {shape.type}</span>
                      <small>{annotationSummary(shape)}</small>
                    </button>
                    {shape.type === 'text' ? (
                      <button type="button" data-testid="edit-annotation-button" onClick={() => editTextAnnotation(index)}>
                        Edit
                      </button>
                    ) : null}
                    <button type="button" data-testid="delete-annotation-button" onClick={() => deleteAnnotation(index)}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="annotation-empty">Draw on the preview to stage marks.</p>
            )}
            <div className="annotation-actions">
              <button onClick={() => {
                setAnnotations([])
                setSelectedAnnotationIndex(null)
              }} disabled={annotations.length === 0}>Clear</button>
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

          <CapabilitySummary snapshot={detail?.job.capabilitySnapshot} compact testId="variation-capability-snapshot" />

          <section className="runtime-summary-panel" data-testid="runtime-summary-panel">
            <strong>Cost & runtime</strong>
            <dl>
              <div>
                <dt>Total cost</dt>
                <dd>{runtimeSummary.cost}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{runtimeSummary.tokens}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{runtimeSummary.status}</dd>
              </div>
              <div>
                <dt>Artifacts</dt>
                <dd>{runtimeSummary.artifacts}</dd>
              </div>
            </dl>
            <p>{runtimeSummary.detail}</p>
          </section>

          <section className="artifact-panel">
            <strong>Current artifact</strong>
            <p data-testid="current-artifact-version">
              {detail?.currentArtifact ? `v${detail.currentArtifact.version} · ${detail.currentArtifact.id}` : 'No artifact yet'}
            </p>
            {lockedVersion ? (
              <div
                className={`locked-version-summary ${lockedVersion.artifactId === detail?.currentArtifact?.id ? 'current' : 'historical'}`}
                data-testid="locked-version-summary"
              >
                <strong>{lockedVersion.artifactId === detail?.currentArtifact?.id ? 'Current version locked' : 'Locked version differs'}</strong>
                <span>
                  v{lockedVersion.version} · {lockedVersion.entryPath ?? lockedVersion.artifactId} · {new Date(lockedVersion.lockedAt).toLocaleString()}
                </span>
              </div>
            ) : null}
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

function AnnotationView(props: { shape: AnnotationShape; index: number; selected: boolean; onSelect: () => void }): React.JSX.Element | null {
  const { shape, index, selected, onSelect } = props
  if (shape.type === 'rect') {
    return (
      <button
        type="button"
        data-testid="annotation-rect"
        className={`annotation-rect ${selected ? 'selected' : ''}`}
        onClick={onSelect}
        style={{
          left: `${shape.x * 100}%`,
          top: `${shape.y * 100}%`,
          width: `${shape.w * 100}%`,
          height: `${shape.h * 100}%`,
        }}
      >
        <span>{index + 1}</span>
      </button>
    )
  }
  if (shape.type === 'circle') {
    return (
      <button
        type="button"
        data-testid="annotation-circle"
        className={`annotation-circle ${selected ? 'selected' : ''}`}
        onClick={onSelect}
        style={{
          left: `${(shape.cx - shape.r) * 100}%`,
          top: `${(shape.cy - shape.r) * 100}%`,
          width: `${shape.r * 2 * 100}%`,
          height: `${shape.r * 2 * 100}%`,
        }}
      >
        <span>{index + 1}</span>
      </button>
    )
  }
  if (shape.type === 'arrow') {
    return <AnnotationLineView testId="annotation-arrow" from={shape.from} to={shape.to} index={index} arrow selected={selected} onSelect={onSelect} />
  }
  if (shape.type === 'pen') {
    return <AnnotationPenView points={shape.points} index={index} selected={selected} onSelect={onSelect} />
  }
  if (shape.type === 'text') {
    return (
      <button
        type="button"
        className={`annotation-text ${selected ? 'selected' : ''}`}
        onClick={onSelect}
        style={{ left: `${shape.anchor.x * 100}%`, top: `${shape.anchor.y * 100}%` }}
      >
        {index + 1}. {shape.text}
      </button>
    )
  }
  return null
}

function DraftShapeView(props: { shape: DraftShape }): React.JSX.Element | null {
  const { shape } = props
  if (shape.type === 'pen') return <AnnotationPenView points={shape.points} draft />
  if (shape.type === 'arrow') {
    return <AnnotationLineView testId="annotation-arrow-draft" from={{ x: shape.startX, y: shape.startY }} to={{ x: shape.currentX, y: shape.currentY }} arrow draft />
  }
  const x = Math.min(shape.startX, shape.currentX)
  const y = Math.min(shape.startY, shape.currentY)
  const w = Math.abs(shape.currentX - shape.startX)
  const h = Math.abs(shape.currentY - shape.startY)
  if (shape.type === 'circle') {
    return (
      <div
        className="annotation-circle draft"
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${w * 100}%`,
          height: `${h * 100}%`,
        }}
      />
    )
  }
  return (
    <div className="annotation-rect draft" style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }} />
  )
}

function AnnotationLineView(props: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  testId: string
  index?: number
  arrow?: boolean
  draft?: boolean
  selected?: boolean
  onSelect?: () => void
}): React.JSX.Element {
  const markerId = `arrowhead-${props.index ?? 'draft'}`
  return (
    <svg
      className={`annotation-svg ${props.draft ? 'draft' : ''} ${props.selected ? 'selected' : ''} ${props.onSelect ? 'selectable' : ''}`}
      data-testid={props.testId}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onClick={props.onSelect}
    >
      {props.arrow ? (
        <defs>
          <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L8,4 L0,8 Z" />
          </marker>
        </defs>
      ) : null}
      <line
        className="annotation-hit-line"
        x1={props.from.x * 100}
        y1={props.from.y * 100}
        x2={props.to.x * 100}
        y2={props.to.y * 100}
      />
      <line
        x1={props.from.x * 100}
        y1={props.from.y * 100}
        x2={props.to.x * 100}
        y2={props.to.y * 100}
        markerEnd={props.arrow ? `url(#${markerId})` : undefined}
      />
      {typeof props.index === 'number' ? (
        <text x={props.from.x * 100} y={props.from.y * 100}>{props.index + 1}</text>
      ) : null}
    </svg>
  )
}

function AnnotationPenView(props: { points: Array<{ x: number; y: number }>; index?: number; draft?: boolean; selected?: boolean; onSelect?: () => void }): React.JSX.Element | null {
  if (props.points.length < 2) return null
  const points = props.points.map(point => `${point.x * 100},${point.y * 100}`).join(' ')
  const first = props.points[0]!
  return (
    <svg
      className={`annotation-svg annotation-pen ${props.draft ? 'draft' : ''} ${props.selected ? 'selected' : ''} ${props.onSelect ? 'selectable' : ''}`}
      data-testid="annotation-pen"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onClick={props.onSelect}
    >
      <polyline className="annotation-hit-line" points={points} />
      <polyline points={points} />
      {typeof props.index === 'number' ? <text x={first.x * 100} y={first.y * 100}>{props.index + 1}</text> : null}
    </svg>
  )
}

function annotationSummary(shape: AnnotationShape): string {
  switch (shape.type) {
    case 'rect':
      return `${percent(shape.x)}, ${percent(shape.y)} · ${percent(shape.w)} x ${percent(shape.h)}`
    case 'circle':
      return `center ${percent(shape.cx)}, ${percent(shape.cy)} · r ${percent(shape.r)}`
    case 'arrow':
      return `${percent(shape.from.x)}, ${percent(shape.from.y)} -> ${percent(shape.to.x)}, ${percent(shape.to.y)}`
    case 'pen':
      return `${shape.points.length} point${shape.points.length === 1 ? '' : 's'}`
    case 'text':
      return shape.text.length > 42 ? `${shape.text.slice(0, 42)}...` : shape.text
    default:
      return 'annotation'
  }
}

function percent(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`
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

function readLockedVariationVersion(variationId: string): LockedVariationVersion | null {
  try {
    const raw = window.localStorage.getItem(lockedVariationStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, LockedVariationVersion>
    const locked = parsed[variationId]
    return locked?.variationId === variationId && locked.artifactId ? locked : null
  } catch {
    return null
  }
}

function writeLockedVariationVersion(locked: LockedVariationVersion): void {
  try {
    const raw = window.localStorage.getItem(lockedVariationStorageKey)
    const parsed = raw ? JSON.parse(raw) as Record<string, LockedVariationVersion> : {}
    window.localStorage.setItem(lockedVariationStorageKey, JSON.stringify({
      ...parsed,
      [locked.variationId]: locked,
    }))
  } catch {
    // Locking is a local MVP affordance until backend collaboration state lands.
  }
}

function runtimeSummaryForVariation(detail: VariationDetailResponse | null): {
  cost: string
  tokens: string
  status: string
  artifacts: string
  detail: string
} {
  const variation = detail?.variation
  if (!variation) {
    return {
      cost: '$0.00',
      tokens: '0 in / 0 out',
      status: 'loading',
      artifacts: '0',
      detail: 'Runtime usage will appear after this variation loads.',
    }
  }
  const htmlCount = detail.artifacts.filter(artifact => artifact.kind === 'html').length
  const screenshotCount = detail.artifacts.filter(artifact => artifact.kind === 'screenshot').length
  return {
    cost: `$${(variation.costCents / 100).toFixed(2)}`,
    tokens: `${variation.inputTokens.toLocaleString()} in / ${variation.outputTokens.toLocaleString()} out`,
    status: variation.status.replaceAll('_', ' '),
    artifacts: `${htmlCount} html · ${screenshotCount} shots`,
    detail: variation.errorMessage
      ? `${variation.errorCode ?? 'Runtime error'}: ${variation.errorMessage}`
      : `Runtime child ${shortArtifactId(variation.id)} is attached to session ${shortArtifactId(variation.sessionId)}.`,
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
