import type { OAuthProvider, OAuthProfile } from '../oauth.js'
import type { RequestContext } from '../auth.js'
import type { ApplicationRepository } from '../repository.js'
import {
  clearSessionCookie,
  createSessionToken,
  hashIp,
  hashPassword,
  hashSessionToken,
  normalizeAuthEmail,
  sessionCookie,
  validatePassword,
  verifyPassword,
} from '../auth.js'
import {
  createOAuthAuthorizationUrl,
  createOAuthStateCookie,
  exchangeOAuthCodeForProfile,
  isOAuthProviderConfigured,
  oauthConfig,
  oauthIdentityProvider,
} from '../oauth.js'

export class AuthApplicationService {
  constructor(private readonly store: ApplicationRepository) {}

  async registerUser(
    input: { email?: string; password?: string; name?: string | null },
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    const email = normalizeAuthEmail(input.email)
    const password = input.password ?? ''
    validatePassword(password)
    const existing = await this.store.getUserByEmail(email)
    if (existing) throw applicationError(409, 'USER_ALREADY_EXISTS', 'A user with this email already exists.')
    const { user, workspace } = await this.store.createUserWithWorkspace({
      email,
      name: input.name ?? null,
    })
    await this.store.createAuthIdentity({
      userId: user.id,
      provider: 'password',
      providerSubject: email,
      passwordHash: await hashPassword(password),
      verifiedAt: null,
    })
    const auth = await this.createAuthSessionForUser(user.id, meta)
    return {
      cookie: auth.cookie,
      body: {
        user,
        workspace,
        workspaces: [workspace],
        models: await this.store.listUserModelOptions(user.id),
      },
    }
  }

  async loginUser(
    input: { email?: string; password?: string },
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    const email = normalizeAuthEmail(input.email)
    const identity = await this.store.getAuthIdentityByProvider('password', email)
    if (!identity?.passwordHash) throw applicationError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    const valid = await verifyPassword(input.password ?? '', identity.passwordHash)
    if (!valid) throw applicationError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
    const user = await this.requireActiveUser(identity.userId)
    const workspace = await this.requirePrimaryWorkspace(user.id)
    const auth = await this.createAuthSessionForUser(user.id, meta)
    return {
      cookie: auth.cookie,
      body: {
        user,
        workspace,
        workspaces: [workspace],
        models: await this.store.listUserModelOptions(user.id),
      },
    }
  }

  async listOAuthProviders() {
    return {
      providers: (['google', 'github'] as OAuthProvider[]).map(provider => ({
        provider,
        configured: isOAuthProviderConfigured(provider),
      })),
    }
  }

  async startOAuthLogin(provider: OAuthProvider) {
    const authorization = createOAuthAuthorizationUrl(oauthConfig(provider))
    return {
      cookie: createOAuthStateCookie(provider, authorization.state),
      body: {
        provider,
        authorizationUrl: authorization.authorizationUrl,
      },
    }
  }

  async completeOAuthLogin(
    provider: OAuthProvider,
    code: string,
    meta: { userAgent?: string | null; ip?: string | null } = {},
  ) {
    const profile = await exchangeOAuthCodeForProfile(oauthConfig(provider), code)
    const { user, workspace } = await this.findOrCreateOAuthUser(profile)
    const auth = await this.createAuthSessionForUser(user.id, meta)
    return {
      cookie: auth.cookie,
      body: {
        user,
        workspace,
        workspaces: [workspace],
        models: await this.store.listUserModelOptions(user.id),
      },
    }
  }

  async logoutUser(ctx: RequestContext) {
    if (ctx.authSessionTokenHash) await this.store.revokeAuthSession(ctx.authSessionTokenHash)
    return {
      cookie: clearSessionCookie(),
      body: { ok: true },
    }
  }

  async getCurrentUser(ctx: RequestContext) {
    const user = await this.requireActiveUser(ctx.userId)
    const workspace = await this.requirePrimaryWorkspace(user.id)
    return {
      user,
      workspace,
      workspaces: [workspace],
      models: await this.store.listUserModelOptions(user.id),
    }
  }

  private async createAuthSessionForUser(
    userId: string,
    meta: { userAgent?: string | null; ip?: string | null },
  ) {
    const token = createSessionToken()
    const maxAgeSeconds = 60 * 60 * 24 * 30
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString()
    const session = await this.store.createAuthSession({
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: meta.userAgent ?? null,
      ipHash: meta.ip ? hashIp(meta.ip) : null,
      expiresAt,
    })
    return {
      session,
      cookie: sessionCookie(token, { maxAgeSeconds }),
    }
  }

  private async findOrCreateOAuthUser(profile: OAuthProfile) {
    const email = normalizeAuthEmail(profile.email)
    if (!profile.emailVerified) {
      throw applicationError(400, 'OAUTH_EMAIL_UNVERIFIED', 'OAuth provider did not return a verified email.')
    }
    const provider = oauthIdentityProvider(profile.provider)
    const existingIdentity = await this.store.getAuthIdentityByProvider(provider, profile.providerSubject)
    if (existingIdentity) {
      const user = await this.requireActiveUser(existingIdentity.userId)
      return { user, workspace: await this.requirePrimaryWorkspace(user.id) }
    }
    const existingUser = await this.store.getUserByEmail(email)
    const userContext = existingUser
      ? {
          user: existingUser,
          workspace: await this.store.getPrimaryWorkspaceForUser(existingUser.id),
        }
      : await this.store.createUserWithWorkspace({
          email,
          name: profile.name,
        })
    if (!userContext.workspace) {
      throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${userContext.user.id}`)
    }
    if (userContext.user.status !== 'active') {
      throw applicationError(403, 'USER_DISABLED', `User disabled: ${userContext.user.id}`)
    }
    await this.store.createAuthIdentity({
      userId: userContext.user.id,
      provider,
      providerSubject: profile.providerSubject,
      passwordHash: null,
      verifiedAt: new Date().toISOString(),
    })
    return {
      user: userContext.user,
      workspace: userContext.workspace,
    }
  }

  private async requireActiveUser(userId: string) {
    if (!userId) throw applicationError(401, 'UNAUTHENTICATED', 'Authentication required.')
    const user = await this.store.getUserById(userId)
    if (!user) throw applicationError(401, 'UNAUTHENTICATED', `Unknown user: ${userId}`)
    if (user.status !== 'active') throw applicationError(403, 'USER_DISABLED', `User disabled: ${userId}`)
    return user
  }

  private async requirePrimaryWorkspace(userId: string) {
    const workspace = await this.store.getPrimaryWorkspaceForUser(userId)
    if (!workspace) throw applicationError(404, 'WORKSPACE_NOT_FOUND', `Workspace not found for user: ${userId}`)
    return workspace
  }
}

function applicationError(status: number, code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = status
  error.code = code
  return error
}
