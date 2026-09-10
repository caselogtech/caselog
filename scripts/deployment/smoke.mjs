import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as upstreamRequest } from 'node:http';
import { createServer } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, request } from '@playwright/test';
import { verifyRecovery } from './verify-recovery.mjs';

const execute = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'caselog-deployment-'));
const project = `caselog-smoke-${randomUUID().slice(0, 8)}`;
const envFile = join(directory, '.env');
const overrideFile = join(directory, 'compose.yaml');
const composeArgs = [
  'compose',
  '-p',
  project,
  '--env-file',
  envFile,
  '-f',
  resolve('deploy/compose.yaml'),
  '-f',
  overrideFile,
];
const compose = (...args) =>
  execute('docker', [...composeArgs, ...args], { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
const servers = [];
let browser;
let client;
let started = false;

async function unusedPort() {
  const server = createTcpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function tlsProxy(targetPort, certificate) {
  const server = createServer(certificate, (incoming, outgoing) => {
    const forwarded = upstreamRequest(
      {
        hostname: '127.0.0.1',
        port: targetPort,
        path: incoming.url,
        method: incoming.method,
        headers: {
          ...incoming.headers,
          'x-forwarded-proto': 'https',
          'x-forwarded-for': incoming.socket.remoteAddress,
        },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    forwarded.on('error', () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(forwarded);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `https://127.0.0.1:${server.address().port}`;
}

async function post(path, data, token) {
  const response = await client.post(`/api/v1/${path}`, {
    data,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  assert.ok(response.ok(), `${path}: HTTP ${response.status()}`);
  return response;
}

try {
  const webPort = await unusedPort();
  const storagePort = await unusedPort();
  const mailPort = await unusedPort();
  await execute('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-keyout',
    join(directory, 'key.pem'),
    '-out',
    join(directory, 'cert.pem'),
  ]);
  const certificate = {
    key: await readFile(join(directory, 'key.pem')),
    cert: await readFile(join(directory, 'cert.pem')),
  };
  const webUrl = await tlsProxy(webPort, certificate);
  const storageUrl = await tlsProxy(storagePort, certificate);
  await execute(process.execPath, [
    'scripts/deployment/configure.mjs',
    '--output',
    envFile,
    '--web-url',
    webUrl,
    '--storage-url',
    storageUrl,
    '--mail-host',
    'mailpit',
    '--mail-from',
    'Caselog <caselog@example.com>',
  ]);
  let config = await readFile(envFile, 'utf8');
  config = config
    .replace(/CASELOG_VERSION='[^']+'/u, "CASELOG_VERSION='hardening'")
    .replace("WEB_BIND_PORT='8080'", `WEB_BIND_PORT='${webPort}'`)
    .replace("S3_BIND_PORT='9090'", `S3_BIND_PORT='${storagePort}'`)
    .replace("MAIL_PORT='465'", "MAIL_PORT='1025'")
    .replace("MAIL_SECURE='true'", "MAIL_SECURE='false'");
  await writeFile(envFile, config);
  await writeFile(
    overrideFile,
    `services:
  mailpit:
    image: axllent/mailpit@sha256:0059ef81e492a7192af3816281eed6859eb078bd7bdc58b76757c13e10e53a7d
    ports: ['127.0.0.1:${mailPort}:8025']
  api:
    environment:
      CASELOG_REGISTRATION_MODE: public
`,
  );
  if (!process.argv.includes('--skip-build')) {
    console.log('Building API, web and migration images');
    await compose('build');
  }
  console.log('Starting a fresh production installation with isolated volumes');
  started = true;
  await compose('up', '-d', '--wait', '--wait-timeout', '180');
  client = await request.newContext({ baseURL: webUrl, ignoreHTTPSErrors: true });
  assert.equal((await client.get('/api/v1/health')).status(), 200);
  assert.equal((await client.get('/api/v1/metrics')).status(), 404);
  const password = `${randomBytes(24).toString('hex')}Aa1!`;
  const email = 'operator@example.com';
  const registration = await post('auth/register', {
    displayName: 'Deployment operator',
    email,
    password,
  });
  assert.match(registration.headers()['set-cookie'], /Secure/);
  const session = await registration.json();
  const messages = await (await fetch(`http://127.0.0.1:${mailPort}/api/v1/messages`)).json();
  assert.equal(messages.messages.length, 1, 'Verification email must reach SMTP');
  const message = await (
    await fetch(`http://127.0.0.1:${mailPort}/api/v1/message/${messages.messages[0].ID}`)
  ).json();
  const verificationLink = message.Text.match(/https:\/\/[^\s]+\/auth\/verify\?token=[^\s]+/u)?.[0];
  assert.ok(verificationLink, 'Email must contain the configured HTTPS verification URL');
  await post('auth/email/verify', { token: new URL(verificationLink).searchParams.get('token') });
  const workspace = await (
    await post(
      'auth/workspaces',
      { name: 'Deployment workspace', slug: 'deployment' },
      session.accessToken,
    )
  ).json();
  assert.equal(workspace.workspace.role, 'owner');
  const organization = await (
    await post('auth/organizations/deployment/token', {}, session.accessToken)
  ).json();
  await post(
    'projects',
    { name: 'Deployment project', key: 'DEP', slug: 'deployment' },
    organization.accessToken,
  );
  console.log('Verified registration, SMTP, secure session cookies and first workspace ownership');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto(`${webUrl}/auth/login`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/auth/workspaces');
  const signed = await compose(
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    `
    const {createHash}=require('node:crypto');
    const {S3StorageProvider}=require('./dist/core/storage/infrastructure/adapters/s3-storage.provider');
    const {createStorageConfig}=require('./dist/core/storage/infrastructure/config/storage.config');
    (async()=>{
      const storage=new S3StorageProvider(createStorageConfig());
      const body=Buffer.from('Production storage check');
      const upload=await storage.createUploadUrl({storageKey:'deployment-check',contentType:'text/plain',
        sizeBytes:body.length,checksumSha256:createHash('sha256').update(body).digest('hex')});
      const download=await storage.createDownloadUrl('deployment-check','evidence.txt','text/plain');
      console.log(JSON.stringify({upload,download}));
    })().catch(()=>process.exit(1));`,
  );
  const transfers = JSON.parse(signed.stdout);
  assert.equal(new URL(transfers.upload.url).origin, storageUrl);
  const transferred = await page.evaluate(async ({ upload, download }) => {
    const result = await fetch(upload.url, {
      method: 'PUT',
      headers: upload.headers,
      body: 'Production storage check',
    });
    return { status: result.status, content: await (await fetch(download.url)).text() };
  }, transfers);
  assert.deepEqual(transferred, { status: 200, content: 'Production storage check' });
  assert.deepEqual(browserErrors, []);
  const user = await compose('exec', '-T', 'api', 'id', '-u');
  assert.notEqual(user.stdout.trim(), '0');
  const runtime = await compose(
    'exec',
    '-T',
    'api',
    'node',
    '-e',
    `const {PrismaService}=require('./dist/core/database/infrastructure/prisma/prisma.service'); (async()=>{ const db=new PrismaService(); await db.onModuleInit(); const rows=await db.project.findMany(); if(rows.length)throw Error('Tenant context leaked'); await db.onModuleDestroy(); })().catch(()=>process.exit(1));`,
  );
  assert.equal(runtime.stderr, '');
  const jobs = await compose(
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'caselog_owner',
    '-d',
    'caselog',
    '-Atc',
    "SELECT has_table_privilege('caselog_jobs','public.projects','SELECT')",
  );
  assert.equal(jobs.stdout.trim(), 'f');
  console.log(
    'Verified browser login, HTTPS/CORS S3 transfers, non-root API and tenant/job database isolation',
  );
  await verifyRecovery({
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
  });
} catch (error) {
  if (started) {
    const logs = await compose('logs', '--tail', '40', 'api', 'migrate', 'database-access');
    console.error(logs.stdout);
  }
  throw error;
} finally {
  await browser?.close();
  await client?.dispose();
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (started) await compose('down', '--volumes', '--remove-orphans');
  await rm(directory, { recursive: true, force: true });
}
