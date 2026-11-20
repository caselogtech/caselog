import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('translation checks ignore test fixtures and continue validating production sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'caselog-i18n-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'src/app/features/staff/tests/support'), { recursive: true });
    mkdirSync(join(root, 'public/i18n'), { recursive: true });
    const script = join(root, 'scripts/check-translations.mjs');
    copyFileSync(new URL('../../apps/web/scripts/check-translations.mjs', import.meta.url), script);
    writeFileSync(join(root, 'public/i18n/en.json'), '{}');
    for (const scope of [
      'auth',
      'projectSettings',
      'readiness',
      'releases',
      'staff',
      'workspace',
      'workspaceSettings',
    ]) {
      mkdirSync(join(root, `public/i18n/${scope}`), { recursive: true });
      writeFileSync(
        join(root, `public/i18n/${scope}/en.json`),
        JSON.stringify(scope === 'staff' ? { title: 'Staff' } : {}),
      );
    }
    const production = join(root, 'src/app/features/staff/staff.ts');
    writeFileSync(production, "export const titleKey = 'staff.title';\n");
    writeFileSync(
      join(root, 'src/app/features/staff/tests/support/audit.fixture.ts'),
      "export const action = 'staff.operator.granted';\n",
    );
    const valid = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    writeFileSync(production, "export const keys = ['staff.title', 'staff.missing'];\n");
    const invalid = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /staff\.missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
