import { expect, test } from '@playwright/test'

test('running refine can be stopped without replacing the current preview', async ({ page }) => {
  const variationId = 'var_cancel_ui'
  const artifactId = 'art_cancel_ui_v1'
  const request = 'Make the hero louder, then stop this change'
  let releaseRefine!: () => void
  const refineCancelled = new Promise<void>(resolve => { releaseRefine = resolve })

  await page.route(`**/api/variations/${variationId}/preview**`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Original preview</main></body></html>',
  }))
  await page.route(`**/api/variations/${variationId}/files**`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      artifact: { id: artifactId, version: 1, entryPath: 'index.html', createdAt: '2026-07-15T01:00:00.000Z' },
      files: [{ path: 'index.html', language: 'html', content: '<main>Original preview</main>', artifactId, kind: 'html' }],
    }),
  }))
  await page.route(`**/api/variations/${variationId}/refine/*/cancel`, async route => {
    const requestId = route.request().url().match(/\/refine\/([^/]+)\/cancel/)?.[1] ?? 'unknown'
    await new Promise(resolve => setTimeout(resolve, 120))
    releaseRefine()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId,
        variationId,
        status: 'cancelled',
        runtime: { cancelled: true, cancelledVariationCount: 1, failedVariationCount: 0 },
      }),
    })
  })
  await page.route(`**/api/variations/${variationId}/refine`, async route => {
    const body = route.request().postDataJSON() as { requestId: string }
    await refineCancelled
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: body.requestId,
        variation: {
          id: variationId,
          status: 'cancelled',
          currentArtifactId: artifactId,
          previewUrl: `/api/variations/${variationId}/preview`,
          screenshotUrl: null,
          errorCode: null,
          errorMessage: null,
        },
        artifact: { id: artifactId, version: 1, entryPath: 'index.html' },
      }),
    })
  })
  await page.route(`**/api/variations/${variationId}`, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      variation: {
        id: variationId,
        jobId: 'job_cancel_ui',
        sessionId: 'sess_cancel_ui',
        index: 0,
        title: 'Variation 01',
        status: 'completed',
        currentArtifactId: artifactId,
        previewUrl: `/api/variations/${variationId}/preview`,
        screenshotUrl: null,
        designTemplatePack: null,
        explorationPlan: null,
        inputTokens: 0,
        outputTokens: 0,
        costCents: 0,
        errorCode: null,
        errorMessage: null,
      },
      job: {
        id: 'job_cancel_ui',
        prompt: 'Cancellation UI fixture',
        status: 'completed',
        productMode: 'web_app',
        capabilitySnapshot: null,
        designTemplatePacks: [],
        requirementModuleGraph: null,
        explorationPlan: null,
        capabilitySelectionSnapshot: null,
      },
      currentArtifact: {
        id: artifactId,
        kind: 'html',
        version: 1,
        entryPath: 'index.html',
        parentArtifactId: null,
        screenshotDevice: null,
        url: null,
        createdAt: '2026-07-15T01:00:00.000Z',
        quality: null,
      },
      artifacts: [{
        id: artifactId,
        kind: 'html',
        version: 1,
        entryPath: 'index.html',
        parentArtifactId: null,
        isCurrent: true,
        exportedFromArtifactId: null,
        screenshotDevice: null,
        url: null,
        createdAt: '2026-07-15T01:00:00.000Z',
        quality: null,
      }],
      capabilityNotices: [],
    }),
  }))

  await page.goto(`/variations/${variationId}`)
  const prompt = page.locator('#variation-refine-prompt')
  await prompt.fill(request)
  await page.getByTestId('refine-button').click()

  const stop = page.getByTestId('refine-button')
  await expect(stop).toHaveAttribute('aria-label', 'Stop update')
  await stop.click()
  await expect(page.locator('.refine-live-status')).toContainText('Stopping update')

  await expect(page.getByTestId('refine-feedback-stream')).toContainText('Update stopped')
  await expect(prompt).toHaveValue(request)
  await expect(page.getByTestId('variation-preview-frame')).toHaveAttribute('src', new RegExp(`artifactId=${artifactId}`))
  await expect(page.getByTestId('refine-version-actions')).toHaveCount(0)
})
