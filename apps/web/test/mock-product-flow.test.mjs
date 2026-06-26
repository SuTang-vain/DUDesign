import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const API_BASE = process.env.DUDESIGN_API_URL ?? 'http://127.0.0.1:4000'
const WEB_BASE = process.env.DUDESIGN_WEB_URL ?? 'http://localhost:3001'

describe('UX-M1 mock product flow', () => {
  it('walks from home to job, variation, export, and share routes', async () => {
    await assertPageOk('/')

    const bootstrap = await getJson('/api/dev/bootstrap')
    assert.equal(bootstrap.workspace.id, 'ws_dev')

    const createdSession = await postJson('/api/sessions', {
      workspaceId: bootstrap.workspace.id,
      mode: 'new_html',
      title: 'UX-M1 mock product flow',
    })
    assert.match(createdSession.session.id, /^ses_/)

    const createdJob = await postJson('/api/design-jobs', {
      sessionId: createdSession.session.id,
      prompt: 'A polished landing page for a mock product flow smoke test',
      sourceMode: 'new_html',
      variationCount: 3,
      templateRequirements: {
        styles: ['minimal', 'trustworthy'],
        deviceTargets: ['desktop', 'mobile'],
      },
    })
    assert.equal(createdJob.variations.length, 3)

    const job = await waitForJob(createdJob.job.id)
    assert.equal(job.job.status, 'completed')
    assert.equal(job.variations.length, 3)

    await assertPageOk(`/jobs/${job.job.id}`)

    const variation = job.variations[0]
    assert.ok(variation.previewUrl)
    await assertPageOk(`/variations/${variation.id}`)

    const exported = await postJson(`/api/variations/${variation.id}/export`, {})
    assert.match(exported.artifact.filename, /\.html$/)
    assert.match(exported.artifact.html, /iframe-ready HTML/)

    const shared = await postJson(`/api/variations/${variation.id}/share`, {
      visibility: 'public',
    })
    assert.match(shared.share.url, /^\/share\/share_/)

    const shareDetail = await getJson(`/api/shares/${shared.share.token}`)
    assert.equal(shareDetail.variation.id, variation.id)
    assert.equal(shareDetail.artifact.version, exported.artifact.version)
    await assertPageOk(shared.share.url)
  })
})

async function waitForJob(jobId) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 2000) {
    const snapshot = await getJson(`/api/design-jobs/${jobId}`)
    if (snapshot.job.status === 'completed') return snapshot
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for job ${jobId}`)
}

async function assertPageOk(path) {
  const response = await fetch(`${WEB_BASE}${path}`)
  assert.equal(response.ok, true, `${WEB_BASE}${path} returned HTTP ${response.status}`)
  const html = await response.text()
  assert.match(html, /<!DOCTYPE html>/i)
}

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`)
  assert.equal(response.ok, true, `${API_BASE}${path} returned HTTP ${response.status}`)
  return response.json()
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  assert.equal(response.ok, true, `${API_BASE}${path} returned HTTP ${response.status}`)
  return response.json()
}
