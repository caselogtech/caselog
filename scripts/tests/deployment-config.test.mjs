import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('deployment configuration protects generated secrets and refuses overwrites or unsafe origins', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caselog-config-'));
  const output = join(directory, '.env');
  const run = (webUrl) =>
    spawnSync(
      process.execPath,
      [
        'scripts/deployment/configure.mjs',
        '--output',
        output,
        '--web-url',
        webUrl,
        '--storage-url',
        'https://objects.example.com',
        '--mail-host',
        'smtp.example.com',
        '--mail-from',
        'Caselog <caselog@example.com>',
      ],
      { encoding: 'utf8' },
    );
  try {
    assert.notEqual(run('http://caselog.example.com').status, 0);
    assert.notEqual(run('https://caselog.example.com/path').status, 0);
    const result = run('https://caselog.example.com');
    assert.equal(result.status, 0, result.stderr);
    const config = await readFile(output, 'utf8');
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const secrets = [...config.matchAll(/(?:PASSWORD|SECRET)='([^']+)'/g)].map((match) => match[1]);
    assert.equal(new Set(secrets).size, secrets.length);
    for (const secret of secrets) assert.equal(result.stdout.includes(secret), false);
    assert.notEqual(run('https://caselog.example.com').status, 0);
    assert.equal(await readFile(output, 'utf8'), config);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
