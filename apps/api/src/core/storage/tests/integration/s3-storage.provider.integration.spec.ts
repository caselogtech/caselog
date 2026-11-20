import { createHash, randomUUID } from 'node:crypto';
import { createServer, request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStorageConfig } from '../../infrastructure/config/storage.config';
import { S3StorageProvider } from '../../infrastructure/adapters/s3-storage.provider';

describe('S3StorageProvider integration', () => {
  const storageKey = `integration/${randomUUID()}`;
  const body = Buffer.from('caselog storage integration');
  const checksumSha256 = createHash('sha256').update(body).digest('hex');
  let storage: S3StorageProvider;

  beforeAll(async () => {
    storage = new S3StorageProvider(createStorageConfig());
    await storage.onModuleInit();
  });

  afterAll(async () => {
    await storage.delete(storageKey);
  });

  it('uploads through a presigned URL and reads trusted object metadata', async () => {
    const upload = await storage.createUploadUrl({
      storageKey,
      contentType: 'text/plain',
      checksumSha256,
      sizeBytes: body.byteLength,
    });
    const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });

    expect(response.status, await response.text()).toBe(200);
    await expect(storage.stat(storageKey)).resolves.toEqual({
      contentType: 'text/plain',
      sizeBytes: body.byteLength,
      checksumSha256,
    });

    const copiedStorageKey = `${storageKey}-copy`;
    await storage.copy(storageKey, copiedStorageKey);
    await expect(storage.stat(copiedStorageKey)).resolves.toEqual({
      contentType: 'text/plain',
      sizeBytes: body.byteLength,
      checksumSha256,
    });
    const download = await storage.createDownloadUrl(
      copiedStorageKey,
      'evidence report.txt',
      'text/plain',
    );
    const downloaded = await fetch(download.url);
    const downloadedBody = await downloaded.text();
    expect(downloaded.status, downloadedBody).toBe(200);
    expect(downloadedBody).toBe(body.toString());
    expect(downloaded.headers.get('content-disposition')).toContain('evidence%20report.txt');
    await expect(storage.read(copiedStorageKey, body.byteLength)).resolves.toEqual(
      Uint8Array.from(body),
    );
    const listed = await storage.list('integration/', null, 1_000);
    expect(listed.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ storageKey, sizeBytes: body.byteLength }),
        expect.objectContaining({ storageKey: copiedStorageKey, sizeBytes: body.byteLength }),
      ]),
    );
    await storage.delete(copiedStorageKey);
  });

  it('signs the public host while keeping metadata and reads on the private endpoint', async () => {
    const config = createStorageConfig();
    const publicRequests: string[] = [];
    const proxy = createServer((incoming, outgoing) => {
      publicRequests.push(incoming.method ?? '');
      const upstream = request(
        new URL(incoming.url ?? '/', config.endpoint),
        {
          method: incoming.method,
          headers: incoming.headers,
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on('error', () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP proxy');
    const publicEndpoint = `http://127.0.0.1:${address.port}`;
    const splitStorage = new S3StorageProvider({ ...config, publicEndpoint });
    try {
      await splitStorage.onModuleInit();
      const upload = await splitStorage.createUploadUrl({
        storageKey,
        contentType: 'text/plain',
        checksumSha256,
        sizeBytes: body.byteLength,
      });
      expect(new URL(upload.url).origin).toBe(publicEndpoint);
      const uploaded = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
      expect(uploaded.status, await uploaded.text()).toBe(200);
      expect(await splitStorage.stat(storageKey)).toMatchObject({ checksumSha256 });
      expect(await splitStorage.read(storageKey, body.byteLength)).toEqual(Uint8Array.from(body));
      const download = await splitStorage.createDownloadUrl(
        storageKey,
        'evidence.txt',
        'text/plain',
      );
      expect(await (await fetch(download.url)).text()).toBe(body.toString());
      expect(publicRequests).toEqual(['PUT', 'GET']);
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('rejects incorrect checksums and unsigned object access', async () => {
    const key = `${storageKey}-invalid`;
    const upload = await storage.createUploadUrl({
      storageKey: key,
      contentType: 'text/plain',
      checksumSha256,
      sizeBytes: body.byteLength,
    });
    const invalidBody = Buffer.alloc(body.byteLength, 'x');
    const rejected = await fetch(upload.url, {
      method: 'PUT',
      headers: upload.headers,
      body: invalidBody,
    });
    expect(rejected.ok).toBe(false);
    await rejected.arrayBuffer();
    await expect(storage.stat(key)).resolves.toBeNull();

    const unsigned = new URL(upload.url);
    unsigned.search = '';
    for (const method of ['GET', 'PUT']) {
      const response = await fetch(unsigned, {
        method,
        ...(method === 'PUT' ? { body } : {}),
      });
      expect(response.status).toBe(403);
      await response.arrayBuffer();
    }
    await expect(storage.stat(key)).resolves.toBeNull();
  });

  it('lists a prefix with bounded, deterministic pagination and deletes idempotently', async () => {
    const prefix = `${storageKey}/pagination/`;
    const keys = ['a', 'b', 'c'].map((suffix) => `${prefix}${suffix}`);
    try {
      for (const key of keys) {
        const upload = await storage.createUploadUrl({
          storageKey: key,
          contentType: 'text/plain',
          checksumSha256,
          sizeBytes: body.byteLength,
        });
        const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
        expect(response.status, await response.text()).toBe(200);
      }
      const first = await storage.list(prefix, null, 2);
      expect(first.objects.map((object) => object.storageKey)).toEqual(keys.slice(0, 2));
      expect(first.nextAfter).toBe(keys[1]);
      const second = await storage.list(prefix, first.nextAfter, 2);
      expect(second.objects.map((object) => object.storageKey)).toEqual(keys.slice(2));
      expect(second.nextAfter).toBeNull();
      await expect(storage.read(keys[0] ?? '', body.byteLength - 1)).rejects.toThrow('read size');
    } finally {
      for (const key of keys) {
        await storage.delete(key);
        await storage.delete(key);
        await expect(storage.stat(key)).resolves.toBeNull();
      }
    }
  });

  it('allows browser upload headers only for configured application origins', async () => {
    const config = createStorageConfig();
    const url = `${config.publicEndpoint ?? config.endpoint}/${config.bucket}`;
    for (const origin of ['http://localhost:4200', 'https://untrusted.example']) {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'PUT',
          'access-control-request-headers':
            'content-type,x-amz-checksum-sha256,x-amz-meta-checksumsha256',
        },
      });
      if (origin === 'http://localhost:4200') {
        expect(response.ok).toBe(true);
        expect(response.headers.get('access-control-allow-origin')).toBe(origin);
        expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
          'x-amz-checksum-sha256',
        );
      } else {
        expect(response.headers.get('access-control-allow-origin')).toBeNull();
      }
      await response.arrayBuffer();
    }
  });
});
