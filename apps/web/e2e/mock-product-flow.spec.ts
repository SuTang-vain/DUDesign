import { expect, test } from '@playwright/test'
import { createVariationThroughUi } from './helpers'

const API_BASE = process.env.DUDESIGN_API_URL ?? 'http://127.0.0.1:4000'

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
  await page.getByRole('button', { name: 'Add context' }).click()
  await expect(page.getByTestId('context-direct-popover')).toBeVisible()
  await page.getByRole('button', { name: /Existing HTML/ }).click()
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
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Design direction')
})

test('composer menus close on outside click and do not stack', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  await expect(page.getByText('Generate a fresh standalone page.')).toBeVisible()
  await expect(page.getByText('Continue from an uploaded page.')).toBeVisible()
  await expect(page.getByText('Use a local .html file')).toBeVisible()

  await page.getByTestId('template-pill-trigger').click()
  await expect(page.getByText('Generate a fresh standalone page.')).toBeHidden()
  await expect(page.getByTestId('design-direction-picker')).toBeVisible()
  await expect(page.getByTestId('template-library-picker').getByText('Template library')).toBeVisible()
  await expect(page.getByRole('button', { name: /Custom/ })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('design-direction-picker')).toBeHidden()
})

test('context child preview remains stable while hovering automation and plugins', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  const addContextMenu = page.locator('.context-aggregate').first()
  await expect(addContextMenu).toBeVisible()

  const flow = page.getByRole('button', { name: /^Automation/ })
  await flow.hover()
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
  await expect(addContextMenu.locator('.context-child-panel')).toHaveAttribute('data-active-panel', 'loop')

  const firstBox = await addContextMenu.boundingBox()
  await page.waitForTimeout(120)
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
  const secondBox = await addContextMenu.boundingBox()
  expect(Math.round(secondBox?.width ?? 0)).toBe(Math.round(firstBox?.width ?? 0))
  expect(Math.round(secondBox?.height ?? 0)).toBe(Math.round(firstBox?.height ?? 0))

  await page.getByRole('button', { name: /^Plugins/ }).hover()
  await expect(addContextMenu.locator('.context-child-panel')).toHaveAttribute('data-active-panel', 'plugins')
  await expect(page.getByTestId('plugin-filter-all')).toBeVisible()
  await expect(page.getByTestId('plugin-filter-mcp_tool')).toBeVisible()
  await expect(page.getByTestId('plugin-filter-skill')).toBeVisible()
  const pluginCards = page.locator('.skill-cards')
  await expect(pluginCards.getByText('MCP tool').first()).toBeVisible()
  await expect(pluginCards.getByText('Skill').first()).toBeVisible()
  await page.getByTestId('plugin-filter-mcp_tool').click()
  await expect(pluginCards.getByText('MCP tool').first()).toBeVisible()
  await expect(pluginCards.getByText('Skill')).toHaveCount(0)
  await page.getByTestId('plugin-filter-skill').click()
  await expect(pluginCards.getByText('Skill').first()).toBeVisible()
  await expect(pluginCards.getByText('MCP tool')).toHaveCount(0)
  await page.getByRole('button', { name: /^Automation/ }).hover()
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
  await expect(directionPopover).toContainText(/Template library|Design system/)
  await expectPopoverInViewport(page, directionPopover)

  await page.getByTestId('model-pill-trigger').click()
  const modelPopover = page.getByTestId('model-direct-popover')
  await expect(modelPopover).toBeVisible()
  await expect(page.getByTestId('model-paired-popover')).toBeVisible()
  await expect(modelPopover).toContainText('BabeL-O')
  await expectPopoverInViewport(page, modelPopover)
})

