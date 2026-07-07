import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  assertOAuthState,
  createOAuthAuthorizationUrl,
  createOAuthStateCookie,
  exchangeOAuthCodeForProfile,
  oauthConfig,
  oauthIdentityProvider,
} from './oauth.js'

describe('OAuth helpers', () => {
  const previousEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...previousEnv }
  })

  it('builds Google authorization URLs with OIDC scopes and state cookies', () => {
    process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_ID = 'google-client'
    process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_SECRET = 'google-secret'
    process.env.DUDESIGN_OAUTH_GOOGLE_REDIRECT_URI = 'https://app.example.com/api/auth/oauth/google/callback'

    const config = oauthConfig('google')
    const authorization = createOAuthAuthorizationUrl(config, 'state_google')
    const url = new URL(authorization.authorizationUrl)

    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
    assert.equal(url.searchParams.get('client_id'), 'google-client')
    assert.equal(url.searchParams.get('scope'), 'openid email profile')
    assert.equal(url.searchParams.get('state'), 'state_google')
    assert.equal(oauthIdentityProvider('google'), 'oauth_google')

    const cookie = createOAuthStateCookie('google', authorization.state, { secure: false })
    assert.match(cookie, /dudesign_oauth_state=google\.state_google/)
    assert.match(cookie, /HttpOnly/)
    assert.doesNotThrow(() => assertOAuthState({ cookie }, 'google', 'state_google'))
    assert.throws(() => assertOAuthState({ cookie }, 'github', 'state_google'), /OAuth state is invalid/)
  })

  it('normalizes Google userinfo into a verified OAuth profile', async () => {
    const config = {
      provider: 'google' as const,
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/callback',
      scopes: ['openid', 'email', 'profile'],
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    }
    const calls: string[] = []
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input)
      calls.push(url)
      if (url === config.tokenUrl) {
        return jsonResponse({ access_token: 'access_google' })
      }
      return jsonResponse({
        sub: 'google-user-123',
        email: 'designer@example.com',
        email_verified: true,
        name: 'Designer',
        picture: 'https://example.com/avatar.png',
      })
    }

    const profile = await exchangeOAuthCodeForProfile(config, 'code_google', fetchImpl as typeof fetch)

    assert.deepEqual(calls, [config.tokenUrl, config.userInfoUrl])
    assert.equal(profile.provider, 'google')
    assert.equal(profile.providerSubject, 'google-user-123')
    assert.equal(profile.email, 'designer@example.com')
    assert.equal(profile.emailVerified, true)
    assert.equal(profile.name, 'Designer')
  })

  it('fetches a verified primary GitHub email when the user profile email is private', async () => {
    const config = {
      provider: 'github' as const,
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/callback',
      scopes: ['read:user', 'user:email'],
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
    }
    const fetchImpl = async (input: URL | RequestInfo) => {
      const url = String(input)
      if (url === config.tokenUrl) {
        return jsonResponse({ access_token: 'access_github' })
      }
      if (url === config.userInfoUrl) {
        return jsonResponse({
          id: 42,
          login: 'designer',
          name: null,
          avatar_url: 'https://github.example/avatar.png',
          email: null,
        })
      }
      return jsonResponse([
        { email: 'private@example.com', primary: true, verified: true },
      ])
    }

    const profile = await exchangeOAuthCodeForProfile(config, 'code_github', fetchImpl as typeof fetch)

    assert.equal(oauthIdentityProvider('github'), 'oauth_github')
    assert.equal(profile.provider, 'github')
    assert.equal(profile.providerSubject, '42')
    assert.equal(profile.email, 'private@example.com')
    assert.equal(profile.emailVerified, true)
    assert.equal(profile.name, 'designer')
  })
})

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}
