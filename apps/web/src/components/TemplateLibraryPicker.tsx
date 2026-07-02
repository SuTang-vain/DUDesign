'use client'

import { useMemo, useState } from 'react'
import type { DesignTemplatePack } from '@dudesign/contracts'
import { Icon } from '@/components/Icon'
import { TemplateThumbnail } from '@/components/TemplateThumbnail'
import { useCapabilityI18n } from '@/lib/capabilityI18n'

type Tab = 'official' | 'mine' | 'recent' | 'favorites'

export type TemplateLibraryLabels = {
  templateLibrary: string
  official: string
  mine: string
  recent: string
  favorites: string
  templatesCount: string
  search: string
  autoDistribute: string
  autoDistributeHint: string
  autoDistributeFewHint: string
  importDesignMd: string
  pasteDesignMd: string
  designMdName: string
  importing: string
  applicableScenarios: string
  fontSummary: string
  dos: string
  donts: string
  noPreviewArtifact: string
  previewAttached: string
  emptyTemplates: string
  emptyFavorites: string
  emptyRecent: string
}

export function TemplateLibraryPicker(props: {
  packs: DesignTemplatePack[]
  selectedIds: string[]
  autoDistribute: boolean
  favoriteIds: Set<string>
  recentIds: string[]
  variationCount: number
  labels: TemplateLibraryLabels
  importing: boolean
  importNotice: { kind: 'ok' | 'warn' | 'err'; text: string } | null
  onToggleSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
  onAutoDistributeChange: (value: boolean) => void
  onImportDesignMd: (designMd: string, name?: string) => void
}): React.JSX.Element {
  const c18n = useCapabilityI18n()
  const [activeTab, setActiveTab] = useState<Tab>('official')
  const [query, setQuery] = useState('')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importName, setImportName] = useState('')

  const officialPacks = useMemo(() => props.packs.filter(pack => pack.source === 'official'), [props.packs])
  const minePacks = useMemo(() => props.packs.filter(pack => pack.source !== 'official'), [props.packs])
  const recentPacks = useMemo(
    () => orderByRecent(props.packs, props.recentIds),
    [props.packs, props.recentIds],
  )
  const favoritePacks = useMemo(
    () => props.packs.filter(pack => props.favoriteIds.has(pack.id)),
    [props.packs, props.favoriteIds],
  )

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'official', label: props.labels.official, count: officialPacks.length },
    { id: 'mine', label: props.labels.mine, count: minePacks.length },
    { id: 'recent', label: props.labels.recent, count: recentPacks.length },
    { id: 'favorites', label: props.labels.favorites, count: favoritePacks.length },
  ]

  const list = useMemo(() => {
    const pool = activeTab === 'official'
      ? officialPacks
      : activeTab === 'mine'
        ? minePacks
        : activeTab === 'recent'
          ? recentPacks
          : favoritePacks
    const needle = query.trim().toLowerCase()
    if (!needle) return pool
    return pool.filter(pack => `${pack.name} ${pack.description ?? ''} ${pack.rationale.overview ?? ''}`.toLowerCase().includes(needle))
  }, [activeTab, officialPacks, minePacks, recentPacks, favoritePacks, query])

  const focused = props.packs.find(pack => pack.id === focusedId) ?? list[0] ?? null
  const showAutoDistribute = props.selectedIds.length > 1
  const showFewHint = props.selectedIds.length > 0 && props.selectedIds.length < props.variationCount

  return (
    <div className="template-library-picker" data-testid="template-library-picker">
      <div className="tpl-filter-bar">
        <label className="direction-search">
          <Icon name="search" size={15} />
          <input
            value={query}
            placeholder={props.labels.search}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
        <div className="tpl-source-filters" aria-label={props.labels.templateLibrary}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => { setActiveTab(tab.id); setQuery(''); setFocusedId(null) }}
            >
              <span>{tab.label}</span>
              <small>{tab.count}</small>
            </button>
          ))}
        </div>
      </div>

      {showAutoDistribute ? (
        <label className="tpl-autodistribute" data-testid="auto-distribute-toggle">
          <input
            type="checkbox"
            checked={props.autoDistribute}
            onChange={event => props.onAutoDistributeChange(event.target.checked)}
          />
          <span>{props.labels.autoDistribute}</span>
          <small>{showFewHint ? props.labels.autoDistributeFewHint : props.labels.autoDistributeHint}</small>
        </label>
      ) : null}

      <div className="direction-body">
        <div className="direction-list">
          {activeTab === 'mine' ? (
            <div className="tpl-import">
              <button type="button" className="tpl-import-toggle" onClick={() => setImportOpen(open => !open)}>
                <Icon name="upload" size={14} /> {props.labels.importDesignMd}
              </button>
              {importOpen ? (
                <div className="tpl-import-form">
                  <input
                    className="tpl-import-name"
                    value={importName}
                    placeholder={props.labels.designMdName}
                    onChange={event => setImportName(event.target.value)}
                  />
                  <textarea
                    data-testid="import-design-md-textarea"
                    className="tpl-import-textarea"
                    value={importText}
                    placeholder={props.labels.pasteDesignMd}
                    rows={4}
                    onChange={event => setImportText(event.target.value)}
                  />
                  <button
                    type="button"
                    data-testid="import-design-md-submit"
                    className="btn primary sm"
                    disabled={!importText.trim() || props.importing}
                    onClick={() => {
                      props.onImportDesignMd(importText.trim(), importName.trim() || undefined)
                      setImportText('')
                      setImportName('')
                    }}
                  >
                    {props.importing ? props.labels.importing : props.labels.importDesignMd}
                  </button>
                  {props.importNotice ? (
                    <span className={`chip ${props.importNotice.kind === 'ok' ? 'ok' : props.importNotice.kind === 'warn' ? 'warn' : 'err'}`}>
                      {props.importNotice.text}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {list.length === 0 ? (
            <p className="tpl-empty">
              {activeTab === 'recent' ? props.labels.emptyRecent
                : activeTab === 'favorites' ? props.labels.emptyFavorites
                : props.labels.emptyTemplates}
            </p>
          ) : null}

          <div className="tpl-cards" data-testid="template-cards">
            {list.map(pack => {
              const selected = props.selectedIds.includes(pack.id)
              const favorited = props.favoriteIds.has(pack.id)
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={`tpl-card${selected ? ' active' : ''}`}
                  data-testid={`template-card-${pack.id}`}
                  onClick={() => props.onToggleSelect(pack.id)}
                  onPointerEnter={() => setFocusedId(pack.id)}
                  onFocus={() => setFocusedId(pack.id)}
                >
                  <TemplateThumbnail pack={pack} />
                  <span className="tpl-card-body">
                    <strong>{c18n.templatePackName(pack.id, pack.name)}</strong>
                    <span className="tpl-scenarios">
                      {pack.description ? c18n.templatePackDesc(pack.id, pack.description) : ''}
                    </span>
                    <span className="tpl-font">{fontSummary(pack, props.labels)}</span>
                  </span>
                  <span className="tpl-card-meta">
                    <i
                      className={`tpl-star${favorited ? ' active' : ''}`}
                      role="button"
                      tabIndex={-1}
                      aria-label={props.labels.favorites}
                      data-testid={`template-favorite-toggle-${pack.id}`}
                      onClick={event => { event.stopPropagation(); props.onToggleFavorite(pack.id) }}
                    >
                      <Icon name="star" size={15} />
                    </i>
                    <i className={`tpl-check${selected ? ' active' : ''}`} aria-hidden="true">
                      <Icon name="check" size={14} />
                    </i>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <aside className="direction-detail">
          {focused ? (
            <TemplateDetail pack={focused} labels={props.labels} c18n={c18n} />
          ) : (
            <span>{props.labels.templateLibrary}</span>
          )}
        </aside>
      </div>
    </div>
  )
}

function TemplateDetail(props: {
  pack: DesignTemplatePack
  labels: TemplateLibraryLabels
  c18n: ReturnType<typeof useCapabilityI18n>
}): React.JSX.Element {
  const { pack, labels, c18n } = props
  const colors = Object.entries(pack.designTokens.colors).slice(0, 8)
  const display = pack.designTokens.typography.display
  const body = pack.designTokens.typography.body
  return (
    <>
      <span>{labels.templateLibrary}</span>
      <strong>{c18n.templatePackName(pack.id, pack.name)}</strong>
      <p>{pack.description ? c18n.templatePackDesc(pack.id, pack.description) : ''}</p>
      <dl>
        <div>
          <dt>{labels.fontSummary}</dt>
          <dd>
            {display?.fontFamily ? <span className="tpl-meta-line">{display.fontFamily.split(',')[0]}</span> : null}
            {body?.fontFamily ? <span className="tpl-meta-line">{body.fontFamily.split(',')[0]}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{labels.applicableScenarios}</dt>
          <dd>{pack.rationale.overview ?? '—'}</dd>
        </div>
        <div>
          <dt>{labels.dos}</dt>
          <dd>{pack.rationale.dos.length ? pack.rationale.dos.join(' · ') : '—'}</dd>
        </div>
        <div>
          <dt>{labels.donts}</dt>
          <dd>{pack.rationale.donts.length ? pack.rationale.donts.join(' · ') : '—'}</dd>
        </div>
      </dl>
      <div className="tpl-detail-swatches">
        {colors.map(([key, color]) => (
          <span key={key} className="tpl-swatch" style={{ background: color }} title={key} />
        ))}
      </div>
      <span className={`chip info tpl-preview-badge`}>
        {pack.previewArtifactId ? labels.previewAttached : labels.noPreviewArtifact}
      </span>
    </>
  )
}

function fontSummary(pack: DesignTemplatePack, labels: TemplateLibraryLabels): string {
  const display = pack.designTokens.typography.display
  const family = display?.fontFamily ? display.fontFamily.split(',')[0] : null
  return family ? `${labels.fontSummary}: ${family}` : ''
}

function orderByRecent(packs: DesignTemplatePack[], recentIds: string[]): DesignTemplatePack[] {
  const byId = new Map(packs.map(pack => [pack.id, pack]))
  return recentIds.map(id => byId.get(id)).filter((pack): pack is DesignTemplatePack => Boolean(pack))
}
