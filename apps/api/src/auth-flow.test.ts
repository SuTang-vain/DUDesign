import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { AuthUserResponse, CreateSessionResponse, LogoutResponse, OAuthProvidersResponse } from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('session cookie authentication flow', () => {
  let harness: ApiFlowHarness | null = null
  let previousAuthMode: string | undefined
  const previousEnv = { ...process.env }
  const originalFetch = globalThis.fetch

  afterEach(async () => {
    if (previousAuthMode === undefined) delete process.env.DUDESIGN_AUTH_MODE
    else process.env.DUDESIGN_AUTH_MODE = previousAuthMode
    process.env = { ...previousEnv }
    globalThis.fetch = originalFetch
    await harness?.close()
    harness = null
  })

  it('registers, authenticates private API requests, logs out, and ignores dev headers in session mode', async () => {
    previousAuthMode = process.env.DUDESIGN_AUTH_MODE
    process.env.DUDESIGN_AUTH_MODE = 'session'
    harness = await startApiFlowHarness(new ApplicationService())

    const blockedBootstrap = await fetch(`${harness.baseUrl}/api/dev/bootstrap`, {
      headers: { 'x-dudesign-user-id': 'usr_dev' },
    })
    assert.equal(blockedBootstrap.status, 401)

    const registered = await postJson<AuthUserResponse>('/api/auth/register', {
      email: 'product@example.com',
      password: 'correct-horse-battery',
      name: 'Product Owner',
    }, 201)
    assert.equal(registered.user.email, 'product@example.com')
    assert.ok(registered.workspace.id.startsWith('ws_'))
    assert.ok(registered.models.models.length > 0)
    assert.ok(registered.models.defaultModelId)
    const sessionCookie = lastSetCookie()
    assert.match(sessionCookie, /dudesign_session=/)
    assert.match(sessionCookie, /HttpOnly/)
    assert.match(sessionCookie, /SameSite=Lax/)

    const me = await getJson<AuthUserResponse>('/api/auth/me', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(me.user.id, registered.user.id)
    assert.equal(me.workspace.id, registered.workspace.id)
    assert.deepEqual(me.models, registered.models)

    const session = await postJson<CreateSessionResponse>('/api/sessions', {
      workspaceId: registered.workspace.id,
      mode: 'new_html',
      title: 'Cookie authenticated session',
    }, 201, {
      headers: { cookie: sessionCookie },
    })
    const storedSession = await harness.service.store.getSessionById(session.session.id)
    assert.equal(storedSession?.userId, registered.user.id)

    const logout = await postJson<LogoutResponse>('/api/auth/logout', {}, 200, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(logout.ok, true)
    assert.match(lastSetCookie(), /Max-Age=0/)

    const revokedMe = await fetch(`${harness.baseUrl}/api/auth/me`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(revokedMe.status, 401)

    const loggedIn = await postJson<AuthUserResponse>('/api/auth/login', {
      email: 'product@example.com',
      password: 'correct-horse-battery',
    })
    assert.equal(loggedIn.user.id, registered.user.id)
    assert.deepEqual(loggedIn.models, registered.models)
    assert.match(lastSetCookie(), /dudesign_session=/)
  })

  it('resolves admin role from the authenticated user metadata and ignores spoofed admin headers in session mode', async () => {
    previousAuthMode = process.env.DUDESIGN_AUTH_MODE
    process.env.DUDESIGN_AUTH_MODE = 'session'
    harness = await startApiFlowHarness(new ApplicationService())

    const registered = await postJson<AuthUserResponse>('/api/auth/register', {
      email: 'operator@example.com',
      password: 'correct-horse-battery',
      name: 'Operator',
    }, 201)
    const sessionCookie = lastSetCookie()

    const spoofedAdmin = await fetch(`${harness.baseUrl}/api/admin/runtime/health`, {
      headers: {
        cookie: sessionCookie,
        'x-dudesign-admin-role': 'developer',
      },
    })
    assert.equal(spoofedAdmin.status, 403)

    const updated = await harness.service.store.updateUserMetadata(registered.user.id, {
      ...registered.user.metadata,
      adminRole: 'operator',
    })
    assert.equal(updated?.metadata.adminRole, 'operator')

    const runtimeHealth = await fetch(`${harness.baseUrl}/api/admin/runtime/health`, {
      headers: { cookie: sessionCookie },
    })
    assert.equal(runtimeHealth.status, 200)

    const syncResponse = await fetch(`${harness.baseUrl}/api/admin/models/sync`, {
      method: 'POST',
      headers: {
        cookie: sessionCookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    assert.equal(syncResponse.status, 200)
    const synced = await syncResponse.json() as {
      audit: { operatorUserId: string; operatorRole: string; action: string }
    }
    assert.equal(synced.audit.action, 'model.sync')
    assert.equal(synced.audit.operatorUserId, registered.user.id)
    assert.equal(synced.audit.operatorRole, 'operator')
  })

  it('reports OAuth provider configuration before starting external login', async () => {
    delete process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_ID
    delete process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_SECRET
    delete process.env.DUDESIGN_OAUTH_GOOGLE_REDIRECT_URI
    process.env.DUDESIGN_OAUTH_GITHUB_CLIENT_ID = 'github-client'
    process.env.DUDESIGN_OAUTH_GITHUB_CLIENT_SECRET = 'github-secret'
    process.env.DUDESIGN_OAUTH_GITHUB_REDIRECT_URI = 'http://localhost/api/auth/oauth/github/callback'
    harness = await startApiFlowHarness(new ApplicationService())

    const response = await getJson<OAuthProvidersResponse>('/api/auth/oauth/providers')
    assert.deepEqual(response.providers, [
      { provider: 'google', configured: false },
      { provider: 'github', configured: true },
    ])
  })

  it('completes Google OAuth and signs a DUDesign session cookie', async () => {
    previousAuthMode = process.env.DUDESIGN_AUTH_MODE
    process.env.DUDESIGN_AUTH_MODE = 'session'
    process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_ID = 'google-client'
    process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_SECRET = 'google-secret'
    process.env.DUDESIGN_OAUTH_GOOGLE_REDIRECT_URI = 'http://localhost/api/auth/oauth/google/callback'
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://oauth2.googleapis.com/token') {
        return jsonResponse({ access_token: 'google-access' })
      }
      if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
        return jsonResponse({
          sub: 'google-sub-1',
          email: 'oauth-designer@example.com',
          email_verified: true,
          name: 'OAuth Designer',
          picture: 'https://example.com/oauth.png',
        })
      }
      return originalFetch(input, init)
    }) as typeof fetch
    harness = await startApiFlowHarness(new ApplicationService())

    const startResponse = await fetch(`${harness.baseUrl}/api/auth/oauth/google/start`, {
      headers: { origin: 'http://localhost:3001' },
    })
    assert.equal(startResponse.status, 200)
    assert.equal(startResponse.headers.get('access-control-allow-origin'), 'http://localhost:3001')
    assert.equal(startResponse.headers.get('access-control-allow-credentials'), 'true')
    const oauthCookie = startResponse.headers.get('set-cookie') ?? ''
    assert.match(oauthCookie, /dudesign_oauth_state=google\./)
    const startBody = await startResponse.json() as { authorizationUrl: string }
    const authorizationUrl = new URL(startBody.authorizationUrl)
    assert.equal(authorizationUrl.searchParams.get('client_id'), 'google-client')
    assert.equal(authorizationUrl.searchParams.get('scope'), 'openid email profile')
    const state = authorizationUrl.searchParams.get('state')
    assert.ok(state)

    const callbackResponse = await fetch(`${harness.baseUrl}/api/auth/oauth/google/callback?code=oauth_code&state=${encodeURIComponent(state)}&redirectTo=%2F`, {
      headers: { cookie: oauthCookie },
      redirect: 'manual',
    })
    assert.equal(callbackResponse.status, 302)
    assert.equal(callbackResponse.headers.get('location'), '/')
    const sessionCookie = callbackResponse.headers.get('set-cookie') ?? ''
    assert.match(sessionCookie, /dudesign_session=/)

    const identity = await harness.service.store.getAuthIdentityByProvider('oauth_google', 'google-sub-1')
    assert.ok(identity?.userId)
  })

  let currentSetCookie = ''

  async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
    assert.ok(harness)
    const response = await fetch(`${harness.baseUrl}${path}`, init)
    if (!response.ok) {
      assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    }
    rememberCookie(response)
    return response.json() as Promise<T>
  }

  async function postJson<T>(
    path: string,
    body: unknown,
    expectedStatus = 200,
    init?: Omit<RequestInit, 'method' | 'body'>,
  ): Promise<T> {
    assert.ok(harness)
    const headers = init?.headers as Record<string, string> | undefined
    const response = await fetch(`${harness.baseUrl}${path}`, {
      ...init,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    })
    if (response.status !== expectedStatus) {
      assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    }
    rememberCookie(response)
    return response.json() as Promise<T>
  }

  function rememberCookie(response: Response): void {
    const cookie = response.headers.get('set-cookie')
    if (cookie) currentSetCookie = cookie
  }

  function lastSetCookie(): string {
    assert.ok(currentSetCookie, 'Expected a Set-Cookie header')
    return currentSetCookie
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
})
