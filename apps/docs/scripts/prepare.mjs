import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const content = resolve(root, 'apps/docs/src/content/docs/reference');
const downloads = resolve(root, 'apps/docs/public/downloads');
await mkdir(content, { recursive: true });
await mkdir(downloads, { recursive: true });

// Tracked operator guides remain the source of truth for both GitHub and the website.
const sources = [
  ['deploy/README.md', 'installation', 'Install Caselog'],
  ['deploy/RECOVERY.md', 'recovery', 'Backups, restores, and upgrades'],
  ['apps/cli/README.md', 'cli', 'CLI reference'],
  ['examples/ci/README.md', 'ci-examples', 'CI examples'],
  ['SUPPORT.md', 'compatibility', 'Versions and compatibility'],
  ['CHANGELOG.md', 'release-notes', 'Release notes'],
  ['CONTRIBUTING.md', 'contributing', 'Contribute to Caselog'],
  ['SECURITY.md', 'security', 'Report a vulnerability'],
];
const sitePaths = new Map(sources.map(([source, slug]) => [resolve(root, source), `../${slug}/`]));
for (const [source, slug, title] of sources) {
  const path = resolve(root, source);
  let markdown = (await readFile(path, 'utf8')).replace(/^# .+\r?\n/, '');
  markdown = markdown.replace(/\]\(([^)]+)\)/g, (match, href) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) return match;
    const [relativePath, anchor] = href.split('#');
    const target = resolve(dirname(path), relativePath);
    const mapped = sitePaths.get(target);
    const link =
      mapped ?? `https://github.com/caselogtech/caselog/blob/main/${target.slice(root.length)}`;
    return `](${link}${anchor ? `#${anchor}` : ''})`;
  });
  await writeFile(
    resolve(content, `${slug}.md`),
    `---\ntitle: ${JSON.stringify(title)}\neditUrl: https://github.com/caselogtech/caselog/edit/main/${source}\n---\n${markdown}`,
  );
}
await writeFile(
  resolve(downloads, 'openapi.json'),
  await readFile(resolve(root, 'apps/api/openapi.json')),
);
await writeFile(resolve(downloads, 'LICENSE.txt'), await readFile(resolve(root, 'LICENSE')));
console.log(`Prepared ${sources.length} reference pages from tracked sources.`);
