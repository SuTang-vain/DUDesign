import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['list']],
  use: {
    baseURL: process.env.DUDESIGN_WEB_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  webServer: process.env.DUDESIGN_WEB_URL
    ? undefined
    : [
        {
          command: 'npm --workspace @dudesign/api run dev',
          url: 'http://127.0.0.1:4000/api/dev/bootstrap',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: 'npm --workspace @dudesign/web run dev',
          url: 'http://localhost:3001',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
