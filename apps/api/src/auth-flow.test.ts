import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { AuthUserResponse, CreateSessionResponse, LogoutResponse } from '@dudesign/contracts'
import { ApplicationService } from './service.js'
import { startApiFlowHarness, type ApiFlowHarness } from './apiFlowSmoke.js'

describe('session cookie authentication flow', () => {
  let harness: ApiFlowHarness | null = null
  let previousAuthMode: string | undefined

  afterEach(async () => {
    if (previousAuthMode === undefined) delete process.env.DUDESIGN_AUTH_MODE
    else process.env.DUDESIGN_AUTH_MODE = previousAuthMode
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
    const sessionCookie = lastSetCookie()
    assert.match(sessionCookie, /dudesign_session=/)
    assert.match(sessionCookie, /HttpOnly/)
    assert.match(sessionCookie, /SameSite=Lax/)

    const me = await getJson<AuthUserResponse>('/api/auth/me', {
      headers: { cookie: sessionCookie },
    })
    assert.equal(me.user.id, registered.user.id)
    assert.equal(me.workspace.id, registered.workspace.id)

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
})
