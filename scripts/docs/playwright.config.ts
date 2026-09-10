import { defineConfig } from '@playwright/test';

const basePath = (process.env.DOCS_BASE_PATH || '/').replace(/\/$/, '');

export default defineConfig({
  testDir: '.',
  testMatch: 'site.spec.ts',
  outputDir: '../../test-results/docs',
  timeout: 90_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:4322${basePath}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm docs:preview --host 127.0.0.1 --port 4322',
    // Astro 7 otherwise detaches automatically in agent environments, escaping test cleanup.
    env: { ASTRO_PREVIEW_BACKGROUND: '1' },
    cwd: '../..',
    url: `http://127.0.0.1:4322${basePath}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
