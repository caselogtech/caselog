import { describe, expect, it, vi } from 'vitest';
import type { ResourceConflictError } from '../../../common/errors/domain.error';
import { MetricsService } from '../../../core/observability/application/services/metrics.service';
import { AttachmentBlobService } from '../../application/services/attachment-blob.service';

const ORGANIZATION_ID = 'ef877c99-f801-422f-a9ff-cfb1405d16d1';
const CHECKSUM = 'a'.repeat(64);
const UPLOAD_KEY = `${ORGANIZATION_ID}/uploads/one`;
const BLOB_KEY = `${ORGANIZATION_ID}/blobs/sha256/aa/${CHECKSUM}`;
const UPLOAD = {
  storageKey: UPLOAD_KEY,
  contentType: 'text/plain',
  sizeBytes: 12,
  checksumSha256: CHECKSUM,
};

describe('AttachmentBlobService', () => {
  it('reuses a verified content-addressed blob without copying it', async () => {
    const repository = {
      findByChecksums: vi
        .fn()
        .mockResolvedValue([{ checksumSha256: CHECKSUM, storageKey: BLOB_KEY, sizeBytes: 12 }]),
    };
    const storage = storageMock();
    storage.stat.mockResolvedValue(storedObject());
    const metrics = new MetricsService();
    const service = new AttachmentBlobService(repository as never, storage as never, metrics);

    await expect(service.promoteMany(ORGANIZATION_ID, [UPLOAD])).resolves.toEqual([
      { storageKey: BLOB_KEY, sizeBytes: 12, checksumSha256: CHECKSUM },
    ]);
    expect(storage.copy).not.toHaveBeenCalled();
    expect(metrics.render()).toContain(
      'caselog_attachment_blob_promotions_total{action="reused"} 1',
    );
  });

  it('copies and verifies a blob when the content-addressed object is absent', async () => {
    const repository = { findByChecksums: vi.fn().mockResolvedValue([]) };
    const storage = storageMock();
    storage.stat.mockImplementation(async (storageKey: string) => {
      if (storageKey === UPLOAD_KEY) return storedObject();
      if (storage.copy.mock.calls.length === 0) return null;
      return storedObject();
    });
    const metrics = new MetricsService();
    const service = new AttachmentBlobService(repository as never, storage as never, metrics);

    await expect(service.promoteMany(ORGANIZATION_ID, [UPLOAD])).resolves.toEqual([
      { storageKey: BLOB_KEY, sizeBytes: 12, checksumSha256: CHECKSUM },
    ]);
    expect(storage.copy).toHaveBeenCalledWith(UPLOAD_KEY, BLOB_KEY);
    expect(metrics.render()).toContain(
      'caselog_attachment_blob_promotions_total{action="created"} 1',
    );
  });

  it('rejects conflicting metadata for an existing checksum', async () => {
    const repository = {
      findByChecksums: vi
        .fn()
        .mockResolvedValue([{ checksumSha256: CHECKSUM, storageKey: BLOB_KEY, sizeBytes: 99 }]),
    };
    const storage = storageMock();
    const service = new AttachmentBlobService(
      repository as never,
      storage as never,
      new MetricsService(),
    );

    await expect(service.promoteMany(ORGANIZATION_ID, [UPLOAD])).rejects.toMatchObject({
      code: 'attachment_checksum_conflict',
    } satisfies Partial<ResourceConflictError>);
    expect(storage.stat).not.toHaveBeenCalled();
  });
});

function storedObject() {
  return { contentType: 'text/plain', sizeBytes: 12, checksumSha256: CHECKSUM };
}

function storageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    stat: vi.fn(),
    read: vi.fn(),
    copy: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    list: vi.fn(),
  };
}
