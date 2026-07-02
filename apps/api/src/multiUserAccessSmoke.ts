import assert from 'node:assert/strict'
import type {
  AuthUserResponse,
  CreateDesignJobResponse,
  CreateSessionResponse,
  ListDesignTemplatePacksResponse,
  SaveDesignTemplatePackResponse,
  ShareVariationResponse,
  SharedVariationResponse,
} from '@dudesign/contracts'
import { createId } from './id.js'
import type { ApiFlowHarness } from './apiFlowSmoke.js'

export async function runMultiUserAccessSmoke(harness: ApiFlowHarness): Promise<void> {
  let currentSetCookie = ''

  const userA = await registerUser('user-a')
  const cookieA = lastSetCookie()
  const userB = await registerUser('user-b')
  const cookieB = lastSetCookie()

  const privateTemplate = await postJson<SaveDesignTemplatePackResponse>('/api/design-templates/import-design-md', {
    name: 'User A Private Template',
    designMd: privateDesignMd('User A Private Template', '#123456'),
  }, 201, cookieA)
  assert.equal(privateTemplate.template.createdByUserId, userA.user.id)
  const templatesForA = await getJson<ListDesignTemplatePacksResponse>('/api/design-templates', cookieA)
  assert.equal(templatesForA.templates.some(template => template.id === privateTemplate.template.id), true)
  const templatesForB = await getJson<ListDesignTemplatePacksResponse>('/api/design-templates', cookieB)
  assert.equal(templatesForB.templates.some(template => template.id === privateTemplate.template.id), false)
  const sessionB = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: userB.workspace.id,
    mode: 'new_html',
    title: 'User B private design',
  }, 201, cookieB)
  const privateTemplateAttemptByB = await fetch(`${harness.baseUrl}/api/design-jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieB,
    },
    body: JSON.stringify({
      sessionId: sessionB.session.id,
      prompt: 'Try to use user A private template from user B session.',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {
        designTemplatePackIds: [privateTemplate.template.id],
      },
    }),
  })
  assert.equal(privateTemplateAttemptByB.status, 404)
  const privateTemplateAttemptPayload = await privateTemplateAttemptByB.json() as { error: { code: string } }
  assert.equal(privateTemplateAttemptPayload.error.code, 'DESIGN_TEMPLATE_NOT_FOUND')

  const sessionA = await postJson<CreateSessionResponse>('/api/sessions', {
    workspaceId: userA.workspace.id,
    mode: 'new_html',
    title: 'User A private design',
  }, 201, cookieA)
  const jobA = await postJson<CreateDesignJobResponse>('/api/design-jobs', {
    sessionId: sessionA.session.id,
    prompt: 'A private landing page owned by user A.',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {
      designTemplatePackIds: [privateTemplate.template.id],
    },
  }, 201, cookieA)
  const variationId = jobA.variations[0]!.id
  const artifact = await attachPinnedHtmlArtifact({
    workspaceId: userA.workspace.id,
    sessionId: sessionA.session.id,
    variationId,
    html: '<!doctype html><html><body><h1>User A private artifact v1</h1></body></html>',
  })

  await expectForbidden(`/api/design-jobs/${jobA.job.id}`, cookieB, 'JOB_FORBIDDEN')
  await expectForbidden(`/api/variations/${variationId}`, cookieB, 'JOB_FORBIDDEN')
  await expectForbidden(`/api/variations/${variationId}/preview`, cookieB, 'JOB_FORBIDDEN')
  const templateJobAttemptByB = await fetch(`${harness.baseUrl}/api/design-jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieB,
    },
    body: JSON.stringify({
      sessionId: sessionA.session.id,
      prompt: 'Try to use user A private template.',
      sourceMode: 'new_html',
      variationCount: 1,
      templateRequirements: {
        designTemplatePackIds: [privateTemplate.template.id],
      },
    }),
  })
  assert.equal(templateJobAttemptByB.status, 403)
  const templateJobAttemptPayload = await templateJobAttemptByB.json() as { error: { code: string } }
  assert.equal(templateJobAttemptPayload.error.code, 'SESSION_FORBIDDEN')

  const share = await postJson<ShareVariationResponse>(`/api/variations/${variationId}/share`, {
    visibility: 'public',
  }, 200, cookieA)
  const shareDetail = await getJson<SharedVariationResponse>(`/api/shares/${share.share.token}`)
  assert.equal(shareDetail.variation.id, variationId)
  assert.equal(shareDetail.artifact.id, artifact.id)
  assert.match(shareDetail.artifact.html ?? '', /private artifact v1/)

  const shareDetailAsB = await getJson<SharedVariationResponse>(`/api/shares/${share.share.token}`, cookieB)
  assert.equal(shareDetailAsB.artifact.id, artifact.id)
  assert.match(shareDetailAsB.artifact.html ?? '', /private artifact v1/)

  const refinedArtifact = await attachPinnedHtmlArtifact({
    workspaceId: userA.workspace.id,
    sessionId: sessionA.session.id,
    variationId,
    html: '<!doctype html><html><body><h1>User A private artifact v2</h1></body></html>',
  })
  assert.notEqual(refinedArtifact.id, artifact.id)
  const ownerPreview = await getText(`/api/variations/${variationId}/preview`, cookieA)
  assert.match(ownerPreview, /private artifact v2/)

  const stableShare = await getJson<SharedVariationResponse>(`/api/shares/${share.share.token}`)
  assert.equal(stableShare.artifact.id, artifact.id)
  assert.match(stableShare.artifact.html ?? '', /private artifact v1/)
  assert.doesNotMatch(stableShare.artifact.html ?? '', /private artifact v2/)

  const shareAttemptByB = await fetch(`${harness.baseUrl}/api/variations/${variationId}/share`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieB,
    },
    body: JSON.stringify({ visibility: 'public' }),
  })
  assert.equal(shareAttemptByB.status, 403)
  const shareAttemptPayload = await shareAttemptByB.json() as { error: { code: string } }
  assert.equal(shareAttemptPayload.error.code, 'JOB_FORBIDDEN')

  await disableUser(userB.user.id)
  const disabledMe = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: { cookie: cookieB },
  })
  assert.equal(disabledMe.status, 403)
  const disabledMePayload = await disabledMe.json() as { error: { code: string } }
  assert.equal(disabledMePayload.error.code, 'USER_DISABLED')

  const disabledLogin = await fetch(`${harness.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: userB.user.email,
      password: 'correct-horse-battery',
    }),
  })
  assert.equal(disabledLogin.status, 403)
  const disabledLoginPayload = await disabledLogin.json() as { error: { code: string } }
  assert.equal(disabledLoginPayload.error.code, 'USER_DISABLED')

  async function registerUser(label: string): Promise<AuthUserResponse> {
    return postJson<AuthUserResponse>('/api/auth/register', {
      email: `${label}-${createId('test')}@example.com`,
      password: 'correct-horse-battery',
      name: label,
    }, 201)
  }

  async function attachPinnedHtmlArtifact(input: {
    workspaceId: string
    sessionId: string
    variationId: string
    html: string
  }) {
    const artifactId = createId('art')
    const stored = await harness.service.artifacts.put({
      workspaceId: input.workspaceId,
      artifactId,
      relativePath: 'index.html',
      contentType: 'text/html; charset=utf-8',
      body: input.html,
      metadata: { source: 'multi-user-access-smoke' },
    })
    const artifact = await harness.service.store.createArtifact({
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      variationId: input.variationId,
      parentArtifactId: null,
      kind: 'html',
      storageKey: stored.storageKey,
      entryPath: 'index.html',
      contentHash: stored.contentHash,
      sizeBytes: stored.sizeBytes,
      metadata: { source: 'multi-user-access-smoke' },
    })
    await harness.service.store.setVariationCurrentArtifact(
      input.variationId,
      artifact.id,
      `/api/variations/${encodeURIComponent(input.variationId)}/preview`,
    )
    return artifact
  }

  async function disableUser(userId: string): Promise<void> {
    const user = await harness.service.store.updateUserStatus(userId, 'disabled')
    assert.equal(user?.status, 'disabled')
  }

  async function expectForbidden(path: string, cookie: string, code: string): Promise<void> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      headers: { cookie },
    })
    assert.equal(response.status, 403, `${path} should be forbidden`)
    const payload = await response.json() as { error: { code: string } }
    assert.equal(payload.error.code, code)
  }

  async function getJson<T>(path: string, cookie?: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, cookie ? { headers: { cookie } } : undefined)
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    rememberCookie(response)
    return response.json() as Promise<T>
  }

  async function getText(path: string, cookie: string): Promise<string> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      headers: { cookie },
    })
    if (!response.ok) assert.fail(`${path} failed with ${response.status}: ${await response.text()}`)
    return response.text()
  }

  async function postJson<T>(path: string, body: unknown, expectedStatus = 200, cookie?: string): Promise<T> {
    const response = await fetch(`${harness.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
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
}

function privateDesignMd(name: string, primary: string): string {
  return `---
name: ${name}
version: 1.0.0
colors:
  primary: "${primary}"
  on-primary: "#FFFFFF"
typography:
  body:
    fontFamily: Inter
    fontSize: 16px
spacing:
  md: 24px
rounded:
  sm: 6px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
---

## Overview

Private template for one user.

## Do's and Don'ts

- Do: Keep private template constraints scoped.
- Don't: Leak this template across accounts.
`
}
