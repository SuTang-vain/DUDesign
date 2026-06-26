import type { IncomingHttpHeaders } from 'node:http'
import { createId } from './id.js'

export type RequestContext = {
  requestId: string
  userId: string
  adminRole: AdminRole | null
}

export type AdminRole = 'support' | 'operator' | 'developer'

export function createRequestContext(headers: IncomingHttpHeaders): RequestContext {
  const adminRole = singleHeader(headers['x-dudesign-admin-role'])
  return {
    requestId: singleHeader(headers['x-request-id']) ?? createId('req'),
    userId: singleHeader(headers['x-dudesign-user-id']) ?? 'usr_dev',
    adminRole: isAdminRole(adminRole) ? adminRole : null,
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function isAdminRole(value: string | undefined): value is AdminRole {
  return value === 'support' || value === 'operator' || value === 'developer'
}
