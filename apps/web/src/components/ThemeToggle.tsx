'use client'

import { useEffect, useState } from 'react'
import { Icon } from './Icon'

export type Theme = 'light' | 'dark'

const themeStorageKey = 'dudesign.theme'

function readStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(themeStorageKey)
    if (raw === 'light' || raw === 'dark') return raw
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    // ignore
  }
  return null
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/**
 * Light/Dark 主题切换按钮。
 * - 无 data-theme 时走 :root(默认 Light)
 * - 切换写入 documentElement[data-theme] 并持久化到 localStorage
 * - Light 显示月亮(点击转 Dark),Dark 显示太阳(点击转 Light)
 */
export function ThemeToggle(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = readStoredTheme()
    const initial: Theme = stored ?? (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
    setTheme(initial)
    if (initial === 'dark') applyTheme('dark')
    setMounted(true)
  }, [])

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (next === 'dark') {
      applyTheme('dark')
    } else {
      // 回到默认 Light:移除属性,走 :root
      document.documentElement.removeAttribute('data-theme')
    }
    try {
      window.localStorage.setItem(themeStorageKey, next)
    } catch {
      // best effort
    }
  }

  // 未挂载前用占位,避免 hydration 闪烁
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button
      type="button"
      className="user-action-button"
      aria-label={label}
      title={label}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      // mounted 前 render moon(light 占位),保持尺寸稳定
    >
      <span aria-hidden>{mounted ? <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> : <Icon name="moon" size={16} />}</span>
    </button>
  )
}
