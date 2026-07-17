'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CapabilitySummary } from '@/components/CapabilitySummary'
import { CapabilityNotice } from '@/components/CapabilityNotice'
import { CodeFileViewer, type CodeFile } from '@/components/CodeFileViewer'
import { UserActionCluster } from '@/components/UserActionCluster'
import { VariationActionMenu } from '@/components/VariationActionMenu'
import { Icon, type IconName } from '@/components/Icon'
import { useLanguage } from '@/components/LanguageProvider'
import { apiUrl, cancelVariationRefine, createAnnotationBatch, downloadArtifact, exportVariation, getVariation, getVariationFiles, getVariationRefineOperation, refineVariation, restoreVariationVersion, saveVariationAsTemplate, shareVariation } from '@/lib/api'
import { mcpInvocationToUserError } from '@/lib/capabilityErrors'
import { formatQualityIssue, isInfrastructureQualityWarning } from '@/lib/qualityMessages'
import type { UserFacingError } from '@/lib/userErrors'
import type { AnnotationShape, ExportVariationResponse, RefineVariationResponse, VariationDetailResponse, VariationFilesResponse, VariationRefineOperationSnapshot } from '@dudesign/contracts'

type AnnotationTool = 'rect' | 'circle' | 'arrow' | 'pen' | 'text'
type DraftShape =
  | { type: 'rect' | 'circle' | 'arrow'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'pen'; points: Array<{ x: number; y: number }> }
type EditorViewMode = 'preview' | 'code'
type SidePanelTab = 'annotate' | 'direction' | 'inspect'
type PreviewDevice = 'desktop' | 'mobile' | 'pc-medium' | 'mobile-medium' | 'mobile-mini'
type ArtifactQuality = NonNullable<NonNullable<VariationDetailResponse['currentArtifact']>['quality']>
type ExportArtifactSummary = NonNullable<ExportVariationResponse['exportArtifact']>
type RefineFeedbackMessage = {
  id: string
  role: 'user' | 'assistant'
  status: 'submitted' | 'running' | 'done' | 'failed' | 'cancelled'
  title: string
  body: string
  createdAt: string
}
type RefineRetryAction = 'prompt' | 'annotations'
type RefineVersionTransition = {
  beforeArtifactId: string
  beforeVersion: number
  afterArtifactId: string
  afterVersion: number
}
type LockedVariationVersion = {
  variationId: string
  artifactId: string
  version: number
  entryPath: string | null
  lockedAt: string
}

const lockedVariationStorageKey = 'dudesign.lockedVariationVersions'
const taskTitleStorageKey = 'dudesign.variationTaskTitles'
const activeRefineStoragePrefix = 'dudesign.activeRefineOperation'
const otherPreviewDevices: Array<{ id: PreviewDevice; label: string; size: string }> = [
  { id: 'pc-medium', label: 'PC-medium', size: '788 x 492' },
  { id: 'mobile-medium', label: 'mobile-medium', size: '396 x 475' },
  { id: 'mobile-mini', label: 'mobile-mini', size: '300 x 360' },
]

