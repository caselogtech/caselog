import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://caselog.tech',
  base: process.env.SITE_BASE_PATH || '/',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
  vite: { build: { license: { fileName: 'third-party-licenses.txt' } } },
});
