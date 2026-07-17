'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@/components/Icon'
import { TemplateLibraryPicker, type TemplateLibraryLabels } from '@/components/TemplateLibraryPicker'
import { useCapabilityI18n } from '@/lib/capabilityI18n'
import type {
  AestheticProfile,
  ColorPalette,
  DesignTemplatePack,
  CapabilityAuthoringDraft,
  DomainTemplate,
} from '@dudesign/contracts'
import type { CapabilitiesResponse } from '@/lib/api'

type VisualMode = 'pack' | 'custom'

export type DesignDirectionValue = {
  domainTemplateId: string
  aestheticProfileId: string
  colorPaletteId: string
  brandStyleReferenceId: string
  styleNotes: string
  referenceBrand: string
  negativeRequirements: string
}

export type DesignSystemLabels = {
  designSystem: string
  scene: string
  visualSystem: string
  applyTemplatePack: string
  customDirection: string
  packModeHint: string
  customModeHint: string
  visual: string
  advanced: string
  palette: string
  styleNotes: string
  referenceBrand: string
  negativeRequirements: string
  search: string
  choose: string
  loop: string
}

export function DesignSystemPicker(props: {
  capabilities: CapabilitiesResponse | null
  value: DesignDirectionValue
  selectedLoopName?: string
  labels: DesignSystemLabels
  templateLabels: TemplateLibraryLabels
  onChange: (next: Partial<DesignDirectionValue>) => void
  // 视觉模式(模板包 vs 自定义)
  visualMode: VisualMode
  onVisualModeChange: (mode: VisualMode) => void
  // 模板包(visualMode === 'pack')
  packs: DesignTemplatePack[]
  selectedTemplatePackIds: string[]
  autoDistribute: boolean
  favoriteTemplateIds: string[]
  recentTemplateIds: string[]
  variationCount: number
  importing: boolean
  importNotice: { kind: 'ok' | 'warn' | 'err'; text: string } | null
  authoringDrafts: CapabilityAuthoringDraft[]
  importedBundleDraft: CapabilityAuthoringDraft | null
  bundleBusy: boolean
  onTogglePackSelect: (id: string) => void
  onTogglePackFavorite: (id: string) => void
  onAutoDistributeChange: (value: boolean) => void
  onImportDesignMd: (designMd: string, name?: string) => void
  onImportBundle: (file: File) => void
  onConfirmBundle: (draft: CapabilityAuthoringDraft) => void
  onExportBundle: (input: {
    draftId: string
    licenseDeclaration: 'user_owned_or_authorized' | 'unspecified'
    licenseNotes: string | null
  }) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [sceneOpen, setSceneOpen] = useState(false)
  const c18n = useCapabilityI18n()

  const selectedScene = props.capabilities?.domainTemplates.find(item => item.id === props.value.domainTemplateId)
  const selectedVisual = props.capabilities?.aestheticProfiles.find(item => item.id === props.value.aestheticProfileId)
  const availablePalettes = props.capabilities?.colorPalettes.filter(palette =>
    !selectedVisual || selectedVisual.colorPaletteIds.includes(palette.id)
  ) ?? []
  const selectedPalette = availablePalettes.find(item => item.id === props.value.colorPaletteId)
    ?? props.capabilities?.colorPalettes.find(item => item.id === props.value.colorPaletteId)
  const sep = c18n.language === 'zh' ? '、' : ', '

  const sceneOptions = useMemo(() => filterByQuery(props.capabilities?.domainTemplates ?? [], query, item => [
    item.name, item.category, item.description, ...item.structure.sections,
  ]), [props.capabilities?.domainTemplates, query])

  const visualOptions = useMemo(() => filterByQuery(props.capabilities?.aestheticProfiles ?? [], query, item => [
    item.name, item.description, ...item.mood, ...item.occasion, ...item.tone, item.formality, item.density,
    ...item.bestFor, ...item.avoidFor, item.typographyTone, item.layoutTone, item.motionTone, ...item.negativeRules,
  ]), [props.capabilities?.aestheticProfiles, query])

  const sceneDetail = localizedSceneDetail(selectedScene, c18n, sep, props.labels)
  const visualDetail = localizedVisualDetail(selectedVisual, c18n, sep, props.labels)

  return (
    <div className="design-direction-picker design-system-picker" data-testid="design-direction-picker">
      <div className="ds-mode-header">
        <div>
          <strong>{props.visualMode === 'pack' ? props.labels.applyTemplatePack : props.labels.customDirection}</strong>
          <span>{props.visualMode === 'pack' ? props.labels.packModeHint : props.labels.customModeHint}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('')
            setSceneOpen(false)
            props.onVisualModeChange(props.visualMode === 'pack' ? 'custom' : 'pack')
          }}
        >
          {props.visualMode === 'pack' ? props.labels.customDirection : props.labels.applyTemplatePack}
        </button>
      </div>

      <div className="ds-visual">
        {props.visualMode === 'pack' ? (
          <div className="ds-pack-wrap">
            <TemplateLibraryPicker
              packs={props.packs}
              selectedIds={props.selectedTemplatePackIds}
              autoDistribute={props.autoDistribute}
              favoriteIds={new Set(props.favoriteTemplateIds)}
              recentIds={props.recentTemplateIds}
              variationCount={props.variationCount}
              importing={props.importing}
              importNotice={props.importNotice}
              authoringDrafts={props.authoringDrafts}
              importedBundleDraft={props.importedBundleDraft}
              bundleBusy={props.bundleBusy}
              labels={props.templateLabels}
              onToggleSelect={props.onTogglePackSelect}
              onToggleFavorite={props.onTogglePackFavorite}
              onAutoDistributeChange={props.onAutoDistributeChange}
              onImportDesignMd={props.onImportDesignMd}
              onImportBundle={props.onImportBundle}
              onConfirmBundle={props.onConfirmBundle}
              onExportBundle={props.onExportBundle}
            />
          </div>
        ) : (
          <>
            <label className="direction-search">
              <Icon name="search" size={15} />
              <input value={query} placeholder={props.labels.search} onChange={event => setQuery(event.target.value)} />
            </label>
            <div className="direction-body">
              <div className="direction-list">
                <div className="direction-options" data-testid="visual-options">
                  {visualOptions.map(profile => (
                    <button
                      key={profile.id}
                      type="button"
                      className={profile.id === props.value.aestheticProfileId ? 'active' : ''}
                      onClick={() => {
                        const nextPaletteId = profile.colorPaletteIds[0] ?? props.capabilities?.defaults.colorPaletteId ?? ''
                        props.onChange({ aestheticProfileId: profile.id, colorPaletteId: nextPaletteId })
                      }}
                    >
                      <strong>{c18n.aestheticName(profile.id, profile.name)}</strong>
                      <span>{c18n.phraseList(profile.mood).join(sep)} · {c18n.phrase(profile.density)} · {c18n.phrase(profile.formality)}</span>
                      <small>{c18n.phraseList(profile.bestFor.slice(0, 2)).join(sep)}</small>
                    </button>
                  ))}
                </div>

                <section className="direction-advanced" data-testid="advanced-options">
                  <div>
                    <strong>{props.labels.palette}</strong>
                    <div className="direction-palette-grid" data-testid="palette-options">
                      {availablePalettes.map(palette => (
                        <button
                          key={palette.id}
                          type="button"
                          className={palette.id === props.value.colorPaletteId ? 'active' : ''}
                          onClick={() => props.onChange({ colorPaletteId: palette.id })}
                        >
                          <span>{c18n.paletteName(palette.id, palette.name)}</span>
                          <i aria-hidden>
                            {palette.colors.slice(0, 5).map(color => <b key={color} style={{ background: color }} />)}
                          </i>
                        </button>
                      ))}
                    </div>
                  </div>
                  <label>
                    <strong>{props.labels.styleNotes}</strong>
                    <input
                      data-testid="style-notes-input"
                      value={props.value.styleNotes}
                      onChange={event => props.onChange({ styleNotes: event.target.value })}
                      placeholder="more editorial, less card-heavy"
                    />
                  </label>
                  <label>
                    <strong>{props.labels.referenceBrand}</strong>
                    <div className="direction-brand-grid" data-testid="brand-reference-options">
                      {(props.capabilities?.brandStyleReferences ?? []).map(reference => (
                        <button
                          key={reference.id}
                          type="button"
                          className={reference.id === props.value.brandStyleReferenceId ? 'active' : ''}
                          onClick={() => props.onChange({
                            brandStyleReferenceId: reference.id === props.value.brandStyleReferenceId ? '' : reference.id,
                            referenceBrand: reference.id === props.value.brandStyleReferenceId ? '' : reference.name,
                          })}
                        >
                          <span>{c18n.brandName(reference.id, reference.name)}</span>
                        </button>
                      ))}
                    </div>
                    <input
                      data-testid="reference-brand-input"
                      value={props.value.referenceBrand}
                      onChange={event => props.onChange({ referenceBrand: event.target.value })}
                      placeholder="Apple-inspired, Stripe-like, Linear-like"
                    />
                  </label>
                  <label>
                    <strong>{props.labels.negativeRequirements}</strong>
                    <textarea
                      data-testid="negative-requirements-input"
                      value={props.value.negativeRequirements}
                      onChange={event => props.onChange({ negativeRequirements: event.target.value })}
                      placeholder="No dark background, no oversized gradients"
                      rows={3}
                    />
                  </label>
                </section>
              </div>
              <aside className="direction-detail">
                <span>{props.labels.visual}</span>
                <strong>{visualDetail.title}</strong>
                <p>{visualDetail.description}</p>
                <dl>
                  {visualDetail.items.map(item => (
                    <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                  ))}
                  <div><dt>{props.labels.palette}</dt><dd>{selectedPalette ? c18n.paletteName(selectedPalette.id, selectedPalette.name) : props.labels.choose}</dd></div>
                </dl>
              </aside>
            </div>
          </>
        )}
      </div>

      <section className={`ds-scene-drawer${sceneOpen ? ' open' : ''}`}>
        <button
          type="button"
          className="ds-scene-toggle"
          aria-expanded={sceneOpen}
          onClick={() => {
            setQuery('')
            setSceneOpen(open => !open)
          }}
        >
          <span>{props.labels.scene}</span>
          <strong>{sceneDetail.title}</strong>
          <Icon name={sceneOpen ? 'chevronUp' : 'chevronDown'} size={15} />
        </button>
        {sceneOpen ? (
          <div className="ds-scene-panel">
            <label className="direction-search">
              <Icon name="search" size={15} />
              <input value={query} placeholder={props.labels.search} onChange={event => setQuery(event.target.value)} />
            </label>
            <div className="direction-body">
              <div className="direction-list">
                <div className="direction-options" data-testid="scene-options">
                  {sceneOptions.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      className={template.id === props.value.domainTemplateId ? 'active' : ''}
                      onClick={() => props.onChange({ domainTemplateId: template.id })}
                    >
                      <strong>{c18n.domainName(template.id, template.name)}</strong>
                      <span>{c18n.domainCategory(template.id, template.category)} · {c18n.domainDesc(template.id, template.description)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="direction-detail">
                <span>{props.labels.scene}</span>
                <strong>{sceneDetail.title}</strong>
                <p>{sceneDetail.description}</p>
                <dl>
                  {sceneDetail.items.map(item => (
                    <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                  ))}
                  <div><dt>{props.labels.loop}</dt><dd>{props.selectedLoopName ?? props.labels.choose}</dd></div>
                </dl>
              </aside>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function filterByQuery<T>(items: T[], query: string, getText: (item: T) => string[]): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter(item => getText(item).join(' ').toLowerCase().includes(needle))
}

type CapabilityI18n = ReturnType<typeof useCapabilityI18n>
type Detail = { title: string; description: string; items: Array<{ label: string; value: string }> }

function localizedSceneDetail(
  scene: DomainTemplate | undefined,
  c18n: CapabilityI18n,
  sep: string,
  labels: { scene: string; choose: string },
): Detail {
  if (scene) {
    return {
      title: c18n.domainName(scene.id, scene.name),
      description: c18n.domainDesc(scene.id, scene.description),
      items: [
        { label: c18n.phrase('Sections'), value: c18n.phraseList(scene.structure.sections).join(sep) },
        { label: c18n.phrase('Required'), value: c18n.phraseList(scene.structure.requiredElements).join(sep) },
        { label: c18n.phrase('Constraints'), value: scene.constraints.join(sep) },
      ],
    }
  }
  return { title: labels.scene, description: labels.choose, items: [] }
}

function localizedVisualDetail(
  visual: AestheticProfile | undefined,
  c18n: CapabilityI18n,
  sep: string,
  labels: { visual: string; choose: string },
): Detail {
  if (visual) {
    return {
      title: c18n.aestheticName(visual.id, visual.name),
      description: c18n.aestheticDesc(visual.id, visual.description),
      items: [
        { label: c18n.phrase('Typography'), value: c18n.aestheticField(visual.id, 'typo', visual.typographyTone) },
        { label: c18n.phrase('Layout'), value: c18n.aestheticField(visual.id, 'layout', visual.layoutTone) },
        { label: c18n.phrase('Motion'), value: c18n.aestheticField(visual.id, 'motion', visual.motionTone) },
        { label: c18n.phrase('Mood'), value: c18n.phraseList(visual.mood).join(sep) },
        { label: c18n.phrase('Density'), value: `${c18n.phrase(visual.density)} / ${c18n.phrase(visual.formality)}` },
      ],
    }
  }
  return { title: labels.visual, description: labels.choose, items: [] }
}
