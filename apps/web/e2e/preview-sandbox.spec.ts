import { expect, test, type Locator } from '@playwright/test'
import { createVariationThroughUi } from './helpers'

const API_BASE = process.env.DUDESIGN_API_URL ?? 'http://127.0.0.1:4000'

test('preview iframes keep strict sandbox boundaries', async ({ page }) => {
  await createVariationThroughUi(page, 'A landing page for preview sandbox E2E')

  const variationFrame = page.getByTestId('variation-preview-frame')
  await expectInteractivePreviewSandbox(variationFrame)
  await expect(variationFrame).toHaveAttribute('src', /\/api\/variations\/var_.*\/preview/)
  const previewSrc = await variationFrame.getAttribute('src')
  expect(previewSrc).toBeTruthy()
  await expectPreviewCspAllowsLocalScripts(previewSrc!)

  await page.getByTestId('share-button').click()
  const shareLink = page.getByTestId('share-link')
  await expect(shareLink).toBeVisible()

  const sharePagePromise = page.context().waitForEvent('page')
  await shareLink.click()
  const sharePage = await sharePagePromise
  await sharePage.waitForLoadState('domcontentloaded')

  const shareFrame = sharePage.getByTestId('share-preview-frame')
  await expectStrictSandbox(shareFrame)
  await expect(shareFrame).toHaveAttribute('srcdoc', /<!doctype html>/i)
})

async function expectInteractivePreviewSandbox(frame: Locator): Promise<void> {
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(frame).not.toHaveAttribute('sandbox', /allow-same-origin/)
  await expect(frame).not.toHaveAttribute('sandbox', /allow-forms/)
}

async function expectStrictSandbox(frame: Locator): Promise<void> {
  await expect(frame).toHaveAttribute('sandbox', '')
  await expect(frame).not.toHaveAttribute('sandbox', /allow-scripts/)
  await expect(frame).not.toHaveAttribute('sandbox', /allow-same-origin/)
  await expect(frame).not.toHaveAttribute('sandbox', /allow-forms/)
}

async function expectPreviewCspAllowsLocalScripts(pathOrUrl: string): Promise<void> {
  const url = new URL(pathOrUrl, API_BASE)
  const response = await fetch(url)
  expect(response.ok).toBe(true)
  const csp = response.headers.get('content-security-policy') ?? ''
  expect(csp).toContain("default-src 'none'")
  expect(csp).toContain("script-src 'self' 'unsafe-inline'")
  expect(csp).toContain("connect-src 'none'")
}
