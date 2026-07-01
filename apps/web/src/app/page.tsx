'use client'

import { useEffect, useMemo, useState } from 'react'
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

const promptExamples = [
  'A landing page for an invoicing app for freelancers: send invoices, get paid faster, track expenses.',
  'A portfolio homepage for a 3D artist with cinematic project cards.',
  'A calm productivity timer for deep work sessions.',
]

const stylePresets = ['minimal, trustworthy', 'bold editorial, high contrast', 'calm SaaS, spacious', 'playful mobile, colorful']
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

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar" aria-label={t('recent')}>
        <div className="sidebar-brand">
          <strong>DUDesign</strong>
          <span className="product-stage-badge">Alpha</span>
        </div>
        <div className="sidebar-tabs" role="tablist" aria-label="Workspace scope">
          <button className="active">{t('mySessions')}</button>
          <button>{t('shared')}</button>
        </div>
        <label className="sidebar-search">
          <span>⌕</span>
          <input aria-label={t('searchSessions')} placeholder={t('searchSessions')} />
        </label>
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

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <h1>{t('whatShallWeDesign')}</h1>
          </div>
          <div className="workspace-topbar-actions">
            <div className="workspace-selector" data-menu-root="true">
              <button
                type="button"
                className="workspace-selector-trigger"
                data-testid="workspace-selector"
                aria-expanded={openMenu === 'workspace'}
                onClick={() => setOpenMenu(current => current === 'workspace' ? null : 'workspace')}
              >
                <span>{workspace?.name ?? t('connectingWorkspace')}</span>
                <small>{t('mvpHosted')}</small>
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
            <UserActionCluster user={bootstrap?.user} />
          </div>
        </header>

        <section className="workbench-composer" aria-label={t('generateDesignVariations')}>
          <div className="composer-heading">
            <div className="mode-tabs compact" role="tablist" aria-label={t('sourceMode')}>
              <button className={mode === 'new_html' ? 'active' : ''} onClick={() => setMode('new_html')}>
                {t('newHtml')}
              </button>
              <button className={mode === 'from_existing_html' ? 'active' : ''} onClick={() => setMode('from_existing_html')}>
                {t('existingHtml')}
              </button>
            </div>
            <button className="start-design-button" type="button" onClick={() => setPrompt('')}>
              {t('startWithYourDesign')}
            </button>
          </div>
          <div className="prompt-box">
            <textarea
              data-testid="prompt-input"
              aria-label={t('designPrompt')}
              placeholder={t('describePromptPlaceholder')}
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              rows={8}
            />
            <div className="composer-toolbar">
              <div className="toolbar-menu" data-menu-root="true">
                <button
                  className="toolbar-icon"
                  type="button"
                  aria-label={t('addContext')}
                  aria-expanded={openMenu === 'context'}
                  onClick={() => {
                    setContextPanel(null)
                    setOpenMenu(current => current === 'context' ? null : 'context')
                  }}
                >
                  +
                </button>
                {openMenu === 'context' ? (
                  <div className="context-popover-wrap">
                    <div className="context-parent-popover">
                      <div className="context-parent-list" role="menu" aria-label={t('addContext')}>
                        <button
                          className={contextPanel === 'files' ? 'active' : ''}
                          type="button"
                          onMouseEnter={() => setContextPanel('files')}
                          onFocus={() => setContextPanel('files')}
                          onClick={() => setContextPanel('files')}
                        >
                          <span className="context-menu-icon" aria-hidden>↥</span>
                          <strong>{t('addFilesOrPhotos')}</strong>
                          <i aria-hidden>›</i>
                        </button>
                        <button
                          className={contextPanel === 'skills' ? 'active' : ''}
                          type="button"
                          onMouseEnter={() => setContextPanel('skills')}
                          onFocus={() => setContextPanel('skills')}
                          onClick={() => setContextPanel('skills')}
                        >
                          <span className="context-menu-icon" aria-hidden>✦</span>
                          <strong>{t('skills')}</strong>
                          <i aria-hidden>›</i>
                        </button>
                        <button
                          className={contextPanel === 'connectors' ? 'active' : ''}
                          type="button"
                          onMouseEnter={() => setContextPanel('connectors')}
                          onFocus={() => setContextPanel('connectors')}
                          onClick={() => setContextPanel('connectors')}
                        >
                          <span className="context-menu-icon" aria-hidden>ↄ</span>
                          <strong>{t('addConnector')}</strong>
                          <i aria-hidden>›</i>
                        </button>
                        <button
                          className={contextPanel === 'plugins' ? 'active' : ''}
                          type="button"
                          onMouseEnter={() => setContextPanel('plugins')}
                          onFocus={() => setContextPanel('plugins')}
                          onClick={() => setContextPanel('plugins')}
                        >
                          <span className="context-menu-icon" aria-hidden>✣</span>
                          <strong>{t('addPlugins')}</strong>
                          <i aria-hidden>›</i>
                        </button>
                      </div>
                    </div>
                    {contextPanel ? (
                      <div
                        className="context-child-popover"
                        style={{
                          '--context-panel-index': String(contextPanelIndex(contextPanel)),
                          '--context-panel-items': String(contextPanelItemCount(contextPanel)),
                        } as React.CSSProperties}
                      >
                        <div className="context-child-panel">
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
                                {profile.name}
                                <span>{profile.description}</span>
                              </button>
                            ))}
                          </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
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
                <div className="direct-option-list variation-count-list" data-testid="variation-count-input">
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
                value={selectedDomain?.name ?? t('choose')}
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
                  selectedLoopName={selectedLoop?.name}
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
                panels={[{ id: 'models', icon: '◉', label: t('model'), itemCount: Math.max(bootstrap?.models.models.length ?? 1, 1) }]}
                activePanel={modelPanel}
                onActivePanelChange={setModelPanel}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
              >
                <div className="paired-option-list model-option-list">
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
              <button className="toolbar-icon send" type="button" data-testid="generate-button" disabled={!canSubmit} onClick={() => void submit()}>
                {status === 'submitting' ? '...' : '↑'}
              </button>
            </div>
          </div>
          <div className="example-row workbench-examples">
            {promptExamples.map(example => (
              <button key={example} onClick={() => setPrompt(example)}>
                {example}
              </button>
            ))}
          </div>
          {mode === 'from_existing_html' ? (
            <div className={`source-artifact-status ${sourceArtifact?.qualityStatus ?? sourceUploadStatus}`} data-testid="source-artifact-status">
              {sourceArtifact
                ? `Using ${sourceArtifact.entryPath} · ${formatBytes(sourceArtifact.sizeBytes)}${sourceArtifact.qualityStatus ? ` · ${sourceArtifact.qualityStatus}` : ''}`
                : t('uploadHtmlToContinue')}
            </div>
          ) : null}
          {capabilities ? (
            <div className="capability-summary" data-testid="capability-summary">
              <span>{selectedDomain?.name ?? t('domain')}</span>
              <span>{selectedAesthetic?.name ?? t('aesthetic')}</span>
              <span>{selectedPalette?.name ?? t('palette')}</span>
              <span>{selectedLoop?.name ?? t('loop')}</span>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="inspiration-strip" aria-label={t('designInspiration')}>
          <div className="section-heading">
            <strong>{t('needInspiration')}</strong>
            <span>{sessions.length} {t('saved')}</span>
          </div>
          <div className="inspiration-grid">
            {promptExamples.map((example, index) => (
              <button key={example} className="inspiration-card" type="button" onClick={() => setPrompt(example)}>
                <span>0{index + 1}</span>
                <strong>{example.split(':')[0]}</strong>
              </button>
            ))}
          </div>
        </section>
      </section>
    </main>
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
    <section className="sidebar-session-group">
      <h2>{props.title}</h2>
      {props.sessions.length === 0 ? <p>{props.emptyText ?? 'Create your first design session.'}</p> : null}
      {props.sessions.map(session => (
        <button key={session.id} className="sidebar-session-card" type="button" onClick={() => void props.onResume(session)}>
          <span className="session-thumb" aria-hidden>{session.mode === 'new_html' ? 'N' : 'H'}</span>
          <span>
            <strong>{session.title}</strong>
            <small>{formatRelativeTime(session.updatedAt)} · {props.resumeId === session.id ? 'resuming' : session.mode === 'new_html' ? 'new html' : 'existing html'}</small>
          </span>
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
    icon: string
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
  const activeIndex = props.activePanel ? Math.max(0, props.panels.findIndex(panel => panel.id === props.activePanel)) : 0
  const activeItemCount = props.activePanel ? props.panels.find(panel => panel.id === props.activePanel)?.itemCount ?? 1 : 1
  return (
    <div className="pill-menu" data-menu-root="true">
      <button
        type="button"
        className="pill-menu-trigger"
        aria-expanded={isOpen}
        onClick={() => {
          props.onActivePanelChange(null)
          props.setOpenMenu(current => current === props.id ? null : props.id)
        }}
      >
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </button>
      {isOpen ? (
        <div
          className="paired-popover-wrap"
          data-testid={`${props.id}-paired-popover`}
          style={{
            '--paired-panel-index': String(activeIndex),
            '--paired-panel-items': String(activeItemCount),
            '--paired-panel-count': String(props.panels.length),
          } as React.CSSProperties}
        >
          <div className="paired-parent-popover">
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
                  <span aria-hidden>{panel.icon}</span>
                  <strong>{panel.label}</strong>
                </button>
              ))}
            </div>
          </div>
          {props.activePanel ? (
            <div className="paired-child-popover">
              <div className="paired-child-panel">
                {props.children}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
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
  return (
    <div className="pill-menu" data-menu-root="true">
      <button
        type="button"
        className={`pill-menu-trigger${props.id === 'template' ? ' direction-pill-trigger' : ''}`}
        data-testid={`${props.id}-pill-trigger`}
        aria-expanded={isOpen}
        onClick={() => props.setOpenMenu(current => current === props.id ? null : props.id)}
      >
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </button>
      {isOpen ? (
        <div
          className={`direct-popover${props.id === 'template' ? ' design-direction-popover' : ''}`}
          data-testid={`${props.id}-direct-popover`}
          style={{
            '--direct-panel-items': String(props.itemCount),
            '--direct-panel-columns': String(props.columnCount ?? 1),
          } as React.CSSProperties}
        >
          {props.children}
        </div>
      ) : null}
    </div>
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

function contextPanelIndex(panel: ContextPanel): number {
  if (panel === 'files') return 0
  if (panel === 'skills') return 1
  if (panel === 'connectors') return 2
  return 3
}

function contextPanelItemCount(panel: ContextPanel): number {
  if (panel === 'files') return 3
  if (panel === 'connectors') return 2
  return 1
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
