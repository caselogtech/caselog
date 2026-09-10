import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import {
  deployment,
  execute,
  imageServices,
  inspectImage,
  verifiedManifest,
  volumeArchive,
  volumeKeys,
} from './backup-support.mjs';

const { values, config } = await deployment({ backup: { type: 'string' } });
if (!values.backup || !values.project)
  throw new Error(
    'Provide --backup and an unused --project; existing installations are never overwritten',
  );
const directory = resolve(values.backup);
const manifest = await verifiedManifest(directory);
const original = parseEnv(await readFile(resolve(directory, 'configuration.env'), 'utf8'));
const target = parseEnv(await readFile(resolve(values['env-file']), 'utf8'));
for (const key of [
  'DATABASE_OWNER_PASSWORD',
  'DATABASE_RUNTIME_PASSWORD',
  'DATABASE_JOB_PASSWORD',
  'AUTH_SESSION_TOKEN_SECRET',
  'AUTH_ORGANIZATION_TOKEN_SECRET',
  'INTEGRATION_CREDENTIAL_MASTER_KEY',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
]) {
  if (!original[key] || target[key] !== original[key])
    throw new Error(`Restore must preserve ${key}; rotate credentials only after recovery`);
}
for (const service of imageServices) {
  const actual = await inspectImage(config.services[service].image);
  if (
    actual.id !== manifest.images[service]?.id ||
    actual.architecture !== manifest.images[service]?.architecture
  ) {
    throw new Error(`Restore requires the backed-up ${service} image and architecture`);
  }
}
const label = `label=com.docker.compose.project=${config.name}`;
for (const command of [
  ['ps', '-aq', '--filter', label],
  ['volume', 'ls', '-q', '--filter', label],
  ['network', 'ls', '-q', '--filter', label],
]) {
  if ((await execute('docker', command)).stdout.trim())
    throw new Error('Restore target is not empty; use a new Compose project');
}
// Named-volume overrides must not point to another project's existing data.
for (const key of volumeKeys) {
  const { stdout } = await execute('docker', ['volume', 'ls', '--format', '{{.Name}}']);
  if (stdout.split('\n').includes(config.volumes[key].name))
    throw new Error('A target volume already exists');
}
for (const key of volumeKeys) {
  const volume = config.volumes[key].name;
  await execute('docker', [
    'volume',
    'create',
    '--label',
    `com.docker.compose.project=${config.name}`,
    '--label',
    `com.docker.compose.volume=${key}`,
    volume,
  ]);
  await volumeArchive({
    image: manifest.images.postgres.id,
    volume,
    path: resolve(directory, `${key}.tar.gz`),
    restore: true,
  });
}
console.log(
  `Restored database and object volumes for ${config.name}. Services remain stopped. Review network isolation, SMTP and integration delivery before starting the restored stack.`,
);
