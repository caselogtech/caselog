import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const root = resolve(__dirname, '../..');

export default defineConfig({
  testDir: './tests',
  outputDir: resolve(root, 'test-results/browser'),
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(root, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: resolve(root, 'apps/api'),
      url: 'http://127.0.0.1:3137/api/v1/health',
      timeout: 60_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'node scripts/browser/serve.mjs',
      cwd: root,
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