test('workbench can choose capability distribution options', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()
  await expect(page.getByTestId('workspace-selector')).toContainText('Personal Workspace')
  await expect(page.getByTestId('generate-button')).toBeDisabled()

  const preferenceSaves: Array<Promise<unknown>> = []
  page.on('requestfinished', request => {
    if (request.method() === 'PUT' && request.url().includes('/api/preferences')) {
      preferenceSaves.push(request.response())
    }
  })

  await page.getByTestId('template-pill-trigger').click()
  await expect(page.getByTestId('template-direct-popover')).toBeVisible()
  await expect(page.getByTestId('template-library-picker').getByText('Template library')).toBeVisible()
  await page.getByRole('button', { name: /Scene/ }).click()
  await expect(page.getByTestId('scene-options')).toBeVisible()
  await page.getByTestId('scene-options').getByRole('button', { name: /Premium Product Page/ }).click()
  await page.getByRole('button', { name: /Custom/ }).click()
  await page.getByTestId('visual-options').getByRole('button', { name: /Premium Minimal/ }).click()
  await expect(page.getByTestId('advanced-options')).toBeVisible()
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
  await page.getByRole('button', { name: /^Plugins/ }).click()
  await page.getByTestId('plugin-filter-skill').click()
  await page.getByTestId('plugin-card-plug_static_export_safe').click()
  await page.getByRole('button', { name: 'Automation' }).click()
  await expect(page.getByTestId('loop-profile-options')).toBeVisible()
  await page.getByTestId('loop-profile-options').getByRole('button', { name: /Standard/ }).click()

  await expect(page.getByTestId('capability-summary')).toContainText('Premium Product Page')
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Minimal')
  await expect(page.getByTestId('capability-summary')).toContainText('Minimal Mono')
  await expect(page.getByTestId('capability-summary')).toContainText('Static Export Safe')
  await expect(page.getByTestId('capability-summary')).toContainText('Standard')
  await expect.poll(() => preferenceSaves.length).toBeGreaterThanOrEqual(4)
  await page.reload()
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Product Page')
  await expect(page.getByTestId('capability-summary')).toContainText('Premium Minimal')
  await expect(page.getByTestId('capability-summary')).toContainText('Minimal Mono')
  await page.getByRole('button', { name: 'Add context' }).click()
  await page.getByRole('button', { name: /^Plugins/ }).click()
  await page.getByTestId('plugin-filter-skill').click()
  await page.getByTestId('plugin-card-plug_static_export_safe').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('capability-summary')).toContainText('Static Export Safe')

  await page.getByTestId('template-pill-trigger').click()
  await page.getByRole('button', { name: /Template pack/ }).click()
  await expect(page.getByTestId('template-library-picker')).toBeVisible()
  await page.getByTestId('template-card-dtp_premium_product_launch').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('capability-summary')).toContainText('1 templates')

  await page.getByTestId('prompt-input').fill('A premium product page using selected capability distribution options')
  await expect(page.getByTestId('generate-button')).toBeEnabled()
  await page.getByTestId('generate-button').click()
  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Premium Product Page')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Trustworthy SaaS')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Blue White Trust')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Static Export Safe')
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Standard')
  const jobId = page.url().match(/\/jobs\/([^/?#]+)/)?.[1]
  expect(jobId).toBeTruthy()
  const jobSnapshotResponse = await page.request.get(`${API_BASE}/api/design-jobs/${jobId}`)
  expect(jobSnapshotResponse.ok()).toBe(true)
  const jobPayload = await jobSnapshotResponse.json() as {
    job: {
      designTemplatePacks: Array<{ id: string }>
      capabilitySnapshot: {
        template: {
          domainTemplate: { id: string }
          aestheticProfile: { id: string }
          colorPalette: { id: string }
        }
        plugins: { skillIds: string[]; mcpToolIds: string[] }
        automation: { loopProfile: { id: string } }
      }
    }
  }
  expect(jobPayload.job.designTemplatePacks.map(pack => pack.id)).toContain('dtp_premium_product_launch')
  expect(jobPayload.job.capabilitySnapshot.template.domainTemplate.id).toBe('tpl_premium_product_page')
  expect(jobPayload.job.capabilitySnapshot.template.aestheticProfile.id).toBe('aes_trustworthy_saas')
  expect(jobPayload.job.capabilitySnapshot.template.colorPalette.id).toBe('pal_blue_white_trust')
  expect(jobPayload.job.capabilitySnapshot.plugins.skillIds).toContain('sk_static_export_safe')
  expect(jobPayload.job.capabilitySnapshot.plugins.mcpToolIds).toEqual([])
  expect(jobPayload.job.capabilitySnapshot.automation.loopProfile.id).toBe('loop_standard')
  const variationUrl = await page.getByTestId('open-variation-link').first().getAttribute('href')
  expect(variationUrl).toMatch(/^\/variations\/var_/)
  await page.goto(variationUrl!)
  const directionTab = page.getByTestId('side-panel-tab-direction')
  await expect(directionTab).toBeVisible()
  await directionTab.scrollIntoViewIfNeeded()
  await directionTab.click({ force: true })
  await expect(directionTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Premium Product Page')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Trustworthy SaaS')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Blue White Trust')
  await expect(page.getByTestId('variation-capability-snapshot')).toContainText('Static Export Safe')
})

test('workbench can choose an official safe skill and see the job capability snapshot', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Add context' }).click()
  await page.getByRole('button', { name: /^Plugins/ }).click()
  await expect(page.getByTestId('plugins-picker')).toBeVisible()
  await page.getByTestId('plugin-filter-skill').click()
  const staticExportPlugin = page.getByTestId('plugin-card-plug_static_export_safe')
  await expect(staticExportPlugin).toBeVisible()
  await staticExportPlugin.click()

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('capability-summary')).toContainText('Static Export Safe')
  await page.getByTestId('prompt-input').fill('A static landing page generated with an official safe skill')

  const createJobResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/design-jobs') && response.request().method() === 'POST',
  )
  await page.getByTestId('generate-button').click()
  const createJobResponse = await createJobResponsePromise
  expect(createJobResponse.ok()).toBe(true)
  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('job-capability-snapshot')).toContainText('Static Export Safe')

  const jobId = page.url().match(/\/jobs\/([^/?#]+)/)?.[1]
  expect(jobId).toBeTruthy()
  const jobSnapshotResponse = await page.request.get(`${API_BASE}/api/design-jobs/${jobId}`)
  expect(jobSnapshotResponse.ok()).toBe(true)
  const jobPayload = await jobSnapshotResponse.json() as {
    job: {
      capabilitySnapshot: {
        plugins: {
          skillIds: string[]
          mcpToolIds: string[]
          pluginSnapshot: {
            skills: Array<{ id: string }>
            toolPolicy: {
              allowedMcpToolIds: string[]
              mode?: string
            }
          }
        }
      }
    }
  }
  expect(jobPayload.job.capabilitySnapshot.plugins.skillIds).toContain('sk_static_export_safe')
  expect(jobPayload.job.capabilitySnapshot.plugins.mcpToolIds).toEqual([])
  expect(jobPayload.job.capabilitySnapshot.plugins.pluginSnapshot.skills.map(skill => skill.id)).toContain('sk_static_export_safe')
  expect(jobPayload.job.capabilitySnapshot.plugins.pluginSnapshot.toolPolicy.allowedMcpToolIds).toEqual([])
})

test('workbench can import DESIGN.md and generate with the private template', async ({ page }) => {
  const templateName = `Browser Private Template ${Date.now()}`
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByTestId('template-pill-trigger').click()
  await expect(page.getByTestId('template-library-picker')).toBeVisible()
  await page.getByRole('button', { name: /Mine/ }).click()
  await page.getByRole('button', { name: /Import DESIGN\.md/ }).click()
  await page.getByPlaceholder('Template name (optional)').fill(templateName)
  await page.getByTestId('import-design-md-textarea').fill(privateDesignMd(templateName))

  const importResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/design-templates/import-design-md') && response.request().method() === 'POST',
  )
  await page.getByTestId('import-design-md-submit').click()
  const importResponse = await importResponsePromise
  expect(importResponse.ok()).toBe(true)
  const importPayload = await importResponse.json() as { template: { id: string; name: string; source: string } }
  expect(importPayload.template.name).toBe(templateName)
  expect(importPayload.template.source).toBe('user')

  await expect(page.getByText('Template imported.')).toBeVisible()
  const importedCard = page.getByTestId(`template-card-${importPayload.template.id}`)
  await expect(importedCard).toBeVisible()
  await expect(importedCard).toHaveClass(/active/)
  await expect(page.getByTestId('capability-summary')).toContainText('1 templates')

  await page.keyboard.press('Escape')
  await page.getByTestId('prompt-input').fill('A landing page generated from an imported private DESIGN.md template')
  const createJobResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/design-jobs') && response.request().method() === 'POST',
  )
  await page.getByTestId('generate-button').click()
  const createJobResponse = await createJobResponsePromise
  expect(createJobResponse.ok()).toBe(true)
  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()

  const jobId = page.url().match(/\/jobs\/([^/?#]+)/)?.[1]
  expect(jobId).toBeTruthy()
  const jobSnapshotResponse = await page.request.get(`${API_BASE}/api/design-jobs/${jobId}`)
  expect(jobSnapshotResponse.ok()).toBe(true)
  const jobPayload = await jobSnapshotResponse.json() as {
    job: {
      designTemplatePacks: Array<{ id: string; name: string; source: string }>
    }
    variations: Array<{ designTemplatePack: { id: string; name: string } | null }>
  }
  expect(jobPayload.job.designTemplatePacks).toHaveLength(1)
  expect(jobPayload.job.designTemplatePacks[0]).toMatchObject({
    id: importPayload.template.id,
    name: templateName,
    source: 'user',
  })
  expect(jobPayload.variations[0]?.designTemplatePack).toMatchObject({
    id: importPayload.template.id,
    name: templateName,
  })
})

test('dynamic encyclopedia mode guides entry classification before creating a job', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: 'Dynamic encyclopedia card' }).click()
  await expect(page.getByTestId('prompt-input')).toHaveAttribute('placeholder', 'Enter an encyclopedia entry name or content...')
  await expect(page.getByTestId('capability-summary')).toContainText('Dynamic Encyclopedia Entry')
  await expect(page.getByTestId('capability-summary')).toContainText('1 templates')
  await expect(page.getByTestId('capability-summary')).toContainText('Encyclopedia Spec Review')

  await page.getByTestId('prompt-input').fill('百度百科：一家以搜索、人工智能和知识服务为核心的互联网公司')
  const guidanceResponsePromise = page.waitForResponse(response =>
    response.url().includes('/api/encyclopedia/entry-guidance') && response.request().method() === 'POST',
  )
  await page.getByTestId('generate-button').click()
  const guidanceResponse = await guidanceResponsePromise
  expect(guidanceResponse.ok()).toBe(true)
  const guidancePayload = await guidanceResponse.json() as {
    guidanceId: string
    requiresConfirmation: boolean
    democaseReferences: Array<{ caseId: string; matchedKeywords: string[]; score: number }>
    interactionParadigm: { id: string }
  }
  expect(guidancePayload.requiresConfirmation).toBe(false)
  expect(guidancePayload.democaseReferences[0]?.caseId).toBe('demo_baidu_baike_company')
  expect(guidancePayload.democaseReferences[0]?.matchedKeywords).toContain('百度百科')
  expect(guidancePayload.democaseReferences[0]?.score).toBeGreaterThan(0)
  expect(guidancePayload.interactionParadigm.id).toBe('ip_entity_summary')

  await expect(page.getByTestId('entry-guidance-summary')).toBeVisible()
  await page.getByTestId('generate-button').click()
  await expect(page).toHaveURL(/\/jobs\/job_/)

  const jobId = page.url().match(/\/jobs\/([^/?#]+)/)?.[1]
  expect(jobId).toBeTruthy()
  const jobSnapshotResponse = await page.request.get(`${API_BASE}/api/design-jobs/${jobId}`)
  expect(jobSnapshotResponse.ok()).toBe(true)
  const jobPayload = await jobSnapshotResponse.json() as {
    job: {
      productMode: string
      capabilitySnapshot: {
        template: { domainTemplate: { id: string } }
        plugins: { skillIds: string[]; mcpToolIds: string[] }
        automation: { loopProfile: { id: string } }
      }
      designTemplatePacks: Array<{ id: string }>
    }
  }
  expect(jobPayload.job.productMode).toBe('dynamic_encyclopedia_card')
  expect(jobPayload.job.capabilitySnapshot.template.domainTemplate.id).toBe('tpl_dynamic_encyclopedia_entry')
  expect(jobPayload.job.capabilitySnapshot.plugins.skillIds).toContain('sk_encyclopedia_entry_guidance')
  expect(jobPayload.job.capabilitySnapshot.plugins.mcpToolIds).toContain('mcp_encyclopedia_democase_readonly')
  expect(jobPayload.job.capabilitySnapshot.automation.loopProfile.id).toBe('loop_encyclopedia_spec_review')
  expect(jobPayload.job.designTemplatePacks[0]?.id).toBe('dtp_dynamic_encyclopedia_summary_card')
})

test('dynamic encyclopedia mode holds low confidence entries for confirmation and template selection', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Dynamic encyclopedia card' }).click()
  await page.getByTestId('prompt-input').fill('baidu baike')
  await page.getByTestId('generate-button').click()

  await expect(page.getByTestId('entry-guidance-summary')).toBeVisible()
  await expect(page.getByTestId('entry-guidance-summary')).toContainText('知识 / 知识术语')
  await expect(page.getByTestId('entry-guidance-summary')).toContainText('Low confidence')
  await expect(page.getByTestId('entry-guidance-democase-demo_baidu_baike_company')).toBeVisible()
  await page.getByTestId('entry-guidance-democase-demo_baidu_baike_company').locator('summary').click()
  await expect(page.getByTestId('entry-guidance-democase-demo_baidu_baike_company')).toContainText('Matched keywords')
  await expect(page.getByTestId('entry-guidance-democase-demo_baidu_baike_company')).toContainText('baidu baike')
  await expect(page.getByTestId('entry-guidance-democase-demo_baidu_baike_company')).toContainText('Score')
  await expect(page.getByTestId('entry-guidance-classification-游戏')).toBeVisible()
  await page.getByTestId('entry-guidance-classification-游戏').click()
  await expect(page.getByTestId('entry-guidance-classification-游戏')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('entry-guidance-template-dtp_dynamic_encyclopedia_timeline_card')).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/\/$/)

  const confirmResponsePromise = page.waitForResponse(response =>
    /\/api\/encyclopedia\/entry-guidance\/[^/]+\/confirm$/.test(new URL(response.url()).pathname) && response.request().method() === 'POST',
  )
  await page.getByTestId('generate-button').click()
  const confirmResponse = await confirmResponsePromise
  expect(confirmResponse.ok()).toBe(true)
  await expect(page).toHaveURL(/\/jobs\/job_/)

  const jobId = page.url().match(/\/jobs\/([^/?#]+)/)?.[1]
  expect(jobId).toBeTruthy()
  const jobSnapshotResponse = await page.request.get(`${API_BASE}/api/design-jobs/${jobId}`)
  expect(jobSnapshotResponse.ok()).toBe(true)
  const jobPayload = await jobSnapshotResponse.json() as {
    job: {
      productMode: string
      designTemplatePacks: Array<{ id: string }>
      templateRequirements: { businessContext: { interactionParadigmId: string } } | null
    }
  }
  expect(jobPayload.job.productMode).toBe('dynamic_encyclopedia_card')
  expect(jobPayload.job.designTemplatePacks.map(pack => pack.id)).toContain('dtp_dynamic_encyclopedia_timeline_card')
  expect(jobPayload.job.templateRequirements?.businessContext.interactionParadigmId).toBe('ip_timeline_story')
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

function privateDesignMd(name: string): string {
  return `---
name: ${name}
description: Browser E2E private template.
colors:
  primary: "#2347FF"
  on-primary: "#FFFFFF"
  surface: "#F7F8FC"
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: 700
  body:
    fontFamily: Inter
    fontSize: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
---

## Overview

Browser imported private template for SaaS-style landing pages.

## Do's and Don'ts

- Do: Use clear sections and generous whitespace.
- Don't: Use decorative noise.
`
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
  await expect(page.getByTestId('variation-card').nth(1).getByTestId('user-facing-error')).toContainText('Retry generation')
})

test('result wall surfaces artifact preview visibility issues', async ({ page }) => {
  const reviewActions: string[] = []
  let persistedReviewStatus: 'repair_queued' | 'skipped' | null = null
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
          productMode: 'dynamic_encyclopedia_card',
          variationCount: 1,
          capabilitySnapshot: {
            schemaVersion: '2026-07-01.dudesign-capabilities.v2',
            template: {
              domainTemplate: { id: 'tpl_dynamic_encyclopedia_entry', name: 'Dynamic Encyclopedia Entry' },
              aestheticProfile: { id: 'aes_dynamic_encyclopedia', name: 'Dynamic Encyclopedia' },
              colorPalette: { id: 'pal_dynamic_encyclopedia', name: 'Dynamic Encyclopedia Blue' },
              brandStyleReference: null,
            },
            automation: {
              loopProfile: { id: 'loop_encyclopedia_spec_review', name: 'Encyclopedia Spec Review' },
              maxRepairAttempts: 1,
            },
            plugins: { skillIds: ['sk_encyclopedia_entry_guidance'], mcpToolIds: ['mcp_encyclopedia_democase_readonly'] },
          },
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
            reviewAction: persistedReviewStatus
              ? {
                action: persistedReviewStatus === 'repair_queued' ? 'confirm_repair' : 'skip',
                status: persistedReviewStatus,
                artifactId: 'art_quality_black_shell',
                artifactVersion: 1,
                createdAt: new Date().toISOString(),
              }
              : null,
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
  await page.route('**/api/variations/var_quality_case/review-actions', async route => {
    const body = route.request().postDataJSON() as { action: string; artifactId?: string | null }
    reviewActions.push(body.action)
    expect(body.artifactId).toBe('art_quality_black_shell')
    persistedReviewStatus = body.action === 'confirm_repair' ? 'repair_queued' : 'skipped'
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: body.action,
        status: body.action === 'confirm_repair' ? 'repair_queued' : 'skipped',
        variation: {
          id: 'var_quality_case',
          currentArtifactId: 'art_quality_black_shell',
          previewUrl: '/api/variations/var_quality_case/preview',
          screenshotUrl: null,
        },
        artifact: {
          id: 'art_quality_black_shell',
          kind: 'html',
          version: 1,
          entryPath: 'index.html',
          createdAt: new Date().toISOString(),
          quality: {
            status: 'fail',
            issues: ['Preview appears blank black, empty, or stuck on a loading shell.'],
          },
        },
        queueJob: body.action === 'confirm_repair'
          ? {
            idempotencyKey: 'queue:refine:automation-loop:art_quality_black_shell:attempt:1',
            kind: 'automation_refine_job',
            status: 'queued',
          }
          : undefined,
        message: body.action === 'confirm_repair' ? 'Repair request queued.' : 'Review repair skipped.',
      }),
    })
  })

  await page.goto('/jobs/job_quality_case')
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('variation-quality-banner')).toContainText('Quality failed')
  await expect(page.getByTestId('variation-quality-banner')).toContainText(/blank black|loading shell/)
  await expect(page.getByTestId('review-pending-panel')).toContainText('Review pending')
  await expect(page.getByTestId('review-pending-panel')).toContainText('Spec review failed')
  await expect(page.getByRole('link', { name: 'Manual edit' })).toHaveAttribute('href', '/variations/var_quality_case')
  await page.getByRole('button', { name: 'Confirm repair' }).click()
  await expect(page.getByTestId('review-pending-panel')).toContainText('Repair request is queued')
  expect(reviewActions).toEqual(['confirm_repair'])
  await page.reload()
  await expect(page.getByTestId('review-pending-panel')).toContainText('Repair request is queued')
  await expect(page.getByRole('button', { name: 'Confirm repair' })).toHaveCount(0)
  persistedReviewStatus = null
  await page.reload()
  await expect(page.getByTestId('review-pending-panel')).toContainText('Review pending')
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('review-pending-panel')).toHaveCount(0)
  expect(reviewActions).toEqual(['confirm_repair', 'skip'])
  await page.reload()
  await expect(page.getByTestId('review-pending-panel')).toHaveCount(0)
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
  await expect(page.getByTestId('template-library-picker').getByText('Template library')).toBeVisible()
  await expect(page.getByRole('button', { name: /Scene/ })).toHaveAttribute('aria-expanded', 'false')
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
  await expect(page.getByRole('heading', { name: /今天我们\s*设计\s*点什么\?/ })).toBeVisible()
  await page.getByRole('button', { name: '添加上下文' }).click()
  await expect(page.getByRole('button', { name: /全新 HTML/ })).toBeVisible()
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

  await expect(page.getByText(/3\s*\/\s*3 completed/)).toBeVisible()
  await expect(page.locator('.variation-view-tabs')).toHaveCount(0)
  await expect(page.locator('.code-stream-trace')).toHaveCount(0)
})
