import { readFileSync } from 'node:fs';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  site: process.env.DOCS_SITE || 'https://caselogtech.github.io',
  base: process.env.DOCS_BASE_PATH || '/',
  trailingSlash: 'always',
  vite: { build: { license: { fileName: 'third-party-licenses.txt' } } },
  integrations: [
    starlight({
      title: `Caselog ${version}`,
      logo: { src: '../web/public/caselog-mark.svg' },
      favicon: '/favicon.svg',
      description: 'Install, operate, and use Caselog release readiness and test management.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/caselogtech/caselog' }],
      editLink: { baseUrl: 'https://github.com/caselogtech/caselog/edit/main/apps/docs/' },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        { label: 'Start here', items: [{ autogenerate: { directory: 'start' } }] },
        { label: 'Test management', items: [{ autogenerate: { directory: 'testing' } }] },
        { label: 'Release readiness', items: [{ autogenerate: { directory: 'readiness' } }] },
        { label: 'API and automation', items: [{ autogenerate: { directory: 'automation' } }] },
        {
          label: 'Installation and reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
        { label: 'Documentation site', slug: 'documentation' },
      ],
    }),
  ],
});
