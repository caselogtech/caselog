import { importedModules } from './typescript-imports.mjs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const featuresSource = resolve('apps/web/src/app/features');
const appSource = resolve('apps/web/src/app');

const violations = [];

for (const file of await typescriptFiles(appSource)) {
  const appPath = normalize(relative(appSource, file));
  const projectPath = normalize(relative(featuresSource, file));
  const sourceFeature = projectPath.split('/')[0];
  if (!sourceFeature) continue;

  const source = await readFile(file, 'utf8');
  for (const specifier of importedModules(source)) {
    if (!specifier.startsWith('.')) continue;

    const targetPath = normalize(relative(featuresSource, resolve(dirname(file), specifier)));
    if (targetPath.startsWith('../')) continue;

    const [targetFeature, ...targetSegments] = targetPath.split('/');
    if (appPath.startsWith('core/') || appPath.startsWith('shared/')) {
      violations.push(`${appPath}: core/shared cannot import feature '${specifier}'`);
      continue;
    }
    if (!appPath.startsWith('features/')) continue;
    if (!targetFeature || targetFeature === sourceFeature) continue;

    const targetModule = targetSegments.join('/').replace(/\.ts$/, '');
    if (targetModule !== 'public-api') {
      violations.push(
        `${projectPath}: cross-feature import '${specifier}' must use ${targetFeature}/public-api`,
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`Frontend architecture boundary violations:\n${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Frontend architecture boundaries verified.\n');
}

async function typescriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

function normalize(path) {
  return path.split(sep).join('/');
}
