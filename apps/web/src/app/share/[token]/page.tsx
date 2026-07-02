'use client'

import { useEffect, useState } from 'react'
import { apiUrl, getSharedVariation } from '@/lib/api'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'
import { useLanguage } from '@/components/LanguageProvider'
import type { SharedVariationResponse } from '@dudesign/contracts'

export default function SharePage(props: { params: Promise<{ token: string }> }): React.JSX.Element {
  const { t } = useLanguage()
  const [token, setToken] = useState<string | null>(null)
  const [detail, setDetail] = useState<SharedVariationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [currentUrl, setCurrentUrl] = useState('')

  useEffect(() => {
    props.params.then(params => setToken(params.token)).catch(err => setError((err as Error).message))
  }, [props.params])

  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [])

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
      cancelled = false
    }
  }, [token])

  const sizeBytes = detail?.artifact.html ? new Blob([detail.artifact.html]).size : 0
  const sizeLabel = sizeBytes ? formatBytes(sizeBytes) : '—'

  return (
    <main className="share-shell">
      <header className="share-topbar">
        <div className="left">
          <span className="brand-mark"><Logo size={44} /></span>
          <div className="meta">
            <span className="eyebrow">{t('shareEyebrow')} · {token ?? '…'}</span>
            <h1>{detail?.variation.title ?? t('sharedVariation')}</h1>
            <p>
              {detail
                ? `${t('readonlyArtifact')} v${detail.artifact.version} · ${detail.share.visibility}`
                : t('loadingShared')}
            </p>
          </div>
        </div>
        <div className="share-actions">
          <button className="btn" type="button" disabled title={t('exportReservedTitle')}>
            <Icon name="download" size={15} /> {t('downloadHtml')}
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => { if (token) void navigator.clipboard?.writeText(window.location.href).catch(() => {}) }}
          >
            <Icon name="copy" size={15} /> {t('copyShareLink')}
          </button>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      {detail ? (
        <p className={`share-health ${previewState}`} data-testid="share-preview-health">
          <span className="dot"></span>
          {previewState === 'ready'
            ? t('shareAvailable')
            : previewState === 'error'
              ? t('shareLoadError')
              : t('shareLoading')}
        </p>
      ) : null}

      {detail ? (
        <div className="share-stats">
          <div className="share-stat">
            <div className="k">{t('statVariation')}</div>
            <div className="v">{detail.variation.title?.slice(0, 8) ?? detail.variation.id.slice(0, 8)} <small>· {detail.variation.id.slice(0, 10)}</small></div>
          </div>
          <div className="share-stat">
            <div className="k">{t('statVersion')}</div>
            <div className="v">v{detail.artifact.version} <small>· {detail.share.visibility}</small></div>
          </div>
          <div className="share-stat">
            <div className="k">{t('statSize')}</div>
            <div className="v">{sizeLabel.split(' ')[0]} <small>{sizeLabel.split(' ')[1] ?? ''}</small></div>
          </div>
          <div className="share-stat">
            <div className="k">{t('statDevice')}</div>
            <div className="v">{t('desktop')} <small>· 1280</small></div>
          </div>
        </div>
      ) : null}

      <section data-testid="share-preview" className="share-preview">
        {detail?.artifact.html ? (
          <div className="frame">
            <iframe
              data-testid="share-preview-frame"
              title={detail.variation.title ?? t('sharedPreviewTitle')}
              srcDoc={absolutizeSharedAssetUrls(detail.artifact.html)}
              sandbox=""
              onLoad={() => setPreviewState('ready')}
              onError={() => setPreviewState('error')}
            />
          </div>
        ) : (
          <div className="preview-placeholder">
            {error ? t('sharedUnavailable') : t('waitingPreview')}
          </div>
        )}
      </section>

      <div className="share-foot">
        <div className="meta">
          <span className="brand-mark"><Logo size={40} /></span>
          <span>{t('generatedBy')}</span>
        </div>
        <code>{currentUrl || `https://dudesign.app/share/${token ?? ''}`}</code>
      </div>
    </main>
  )
}

function absolutizeSharedAssetUrls(html: string): string {
  return html.replace(
    /\b(src|href)\s*=\s*(["'])(\/api\/shares\/[^"']+)\2/gi,
    (_match: string, attr: string, quote: string, path: string) => `${attr}=${quote}${apiUrl(path)}${quote}`,
  )
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}
