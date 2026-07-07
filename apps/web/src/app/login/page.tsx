'use client'

import { useEffect, useState } from 'react'
import { loginUser, registerUser, startOAuthLogin } from '@/lib/api'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'

type AuthMode = 'login' | 'register'

export default function LoginPage(): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error')
    if (errorCode) setError(errorCode)
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setStatus('submitting')
    setError(null)
    try {
      if (mode === 'login') {
        await loginUser({ email, password })
      } else {
        await registerUser({ email, password, name: name.trim() || null })
      }
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setStatus('idle')
    }
  }

  async function continueWithProvider(provider: 'google' | 'github'): Promise<void> {
    setStatus('submitting')
    setError(null)
    try {
      const response = await startOAuthLogin(provider)
      window.location.href = withOAuthRedirect(response.authorizationUrl, '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : `${provider} sign-in is unavailable.`)
      setStatus('idle')
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark"><Logo size={34} /></span>
          <div>
            <strong>DUDesign</strong>
            <span>Hosted design workspace</span>
          </div>
        </div>

        <div className="auth-heading">
          <h1>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
          <p>{mode === 'login'
            ? 'Sign in to continue your design sessions.'
            : 'Start with a private account and hosted workspace.'}</p>
        </div>

        <div className="auth-oauth">
          <button type="button" onClick={() => void continueWithProvider('google')} disabled={status === 'submitting'}>
            <Icon name="sparkles" size={16} />
            Continue with Google
          </button>
          <button type="button" onClick={() => void continueWithProvider('github')} disabled={status === 'submitting'}>
            <Icon name="plug" size={16} />
            Continue with GitHub
          </button>
        </div>

        <div className="auth-divider"><span>or</span></div>

        <form className="auth-form" onSubmit={event => void submit(event)}>
          {mode === 'register' ? (
            <label>
              Name
              <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Ada Lovelace" />
            </label>
          ) : null}
          <label>
            Email
            <input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button className="auth-switch" type="button" onClick={() => {
          setMode(current => current === 'login' ? 'register' : 'login')
          setError(null)
        }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

function withOAuthRedirect(authorizationUrl: string, redirectTo: string): string {
  const url = new URL(authorizationUrl)
  const redirectUri = url.searchParams.get('redirect_uri')
  if (!redirectUri) return authorizationUrl
  const callbackUrl = new URL(redirectUri)
  callbackUrl.searchParams.set('redirectTo', redirectTo)
  url.searchParams.set('redirect_uri', callbackUrl.toString())
  return url.toString()
}
