import { createHash } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } =
  require('@aws-sdk/client-s3');

class MigrationError extends Error {}

export function storageMigrationConfig(environment) {
  const endpoint = new URL(environment.S3_ENDPOINT ?? '');
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash
  )
    throw new MigrationError('S3_ENDPOINT must be an HTTP or HTTPS origin');
  for (const key of ['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    if (!environment[key]) throw new MigrationError(`Missing ${key} in storage configuration`);
  }
  if (!['true', 'false'].includes(environment.S3_FORCE_PATH_STYLE ?? 'false'))
    throw new MigrationError('S3_FORCE_PATH_STYLE must be true or false');
  return {
    bucket: environment.S3_BUCKET,
    client: {
      endpoint: endpoint.origin,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
      maxAttempts: 3,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY,
        secretAccessKey: environment.S3_SECRET_KEY,
      },
    },
  };
}

function isMissing(error) {
  return error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey';
}

function objectHeaders(object) {
  return {
    ContentType: object.ContentType,
    ContentDisposition: object.ContentDisposition,
    ContentEncoding: object.ContentEncoding,
    ContentLanguage: object.ContentLanguage,
    CacheControl: object.CacheControl,
    Expires: object.Expires,
    Metadata: Object.fromEntries(
      Object.entries(object.Metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}

async function fingerprint(client, bucket, key) {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!object.Body || !Number.isSafeInteger(object.ContentLength) || object.ContentLength < 0)
    throw new MigrationError('An object has invalid or missing content length');
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of object.Body) {
    bytes += chunk.length;
    if (bytes > object.ContentLength)
      throw new MigrationError('Object changed during migration; keep all writers stopped');
    digest.update(chunk);
  }
  if (bytes !== object.ContentLength)
    throw new MigrationError('Incomplete object read; migration was not verified');
  return {
    value: JSON.stringify({ bytes, sha256: digest.digest('hex'), headers: objectHeaders(object) }),
    object,
  };
}

async function* objects(client, bucket) {
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 500, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key) throw new MigrationError('Invalid object listing');
      yield object.Key;
    }
    if (!page.IsTruncated) return;
    if (!page.NextContinuationToken || page.NextContinuationToken === token)
      throw new MigrationError('Invalid object pagination');
    token = page.NextContinuationToken;
  } while (token);
}

async function copyObject(source, target, key, expected) {
  const object = await source.client.send(
    new GetObjectCommand({ Bucket: source.bucket, Key: key }),
  );
  if (
    object.ETag !== expected.object.ETag ||
    object.LastModified?.getTime() !== expected.object.LastModified?.getTime() ||
    object.ContentLength !== expected.object.ContentLength
  ) {
    object.Body?.destroy();
    throw new MigrationError('Source changed during migration; keep all writers stopped');
  }
  const digest = JSON.parse(expected.value).sha256;
  try {
    await target.client.send(
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: key,
        Body: object.Body,
        ContentLength: object.ContentLength,
        ...objectHeaders(object),
        ChecksumSHA256: Buffer.from(digest, 'hex').toString('base64'),
        IfNoneMatch: '*',
      }),
    );
  } finally {
    object.Body?.destroy();
  }
}

// Run only with all application, job and direct-upload writers stopped. Memory is
// bounded by one stream and one listing page; source objects are never mutated.
export async function migrateObjectStorage(source, target, { verifyOnly = false } = {}) {
  const sourceDigest = createHash('sha256');
  let copied = 0;
  let reused = 0;
  let sourceCount = 0;
  for await (const key of objects(source.client, source.bucket)) {
    const expected = await fingerprint(source.client, source.bucket, key);
    let actual;
    try {
      actual = await fingerprint(target.client, target.bucket, key);
    } catch (error) {
      if (!isMissing(error)) throw error;
      if (verifyOnly) throw new MigrationError('Destination is missing a source object');
    }
    if (actual) reused++;
    else {
      await copyObject(source, target, key, expected);
      actual = await fingerprint(target.client, target.bucket, key);
      copied++;
    }
    if (actual.value !== expected.value)
      throw new MigrationError(
        'Object content or metadata differs; no existing object was overwritten',
      );
    sourceDigest.update(JSON.stringify([key, expected.value]));
    sourceCount++;
  }
  const targetDigest = createHash('sha256');
  let targetCount = 0;
  for await (const key of objects(target.client, target.bucket)) {
    const actual = await fingerprint(target.client, target.bucket, key);
    targetDigest.update(JSON.stringify([key, actual.value]));
    targetCount++;
  }
  const inventorySha256 = sourceDigest.digest('hex');
  if (sourceCount !== targetCount || inventorySha256 !== targetDigest.digest('hex'))
    throw new MigrationError(
      'Bucket inventories differ; destination may contain additional objects',
    );
  return {
    verifiedAt: new Date().toISOString(),
    objects: sourceCount,
    copied,
    reused,
    inventorySha256,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'source-env': { type: 'string' },
      'target-env': { type: 'string' },
      report: { type: 'string' },
      'verify-only': { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values['source-env'] || !values['target-env'] || !values.report)
    throw new MigrationError('Provide --source-env, --target-env and a new --report path');
  const source = storageMigrationConfig(parseEnv(await readFile(values['source-env'], 'utf8')));
  const target = storageMigrationConfig(parseEnv(await readFile(values['target-env'], 'utf8')));
  if (source.client.endpoint === target.client.endpoint && source.bucket === target.bucket)
    throw new MigrationError('Source and destination must be different buckets or endpoints');
  const sourceClient = new S3Client(source.client);
  const targetClient = new S3Client(target.client);
  // Exclusive creation prevents accidental replacement; an empty report is incomplete.
  const report = await open(values.report, 'wx', 0o600);
  try {
    const result = await migrateObjectStorage(
      { bucket: source.bucket, client: sourceClient },
      { bucket: target.bucket, client: targetClient },
      { verifyOnly: values['verify-only'] },
    );
    await report.writeFile(`${JSON.stringify(result, null, 2)}\n`);
    console.log(
      `Verified ${result.objects} objects (${result.copied} copied, ${result.reused} reused).`,
    );
  } finally {
    await report.close();
    sourceClient.destroy();
    targetClient.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // SDK exceptions can contain object names or signed URLs; never print raw errors.
    console.error(
      error instanceof MigrationError
        ? error.message
        : 'Storage migration failed. Check connectivity, credentials and bucket access; the source is unchanged.',
    );
    process.exitCode = 1;
  });
}
