'use client'

import { useEffect, useState } from 'react'
import { apiUrl, getSharedVariation } from '@/lib/api'
import type { SharedVariationResponse } from '@dudesign/contracts'

export default function SharePage(props: { params: Promise<{ token: string }> }): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null)
  const [detail, setDetail] = useState<SharedVariationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    props.params.then(params => setToken(params.token)).catch(err => setError((err as Error).message))
  }, [props.params])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setPreviewState('loading')
    getSharedVariation(token)
      .then(data => {
        if (!cancelled) setDetail(data)
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main className="share-shell">
      <header className="share-header">
        <div>
          <span className="eyebrow">Shared DUDesign preview</span>
          <h1>{detail?.variation.title ?? 'Shared variation'}</h1>
          <p>
            {detail
              ? `Read-only artifact v${detail.artifact.version} · ${detail.share.visibility}`
              : 'Loading shared preview...'}
          </p>
        </div>
        <div className="share-actions">
          <button type="button" disabled title="Export from shared links is reserved for a later MVP step.">
            ZIP
          </button>
          <a href="/" className="back-link">Create your own</a>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {detail ? (
        <p className={`share-health ${previewState}`} data-testid="share-preview-health">
          {previewState === 'ready'
            ? 'Preview loaded with shared artifact assets.'
            : previewState === 'error'
              ? 'Preview frame could not load one or more shared resources.'
              : 'Loading shared artifact assets...'}
        </p>
      ) : null}

      <section data-testid="share-preview" className="share-preview">
        {detail?.artifact.html ? (
          <iframe
            data-testid="share-preview-frame"
            title={detail.variation.title ?? 'Shared preview'}
            srcDoc={absolutizeSharedAssetUrls(detail.artifact.html)}
            sandbox=""
            onLoad={() => setPreviewState('ready')}
            onError={() => setPreviewState('error')}
          />
        ) : (
          <div className="preview-placeholder">Waiting for shared preview</div>
        )}
      </section>
    </main>
  )
}

function absolutizeSharedAssetUrls(html: string): string {
  return html.replace(
    /\b(src|href)\s*=\s*(["'])(\/api\/shares\/[^"']+)\2/gi,
    (_match: string, attr: string, quote: string, path: string) => `${attr}=${quote}${apiUrl(path)}${quote}`,
  )
}
