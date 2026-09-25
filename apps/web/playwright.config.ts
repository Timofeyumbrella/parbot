import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// The specs clean up after themselves with the service role key from apps/web/.env.
// Playwright loads this file as CommonJS, so __dirname is available and import.meta is not.
try {
  process.loadEnvFile(path.resolve(__dirname, '.env'));
} catch {
  // No env file: the dev server still starts, cleanup is skipped.
}

const port = Number(process.env.E2E_PORT ?? 3210);
// `start` serves a production build (`pnpm build` first), which CI uses: no compile on the first
// visit to a route and hydration right after load. Locally the dev server is the default.
const server = process.env.E2E_WEB_SERVER === 'start' ? 'start' : 'dev';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Specs share one dev server and one local database; one file at a time keeps them honest.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Removes the throwaway accounts a failed or interrupted spec left in the shared database.
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm ${server} --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { AI_PROVIDER: 'stub' },
  },
});
