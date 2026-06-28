'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createDesignJob,
  createSession,
  getBootstrap,
  listSessions,
  resumeSession,
  type BootstrapResponse,
  type SessionSnapshot,
} from '@/lib/api'

const promptExamples = [
  'A landing page for an invoicing app for freelancers: send invoices, get paid faster, track expenses.',
  'A portfolio homepage for a 3D artist with cinematic project cards.',
  'A calm productivity timer for deep work sessions.',
]

export default function HomePage(): React.JSX.Element {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null)
  const [prompt, setPrompt] = useState(promptExamples[0]!)
  const [variationCount, setVariationCount] = useState(3)
  const [mode, setMode] = useState<'new_html' | 'from_existing_html'>('new_html')
  const [styles, setStyles] = useState('minimal, trustworthy')
  const [modelServiceId, setModelServiceId] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'submitting' | 'error'>('loading')
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getBootstrap(), listSessions()])
      .then(data => {
        setBootstrap(data[0])
        setModelServiceId(data[0].models.defaultModelId ?? data[0].models.models[0]?.id ?? '')
        setSessions(data[1].sessions)
        setStatus('idle')
      })
      .catch(err => {
        setError((err as Error).message)
        setStatus('error')
      })
  }, [])

  const canSubmit = useMemo(() => {
    return status !== 'submitting' && Boolean(bootstrap) && prompt.trim().length > 0
  }, [bootstrap, prompt, status])

  async function submit(): Promise<void> {
    if (!bootstrap || !canSubmit) return
    setStatus('submitting')
    setError(null)
    try {
      const session = await createSession({
        workspaceId: bootstrap.workspace.id,
        mode,
        title: prompt.trim().slice(0, 80),
      })
      const job = await createDesignJob({
        sessionId: session.session.id,
        prompt: prompt.trim(),
        sourceMode: mode,
        modelServiceId: modelServiceId || undefined,
        variationCount,
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

  const recentSessions = sessions.slice(0, 5)

  return (
    <main className="home-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden />
        <strong>DUDesign</strong>
        <span className="workspace-chip">{bootstrap?.workspace.name ?? 'Connecting...'}</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="mode-tabs" role="tablist" aria-label="Source mode">
            <button className={mode === 'new_html' ? 'active' : ''} onClick={() => setMode('new_html')}>
              New HTML
            </button>
            <button className={mode === 'from_existing_html' ? 'active' : ''} onClick={() => setMode('from_existing_html')}>
              Existing HTML
            </button>
          </div>
          <h1>
            Design your page in <span>parallel.</span>
          </h1>
          <p>
            Create several HTML directions from one prompt, preview each result, then refine the strongest variation.
          </p>
        </div>

        <section className="composer-panel" aria-label="Generate design variations">
          <textarea
            data-testid="prompt-input"
            aria-label="Design prompt"
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            rows={6}
          />
          <div className="field-row">
            <label>
              Variations
              <input
                data-testid="variation-count-input"
                type="number"
                min={1}
                max={6}
                value={variationCount}
                onChange={event => setVariationCount(Number(event.target.value))}
              />
            </label>
            <label>
              Styles
              <input value={styles} onChange={event => setStyles(event.target.value)} />
            </label>
          </div>
          <label className="model-picker">
            Model
            <select value={modelServiceId} onChange={event => setModelServiceId(event.target.value)}>
              {(bootstrap?.models.models ?? []).map(model => (
                <option key={model.id} value={model.id}>
                  {model.displayName}{model.isDefault ? ' · default' : ''}
                </option>
              ))}
            </select>
            <span>
              {modelDescription(bootstrap?.models.models.find(model => model.id === modelServiceId))}
            </span>
          </label>
          <div className="example-row">
            {promptExamples.map(example => (
              <button key={example} onClick={() => setPrompt(example)}>
                {example.split(':')[0]}
              </button>
            ))}
          </div>
          <button data-testid="generate-button" className="generate-button" disabled={!canSubmit} onClick={() => void submit()}>
            {status === 'submitting' ? 'Generating...' : `Generate x${variationCount}`}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
        </section>
      </section>

      <section data-testid="recent-sessions" className="session-dock" aria-label="Recent design sessions">
        <div className="section-heading">
          <span className="eyebrow">Recent sessions</span>
          <strong>{recentSessions.length} saved</strong>
        </div>
        {recentSessions.length === 0 ? (
          <p className="muted-text">Your recent DUDesign sessions will appear here after the first generation.</p>
        ) : (
          <div className="session-list">
            {recentSessions.map(session => (
              <article key={session.id} className="session-row">
                <div>
                  <strong>{session.title}</strong>
                  <p>{session.lastPrompt ?? (session.mode === 'new_html' ? 'New HTML' : 'Existing HTML')}</p>
                </div>
                <span>{formatRelativeTime(session.updatedAt)}</span>
                <button onClick={() => void resume(session)} disabled={resumeId === session.id}>
                  {resumeId === session.id ? 'Resuming...' : 'Resume'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function modelDescription(model: BootstrapResponse['models']['models'][number] | undefined): string {
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
