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
import { UserActionCluster } from '@/components/UserActionCluster'

const promptExamples = [
  'A landing page for an invoicing app for freelancers: send invoices, get paid faster, track expenses.',
  'A portfolio homepage for a 3D artist with cinematic project cards.',
  'A calm productivity timer for deep work sessions.',
]

const stylePresets = ['minimal, trustworthy', 'bold editorial, high contrast', 'calm SaaS, spacious', 'playful mobile, colorful']
const variationOptions = [1, 2, 3, 4, 5, 6]
type OpenMenu = 'workspace' | 'type' | 'variations' | 'domain' | 'aesthetic' | 'palette' | 'loop' | 'styles' | 'model' | null
type CapabilityPreferenceDraft = {
  domainTemplateId?: string
  aestheticProfileId?: string
  colorPaletteId?: string
  loopProfileId?: string
}

const capabilityPreferenceStorageKey = 'dudesign.capabilityPreference'

export default function HomePage(): React.JSX.Element {
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
        setStatus('idle')
        return getUserPreferences()
          .then(preferences => {
            setDomainTemplateId(localPreference.domainTemplateId ?? preferences.capabilityPreference.domainTemplateId ?? data[2].defaults.domainTemplateId)
            setAestheticProfileId(localPreference.aestheticProfileId ?? preferences.capabilityPreference.aestheticProfileId ?? data[2].defaults.aestheticProfileId)
            setColorPaletteId(localPreference.colorPaletteId ?? preferences.capabilityPreference.colorPaletteId ?? data[2].defaults.colorPaletteId)
            setLoopProfileId(localPreference.loopProfileId ?? preferences.capabilityPreference.loopProfileId ?? data[2].defaults.loopProfileId)
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
          },
          automation: {
            loopProfileId: loopProfileId || undefined,
          },
        },
        templateRequirements: {
          styles: styles.split(',').map(style => style.trim()).filter(Boolean),
          deviceTargets: ['desktop', 'mobile'],
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
    }
    writeCapabilityPreference(capabilityPreference)
    void updateUserPreferences({
      capabilityPreference,
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
      <aside className="workspace-sidebar" aria-label="Recent sessions">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden />
          <strong>DUDesign</strong>
        </div>
        <div className="sidebar-tabs" role="tablist" aria-label="Workspace scope">
          <button className="active">My sessions</button>
          <button>Shared</button>
        </div>
        <label className="sidebar-search">
          <span>⌕</span>
          <input aria-label="Search sessions" placeholder="Search sessions" />
        </label>
        <SessionGroup
          title="Recent"
          sessions={sessions.slice(0, 5)}
          resumeId={resumeId}
          onResume={resume}
        />
        <SessionGroup
          title="Earlier"
          sessions={sessions.slice(5, 10)}
          resumeId={resumeId}
          onResume={resume}
          emptyText="Older sessions will appear here."
        />
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <span className="eyebrow">Hosted design workspace</span>
            <h1>What shall we design today?</h1>
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
                <span>{workspace?.name ?? 'Connecting workspace...'}</span>
                <small>MVP hosted</small>
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
                  <p>Team workspaces are reserved for the collaboration milestone.</p>
                </div>
              ) : null}
            </div>
            <UserActionCluster user={bootstrap?.user} />
          </div>
        </header>

        <section className="workbench-composer" aria-label="Generate design variations">
          <div className="composer-heading">
            <div className="mode-tabs compact" role="tablist" aria-label="Source mode">
              <button className={mode === 'new_html' ? 'active' : ''} onClick={() => setMode('new_html')}>
                New HTML
              </button>
              <button className={mode === 'from_existing_html' ? 'active' : ''} onClick={() => setMode('from_existing_html')}>
                Existing HTML
              </button>
            </div>
            <button className="start-design-button" type="button" onClick={() => setPrompt('')}>
              + Start with your design
            </button>
          </div>
          <div className="prompt-box">
            <textarea
              data-testid="prompt-input"
              aria-label="Design prompt"
              placeholder="Describe the page, product, audience, and tone..."
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              rows={8}
            />
            <div className="composer-toolbar">
              <button className="toolbar-icon" type="button" aria-label="Add context">+</button>
              <PillMenu id="type" label="Type" value={mode === 'new_html' ? 'New HTML' : 'Existing HTML'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <button className={mode === 'new_html' ? 'active' : ''} type="button" onClick={() => {
                  setMode('new_html')
                  setOpenMenu(null)
                }}>
                  New HTML
                  <span>Generate a fresh standalone page.</span>
                </button>
                <button className={mode === 'from_existing_html' ? 'active' : ''} type="button" onClick={() => {
                  setMode('from_existing_html')
                  setOpenMenu(null)
                }}>
                  Existing HTML
                  <span>Continue from an uploaded or selected artifact.</span>
                </button>
              </PillMenu>
              {mode === 'from_existing_html' ? (
                <label className="source-upload-pill">
                  <span>{sourceUploadStatus === 'uploading' ? 'Uploading...' : sourceArtifact ? sourceArtifact.entryPath : 'Upload HTML'}</span>
                  <input
                    data-testid="source-html-input"
                    type="file"
                    accept=".html,.htm,text/html"
                    onChange={event => void uploadSourceFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : null}
              <PillMenu id="variations" label="Variations" value={`${variationCount} drafts`} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="segmented-options" data-testid="variation-count-input">
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
              </PillMenu>
              <PillMenu id="domain" label="Domain" value={selectedDomain?.name ?? 'Domain'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="capability-option-list" data-testid="domain-template-options">
                  {(capabilities?.domainTemplates ?? []).map(template => (
                    <button
                      key={template.id}
                      className={template.id === domainTemplateId ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setDomainTemplateId(template.id)
                        saveCapabilityPreference({ domainTemplateId: template.id })
                        setOpenMenu(null)
                      }}
                    >
                      <strong>{template.name}</strong>
                      <span>{template.category} · {template.description}</span>
                    </button>
                  ))}
                </div>
              </PillMenu>
              <PillMenu id="aesthetic" label="Aesthetic" value={selectedAesthetic?.name ?? 'Aesthetic'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="capability-option-list" data-testid="aesthetic-profile-options">
                  {(capabilities?.aestheticProfiles ?? []).map(profile => (
                    <button
                      key={profile.id}
                      className={profile.id === aestheticProfileId ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        const nextPaletteId = profile.colorPaletteIds[0] ?? capabilities?.defaults.colorPaletteId ?? ''
                        setAestheticProfileId(profile.id)
                        setColorPaletteId(nextPaletteId)
                        saveCapabilityPreference({ aestheticProfileId: profile.id, colorPaletteId: nextPaletteId })
                        setOpenMenu(null)
                      }}
                    >
                      <strong>{profile.name}</strong>
                      <span>{profile.description}</span>
                    </button>
                  ))}
                </div>
              </PillMenu>
              <PillMenu id="palette" label="Palette" value={selectedPalette?.name ?? 'Palette'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="capability-option-list" data-testid="color-palette-options">
                  {availablePalettes.map(palette => (
                    <button
                      key={palette.id}
                      className={palette.id === colorPaletteId ? 'active' : ''}
                      type="button"
                      onClick={() => {
                        setColorPaletteId(palette.id)
                        saveCapabilityPreference({ colorPaletteId: palette.id })
                        setOpenMenu(null)
                      }}
                    >
                      <strong>{palette.name}</strong>
                      <span className="swatch-row" aria-hidden>
                        {palette.colors.map(color => <i key={color} style={{ background: color }} />)}
                      </span>
                    </button>
                  ))}
                </div>
              </PillMenu>
              <PillMenu id="loop" label="Loop" value={selectedLoop?.name ?? 'Loop'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="capability-option-list" data-testid="loop-profile-options">
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
                      <strong>{profile.name}</strong>
                      <span>{profile.description}</span>
                    </button>
                  ))}
                </div>
              </PillMenu>
              <PillMenu id="styles" label="Styles" value={styles || 'Choose style'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <label className="popover-field">
                  Style direction
                  <input value={styles} onChange={event => setStyles(event.target.value)} />
                </label>
                <div className="preset-list">
                  {stylePresets.map(preset => (
                    <button key={preset} type="button" onClick={() => {
                      setStyles(preset)
                      setOpenMenu(null)
                    }}>
                      {preset}
                    </button>
                  ))}
                </div>
              </PillMenu>
              <PillMenu id="model" label="Model" value={selectedModel ? modelLabel(selectedModel) : 'No model'} openMenu={openMenu} setOpenMenu={setOpenMenu}>
                <div className="model-option-list">
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
              </PillMenu>
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
                : 'Upload an HTML file to continue from an existing page.'}
            </div>
          ) : null}
          {capabilities ? (
            <div className="capability-summary" data-testid="capability-summary">
              <span>{selectedDomain?.name ?? 'Domain'}</span>
              <span>{selectedAesthetic?.name ?? 'Aesthetic'}</span>
              <span>{selectedPalette?.name ?? 'Palette'}</span>
              <span>{selectedLoop?.name ?? 'Loop'}</span>
            </div>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="inspiration-strip" aria-label="Design inspiration">
          <div className="section-heading">
            <strong>Need inspiration?</strong>
            <span>{sessions.length} saved</span>
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

function PillMenu(props: {
  id: Exclude<OpenMenu, 'workspace' | null>
  label: string
  value: string
  children: React.ReactNode
  openMenu: OpenMenu
  setOpenMenu: React.Dispatch<React.SetStateAction<OpenMenu>>
}): React.JSX.Element {
  const isOpen = props.openMenu === props.id
  return (
    <div className="pill-menu" data-menu-root="true">
      <button
        type="button"
        className="pill-menu-trigger"
        aria-expanded={isOpen}
        onClick={() => props.setOpenMenu(current => current === props.id ? null : props.id)}
      >
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </button>
      {isOpen ? (
        <div className="pill-popover">
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
