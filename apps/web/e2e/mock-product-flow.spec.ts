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
  await page.getByRole('button', { name: 'Existing HTML', exact: true }).click()
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
})

test('composer menus close on outside click and do not stack', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What shall we design today?' })).toBeVisible()

  await page.getByRole('button', { name: /Type New HTML/ }).click()
  await expect(page.getByText('Generate a fresh standalone page.')).toBeVisible()

  await page.getByRole('button', { name: /Styles minimal, trustworthy/ }).click()
  await expect(page.getByText('Generate a fresh standalone page.')).toBeHidden()
  await expect(page.getByText('Style direction')).toBeVisible()

  await page.getByTestId('prompt-input').click()
  await expect(page.getByText('Style direction')).toBeHidden()
})
