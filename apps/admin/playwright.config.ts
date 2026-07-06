import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    baseURL: process.env.DUDESIGN_ADMIN_URL ?? 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  webServer: process.env.DUDESIGN_ADMIN_URL
    ? undefined
    : {
        command: 'npm --workspace @dudesign/admin run dev',
        url: 'http://localhost:3002',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
