'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createDesignJob,
  createSession,
  createSourceArtifact,
  deleteSession,
  getCapabilities,
    getBootstrap,
    exportCapabilityBundle,
  getUserPreferences,
    importDesignTemplatePack,
    importCapabilityBundle,
    listCapabilityAuthoringDrafts,
  listDesignTemplates,
  listSessions,
  previewExplorationPlan,
  resumeSession,
    updateSession,
    updateCapabilityAuthoringDraft,
    previewCapabilityAuthoringDraft,
  updateUserPreferences,
  type BootstrapResponse,
  type CapabilitiesResponse,
  type ModelOption,
  type SessionSnapshot,
} from '@/lib/api'
import {
  resolveExplorationMode,
  type BatchExplorationPlanV1,
  type AutomationLoopProfile,
  type CapabilityAuthoringDraft,
  type CapabilityPreset,
  type CapabilitySelectionSource,
  type DesignTemplatePack,
  type RequirementModuleGraphV1,
  type UserCapabilityPreference,
} from '@dudesign/contracts'
import { useLanguage } from '@/components/LanguageProvider'
import { UserActionCluster } from '@/components/UserActionCluster'
import { DesignSystemPicker } from '@/components/DesignSystemPicker'
import { PluginsPicker } from '@/components/PluginsPicker'
import { PreferencesPanel, type PreferencesPanelLabels } from '@/components/PreferencesPanel'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { useCapabilityI18n } from '@/lib/capabilityI18n'
import { withAppBase } from '@/lib/appBasePath'

const inspirationCases = [
  {
    title: '欲买桂花同载酒诗词解析',
    category: '文化类词语',
    prompt:
      '参考“欲买桂花同载酒”诗词解析的真实页面结构，生成一个围绕文化类词语的动态百科页面，突出主视觉、词义拆解、诗词脉络和注释卡片层级。',
    href: '/inspiration/culture/guihua/index.html',
  },
  {
    title: '蜂鸟科物种图鉴',
    category: '对比辨析参考',
    prompt:
      '参考蜂鸟科物种图鉴的真实页面结构，生成一个物种对比图鉴页面，突出多图卡片、体型对比、信息分栏和细粒度说明。',
    href: '/inspiration/species/hummingbird/index.html',
  },
  {
    title: '长沙市花明楼景区导览及路线推荐',
    category: '景区景点',
    prompt:
      '参考长沙市花明楼景区导览及路线推荐的真实页面结构，生成一个景区导览页面，突出地图导览、路线推荐、景点卡片和沉浸式预览。',
    href: '/inspiration/scenic/huaminglou/index.html',
  },
  {
    title: '黄月英：核心事件因果链',
    category: '历史人物',
    prompt:
      '参考黄月英：核心事件因果链的真实页面结构，生成一个历史人物解析页面，突出时间线、核心事件、因果关系和人物画像模块。',
    href: '/inspiration/history/huangyueying/index.html',
  },
  {
    title: '《北上》人物图谱与剧情脉络',
    category: '电影电视剧',
    prompt:
      '参考《北上》人物图谱与剧情脉络的真实页面结构，生成一个影视人物关系图谱页面，突出角色关系、剧情推进和章节化内容布局。',
    href: '/inspiration/drama/beishang/index.html',
  },
  {
    title: '大话西游：人物关系与剧情全解析',
    category: '关系图谱参考',
    prompt:
      '参考大话西游：人物关系与剧情全解析的真实页面结构，生成一个人物关系与剧情解析页面，突出关系图谱、剧情节点和人物互联内容。',
    href: '/inspiration/relations/dahua/index.html',
  },
]

const variationOptions = [1, 2, 3, 4, 5, 6]
type OpenMenu = 'workspace' | 'context' | 'variations' | 'template' | 'plugins' | 'loop' | 'model' | null
type ContextPanel = 'files' | 'loop' | 'plugins'
const entryClassificationOptions = [
  { primaryCategory: '机构组织', secondaryCategory: '企业', label: '企业' },
  { primaryCategory: '机构组织', secondaryCategory: '学校', label: '学校' },
  { primaryCategory: '名人', secondaryCategory: '娱乐明星', label: '名人' },
  { primaryCategory: '名人', secondaryCategory: '历史人物', label: '历史人物' },
  { primaryCategory: '影视作品', secondaryCategory: '电影', label: '电影' },
  { primaryCategory: '影视作品', secondaryCategory: '电视剧', label: '电视剧' },
  { primaryCategory: '文学著作', secondaryCategory: '小说著作', label: '文学著作' },
  { primaryCategory: '游戏', secondaryCategory: '电子游戏', label: '游戏' },
  { primaryCategory: '物品产品', secondaryCategory: '产品设备', label: '产品设备' },
  { primaryCategory: '知识术语', secondaryCategory: '文化类词语', label: '文化词语' },
  { primaryCategory: '知识术语', secondaryCategory: '概念定义', label: '知识术语' },
]
const floatingMenuGlassStyle: React.CSSProperties = {
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  zIndex: 40,
}
type CapabilityPreferenceDraft = {
  visualMode?: 'pack' | 'custom'
  domainTemplateId?: string
  aestheticProfileId?: string
  colorPaletteId?: string
  loopProfileId?: string
  brandStyleReferenceId?: string
  referenceBrand?: string
  styleNotes?: string
  negativeRequirements?: string
}

type ProductMode = 'web_app'
type SessionDialog = {
  kind: 'rename' | 'delete'
  session: SessionSnapshot
}

const capabilityPreferenceStorageKey = 'dudesign.capabilityPreference'

