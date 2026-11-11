import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 8787);

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/screens/**',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'UTC',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'node scripts/serve-mock.mjs',
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT) },
  },
});
