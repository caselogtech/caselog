import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
if (!process.env.MIGRATION_DATABASE_URL) throw new Error('MIGRATION_DATABASE_URL is required');
const databaseName = `caselog_browser_${randomBytes(8).toString('hex')}`;
const databaseUrl = new URL(process.env.MIGRATION_DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.search = '?schema=public';
const applicationUrl = new URL(databaseUrl);
applicationUrl.searchParams.set('options', '-c role=caselog_app');
const environment = {
  ...process.env,
  NODE_ENV: 'test',
  API_PORT: '3137',
  WEB_BASE_URL: 'http://127.0.0.1:4317',
  MIGRATION_DATABASE_URL: databaseUrl.toString(),
  DATABASE_URL: applicationUrl.toString(),
  JOB_DATABASE_URL: databaseUrl.toString(),
  CASELOG_DEPLOYMENT_MODE: 'self_hosted',
  CASELOG_REGISTRATION_MODE: 'public',
  CASELOG_WORKSPACE_CREATION_ENABLED: 'true',
  CASELOG_MANAGED_BILLING_ENABLED: 'false',
  CASELOG_MAX_WORKSPACES_PER_USER: '',
  AUTH_SESSION_TOKEN_SECRET: randomBytes(32).toString('hex'),
  AUTH_ORGANIZATION_TOKEN_SECRET: randomBytes(32).toString('hex'),
  INTEGRATION_CREDENTIAL_MASTER_KEY: randomBytes(32).toString('base64'),
  LOG_LEVEL: 'error',
};
delete environment.CASELOG_STAFF_BOOTSTRAP_EMAIL;
const admin = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  created = true;
  for (const args of [
    ['db:migrate:deploy'],
    ['db:seed'],
    [
      'exec',
      'playwright',
      'test',
      '--config',
      'scripts/browser/playwright.config.ts',
      ...process.argv.slice(2),
    ],
  ]) {
    const exitCode = await run(args);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      const diagnostics = new Client({ connectionString: databaseUrl.toString() });
      try {
        await diagnostics.connect();
        const { rows } = await diagnostics.query(
          'SELECT name, state, count(*)::int FROM pgboss.job GROUP BY name, state ORDER BY name, state',
        );
        console.error('Browser job diagnostics:', rows);
      } catch {
        console.error('Browser job diagnostics unavailable');
      } finally {
        await diagnostics.end();
      }
      break;
    }
  }
} finally {
  // Only this invocation's random database can be removed.
  if (created) await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);
  await admin.end();
}
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { env: environment, stdio: 'inherit' });
    const cancel = () => child.kill('SIGTERM');
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    child.once('error', reject);
    child.once('exit', (code) => {
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', cancel);
      resolve(code ?? 2);
    });
  });
}
