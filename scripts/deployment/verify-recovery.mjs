import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyRecovery({
  compose,
  composeArgs,
  execute,
  directory,
  project,
  envFile,
  client,
  transfers,
  email,
  password,
}) {
  const target = `${project}-restore`;
  const backup = join(directory, 'backup');
  const restored = (...args) =>
    execute('docker', [...composeArgs.map((arg) => (arg === project ? target : arg)), ...args], {
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  const script = (name, args) =>
    execute(process.execPath, [`scripts/deployment/${name}.mjs`, '--env-file', envFile, ...args], {
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  const historyQuery =
    "SELECT json_agg(d ORDER BY id)::text FROM readiness_decisions d WHERE id IN ('00000000-0000-4000-8000-000000000541', '00000000-0000-4000-8000-000000000542')";
  const sql = (command, query) =>
    command(
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'caselog_owner',
      '-d',
      'caselog',
      '-Atc',
      query,
    );
  try {
    // Demo fixtures are added only inside this random test installation.
    await compose('run', '--rm', 'migrate', 'db', 'seed');
    const before = await sql(compose, historyQuery);
    assert.equal(JSON.parse(before.stdout).length, 2, 'Expected realistic readiness history');
    const backupResult = await script('backup', ['--project', project, '--output', backup]);
    assert.match(backupResult.stdout, /Previously running services resumed/u);
    assert.equal((await client.get('/api/v1/health')).status(), 200);
    await assert.rejects(
      script('restore', ['--project', project, '--backup', backup]),
      /target is not empty/u,
    );
    const configuration = await readFile(join(backup, 'configuration.env'));
    await appendFile(join(backup, 'configuration.env'), '\n# corrupted backup\n');
    await assert.rejects(
      script('restore', ['--project', target, '--backup', backup]),
      /checksum mismatch/u,
    );
    await writeFile(join(backup, 'configuration.env'), configuration);
    await compose('stop', 'web', 'api', 'minio', 'postgres', 'mailpit');
    await script('restore', ['--project', target, '--backup', backup]);
    assert.equal((await restored('ps', '-q')).stdout.trim(), '', 'Restore must not start services');
    await restored('up', '-d', '--wait', '--wait-timeout', '180');
    const after = await sql(restored, historyQuery);
    assert.equal(after.stdout, before.stdout, 'Historical decisions must be restored unchanged');
    const login = await client.post('/api/v1/auth/login', { data: { email, password } });
    assert.equal(login.status(), 200);
    const session = await login.json();
    const workspaces = await client.get('/api/v1/auth/workspaces', {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    assert.match(await workspaces.text(), /Deployment workspace/u);
    const download = await client.get(transfers.download.url);
    assert.equal(download.status(), 200);
    assert.equal(await download.text(), 'Production storage check');
    const state = await sql(restored, 'SELECT count(*) FROM pgboss.version');
    assert.equal(state.stdout.trim(), '1');
    console.log(
      'Verified consistent backup/restore, history and S3 preservation, queue recovery and refusal of corrupt or nonempty targets',
    );
  } finally {
    await restored('down', '--volumes', '--remove-orphans');
  }
}
