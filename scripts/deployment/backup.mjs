import { constants } from 'node:fs';
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  checksum,
  deployment,
  execute,
  imageServices,
  inspectImage,
  volumeArchive,
  volumeKeys,
} from './backup-support.mjs';

const { values, compose, config } = await deployment({ output: { type: 'string' } });
if (!values.output)
  throw new Error('Provide --output with a new backup directory on protected storage');
const output = resolve(values.output);
const running = [];
const images = {};
for (const service of imageServices) {
  const { stdout } = await compose('ps', '--all', '-q', service);
  const ids = stdout.trim().split('\n').filter(Boolean);
  if (ids.length !== 1) throw new Error(`Expected one existing ${service} container`);
  const inspected = await execute('docker', ['inspect', ids[0]]);
  const [container] = JSON.parse(inspected.stdout);
  images[service] = await inspectImage(config.services[service].image);
  if (container.Image !== images[service].id)
    throw new Error(
      `Running ${service} differs from the configured image; retain the original image tag before backup`,
    );
  if (container.State.Running) running.push(service);
}
for (const key of volumeKeys)
  await execute('docker', ['volume', 'inspect', config.volumes[key].name]);
await mkdir(output, { mode: 0o700 });
let stopped = false;
try {
  console.log('Stopping API, web, object storage and PostgreSQL for a consistent offline snapshot');
  stopped = true;
  await compose('stop', 'web', 'api', 'minio', 'postgres');
  const snapshotAt = new Date().toISOString();
  await copyFile(
    resolve(values['env-file']),
    resolve(output, 'configuration.env'),
    constants.COPYFILE_EXCL,
  );
  await chmod(resolve(output, 'configuration.env'), 0o600);
  const files = { 'configuration.env': await checksum(resolve(output, 'configuration.env')) };
  for (const key of volumeKeys) {
    const name = `${key}.tar.gz`;
    await volumeArchive({
      image: images.postgres.id,
      volume: config.volumes[key].name,
      path: resolve(output, name),
    });
    files[name] = await checksum(resolve(output, name));
  }
  // Written last: absence of this manifest identifies an incomplete backup.
  await writeFile(
    resolve(output, 'manifest.json'),
    `${JSON.stringify(
      {
        format: 1,
        snapshotAt,
        createdAt: new Date().toISOString(),
        project: config.name,
        images,
        files,
      },
      null,
      2,
    )}\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Verified backup created at ${output}. Encrypt and copy it off-host with its application images.`,
  );
} finally {
  if (stopped && running.length) {
    await compose('start', '--wait', '--wait-timeout', '180', ...running);
    console.log('Previously running services resumed');
  }
}
