import { useMemo, useState } from 'react'
import type {
  AestheticProfile,
  ColorPalette,
  DomainTemplate,
} from '@dudesign/contracts'
import type { CapabilitiesResponse } from '@/lib/api'

type DirectionTab = 'scene' | 'visual' | 'advanced'

export type DesignDirectionValue = {
  domainTemplateId: string
  aestheticProfileId: string
  colorPaletteId: string
  brandStyleReferenceId: string
  styleNotes: string
  referenceBrand: string
  negativeRequirements: string
}

export function DesignDirectionPicker(props: {
  capabilities: CapabilitiesResponse | null
  value: DesignDirectionValue
  selectedLoopName?: string
  labels: {
    designDirection: string
    scene: string
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
  onChange: (next: Partial<DesignDirectionValue>) => void
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<DirectionTab>('scene')
  const [query, setQuery] = useState('')

  const selectedScene = props.capabilities?.domainTemplates.find(item => item.id === props.value.domainTemplateId)
  const selectedVisual = props.capabilities?.aestheticProfiles.find(item => item.id === props.value.aestheticProfileId)
  const availablePalettes = props.capabilities?.colorPalettes.filter(palette =>
    !selectedVisual || selectedVisual.colorPaletteIds.includes(palette.id)
  ) ?? []
  const selectedPalette = availablePalettes.find(item => item.id === props.value.colorPaletteId)
    ?? props.capabilities?.colorPalettes.find(item => item.id === props.value.colorPaletteId)
  const detail = selectedDetail(activeTab, selectedScene, selectedVisual, selectedPalette)

  const sceneOptions = useMemo(() => {
    return filterByQuery(props.capabilities?.domainTemplates ?? [], query, item => [
      item.name,
      item.category,
      item.description,
      ...item.structure.sections,
    ])
  }, [props.capabilities?.domainTemplates, query])

  const visualOptions = useMemo(() => {
    return filterByQuery(props.capabilities?.aestheticProfiles ?? [], query, item => [
      item.name,
      item.description,
      ...item.mood,
      ...item.occasion,
      ...item.tone,
      item.formality,
      item.density,
      ...item.bestFor,
      ...item.avoidFor,
      item.typographyTone,
      item.layoutTone,
      item.motionTone,
      ...item.negativeRules,
    ])
  }, [props.capabilities?.aestheticProfiles, query])

  const tabs: Array<{ id: DirectionTab; label: string; count: number }> = [
    { id: 'scene', label: props.labels.scene, count: props.capabilities?.domainTemplates.length ?? 0 },
    { id: 'visual', label: props.labels.visual, count: props.capabilities?.aestheticProfiles.length ?? 0 },
    { id: 'advanced', label: props.labels.advanced, count: availablePalettes.length },
  ]

  return (
    <div className="design-direction-picker" data-testid="design-direction-picker">
      <div className="direction-tabs" role="tablist" aria-label={props.labels.designDirection}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => {
              setActiveTab(tab.id)
              setQuery('')
            }}
          >
            <span>{tab.label}</span>
            <small>{tab.count}</small>
          </button>
        ))}
      </div>

      {activeTab !== 'advanced' ? (
        <label className="direction-search">
          <span>⌕</span>
          <input
            value={query}
            placeholder={props.labels.search}
            onChange={event => setQuery(event.target.value)}
            data-testid="design-direction-search"
          />
        </label>
      ) : null}

      <div className="direction-body">
        <div className="direction-list">
          {activeTab === 'scene' ? (
            <div className="direction-options" data-testid="scene-options">
              {sceneOptions.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className={template.id === props.value.domainTemplateId ? 'active' : ''}
                  onClick={() => props.onChange({ domainTemplateId: template.id })}
                >
                  <strong>{template.name}</strong>
                  <span>{template.category} · {template.description}</span>
                </button>
              ))}
            </div>
          ) : null}

          {activeTab === 'visual' ? (
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
                  <strong>{profile.name}</strong>
                  <span>{profile.mood.join(', ')} · {profile.density} density · {profile.formality}</span>
                  <small>{profile.bestFor.slice(0, 2).join(', ')}</small>
                </button>
              ))}
            </div>
          ) : null}

          {activeTab === 'advanced' ? (
            <div className="direction-advanced" data-testid="advanced-options">
              <section>
                <strong>{props.labels.palette}</strong>
                <div className="direction-palette-grid" data-testid="palette-options">
                  {availablePalettes.map(palette => (
                    <button
                      key={palette.id}
                      type="button"
                      className={palette.id === props.value.colorPaletteId ? 'active' : ''}
                      onClick={() => props.onChange({ colorPaletteId: palette.id })}
                    >
                      <span>{palette.name}</span>
                      <i aria-hidden>
                        {palette.colors.slice(0, 5).map(color => <b key={color} style={{ background: color }} />)}
                      </i>
                    </button>
                  ))}
                </div>
              </section>
              <label>
                <strong>{props.labels.styleNotes}</strong>
                <input
                  value={props.value.styleNotes}
                  onChange={event => props.onChange({ styleNotes: event.target.value })}
                  placeholder="more editorial, less card-heavy"
                  data-testid="style-notes-input"
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
                      <span>{reference.name}</span>
                    </button>
                  ))}
                </div>
                <input
                  value={props.value.referenceBrand}
                  onChange={event => props.onChange({ referenceBrand: event.target.value })}
                  placeholder="Apple-inspired, Stripe-like, Linear-like"
                  data-testid="reference-brand-input"
                />
              </label>
              <label>
                <strong>{props.labels.negativeRequirements}</strong>
                <textarea
                  value={props.value.negativeRequirements}
                  onChange={event => props.onChange({ negativeRequirements: event.target.value })}
                  placeholder="No dark background, no oversized gradients"
                  rows={3}
                  data-testid="negative-requirements-input"
                />
              </label>
            </div>
          ) : null}
        </div>

        <aside className="direction-detail">
          <span>{props.labels.designDirection}</span>
          <strong>{detail.title}</strong>
          <p>{detail.description}</p>
          <dl>
            {detail.items.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
            <div>
              <dt>{props.labels.loop}</dt>
              <dd>{props.selectedLoopName ?? props.labels.choose}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}

