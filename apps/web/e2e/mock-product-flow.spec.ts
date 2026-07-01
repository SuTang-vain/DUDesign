import { expect, test } from '@playwright/test'
import { createVariationThroughUi } from './helpers'

test('UX-M1 mock product flow works through browser clicks', async ({ page }) => {
  await createVariationThroughUi(page, 'A crisp landing page for a browser-click E2E design flow')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('download-html-button').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/variation-01-v1\.zip/)
  await expect(page.getByTestId('variation-notice')).toContainText('Downloaded')

  await page.getByTestId('share-button').click()
  const shareLink = page.getByTestId('share-link')
  await expect(shareLink).toBeVisible()
  await expect(shareLink).toContainText('/share/share_')

  const sharePagePromise = page.context().waitForEvent('page')
  await shareLink.click()
  const sharePage = await sharePagePromise
  await sharePage.waitForLoadState('domcontentloaded')
  await expect(sharePage).toHaveURL(/\/share\/share_/)
  await expect(sharePage.getByRole('heading', { name: /Variation 01/i })).toBeVisible()
  await expect(sharePage.getByTestId('share-preview')).toBeVisible()
})

test('workbench can start from uploaded HTML', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await page.locator('.mode-tabs').getByRole('button', { name: 'Existing HTML', exact: true }).click()
  await page.getByRole('button', { name: 'Add context' }).click()
  await page.getByRole('button', { name: 'Files or photos' }).click()
  await page.getByTestId('source-html-input').setInputFiles({
    name: 'existing-source.html',
    mimeType: 'text/html',
    buffer: Buffer.from('<!doctype html><html><body><main><h1>Existing source</h1><p>Improve this page.</p></main></body></html>'),
  })
  await expect(page.getByTestId('source-artifact-status')).toContainText('existing-source.html')
  await page.getByTestId('prompt-input').fill('Improve the uploaded HTML with a clearer SaaS landing page structure')
  await page.getByTestId('generate-button').click()
  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Domain')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Aesthetic')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Palette')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Loop')
})

test('composer menus close on outside click and do not stack', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  await expect(page.getByRole('button', { name: 'Files or photos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connectors' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plugins' })).toBeVisible()
  await expect(page.locator('.context-child-panel')).toBeHidden()
  await page.getByRole('button', { name: 'Files or photos' }).click()
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'New HTML' })).toBeVisible()
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'Existing HTML' })).toBeVisible()
  await expect(page.locator('.context-child-panel').getByText('Upload HTML')).toBeVisible()

  await page.getByRole('button', { name: /Design direction/ }).click()
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'New HTML' })).toBeHidden()
  await expect(page.getByTestId('design-direction-picker')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Scene/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Visual/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Advanced/ })).toBeVisible()
  await expect(page.getByTestId('scene-options')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('design-direction-picker')).toBeHidden()
})

test('workbench can choose capability distribution options', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  const preferenceSaves: Array<Promise<unknown>> = []
  page.on('requestfinished', request => {
    if (request.method() === 'PUT' && request.url().includes('/api/preferences')) {
      preferenceSaves.push(request.response())
    }
  })

  await page.getByRole('button', { name: /Design direction/ }).click()
  await page.getByTestId('scene-options').getByRole('button', { name: /Premium Product Page/ }).click()
  await page.getByRole('tab', { name: /Visual/ }).click()
  await page.getByTestId('visual-options').getByRole('button', { name: /Premium Minimal/ }).click()
  await page.getByRole('tab', { name: /Advanced/ }).click()
  await page.getByTestId('palette-options').getByRole('button', { name: /Minimal Mono/ }).click()
  await page.getByTestId('style-notes-input').fill('premium product storytelling')
  await page.getByTestId('brand-reference-options').getByRole('button', { name: /Apple-inspired/ }).click()
  await page.getByTestId('reference-brand-input').fill('Apple-inspired')
  await page.getByTestId('negative-requirements-input').fill('No busy gradients')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Add context' }).click()
  await page.getByRole('button', { name: 'Skills' }).click()
  await page.getByTestId('loop-profile-options').getByRole('button', { name: /Standard/ }).click()

  await expect(page.getByTestId('capability-summary')).toContainText('Premium Product Page')
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Minimal')
  await expect(page.getByTestId('capability-summary')).toContainText('Minimal Mono')
  await expect(page.getByTestId('capability-summary')).toContainText('Standard')
  await expect.poll(() => preferenceSaves.length).toBeGreaterThanOrEqual(4)
  await page.reload()
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Product Page')
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Minimal')
  await expect(page.getByTestId('capability-summary')).toContainText('Minimal Mono')

  await page.getByTestId('prompt-input').fill('A premium product page using selected capability distribution options')
  await page.getByTestId('generate-button').click()
  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Premium Product Page')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Premium Minimal')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Minimal Mono')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Apple-inspired')
  await page.getByTestId('open-variation-link').first().click()
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Premium Product Page')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Premium Minimal')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Minimal Mono')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Apple-inspired')
})

