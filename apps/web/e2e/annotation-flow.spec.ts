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

  await page.getByTestId('lock-version-button').click()
  await expect(page.getByTestId('variation-notice')).toContainText('Locked v2')
  await expect(page.getByTestId('locked-version-summary')).toContainText('Current version locked')

  const htmlVersionButtons = page.getByTestId('artifact-version-button').filter({ hasText: 'index.html' })
  await expect(htmlVersionButtons.filter({ hasText: 'v1' })).toHaveCount(1)
  await expect(htmlVersionButtons.filter({ hasText: 'v2' })).toHaveCount(1)
  await htmlVersionButtons.filter({ hasText: 'v1' }).click()
  await expect(page.getByTestId('variation-code-view')).toContainText('version 1')
  await htmlVersionButtons.filter({ hasText: 'v2' }).click()
  await expect(page.getByTestId('variation-code-view')).toContainText('version 2')
  await page.getByTestId('restore-version-button').click()
  await expect(page.getByTestId('locked-version-summary')).toContainText('Locked version differs')
})

test('annotation tools support circle arrow pen text and runtime summary is visible', async ({ page }) => {
  await createVariationThroughUi(page, 'A landing page for annotation tools E2E')

  await expect(page.getByTestId('runtime-summary-panel')).toContainText('Cost & runtime')
  await expect(page.getByTestId('runtime-summary-panel')).toContainText('Tokens')
  await page.getByTestId('annotation-draw-toggle').check()
  const overlay = page.getByTestId('annotation-overlay')
  const box = await overlay.boundingBox()
  expect(box).not.toBeNull()
  const rect = box!

  await page.getByTestId('annotation-tool-circle').click()
  await expect(page.getByTestId('annotation-tool-circle')).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * 0.34, rect.y + rect.height * 0.34)
  await page.mouse.up()
  await expect(page.getByTestId('annotation-circle')).toHaveCount(1)

  await page.getByTestId('annotation-tool-arrow').click()
  await expect(page.getByTestId('annotation-tool-arrow')).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(rect.x + rect.width * 0.5, rect.y + rect.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(rect.x + rect.width * 0.7, rect.y + rect.height * 0.36)
  await page.mouse.up()
  await expect(page.getByTestId('annotation-arrow')).toHaveCount(1)

  await page.getByTestId('annotation-tool-pen').click()
  await expect(page.getByTestId('annotation-tool-pen')).toHaveAttribute('aria-pressed', 'true')
  await overlay.evaluate((element, points) => {
    const pointerId = 27
    for (const [index, point] of points.entries()) {
      const eventType = index === 0 ? 'pointerdown' : 'pointermove'
      element.dispatchEvent(new PointerEvent(eventType, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
      }))
    }
    const lastPoint = points[points.length - 1]
    element.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      clientX: lastPoint.x,
      clientY: lastPoint.y,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
    }))
    element.dispatchEvent(new PointerEvent('pointerleave', {
      bubbles: true,
      cancelable: true,
      clientX: lastPoint.x,
      clientY: lastPoint.y,
      pointerId,
      pointerType: 'mouse',
      isPrimary: true,
    }))
  }, [
    { x: rect.x + rect.width * 0.25, y: rect.y + rect.height * 0.62 },
    { x: rect.x + rect.width * 0.32, y: rect.y + rect.height * 0.66 },
    { x: rect.x + rect.width * 0.42, y: rect.y + rect.height * 0.64 },
  ])
  await expect(page.getByTestId('annotation-pen')).toHaveCount(1)

  await page.getByTestId('annotation-tool-text').click()
  await expect(page.getByTestId('annotation-tool-text')).toHaveAttribute('aria-pressed', 'true')
  page.once('dialog', async dialog => {
    await dialog.accept('Clarify this label')
  })
  await overlay.evaluate((element, point) => {
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      pointerId: 31,
      pointerType: 'mouse',
      isPrimary: true,
    }))
  }, { x: rect.x + rect.width * 0.62, y: rect.y + rect.height * 0.62 })
  await expect(page.getByTestId('annotation-overlay').getByText(/Clarify this label/)).toBeVisible()
  await expect(page.getByText('4 annotations staged.')).toBeVisible()
  await expect(page.getByTestId('annotation-list-row')).toHaveCount(4)

  await page.getByTestId('annotation-list-row').nth(1).getByRole('button').first().click()
  await expect(page.getByTestId('annotation-list-row').nth(1)).toHaveClass(/active/)
  await expect(page.getByTestId('annotation-arrow')).toHaveClass(/selected/)

  page.once('dialog', async dialog => {
    await expect(dialog.message()).toContain('Edit annotation note')
    await dialog.accept('Clarify the revised label')
  })
  await page.getByTestId('edit-annotation-button').click()
  await expect(page.getByTestId('annotation-list').getByText(/Clarify the revised label/)).toBeVisible()

  await page.getByTestId('delete-annotation-button').first().click()
  await expect(page.getByTestId('annotation-list-row')).toHaveCount(3)
  await expect(page.getByText('3 annotations staged.')).toBeVisible()
})
