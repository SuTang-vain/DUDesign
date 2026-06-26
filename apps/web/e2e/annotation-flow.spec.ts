import { expect, test } from '@playwright/test'
import { createVariationThroughUi } from './helpers'

test('annotation rect can refine the current variation', async ({ page }) => {
  await createVariationThroughUi(page, 'A landing page for annotation browser E2E')

  await expect(page.getByTestId('current-artifact-version')).toContainText('v1')

  await page.getByTestId('annotation-draw-toggle').check()
  const overlay = page.getByTestId('annotation-overlay')
  await expect(overlay).toBeVisible()

  const box = await overlay.boundingBox()
  expect(box).not.toBeNull()
  const rect = box!
  await page.mouse.move(rect.x + rect.width * 0.18, rect.y + rect.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * 0.48, rect.y + rect.height * 0.42)
  await page.mouse.up()

  await expect(page.getByTestId('annotation-rect')).toHaveCount(1)
  await expect(page.getByText('1 annotation staged.')).toBeVisible()
  await expect(page.getByTestId('apply-annotations-button')).toBeEnabled()

  await page.getByTestId('apply-annotations-button').click()
  await expect(page.getByTestId('current-artifact-version')).toContainText('v2')
  await expect(page.getByText('0 annotations staged.')).toBeVisible()
})
