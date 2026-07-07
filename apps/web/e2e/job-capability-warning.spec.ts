import { expect, test } from '@playwright/test'
import type { DesignEvent, DesignJobSnapshotResponse } from '@dudesign/contracts'

test('job activity surfaces capability warning without blocking preview access', async ({ page }) => {
  const snapshot: DesignJobSnapshotResponse = {
    job: {
      id: 'job_capability_warning',
      status: 'completed',
      prompt: 'Design a product page that can continue if image generation is unavailable',
      productMode: 'web_app',
      variationCount: 1,
      capabilitySnapshot: null,
      designTemplatePacks: [],
    },
    variations: [
      {
        id: 'var_capability_warning',
        index: 1,
        title: 'Variation 01',
        status: 'completed',
        currentArtifactId: 'art_capability_warning',
        previewUrl: '/api/variations/var_capability_warning/preview',
        screenshotUrl: null,
        designTemplatePack: null,
        inputTokens: 128,
        outputTokens: 2048,
        costCents: 5,
        errorCode: null,
        errorMessage: null,
        reviewAction: null,
      },
    ],
    artifacts: [
      {
        id: 'art_capability_warning',
        variationId: 'var_capability_warning',
        version: 1,
        kind: 'html',
        entryPath: 'index.html',
        parentArtifactId: null,
        screenshotDevice: null,
        url: null,
        quality: null,
      },
    ],
  }

  const runtimeWarning: DesignEvent = {
    schemaVersion: '2026-06-26.dudesign-event.v1',
    type: 'design.runtime_warning',
    timestamp: new Date().toISOString(),
    sessionId: 'sess_capability_warning',
    jobId: 'job_capability_warning',
    variationId: 'var_capability_warning',
    payload: {
      severity: 'warn',
      code: 'MCP_UNAVAILABLE',
      message: 'image-generation MCP server timed out before returning an asset.',
      context: {
        serverName: 'image-generation',
        mcpToolId: 'mcp_image_generation',
      },
    },
  }

  const jobCompleted: DesignEvent = {
    schemaVersion: '2026-06-26.dudesign-event.v1',
    type: 'design.job_completed',
    timestamp: new Date().toISOString(),
    sessionId: 'sess_capability_warning',
    jobId: 'job_capability_warning',
    payload: {
      completedVariationCount: 1,
      failedVariationCount: 0,
    },
  }

  await page.route('**/api/design-jobs/job_capability_warning/stream', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/event-stream',
      },
      body: [
        'event: design.runtime_warning',
        `data: ${JSON.stringify(runtimeWarning)}`,
        '',
        'event: design.job_completed',
        `data: ${JSON.stringify(jobCompleted)}`,
        '',
        '',
      ].join('\n'),
    })
  })
  await page.route('**/api/design-jobs/job_capability_warning', async route => {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'application/json',
      },
      body: JSON.stringify(snapshot),
    })
  })

  await page.goto('/jobs/job_capability_warning')
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('variation-card')).toContainText('completed')
  await expect(page.getByTestId('open-variation-link')).toHaveAttribute('href', '/variations/var_capability_warning')

  const activity = page.getByTestId('runtime-activity')
  await expect(activity).toContainText('Image generation temporarily unavailable')
  await expect(activity).toContainText('Continue without images')
})