export default function HomePage(): React.JSX.Element {
  const { t } = useLanguage()
  const c18n = useCapabilityI18n()
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null)
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null)
  const [prompt, setPrompt] = useState('')
  const [productMode, setProductMode] = useState<ProductMode>('web_app')
  const [variationCount, setVariationCount] = useState(3)
  const [explorationLevel, setExplorationLevel] = useState(40)
  const [reviewMode, setReviewMode] = useState<'off' | 'semi_auto' | 'auto'>('semi_auto')
  const [experimentalConfirmed, setExperimentalConfirmed] = useState(false)
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null)
  const [explorationPlanPreview, setExplorationPlanPreview] = useState<BatchExplorationPlanV1 | null>(null)
  const [explorationModuleGraph, setExplorationModuleGraph] = useState<RequirementModuleGraphV1 | null>(null)
  const [explorationPreviewStatus, setExplorationPreviewStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [lockedModuleIds, setLockedModuleIds] = useState<string[]>([])
  const [excludedModuleIds, setExcludedModuleIds] = useState<string[]>([])
  const [mode, setMode] = useState<'new_html' | 'from_existing_html'>('new_html')
  const [styles, setStyles] = useState('minimal, trustworthy')
  const [modelServiceId, setModelServiceId] = useState<string>('')
  const [domainTemplateId, setDomainTemplateId] = useState<string>('')
  const [aestheticProfileId, setAestheticProfileId] = useState<string>('')
  const [colorPaletteId, setColorPaletteId] = useState<string>('')
  const [loopProfileId, setLoopProfileId] = useState<string>('')
  const [brandStyleReferenceId, setBrandStyleReferenceId] = useState<string>('')
  const [referenceBrand, setReferenceBrand] = useState('')
  const [negativeRequirements, setNegativeRequirements] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [sourceArtifact, setSourceArtifact] = useState<{
    id: string
    entryPath: string
    sizeBytes: number
    qualityStatus: 'pass' | 'warn' | 'fail' | null
  } | null>(null)
  const [sourceUploadStatus, setSourceUploadStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [status, setStatus] = useState<'idle' | 'loading' | 'submitting' | 'error'>('loading')
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSnapshot[]>([])
  const [sessionQuery, setSessionQuery] = useState('')
  const [showOlderSessions, setShowOlderSessions] = useState(false)
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null)
  const [sessionDialog, setSessionDialog] = useState<SessionDialog | null>(null)
  const [sessionActionSaving, setSessionActionSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [capabilityDrawerOpen, setCapabilityDrawerOpen] = useState(false)
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>('files')
  const contextTriggerRef = useRef<HTMLButtonElement | null>(null)
  const capabilityDrawerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const capabilityDrawerCloseRef = useRef<HTMLButtonElement | null>(null)
  const capabilityDrawerPanelRef = useRef<HTMLElement | null>(null)
  const capabilityDrawerWasOpenRef = useRef(false)
  const inspireRef = useRef<HTMLElement | null>(null)
  const explorationPreviewRevisionRef = useRef(0)
  const [templatePacks, setTemplatePacks] = useState<DesignTemplatePack[]>([])
  const [selectedTemplatePackIds, setSelectedTemplatePackIds] = useState<string[]>([])
  const [autoDistributePacks, setAutoDistributePacks] = useState<boolean>(true)
  const [visualMode, setVisualMode] = useState<'pack' | 'custom'>('pack')
  const [favoriteTemplateIds, setFavoriteTemplateIds] = useState<string[]>([])
  const [recentTemplateIds, setRecentTemplateIds] = useState<string[]>([])
  const [templateImporting, setTemplateImporting] = useState<boolean>(false)
  const [templateImportNotice, setTemplateImportNotice] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [authoringDrafts, setAuthoringDrafts] = useState<CapabilityAuthoringDraft[]>([])
  const [importedBundleDraft, setImportedBundleDraft] = useState<CapabilityAuthoringDraft | null>(null)
  const [bundleBusy, setBundleBusy] = useState(false)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [selectedMcpToolIds, setSelectedMcpToolIds] = useState<string[]>([])
  const [userOverrideCapabilityIds, setUserOverrideCapabilityIds] = useState<string[]>([])
  const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false)
  const [preferencesSaving, setPreferencesSaving] = useState<boolean>(false)
  const [userPreference, setUserPreference] = useState<UserCapabilityPreference | null>(null)
  const promptRef = useRef('')

  useEffect(() => {
    Promise.all([getBootstrap(), listSessions(), getCapabilities()])
      .then(data => {
        setBootstrap(data[0])
        setModelServiceId(data[0].models.defaultModelId ?? data[0].models.models[0]?.id ?? '')
        setSelectedWorkspaceId(data[0].workspace.id)
        setSessions(data[1].sessions)
        setCapabilities(data[2])
        const localPreference = readCapabilityPreference()
        setDomainTemplateId(localPreference.domainTemplateId ?? data[2].defaults.domainTemplateId)
        setAestheticProfileId(localPreference.aestheticProfileId ?? data[2].defaults.aestheticProfileId)
        setColorPaletteId(localPreference.colorPaletteId ?? data[2].defaults.colorPaletteId)
        setLoopProfileId(localPreference.loopProfileId ?? data[2].defaults.loopProfileId)
        setBrandStyleReferenceId(localPreference.brandStyleReferenceId ?? data[2].defaults.brandStyleReferenceId ?? '')
        setReferenceBrand(localPreference.referenceBrand ?? '')
        setStyles(localPreference.styleNotes ?? 'minimal, trustworthy')
        setNegativeRequirements(localPreference.negativeRequirements ?? '')
        setVisualMode(localPreference.visualMode ?? 'pack')
        setStatus('idle')
        return getUserPreferences()
          .then(preferences => {
            setDomainTemplateId(localPreference.domainTemplateId ?? preferences.capabilityPreference.domainTemplateId ?? data[2].defaults.domainTemplateId)
            setAestheticProfileId(localPreference.aestheticProfileId ?? preferences.capabilityPreference.aestheticProfileId ?? data[2].defaults.aestheticProfileId)
            setColorPaletteId(localPreference.colorPaletteId ?? preferences.capabilityPreference.colorPaletteId ?? data[2].defaults.colorPaletteId)
            setLoopProfileId(localPreference.loopProfileId ?? preferences.capabilityPreference.loopProfileId ?? data[2].defaults.loopProfileId)
            setBrandStyleReferenceId(localPreference.brandStyleReferenceId ?? data[2].defaults.brandStyleReferenceId ?? '')
            setReferenceBrand(localPreference.referenceBrand ?? '')
            setStyles(localPreference.styleNotes ?? 'minimal, trustworthy')
            setNegativeRequirements(localPreference.negativeRequirements ?? '')
            setVisualMode(localPreference.visualMode ?? 'pack')
            const preferredSkillId = preferences.capabilityPreference.skillId
            setSelectedSkillIds(preferredSkillId ? [preferredSkillId] : [])
            const preferredTemplatePackId = preferences.capabilityPreference.designTemplatePackId
            if (preferredTemplatePackId) {
              setSelectedTemplatePackIds([preferredTemplatePackId])
              setVisualMode('pack')
            }
            setUserPreference(preferences.capabilityPreference)
          })
          .catch(err => {
            console.warn('Failed to load capability preferences', err)
          })
      })
      .catch(err => {
        if (isAuthRequiredError(err)) {
      window.location.href = withAppBase('/login')
          return
        }
        setError((err as Error).message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    if (!capabilityDrawerOpen) return
    capabilityDrawerWasOpenRef.current = true
    const focusFrame = window.requestAnimationFrame(() => capabilityDrawerCloseRef.current?.focus())
    const closeOrTrapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCapabilityDrawerOpen(false)
        return
      }
      if (event.key !== 'Tab' || !window.matchMedia('(max-width: 767px)').matches) return
      const panel = capabilityDrawerPanelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getClientRects().length > 0)
      if (!focusable.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', closeOrTrapFocus)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', closeOrTrapFocus)
    }
  }, [capabilityDrawerOpen])

  useEffect(() => {
    if (capabilityDrawerOpen || !capabilityDrawerWasOpenRef.current) return
    capabilityDrawerWasOpenRef.current = false
    const focusFrame = window.requestAnimationFrame(() => capabilityDrawerTriggerRef.current?.focus())
    return () => window.cancelAnimationFrame(focusFrame)
  }, [capabilityDrawerOpen])

  useEffect(() => {
    function closeMenus(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Element && target.closest('[data-menu-root="true"]')) return
      setOpenMenu(null)
      setOpenSessionMenuId(null)
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setOpenSessionMenuId(null)
      }
    }

    document.addEventListener('pointerdown', closeMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  // “需要灵感”区块:进入视口才披露(向下滚动自动显现)
  useEffect(() => {
    const node = inspireRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      node?.classList.add('revealed')
      return
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed')
          observer.disconnect()
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setFavoriteTemplateIds(readTemplateFavorites())
    setRecentTemplateIds(readTemplateRecent().map(item => item.id))
    let cancelled = false
    listDesignTemplates()
      .then(response => {
        if (!cancelled) setTemplatePacks(response.templates)
      })
      .catch(err => {
        if (isAuthRequiredError(err)) {
      window.location.href = withAppBase('/login')
          return
        }
        console.warn('Failed to load design templates', err)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    let cancelled = false
    listCapabilityAuthoringDrafts(selectedWorkspaceId)
      .then(response => {
        if (!cancelled) setAuthoringDrafts(response.drafts)
      })
      .catch(err => {
        if (!cancelled) console.warn('Failed to load capability authoring drafts', err)
      })
    return () => { cancelled = true }
  }, [selectedWorkspaceId])

  function toggleTemplateSelect(id: string): void {
    setSelectedTemplatePackIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    )
  }

  function toggleTemplateFavorite(id: string): void {
    setFavoriteTemplateIds(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id]
      writeTemplateFavorites(next)
      return next
    })
  }

  function selectProductMode(next: ProductMode): void {
    const applyMode = (): void => {
      applyProductMode(next)
    }
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> }
    }).startViewTransition
    if (typeof startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      startViewTransition.call(document, applyMode)
      return
    }
    applyMode()
  }

  function applyProductMode(_next: ProductMode): void {
    setProductMode('web_app')
    setCapabilityDrawerOpen(false)
    setExperimentalConfirmed(false)
    setExplorationPlanPreview(null)
    setExplorationModuleGraph(null)
    setExplorationPreviewStatus('idle')
    setDraftSessionId(null)
    setUserOverrideCapabilityIds([])
    setLockedModuleIds([])
    setExcludedModuleIds([])
  }

  function handlePromptChange(value: string): void {
    promptRef.current = value
    setPrompt(value)
  }

  async function importDesignMd(designMd: string, name?: string): Promise<void> {
    setTemplateImporting(true)
    setTemplateImportNotice(null)
    try {
      const result = await importDesignTemplatePack({ designMd, name: name ?? null })
      setTemplatePacks(current => {
        const exists = current.some(pack => pack.id === result.template.id)
        return exists ? current.map(pack => pack.id === result.template.id ? result.template : pack) : [result.template, ...current]
      })
      setVisualMode('pack')
      setSelectedTemplatePackIds([result.template.id])
      const kind = result.summary.errors > 0 ? 'err' : result.summary.warnings > 0 ? 'warn' : 'ok'
      setTemplateImportNotice({ kind, text: `${t('importSuccess')} (${result.summary.errors}e / ${result.summary.warnings}w / ${result.summary.info}i)` })
    } catch (err) {
      setTemplateImportNotice({ kind: 'err', text: `${t('importFailed')} ${(err as Error).message}` })
    } finally {
      setTemplateImporting(false)
    }
  }

  async function importBundleFile(file: File): Promise<void> {
    if (!bootstrap) return
    setBundleBusy(true)
    setTemplateImportNotice(null)
    try {
      const result = await importCapabilityBundle({
        workspaceId: selectedWorkspaceId || bootstrap.workspace.id,
        bundleBase64: await fileToBase64(file),
      })
      setImportedBundleDraft(result.draft)
      setAuthoringDrafts(current => upsertAuthoringDraft(current, result.draft))
      setTemplateImportNotice({ kind: 'ok', text: t('bundleImported') })
    } catch (err) {
      setTemplateImportNotice({ kind: 'err', text: `${t('importFailed')} ${(err as Error).message}` })
    } finally {
      setBundleBusy(false)
    }
  }

  async function confirmBundleDraft(draft: CapabilityAuthoringDraft): Promise<void> {
    setBundleBusy(true)
    setTemplateImportNotice(null)
    try {
      const workspaceId = draft.workspaceId
      const confirmedPaths = collectAuthoringEvidencePaths(draft)
      const confirmed = await updateCapabilityAuthoringDraft(draft.id, { workspaceId, confirmedPaths })
      const previewed = await previewCapabilityAuthoringDraft(draft.id, workspaceId)
      setImportedBundleDraft(previewed.draft)
      setAuthoringDrafts(current => upsertAuthoringDraft(current, previewed.draft))
      setTemplateImportNotice({
        kind: previewed.draft.status === 'ready' ? 'ok' : 'warn',
        text: previewed.draft.status === 'ready' ? t('bundlePreviewPassed') : t('bundlePreviewWarning'),
      })
    } catch (err) {
      setTemplateImportNotice({ kind: 'err', text: `${t('bundlePreviewWarning')} ${(err as Error).message}` })
    } finally {
      setBundleBusy(false)
    }
  }

  async function downloadCapabilityBundle(input: {
    draftId: string
    licenseDeclaration: 'user_owned_or_authorized' | 'unspecified'
    licenseNotes: string | null
  }): Promise<void> {
    if (!bootstrap) return
    setBundleBusy(true)
    setTemplateImportNotice(null)
    try {
      const blob = await exportCapabilityBundle(input.draftId, {
        workspaceId: selectedWorkspaceId || bootstrap.workspace.id,
        licenseDeclaration: input.licenseDeclaration,
        licenseNotes: input.licenseNotes,
      })
      downloadBlob(blob, `dudesign-${input.draftId}.capability-bundle.zip`)
      setTemplateImportNotice({ kind: 'ok', text: t('bundleExported') })
    } catch (err) {
      setTemplateImportNotice({ kind: 'err', text: `${t('bundleExportFailed')} ${(err as Error).message}` })
    } finally {
      setBundleBusy(false)
    }
  }

  async function savePreferences(next: Partial<UserCapabilityPreference>): Promise<void> {
    setPreferencesSaving(true)
    try {
      const base = userPreference ?? {
        domainTemplateId: null,
        aestheticProfileId: null,
        colorPaletteId: null,
        loopProfileId: null,
      }
      const merged: UserCapabilityPreference = { ...base, ...next }
      setUserPreference(merged)
      // 本地兜底:仅写入 capabilityPreference 草稿支持的字段
      writeCapabilityPreference({
        visualMode: merged.designTemplatePackId ? 'pack' : visualMode,
        domainTemplateId: merged.domainTemplateId ?? '',
        aestheticProfileId: merged.aestheticProfileId ?? '',
        colorPaletteId: merged.colorPaletteId ?? '',
        loopProfileId: merged.loopProfileId ?? '',
        brandStyleReferenceId: merged.brandStyleReferenceId ?? '',
        referenceBrand: merged.advancedConstraints?.referenceBrand ?? '',
        styleNotes: (merged.advancedConstraints?.styleNotes ?? []).join(', '),
        negativeRequirements: (merged.advancedConstraints?.negativeRequirements ?? []).join('\n'),
      })
      // 应用默认值到当前 composer 状态
      if (merged.loopProfileId) setLoopProfileId(merged.loopProfileId)
      if (merged.advancedConstraints?.colorPaletteId) setColorPaletteId(merged.advancedConstraints.colorPaletteId)
      if (merged.advancedConstraints?.referenceBrand !== undefined) setReferenceBrand(merged.advancedConstraints.referenceBrand ?? '')
      if (merged.advancedConstraints?.styleNotes) setStyles(merged.advancedConstraints.styleNotes.join(', '))
      if (merged.advancedConstraints?.negativeRequirements !== undefined) setNegativeRequirements((merged.advancedConstraints.negativeRequirements ?? []).join('\n'))
      if (merged.designTemplatePackId) setSelectedTemplatePackIds([merged.designTemplatePackId])
      if (merged.skillId) setSelectedSkillIds([merged.skillId])
      await updateUserPreferences({ capabilityPreference: next })
    } catch (err) {
      console.warn('Failed to save preferences', err)
    } finally {
      setPreferencesSaving(false)
      setPreferencesOpen(false)
    }
  }

  const workspaces = bootstrap?.workspaces?.length ? bootstrap.workspaces : bootstrap ? [bootstrap.workspace] : []
  const workspace = workspaces.find(item => item.id === selectedWorkspaceId) ?? bootstrap?.workspace
  const modelOptions = bootstrap?.models?.models ?? []
  const selectedModel = modelOptions.find(model => model.id === modelServiceId)
  const selectedDomain = capabilities?.domainTemplates.find(template => template.id === domainTemplateId)
  const selectedAesthetic = capabilities?.aestheticProfiles.find(profile => profile.id === aestheticProfileId)
  const availablePalettes = capabilities?.colorPalettes.filter(palette =>
    !selectedAesthetic || selectedAesthetic.colorPaletteIds.includes(palette.id)
  ) ?? []
  const selectedPalette = availablePalettes.find(palette => palette.id === colorPaletteId)
    ?? capabilities?.colorPalettes.find(palette => palette.id === colorPaletteId)
  const selectedLoop = capabilities?.automationLoopProfiles.find(profile => profile.id === loopProfileId)
  const pluginsById = new Map((capabilities?.plugins ?? []).map(plugin => [plugin.id, plugin]))
  const selectedSkillSummary = (capabilities?.skills ?? [])
    .filter(skill => selectedSkillIds.includes(skill.id))
    .map(skill => c18n.skillName(skill.id, pluginsById.get(skill.pluginId)?.name ?? skill.id))
  const selectedMcpToolSummary = (capabilities?.mcpToolBindings ?? [])
    .filter(binding => selectedMcpToolIds.includes(binding.id))
    .map(binding => binding.id)
  const selectedPluginSummary = [...selectedSkillSummary, ...selectedMcpToolSummary]
  function selectContextPanel(panel: ContextPanel): void {
    setContextPanel(panel)
  }
  const explorationMode = resolveExplorationMode(explorationLevel)
  const canSubmit = useMemo(() => {
    return status !== 'submitting'
      && sourceUploadStatus !== 'uploading'
      && Boolean(bootstrap)
      && prompt.trim().length > 0
      && (mode === 'new_html' || Boolean(sourceArtifact))
  }, [bootstrap, mode, prompt, sourceArtifact, sourceUploadStatus, status])

  async function uploadSourceFile(file: File | null): Promise<void> {
    if (!file || !bootstrap) return
    setMode('from_existing_html')
    setSourceUploadStatus('uploading')
    setSourceArtifact(null)
    setError(null)
    try {
      const html = await file.text()
      const created = await createSourceArtifact({
        workspaceId: workspace?.id ?? bootstrap.workspace.id,
        filename: file.name,
        html,
      })
      setSourceArtifact({
        id: created.artifact.id,
        entryPath: created.artifact.entryPath,
        sizeBytes: created.artifact.sizeBytes,
        qualityStatus: created.artifact.quality?.status ?? null,
      })
      setSourceUploadStatus('idle')
    } catch (err) {
      setError((err as Error).message)
      setSourceUploadStatus('error')
    }
  }

  async function submit(): Promise<void> {
    if (!bootstrap || !canSubmit) return
    setStatus('submitting')
    setError(null)
    try {
      const sessionId = draftSessionId ?? (await createSession({
        workspaceId: workspace?.id ?? bootstrap.workspace.id,
        mode,
        sourceArtifactId: sourceArtifact?.id ?? null,
        title: prompt.trim().slice(0, 80),
      })).session.id
      const job = await createDesignJob({
        sessionId,
        prompt: prompt.trim(),
        sourceMode: mode,
        productMode,
        sourceArtifactId: sourceArtifact?.id ?? null,
        modelServiceId: modelServiceId || undefined,
        variationCount,
        capabilityRequirements: {
          template: {
            domainTemplateId: domainTemplateId || undefined,
            // 视觉系统二选一:模板包(完整设计令牌)或 自定义(审美+配色)互斥
            ...(visualMode === 'pack'
              ? {
                  designTemplatePackIds: selectedTemplatePackIds.length ? selectedTemplatePackIds : undefined,
                  autoDistributeTemplatePacks: selectedTemplatePackIds.length > 1 ? autoDistributePacks : undefined,
                }
              : {
                  aestheticProfileId: aestheticProfileId || undefined,
                  colorPaletteId: colorPaletteId || undefined,
                }),
            brandStyleReferenceId: brandStyleReferenceId || undefined,
          },
          automation: {
            loopProfileId: loopProfileId || undefined,
          },
          plugins: {
            skillIds: selectedSkillIds.length ? selectedSkillIds : undefined,
            mcpToolIds: selectedMcpToolIds.length ? selectedMcpToolIds : undefined,
          },
        },
        templateRequirements: {
          styles: styles.split(',').map(style => style.trim()).filter(Boolean),
          deviceTargets: ['desktop', 'mobile'],
          notes: designDirectionNotes(referenceBrand, negativeRequirements),
          advancedConstraints: {
            colorPaletteId: colorPaletteId || null,
            styleNotes: styles.split(',').map(style => style.trim()).filter(Boolean),
            brandStyleReferenceId: brandStyleReferenceId || null,
            referenceBrand: referenceBrand.trim() || null,
            negativeRequirements: splitRequirementLines(negativeRequirements),
          },
        },
      })
      if (selectedTemplatePackIds.length) {
        setRecentTemplateIds(writeTemplateRecent(selectedTemplatePackIds).map(item => item.id))
      }
      window.location.href = withAppBase(`/jobs/${job.job.id}`)
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  function saveCapabilityPreference(next: CapabilityPreferenceDraft): void {
    const capabilityPreference = {
      visualMode: next.visualMode ?? visualMode,
      domainTemplateId: next.domainTemplateId ?? domainTemplateId,
      aestheticProfileId: next.aestheticProfileId ?? aestheticProfileId,
      colorPaletteId: next.colorPaletteId ?? colorPaletteId,
      loopProfileId: next.loopProfileId ?? loopProfileId,
      brandStyleReferenceId: next.brandStyleReferenceId ?? brandStyleReferenceId,
      referenceBrand: next.referenceBrand ?? referenceBrand,
      styleNotes: next.styleNotes ?? styles,
      negativeRequirements: next.negativeRequirements ?? negativeRequirements,
    }
    writeCapabilityPreference(capabilityPreference)
    void updateUserPreferences({
      capabilityPreference: {
        domainTemplateId: capabilityPreference.domainTemplateId,
        aestheticProfileId: capabilityPreference.aestheticProfileId,
        colorPaletteId: capabilityPreference.colorPaletteId,
        loopProfileId: capabilityPreference.loopProfileId,
      },
    }).catch(err => {
      console.warn('Failed to save capability preferences', err)
    })
  }

  async function resume(session: SessionSnapshot): Promise<void> {
    setResumeId(session.id)
    setError(null)
    try {
      const snapshot = await resumeSession(session.id)
      const latestJob = [...snapshot.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      if (latestJob) {
        window.location.href = withAppBase(`/jobs/${latestJob.id}`)
        return
      }
      handlePromptChange(session.lastPrompt || session.title)
      setMode(session.mode)
      setResumeId(null)
    } catch (err) {
      setError((err as Error).message)
      setResumeId(null)
    }
  }

  async function renameSession(session: SessionSnapshot, title: string): Promise<void> {
    setSessionActionSaving(true)
    setError(null)
    try {
      const response = await updateSession(session.id, { title })
      setSessions(current => current
        .map(item => item.id === session.id ? response.session : item)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)))
      setSessionDialog(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSessionActionSaving(false)
    }
  }

  async function removeSession(session: SessionSnapshot): Promise<void> {
    setSessionActionSaving(true)
    setError(null)
    try {
      await deleteSession(session.id)
      setSessions(current => current.filter(item => item.id !== session.id))
      setOpenSessionMenuId(null)
      setSessionDialog(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSessionActionSaving(false)
    }
  }

  const headingWord = t('design')
  const headingLine = t('whatShallWeDesign')
  const journeyLine = t('startJourney')
  const visibleSessions = useMemo(() => filterSessions(sessions, sessionQuery), [sessions, sessionQuery])
  const recentSessions = visibleSessions.slice(0, 5)
  const olderSessions = visibleSessions.slice(5)
  const searchingSessions = sessionQuery.trim().length > 0

  return (
    <main className={`home-shell${capabilityDrawerOpen ? ' capability-drawer-open' : ''}`}>
      <aside className="home-side" aria-label={t('recent')} data-testid="session-sidebar">
        <div className="side-brand">
          <span className="brand-mark"><Logo size={32} /></span>
          <strong>DUDesign</strong>
          <span className="stage-badge">Alpha</span>
        </div>

        <div className="side-tabs" role="tablist" aria-label="Workspace scope">
          <button className="active">{t('mySessions')}</button>
          <button>{t('shared')}</button>
        </div>

        <label className="side-search">
          <Icon name="search" size={16} />
          <input
            placeholder={t('searchSessions')}
            aria-label={t('searchSessions')}
            value={sessionQuery}
            onChange={event => {
              setSessionQuery(event.target.value)
              if (event.target.value.trim()) setShowOlderSessions(true)
            }}
          />
          {sessionQuery ? (
            <button className="search-clear" type="button" aria-label="Clear search" onClick={() => setSessionQuery('')}>×</button>
          ) : (
            <span className="kbd">⌘K</span>
          )}
        </label>

        <button className="side-new" type="button" onClick={() => handlePromptChange('')}>
          <span className="plus"><Icon name="plus" size={12} /></span>{t('newSession')}
        </button>

        <SessionGroup
          title={searchingSessions ? t('searchResults') : t('recent')}
          sessions={recentSessions}
          resumeId={resumeId}
          openSessionMenuId={openSessionMenuId}
          onOpenSessionMenu={setOpenSessionMenuId}
          onRename={session => setSessionDialog({ kind: 'rename', session })}
          onDelete={session => setSessionDialog({ kind: 'delete', session })}
          onResume={resume}
          emptyText={searchingSessions ? t('noMatchingSessions') : t('createFirstDesignSession')}
        />
        <SessionGroup
          title={t('earlier')}
          sessions={olderSessions}
          resumeId={resumeId}
          openSessionMenuId={openSessionMenuId}
          onOpenSessionMenu={setOpenSessionMenuId}
          onRename={session => setSessionDialog({ kind: 'rename', session })}
          onDelete={session => setSessionDialog({ kind: 'delete', session })}
          onResume={resume}
          emptyText={t('olderSessionsWillAppear')}
          collapsed={!searchingSessions && !showOlderSessions}
          onToggle={() => setShowOlderSessions(value => !value)}
        />
      </aside>

      <section className={`home-main${capabilityDrawerOpen ? ' capability-drawer-open' : ''}`}>
        <div className="home-hero">
        <header className="home-topbar">
          <div className="top-actions">
            <div className="ws-select" data-menu-root="true">
              <button
                type="button"
                className="workspace-selector-trigger"
                data-testid="workspace-selector"
                aria-expanded={openMenu === 'workspace'}
                onClick={() => setOpenMenu(current => current === 'workspace' ? null : 'workspace')}
              >
                <span className="brand-mark"><Logo size={22} /></span>
                <span>
                  <span className="ws-name">{workspace?.name ?? t('connectingWorkspace')}</span>
                  <span className="ws-sub"> · {t('mvpHosted')}</span>
                </span>
                <Icon name="chevronDown" size={14} className="chev" />
              </button>
              {openMenu === 'workspace' ? (
                <div className="workspace-menu">
                  {workspaces.map(item => (
                    <button
                      key={item.id}
                      className={item.id === workspace?.id ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setSelectedWorkspaceId(item.id)
                        setOpenMenu(null)
                      }}
                    >
                      <strong>{item.name}</strong>
                      <span>{item.storageKey}</span>
                    </button>
                  ))}
                  <p>{t('teamWorkspacesReserved')}</p>
                </div>
              ) : null}
            </div>
            <button className="icon-btn" aria-label={t('notifications')} title={t('notifications')}>
              <Icon name="bell" size={17} />
            </button>
            <UserActionCluster user={bootstrap?.user} onOpenPreferences={() => setPreferencesOpen(true)} />
          </div>
        </header>

        {preferencesOpen ? (
          <PreferencesOverlay
            preference={userPreference}
            capabilities={capabilities}
            templatePacks={templatePacks}
            saving={preferencesSaving}
            onClose={() => setPreferencesOpen(false)}
            onSave={next => void savePreferences(next)}
            labels={{
              myPreferences: t('myPreferences'),
              defaultTemplate: t('defaultTemplate'),
              defaultSkill: t('defaultSkill'),
              defaultLoop: t('defaultLoop'),
              advancedConstraints: t('advancedConstraints'),
              styleNotes: t('styleNotes'),
              referenceBrand: t('referenceBrand'),
              negativeRequirements: t('negativeRequirements'),
              palette: t('palette'),
              save: t('savePreferences'),
              saved: t('preferencesSaved'),
              none: t('choose'),
            }}
          />
        ) : null}
        <section className="composer" data-product-mode={productMode} aria-label={t('generateDesignVariations')}>
          <h1 className="composer-heading" aria-label={headingLine}>
            <span className="heading-line heading-line-a">{renderHeadingChars(headingLine, headingWord)}</span>
            <span className="heading-line heading-line-b">{renderHeadingChars(journeyLine, 'DUdesign')}</span>
          </h1>
          <div className="composer-head">
            <div className="product-tabs" role="tablist" aria-label={t('productMode')}>
              <button className={productMode === 'web_app' ? 'active' : ''} type="button" onClick={() => selectProductMode('web_app')}>
                {t('webAppMode')}
              </button>
            </div>
            <div className="composer-head-actions">
              <button className="btn ghost sm" type="button" onClick={() => handlePromptChange('')}>
                {t('startWithYourDesign')}
              </button>
            </div>
          </div>

          <div className="composer-card">
            <div className="prompt-area">
              <textarea
                data-testid="prompt-input"
                aria-label={t('designPrompt')}
                placeholder={t('describePromptPlaceholder')}
                value={prompt}
                onChange={event => handlePromptChange(event.target.value)}
                rows={5}
              />
            </div>
            <div className="composer-tools">
              <div className="menu-root" data-menu-root="true">
                <button
                  ref={contextTriggerRef}
                  className="tool icon"
                  type="button"
                  aria-label={t('addContext')}
                  aria-expanded={openMenu === 'context'}
                  onClick={() => {
                    const nextOpen = openMenu !== 'context'
                    if (nextOpen) setContextPanel('files')
                    setOpenMenu(nextOpen ? 'context' : null)
                  }}
                >
                  <Icon name="plus" size={16} />
                </button>
                <FloatingMenu
                  open={openMenu === 'context'}
                  anchorRef={contextTriggerRef}
                  align="start"
                  matchWidthSelector=".composer-card"
                  fillAbove
                  className="context-aggregate"
                  testId="context-direct-popover"
                >
                  <div className="context-parent-list" role="menu" aria-label={t('addContext')}>
                    <button
                      className={contextPanel === 'files' ? 'active' : ''}
                      type="button"
                      onPointerEnter={() => selectContextPanel('files')}
                      onFocus={() => selectContextPanel('files')}
                      onClick={() => selectContextPanel('files')}
                    >
                      <span className="context-menu-icon" aria-hidden><Icon name="upload" size={16} /></span>
                      <strong>{t('addFilesOrPhotos')}</strong>
                      <i aria-hidden><Icon name="chevronRight" size={14} /></i>
                    </button>
                    <button
                      className={contextPanel === 'loop' ? 'active' : ''}
                      type="button"
                      onPointerEnter={() => selectContextPanel('loop')}
                      onFocus={() => selectContextPanel('loop')}
                      onClick={() => selectContextPanel('loop')}
                    >
                      <span className="context-menu-icon" aria-hidden><Icon name="sparkles" size={16} /></span>
                      <strong>{t('flowPill')}</strong>
                      <i aria-hidden><Icon name="chevronRight" size={14} /></i>
                    </button>
                    <button
                      className={contextPanel === 'plugins' ? 'active' : ''}
                      type="button"
                      onPointerEnter={() => selectContextPanel('plugins')}
                      onFocus={() => selectContextPanel('plugins')}
                      onClick={() => selectContextPanel('plugins')}
                    >
                      <span className="context-menu-icon" aria-hidden><Icon name="puzzle" size={16} /></span>
                      <strong>{t('pluginsPill')}</strong>
                      <i aria-hidden><Icon name="chevronRight" size={14} /></i>
                    </button>
                  </div>
                  <div className="context-child-panel" data-active-panel={contextPanel ?? 'none'}>
                    {contextPanel === 'files' ? (
                      <div className="context-option-list">
                        <button className={mode === 'new_html' ? 'active' : ''} type="button" onClick={() => { setMode('new_html'); setOpenMenu(null) }}>
                          {t('newHtml')}
                          <span>{t('generateFreshStandalonePage')}</span>
                        </button>
                        <button className={mode === 'from_existing_html' ? 'active' : ''} type="button" onClick={() => setMode('from_existing_html')}>
                          {t('existingHtml')}
                          <span>{t('continueFromUploadedPage')}</span>
                        </button>
                        <label className="context-upload-action">
                          <strong>{sourceUploadStatus === 'uploading' ? t('uploading') : sourceArtifact ? sourceArtifact.entryPath : t('uploadHtml')}</strong>
                          <span>{sourceArtifact ? formatBytes(sourceArtifact.sizeBytes) : t('useLocalHtmlFile')}</span>
                          <input
                            data-testid="source-html-input"
                            type="file"
                            accept=".html,.htm,text/html"
                            onChange={event => void uploadSourceFile(event.target.files?.[0] ?? null)}
                          />
                        </label>
                      </div>
                    ) : null}
                    {contextPanel === 'loop' ? (
                      <div className="context-option-list" data-testid="loop-profile-options">
                        {(capabilities?.automationLoopProfiles ?? []).map(profile => (
                          <button
                            key={profile.id}
                            className={profile.id === loopProfileId ? 'active' : ''}
                            type="button"
                            onClick={() => {
                              setLoopProfileId(profile.id)
                              saveCapabilityPreference({ loopProfileId: profile.id })
                              setOpenMenu(null)
                            }}
                          >
                            {c18n.loopName(profile.id, profile.name)}
                            <span>{profile.description}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {contextPanel === 'plugins' ? (
                      <PluginsPicker
                        plugins={capabilities?.plugins ?? []}
                        skills={capabilities?.skills ?? []}
                        mcpToolBindings={capabilities?.mcpToolBindings ?? []}
                        selectedSkillIds={selectedSkillIds}
                        selectedMcpToolIds={selectedMcpToolIds}
                        labels={{
                          pluginsPill: t('pluginsPill'),
                          selectPlugins: t('selectSkills'),
                          pluginsHint: t('skillsSafeOnlyHint'),
                          pluginTypeSkill: t('pluginTypeSkill'),
                          pluginTypeMcp: t('pluginTypeMcp'),
                          pluginTypeMixed: t('pluginTypeMixed'),
                          safetyLevel: t('safetyLevel'),
                          safe: t('safe'),
                          reviewRequired: t('reviewRequired'),
                          scopes: t('negativeRules'),
                          ruleSummary: t('ruleSummary'),
                        }}
                        onToggleSkill={id => setSelectedSkillIds(current =>
                          current.includes(id) ? current.filter(item => item !== id) : [...current, id],
                        )}
                        onToggleMcpTool={id => setSelectedMcpToolIds(current =>
                          current.includes(id) ? current.filter(item => item !== id) : [...current, id],
                        )}
                      />
                    ) : null}
                  </div>
                </FloatingMenu>
              </div>

              <DirectPillMenu
                id="variations"
                label={t('variations')}
                value={`${variationCount} ${t('drafts')}`}
                itemCount={variationOptions.length}
                columnCount={3}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <div className="option-list grid-3" data-testid="variation-count-input">
                  {variationOptions.map(count => (
                    <button
                      key={count}
                      className={variationCount === count ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setVariationCount(count)
                        setOpenMenu(null)
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </DirectPillMenu>

              <DirectPillMenu
                id="template"
                label={t('designSystem')}
                value={visualMode === 'pack' && selectedTemplatePackIds.length
                  ? `${selectedTemplatePackIds.length} ${t('templatesCount')}`
                  : (selectedDomain ? c18n.domainName(selectedDomain.id, selectedDomain.name) : t('choose'))}
                matchWidthSelector=".composer-card"
                fillAbove
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <DesignSystemPicker
                  capabilities={capabilities}
                  visualMode={visualMode}
                  onVisualModeChange={mode => {
                    setVisualMode(mode)
                    saveCapabilityPreference({ visualMode: mode })
                  }}
                  value={{
                    domainTemplateId,
                    aestheticProfileId,
                    colorPaletteId,
                    brandStyleReferenceId,
                    styleNotes: styles,
                    referenceBrand,
                    negativeRequirements,
                  }}
                  selectedLoopName={selectedLoop ? c18n.loopName(selectedLoop.id, selectedLoop.name) : undefined}
                  labels={{
                    designSystem: t('designSystem'),
                    scene: t('scene'),
                    visualSystem: t('visualSystem'),
                    applyTemplatePack: t('applyTemplatePack'),
                    customDirection: t('customDirection'),
                    packModeHint: t('packModeHint'),
                    customModeHint: t('customModeHint'),
                    visual: t('visual'),
                    advanced: t('advanced'),
                    palette: t('palette'),
                    styleNotes: t('styleNotes'),
                    referenceBrand: t('referenceBrand'),
                    negativeRequirements: t('negativeRequirements'),
                    search: t('search'),
                    choose: t('choose'),
                    loop: t('loop'),
                  }}
                  templateLabels={{
                    templateLibrary: t('templateLibrary'),
                    official: t('officialTemplates'),
                    mine: t('myTemplates'),
                    recent: t('recentTemplates'),
                    favorites: t('favoriteTemplates'),
                    templatesCount: t('templatesCount'),
                    search: t('search'),
                    autoDistribute: t('autoDistribute'),
                    autoDistributeHint: t('autoDistributeHint'),
                    autoDistributeFewHint: t('autoDistributeFewHint'),
                    importDesignMd: t('importDesignMd'),
                    pasteDesignMd: t('pasteDesignMd'),
                    designMdName: t('designMdName'),
                    importing: t('importing'),
                    capabilityBundle: t('capabilityBundle'),
                    capabilityBundleHint: t('capabilityBundleHint'),
                    uploadBundle: t('uploadBundle'),
                    bundleSelected: t('bundleSelected'),
                    bundleImport: t('bundleImport'),
                    bundleImporting: t('bundleImporting'),
                    bundleImported: t('bundleImported'),
                    bundleConfirm: t('bundleConfirm'),
                    bundleConfirming: t('bundleConfirming'),
                    bundlePreviewPassed: t('bundlePreviewPassed'),
                    bundlePreviewWarning: t('bundlePreviewWarning'),
                    bundleContents: t('bundleContents'),
                    bundleFindings: t('bundleFindings'),
                    bundleNoDrafts: t('bundleNoDrafts'),
                    bundleExport: t('bundleExport'),
                    bundleExporting: t('bundleExporting'),
                    bundleLicense: t('bundleLicense'),
                    bundleLicenseOwned: t('bundleLicenseOwned'),
                    bundleLicenseUnspecified: t('bundleLicenseUnspecified'),
                    bundleLicenseNotes: t('bundleLicenseNotes'),
                    bundleReadyDrafts: t('bundleReadyDrafts'),
                    applicableScenarios: t('applicableScenarios'),
                    fontSummary: t('fontSummary'),
                    dos: t('dos'),
                    donts: t('donts'),
                    noPreviewArtifact: t('noPreviewArtifact'),
                    previewAttached: t('previewAttached'),
                    emptyTemplates: t('emptyTemplates'),
                    emptyFavorites: t('emptyFavorites'),
                    emptyRecent: t('emptyRecent'),
                  }}
                  packs={templatePacks}
                  selectedTemplatePackIds={selectedTemplatePackIds}
                  autoDistribute={autoDistributePacks}
                  favoriteTemplateIds={favoriteTemplateIds}
                  recentTemplateIds={recentTemplateIds}
                  variationCount={variationCount}
                  importing={templateImporting}
                  importNotice={templateImportNotice}
                  authoringDrafts={authoringDrafts}
                  importedBundleDraft={importedBundleDraft}
                  bundleBusy={bundleBusy}
                  onTogglePackSelect={toggleTemplateSelect}
                  onTogglePackFavorite={toggleTemplateFavorite}
                  onAutoDistributeChange={setAutoDistributePacks}
                  onImportDesignMd={(designMd, name) => void importDesignMd(designMd, name)}
                  onImportBundle={file => void importBundleFile(file)}
                  onConfirmBundle={draft => void confirmBundleDraft(draft)}
                  onExportBundle={input => void downloadCapabilityBundle(input)}
                  onChange={next => {
                    if (next.domainTemplateId !== undefined) {
                      setDomainTemplateId(next.domainTemplateId)
                      saveCapabilityPreference({ domainTemplateId: next.domainTemplateId })
                    }
                    if (next.aestheticProfileId !== undefined || next.colorPaletteId !== undefined) {
                      const nextAestheticId = next.aestheticProfileId ?? aestheticProfileId
                      const nextPaletteId = next.colorPaletteId ?? colorPaletteId
                      setVisualMode('custom')
                      setAestheticProfileId(nextAestheticId)
                      setColorPaletteId(nextPaletteId)
                      saveCapabilityPreference({ visualMode: 'custom', aestheticProfileId: nextAestheticId, colorPaletteId: nextPaletteId })
                    }
                    if (next.styleNotes !== undefined) {
                      setStyles(next.styleNotes)
                      saveCapabilityPreference({ styleNotes: next.styleNotes })
                    }
                    if (next.brandStyleReferenceId !== undefined) {
                      setBrandStyleReferenceId(next.brandStyleReferenceId)
                      saveCapabilityPreference({ brandStyleReferenceId: next.brandStyleReferenceId, referenceBrand: next.referenceBrand })
                    }
                    if (next.referenceBrand !== undefined) {
                      setReferenceBrand(next.referenceBrand)
                      saveCapabilityPreference({ referenceBrand: next.referenceBrand })
                    }
                    if (next.negativeRequirements !== undefined) {
                      setNegativeRequirements(next.negativeRequirements)
                      saveCapabilityPreference({ negativeRequirements: next.negativeRequirements })
                    }
                  }}
                />
              </DirectPillMenu>

              <DirectPillMenu
                id="model"
                label={t('model')}
                value={selectedModel ? modelLabel(selectedModel) : t('noModel')}
                align="end"
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <div className="model-option-list" data-testid="model-paired-popover">
                  {modelOptions.map(model => (
                    <button
                      key={model.id}
                      className={model.id === modelServiceId ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setModelServiceId(model.id)
                        setOpenMenu(null)
                      }}
                    >
                      <span className="mo-text">
                        <strong>
                          {modelLabel(model)}
                          {model.isDefault ? <small className="mo-default">{c18n.phrase('default')}</small> : null}
                        </strong>
                        <span>{c18n.modelCaps(model.capabilities).join(' · ')}</span>
                      </span>
                      <i className="mo-check" aria-hidden><Icon name="check" size={15} /></i>
                    </button>
                  ))}
                </div>
              </DirectPillMenu>

              <button
                className="tool send"
                type="button"
                data-testid="generate-button"
                aria-label={t('generateDesignVariations')}
                title={t('generateDesignVariations')}
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {status === 'submitting' ? '...' : <Icon name="arrowUp" size={16} />}
              </button>
            </div>
          </div>

          <div className="examples">
              <div className="examples-track">
                {[...inspirationCases, ...inspirationCases].map((item, index) => (
                  <button
                    key={`${item.title}-${index}`}
                    type="button"
                    onClick={() => handlePromptChange(item.prompt)}
                    aria-hidden={index >= inspirationCases.length || undefined}
                    tabIndex={index >= inspirationCases.length ? -1 : undefined}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

          {mode === 'from_existing_html' ? (
            <div className={`source-upload-status ${sourceArtifact?.qualityStatus ?? sourceUploadStatus}`} data-testid="source-artifact-status">
              {sourceArtifact
                ? `${sourceArtifact.entryPath} · ${formatBytes(sourceArtifact.sizeBytes)}${sourceArtifact.qualityStatus ? ` · ${sourceArtifact.qualityStatus}` : ''}`
                : t('uploadHtmlToContinue')}
            </div>
          ) : null}

          {productMode === 'web_app' && capabilities ? (
            <div className="cap-strip" data-testid="capability-summary">
              <span className="chip"><span className="k">{t('scene')}</span>{selectedDomain ? c18n.domainName(selectedDomain.id, selectedDomain.name) : t('domain')}</span>
              {visualMode === 'pack' ? (
                <span className="chip"><span className="k">{t('templateLibrary')}</span>{selectedTemplatePackIds.length
                  ? `${selectedTemplatePackIds.length} ${t('templatesCount')}${autoDistributePacks && selectedTemplatePackIds.length > 1 ? ` · ${t('autoDistribute')}` : ''}`
                  : t('choose')}</span>
              ) : (
                <>
                  <span className="chip"><span className="k">{t('visual')}</span>{selectedAesthetic ? c18n.aestheticName(selectedAesthetic.id, selectedAesthetic.name) : t('aesthetic')}</span>
                  <span className="chip"><span className="k">{t('palette')}</span>{selectedPalette ? c18n.paletteName(selectedPalette.id, selectedPalette.name) : t('palette')}</span>
                </>
              )}
              {selectedPluginSummary.length ? (
                <span className="chip"><span className="k">{t('plugins')}</span>{selectedPluginSummary.slice(0, 2).join(' · ')}{selectedPluginSummary.length > 2 ? ` +${selectedPluginSummary.length - 2}` : ''}</span>
              ) : null}
              <span className="chip"><span className="k">{t('loop')}</span>{selectedLoop ? c18n.loopName(selectedLoop.id, selectedLoop.name) : t('loop')}</span>
            </div>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
        </section>
        </div>

        <section className="inspire" ref={inspireRef} aria-label={t('designInspiration')}>
          <div className="inspire-head">
            <div>
              <strong>{t('needInspiration')}</strong>
            </div>
            <span>{sessions.length} {t('saved')}</span>
          </div>
          <div className="inspire-grid">
            {inspirationCases.map((item, index) => (
              <button key={item.href} className="inspire-card" type="button" onClick={() => handlePromptChange(item.prompt)}>
                <span className="inspire-preview" aria-hidden="true">
                  <iframe
                    src={item.href}
                    title={item.title}
                    loading="lazy"
                    tabIndex={-1}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </span>
                <span className="num">0{index + 1}</span>
                <div className="inspire-copy">
                  <strong>{item.title}</strong>
                  <span>{item.category}</span>
                </div>
                <span className="chip tag info">真实页面</span>
              </button>
            ))}
          </div>
        </section>
      </section>
      {sessionDialog ? (
        <SessionActionDialog
          dialog={sessionDialog}
          saving={sessionActionSaving}
          onClose={() => setSessionDialog(null)}
          onRename={title => void renameSession(sessionDialog.session, title)}
          onDelete={() => void removeSession(sessionDialog.session)}
        />
      ) : null}
    </main>
  )
}

function PreferencesOverlay(props: {
  preference: UserCapabilityPreference | null
  capabilities: CapabilitiesResponse | null
  templatePacks: DesignTemplatePack[]
  saving: boolean
  labels: PreferencesPanelLabels
  onClose: () => void
  onSave: (next: Partial<UserCapabilityPreference>) => void
}): React.JSX.Element {
  const c18n = useCapabilityI18n()
  const plugins = new Map((props.capabilities?.plugins ?? []).map(plugin => [plugin.id, plugin]))
  const safeSkills = (props.capabilities?.skills ?? []).filter(skill => {
    const plugin = plugins.get(skill.pluginId)
    return plugin && plugin.safetyLevel === 'safe' && plugin.status === 'active' && plugin.visibility === 'official'
  })
  const emptyPreference: UserCapabilityPreference = {
    domainTemplateId: null,
    aestheticProfileId: null,
    colorPaletteId: null,
    loopProfileId: null,
  }
  return (
    <div className="preferences-overlay" onClick={props.onClose} data-menu-root="true">
      <div className="preferences-overlay-card" onClick={event => event.stopPropagation()}>
        <PreferencesPanel
          preference={props.preference ?? emptyPreference}
          templateOptions={props.templatePacks.map(pack => ({ id: pack.id, label: c18n.templatePackName(pack.id, pack.name) }))}
          skillOptions={safeSkills.map(skill => ({ id: skill.id, label: c18n.skillName(skill.id, plugins.get(skill.pluginId)?.name ?? skill.id) }))}
          loopOptions={(props.capabilities?.automationLoopProfiles ?? []).map(loop => ({ id: loop.id, label: c18n.loopName(loop.id, loop.name) }))}
          paletteOptions={(props.capabilities?.colorPalettes ?? []).map(palette => ({ id: palette.id, label: c18n.paletteName(palette.id, palette.name) }))}
          labels={props.labels}
          saving={props.saving}
          onSave={props.onSave}
          onClose={props.onClose}
        />
      </div>
    </div>
  )
}

function SessionActionDialog(props: {
  dialog: SessionDialog
  saving: boolean
  onClose: () => void
  onRename: (title: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const { t } = useLanguage()
  const [title, setTitle] = useState(props.dialog.session.title)
  const isRename = props.dialog.kind === 'rename'
  const canSubmit = title.trim().length > 0 && !props.saving
  return (
    <div className="session-dialog-overlay" onClick={props.saving ? undefined : props.onClose} data-menu-root="true">
      <section className="session-dialog" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title" onClick={event => event.stopPropagation()}>
        <header>
          <strong id="session-dialog-title">{isRename ? t('renameSession') : t('deleteSession')}</strong>
          <button type="button" aria-label="Close" disabled={props.saving} onClick={props.onClose}><Icon name="x" size={16} /></button>
        </header>
        {isRename ? (
          <input
            autoFocus
            value={title}
            maxLength={120}
            onChange={event => setTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && canSubmit) props.onRename(title.trim())
            }}
          />
        ) : (
          <p>{t('deleteSessionConfirm')}</p>
        )}
        <footer>
          <button type="button" disabled={props.saving} onClick={props.onClose}>{t('cancel')}</button>
          <button
            className={isRename ? 'primary' : 'danger'}
            type="button"
            disabled={isRename ? !canSubmit : props.saving}
            onClick={() => isRename ? props.onRename(title.trim()) : props.onDelete()}
          >
            {props.saving ? '...' : isRename ? t('save') : t('delete')}
          </button>
        </footer>
      </section>
    </div>
  )
}

function renderHeadingChars(line: string, accent: string): React.ReactNode {
  // 按字符拆分,每字一个 span(--i 控制从左往右错峰);命中 accent 的字符加 .grad
  const chars = Array.from(line)
  let start = -1
  let end = -1
  if (accent) {
    const accentChars = Array.from(accent)
    const lower = chars.map(ch => ch.toLowerCase())
    const accentLower = accentChars.map(ch => ch.toLowerCase())
    for (let i = 0; i <= chars.length - accentChars.length; i += 1) {
      if (accentLower.every((ch, k) => lower[i + k] === ch)) {
        start = i
        end = i + accentChars.length
        break
      }
    }
  }
  return chars.map((ch, i) => (
    <span
      key={i}
      className={`heading-char${i >= start && i < end ? ' grad' : ''}`}
      style={{ '--i': i } as React.CSSProperties}
    >
      {ch}
    </span>
  ))
}

function SessionGroup(props: {
  title: string
  sessions: SessionSnapshot[]
  resumeId: string | null
  openSessionMenuId: string | null
  onOpenSessionMenu: (sessionId: string | null) => void
  onRename: (session: SessionSnapshot) => void
  onDelete: (session: SessionSnapshot) => void
  emptyText?: string
  collapsed?: boolean
  onToggle?: () => void
  onResume: (session: SessionSnapshot) => Promise<void>
}): React.JSX.Element {
  const { t } = useLanguage()
  const collapsed = Boolean(props.collapsed && props.sessions.length > 0)
  return (
    <section className="side-section">
      <div className="side-section-head">
        <h3>{props.title}</h3>
        {props.onToggle && props.sessions.length > 0 ? (
          <button type="button" onClick={props.onToggle}>
            {collapsed ? t('showOlderSessions') : t('hideOlderSessions')}
            <span>{props.sessions.length}</span>
          </button>
        ) : null}
      </div>
      {props.sessions.length === 0 ? <p className="side-empty">{props.emptyText ?? 'Create your first design session.'}</p> : null}
      {collapsed ? (
        <button className="side-session-fold" type="button" onClick={props.onToggle}>
          <span>{props.sessions.length}</span>
          {t('showOlderSessions')}
        </button>
      ) : props.sessions.map(session => (
        <div key={session.id} className={`side-session${props.resumeId === session.id ? ' active' : ''}`}>
          <button className="side-session-open" type="button" onClick={() => void props.onResume(session)}>
            <span className="thumb" aria-hidden>{session.mode === 'new_html' ? 'N' : 'H'}</span>
            <span className="meta">
              <strong>{session.title}</strong>
              <small>{formatRelativeTime(session.updatedAt)} · {props.resumeId === session.id ? 'resuming' : session.mode === 'new_html' ? 'new html' : 'existing html'}</small>
            </span>
          </button>
          <span className="session-menu-root" data-menu-root="true">
            <button
              className="session-menu-trigger"
              type="button"
              aria-label={`Actions for ${session.title}`}
              aria-expanded={props.openSessionMenuId === session.id}
              onClick={() => props.onOpenSessionMenu(props.openSessionMenuId === session.id ? null : session.id)}
            >
              <Icon name="moreHorizontal" size={16} />
            </button>
            {props.openSessionMenuId === session.id ? (
              <span className="session-action-menu">
                <button
                  type="button"
                  onClick={() => {
                    props.onOpenSessionMenu(null)
                    props.onRename(session)
                  }}
                >
                  {t('rename')}
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => {
                    props.onOpenSessionMenu(null)
                    props.onDelete(session)
                  }}
                >
                  {t('delete')}
                </button>
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </section>
  )
}

function DirectPillMenu(props: {
  id: Exclude<OpenMenu, 'workspace' | 'context' | null>
  label: string
  value: string
  itemCount?: number
  columnCount?: number
  align?: 'start' | 'center' | 'end'
  matchWidthSelector?: string
  fillAbove?: boolean
  children: React.ReactNode
  openMenu: OpenMenu
  setOpenMenu: React.Dispatch<React.SetStateAction<OpenMenu>>
}): React.JSX.Element {
  const isOpen = props.openMenu === props.id
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const align = props.align ?? (props.id === 'template' ? 'center' : 'start')
  const matchWidthSelector = props.matchWidthSelector ?? (props.id === 'template' ? '.composer-card' : undefined)
  const fillAbove = props.fillAbove ?? props.id === 'template'
  return (
    <div className={`menu-root menu-root-${props.id}`} data-menu-root="true">
      <button
        ref={triggerRef}
        type="button"
        className="tool"
        data-testid={`${props.id}-pill-trigger`}
        aria-expanded={isOpen}
        onClick={() => props.setOpenMenu(current => current === props.id ? null : props.id)}
      >
        <span className="k">{props.label}</span>
        <span className="v">{props.value}</span>
      </button>
      <FloatingMenu
        open={isOpen}
        anchorRef={triggerRef}
        align={align}
        matchWidthSelector={matchWidthSelector}
        fillAbove={fillAbove}
        className={`popover popover-${props.id}`}
        testId={`${props.id}-direct-popover`}
      >
          {props.children}
      </FloatingMenu>
    </div>
  )
}

function FloatingMenu(props: {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  align: 'start' | 'center' | 'end'
  className: string
  testId?: string
  children: React.ReactNode
  /** 若提供,菜单宽度与左边缘对齐到 anchor 的该祖先元素(如 .composer-card) */
  matchWidthSelector?: string
  /** 是否限制高度并出现外层滚动条;为 false 时菜单按内容自然撑高(无外层滚动条) */
  constrainHeight?: boolean
  /** 底部锚定在 anchor 上方、顶部被视口限制;菜单内部自行滚动(用于方向菜单) */
  fillAbove?: boolean
}): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<React.CSSProperties | null>(null)
  const constrainHeight = props.constrainHeight ?? true
  const fillAbove = props.fillAbove ?? false

  useLayoutEffect(() => {
    if (!props.open) {
      setStyle(null)
      return
    }

    function updatePosition(): void {
      const anchor = props.anchorRef.current
      const menu = menuRef.current
      if (!anchor || !menu) return

      const rect = anchor.getBoundingClientRect()
      const viewportPadding = 12
      const availableAbove = Math.max(180, rect.top - viewportPadding - 8)
      const matchEl = props.matchWidthSelector ? anchor.closest(props.matchWidthSelector) : null
      const matchRect = matchEl?.getBoundingClientRect()

      let left: number
      let width: number | undefined
      if (matchRect) {
        left = matchRect.left
        width = matchRect.width
      } else {
        const menuWidth = menu.offsetWidth || 320
        left = rect.left
        if (props.align === 'center') left = rect.left + rect.width / 2 - menuWidth / 2
        if (props.align === 'end') left = rect.right - menuWidth
      }
      left = Math.min(Math.max(viewportPadding, left), window.innerWidth - (width ?? menu.offsetWidth ?? 320) - viewportPadding)

      if (fillAbove) {
        // 固定高度:上方够则向上开,不够则向下开(flip);菜单内部左右栏各自滚动
        const fixedHeight = Math.min(440, window.innerHeight - 2 * viewportPadding)
        const spaceAbove = rect.top - 8 - viewportPadding
        const spaceBelow = window.innerHeight - rect.bottom - 8 - viewportPadding
        const above = spaceAbove >= fixedHeight || spaceAbove >= spaceBelow
        const height = above ? Math.min(fixedHeight, spaceAbove) : Math.min(fixedHeight, spaceBelow)
        const top = above ? rect.top - 8 - height : rect.bottom + 8
        setStyle({
          ...floatingMenuGlassStyle,
          position: 'fixed',
          top,
          left,
          width,
          height,
          right: 'auto',
          bottom: 'auto',
          overflow: 'hidden',
          transform: 'none',
          visibility: 'visible',
        })
        return
      }

      const menuHeight = constrainHeight
        ? Math.min(menu.offsetHeight || availableAbove, Math.min(420, availableAbove))
        : menu.offsetHeight

      setStyle({
        ...floatingMenuGlassStyle,
        position: 'fixed',
        top: Math.max(viewportPadding, rect.top - menuHeight - 8),
        left,
        width,
        right: 'auto',
        bottom: 'auto',
        maxHeight: constrainHeight ? Math.min(420, availableAbove) : undefined,
        overflow: constrainHeight ? 'auto' : 'visible',
        transform: 'none',
        visibility: 'visible',
      })
    }

    updatePosition()
    const frame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [props.align, props.anchorRef, props.open, props.matchWidthSelector, constrainHeight, fillAbove])

  if (!props.open || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={menuRef}
      className={props.className}
      data-menu-root="true"
      data-testid={props.testId}
      style={style ?? {
        ...floatingMenuGlassStyle,
        position: 'fixed',
        left: 0,
        top: 0,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        visibility: 'hidden',
      }}
    >
      {props.children}
    </div>,
    document.body,
  )
}

function modelLabel(model: ModelOption): string {
  return model.displayName.replace(/\s+Default$/i, '')
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Recently'
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function filterSessions(sessions: SessionSnapshot[], query: string): SessionSnapshot[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return sessions
  return sessions.filter(session => {
    const haystack = [
      session.title,
      session.lastPrompt ?? '',
      session.mode,
      session.status,
      session.id,
    ].join(' ').toLowerCase()
    return haystack.includes(normalized)
  })
}

function sessionSnapshotFromCreated(
  session: { id: string; workspaceId: string; runtimeSessionId: string | null; status: 'active' | 'archived' },
  fallback: { title: string; mode: SessionSnapshot['mode']; sourceArtifactId: string | null; workspaceId: string },
): SessionSnapshot {
  const now = new Date().toISOString()
  return {
    id: session.id,
    workspaceId: session.workspaceId || fallback.workspaceId,
    title: fallback.title || 'Untitled session',
    mode: fallback.mode,
    sourceArtifactId: fallback.sourceArtifactId,
    runtimeSessionId: session.runtimeSessionId,
    status: session.status,
    lastPrompt: fallback.title || null,
    createdAt: now,
    updatedAt: now,
  }
}

function isAuthRequiredError(err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) return false
  const error = err as { code?: unknown; status?: unknown }
  return error.code === 'AUTH_REQUIRED'
    || error.code === 'UNAUTHENTICATED'
    || error.status === 401
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function designDirectionNotes(referenceBrand: string, negativeRequirements: string): string | undefined {
  const lines = [
    referenceBrand.trim() ? `Reference brand inspiration: ${referenceBrand.trim()}. Use as inspiration only; do not copy brand assets, marks, proprietary copy, or imply endorsement.` : '',
    negativeRequirements.trim() ? `Negative requirements: ${negativeRequirements.trim()}` : '',
  ].filter(Boolean)
  return lines.length > 0 ? lines.join('\n') : undefined
}

function splitRequirementLines(value: string): string[] {
  return value.split(/\n|,/).map(item => item.trim()).filter(Boolean)
}

function readCapabilityPreference(): CapabilityPreferenceDraft {
  try {
    const raw = window.localStorage.getItem(capabilityPreferenceStorageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CapabilityPreferenceDraft
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function writeCapabilityPreference(preference: CapabilityPreferenceDraft): void {
  try {
    window.localStorage.setItem(capabilityPreferenceStorageKey, JSON.stringify(preference))
  } catch {
    // Persisting preferences locally is a best-effort UX optimization.
  }
}

const templateFavoritesStorageKey = 'dudesign.templateFavorites'
const templateRecentStorageKey = 'dudesign.templateRecent'
const templateRecentLimit = 12

function readTemplateFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(templateFavoritesStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeTemplateFavorites(ids: string[]): string[] {
  try {
    window.localStorage.setItem(templateFavoritesStorageKey, JSON.stringify(ids))
  } catch {
    // best-effort
  }
  return ids
}

function readTemplateRecent(): Array<{ id: string; ts: number }> {
  try {
    const raw = window.localStorage.getItem(templateRecentStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is { id: string; ts: number } =>
        typeof item === 'object' && item !== null && typeof item.id === 'string' && typeof item.ts === 'number')
      : []
  } catch {
    return []
  }
}

/** 追加最近使用的模板 id(去重、按时间倒序、截断上限),返回写入后的完整列表。 */
function writeTemplateRecent(ids: string[]): Array<{ id: string; ts: number }> {
  const ts = Date.now()
  const existing = readTemplateRecent()
  const next: Array<{ id: string; ts: number }> = []
  for (const id of ids) {
    next.push({ id, ts: ts + next.length })
  }
  for (const item of existing) {
    if (!ids.includes(item.id) && !next.some(entry => entry.id === item.id)) {
      next.push(item)
    }
  }
  const trimmed = next.slice(0, templateRecentLimit)
  try {
    window.localStorage.setItem(templateRecentStorageKey, JSON.stringify(trimmed))
  } catch {
    // best-effort
  }
  return trimmed
}

function sameStringSet(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = [...new Set(left ?? [])].sort()
  const b = [...new Set(right ?? [])].sort()
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function collectAuthoringEvidencePaths(draft: CapabilityAuthoringDraft): string[] {
  const paths = [
    ...draft.candidateBundle.templatePacks.flatMap(item => item.sourceEvidence.map(evidence => evidence.targetPath)),
    ...draft.candidateBundle.interactionParadigms.flatMap(item => item.sourceEvidence.map(evidence => evidence.targetPath)),
    ...draft.candidateBundle.dataContracts.flatMap(item => item.sourceEvidence.map(evidence => evidence.targetPath)),
    ...draft.candidateBundle.reviewProfiles.flatMap(item => item.sourceEvidence.map(evidence => evidence.targetPath)),
    ...draft.findings.filter(finding => finding.severity === 'warning').map(finding => finding.path),
  ]
  return [...new Set(paths)]
}

function upsertAuthoringDraft(current: CapabilityAuthoringDraft[], draft: CapabilityAuthoringDraft): CapabilityAuthoringDraft[] {
  return [draft, ...current.filter(item => item.id !== draft.id)]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the capability bundle.'))
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('Capability bundle encoding failed.'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.readAsDataURL(file)
  })
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
