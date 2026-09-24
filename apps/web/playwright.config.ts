import { defineConfig, devices } from '@playwright/test';

// The specs clean up after themselves with the service role key from apps/web/.env.
try {
  process.loadEnvFile(new URL('./.env', import.meta.url));
} catch {
  // No env file: the dev server still starts, cleanup is skipped.
}

const port = Number(process.env.E2E_PORT ?? 3210);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { AI_PROVIDER: 'stub' },
  },
});
