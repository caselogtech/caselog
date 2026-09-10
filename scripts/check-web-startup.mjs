import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function startupBundle(stats) {
  const entries = Object.entries(stats.outputs).filter(
    ([, value]) => value.entryPoint === 'src/main.ts',
  );
  if (entries.length !== 1) throw new Error('Expected one browser entry point in Angular stats');
  const pending = entries.map(([path]) => path);
  const seen = new Set();
  const schemas = new Set();
  let bytes = 0;
  while (pending.length) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    const output = stats.outputs[path];
    if (!output) throw new Error(`Missing static import in build stats: ${path}`);
    seen.add(path);
    bytes += output.bytes;
    for (const dependency of output.imports ?? []) {
      if (dependency.kind !== 'dynamic-import' && !dependency.external)
        pending.push(dependency.path);
    }
    for (const [input, contribution] of Object.entries(output.inputs ?? {})) {
      if (contribution.bytesInOutput <= 0) continue;
      const schema = input.match(/packages\/schemas\/src\/([^/]+)\.ts$/u)?.[1];
      if (schema) schemas.add(schema);
    }
  }
  return { bytes, files: seen.size, schemas: [...schemas].sort() };
}

export function checkStartup(bundle) {
  const budget = 875_000;
  if (bundle.bytes > budget)
    throw new Error(`Static startup JavaScript is ${bundle.bytes} bytes; budget is ${budget}`);
  const startupSchemas = new Set([
    'api-error',
    'auth',
    'instance',
    'invitation',
    'member',
    'organization',
    'health',
  ]);
  const unexpected = bundle.schemas.filter((schema) => !startupSchemas.has(schema));
  if (unexpected.length)
    throw new Error(`Feature schemas loaded before navigation: ${unexpected.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const stats = JSON.parse(
    await readFile(resolve(process.argv[2] ?? 'apps/web/dist/caselog-web/stats.json'), 'utf8'),
  );
  const bundle = startupBundle(stats);
  checkStartup(bundle);
  console.log(
    `Static startup JavaScript: ${bundle.bytes} bytes across ${bundle.files} files; schemas: ${bundle.schemas.join(', ')}`,
  );
}
