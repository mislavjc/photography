import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the instant-navigation tests.
 *
 * Partial Prefetching (and therefore the prefetched shells that make
 * navigations instant) only runs in a *production* build, so these tests run
 * against `next build` + `next start` rather than the dev server. A dedicated
 * port keeps the test server from clashing with `pnpm dev` on 3000.
 *
 * Locally, `reuseExistingServer` lets you pre-start `pnpm start -p 3100` and
 * iterate without rebuilding each run.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