export default function VariationPage(props: { params: Promise<{ variationId: string }> }): React.JSX.Element {
  const { t } = useLanguage()
  const [variationId, setVariationId] = useState<string | null>(null)
  const [detail, setDetail] = useState<VariationDetailResponse | null>(null)
  const [prompt, setPrompt] = useState('')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [otherDeviceMenuOpen, setOtherDeviceMenuOpen] = useState(false)
  const [viewMode, setViewMode] = useState<EditorViewMode>('preview')
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('annotate')
  const [status, setStatus] = useState<'loading' | 'idle' | 'refining' | 'cancelling' | 'cancelled' | 'error'>('loading')
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
  const [capabilityNotice, setCapabilityNotice] = useState<UserFacingError | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting'>('idle')
  const [lastExport, setLastExport] = useState<ExportArtifactSummary | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'creating'>('idle')
  const [saveTemplateStatus, setSaveTemplateStatus] = useState<'idle' | 'saving'>('idle')
  const [restoringArtifactId, setRestoringArtifactId] = useState<string | null>(null)
  const [lockedVersion, setLockedVersion] = useState<LockedVariationVersion | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [refineFeedback, setRefineFeedback] = useState<RefineFeedbackMessage[]>([])
  const [refineRetryAction, setRefineRetryAction] = useState<RefineRetryAction | null>(null)
  const [refineVersionTransition, setRefineVersionTransition] = useState<RefineVersionTransition | null>(null)
  const [versionCompare, setVersionCompare] = useState<RefineVersionTransition | null>(null)
  const [activeRefineRequestId, setActiveRefineRequestId] = useState<string | null>(null)
  const activeRefineDraftRef = useRef<{ requestId: string; kind: RefineRetryAction; prompt: string } | null>(null)
  const cancelledRefineRequestIdsRef = useRef(new Set<string>())
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
    if (!variationId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const storedRequestId = readActiveRefineRequestId(variationId)

    async function poll(requestId?: string | null): Promise<void> {
      try {
        const result = await getVariationRefineOperation(variationId!, requestId)
        if (stopped || !result.operation) return
        const operation = result.operation
        const shouldTrack = isActiveRefineOperation(operation.status)
          || operation.requestId === storedRequestId
          || operation.requestId === activeRefineDraftRef.current?.requestId
        if (!shouldTrack) return
        restoreRefineOperation(operation)
        if (isActiveRefineOperation(operation.status)) {
          timer = setTimeout(() => void poll(operation.requestId), 1200)
        }
      } catch {
        if (!stopped && storedRequestId) timer = setTimeout(() => void poll(storedRequestId), 2000)
      }
    }

    void poll(storedRequestId)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [variationId])

  useEffect(() => {
    if (!detail) return
    const key = detail.job.id || variationId
    const storedTitle = key ? readTaskTitle(key) : null
    setTaskTitle(storedTitle ?? summarizeTaskTitle(detail.job.prompt))
  }, [detail?.job.id, detail?.job.prompt, variationId])

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
    if (!annotationMode) return
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setAnnotationMode(false)
      setDraft(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [annotationMode])

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
    const selectedHtmlArtifactId = selectedArtifactId && detail?.artifacts.some(artifact => artifact.id === selectedArtifactId && artifact.kind === 'html')
      ? selectedArtifactId
      : null
    return buildVariationPreviewUrl(url, previewVersion, selectedHtmlArtifactId)
  }, [detail?.artifacts, detail?.variation.currentArtifactId, detail?.variation.previewUrl, previewVersion, selectedArtifactId])
  const compareBeforeUrl = useMemo(() => (
    detail?.variation.previewUrl && versionCompare
      ? buildVariationPreviewUrl(detail.variation.previewUrl, previewVersion, versionCompare.beforeArtifactId)
      : null
  ), [detail?.variation.previewUrl, previewVersion, versionCompare])
  const compareAfterUrl = useMemo(() => (
    detail?.variation.previewUrl && versionCompare
      ? buildVariationPreviewUrl(detail.variation.previewUrl, previewVersion, versionCompare.afterArtifactId)
      : null
  ), [detail?.variation.previewUrl, previewVersion, versionCompare])
  const activeCapabilityNotice = useMemo(() => (
    capabilityNotice ?? mcpInvocationToUserError(detail?.capabilityNotices?.[0] ?? null)
  ), [capabilityNotice, detail?.capabilityNotices])
  const activeCapabilityResult = detail?.capabilityNotices?.[0] ?? null

  async function submitRefine(): Promise<void> {
    if (!variationId || !detail?.variation.currentArtifactId || !prompt.trim()) return
    const requestId = createRefineFeedbackId()
    const submittedPrompt = prompt.trim()
    const baseArtifact = detail.artifacts.find(artifact => artifact.id === detail.variation.currentArtifactId && artifact.kind === 'html')
      ?? (detail.currentArtifact?.kind === 'html' ? detail.currentArtifact : null)
    setPrompt('')
    setStatus('refining')
    setError(null)
    setNotice(null)
    setCapabilityNotice(null)
    setRefineRetryAction(null)
    setVersionCompare(null)
    setActiveRefineRequestId(requestId)
    activeRefineDraftRef.current = { requestId, kind: 'prompt', prompt: submittedPrompt }
    writeActiveRefineRequestId(variationId, requestId)
    setRefineFeedback(messages => appendRefineFeedback(messages, [
      {
        id: `${requestId}-user`,
        role: 'user',
        status: 'submitted',
        title: t('refineUserRequest'),
        body: submittedPrompt,
        createdAt: new Date().toISOString(),
      },
      {
        id: `${requestId}-assistant`,
        role: 'assistant',
        status: 'running',
        title: t('refineRunningTitle'),
        body: t('refineRunningBody'),
        createdAt: new Date().toISOString(),
      },
    ]))
    try {
      const result = await refineVariation(variationId, {
        requestId,
        prompt: submittedPrompt,
        baseArtifactId: detail.variation.currentArtifactId,
        deviceContext: device === 'mobile' || device === 'mobile-medium' || device === 'mobile-mini' ? 'mobile' : 'desktop',
      })
      if (result.variation.status === 'cancelled' || cancelledRefineRequestIdsRef.current.has(requestId)) {
        markRefineCancelled(requestId, submittedPrompt, 'prompt')
        return
      }
      if (result.variation.status === 'failed') {
        const message = buildRefineFailureSummary(result, t('refineFailedBody'))
        setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
          status: 'failed',
          title: t('refineFailedTitle'),
          body: message,
        }))
        setPrompt(current => current.trim() ? current : submittedPrompt)
        setRefineRetryAction('prompt')
        setStatus('error')
        clearActiveRefine(requestId)
        return
      }
      if (baseArtifact && result.artifact) {
        setRefineVersionTransition({
          beforeArtifactId: baseArtifact.id,
          beforeVersion: baseArtifact.version,
          afterArtifactId: result.artifact.id,
          afterVersion: result.artifact.version,
        })
      }
      setSelectedArtifactId(result.artifact?.id ?? null)
      setPreviewVersion(version => version + 1)
      setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
        status: 'done',
        title: t('refineDoneTitle'),
        body: buildRefineDoneSummary(result.artifact?.version, result.artifact?.entryPath, t),
      }))
      setStatus('idle')
      clearActiveRefine(requestId)
    } catch (err) {
      if (cancelledRefineRequestIdsRef.current.has(requestId)) {
        markRefineCancelled(requestId, submittedPrompt, 'prompt')
        return
      }
      setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
        status: 'failed',
        title: t('refineFailedTitle'),
        body: (err as Error).message || t('refineFailedBody'),
      }))
      setPrompt(current => current.trim() ? current : submittedPrompt)
      setRefineRetryAction('prompt')
      setStatus('error')
      clearActiveRefine(requestId)
    }
  }

  async function submitAnnotations(): Promise<void> {
    if (!variationId || !detail?.variation.currentArtifactId || annotations.length === 0) return
    const requestId = createRefineFeedbackId()
    const shapeCount = annotations.length
    const submittedPrompt = prompt.trim()
    const baseArtifact = detail.artifacts.find(artifact => artifact.id === detail.variation.currentArtifactId && artifact.kind === 'html')
      ?? (detail.currentArtifact?.kind === 'html' ? detail.currentArtifact : null)
    setPrompt('')
    setStatus('refining')
    setError(null)
    setNotice(null)
    setCapabilityNotice(null)
    setRefineRetryAction(null)
    setVersionCompare(null)
    setActiveRefineRequestId(requestId)
    activeRefineDraftRef.current = { requestId, kind: 'annotations', prompt: submittedPrompt }
    writeActiveRefineRequestId(variationId, requestId)
    setRefineFeedback(messages => appendRefineFeedback(messages, [
      {
        id: `${requestId}-user`,
        role: 'user',
        status: 'submitted',
        title: t('refineAnnotationRequest'),
        body: `${shapeCount} ${t(shapeCount > 1 ? 'refineAnnotationCountPlural' : 'refineAnnotationCount')}${submittedPrompt ? ` · ${submittedPrompt}` : ''}`,
        createdAt: new Date().toISOString(),
      },
      {
        id: `${requestId}-assistant`,
        role: 'assistant',
        status: 'running',
        title: t('refineRunningTitle'),
        body: t('refineRunningBody'),
        createdAt: new Date().toISOString(),
      },
    ]))
    try {
      const result = await createAnnotationBatch(variationId, {
        requestId,
        artifactId: detail.variation.currentArtifactId,
        shapes: annotations,
        prompt: submittedPrompt || undefined,
      })
      if (result.variation.status === 'cancelled' || cancelledRefineRequestIdsRef.current.has(requestId)) {
        markRefineCancelled(requestId, submittedPrompt, 'annotations')
        return
      }
      if (result.variation.status === 'failed') {
        const message = buildRefineFailureSummary(result, t('refineFailedBody'))
        setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
          status: 'failed',
          title: t('refineFailedTitle'),
          body: message,
        }))
        setPrompt(current => current.trim() ? current : submittedPrompt)
        setRefineRetryAction('annotations')
        setStatus('error')
        clearActiveRefine(requestId)
        return
      }
      setAnnotations([])
      setSelectedAnnotationIndex(null)
      setAnnotationMode(false)
      if (baseArtifact && result.artifact) {
        setRefineVersionTransition({
          beforeArtifactId: baseArtifact.id,
          beforeVersion: baseArtifact.version,
          afterArtifactId: result.artifact.id,
          afterVersion: result.artifact.version,
        })
      }
      setSelectedArtifactId(result.artifact?.id ?? null)
      setPreviewVersion(version => version + 1)
      setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
        status: 'done',
        title: t('refineDoneTitle'),
        body: buildRefineDoneSummary(result.artifact?.version, result.artifact?.entryPath, t),
      }))
      setStatus('idle')
      clearActiveRefine(requestId)
    } catch (err) {
      if (cancelledRefineRequestIdsRef.current.has(requestId)) {
        markRefineCancelled(requestId, submittedPrompt, 'annotations')
        return
      }
      setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
        status: 'failed',
        title: t('refineFailedTitle'),
        body: (err as Error).message || t('refineFailedBody'),
      }))
      setPrompt(current => current.trim() ? current : submittedPrompt)
      setRefineRetryAction('annotations')
      setStatus('error')
      clearActiveRefine(requestId)
    }
  }

  async function cancelActiveRefine(): Promise<void> {
    const active = activeRefineDraftRef.current
    if (!variationId || !active || status !== 'refining') return
    setStatus('cancelling')
    try {
      const result = await cancelVariationRefine(variationId, active.requestId, {
        reason: 'Cancelled from the variation editor.',
      })
      if (result.status === 'already_finished') {
        setStatus('refining')
        return
      }
      cancelledRefineRequestIdsRef.current.add(active.requestId)
      markRefineCancelled(active.requestId, active.prompt, active.kind)
    } catch (err) {
      setStatus('refining')
      setRefineFeedback(messages => updateRefineFeedback(messages, `${active.requestId}-assistant`, {
        status: 'running',
        title: t('refineRunningTitle'),
        body: `${t('refineCancelFailed')} ${(err as Error).message}`,
      }))
    }
  }

  function restoreRefineOperation(operation: VariationRefineOperationSnapshot): void {
    const kind: RefineRetryAction = operation.kind === 'annotations' ? 'annotations' : 'prompt'
    const promptForInput = kind === 'prompt' ? operation.prompt : ''
    setRefineFeedback(messages => {
      if (messages.some(message => message.id === `${operation.requestId}-assistant`)) return messages
      return appendRefineFeedback(messages, [
        {
          id: `${operation.requestId}-user`,
          role: 'user',
          status: 'submitted',
          title: t(kind === 'annotations' ? 'refineAnnotationRequest' : 'refineUserRequest'),
          body: kind === 'annotations' ? t('refineRecoveredAnnotationBody') : operation.prompt,
          createdAt: operation.createdAt,
        },
        {
          id: `${operation.requestId}-assistant`,
          role: 'assistant',
          status: operation.status === 'cancelled' ? 'cancelled' : operation.status === 'failed' ? 'failed' : operation.status === 'completed' ? 'done' : 'running',
          title: operation.status === 'cancelled'
            ? t('refineCancelledTitle')
            : operation.status === 'failed'
              ? t('refineFailedTitle')
              : operation.status === 'completed'
                ? t('refineDoneTitle')
                : t('refineRunningTitle'),
          body: operation.status === 'cancelled'
            ? t(kind === 'annotations' ? 'refineCancelledAnnotationBody' : 'refineCancelledBody')
            : operation.status === 'failed'
              ? t('refineFailedBody')
              : operation.status === 'completed'
                ? t('refineRecoveredDoneBody')
                : t('refineRunningBody'),
          createdAt: operation.updatedAt,
        },
      ])
    })

    if (isActiveRefineOperation(operation.status)) {
      activeRefineDraftRef.current = { requestId: operation.requestId, kind, prompt: promptForInput }
      setActiveRefineRequestId(operation.requestId)
      writeActiveRefineRequestId(operation.variationId, operation.requestId)
      setStatus(operation.status === 'cancelling' ? 'cancelling' : 'refining')
      return
    }
    if (operation.status === 'cancelled') {
      activeRefineDraftRef.current = { requestId: operation.requestId, kind, prompt: promptForInput }
      markRefineCancelled(operation.requestId, promptForInput, kind)
      return
    }
    if (operation.status === 'failed') {
      if (kind === 'prompt') setPrompt(current => current.trim() ? current : operation.prompt)
      setRefineRetryAction(kind)
      setStatus('error')
      clearActiveRefine(operation.requestId)
      return
    }
    if (operation.status === 'completed') {
      setStatus('idle')
      clearActiveRefine(operation.requestId)
      setPreviewVersion(version => version + 1)
    }
  }

  function markRefineCancelled(requestId: string, submittedPrompt: string, kind: RefineRetryAction): void {
    cancelledRefineRequestIdsRef.current.add(requestId)
    if (kind === 'prompt') setPrompt(current => current.trim() ? current : submittedPrompt)
    setRefineFeedback(messages => updateRefineFeedback(messages, `${requestId}-assistant`, {
      status: 'cancelled',
      title: t('refineCancelledTitle'),
      body: t(kind === 'annotations' ? 'refineCancelledAnnotationBody' : 'refineCancelledBody'),
    }))
    setStatus('cancelled')
    setRefineRetryAction(null)
    clearActiveRefine(requestId)
  }

  function clearActiveRefine(requestId: string): void {
    setActiveRefineRequestId(current => current === requestId ? null : current)
    if (activeRefineDraftRef.current?.requestId === requestId) activeRefineDraftRef.current = null
    if (variationId) removeActiveRefineRequestId(variationId, requestId)
  }

  function retryLastRefine(): void {
    if (refineRetryAction === 'annotations') {
      void submitAnnotations()
      return
    }
    if (refineRetryAction === 'prompt') void submitRefine()
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

  async function saveAsTemplate(): Promise<void> {
    if (!variationId || saveTemplateStatus === 'saving' || !detail?.currentArtifact) return
    setSaveTemplateStatus('saving')
    setError(null)
    setNotice(null)
    try {
      const result = await saveVariationAsTemplate(variationId, {
        name: detail.variation.title ?? undefined,
        artifactId: detail.currentArtifact.id,
      })
      const lint = result.summary
      setNotice(`${t('savedAsTemplate')}${lint.warnings > 0 || lint.errors > 0 ? ` (${lint.errors}e / ${lint.warnings}w)` : ''}`)
    } catch (err) {
      setError(`${t('saveAsTemplateFailed')} ${(err as Error).message}`)
    } finally {
      setSaveTemplateStatus('idle')
    }
  }

  async function restoreVersion(artifactId: string): Promise<boolean> {
    if (!variationId || restoringArtifactId) return false
    setRestoringArtifactId(artifactId)
    setError(null)
    setNotice(null)
    try {
      const restored = await restoreVariationVersion(variationId, artifactId)
      setSelectedArtifactId(restored.artifact.id)
      setViewMode('preview')
      setPreviewVersion(version => version + 1)
      setNotice(`${t('restoredBefore')}${restored.artifact.version}${t('restoredAfter')}`)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setRestoringArtifactId(null)
    }
  }

  function viewUpdatedVersion(): void {
    if (!refineVersionTransition) return
    setVersionCompare(null)
    setSelectedArtifactId(refineVersionTransition.afterArtifactId)
    setViewMode('preview')
  }

  function toggleVersionCompare(): void {
    if (!refineVersionTransition) return
    setAnnotationMode(false)
    setDraft(null)
    setViewMode('preview')
    setVersionCompare(current => current ? null : refineVersionTransition)
  }

  async function undoLastRefine(): Promise<void> {
    if (!refineVersionTransition) return
    const restored = await restoreVersion(refineVersionTransition.beforeArtifactId)
    if (!restored) return
    setVersionCompare(null)
    setRefineVersionTransition(null)
    setRefineFeedback(messages => appendRefineFeedback(messages, [{
      id: createRefineFeedbackId(),
      role: 'assistant',
      status: 'done',
      title: t('refineUndoDone'),
      body: `${t('refineUndoBody')} v${refineVersionTransition.beforeVersion}`,
      createdAt: new Date().toISOString(),
    }]))
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

  function unlockCurrentVersion(): void {
    if (!variationId) return
    removeLockedVariationVersion(variationId)
    setLockedVersion(null)
    setNotice(t('unlockedVersion'))
  }

  function toggleCurrentVersionLock(): void {
    if (lockedVersion?.artifactId === detail?.currentArtifact?.id) {
      unlockCurrentVersion()
      return
    }
    lockCurrentVersion()
  }

  function commitTaskTitle(): void {
    const key = detail?.job.id || variationId
    const nextTitle = taskTitle.trim()
    if (!key || !detail) return
    if (!nextTitle) {
      const fallbackTitle = summarizeTaskTitle(detail.job.prompt)
      removeTaskTitle(key)
      setTaskTitle(fallbackTitle)
      return
    }
    writeTaskTitle(key, nextTitle)
    setTaskTitle(nextTitle)
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
        appendAnnotation({ type: 'pen', points, color: '#6487FA' })
      }
    } else {
      const x = Math.min(currentShape.startX, point.x)
      const y = Math.min(currentShape.startY, point.y)
      const w = Math.abs(point.x - currentShape.startX)
      const h = Math.abs(point.y - currentShape.startY)
      if (w > 0.01 && h > 0.01) {
        if (currentShape.type === 'rect') {
          appendAnnotation({ type: 'rect', x, y, w, h, color: '#6487FA' })
        } else if (currentShape.type === 'circle') {
          appendAnnotation({
            type: 'circle',
            cx: x + w / 2,
            cy: y + h / 2,
            r: Math.max(w, h) / 2,
            color: '#6487FA',
          })
        } else {
          appendAnnotation({
            type: 'arrow',
            from: { x: currentShape.startX, y: currentShape.startY },
            to: point,
            color: '#6487FA',
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

  function toggleAnnotationTool(tool: AnnotationTool): void {
    if (annotationMode && annotationTool === tool) {
      setAnnotationMode(false)
      setDraft(null)
      return
    }
    setAnnotationTool(tool)
    setAnnotationMode(true)
  }

  function selectSidePanelTab(tab: SidePanelTab): void {
    setSidePanelTab(tab)
    if (tab !== 'annotate') {
      setAnnotationMode(false)
      setDraft(null)
    }
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

  function updateAnnotationNote(index: number, text: string): void {
    setAnnotations(items => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const note = text
      return item.type === 'text'
        ? { ...item, text: note, note }
        : { ...item, note }
    }))
    setSelectedAnnotationIndex(index)
  }

  const variationNumber = formatVariationNumber(detail?.variation.title)
  const isCurrentVersionLocked = lockedVersion?.artifactId === detail?.currentArtifact?.id
  const taskTitleFallback = detail ? summarizeTaskTitle(detail.job.prompt) : t('loadingVariation')
  const currentVersionLabel = detail?.currentArtifact?.version ? `v${detail.currentArtifact.version}` : t('latestVersion')
  const refineStatusLabel = status === 'refining'
    ? t('refineRunningTitle')
    : status === 'cancelling'
      ? t('refineCancellingTitle')
      : status === 'cancelled'
        ? t('refineCancelledTitle')
    : status === 'error'
      ? t('refineFailedTitle')
      : isCurrentVersionLocked
        ? t('locked')
        : t('refineReady')
  const refineInFlight = status === 'refining' || status === 'cancelling'
  const showRefineLiveStatus = status === 'refining' || status === 'cancelling' || status === 'cancelled' || status === 'error'
  const showRefineOperation = refineInFlight || Boolean(refineRetryAction) || Boolean(refineVersionTransition)

  return (
    <main className="ed-shell">
      <header className="ed-topbar">
        <div className="ed-nav-actions">
          <a href={detail ? `/jobs/${detail.job.id}` : '/'} className="back-link back" aria-label={t('allVariations')} title={t('allVariations')}><Icon name="arrowLeft" size={18} /></a>
          <VariationActionMenu />
        </div>
        <div className="ed-title-block">
          <input
            className="ed-task-title-input"
            aria-label={t('taskTitleLabel')}
            title={detail?.job.prompt ?? taskTitleFallback}
            value={taskTitle}
            placeholder={taskTitleFallback}
            onChange={event => setTaskTitle(event.target.value)}
            onBlur={commitTaskTitle}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          />
        </div>
        <div className="ed-cmd" aria-label="Variation actions">
          <div className="ed-action-row">
            <div className="variation-export-actions" aria-label="Artifact actions">
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
              <button
                className="btn"
                data-testid="save-as-template-button"
                onClick={() => void saveAsTemplate()}
                disabled={!detail?.currentArtifact || detail.currentArtifact.kind !== 'html' || saveTemplateStatus === 'saving'}
              >
                <Icon name="sparkles" size={14} /> {saveTemplateStatus === 'saving' ? t('importing') : t('saveAsTemplate')}
              </button>
            </div>
            <UserActionCluster mode="profileOnly" />
          </div>
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
      <CapabilityNotice
        error={activeCapabilityNotice}
        actions={activeCapabilityNotice ? [
          { label: activeCapabilityNotice.action },
          { label: t('retryImageGeneration') },
          { label: t('switchProvider') },
        ] : undefined}
      />

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
          ) : versionCompare && compareBeforeUrl && compareAfterUrl ? (
            <div className="canvas version-compare-canvas" data-testid="version-compare-view">
              <div className="version-compare-grid">
                <section className="version-compare-pane">
                  <header>
                    <span>{t('beforeChange')}</span>
                    <strong>v{versionCompare.beforeVersion}</strong>
                  </header>
                  <iframe
                    data-testid="version-compare-before-frame"
                    title={`${t('beforeChange')} v${versionCompare.beforeVersion}`}
                    src={compareBeforeUrl}
                    sandbox="allow-scripts"
                  />
                </section>
                <section className="version-compare-pane updated">
                  <header>
                    <span>{t('afterChange')}</span>
                    <strong>v{versionCompare.afterVersion}</strong>
                  </header>
                  <iframe
                    data-testid="version-compare-after-frame"
                    title={`${t('afterChange')} v${versionCompare.afterVersion}`}
                    src={compareAfterUrl}
                    sandbox="allow-scripts"
                  />
                </section>
              </div>
            </div>
          ) : previewUrl ? (
            <div data-testid="variation-preview" className="canvas">
              <div className="annotated-preview-wrap">
                <iframe
                  data-testid="variation-preview-frame"
                  title={detail?.variation.title ?? 'Variation preview'}
                  src={previewUrl}
                  sandbox="allow-scripts"
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

        <aside className={`refine refine-${status}`}>
          <section className="refine-workspace" aria-label={t('refineWorkspace')}>
            <div className="refine-status-container">
              <div className="refine-version-meta">
                <span className="variation-index">{variationNumber}</span>
                <span className="refine-version-copy">
                  <strong>{currentVersionLabel}</strong>
                </span>
              </div>
              <button
                className={`lock ${isCurrentVersionLocked ? 'active' : ''}`}
                data-testid="lock-version-button"
                aria-pressed={isCurrentVersionLocked}
                title={isCurrentVersionLocked ? t('unlockVersion') : t('lockThisVersion')}
                onClick={toggleCurrentVersionLock}
                disabled={!detail?.currentArtifact || detail.currentArtifact.kind !== 'html'}
              >
                <Icon name={isCurrentVersionLocked ? 'check' : 'lock'} size={14} />
                <span>{isCurrentVersionLocked ? t('locked') : t('lockThisVersion')}</span>
              </button>
            </div>

            <div className="refine-chat-container">
              <div className="chat-refine-box">
                <div className="refine-chat-heading">
                  <label htmlFor="variation-refine-prompt">{t('refinePrompt')}</label>
                  {showRefineLiveStatus ? (
                    <span className={`refine-live-status ${status}`} aria-live="polite">
                      <i aria-hidden="true" /> {refineStatusLabel}
                    </span>
                  ) : null}
                </div>

                <RefineFeedbackStream messages={refineFeedback} />

                {showRefineOperation ? <div className="refine-operation-slot">
                  {refineInFlight ? (
                    <div className="refine-preview-state" data-testid="refine-preview-state">
                      <span className="refine-progress-dot" aria-hidden="true" />
                      <span>{status === 'cancelling' ? t('refineCancelPending') : t('refinePreviewPending')}</span>
                    </div>
                  ) : refineRetryAction ? (
                    <div className="refine-recovery" data-testid="refine-recovery">
                      <span>{t('refineFailurePreserved')}</span>
                      <button type="button" onClick={retryLastRefine}>{t('retry')}</button>
                    </div>
                  ) : refineVersionTransition ? (
                    <div className="refine-version-actions" data-testid="refine-version-actions">
                      <button type="button" onClick={viewUpdatedVersion}>{t('viewUpdated')}</button>
                      <button type="button" className={versionCompare ? 'active' : ''} aria-pressed={Boolean(versionCompare)} onClick={toggleVersionCompare}>{t('compareVersions')}</button>
                      <button
                        type="button"
                        className="danger"
                        data-testid="undo-refine-button"
                        disabled={Boolean(restoringArtifactId)}
                        onClick={() => void undoLastRefine()}
                      >
                        {restoringArtifactId === refineVersionTransition.beforeArtifactId ? t('restoring') : t('undoChange')}
                      </button>
                    </div>
                  ) : null}
                </div> : null}

                <div className="chat-refine-input">
                  <textarea
                    id="variation-refine-prompt"
                    value={prompt}
                    onChange={event => setPrompt(event.target.value)}
                    onKeyDown={event => {
                      if (event.nativeEvent.isComposing || event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
                      event.preventDefault()
                      if (!refineInFlight && prompt.trim() && detail?.variation.currentArtifactId) void submitRefine()
                    }}
                    rows={2}
                    placeholder={t('refinePromptPlaceholder')}
                  />
                  <button
                    type="button"
                    aria-label={status === 'refining' ? t('stopRefine') : status === 'cancelling' ? t('refineCancellingTitle') : t('submitRefine')}
                    data-testid="refine-button"
                    className={status === 'refining' ? 'stop' : ''}
                    disabled={status === 'cancelling' || (status === 'refining' ? !activeRefineRequestId : (!prompt.trim() || !detail?.variation.currentArtifactId))}
                    onClick={() => status === 'refining' ? void cancelActiveRefine() : void submitRefine()}
                  >
                    {status === 'cancelling'
                      ? <span className="refine-button-progress" aria-hidden="true" />
                      : status === 'refining'
                        ? <Icon name="x" size={15} />
                        : <Icon name="arrowUp" size={16} />}
                  </button>
                </div>

                <div className="refine-context-row">
                  <span><Icon name="dot" size={12} /> {t('refineCurrentContext')} {currentVersionLabel}</span>
                  {annotations.length > 0 ? <span className="accent">{annotations.length} {t('stagedAnnotations')}</span> : null}
                  <kbd>⌘ Enter</kbd>
                </div>
              </div>
            </div>
          </section>

          <div className="refine-tool-container">
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
                  aria-label={tab.label}
                  title={tab.label}
                  className={`${sidePanelTab === tab.id ? 'active' : ''} ${tab.id === 'inspect' ? 'secondary' : ''}`}
                  onClick={() => selectSidePanelTab(tab.id)}
                >
                  {tab.id === 'inspect' ? <Icon name="moreHorizontal" size={16} /> : tab.label}
                </button>
              ))}
            </div>

            <div className="refine-body">
            {sidePanelTab === 'annotate' ? (
              <section className="side-panel-section">
                <div className="annotation-tool-heading">
                  <span>
                    <strong>{t('annotationTools')}</strong>
                    <small>{annotationMode ? t('annotationActiveHint') : t('drawStageHint')}</small>
                  </span>
                  {annotationMode ? (
                    <button
                      type="button"
                      className="annotation-exit"
                      data-testid="annotation-exit-button"
                      onClick={() => { setAnnotationMode(false); setDraft(null) }}
                    >
                      <Icon name="x" size={13} /> {t('finishDrawing')}
                    </button>
                  ) : null}
                </div>

                <div className="anno-tools" aria-label={t('annotationTools')}>
                  {(['rect', 'circle', 'arrow', 'pen', 'text'] as const).map(tool => {
                    const active = annotationMode && annotationTool === tool
                    return (
                      <button
                        key={tool}
                        title={tool}
                        data-testid={`annotation-tool-${tool}`}
                        aria-pressed={active}
                        className={active ? 'active' : ''}
                        onClick={() => toggleAnnotationTool(tool)}
                      >
                        <Icon name={annotationIconName(tool)} size={16} />
                      </button>
                    )
                  })}
                </div>

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
                        <label className="annotation-note-field" onClick={event => event.stopPropagation()}>
                          <span>{shape.type} · {annotationSummary(shape)}</span>
                          <textarea
                            data-testid="edit-annotation-button"
                            value={annotationNote(shape)}
                            rows={1}
                            placeholder="输入此框选区域的修改说明"
                            onFocus={() => selectAnnotation(index)}
                            onChange={event => updateAnnotationNote(index, event.target.value)}
                          />
                        </label>
                        <span className="x">
                          <button type="button" data-testid="delete-annotation-button" aria-label="Delete annotation" onClick={(e) => { e.stopPropagation(); deleteAnnotation(index) }}>×</button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="anno-empty-row">{t('drawStageHint')}</div>
                )}

                {annotations.length > 0 ? (
                  <div className="anno-actions">
                    <button onClick={() => { setAnnotations([]); setSelectedAnnotationIndex(null) }}>{t('clear')}</button>
                    <button
                      className="primary"
                      data-testid="apply-annotations-button"
                      onClick={() => void submitAnnotations()}
                      disabled={refineInFlight || !detail?.variation.currentArtifactId}
                    >
                      {t('sendAnnotations')} {annotations.length} <Icon name="arrowRight" size={14} />
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {sidePanelTab === 'direction' ? (
              <section className="side-panel-section">
                <CapabilitySummary snapshot={detail?.job.capabilitySnapshot} compact testId="variation-capability-snapshot" />
                <VariationExplorationPlanSummary detail={detail} t={t} />
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

                <section className="activity capability-activity" data-testid="capability-activity">
                  <div className="eyebrow">{t('capabilityActivity')}</div>
                  {activeCapabilityNotice ? (
                    <>
                      <div className="row">
                        <span className="t">{activeCapabilityResult?.status ?? activeCapabilityNotice.severity}</span>
                        <span className="s">{activeCapabilityNotice.title}</span>
                      </div>
                      <div className="row">
                        <span className="t">{activeCapabilityResult?.source.serverName ?? t('capability')}</span>
                        <span className="s">{activeCapabilityNotice.message}</span>
                      </div>
                      <div className="row">
                        <span className="t">{t('action')}</span>
                        <span className="s">{activeCapabilityNotice.action}</span>
                      </div>
                    </>
                  ) : (
                    <div className="row">
                      <span className="t">{t('ok')}</span>
                      <span className="s">{t('noCapabilityActivity')}</span>
                    </div>
                  )}
                </section>

                {lockedVersion ? (
                  <div className="lock-card" data-testid="locked-version-summary">
                    <strong><Icon name="dot" size={12} style={{ verticalAlign: -1, marginRight: 4 }} /> {lockedVersion.artifactId === detail?.currentArtifact?.id ? t('currentLocked') : t('lockedDiffers')}</strong>
                    <span>v{lockedVersion.version} · {lockedVersion.entryPath ?? lockedVersion.artifactId} · {new Date(lockedVersion.lockedAt).toLocaleString()}</span>
                  </div>
                ) : null}

                {selectedArtifactQuality && selectedArtifactQuality.status !== 'pass' ? (
                  <div className={`var-quality ${selectedArtifactQuality.status}`} data-testid="artifact-quality-summary" style={{ borderRadius: 'var(--radius)' }}>
                    <strong>{selectedArtifactQuality.status === 'fail' ? t('qualityFailed') : isInfrastructureQualityWarning(selectedArtifactQuality.issues[0]) ? t('qualityNotice') : t('qualityWarn')}</strong>
                    <span>{formatQualityIssue(selectedArtifactQuality.issues[0])}</span>
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
                      <div key={artifact.id} className={`ver-row ${artifact.id === selectedArtifactId ? 'active' : ''}`} data-artifact-id={artifact.id}>
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
          </div>
        </aside>
      </section>
    </main>
  )
}

function VariationExplorationPlanSummary(props: {
  detail: VariationDetailResponse | null
  t: (key: string) => string
}): React.JSX.Element | null {
  const plan = props.detail?.variation.explorationPlan
  if (!plan) return null
  const modules = new Map((props.detail?.job.requirementModuleGraph?.modules ?? []).map(module => [module.id, module.title]))
  const focus = modules.get(plan.focusId) ?? plan.focusId
  return (
    <section className="variation-exploration-panel" data-testid="variation-exploration-plan">
      <header>
        <div><span>{props.t('variationFocus')}</span><strong>{focus}</strong></div>
        <span className="chip locked"><Icon name="lock" size={11} />{props.t('sourceJobSnapshot')}</span>
      </header>
      <div className="variation-exploration-plan-meta">
        <span><small>{props.t('templateDirection')}</small><strong>{props.detail?.variation.designTemplatePack?.name ?? plan.templatePackId ?? '—'}</strong></span>
        <span><small>{props.t('styleDirection')}</small><strong>{plan.styleDirectionId ?? '—'}</strong></span>
        <span><small>{props.t('interactionDirection')}</small><strong>{plan.interactionDirectionIds.join(' · ') || '—'}</strong></span>
      </div>
      <div className="variation-exploration-module-group">
        <small>{props.t('requiredModules')}</small>
        <div>{plan.requiredModuleIds.map(id => <span className="chip locked" key={id}>{modules.get(id) ?? id}</span>)}</div>
      </div>
      <div className="variation-exploration-module-group">
        <small>{props.t('sampledModules')}</small>
        <div>{plan.sampledModuleIds.map(id => <span className="chip info" key={id}>{modules.get(id) ?? id}</span>)}</div>
      </div>
      {plan.excludedModuleIds.length ? (
        <div className="variation-exploration-module-group">
          <small>{props.t('moduleExcluded')}</small>
          <div>{plan.excludedModuleIds.map(id => <span className="chip" key={id}>{modules.get(id) ?? id}</span>)}</div>
        </div>
      ) : null}
    </section>
  )
}

function annotationIconName(tool: AnnotationTool): IconName {
  if (tool === 'rect') return 'square'
  if (tool === 'circle') return 'circle'
  if (tool === 'arrow') return 'arrowUpRight'
  if (tool === 'pen') return 'pen'
  return 'type'
}

function formatVariationNumber(title?: string | null): string {
  const match = title?.match(/\d+/)
  const value = match ? Number.parseInt(match[0]!, 10) : 1
  return Number.isFinite(value) ? String(value).padStart(2, '0') : '01'
}

function isActiveRefineOperation(status: VariationRefineOperationSnapshot['status']): boolean {
  return status === 'starting' || status === 'running' || status === 'cancelling'
}

function activeRefineStorageKey(variationId: string): string {
  return `${activeRefineStoragePrefix}:${variationId}`
}

function readActiveRefineRequestId(variationId: string): string | null {
  try {
    return window.sessionStorage.getItem(activeRefineStorageKey(variationId))
  } catch {
    return null
  }
}

function writeActiveRefineRequestId(variationId: string, requestId: string): void {
  try {
    window.sessionStorage.setItem(activeRefineStorageKey(variationId), requestId)
  } catch {
    // The backend operation remains authoritative when session storage is unavailable.
  }
}

function removeActiveRefineRequestId(variationId: string, requestId: string): void {
  try {
    if (window.sessionStorage.getItem(activeRefineStorageKey(variationId)) === requestId) {
      window.sessionStorage.removeItem(activeRefineStorageKey(variationId))
    }
  } catch {
    // Best effort only.
  }
}

function RefineFeedbackStream(props: { messages: RefineFeedbackMessage[] }): React.JSX.Element {
  const visibleMessages = props.messages.slice(-6)
  const streamRef = useRef<HTMLDivElement | null>(null)
  const latestMessage = visibleMessages.at(-1)

  useEffect(() => {
    const stream = streamRef.current
    if (!stream) return
    stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' })
  }, [latestMessage?.id, latestMessage?.status])

  return (
    <div ref={streamRef} className={`refine-feedback ${visibleMessages.length === 0 ? 'is-empty' : ''}`} data-testid="refine-feedback-stream" aria-live="polite">
      {visibleMessages.map(message => (
        <div key={message.id} className={`refine-feedback-row ${message.role} ${message.status}`} data-testid="refine-feedback-row">
          <span className="refine-feedback-dot" aria-hidden="true" />
          <div>
            <strong>{message.title}</strong>
            <p>{message.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function createRefineFeedbackId(): string {
  return `refine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function appendRefineFeedback(
  messages: RefineFeedbackMessage[],
  nextMessages: RefineFeedbackMessage[],
): RefineFeedbackMessage[] {
  return [...messages, ...nextMessages].slice(-10)
}

function updateRefineFeedback(
  messages: RefineFeedbackMessage[],
  id: string,
  patch: Partial<Pick<RefineFeedbackMessage, 'status' | 'title' | 'body'>>,
): RefineFeedbackMessage[] {
  return messages.map(message => message.id === id ? { ...message, ...patch } : message)
}

function buildVariationPreviewUrl(path: string, previewVersion: number, artifactId: string | null): string {
  const params = new URLSearchParams({ v: String(previewVersion) })
  if (artifactId) params.set('artifactId', artifactId)
  return `${apiUrl(path)}?${params.toString()}`
}

function buildRefineDoneSummary(
  version: number | undefined,
  entryPath: string | null | undefined,
  t: (key: string) => string,
): string {
  const versionLabel = typeof version === 'number' ? `v${version}` : t('latestVersion')
  const entryLabel = entryPath ? ` · ${entryPath}` : ''
  return `${t('refineDoneBody')} ${versionLabel}${entryLabel}`
}

function buildRefineFailureSummary(result: RefineVariationResponse, fallback: string): string {
  return result.variation.errorMessage?.trim() || fallback
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
        {shape.note?.trim() ? <strong>{shape.note}</strong> : null}
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
  const note = annotationNote(shape).trim()
  if (note) return note.length > 42 ? `${note.slice(0, 42)}...` : note
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

function annotationNote(shape: AnnotationShape): string {
  if (shape.type === 'text') return shape.text
  return shape.note ?? ''
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

function removeLockedVariationVersion(variationId: string): void {
  try {
    const raw = window.localStorage.getItem(lockedVariationStorageKey)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, LockedVariationVersion>
    delete parsed[variationId]
    window.localStorage.setItem(lockedVariationStorageKey, JSON.stringify(parsed))
  } catch {
    // Locking is a local MVP affordance until backend collaboration state lands.
  }
}

function readTaskTitle(key: string): string | null {
  try {
    const raw = window.localStorage.getItem(taskTitleStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, string>
    const title = parsed[key]?.trim()
    return title || null
  } catch {
    return null
  }
}

function writeTaskTitle(key: string, title: string): void {
  try {
    const raw = window.localStorage.getItem(taskTitleStorageKey)
    const parsed = raw ? JSON.parse(raw) as Record<string, string> : {}
    window.localStorage.setItem(taskTitleStorageKey, JSON.stringify({
      ...parsed,
      [key]: normalizeTaskTitle(title),
    }))
  } catch {
    // Task titles are a local MVP affordance until backend session summaries land.
  }
}

function removeTaskTitle(key: string): void {
  try {
    const raw = window.localStorage.getItem(taskTitleStorageKey)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, string>
    delete parsed[key]
    window.localStorage.setItem(taskTitleStorageKey, JSON.stringify(parsed))
  } catch {
    // Task titles are a local MVP affordance until backend session summaries land.
  }
}

function summarizeTaskTitle(prompt: string): string {
  const cleaned = normalizeTaskTitle(prompt)
  if (!cleaned) return 'Untitled task'
  const explicitTitle = extractExplicitTaskTitle(cleaned)
  if (explicitTitle) return explicitTitle

  const meaningfulLines = cleaned
    .split(/[。！？!?；;\n\r]+/)
    .map(line => normalizeTaskTitle(line.replace(/^#+\s*/, '')))
    .filter(Boolean)
    .filter(line => !/^(故事|story|用户|user|prompt|task|需求|背景|说明)\s*\d*[:：]?$/i.test(line))
  const candidate = meaningfulLines.find(line => /落地页|网页|页面|产品|平台|dashboard|landing|website|homepage|app|设计|生成|开发/i.test(line))
    ?? meaningfulLines[0]
    ?? cleaned

  return clampTaskTitle(candidate)
}

function extractExplicitTaskTitle(text: string): string | null {
  const patterns = [
    /(?:任务标题|标题|项目名称|会话标题)\s*[:：]\s*([^。！？!?\n\r]+)/i,
    /(?:生成|开发|设计|制作|创建)(?:一个|一款|一份)?([^。！？!?\n\r]{4,48})/i,
    /(?:做|改造)(?:一个|一款|一份)?([^。！？!?\n\r]{4,48})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    const value = normalizeTaskTitle(match?.[1] ?? '')
    if (value) return clampTaskTitle(value)
  }
  return null
}

function normalizeTaskTitle(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/[`"'“”‘’<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampTaskTitle(value: string): string {
  const normalized = normalizeTaskTitle(value)
  if (normalized.length <= 34) return normalized
  return `${normalized.slice(0, 34).trim()}...`
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
