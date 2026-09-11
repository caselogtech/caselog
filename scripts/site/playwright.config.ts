import { defineConfig } from '@playwright/test';

const basePath = (process.env.SITE_BASE_PATH || '/').replace(/\/$/, '');
const externalUrl = process.env.SITE_TEST_URL;

export default defineConfig({
  testDir: '.',
  testMatch: 'site.spec.ts',
  outputDir: '../../test-results/site',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: externalUrl || `http://127.0.0.1:4323${basePath}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm site:preview --host 127.0.0.1 --port 4323',
        env: { ASTRO_PREVIEW_BACKGROUND: '1' },
        cwd: '../..',
        url: `http://127.0.0.1:4323${basePath}/`,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
