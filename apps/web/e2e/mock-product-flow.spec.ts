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

test('share page hydrates with stored Chinese language preference', async ({ page }) => {
  const hydrationErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Hydration failed')) {
      hydrationErrors.push(message.text())
    }
  })

  await createVariationThroughUi(page, 'A share hydration smoke page for DUDesign')
  await page.evaluate(() => window.localStorage.setItem('dudesign.language', 'zh'))
  await page.getByTestId('share-button').click()
  const shareLink = page.getByTestId('share-link')
  await expect(shareLink).toBeVisible()
  const shareHref = await shareLink.getAttribute('href')

  await page.goto(shareHref ?? '')
  await expect(page).toHaveURL(/\/share\/share_/)
  await expect(page.getByTestId('share-preview')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect(hydrationErrors).toEqual([])
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
  await expect(page.getByTestId('job-capability-snapshot')).toHaveCount(0)
})

test('composer menus close on outside click and do not stack', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  await expect(page.getByRole('button', { name: 'Files or photos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connectors' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plugins' })).toBeVisible()
  await expect(page.locator('.context-child-panel')).toHaveAttribute('data-active-panel', 'files')
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'New HTML' })).toBeVisible()
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'Existing HTML' })).toBeVisible()
  await expect(page.locator('.context-child-panel').getByText('Upload HTML')).toBeVisible()

  await page.getByTestId('template-pill-trigger').click()
  await expect(page.locator('.context-child-panel').getByRole('button', { name: 'New HTML' })).toBeHidden()
  await expect(page.getByTestId('design-direction-picker')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Scene/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Visual/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Advanced/ })).toBeVisible()
  await expect(page.getByTestId('scene-options')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('design-direction-picker')).toBeHidden()
})

test('context child preview remains stable while hovering skills', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  const addContextMenu = page.locator('.paired-popover-wrap').first()
  await expect(addContextMenu).toBeVisible()

  const skills = page.getByRole('button', { name: /Skills/ })
  await skills.hover()
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
  await expect(addContextMenu.locator('.context-child-panel')).toHaveAttribute('data-active-panel', 'skills')

  const firstBox = await addContextMenu.boundingBox()
  await page.waitForTimeout(120)
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
  const secondBox = await addContextMenu.boundingBox()
  expect(Math.round(secondBox?.width ?? 0)).toBe(Math.round(firstBox?.width ?? 0))
  expect(Math.round(secondBox?.height ?? 0)).toBe(Math.round(firstBox?.height ?? 0))

  await page.getByRole('button', { name: /Plugins/ }).hover()
  await expect(addContextMenu.locator('.context-child-panel')).toHaveAttribute('data-active-panel', 'plugins')
  await page.getByRole('button', { name: /Skills/ }).hover()
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
})

test('design direction and model menus render within the composer viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByTestId('template-pill-trigger').click()
  const directionPopover = page.getByTestId('template-direct-popover')
  await expect(directionPopover).toBeVisible()
  await expect(page.getByTestId('design-direction-picker')).toBeVisible()
  await expect(directionPopover).toContainText(/Portfolio|Product|Dashboard|Landing/)
  await expect(directionPopover).toContainText('Standard')
  await expectPopoverInViewport(page, directionPopover)

  await page.getByTestId('model-pill-trigger').click()
  const modelPopover = page.locator('.paired-popover-model')
  await expect(modelPopover).toBeVisible()
  await expect(page.getByTestId('model-paired-popover')).toBeVisible()
  await expect(modelPopover).toContainText('BabeL-O')
  await expectPopoverInViewport(page, modelPopover)
})

test('workbench can choose capability distribution options', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await expect(page.getByTestId('workspace-selector')).toContainText('Personal Workspace')
  await expect(page.getByTestId('generate-button')).toBeEnabled()

  const preferenceSaves: Array<Promise<unknown>> = []
  page.on('requestfinished', request => {
    if (request.method() === 'PUT' && request.url().includes('/api/preferences')) {
      preferenceSaves.push(request.response())
    }
  })

  await page.getByTestId('template-pill-trigger').click()
  await expect(page.getByTestId('template-direct-popover')).toBeVisible()
  await expect(page.getByTestId('scene-options')).toBeVisible()
  await page.getByTestId('scene-options').getByRole('button', { name: /Premium Product Page/ }).click()
  await page.getByRole('tab', { name: /Visual/ }).click()
  await page.getByTestId('visual-options').getByRole('button', { name: /Premium Minimal/ }).click()
  await page.getByRole('tab', { name: /Advanced/ }).click()
  await expect(page.getByTestId('advanced-options')).toBeVisible()
  await expect(page.getByTestId('design-system-upgrade-path')).toContainText('Design System')
  await expect(page.getByTestId('design-system-upgrade-path')).toContainText('Alpha reserve')
  await page.getByTestId('palette-options').getByRole('button', { name: /Minimal Mono/ }).click()
  await page.getByTestId('style-notes-input').fill('premium product storytelling')
  await expect(page.getByTestId('brand-reference-options')).toBeVisible()
  const appleReference = page.getByTestId('brand-reference-options').getByText('Apple-inspired', { exact: true })
  await appleReference.scrollIntoViewIfNeeded()
  await expect(appleReference).toBeVisible()
  await appleReference.click()
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
  await expect(page.getByTestId('job-capability-snapshot')).toHaveCount(0)
  const variationUrl = await page.getByTestId('open-variation-link').first().getAttribute('href')
  expect(variationUrl).toMatch(/^\/variations\/var_/)
  await page.goto(variationUrl!)
  const directionTab = page.getByTestId('side-panel-tab-direction')
  await expect(directionTab).toBeVisible()
  await directionTab.scrollIntoViewIfNeeded()
  await directionTab.click({ force: true })
  await expect(directionTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Premium Product Page')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Premium Minimal')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Minimal Mono')
})

