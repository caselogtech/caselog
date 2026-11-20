import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import {
  migrateObjectStorage,
  storageMigrationConfig,
} from '../deployment/migrate-object-storage.mjs';
import { verifiedManifest } from '../deployment/backup-support.mjs';

// Fake only the external S3 transport. Use actual streams and hashes for the
// migration's byte verification, metadata, pagination and conflict behavior.
function bucket(entries = []) {
  const data = new Map(entries);
  let writes = 0;
  return {
    bucket: 'test',
    data,
    get writes() {
      return writes;
    },
    client: {
      async send(command) {
        const { input } = command;
        if (command.constructor.name === 'ListObjectsV2Command') {
          const all = [...data.keys()].sort();
          const start = Number(input.ContinuationToken ?? 0);
          const keys = all.slice(start, start + input.MaxKeys);
          const next = start + keys.length;
          return {
            Contents: keys.map((Key) => ({ Key })),
            IsTruncated: next < all.length,
            NextContinuationToken: next < all.length ? String(next) : undefined,
          };
        }
        if (command.constructor.name === 'GetObjectCommand') {
          const object = data.get(input.Key);
          if (!object) throw Object.assign(new Error('Missing'), { name: 'NoSuchKey' });
          return {
            ...object.headers,
            ETag: createHash('md5').update(object.bytes).digest('hex'),
            LastModified: new Date('2026-11-20T00:00:00Z'),
            ContentLength: object.bytes.length,
            Body: Readable.from([object.bytes]),
          };
        }
        if (command.constructor.name === 'PutObjectCommand') {
          assert.equal(input.IfNoneMatch, '*');
          assert.equal(data.has(input.Key), false, 'Never overwrite an existing object');
          const chunks = [];
          for await (const chunk of input.Body) chunks.push(chunk);
          const bytes = Buffer.concat(chunks);
          assert.equal(bytes.length, input.ContentLength);
          assert.equal(createHash('sha256').update(bytes).digest('base64'), input.ChecksumSHA256);
          const {
            Bucket: _bucket,
            Key: _key,
            Body: _body,
            ContentLength: _size,
            ChecksumSHA256: _checksum,
            IfNoneMatch: _condition,
            ...headers
          } = input;
          data.set(input.Key, { bytes, headers });
          writes++;
          return {};
        }
        assert.fail(`Unexpected S3 mutation: ${command.constructor.name}`);
      },
    },
  };
}

function object(text) {
  return {
    bytes: Buffer.from(text),
    headers: { ContentType: 'text/plain', Metadata: { checksumsha256: 'fixture', source: 'test' } },
  };
}

test('migration streams paginated objects, preserves headers and resumes without writes', async () => {
  const source = bucket(
    Array.from({ length: 501 }, (_, index) => [
      `tenant/${String(index).padStart(4, '0')}`,
      object(`file ${index}`),
    ]),
  );
  source.data.set('tenant/space % українська.bin', {
    bytes: Buffer.from([0, 255, 42]),
    headers: {
      ContentType: 'application/octet-stream',
      ContentDisposition: 'attachment',
      CacheControl: 'private',
      Metadata: { checksumsha256: 'binary', other: 'value' },
    },
  });
  const destination = bucket();
  const first = await migrateObjectStorage(source, destination);
  assert.equal(first.objects, 502);
  assert.equal(first.copied, 502);
  assert.equal(source.writes, 0);
  assert.equal(destination.writes, 502);
  const replay = await migrateObjectStorage(source, destination);
  assert.equal(replay.copied, 0);
  assert.equal(replay.reused, 502);
  assert.equal(replay.inventorySha256, first.inventorySha256);
  const verified = await migrateObjectStorage(source, destination, { verifyOnly: true });
  assert.equal(verified.inventorySha256, first.inventorySha256);
  assert.equal(destination.writes, 502);
});

test('migration refuses changed content, changed metadata and additional destination objects', async () => {
  const source = bucket([['file', object('source')]]);
  const different = bucket([['file', object('different')]]);
  await assert.rejects(migrateObjectStorage(source, different), /content or metadata differs/);
  assert.equal(different.writes, 0);
  assert.equal(different.data.get('file').bytes.toString(), 'different');
  const metadata = bucket([['file', object('source')]]);
  metadata.data.get('file').headers.ContentType = 'application/json';
  await assert.rejects(migrateObjectStorage(source, metadata), /content or metadata differs/);
  assert.equal(metadata.writes, 0);
  const extra = bucket([
    ['file', object('source')],
    ['extra', object('extra')],
  ]);
  await assert.rejects(migrateObjectStorage(source, extra), /inventories differ/);
  assert.equal(extra.writes, 0);
});

test('verify-only refuses missing objects without copying or deleting', async () => {
  const source = bucket([['file', object('source')]]);
  const destination = bucket();
  await assert.rejects(
    migrateObjectStorage(source, destination, { verifyOnly: true }),
    /missing a source object/,
  );
  assert.equal(destination.writes, 0);
  assert.equal(source.writes, 0);
});

test('storage configuration rejects unsafe endpoints and invalid path-style values', () => {
  const environment = {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'fixture',
    S3_ACCESS_KEY: 'fixture',
    S3_SECRET_KEY: 'synthetic-test-secret',
  };
  assert.equal(storageMigrationConfig(environment).client.maxAttempts, 3);
  for (const endpoint of [
    'file:///tmp',
    'https://user:password@example.com',
    'https://example.com/path',
  ])
    assert.throws(() => storageMigrationConfig({ ...environment, S3_ENDPOINT: endpoint }));
  assert.throws(() => storageMigrationConfig({ ...environment, S3_FORCE_PATH_STYLE: 'yes' }));
  assert.throws(() => storageMigrationConfig({ ...environment, S3_SECRET_KEY: '' }));
});

test('SeaweedFS restore rejects MinIO physical backups before extracting files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'caselog-backup-format-'));
  try {
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ format: 1, images: {}, files: {} }),
    );
    await assert.rejects(verifiedManifest(directory), /original source checkout/);
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ format: 999 }));
    await assert.rejects(verifiedManifest(directory), /Unsupported or incomplete backup/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
