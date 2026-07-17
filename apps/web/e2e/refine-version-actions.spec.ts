import { expect, test } from '@playwright/test'

test('completed refine can compare, view, and undo artifact versions', async ({ page }) => {
  const variationId = 'var_compare_case'
  let currentArtifactId = 'art_compare_v1'
  let currentVersion = 1
  let refined = false

  const artifact = (id: string, version: number, isCurrent: boolean) => ({
    id,
    kind: 'html' as const,
    version,
    entryPath: 'index.html',
    parentArtifactId: version > 1 ? 'art_compare_v1' : null,
    isCurrent,
    exportedFromArtifactId: null,
    screenshotDevice: null,
    url: null,
    createdAt: `2026-07-15T0${version}:00:00.000Z`,
    quality: null,
  })

  await page.route(`**/api/variations/${variationId}/preview**`, async route => {
    const artifactId = new URL(route.request().url()).searchParams.get('artifactId') ?? currentArtifactId
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><body><main>${artifactId}</main></body></html>`,
    })
  })

  await page.route(`**/api/variations/${variationId}/files**`, async route => {
    const artifactId = new URL(route.request().url()).searchParams.get('artifactId') ?? currentArtifactId
    const version = artifactId === 'art_compare_v2' ? 2 : 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artifact: { id: artifactId, version, entryPath: 'index.html', createdAt: `2026-07-15T0${version}:00:00.000Z` },
        files: [{ path: 'index.html', language: 'html', content: `<main>version ${version}</main>`, artifactId, kind: 'html' }],
      }),
    })
  })

  await page.route(`**/api/variations/${variationId}/refine`, async route => {
    refined = true
    currentArtifactId = 'art_compare_v2'
    currentVersion = 2
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        variation: {
          id: variationId,
          status: 'completed',
          currentArtifactId,
          previewUrl: `/api/variations/${variationId}/preview`,
          screenshotUrl: null,
          errorCode: null,
          errorMessage: null,
        },
        artifact: { id: currentArtifactId, version: currentVersion, entryPath: 'index.html' },
      }),
    })
  })

  await page.route(`**/api/variations/${variationId}/versions/art_compare_v1/restore`, async route => {
    currentArtifactId = 'art_compare_v1'
    currentVersion = 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        variation: { id: variationId, currentArtifactId, previewUrl: `/api/variations/${variationId}/preview` },
        artifact: { id: currentArtifactId, kind: 'html', version: 1, entryPath: 'index.html', createdAt: '2026-07-15T01:00:00.000Z' },
      }),
    })
  })

  await page.route(`**/api/variations/${variationId}`, async route => {
    const artifacts = [
      artifact('art_compare_v1', 1, currentArtifactId === 'art_compare_v1'),
      ...(refined ? [artifact('art_compare_v2', 2, currentArtifactId === 'art_compare_v2')] : []),
    ]
    const current = artifacts.find(item => item.id === currentArtifactId)!
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        variation: {
          id: variationId,
          jobId: 'job_compare_case',
          sessionId: 'sess_compare_case',
          index: 0,
          title: 'Variation 01',
          status: 'completed',
          currentArtifactId,
          previewUrl: `/api/variations/${variationId}/preview`,
          screenshotUrl: null,
          designTemplatePack: null,
          explorationPlan: null,
          inputTokens: 120,
          outputTokens: 340,
          costCents: 2,
          errorCode: null,
          errorMessage: null,
        },
        job: {
          id: 'job_compare_case',
          prompt: 'A comparison-ready landing page',
          status: 'completed',
          productMode: 'web_app',
          capabilitySnapshot: null,
          designTemplatePacks: [],
          requirementModuleGraph: null,
          explorationPlan: null,
          capabilitySelectionSnapshot: null,
        },
        currentArtifact: current,
        artifacts,
        capabilityNotices: [],
      }),
    })
  })

  await page.goto(`/variations/${variationId}`)
  await expect(page.getByTestId('variation-preview')).toBeVisible()

  await page.locator('#variation-refine-prompt').fill('Increase contrast and tighten spacing')
  await page.getByTestId('refine-button').click()

  const actions = page.getByTestId('refine-version-actions')
  await expect(actions).toBeVisible()
  await expect(actions).toContainText('View update')
  await expect(actions).toContainText('Compare')
  await expect(actions).toContainText('Undo')

  await actions.getByRole('button', { name: 'Compare' }).click()
  await expect(page.getByTestId('version-compare-view')).toBeVisible()
  await expect(page.getByTestId('version-compare-before-frame')).toHaveAttribute('src', /artifactId=art_compare_v1/)
  await expect(page.getByTestId('version-compare-after-frame')).toHaveAttribute('src', /artifactId=art_compare_v2/)

  await actions.getByRole('button', { name: 'View update' }).click()
  await expect(page.getByTestId('version-compare-view')).toHaveCount(0)
  await expect(page.getByTestId('variation-preview-frame')).toHaveAttribute('src', /artifactId=art_compare_v2/)

  await page.getByTestId('undo-refine-button').click()
  await expect(page.getByTestId('variation-notice')).toContainText('Restored v1 as the current artifact.')
  await expect(page.getByTestId('refine-version-actions')).toHaveCount(0)
})
