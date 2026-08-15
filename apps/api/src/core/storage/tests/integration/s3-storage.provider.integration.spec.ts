import { createHash, randomUUID } from 'node:crypto';
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
    const download = await storage.createDownloadUrl(copiedStorageKey, 'evidence report.txt');
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
});
