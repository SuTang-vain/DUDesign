import { expect, type Page } from '@playwright/test'

export async function createVariationThroughUi(page: Page, prompt: string): Promise<void> {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Design your page in parallel/i })).toBeVisible()
  await expect(page.getByText('Personal Workspace')).toBeVisible()
  await expect(page.getByTestId('generate-button')).toBeEnabled()

  await page.getByTestId('prompt-input').fill(prompt)
  await page.getByTestId('variation-count-input').fill('3')
  await page.getByTestId('generate-button').click()

  await expect(page).toHaveURL(/\/jobs\/job_/)
  await expect(page.getByTestId('variation-grid')).toBeVisible()
  await expect(page.getByTestId('variation-card')).toHaveCount(3)
  await expect(page.getByText('3 of 3 variations completed')).toBeVisible()

  await page.getByTestId('open-variation-link').first().click()
  await expect(page).toHaveURL(/\/variations\/var_/)
  await expect(page.getByRole('heading', { name: /Variation 01/i })).toBeVisible()
  await expect(page.getByTestId('variation-preview')).toBeVisible()
}
