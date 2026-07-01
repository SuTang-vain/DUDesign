import { expect, type Page } from '@playwright/test'

export async function createVariationThroughUi(page: Page, prompt: string): Promise<void> {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /What shall we design today/i })).toBeVisible()
  await expect(page.getByTestId('workspace-selector')).toContainText('Personal Workspace')
  await expect(page.getByTestId('generate-button')).toBeEnabled()

  await page.getByTestId('prompt-input').fill(prompt)
  await page.getByText('3 drafts').click()
  await page.getByTestId('variation-count-input').getByRole('button', { name: '3' }).click()
  await page.getByTestId('generate-button').click()

  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('variation-card')).toHaveCount(3)
  await expect(page.getByTestId('runtime-activity')).toContainText('Runtime activity')
  await expect(page.getByTestId('runtime-activity')).toContainText('Variation 01')
  await expect(page.getByTestId('runtime-activity')).toContainText(/Writing index.html|Finished index.html/)
  await expect(page.getByText('3 of 3 variations completed')).toBeVisible()
  await expect(page.locator('.variation-view-tabs')).toHaveCount(0)
  await expect(page.locator('.code-stream-trace')).toHaveCount(0)

  await page.getByTestId('open-variation-link').first().click()
  await expect(page).toHaveURL(/\/variations\/var_/)
  await expect(page.getByTestId('variation-preview')).toBeVisible()
  await page.getByRole('button', { name: 'Code' }).click()
  await expect(page.getByTestId('variation-code-view')).toContainText('index.html')
  await expect(page.getByTestId('variation-code-view')).toContainText(/<!doctype html|Mock preview/i)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByTestId('variation-preview')).toBeVisible()
}