function filterByQuery<T>(items: T[], query: string, getText: (item: T) => string[]): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter(item => getText(item).join(' ').toLowerCase().includes(needle))
}

function selectedDetail(
  tab: DirectionTab,
  scene: DomainTemplate | undefined,
  visual: AestheticProfile | undefined,
  palette: ColorPalette | undefined,
): { title: string; description: string; items: Array<{ label: string; value: string }> } {
  if (tab === 'visual' && visual) {
    return {
      title: visual.name,
      description: visual.description,
      items: [
        { label: 'Typography', value: visual.typographyTone },
        { label: 'Layout', value: visual.layoutTone },
        { label: 'Motion', value: visual.motionTone },
        { label: 'Mood', value: visual.mood.join(', ') },
        { label: 'Density', value: `${visual.density} / ${visual.formality}` },
        { label: 'Best for', value: visual.bestFor.join(', ') },
        { label: 'Avoid for', value: visual.avoidFor.join(', ') },
        { label: 'Avoid', value: visual.negativeRules.join(' ') },
      ],
    }
  }
  if (tab === 'advanced' && palette) {
    return {
      title: palette.name,
      description: palette.accessibilityNotes.join(' '),
      items: Object.entries(palette.usage).map(([label, value]) => ({ label, value })),
    }
  }
  if (scene) {
    return {
      title: scene.name,
      description: scene.description,
      items: [
        { label: 'Sections', value: scene.structure.sections.join(', ') },
        { label: 'Required', value: scene.structure.requiredElements.join(', ') },
        { label: 'Constraints', value: scene.constraints.join(' ') },
      ],
    }
  }
  return {
    title: 'Choose a direction',
    description: 'Pick a scene, visual style, and optional advanced constraints.',
    items: [],
  }
}
