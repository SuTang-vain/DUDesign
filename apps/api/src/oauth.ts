import type { IncomingHttpHeaders } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { AUTH_COOKIE_NAME } from './auth.js'

export type OAuthProvider = 'google' | 'github'

export type OAuthProviderConfig = {
  provider: OAuthProvider
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
}

export type OAuthProfile = {
  provider: OAuthProvider
  providerSubject: string
  email: string
  emailVerified: boolean
  name: string | null
  avatarUrl: string | null
}

export const OAUTH_STATE_COOKIE_NAME = 'dudesign_oauth_state'

export function oauthProviderFromPath(value: string): OAuthProvider | null {
  return value === 'google' || value === 'github' ? value : null
}

export function oauthIdentityProvider(provider: OAuthProvider): 'oauth_google' | 'oauth_github' {
  return provider === 'google' ? 'oauth_google' : 'oauth_github'
}

export function oauthConfig(provider: OAuthProvider, env: NodeJS.ProcessEnv = process.env): OAuthProviderConfig {
  const prefix = provider === 'google' ? 'GOOGLE' : 'GITHUB'
  const clientId = env[`DUDESIGN_OAUTH_${prefix}_CLIENT_ID`]?.trim()
  const clientSecret = env[`DUDESIGN_OAUTH_${prefix}_CLIENT_SECRET`]?.trim()
  const redirectUri = env[`DUDESIGN_OAUTH_${prefix}_REDIRECT_URI`]?.trim()
  if (!clientId || !clientSecret || !redirectUri) {
    throw oauthError('OAUTH_PROVIDER_NOT_CONFIGURED', `${provider} OAuth is not configured.`, 503)
  }
  return provider === 'google'
    ? {
        provider,
        clientId,
        clientSecret,
        redirectUri,
        scopes: ['openid', 'email', 'profile'],
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      }
    : {
        provider,
        clientId,
        clientSecret,
        redirectUri,
        scopes: ['read:user', 'user:email'],
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
      }
}

export function createOAuthStateCookie(provider: OAuthProvider, state: string, options: { maxAgeSeconds?: number; secure?: boolean } = {}): string {
  const maxAgeSeconds = options.maxAgeSeconds ?? 10 * 60
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=${provider}.${state}`,
    'Path=/api/auth/oauth/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ]
  if (options.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function clearOAuthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE_NAME}=; Path=/api/auth/oauth/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function createOAuthAuthorizationUrl(config: OAuthProviderConfig, state = createOAuthState()): { state: string; authorizationUrl: string } {
  const url = new URL(config.authorizationUrl)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', state)
  if (config.provider === 'google') {
    url.searchParams.set('access_type', 'online')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'select_account')
  }
  return { state, authorizationUrl: url.toString() }
}

export function assertOAuthState(headers: IncomingHttpHeaders, provider: OAuthProvider, state: string | null): void {
  const expected = cookieValue(headers.cookie, OAUTH_STATE_COOKIE_NAME)
  if (!state || !expected) throw oauthError('OAUTH_STATE_INVALID', 'OAuth state is missing or expired.', 400)
  const [storedProvider, storedState] = expected.split('.', 2)
  if (storedProvider !== provider || !storedState || !timingSafeStringEqual(storedState, state)) {
    throw oauthError('OAUTH_STATE_INVALID', 'OAuth state is invalid.', 400)
  }
}

export async function exchangeOAuthCodeForProfile(
  config: OAuthProviderConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthProfile> {
  if (!code) throw oauthError('OAUTH_CODE_MISSING', 'OAuth code is required.', 400)
  const token = await exchangeCodeForToken(config, code, fetchImpl)
  return config.provider === 'google'
    ? fetchGoogleProfile(config, token, fetchImpl)
    : fetchGitHubProfile(config, token, fetchImpl)
}

function createOAuthState(): string {
  return randomBytes(32).toString('base64url')
}

async function exchangeCodeForToken(config: OAuthProviderConfig, code: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(config.tokenUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const body = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string }
  if (!response.ok || !body.access_token) {
    throw oauthError('OAUTH_TOKEN_EXCHANGE_FAILED', body.error_description ?? body.error ?? 'OAuth token exchange failed.', 502)
  }
  return body.access_token
}

async function fetchGoogleProfile(config: OAuthProviderConfig, accessToken: string, fetchImpl: typeof fetch): Promise<OAuthProfile> {
  const response = await fetchImpl(config.userInfoUrl, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
  })
  const body = await response.json().catch(() => ({})) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
  }
  if (!response.ok || !body.sub || !body.email) {
    throw oauthError('OAUTH_PROFILE_UNAVAILABLE', 'Google profile is unavailable.', 502)
  }
  return {
    provider: config.provider,
    providerSubject: body.sub,
    email: body.email,
    emailVerified: body.email_verified === true,
    name: body.name ?? null,
    avatarUrl: body.picture ?? null,
  }
}

async function fetchGitHubProfile(config: OAuthProviderConfig, accessToken: string, fetchImpl: typeof fetch): Promise<OAuthProfile> {
  const userResponse = await fetchImpl(config.userInfoUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'DUDesign OAuth',
    },
  })
  const user = await userResponse.json().catch(() => ({})) as {
    id?: number | string
    login?: string
    name?: string | null
    avatar_url?: string | null
    email?: string | null
  }
  if (!userResponse.ok || user.id === undefined || user.id === null) {
    throw oauthError('OAUTH_PROFILE_UNAVAILABLE', 'GitHub profile is unavailable.', 502)
  }
  const email = user.email ? { email: user.email, verified: true } : await fetchPrimaryGitHubEmail(accessToken, fetchImpl)
  if (!email?.email) {
    throw oauthError('OAUTH_EMAIL_UNAVAILABLE', 'GitHub did not return a usable verified email.', 400)
  }
  return {
    provider: config.provider,
    providerSubject: String(user.id),
    email: email.email,
    emailVerified: email.verified,
    name: user.name ?? user.login ?? null,
    avatarUrl: user.avatar_url ?? null,
  }
}

async function fetchPrimaryGitHubEmail(accessToken: string, fetchImpl: typeof fetch): Promise<{ email: string; verified: boolean } | null> {
  const response = await fetchImpl('https://api.github.com/user/emails', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'DUDesign OAuth',
    },
  })
  const emails = await response.json().catch(() => []) as Array<{ email?: string; primary?: boolean; verified?: boolean; visibility?: string | null }>
  if (!response.ok || !Array.isArray(emails)) return null
  const primaryVerified = emails.find(item => item.primary && item.verified && item.email)
  const anyVerified = emails.find(item => item.verified && item.email)
  const selected = primaryVerified ?? anyVerified
  return selected?.email ? { email: selected.email, verified: selected.verified === true } : null
}

function cookieValue(cookieHeader: string | string[] | undefined, name: string): string | null {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : cookieHeader
  if (!raw) return null
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=') || null
  }
  return null
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftHash = createHash('sha256').update(left).digest()
  const rightHash = createHash('sha256').update(right).digest()
  return leftHash.equals(rightHash)
}

function oauthError(code: string, message: string, status = 400): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