async function expectPopoverInViewport(page: import('@playwright/test').Page, locator: import('@playwright/test').Locator): Promise<void> {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()
  expect(Math.floor(box!.x)).toBeGreaterThanOrEqual(0)
  expect(Math.ceil(box!.x + box!.width)).toBeLessThanOrEqual(viewport!.width)
  expect(Math.floor(box!.y)).toBeGreaterThanOrEqual(0)
  expect(Math.ceil(box!.y + box!.height)).toBeLessThanOrEqual(viewport!.height)
}

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

test('result wall surfaces artifact preview visibility issues', async ({ page }) => {
  await page.route('**/api/design-jobs/job_quality_case/stream', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: [
        'event: design.job_completed',
        `data: ${JSON.stringify({
          schemaVersion: '2026-06-26.dudesign-event.v1',
          type: 'design.job_completed',
          timestamp: new Date().toISOString(),
          sessionId: 'sess_quality_case',
          jobId: 'job_quality_case',
          payload: { completedVariationCount: 1, failedVariationCount: 0 },
        })}`,
        '',
        '',
      ].join('\n'),
    })
  })
  await page.route('**/api/design-jobs/job_quality_case', async route => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        job: {
          id: 'job_quality_case',
          status: 'completed',
          prompt: 'Quality gate preview',
          variationCount: 1,
          capabilitySnapshot: null,
          designTemplatePacks: [],
        },
        variations: [
          {
            id: 'var_quality_case',
            index: 1,
            title: 'Variation 01',
            status: 'completed',
            currentArtifactId: 'art_quality_black_shell',
            previewUrl: '/api/variations/var_quality_case/preview',
            screenshotUrl: null,
            designTemplatePack: null,
            inputTokens: 110,
            outputTokens: 880,
            costCents: 2,
            errorCode: null,
            errorMessage: null,
          },
        ],
        artifacts: [
          {
            id: 'art_quality_black_shell',
            variationId: 'var_quality_case',
            version: 1,
            kind: 'html',
            entryPath: 'index.html',
            parentArtifactId: null,
            screenshotDevice: null,
            url: null,
            quality: {
              status: 'fail',
              issues: ['Preview appears blank black, empty, or stuck on a loading shell.'],
            },
          },
        ],
      }),
    })
  })

  await page.goto('/jobs/job_quality_case')
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('variation-quality-banner')).toContainText('Quality failed')
  await expect(page.getByTestId('variation-quality-banner')).toContainText(/blank black|loading shell/)
})

test('user workbench exposes basic accessible controls', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'More' })).toBeVisible()
  await expect(page.getByRole('button', { name: /User profile for/ })).toBeVisible()
  await expect(page.getByTestId('workspace-selector')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('prompt-input')).toHaveAttribute('aria-label', 'Design prompt')
  await page.getByTestId('prompt-input').fill('')
  await expect(page.getByTestId('generate-button')).toBeDisabled()

  await page.getByTestId('prompt-input').fill('Accessible smoke prompt')
  await expect(page.getByTestId('generate-button')).toBeEnabled()
  await page.getByTestId('template-pill-trigger').click()
  await expect(page.getByRole('tablist', { name: 'Design direction' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Scene/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /Visual/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Advanced/ })).toBeVisible()
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
  await expect(page.getByTestId('user-action-menu')).toContainText('模型与生成偏好')
  await expect(page.getByRole('heading', { name: '今天我们设计点什么?' })).toBeVisible()
  await expect(page.getByRole('button', { name: '全新 HTML' })).toBeVisible()
  await expect(page.getByPlaceholder('描述你想要的页面:行业、用途、风格、关键模块…')).toBeVisible()

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByTestId('user-action-menu')).toContainText('语言')

  await page.getByTestId('language-switcher').getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('runtime activity hides raw delta and completed cards keep preview clean', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await page.getByTestId('prompt-input').fill('A long code tail buffer stress page with a private raw delta marker')
  await page.getByTestId('generate-button').click()

  await expect(page).toHaveURL(/\/jobs\/job_/)
  const activity = page.getByTestId('runtime-activity')
  await expect(activity).toContainText('Overall')
  await expect(activity).toContainText('Variation status')
  await expect(activity).toContainText(/Generating|Completed|Rendering preview|DONE|readying preview/)
  const streamGridHeight = await page.locator('.stream-grid').evaluate(node => node.clientHeight)
  expect(streamGridHeight).toBeLessThanOrEqual(680)
  const codePaneMetrics = await page.locator('.stream-code pre').evaluate(node => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
  }))
  expect(codePaneMetrics.clientHeight).toBeLessThanOrEqual(680)
  expect(codePaneMetrics.scrollHeight).toBeGreaterThanOrEqual(codePaneMetrics.clientHeight)
  expect((await activity.locator('.runtime-status-card, .rt-card').allTextContents()).join('\n')).not.toContain('private raw delta marker')
  expect((await activity.locator('.runtime-recent, .activity').allTextContents()).join('\n')).not.toContain('private raw delta marker')

  await activity.getByText('Debug raw assistant stream').click()
  await expect(activity).toContainText('private raw delta marker')

  await expect(page.getByText(/3\s*\/\s*3 variations completed/)).toBeVisible()
  await expect(page.locator('.variation-view-tabs')).toHaveCount(0)
  await expect(page.locator('.code-stream-trace')).toHaveCount(0)
})
