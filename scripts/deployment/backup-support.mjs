import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parseArgs, promisify } from 'node:util';

export const execute = promisify(execFile);
export const volumeKeys = ['postgres-data', 'object-data'];
export const imageServices = ['api', 'web', 'migrate', 'postgres', 'minio'];

export async function deployment(options) {
  const { values } = parseArgs({
    options: {
      'env-file': { type: 'string', default: 'deploy/.env' },
      project: { type: 'string' },
      ...options,
    },
    strict: true,
  });
  if (values.project && !/^[a-z0-9][a-z0-9_-]{0,62}$/u.test(values.project))
    throw new Error('Invalid Compose project name');
  const args = [
    'compose',
    '--env-file',
    resolve(values['env-file']),
    '-f',
    resolve('deploy/compose.yaml'),
  ];
  if (values.project) args.push('-p', values.project);
  const compose = (...command) =>
    execute('docker', [...args, ...command], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
  const { stdout } = await compose('config', '--format', 'json');
  const config = JSON.parse(stdout);
  return { values, compose, config };
}

export async function inspectImage(reference) {
  const { stdout } = await execute('docker', ['image', 'inspect', reference]);
  const [image] = JSON.parse(stdout);
  return { reference, id: image.Id, os: image.Os, architecture: image.Architecture };
}

export async function checksum(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

// Stream archives: database and object volumes may be larger than available memory.
export async function volumeArchive({ image, volume, path, restore = false }) {
  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--read-only',
      '--user',
      '0',
      '--mount',
      `type=volume,source=${volume},target=/data${restore ? '' : ',readonly'}`,
      '--entrypoint',
      'tar',
      image,
      '-C',
      '/data',
      restore ? '-xzpf' : '-czpf',
      '-',
      ...(restore ? [] : ['.']),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let errors = '';
  child.stderr.on('data', (data) => {
    errors = (errors + data.toString()).slice(-8_192);
  });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`Volume archive failed (${code}): ${errors}`)),
    );
  });
  if (!restore) child.stdin.end();
  else child.stdout.resume();
  try {
    await Promise.all([
      completion,
      restore
        ? pipeline(createReadStream(path), child.stdin)
        : pipeline(child.stdout, createWriteStream(path, { flags: 'wx', mode: 0o600 })),
    ]);
  } catch (error) {
    child.kill('SIGTERM');
    await completion.catch(() => {});
    throw error;
  }
}

export async function verifiedManifest(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !manifest.files || !manifest.images)
    throw new Error('Unsupported or incomplete backup');
  for (const name of ['configuration.env', 'postgres-data.tar.gz', 'object-data.tar.gz']) {
    if ((await checksum(resolve(directory, name))) !== manifest.files[name])
      throw new Error(`Backup checksum mismatch: ${name}`);
  }
  return manifest;
}
