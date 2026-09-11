import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const assets = new URL('apps/site/public/assets/', root);
await mkdir(assets, { recursive: true });
for (const [source, destination] of [
  ['apps/web/public/caselog-mark.svg', 'mark.svg'],
  ['apps/web/public/caselog-favicon.svg', 'favicon.svg'],
  ['apps/web/public/fonts/figtree-latin.woff2', 'figtree-latin.woff2'],
  ['apps/web/public/fonts/OFL.txt', 'font-LICENSE.txt'],
  ['LICENSE', 'LICENSE.txt'],
]) {
  await writeFile(new URL(destination, assets), await readFile(new URL(source, root)));
}
