'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiUrl, getSharedVariation } from '@/lib/api'
import type { SharedVariationResponse } from '@dudesign/contracts'

export default function SharePage(props: { params: Promise<{ token: string }> }): React.JSX.Element {
  const [token, setToken] = useState<string | null>(null)
  const [detail, setDetail] = useState<SharedVariationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    props.params.then(params => setToken(params.token)).catch(err => setError((err as Error).message))
  }, [props.params])

  useEffect(() => {
    if (!token) return
    let cancelled = false
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

  const previewUrl = useMemo(() => {
    if (!detail?.variation.previewUrl) return null
    return apiUrl(detail.variation.previewUrl)
  }, [detail?.variation.previewUrl])

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
        <a href="/" className="back-link">Create your own</a>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="share-preview">
        {previewUrl ? (
          <iframe title={detail?.variation.title ?? 'Shared preview'} src={previewUrl} sandbox="" />
        ) : (
          <div className="preview-placeholder">Waiting for shared preview</div>
        )}
      </section>
    </main>
  )
}
