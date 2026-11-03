import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env.e2e', override: true })

const databaseUrl = process.env.E2E_DATABASE_URL
if (!databaseUrl) {
  throw new Error('E2E_DATABASE_URL is required. Set it in .env.e2e to a separate, disposable PostgreSQL database.')
}

const e2eDatabase = new URL(databaseUrl)
const configuredDatabaseUrls = [process.env.DATABASE_URL]
for (const filename of ['.env.local', '.env']) {
  if (existsSync(filename)) {
    const values = dotenv.parse(readFileSync(filename))
    configuredDatabaseUrls.push(values.DATABASE_URL)
  }
}
for (const configuredUrl of configuredDatabaseUrls) {
  if (!configuredUrl) continue
  const configuredDatabase = new URL(configuredUrl)
  if (e2eDatabase.hostname === configuredDatabase.hostname && e2eDatabase.pathname === configuredDatabase.pathname) {
    throw new Error('E2E_DATABASE_URL points to the same database as a configured DATABASE_URL. Use a separate disposable database or Neon branch.')
  }
}

const baseURL = 'http://127.0.0.1:4179'
const e2eAuthSecret = process.env.E2E_AUTH_SECRET ?? randomBytes(32).toString('hex')

export default defineConfig({
  testDir: './tests/e2e',
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results/playwright',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'api', testMatch: '**/*.api.spec.ts' },
    { name: 'chromium', testMatch: '**/*.ui.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'tsx server/dev.ts',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        AUTH_SECRET: e2eAuthSecret,
        APP_URL: baseURL,
        API_PORT: '3001',
        NODE_ENV: 'test',
        RESEND_API_KEY: '',
        EMAIL_FROM: '',
      },
    },
    {
      command: 'npm.cmd run dev:web -- --host 127.0.0.1 --port 4179 --strictPort',
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { NODE_ENV: 'test' },
    },
  ],
})
