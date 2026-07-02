'use client'

import { useEffect, useState } from 'react'
import { useLanguage, type AppLanguage } from './LanguageProvider'
import { Icon } from './Icon'
import { ThemeToggle } from './ThemeToggle'

export type UserActionIdentity = {
  name?: string | null
  email?: string | null
}

type OpenUserMenu = 'settings' | 'more' | 'profile' | null

const fallbackUser: UserActionIdentity = {
  name: 'DUDesign User',
  email: 'dev@dudesign.local',
}

export function UserActionCluster(props: { user?: UserActionIdentity | null }): React.JSX.Element {
  const user = props.user ?? fallbackUser
  const [openMenu, setOpenMenu] = useState<OpenUserMenu>(null)
  const { language, setLanguage, t } = useLanguage()
  const label = user.name || user.email || 'DUDesign User'
  const initials = initialsForUser(user)

  useEffect(() => {
    function closeOnOutside(event: PointerEvent): void {
      const target = event.target
      if (target instanceof Element && target.closest('[data-user-actions="true"]')) return
      setOpenMenu(null)
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <div className="user-action-cluster" data-user-actions="true" data-testid="user-action-cluster">
      <ThemeToggle />
      <ActionButton
        label={t('settings')}
        active={openMenu === 'settings'}
        onClick={() => setOpenMenu(current => current === 'settings' ? null : 'settings')}
      >
        <Icon name="sliders" size={16} />
      </ActionButton>
      <ActionButton
        label={t('more')}
        active={openMenu === 'more'}
        onClick={() => setOpenMenu(current => current === 'more' ? null : 'more')}
      >
        <Icon name="moreHorizontal" size={18} />
      </ActionButton>
      <button
        type="button"
        className="user-avatar-button"
        aria-label={`${t('userProfileFor')} ${label}`}
        aria-expanded={openMenu === 'profile'}
        onClick={() => setOpenMenu(current => current === 'profile' ? null : 'profile')}
      >
        <span aria-hidden>{initials}</span>
      </button>

      {openMenu === 'settings' ? (
        <UserActionMenu title={t('settings')}>
          <LanguageSwitcher
            language={language}
            label={t('language')}
            englishLabel={t('english')}
            chineseLabel={t('chinese')}
            setLanguage={setLanguage}
          />
          <ReservedMenuItem title={t('account')} detail={t('accountDetail')} />
          <ReservedMenuItem title={t('workspace')} detail={t('workspaceDetail')} />
          <ReservedMenuItem title={t('modelPreferences')} detail={t('modelPreferencesDetail')} />
        </UserActionMenu>
      ) : null}
      {openMenu === 'more' ? (
        <UserActionMenu title={t('more')}>
          <ReservedMenuItem title={t('help')} detail={t('helpDetail')} />
          <ReservedMenuItem title={t('feedback')} detail={t('feedbackDetail')} />
          <ReservedMenuItem title={t('keyboardShortcuts')} detail={t('keyboardShortcutsDetail')} />
          <ReservedMenuItem title={t('signOut')} detail={t('signOutDetail')} />
        </UserActionMenu>
      ) : null}
      {openMenu === 'profile' ? (
        <UserActionMenu title={t('profile')}>
          <div className="user-profile-card">
            <span>{initials}</span>
            <strong>{label}</strong>
            {user.email ? <small>{user.email}</small> : null}
          </div>
        </UserActionMenu>
      ) : null}
    </div>
  )
}

function ActionButton(props: {
  label: string
  active: boolean
  children: React.ReactNode
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`user-action-button${props.active ? ' active' : ''}`}
      aria-label={props.label}
      aria-expanded={props.active}
      onClick={props.onClick}
    >
      <span aria-hidden>{props.children}</span>
    </button>
  )
}

function UserActionMenu(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="user-action-menu" data-testid="user-action-menu">
      <strong>{props.title}</strong>
      {props.children}
    </div>
  )
}

function ReservedMenuItem(props: { title: string; detail: string }): React.JSX.Element {
  return (
    <button type="button" disabled>
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
    <div className="language-switcher" data-testid="language-switcher">
      <span>{props.label}</span>
      <div className="language-options" role="group" aria-label={props.label}>
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

function initialsForUser(user: UserActionIdentity): string {
  const source = user.name || user.email || 'DU'
  const parts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}
