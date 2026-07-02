'use client'

import { useState } from 'react'
import type { UserCapabilityPreference } from '@dudesign/contracts'
import { Icon } from '@/components/Icon'

export type PreferenceOption = { id: string; label: string }

export type PreferencesPanelLabels = {
  myPreferences: string
  defaultTemplate: string
  defaultSkill: string
  defaultLoop: string
  advancedConstraints: string
  styleNotes: string
  referenceBrand: string
  negativeRequirements: string
  palette: string
  save: string
  saved: string
  none: string
}

export function PreferencesPanel(props: {
  preference: UserCapabilityPreference
  templateOptions: PreferenceOption[]
  skillOptions: PreferenceOption[]
  loopOptions: PreferenceOption[]
  paletteOptions: PreferenceOption[]
  labels: PreferencesPanelLabels
  saving: boolean
  onSave: (next: Partial<UserCapabilityPreference>) => void
  onClose: () => void
}): React.JSX.Element {
  const advanced = props.preference.advancedConstraints
  const [designTemplatePackId, setDesignTemplatePackId] = useState<string>(props.preference.designTemplatePackId ?? '')
  const [skillId, setSkillId] = useState<string>(props.preference.skillId ?? '')
  const [loopProfileId, setLoopProfileId] = useState<string>(props.preference.loopProfileId ?? '')
  const [colorPaletteId, setColorPaletteId] = useState<string>(advanced?.colorPaletteId ?? '')
  const [styleNotesText, setStyleNotesText] = useState<string>((advanced?.styleNotes ?? []).join(', '))
  const [referenceBrand, setReferenceBrand] = useState<string>(advanced?.referenceBrand ?? '')
  const [negativeRequirementsText, setNegativeRequirementsText] = useState<string>((advanced?.negativeRequirements ?? []).join('\n'))

  function handleSave(): void {
    props.onSave({
      designTemplatePackId: designTemplatePackId || null,
      skillId: skillId || null,
      loopProfileId: loopProfileId || null,
      advancedConstraints: {
        colorPaletteId: colorPaletteId || null,
        styleNotes: styleNotesText.split(/[,\n]/).map(item => item.trim()).filter(Boolean),
        brandStyleReferenceId: advanced?.brandStyleReferenceId ?? null,
        referenceBrand: referenceBrand.trim() || null,
        negativeRequirements: negativeRequirementsText.split(/\n/).map(item => item.trim()).filter(Boolean),
      },
    })
  }

  return (
    <div className="preferences-panel" data-testid="preferences-panel">
      <header>
        <strong>{props.labels.myPreferences}</strong>
        <button type="button" className="preferences-close" aria-label={props.labels.myPreferences} onClick={props.onClose}>
          <Icon name="plus" size={16} />
        </button>
      </header>

      <label className="pref-field">
        <span>{props.labels.defaultTemplate}</span>
        <select data-testid="preference-default-template" value={designTemplatePackId} onChange={event => setDesignTemplatePackId(event.target.value)}>
          <option value="">{props.labels.none}</option>
          {props.templateOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="pref-field">
        <span>{props.labels.defaultSkill}</span>
        <select data-testid="preference-default-skill" value={skillId} onChange={event => setSkillId(event.target.value)}>
          <option value="">{props.labels.none}</option>
          {props.skillOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="pref-field">
        <span>{props.labels.defaultLoop}</span>
        <select data-testid="preference-default-loop" value={loopProfileId} onChange={event => setLoopProfileId(event.target.value)}>
          <option value="">{props.labels.none}</option>
          {props.loopOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <div className="pref-divider">{props.labels.advancedConstraints}</div>

      <label className="pref-field">
        <span>{props.labels.palette}</span>
        <select data-testid="preference-advanced-constraints" value={colorPaletteId} onChange={event => setColorPaletteId(event.target.value)}>
          <option value="">{props.labels.none}</option>
          {props.paletteOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="pref-field">
        <span>{props.labels.styleNotes}</span>
        <textarea rows={2} value={styleNotesText} onChange={event => setStyleNotesText(event.target.value)} />
      </label>

      <label className="pref-field">
        <span>{props.labels.referenceBrand}</span>
        <input value={referenceBrand} onChange={event => setReferenceBrand(event.target.value)} />
      </label>

      <label className="pref-field">
        <span>{props.labels.negativeRequirements}</span>
        <textarea rows={3} value={negativeRequirementsText} onChange={event => setNegativeRequirementsText(event.target.value)} />
      </label>

      <div className="pref-actions">
        <button type="button" className="btn primary" data-testid="save-preferences-button" disabled={props.saving} onClick={handleSave}>
          {props.saving ? props.labels.saved : props.labels.save}
        </button>
      </div>
    </div>
  )
}
