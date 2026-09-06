import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { importedModules } from '../typescript-imports.mjs';

const backend = resolve('scripts/check-backend-boundaries.mjs');
const frontend = resolve('scripts/check-frontend-boundaries.mjs');

test('parses static, side-effect, re-export, dynamic and require imports without matching comments', () => {
  assert.deepEqual(
    importedModules(`
    // import './ignored';
    import './side-effect';
    import { X } from './static';
    export { Y } from './export';
    void import('./dynamic');
    const z = require('./require');
    import a = require('./equals');
  `),
    ['./side-effect', './static', './export', './dynamic', './require', './equals'],
  );
});

test('backend rejects internal imports, reversed layers, core dependencies and composition cycles', async () => {
  await fixture(async (root, file) => {
    await file('apps/api/prisma/schema.prisma', '');
    await file(
      'apps/api/src/alpha/alpha.module.ts',
      "import { BetaModule } from '../beta/public-api';",
    );
    await file(
      'apps/api/src/beta/beta.module.ts',
      "import { AlphaModule } from '../alpha/public-api';",
    );
    await file(
      'apps/api/src/alpha/domain/rule.ts',
      "import '../../beta/infrastructure/private'; import '../application/service';",
    );
    await file('apps/api/src/core/leak.ts', "import '../alpha/public-api';");
    const result = spawnSync(process.execPath, [backend], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cross-feature import/);
    assert.match(result.stderr, /domain cannot import/);
    assert.match(result.stderr, /core cannot import/);
    assert.match(result.stderr, /dependency cycle/);
  });
});

test('frontend rejects core/shared feature access and cross-feature internals', async () => {
  await fixture(async (root, file) => {
    await file('apps/web/src/app/features/alpha/page.ts', "import '../beta/pages/private';");
    await file('apps/web/src/app/features/beta/public-api.ts', 'export {};');
    await file('apps/web/src/app/core/leak.ts', "import '../features/beta/public-api';");
    const result = spawnSync(process.execPath, [frontend], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cross-feature import/);
    assert.match(result.stderr, /core\/shared cannot import/);
  });
});

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'caselog-boundaries-'));
  try {
    await run(root, async (path, contents) => {
      const destination = join(root, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, contents);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