test('result wall explains partial and failed generation states', async ({ page }) => {
  await page.route('**/api/design-jobs/job_failed_case/stream', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: [
        'event: design.job_completed',
        `data: ${JSON.stringify({
          schemaVersion: '2026-06-26.dudesign-event.v1',
          type: 'design.job_completed',
          timestamp: new Date().toISOString(),
          sessionId: 'sess_failed_case',
          jobId: 'job_failed_case',
          payload: { completedVariationCount: 1, failedVariationCount: 1 },
        })}`,
        '',
        '',
      ].join('\n'),
    })
  })
  await page.route('**/api/design-jobs/job_failed_case', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job: {
          id: 'job_failed_case',
          status: 'completed',
          prompt: 'Partial failure state preview',
          variationCount: 2,
          capabilitySnapshot: null,
        },
        variations: [
          {
            id: 'var_completed_case',
            index: 1,
            title: 'Variation 01',
            status: 'completed',
            currentArtifactId: 'art_completed_case',
            previewUrl: '/api/variations/var_completed_case/preview',
            screenshotUrl: null,
            inputTokens: 100,
            outputTokens: 900,
            costCents: 2,
            errorCode: null,
            errorMessage: null,
          },
          {
            id: 'var_failed_case',
            index: 2,
            title: 'Variation 02',
            status: 'failed',
            currentArtifactId: null,
            previewUrl: null,
            screenshotUrl: null,
            inputTokens: 0,
            outputTokens: 0,
            costCents: 0,
            errorCode: 'RUNTIME_UNAVAILABLE',
            errorMessage: 'Runtime worker stopped before writing a preview.',
          },
        ],
        artifacts: [],
      }),
    })
  })

  await page.goto('/jobs/job_failed_case')
  await expect(page.getByTestId('job-outcome-banner')).toContainText('Partial results available')
  await expect(page.getByTestId('variation-card')).toHaveCount(2)
  await expect(page.getByTestId('variation-card').nth(1)).toContainText('Runtime temporarily unavailable')
  await expect(page.getByTestId('variation-card').nth(1).getByRole('button', { name: 'Unavailable' })).toBeDisabled()
})

test('global user action cluster opens and closes reserved menus', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('user-action-cluster')).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('user-action-menu')).toContainText('Model preferences')

  await page.getByTestId('prompt-input').click()
  await expect(page.getByTestId('user-action-menu')).toBeHidden()

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByTestId('user-action-menu')).toContainText('Keyboard shortcuts')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('user-action-menu')).toBeHidden()
})

test('settings menu switches global language between English and Chinese', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('user-action-cluster')).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('language-switcher')).toContainText('Language')
  await page.getByTestId('language-switcher').getByRole('button', { name: '中文' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByTestId('user-action-menu')).toContainText('模型偏好')
  await expect(page.getByRole('heading', { name: '今天想设计什么？' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建 HTML' })).toBeVisible()
  await expect(page.getByPlaceholder('描述页面、产品、受众与语气...')).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByTestId('user-action-menu')).toContainText('语言')

  await page.getByTestId('language-switcher').getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('runtime activity hides raw delta by default and code view uses a tail buffer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await page.getByTestId('prompt-input').fill('A long code tail buffer stress page with a private raw delta marker')
  await page.getByTestId('generate-button').click()

  await expect(page).toHaveURL(/\/jobs\/job_/)
  const activity = page.getByTestId('runtime-activity')
  await expect(activity).toContainText('Structured view')
  await expect(activity).toContainText(/Working on the page|Preparing HTML structure|Writing index.html/)
  expect((await activity.locator('.activity-row').allTextContents()).join('\n')).not.toContain('private raw delta marker')

  await activity.getByText('Debug raw assistant stream').click()
  await expect(activity).toContainText('private raw delta marker')

  await page.getByRole('button', { name: 'Code' }).first().click()
  await page.getByRole('button', { name: 'styles.css' }).first().click()
  await expect(page.getByTestId('variation-code-stream').first()).toContainText('tail buffer')
  await expect(page.getByTestId('code-tail-notice').first()).toContainText('compacted')
})
