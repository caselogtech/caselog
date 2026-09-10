import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'deploy/.env' },
    'web-url': { type: 'string' },
    'storage-url': { type: 'string' },
    'mail-host': { type: 'string' },
    'mail-from': { type: 'string' },
  },
  strict: true,
});
for (const key of ['web-url', 'storage-url']) {
  const url = new URL(values[key] ?? '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error(`--${key} must be an HTTPS origin`);
}
for (const key of ['mail-host', 'mail-from']) {
  if (!values[key] || /[\r\n'"$#]/.test(values[key])) throw new Error(`Provide a valid --${key}`);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const secret = () => randomBytes(32).toString('hex');
const config = {
  CASELOG_VERSION: revision.slice(0, 12),
  CASELOG_REVISION: revision,
  WEB_BASE_URL: new URL(values['web-url']).origin,
  S3_PUBLIC_ENDPOINT: new URL(values['storage-url']).origin,
  WEB_BIND_PORT: '8080',
  S3_BIND_PORT: '9090',
  API_TRUST_PROXY_HOPS: '2',
  CASELOG_REGISTRATION_MODE: 'invitation_only',
  DATABASE_OWNER_PASSWORD: secret(),
  DATABASE_RUNTIME_PASSWORD: secret(),
  DATABASE_JOB_PASSWORD: secret(),
  AUTH_SESSION_TOKEN_SECRET: secret(),
  AUTH_ORGANIZATION_TOKEN_SECRET: secret(),
  INTEGRATION_CREDENTIAL_MASTER_KEY: randomBytes(32).toString('base64'),
  S3_ACCESS_KEY: `caselog-${randomBytes(8).toString('hex')}`,
  S3_SECRET_KEY: secret(),
  MAIL_HOST: values['mail-host'],
  MAIL_FROM: values['mail-from'],
  MAIL_PORT: '465',
  MAIL_SECURE: 'true',
};
await writeFile(
  values.output,
  `${Object.entries(config)
    .map(([key, value]) => `${key}='${value}'`)
    .join('\n')}\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log(
  `Created ${values.output}. Configure SMTP credentials if needed. Existing files are never overwritten.`,
);
