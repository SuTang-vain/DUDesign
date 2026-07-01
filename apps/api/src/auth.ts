import type { IncomingHttpHeaders } from 'node:http'
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { createId } from './id.js'
import type { ApplicationRepository } from './repository.js'

export type RequestContext = {
  requestId: string
  userId: string
  adminRole: AdminRole | null
  authMode?: AuthMode
  authSessionTokenHash?: string | null
}

export type AdminRole = 'support' | 'operator' | 'developer'
export type AuthMode = 'dev' | 'session'

export const AUTH_COOKIE_NAME = 'dudesign_session'

export async function createRequestContext(
  headers: IncomingHttpHeaders,
  options: {
    store?: ApplicationRepository
    authMode?: AuthMode
  } = {},
): Promise<RequestContext> {
  const authMode = options.authMode ?? currentAuthMode()
  const requestId = singleHeader(headers['x-request-id']) ?? createId('req')
  const adminRole = singleHeader(headers['x-dudesign-admin-role'])
  if (authMode === 'dev') {
    return {
      requestId,
      userId: singleHeader(headers['x-dudesign-user-id']) ?? 'usr_dev',
      adminRole: isAdminRole(adminRole) ? adminRole : null,
      authMode,
      authSessionTokenHash: null,
    }
  }
  const token = cookieValue(headers.cookie, AUTH_COOKIE_NAME)
  if (!token || !options.store) {
    return {
      requestId,
      userId: '',
      adminRole: null,
      authMode,
      authSessionTokenHash: null,
    }
  }
  const tokenHash = hashSessionToken(token)
  const session = await options.store.getAuthSessionByTokenHash(tokenHash)
  const now = Date.now()
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= now) {
    return {
      requestId,
      userId: '',
      adminRole: null,
      authMode,
      authSessionTokenHash: tokenHash,
    }
  }
  await options.store.touchAuthSession(tokenHash)
  const user = await options.store.getUserById(session.userId)
  return {
    requestId,
    userId: session.userId,
    adminRole: adminRoleFromUserMetadata(user?.metadata),
    authMode,
    authSessionTokenHash: tokenHash,
  }
}

export function currentAuthMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const mode = (env.DUDESIGN_AUTH_MODE ?? '').toLowerCase()
  if (mode === 'session' || mode === 'production') return 'session'
  return 'dev'
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function sessionCookie(token: string, options: { maxAgeSeconds: number; secure?: boolean } = { maxAgeSeconds: 60 * 60 * 24 * 30 }): string {
  const parts = [
    `${AUTH_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ]
  if (options.secure ?? process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function normalizeAuthEmail(value: unknown): string {
  if (typeof value !== 'string') throw authInputError('INVALID_EMAIL', 'email is required.')
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authInputError('INVALID_EMAIL', 'A valid email is required.')
  return email
}

export function validatePassword(password: string): void {
  if (password.length < 8) throw authInputError('WEAK_PASSWORD', 'Password must be at least 8 characters.')
  if (password.length > 256) throw authInputError('INVALID_PASSWORD', 'Password is too long.')
}

const scrypt = promisify(scryptCallback)

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const key = await scrypt(password, salt, 64) as Buffer
  return `scrypt$${salt}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, encoded] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !encoded) return false
  const expected = Buffer.from(encoded, 'base64url')
  const actual = await scrypt(password, salt, expected.byteLength) as Buffer
  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual)
}

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
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

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function isAdminRole(value: string | undefined): value is AdminRole {
  return value === 'support' || value === 'operator' || value === 'developer'
}

function adminRoleFromUserMetadata(metadata: Record<string, unknown> | undefined): AdminRole | null {
  const role = metadata?.adminRole
  if (typeof role !== 'string') return null
  return isAdminRole(role) ? role : null
}

function authInputError(code: string, message: string): Error & { status: number; code: string } {
  const error = new Error(message) as Error & { status: number; code: string }
  error.status = 400
  error.code = code
  return error
}
