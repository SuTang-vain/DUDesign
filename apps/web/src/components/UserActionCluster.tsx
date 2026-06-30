'use client'

import { useEffect, useState } from 'react'

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
      <ActionButton
        label="Settings"
        active={openMenu === 'settings'}
        onClick={() => setOpenMenu(current => current === 'settings' ? null : 'settings')}
      >
        ⚙
      </ActionButton>
      <ActionButton
        label="More"
        active={openMenu === 'more'}
        onClick={() => setOpenMenu(current => current === 'more' ? null : 'more')}
      >
        ⋯
      </ActionButton>
      <button
        type="button"
        className="user-avatar-button"
        aria-label={`User profile for ${label}`}
        aria-expanded={openMenu === 'profile'}
        onClick={() => setOpenMenu(current => current === 'profile' ? null : 'profile')}
      >
        <span aria-hidden>{initials}</span>
      </button>

      {openMenu === 'settings' ? (
        <UserActionMenu title="Settings">
          <ReservedMenuItem title="Account" detail="Profile and sign-in settings" />
          <ReservedMenuItem title="Workspace" detail="Personal hosted workspace" />
          <ReservedMenuItem title="Model preferences" detail="Default model and generation defaults" />
        </UserActionMenu>
      ) : null}
      {openMenu === 'more' ? (
        <UserActionMenu title="More">
          <ReservedMenuItem title="Help" detail="Guides and product support" />
          <ReservedMenuItem title="Feedback" detail="Send a product note" />
          <ReservedMenuItem title="Keyboard shortcuts" detail="Reserved for editor shortcuts" />
          <ReservedMenuItem title="Sign out" detail="Reserved for auth milestone" />
        </UserActionMenu>
      ) : null}
      {openMenu === 'profile' ? (
        <UserActionMenu title="Profile">
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

function initialsForUser(user: UserActionIdentity): string {
  const source = user.name || user.email || 'DU'
  const parts = source
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}
