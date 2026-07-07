'use client'

import { useEffect, useState } from 'react'
import { getOAuthProviders, loginUser, registerUser, startOAuthLogin } from '@/lib/api'
import { Logo } from '@/components/Logo'
import { Icon } from '@/components/Icon'

type AuthMode = 'login' | 'register'
type OAuthProvider = 'google' | 'github'
type OAuthProviderState = Record<OAuthProvider, boolean>

const defaultOAuthProviders: OAuthProviderState = { google: false, github: false }

export default function LoginPage(): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [oauthProviders, setOAuthProviders] = useState<OAuthProviderState>(defaultOAuthProviders)
  const [oauthLoaded, setOAuthLoaded] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error')
    if (errorCode) setError(errorCode)
    void getOAuthProviders()
      .then(response => {
        setOAuthProviders({
          google: response.providers.some(provider => provider.provider === 'google' && provider.configured),
          github: response.providers.some(provider => provider.provider === 'github' && provider.configured),
        })
      })
      .catch(() => {
        setOAuthProviders(defaultOAuthProviders)
      })
      .finally(() => setOAuthLoaded(true))
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

  async function continueWithProvider(provider: OAuthProvider): Promise<void> {
    if (!oauthProviders[provider]) {
      setError(`${providerLabel(provider)} sign-in needs administrator configuration. Use email and password for now.`)
      return
    }
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
          <button type="button" onClick={() => void continueWithProvider('google')} disabled={status === 'submitting' || !oauthProviders.google} title={oauthButtonTitle('google', oauthProviders.google)}>
            <Icon name="sparkles" size={16} />
            Continue with Google
          </button>
          <button type="button" onClick={() => void continueWithProvider('github')} disabled={status === 'submitting' || !oauthProviders.github} title={oauthButtonTitle('github', oauthProviders.github)}>
            <Icon name="plug" size={16} />
            Continue with GitHub
          </button>
          {oauthLoaded && !oauthProviders.google && !oauthProviders.github ? (
            <p className="auth-oauth-note">OAuth sign-in is not configured yet. Continue with email and password.</p>
          ) : null}
        </div>

        <div className="auth-divider"><span>or</span></div>

        <form className="auth-form" data-testid="auth-form" onSubmit={event => void submit(event)}>
          {mode === 'register' ? (
            <label>
              Name
              <input data-testid="auth-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Ada Lovelace" />
            </label>
          ) : null}
          <label>
            Email
            <input data-testid="auth-email" value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required />
          </label>
          <label>
            Password
            <input data-testid="auth-password" value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="auth-submit" data-testid="auth-submit" type="submit" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button className="auth-switch" data-testid="auth-mode-toggle" data-ready={isHydrated ? 'true' : 'false'} type="button" onClick={() => {
          setMode(current => current === 'login' ? 'register' : 'login')
          setError(null)
        }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

function providerLabel(provider: OAuthProvider): string {
  return provider === 'google' ? 'Google' : 'GitHub'
}

function oauthButtonTitle(provider: OAuthProvider, configured: boolean): string {
  return configured ? `Continue with ${providerLabel(provider)}` : `${providerLabel(provider)} OAuth needs administrator configuration.`
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
