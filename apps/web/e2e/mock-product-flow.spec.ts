import { expect, test } from '@playwright/test'
import { createVariationThroughUi } from './helpers'

test('UX-M1 mock product flow works through browser clicks', async ({ page }) => {
  await createVariationThroughUi(page, 'A crisp landing page for a browser-click E2E design flow')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('download-html-button').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/variation-01-v1\.html/)
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
