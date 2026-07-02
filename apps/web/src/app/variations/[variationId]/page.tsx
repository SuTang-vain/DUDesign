'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CapabilitySummary } from '@/components/CapabilitySummary'
import { CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { UserActionCluster } from '@/components/UserActionCluster'
import { Icon, type IconName } from '@/components/Icon'
import { useLanguage } from '@/components/LanguageProvider'
import { apiUrl, createAnnotationBatch, downloadArtifact, exportVariation, getVariation, getVariationFiles, refineVariation, restoreVariationVersion, shareVariation } from '@/lib/api'
import type { AnnotationShape, ExportVariationResponse, VariationDetailResponse, VariationFilesResponse } from '@dudesign/contracts'

type AnnotationTool = 'rect' | 'circle' | 'arrow' | 'pen' | 'text'
type DraftShape =
  | { type: 'rect' | 'circle' | 'arrow'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'pen'; points: Array<{ x: number; y: number }> }
type EditorViewMode = 'preview' | 'code'
type SidePanelTab = 'annotate' | 'direction' | 'inspect'
type PreviewDevice = 'desktop' | 'mobile' | 'pc-medium' | 'mobile-medium' | 'mobile-mini'
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
const otherPreviewDevices: Array<{ id: PreviewDevice; label: string; size: string }> = [
  { id: 'pc-medium', label: 'PC-medium', size: '788 x 492' },
  { id: 'mobile-medium', label: 'mobile-medium', size: '396 x 475' },
  { id: 'mobile-mini', label: 'mobile-mini', size: '300 x 360' },
]

export default function VariationPage(props: { params: Promise<{ variationId: string }> }): React.JSX.Element {
  const { t } = useLanguage()
  const [variationId, setVariationId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VariationDetailResponse | null>(null)
  const [prompt, setPrompt] = useState('Make the hero bolder and switch the accent color to teal.')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [otherDeviceMenuOpen, setOtherDeviceMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState<EditorViewMode>('preview')
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('annotate')
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
  const previewDeviceMenuRef = useRef<HTMLDivElement | null>(null)
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
    if (!otherDeviceMenuOpen) return
    function handlePointerDown(event: PointerEvent): void {
      if (!previewDeviceMenuRef.current?.contains(event.target as Node)) {
        setOtherDeviceMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOtherDeviceMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [otherDeviceMenuOpen])

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
        deviceContext: device === 'mobile' || device === 'mobile-medium' || device === 'mobile-mini' ? 'mobile' : 'desktop',
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
      setNotice(`${t('downloaded')} ${exported.exportArtifact.filename}`)
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
      setNotice(t('shareLinkCreated'))
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
      setNotice(`${t('restoredBefore')}${restored.artifact.version}${t('restoredAfter')}`)
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
    setNotice(`${t('lockedBefore')}${locked.version}${t('lockedAfter')}`)
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
        appendAnnotation({ type: 'pen', points, color: '#6487FA', note: 'Freehand marked area to refine' })
      }
    } else {
      const x = Math.min(currentShape.startX, point.x)
      const y = Math.min(currentShape.startY, point.y)
      const w = Math.abs(point.x - currentShape.startX)
      const h = Math.abs(point.y - currentShape.startY)
      if (w > 0.01 && h > 0.01) {
        if (currentShape.type === 'rect') {
          appendAnnotation({ type: 'rect', x, y, w, h, color: '#6487FA', note: 'Marked area to refine' })
        } else if (currentShape.type === 'circle') {
          appendAnnotation({
            type: 'circle',
            cx: x + w / 2,
            cy: y + h / 2,
            r: Math.max(w, h) / 2,
            color: '#6487FA',
            note: 'Circular marked area to refine',
          })
        } else {
          appendAnnotation({
            type: 'arrow',
            from: { x: currentShape.startX, y: currentShape.startY },
            to: point,
            color: '#6487FA',
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

  const headingTitle = detail?.variation.title ?? 'Variation'

  return (
    <main className="ed-shell">
      <header className="ed-topbar">
        <a href={detail ? `/jobs/${detail.job.id}` : '/'} className="back-link back"><Icon name="arrowLeft" size={15} /> {t('allVariations')}</a>
        <div>
          <span className="eyebrow">{t('refineThisDesign')} · {detail?.currentArtifact ? `v${detail.currentArtifact.version}` : '—'}</span>
          <h1>{headingTitle}</h1>
          <p>{detail?.job.prompt ?? t('loadingVariation')}</p>
        </div>
        <div className="ed-cmd" aria-label="Variation actions">
          <button
            className="btn"
            data-testid="download-html-button"
            onClick={() => void downloadZip()}
            disabled={!detail?.variation.currentArtifactId || exportStatus === 'exporting'}
          >
            <Icon name="external" size={14} /> {exportStatus === 'exporting' ? t('exporting') : t('exportHtml')}
          </button>
          <button
            className="btn"
            data-testid="share-button"
            onClick={() => void createShareLink()}
            disabled={!detail?.variation.currentArtifactId || shareStatus === 'creating'}
          >
            <Icon name="link" size={14} /> {shareStatus === 'creating' ? t('sharing') : t('shareLink')}
          </button>
          <UserActionCluster />
          <button
            className="lock"
            data-testid="lock-version-button"
            onClick={lockCurrentVersion}
            disabled={!detail?.currentArtifact || detail.currentArtifact.kind !== 'html'}
          >
            <Icon name="lock" size={14} /> {lockedVersion && lockedVersion.artifactId === detail?.currentArtifact?.id ? `${t('locked')} v${lockedVersion.version}` : t('lockThisVersion')}
          </button>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {notice ? (
        <p data-testid="variation-notice" className="notice-text">
          {notice}
          {lastExport ? <> <span>{formatExportSummary(lastExport)}</span></> : null}
          {shareUrl ? <> · <a data-testid="share-link" href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a></> : null}
        </p>
      ) : null}

      <section className="ed-grid">
        <section className={`device ${device}`}>
          <div className="device-toolbar">
            <div className="view-tabs" role="tablist" aria-label="Editor view">
              <button className={viewMode === 'preview' ? 'active' : ''} onClick={() => setViewMode('preview')}>
                {t('preview')}
              </button>
              <button className={viewMode === 'code' ? 'active' : ''} onClick={() => setViewMode('code')} disabled={files.length === 0}>
                {t('code')}
              </button>
            </div>
            {viewMode === 'preview' ? (
              <div className="device-toggle editor-device-toggle" data-testid="preview-device-toggle" aria-label="Preview device">
                <button
                  className={device === 'desktop' ? 'active' : ''}
                  onClick={() => { setDevice('desktop'); setOtherDeviceMenuOpen(false) }}
                >
                  {t('desktop')}
                </button>
                <button
                  className={device === 'mobile' ? 'active' : ''}
                  onClick={() => { setDevice('mobile'); setOtherDeviceMenuOpen(false) }}
                >
                  {t('mobile')}
                </button>
                <div className="preview-other-menu" ref={previewDeviceMenuRef}>
                  <button
                    type="button"
                    className={otherPreviewDevices.some(item => item.id === device) ? 'active' : ''}
                    aria-expanded={otherDeviceMenuOpen}
                    onClick={() => setOtherDeviceMenuOpen(open => !open)}
                  >
                    {t('otherDevices')} <Icon name="chevronDown" size={13} />
                  </button>
                  {otherDeviceMenuOpen ? (
                    <div className="preview-other-list" data-testid="preview-other-list">
                      {otherPreviewDevices.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          className={device === item.id ? 'active' : ''}
                          onClick={() => { setDevice(item.id); setOtherDeviceMenuOpen(false) }}
                        >
                          <span>{item.label}</span>
                          <small>{item.size}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
            <div data-testid="variation-preview" className="canvas">
              <div className="annotated-preview-wrap">
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
                  {annotationMode ? (
                    <div className="annotation-empty">{t('drawHint')} · {annotationTool}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="preview-placeholder">{t('waitingPreview')}</div>
          )}
        </section>

        <aside className="refine">
          <div className="refine-tabs" role="tablist" aria-label="Variation tools">
            {([
              { id: 'annotate', label: t('tabAnnotate') },
              { id: 'direction', label: t('tabDirection') },
              { id: 'inspect', label: t('tabInspect') },
            ] as const).map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`side-panel-tab-${tab.id}`}
                aria-selected={sidePanelTab === tab.id}
                className={sidePanelTab === tab.id ? 'active' : ''}
                onClick={() => setSidePanelTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="refine-body">
            <div className="field">
              <label>{t('refinePrompt')}</label>
              <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} />
            </div>
            <div className="refine-actions">
              <button onClick={() => { setPrompt('') }} disabled={status === 'refining'}>{t('clear')}</button>
              <button
                className="primary"
                data-testid="refine-button"
                disabled={status === 'refining' || !detail?.variation.currentArtifactId}
                onClick={() => void submitRefine()}
              >
                {status === 'refining' ? t('refining') : t('submitRefine')} <Icon name="arrowRight" size={14} />
              </button>
            </div>

            <hr className="divider" />

            {sidePanelTab === 'annotate' ? (
              <section className="side-panel-section">
                <div className="anno-tools" aria-label="Annotation tool">
                  {(['rect', 'circle', 'arrow', 'pen', 'text'] as const).map(tool => (
                    <button
                      key={tool}
                      title={tool}
                      data-testid={`annotation-tool-${tool}`}
                      aria-pressed={annotationTool === tool}
                      className={annotationTool === tool ? 'active' : ''}
                      onClick={() => { setAnnotationTool(tool); setAnnotationMode(true) }}
                    >
                      <Icon name={annotationIconName(tool)} size={16} />
                    </button>
                  ))}
                </div>

                <label className="annotation-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="eyebrow">{t('drawMode')}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}>
                    <input
                      data-testid="annotation-draw-toggle"
                      type="checkbox"
                      checked={annotationMode}
                      onChange={event => setAnnotationMode(event.target.checked)}
                    />
                    {annotationMode ? t('on') : t('off')}
                  </span>
                </label>

                {annotations.length > 0 ? (
                  <div className="anno-list" data-testid="annotation-list">
                    {annotations.map((shape, index) => (
                      <div
                        key={index}
                        className={`anno-row ${selectedAnnotationIndex === index ? 'active' : ''}`}
                        data-testid="annotation-list-row"
                        onClick={() => selectAnnotation(index)}
                      >
                        <span className="n">{index + 1}</span>
                        <span className="t">{shape.type} · {annotationSummary(shape)}</span>
                        <span className="x" style={{ display: 'inline-flex', gap: 6 }}>
                          {shape.type === 'text' ? (
                            <button type="button" data-testid="edit-annotation-button" onClick={(e) => { e.stopPropagation(); editTextAnnotation(index) }} style={{ background: 'transparent', border: 0, color: 'var(--muted)', padding: 0, display: 'inline-flex' }}><Icon name="pen" size={13} /></button>
                          ) : null}
                          <button type="button" data-testid="delete-annotation-button" onClick={(e) => { e.stopPropagation(); deleteAnnotation(index) }} style={{ background: 'transparent', border: 0, color: 'var(--muted)', padding: 0, fontSize: 11 }}>✕</button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="anno-empty-row">{t('drawStageHint')}</div>
                )}

                <div className="anno-actions">
                  <button onClick={() => { setAnnotations([]); setSelectedAnnotationIndex(null) }} disabled={annotations.length === 0}>{t('clear')}</button>
                  <button
                    className="primary"
                    data-testid="apply-annotations-button"
                    onClick={() => void submitAnnotations()}
                    disabled={status === 'refining' || annotations.length === 0 || !detail?.variation.currentArtifactId}
                  >
                    {t('applyMarks')} <Icon name="arrowRight" size={14} />
                  </button>
                </div>
              </section>
            ) : null}

            {sidePanelTab === 'direction' ? (
              <section className="side-panel-section">
                <CapabilitySummary snapshot={detail?.job.capabilitySnapshot} compact testId="variation-capability-snapshot" />
              </section>
            ) : null}

            {sidePanelTab === 'inspect' ? (
              <section className="side-panel-section">
                <section className="runtime-summary-panel" data-testid="runtime-summary-panel">
                  <span>{t('costRuntime')}</span>
                  <div className="row"><small>{t('totalCost')}</small><span>{runtimeSummary.cost}</span></div>
                  <div className="row"><small>{t('tokensLabel')}</small><span>{runtimeSummary.tokens}</span></div>
                  <div className="row"><small>{t('status')}</small><span>{runtimeSummary.status}</span></div>
                  <div className="row"><small>{t('artifactsLabel')}</small><span>{runtimeSummary.artifacts}</span></div>
                  <small style={{ marginTop: 4 }}>{runtimeSummary.detail}</small>
                </section>

                {lockedVersion ? (
                  <div className="lock-card" data-testid="locked-version-summary">
                    <strong><Icon name="dot" size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> {lockedVersion.artifactId === detail?.currentArtifact?.id ? t('currentLocked') : t('lockedDiffers')}</strong>
                    <span>v{lockedVersion.version} · {lockedVersion.entryPath ?? lockedVersion.artifactId} · {new Date(lockedVersion.lockedAt).toLocaleString()}</span>
                  </div>
                ) : null}

                {selectedArtifactQuality && selectedArtifactQuality.status !== 'pass' ? (
                  <div className={`var-quality ${selectedArtifactQuality.status}`} data-testid="artifact-quality-summary" style={{ borderRadius: 'var(--radius)' }}>
                    <strong>{selectedArtifactQuality.status === 'fail' ? t('qualityFailed') : t('qualityWarn')}</strong>
                    <span>{selectedArtifactQuality.issues[0] ?? 'Generated artifact needs attention.'}</span>
                  </div>
                ) : null}

                {lastExport ? (
                  <div className="export-summary" data-testid="export-summary">
                    <strong>{t('latestZip')}</strong>
                    <span>{lastExport.filename}</span>
                    <span>{lastExport.files.length} file(s) · {formatBytes(lastExport.sizeBytes)} · {shortHash(lastExport.contentHash)}</span>
                    <span>{lastExport.reused ? 'Reused existing package' : 'Created from current version'}</span>
                  </div>
                ) : null}

                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>{t('versions')}</div>
                  <div className="versions">
                    {detail?.artifacts.map(artifact => (
                      <div key={artifact.id} className={`ver-row ${artifact.id === selectedArtifactId ? 'active' : ''}`}>
                        <span className="v">{artifact.kind === 'html' ? `v${artifact.version}` : artifactKindLabel(artifact.kind).slice(0, 3)}</span>
                        <button
                          type="button"
                          className="info"
                          data-testid="artifact-version-button"
                          disabled={artifact.kind !== 'html'}
                          style={{ background: 'transparent', border: 0, padding: 0, textAlign: 'left', minWidth: 0 }}
                          onClick={() => {
                            if (artifact.kind !== 'html') return
                            setSelectedArtifactId(artifact.id)
                            setViewMode('code')
                          }}
                        >
                          <span className="info" style={{ display: 'block', fontSize: 12.5, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {artifact.entryPath ?? artifact.id}
                          </span>
                          <small style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>
                            {artifact.isCurrent ? `${t('currentVersion')} · ` : ''}{artifact.exportedFromArtifactId ? `from ${shortArtifactId(artifact.exportedFromArtifactId)}` : artifact.kind}
                          </small>
                        </button>
                        {artifact.kind === 'html' && !artifact.isCurrent ? (
                          <button
                            type="button"
                            className="rest"
                            data-testid="restore-version-button"
                            disabled={Boolean(restoringArtifactId)}
                            onClick={() => void restoreVersion(artifact.id)}
                          >
                            {restoringArtifactId === artifact.id ? '…' : t('restore')}
                          </button>
                        ) : (
                          <span className="rest" style={{ visibility: 'hidden' }}>—</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
  )
}

function annotationIconName(tool: AnnotationTool): IconName {
  if (tool === 'rect') return 'square'
  if (tool === 'circle') return 'circle'
  if (tool === 'arrow') return 'arrowUpRight'
  if (tool === 'pen') return 'pen'
  return 'type'
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
