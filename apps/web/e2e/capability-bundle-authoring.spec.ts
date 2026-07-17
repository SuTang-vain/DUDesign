import { expect, test, type APIRequestContext } from '@playwright/test'

const API_BASE = process.env.DUDESIGN_API_URL ?? 'http://127.0.0.1:4000'

test('Authoring Studio downloads, imports, reviews, and previews a Capability Bundle ZIP', async ({ page, request }, testInfo) => {
  const fixture = await createReadyAuthoringDraft(request)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: /What shall we design today/i })).toBeVisible()
  await page.getByTestId('template-pill-trigger').click()
  const library = page.getByTestId('template-library-picker')
  await expect(library).toBeVisible()
  await library.getByRole('button', { name: /^Mine|^我的/ }).click()
  await library.getByRole('button', { name: /Import DESIGN\.md|导入 DESIGN\.md/ }).click()

  const workbench = page.getByTestId('capability-bundle-workbench')
  await expect(workbench).toBeVisible()
  await expect(workbench.getByTestId('capability-bundle-export-draft')).toContainText(fixture.templateName)

  const downloadPromise = page.waitForEvent('download')
  await workbench.getByTestId('capability-bundle-export').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/capability-bundle\.zip$/)
  const bundlePath = testInfo.outputPath('round-trip.capability-bundle.zip')
  await download.saveAs(bundlePath)

  await workbench.getByTestId('capability-bundle-file').setInputFiles(bundlePath)
  await expect(workbench).toContainText('round-trip.capability-bundle.zip')
  await workbench.getByTestId('capability-bundle-import').click()

  const review = workbench.getByTestId('capability-bundle-review')
  await expect(review).toBeVisible({ timeout: 15_000 })
  await expect(review).toContainText(fixture.templateName)
  await expect(review).toContainText('1 Template')
  await expect(review).toContainText('1 HTML')

  await review.getByTestId('capability-bundle-confirm').click()
  await expect(review).toContainText(/Preview checks passed|预览检查已通过/, { timeout: 20_000 })
})

async function createReadyAuthoringDraft(request: APIRequestContext): Promise<{ templateName: string }> {
  const bootstrap = await getJson<{ workspace: { id: string } }>(request, '/api/dev/bootstrap')
  const session = await postJson<{ session: { id: string } }>(request, '/api/sessions', {
    workspaceId: bootstrap.workspace.id,
    mode: 'new_html',
  })
  const job = await postJson<{ job: { id: string } }>(request, '/api/design-jobs', {
    sessionId: session.session.id,
    prompt: 'Create a compact reviewed capability bundle fixture with visible semantic content.',
    sourceMode: 'new_html',
    variationCount: 1,
    templateRequirements: {},
  })
  const snapshot = await waitForCompletedJob(request, job.job.id)
  const variation = snapshot.variations[0]
  if (!variation?.currentArtifactId) throw new Error('Capability Bundle E2E fixture did not produce an HTML artifact.')

  const created = await postJson<{ draft: { id: string } }>(request, '/api/capability-authoring/drafts', {
    workspaceId: bootstrap.workspace.id,
    source: {
      type: 'variation_artifact',
      variationId: variation.id,
      artifactId: variation.currentArtifactId,
    },
  })
  const analyzed = await postJson<AuthoringDraftResponse>(request, `/api/capability-authoring/drafts/${created.draft.id}/analyze`, {
    workspaceId: bootstrap.workspace.id,
  })
  const templateName = analyzed.draft.candidateBundle.templatePacks[0]?.name ?? 'Capability Bundle E2E template'
  const confirmedPaths = analyzed.draft.candidateBundle.templatePacks.flatMap(template =>
    template.sourceEvidence.map(evidence => evidence.targetPath),
  )
  await patchJson(request, `/api/capability-authoring/drafts/${created.draft.id}`, {
    workspaceId: bootstrap.workspace.id,
    confirmedPaths,
  })
  const sanitized = await postJson<AuthoringDraftResponse>(request, `/api/capability-authoring/drafts/${created.draft.id}/sanitize`, {
    workspaceId: bootstrap.workspace.id,
  })
  await patchJson(request, `/api/capability-authoring/drafts/${created.draft.id}`, {
    workspaceId: bootstrap.workspace.id,
    confirmedPaths: [
      ...confirmedPaths,
      ...sanitized.draft.findings.filter(finding => finding.severity === 'warning').map(finding => finding.path),
    ],
  })
  const previewed = await postJson<AuthoringDraftResponse>(request, `/api/capability-authoring/drafts/${created.draft.id}/preview`, {
    workspaceId: bootstrap.workspace.id,
  })
  expect(previewed.draft.status).toBe('ready')
  return { templateName }
}

type AuthoringDraftResponse = {
  draft: {
    status: string
    candidateBundle: {
      templatePacks: Array<{
        name: string
        sourceEvidence: Array<{ targetPath: string }>
      }>
    }
    findings: Array<{ severity: 'error' | 'warning' | 'info'; path: string }>
  }
}

type JobSnapshot = {
  job: { status: string }
  variations: Array<{ id: string; currentArtifactId: string | null }>
}

async function waitForCompletedJob(request: APIRequestContext, jobId: string): Promise<JobSnapshot> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const snapshot = await getJson<JobSnapshot>(request, `/api/design-jobs/${jobId}`)
    if (snapshot.job.status === 'completed') return snapshot
    if (snapshot.job.status === 'failed' || snapshot.job.status === 'cancelled') {
      throw new Error(`Capability Bundle E2E fixture job ended with ${snapshot.job.status}.`)
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error('Timed out waiting for Capability Bundle E2E fixture job.')
}

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API_BASE}${path}`)
  if (!response.ok()) throw new Error(`${path} failed with ${response.status()}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function postJson<T = unknown>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const response = await request.post(`${API_BASE}${path}`, { data })
  if (!response.ok()) throw new Error(`${path} failed with ${response.status()}: ${await response.text()}`)
  return response.json() as Promise<T>
}

async function patchJson(request: APIRequestContext, path: string, data: unknown): Promise<void> {
  const response = await request.patch(`${API_BASE}${path}`, { data })
  if (!response.ok()) throw new Error(`${path} failed with ${response.status()}: ${await response.text()}`)
}
