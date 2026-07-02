'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createDesignJob,
  createSession,
  createSourceArtifact,
  getCapabilities,
  getBootstrap,
  getUserPreferences,
  listSessions,
  resumeSession,
  updateUserPreferences,
  type BootstrapResponse,
  type CapabilitiesResponse,
  type ModelOption,
  type SessionSnapshot,
} from '@/lib/api'
import { useLanguage } from '@/components/LanguageProvider'
import { UserActionCluster } from '@/components/UserActionCluster'
import { DesignDirectionPicker } from '@/components/DesignDirectionPicker'
import { Logo } from '@/components/Logo'
import { Icon, type IconName } from '@/components/Icon'
import { useCapabilityI18n } from '@/lib/capabilityI18n'

const promptExamples = [
  'A landing page for an invoicing app for freelancers: send invoices, get paid faster, track expenses.',
  'A portfolio homepage for a 3D artist with cinematic project cards.',
  'A calm productivity timer for deep work sessions.',
]

const variationOptions = [1, 2, 3, 4, 5, 6]
type OpenMenu = 'workspace' | 'context' | 'variations' | 'template' | 'model' | null
type ContextPanel = 'files' | 'skills' | 'connectors' | 'plugins'
type ModelPanel = 'models'
type CapabilityPreferenceDraft = {
  domainTemplateId?: string
  aestheticProfileId?: string
  colorPaletteId?: string
  loopProfileId?: string
  brandStyleReferenceId?: string
  referenceBrand?: string
  styleNotes?: string
  negativeRequirements?: string
}

const capabilityPreferenceStorageKey = 'dudesign.capabilityPreference'

