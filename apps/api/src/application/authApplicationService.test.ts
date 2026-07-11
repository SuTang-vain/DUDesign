import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { InMemoryStore } from '../store.js'
import { AuthApplicationService } from './authApplicationService.js'

describe('AuthApplicationService', () => {
  afterEach(() => {
    delete process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_ID
    delete process.env.DUDESIGN_OAUTH_GOOGLE_CLIENT_SECRET
    delete process.env.DUDESIGN_OAUTH_GOOGLE_REDIRECT_URI
  })

  it('registers, authenticates, bootstraps, and revokes a user session independently', async () => {
    const store = new InMemoryStore()
    const service = new AuthApplicationService(store)
    const registered = await service.registerUser({
      email: 'architecture@example.test',
      password: 'strong-password',
      name: 'Architecture User',
    })

    assert.equal(registered.body.user.email, 'architecture@example.test')
    assert.match(registered.cookie, /^dudesign_session=/)

    const identity = await store.getAuthIdentityByProvider('password', 'architecture@example.test')
    assert.equal(identity?.userId, registered.body.user.id)

    const loggedIn = await service.loginUser({
      email: 'architecture@example.test',
      password: 'strong-password',
    })
    assert.equal(loggedIn.body.user.id, registered.body.user.id)

    const current = await service.getCurrentUser({
      requestId: 'req_auth_service',
      userId: registered.body.user.id,
      adminRole: null,
      authSessionTokenHash: null,
    })
    assert.equal(current.workspace.ownerId, registered.body.user.id)

    const loggedOut = await service.logoutUser({
      requestId: 'req_auth_logout',
      userId: registered.body.user.id,
      adminRole: null,
      authSessionTokenHash: null,
    })
    assert.match(loggedOut.cookie, /Max-Age=0/)
  })

  it('reports OAuth provider readiness without starting an unconfigured provider', async () => {
    const service = new AuthApplicationService(new InMemoryStore())

    const providers = await service.listOAuthProviders()

    assert.equal(providers.providers.find(item => item.provider === 'google')?.configured, false)
    await assert.rejects(() => service.startOAuthLogin('google'), /OAuth is not configured/)
  })
})
