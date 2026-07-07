import { expect, test } from '@playwright/test'

test.describe('session authentication flow', () => {
  test.skip(process.env.DUDESIGN_AUTH_MODE !== 'session', 'Requires DUDESIGN_AUTH_MODE=session')

  test('registers a user, opens the workbench, signs out, and redirects anonymous users', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const email = `auth-${suffix}@example.com`

    await page.goto('/')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByTestId('auth-submit')).toBeVisible()

    await expect(page.getByTestId('auth-mode-toggle')).toHaveAttribute('data-ready', 'true')
    await page.getByTestId('auth-mode-toggle').click()
    await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
    await page.getByTestId('auth-name').fill('Browser Auth')
    await page.getByTestId('auth-email').fill(email)
    await page.getByTestId('auth-password').fill('correct-horse-battery')
    await page.getByTestId('auth-submit').click()

    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('workspace-selector')).toBeVisible()
    await expect(page.getByTestId('user-action-cluster')).toBeVisible()

    await expect(page.getByTestId('user-action-cluster')).toHaveAttribute('data-ready', 'true')
    await page.getByTestId('user-profile-button').click()
    await expect(page.getByTestId('sign-out-button')).toBeVisible()
    await page.getByTestId('sign-out-button').click()

    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
  })
})
