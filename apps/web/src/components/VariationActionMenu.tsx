'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useLanguage, type AppLanguage } from './LanguageProvider'
import { ThemeToggle } from './ThemeToggle'

type MenuSection = 'settings' | 'more' | null

export function VariationActionMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<MenuSection>(null)
  const { language, setLanguage, t } = useLanguage()

  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Element && target.closest('[data-variation-action-menu="true"]')) return
      setOpen(false)
      setSection(null)
    }
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
        setSection(null)
      }
    }
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggleSection(next: MenuSection): void {
    setSection(current => current === next ? null : next)
  }

  return (
    <div className="variation-action-menu" data-variation-action-menu="true" data-testid="variation-action-menu">
      <button
        type="button"
        className="variation-action-trigger"
        aria-label={t('projectMenu')}
        aria-expanded={open}
        onClick={() => {
          setOpen(current => !current)
          setSection(null)
        }}
      >
        <Icon name="moreHorizontal" size={18} />
      </button>

      {open ? (
        <div className="variation-action-dropdown" data-testid="variation-action-dropdown">
          <a href="/" className="variation-action-item">
            <Icon name="arrowLeft" size={15} />
            <span>{t('backToWorkspace')}</span>
          </a>
          <MenuButton icon="moon" label={t('theme')} action={<ThemeToggle />} />
          <button type="button" className="variation-action-item" onClick={() => toggleSection('settings')} aria-expanded={section === 'settings'}>
            <Icon name="sliders" size={15} />
            <span>{t('settings')}</span>
            <Icon name={section === 'settings' ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
          {section === 'settings' ? (
            <div className="variation-action-submenu">
              <LanguageSwitcher language={language} setLanguage={setLanguage} label={t('language')} englishLabel={t('english')} chineseLabel={t('chinese')} />
              <ReservedMenuItem title={t('account')} detail={t('accountDetail')} />
              <ReservedMenuItem title={t('workspace')} detail={t('workspaceDetail')} />
              <ReservedMenuItem title={t('modelPreferences')} detail={t('modelPreferencesDetail')} />
            </div>
          ) : null}

          <div className="variation-action-divider" />

          <button type="button" className="variation-action-item" onClick={() => toggleSection('more')} aria-expanded={section === 'more'}>
            <Icon name="moreHorizontal" size={15} />
            <span>{t('more')}</span>
            <Icon name={section === 'more' ? 'chevronUp' : 'chevronDown'} size={13} />
          </button>
          {section === 'more' ? (
            <div className="variation-action-submenu">
              <ReservedMenuItem title={t('help')} detail={t('helpDetail')} />
              <ReservedMenuItem title={t('feedback')} detail={t('feedbackDetail')} />
              <ReservedMenuItem title={t('keyboardShortcuts')} detail={t('keyboardShortcutsDetail')} />
            </div>
          ) : null}
          <ReservedMenuItem title={t('signOut')} detail={t('signOutDetail')} icon="external" danger />
        </div>
      ) : null}
    </div>
  )
}

function MenuButton(props: { icon: 'moon'; label: string; action: React.ReactNode }): React.JSX.Element {
  return (
    <div className="variation-action-item static">
      <Icon name={props.icon} size={15} />
      <span>{props.label}</span>
      {props.action}
    </div>
  )
}

function ReservedMenuItem(props: { title: string; detail: string; icon?: 'external'; danger?: boolean }): React.JSX.Element {
  return (
    <button type="button" className={`variation-action-reserved${props.icon ? '' : ' no-icon'}${props.danger ? ' danger' : ''}`} disabled>
      {props.icon ? <Icon name={props.icon} size={14} /> : null}
      <span>{props.title}</span>
      <small>{props.detail}</small>
    </button>
  )
}

function LanguageSwitcher(props: {
  language: AppLanguage
  label: string
  englishLabel: string
  chineseLabel: string
  setLanguage: (language: AppLanguage) => void
}): React.JSX.Element {
  return (
    <div className="variation-language-switcher">
      <span>{props.label}</span>
      <div role="group" aria-label={props.label}>
        <button
          type="button"
          className={props.language === 'en' ? 'active' : ''}
          aria-pressed={props.language === 'en'}
          onClick={() => props.setLanguage('en')}
        >
          {props.englishLabel}
        </button>
        <button
          type="button"
          className={props.language === 'zh' ? 'active' : ''}
          aria-pressed={props.language === 'zh'}
          onClick={() => props.setLanguage('zh')}
        >
          {props.chineseLabel}
        </button>
      </div>
    </div>
  )
}