export default function HomePage(): React.JSX.Element {
  const { t } = useLanguage()
  const c18n = useCapabilityI18n()
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null)
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null)
  const [prompt, setPrompt] = useState(promptExamples[0]!)
  const [variationCount, setVariationCount] = useState(3)
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
  const [error, setError] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>(null)
  const [modelPanel, setModelPanel] = useState<ModelPanel | null>(null)

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
          })
          .catch(err => {
            console.warn('Failed to load capability preferences', err)
          })
      })
      .catch(err => {
        setError((err as Error).message)
        setStatus('error')
      })
  }, [])

  useEffect(() => {
    function closeMenus(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Element && target.closest('[data-menu-root="true"]')) return
      setOpenMenu(null)
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const workspaces = bootstrap?.workspaces?.length ? bootstrap.workspaces : bootstrap ? [bootstrap.workspace] : []
  const workspace = workspaces.find(item => item.id === selectedWorkspaceId) ?? bootstrap?.workspace
  const selectedModel = bootstrap?.models.models.find(model => model.id === modelServiceId)
  const selectedDomain = capabilities?.domainTemplates.find(template => template.id === domainTemplateId)
  const selectedAesthetic = capabilities?.aestheticProfiles.find(profile => profile.id === aestheticProfileId)
  const availablePalettes = capabilities?.colorPalettes.filter(palette =>
    !selectedAesthetic || selectedAesthetic.colorPaletteIds.includes(palette.id)
  ) ?? []
  const selectedPalette = availablePalettes.find(palette => palette.id === colorPaletteId)
    ?? capabilities?.colorPalettes.find(palette => palette.id === colorPaletteId)
  const selectedLoop = capabilities?.automationLoopProfiles.find(profile => profile.id === loopProfileId)
  const canSubmit = useMemo(() => {
    return status !== 'submitting'
      && sourceUploadStatus !== 'uploading'
      && Boolean(bootstrap)
      && prompt.trim().length > 0
      && (mode === 'new_html' || Boolean(sourceArtifact))
  }, [bootstrap, mode, prompt, sourceArtifact, sourceUploadStatus, status])

  function selectContextPanel(panel: ContextPanel): void {
    setContextPanel(current => current === panel ? current : panel)
  }

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
      const session = await createSession({
        workspaceId: workspace?.id ?? bootstrap.workspace.id,
        mode,
        sourceArtifactId: sourceArtifact?.id ?? null,
        title: prompt.trim().slice(0, 80),
      })
      const job = await createDesignJob({
        sessionId: session.session.id,
        prompt: prompt.trim(),
        sourceMode: mode,
        sourceArtifactId: sourceArtifact?.id ?? null,
        modelServiceId: modelServiceId || undefined,
        variationCount,
        capabilityRequirements: {
          template: {
            domainTemplateId: domainTemplateId || undefined,
            aestheticProfileId: aestheticProfileId || undefined,
            colorPaletteId: colorPaletteId || undefined,
            brandStyleReferenceId: brandStyleReferenceId || undefined,
          },
          automation: {
            loopProfileId: loopProfileId || undefined,
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
      window.location.href = `/jobs/${job.job.id}`
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  function saveCapabilityPreference(next: CapabilityPreferenceDraft): void {
    const capabilityPreference = {
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
        window.location.href = `/jobs/${latestJob.id}`
        return
      }
      setPrompt(session.lastPrompt || session.title)
      setMode(session.mode)
      setResumeId(null)
    } catch (err) {
      setError((err as Error).message)
      setResumeId(null)
    }
  }

  const headingWord = t('design')
  const headingLine = t('whatShallWeDesign')

  return (
    <main className="home-shell">
      <aside className="home-side" aria-label={t('recent')}>
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
          <input placeholder={t('searchSessions')} aria-label={t('searchSessions')} />
          <span className="kbd">⌘K</span>
        </label>

        <button className="side-new" type="button" onClick={() => setPrompt('')}>
          <span className="plus"><Icon name="plus" size={12} /></span>{t('newSession')}
        </button>

        <SessionGroup
          title={t('recent')}
          sessions={sessions.slice(0, 5)}
          resumeId={resumeId}
          onResume={resume}
          emptyText={t('createFirstDesignSession')}
        />
        <SessionGroup
          title={t('earlier')}
          sessions={sessions.slice(5, 10)}
          resumeId={resumeId}
          onResume={resume}
          emptyText={t('olderSessionsWillAppear')}
        />
      </aside>

      <section className="home-main">
        <header className="home-topbar">
          <div>
            <span className="eyebrow">{t('workbench')}</span>
            <h1>{renderHeading(headingLine, headingWord)}</h1>
          </div>
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
            <UserActionCluster user={bootstrap?.user} />
          </div>
        </header>

        <section className="composer" aria-label={t('generateDesignVariations')}>
          <div className="composer-head">
            <div className="mode-tabs" role="tablist" aria-label={t('sourceMode')}>
              <button className={mode === 'new_html' ? 'active' : ''} onClick={() => setMode('new_html')}>
                {t('newHtml')}
              </button>
              <button className={mode === 'from_existing_html' ? 'active' : ''} onClick={() => setMode('from_existing_html')}>
                {t('existingHtml')}
              </button>
            </div>
            <button className="btn ghost sm" type="button" onClick={() => setPrompt('')}>
              {t('startWithYourDesign')}
            </button>
          </div>

          <div className="composer-card">
            <div className="prompt-area">
              <textarea
                data-testid="prompt-input"
                aria-label={t('designPrompt')}
                placeholder={t('describePromptPlaceholder')}
                value={prompt}
                onChange={event => setPrompt(event.target.value)}
                rows={8}
              />
            </div>
            <div className="composer-tools">
              <div className="menu-root" data-menu-root="true">
                <button
                  className="tool icon"
                  type="button"
                  aria-label={t('addContext')}
                  aria-expanded={openMenu === 'context'}
                  onClick={() => {
                    const nextOpen = openMenu !== 'context'
                    setContextPanel(nextOpen ? 'files' : null)
                    setOpenMenu(nextOpen ? 'context' : null)
                  }}
                >
                  <Icon name="plus" size={16} />
                </button>
                {openMenu === 'context' ? (
                  <div className="paired-popover-wrap">
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
                        className={contextPanel === 'skills' ? 'active' : ''}
                        type="button"
                        onPointerEnter={() => selectContextPanel('skills')}
                        onFocus={() => selectContextPanel('skills')}
                        onClick={() => selectContextPanel('skills')}
                      >
                        <span className="context-menu-icon" aria-hidden><Icon name="sparkles" size={16} /></span>
                        <strong>{t('skills')}</strong>
                        <i aria-hidden><Icon name="chevronRight" size={14} /></i>
                      </button>
                      <button
                        className={contextPanel === 'connectors' ? 'active' : ''}
                        type="button"
                        onPointerEnter={() => selectContextPanel('connectors')}
                        onFocus={() => selectContextPanel('connectors')}
                        onClick={() => selectContextPanel('connectors')}
                      >
                        <span className="context-menu-icon" aria-hidden><Icon name="plug" size={16} /></span>
                        <strong>{t('addConnector')}</strong>
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
                        <strong>{t('addPlugins')}</strong>
                        <i aria-hidden><Icon name="chevronRight" size={14} /></i>
                      </button>
                    </div>
                    <div className="context-child-panel" data-active-panel={contextPanel ?? 'none'}>
                        {contextPanel === 'files' ? (
                        <div className="context-option-list">
                          <button className={mode === 'new_html' ? 'active' : ''} type="button" onClick={() => {
                            setMode('new_html')
                            setOpenMenu(null)
                          }}>
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
                        {contextPanel === 'connectors' ? (
                        <div className="context-option-list">
                          <button type="button" disabled>{t('connectors')}</button>
                          <button type="button" disabled>{t('mcp')}</button>
                        </div>
                        ) : null}
                        {contextPanel === 'plugins' ? (
                        <div className="context-option-list">
                          <button type="button" disabled>{t('plugins')}</button>
                        </div>
                        ) : null}
                        {contextPanel === 'skills' ? (
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
                    </div>
                  </div>
                ) : null}
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
                label={t('designDirection')}
                value={selectedDomain ? c18n.domainName(selectedDomain.id, selectedDomain.name) : t('choose')}
                itemCount={1}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <DesignDirectionPicker
                  capabilities={capabilities}
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
                    designDirection: t('designDirection'),
                    scene: t('scene'),
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
                  onChange={next => {
                    if (next.domainTemplateId !== undefined) {
                      setDomainTemplateId(next.domainTemplateId)
                      saveCapabilityPreference({ domainTemplateId: next.domainTemplateId })
                    }
                    if (next.aestheticProfileId !== undefined || next.colorPaletteId !== undefined) {
                      const nextAestheticId = next.aestheticProfileId ?? aestheticProfileId
                      const nextPaletteId = next.colorPaletteId ?? colorPaletteId
                      setAestheticProfileId(nextAestheticId)
                      setColorPaletteId(nextPaletteId)
                      saveCapabilityPreference({ aestheticProfileId: nextAestheticId, colorPaletteId: nextPaletteId })
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

              <PairedPillMenu<ModelPanel>
                id="model"
                label={t('model')}
                value={selectedModel ? modelLabel(selectedModel) : t('noModel')}
                panels={[{ id: 'models', icon: 'circleDot', label: t('model'), itemCount: Math.max(bootstrap?.models.models.length ?? 1, 1) }]}
                activePanel={modelPanel}
                onActivePanelChange={setModelPanel}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <div className="option-list">
                  {(bootstrap?.models.models ?? []).map(model => (
                    <button
                      key={model.id}
                      className={model.id === modelServiceId ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setModelServiceId(model.id)
                        setOpenMenu(null)
                      }}
                    >
                      <strong>{model.displayName}{model.isDefault ? ' · default' : ''}</strong>
                      <span>{modelDescription(model)}</span>
                    </button>
                  ))}
                </div>
              </PairedPillMenu>

              <button className="tool send" type="button" data-testid="generate-button" aria-label={t('generateDesignVariations')} disabled={!canSubmit} onClick={() => void submit()}>
                {status === 'submitting' ? '...' : <Icon name="arrowUp" size={16} />}
              </button>
            </div>
          </div>

          <div className="examples">
            {promptExamples.map(example => (
              <button key={example} onClick={() => setPrompt(example)}>
                {example}
              </button>
            ))}
          </div>

          {mode === 'from_existing_html' ? (
            <div className={`source-upload-status ${sourceArtifact?.qualityStatus ?? sourceUploadStatus}`} data-testid="source-artifact-status">
              {sourceArtifact
                ? `${sourceArtifact.entryPath} · ${formatBytes(sourceArtifact.sizeBytes)}${sourceArtifact.qualityStatus ? ` · ${sourceArtifact.qualityStatus}` : ''}`
                : t('uploadHtmlToContinue')}
            </div>
          ) : null}

          {capabilities ? (
            <div className="cap-strip" data-testid="capability-summary">
              <span className="chip"><span className="k">{t('scene')}</span>{selectedDomain ? c18n.domainName(selectedDomain.id, selectedDomain.name) : t('domain')}</span>
              <span className="chip"><span className="k">{t('visual')}</span>{selectedAesthetic ? c18n.aestheticName(selectedAesthetic.id, selectedAesthetic.name) : t('aesthetic')}</span>
              <span className="chip"><span className="k">{t('palette')}</span>{selectedPalette ? c18n.paletteName(selectedPalette.id, selectedPalette.name) : t('palette')}</span>
              <span className="chip"><span className="k">{t('loop')}</span>{selectedLoop ? c18n.loopName(selectedLoop.id, selectedLoop.name) : t('loop')}</span>
            </div>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="inspire" aria-label={t('designInspiration')}>
          <div className="inspire-head">
            <div>
              <strong>{t('needInspiration')}</strong>
            </div>
            <span>{sessions.length} {t('saved')}</span>
          </div>
          <div className="inspire-grid">
            {promptExamples.map((example, index) => (
              <button key={example} className="inspire-card" type="button" onClick={() => setPrompt(example)}>
                <span className="num">0{index + 1}</span>
                <strong>{example.split(':')[0]}</strong>
                <span className="chip tag info">{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}

function renderHeading(line: string, accent: string): React.ReactNode {
  // 子串匹配,兼容无空格的中文(如"今天我们设计点什么?"里的"设计")
  const idx = line.toLowerCase().indexOf(accent.toLowerCase())
  if (!accent || idx === -1) {
    return line.split(' ').map((word, i) => <span key={i}>{word} </span>)
  }
  const before = line.slice(0, idx)
  const match = line.slice(idx, idx + accent.length)
  const after = line.slice(idx + accent.length)
  return (
    <>
      {before ? <span>{before}</span> : null}
      <span className="grad">{match}</span>
      {after ? <span>{after}</span> : null}
    </>
  )
}

function SessionGroup(props: {
  title: string
  sessions: SessionSnapshot[]
  resumeId: string | null
  emptyText?: string
  onResume: (session: SessionSnapshot) => Promise<void>
}): React.JSX.Element {
  return (
    <section className="side-section">
      <h3>{props.title}</h3>
      {props.sessions.length === 0 ? <p className="side-empty">{props.emptyText ?? 'Create your first design session.'}</p> : null}
      {props.sessions.map(session => (
        <button key={session.id} className={`side-session${props.resumeId === session.id ? ' active' : ''}`} type="button" onClick={() => void props.onResume(session)}>
          <span className="thumb" aria-hidden>{session.mode === 'new_html' ? 'N' : 'H'}</span>
          <span className="meta">
            <strong>{session.title}</strong>
            <small>{formatRelativeTime(session.updatedAt)} · {props.resumeId === session.id ? 'resuming' : session.mode === 'new_html' ? 'new html' : 'existing html'}</small>
          </span>
          <span className="menu" aria-hidden><Icon name="moreHorizontal" size={16} /></span>
        </button>
      ))}
    </section>
  )
}

function PairedPillMenu<TPanel extends string>(props: {
  id: Exclude<OpenMenu, 'workspace' | null>
  label: string
  value: string
  panels: Array<{
    id: TPanel
    icon: IconName
    label: string
    itemCount: number
  }>
  activePanel: TPanel | null
  onActivePanelChange: (panel: TPanel | null) => void
  children: React.ReactNode
  openMenu: OpenMenu
  setOpenMenu: React.Dispatch<React.SetStateAction<OpenMenu>>
}): React.JSX.Element {
  const isOpen = props.openMenu === props.id
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  return (
    <div className={`menu-root menu-root-${props.id}`} data-menu-root="true">
      <button
        ref={triggerRef}
        type="button"
        className="tool"
        data-testid={`${props.id}-pill-trigger`}
        aria-expanded={isOpen}
        onClick={() => {
          const nextOpen = props.openMenu !== props.id
          props.onActivePanelChange(nextOpen ? props.panels[0]?.id ?? null : null)
          props.setOpenMenu(nextOpen ? props.id : null)
        }}
      >
        <span className="k">{props.label}</span>
        <span className="v">{props.value}</span>
      </button>
      <FloatingMenu
        open={isOpen}
        anchorRef={triggerRef}
        align={props.id === 'model' ? 'end' : 'start'}
        className={`paired-popover-wrap paired-popover-${props.id}`}
      >
          <div className="paired-parent-list" role="menu" aria-label={props.label} data-testid={`${props.id}-panel-options`}>
            {props.panels.map(panel => (
              <button
                key={panel.id}
                className={panel.id === props.activePanel ? 'active' : ''}
                type="button"
                onMouseEnter={() => props.onActivePanelChange(panel.id)}
                onFocus={() => props.onActivePanelChange(panel.id)}
                onClick={() => props.onActivePanelChange(panel.id)}
              >
                <span aria-hidden><Icon name={panel.icon} size={16} /></span>
                <strong>{panel.label}</strong>
              </button>
            ))}
          </div>
          {props.activePanel ? (
            <div className="context-child-panel" data-testid={`${props.id}-paired-popover`}>
              {props.children}
            </div>
          ) : null}
      </FloatingMenu>
    </div>
  )
}

function DirectPillMenu(props: {
  id: Exclude<OpenMenu, 'workspace' | null>
  label: string
  value: string
  itemCount: number
  columnCount?: number
  children: React.ReactNode
  openMenu: OpenMenu
  setOpenMenu: React.Dispatch<React.SetStateAction<OpenMenu>>
}): React.JSX.Element {
  const isOpen = props.openMenu === props.id
  const triggerRef = useRef<HTMLButtonElement | null>(null)
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
        align={props.id === 'template' ? 'center' : 'start'}
        matchWidthSelector={props.id === 'template' ? '.composer-card' : undefined}
        fillAbove={props.id === 'template'}
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

function modelDescription(model: ModelOption | undefined): string {
  if (!model) return 'No model is currently available.'
  const capabilityText = model.capabilities.join(', ')
  return `${model.provider} · ${model.modelId}${capabilityText ? ` · ${capabilityText}` : ''}`
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

function writeCapabilityPreference(preference: Required<CapabilityPreferenceDraft>): void {
  try {
    window.localStorage.setItem(capabilityPreferenceStorageKey, JSON.stringify(preference))
  } catch {
    // Persisting preferences locally is a best-effort UX optimization.
  }
}
