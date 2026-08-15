import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/application/services/metrics.service';
import type { StorageConfig } from '../../../core/storage/infrastructure/config/storage.config';
import { StorageMaintenanceService } from '../../application/services/storage-maintenance.service';

const ORGANIZATION_ID = 'ef877c99-f801-422f-a9ff-cfb1405d16d1';

describe('StorageMaintenanceService', () => {
  it('cleans safe objects, reconciles attachment health, and repairs usage', async () => {
    const old = new Date('2026-08-01T00:00:00.000Z');
    const recent = new Date(Date.now());
    const repository = repositoryMock({
      expiredUploads: [{ id: 'upload-1', storageKey: `${ORGANIZATION_ID}/uploads/expired` }],
      discardedAttachments: [
        { id: 'discarded', storageKey: `${ORGANIZATION_ID}/attachments/discarded` },
      ],
      attachments: [
        attachment('healthy', `${ORGANIZATION_ID}/attachments/healthy`),
        attachment('missing', `${ORGANIZATION_ID}/attachments/missing`),
        attachment('mismatch', `${ORGANIZATION_ID}/attachments/mismatch`),
      ],
      referencedKeys: new Set([`${ORGANIZATION_ID}/attachments/referenced`]),
    });
    const storage = storageMock();
    storage.stat.mockImplementation(async (key: string) => {
      if (key.endsWith('/missing')) return null;
      if (key.endsWith('/mismatch')) {
        return { contentType: 'text/plain', sizeBytes: 99, checksumSha256: 'b'.repeat(64) };
      }
      return { contentType: 'text/plain', sizeBytes: 10, checksumSha256: 'a'.repeat(64) };
    });
    storage.list.mockResolvedValue({
      objects: [
        object(`${ORGANIZATION_ID}/attachments/orphan`, old),
        object(`${ORGANIZATION_ID}/attachments/referenced`, old),
        object(`${ORGANIZATION_ID}/attachments/recent`, recent),
      ],
      nextAfter: `${ORGANIZATION_ID}/attachments/recent`,
    });
    const metrics = new MetricsService();
    const service = new StorageMaintenanceService(
      repository as never,
      storage as never,
      config(),
      metrics,
    );

    const result = await service.maintainOrganization(ORGANIZATION_ID);

    expect(result).toEqual({
      expiredUploadsDeleted: 1,
      discardedAttachmentsDeleted: 1,
      orphanedObjectsDeleted: 1,
      attachmentsHealthy: 1,
      attachmentsMissing: 1,
      attachmentsMismatched: 1,
      storageBytesUsed: 10n,
    });
    expect(storage.delete).toHaveBeenCalledWith(`${ORGANIZATION_ID}/uploads/expired`);
    expect(storage.delete).toHaveBeenCalledWith(`${ORGANIZATION_ID}/attachments/discarded`);
    expect(storage.delete).toHaveBeenCalledWith(`${ORGANIZATION_ID}/attachments/orphan`);
    expect(storage.delete).not.toHaveBeenCalledWith(`${ORGANIZATION_ID}/attachments/referenced`);
    expect(storage.delete).not.toHaveBeenCalledWith(`${ORGANIZATION_ID}/attachments/recent`);
    expect(repository.recordAttachmentStatus.mock.calls.map((call) => call[3])).toEqual([
      'MISSING',
      'HEALTHY',
      'MISSING',
      'MISMATCH',
    ]);
    expect(repository.setOrphanScanCursor).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `${ORGANIZATION_ID}/attachments/recent`,
    );
    expect(metrics.render()).toContain(
      'caselog_storage_maintenance_actions_total{action="orphaned_object_deleted"} 1',
    );
  });

  it('does not delete metadata or advance the scan cursor when object deletion fails', async () => {
    const repository = repositoryMock({
      expiredUploads: [{ id: 'upload-1', storageKey: `${ORGANIZATION_ID}/uploads/expired` }],
    });
    const storage = storageMock();
    storage.delete.mockRejectedValue(new Error('storage unavailable'));
    const service = new StorageMaintenanceService(
      repository as never,
      storage as never,
      config(),
      new MetricsService(),
    );

    await expect(service.maintainOrganization(ORGANIZATION_ID)).rejects.toThrow(
      'storage unavailable',
    );
    expect(repository.deleteExpiredUpload).not.toHaveBeenCalled();
    expect(repository.setOrphanScanCursor).not.toHaveBeenCalled();
    expect(repository.repairUsageCounter).toHaveBeenCalledTimes(1);
  });
});

function attachment(id: string, storageKey: string) {
  return {
    id,
    storageKey,
    contentType: 'text/plain',
    sizeBytes: 10,
    checksumSha256: 'a'.repeat(64),
    storageStatus: 'HEALTHY' as const,
  };
}

function object(storageKey: string, lastModifiedAt: Date) {
  return { storageKey, sizeBytes: 10, lastModifiedAt };
}

function repositoryMock(
  values: {
    expiredUploads?: Array<{ id: string; storageKey: string }>;
    discardedAttachments?: Array<{ id: string; storageKey: string }>;
    attachments?: ReturnType<typeof attachment>[];
    referencedKeys?: Set<string>;
  } = {},
) {
  return {
    listExpiredUploads: vi.fn().mockResolvedValue(values.expiredUploads ?? []),
    deleteExpiredUpload: vi.fn().mockResolvedValue(true),
    listDiscardedAttachments: vi.fn().mockResolvedValue(values.discardedAttachments ?? []),
    listAttachmentsForReconciliation: vi.fn().mockResolvedValue(values.attachments ?? []),
    recordAttachmentStatus: vi.fn().mockResolvedValue(true),
    getOrphanScanCursor: vi.fn().mockResolvedValue(null),
    referencedStorageKeys: vi.fn().mockResolvedValue(values.referencedKeys ?? new Set()),
    setOrphanScanCursor: vi.fn().mockResolvedValue(undefined),
    repairUsageCounter: vi.fn().mockResolvedValue(10n),
  };
}

function storageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    stat: vi.fn(),
    read: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ objects: [], nextAfter: null }),
  };
}

function config(): StorageConfig {
  return {
    endpoint: 'http://storage.test',
    region: 'eu-central-1',
    bucket: 'caselog-test',
    accessKey: 'test',
    secretKey: 'test',
    forcePathStyle: true,
    autoCreateBucket: false,
    uploadUrlTtlSeconds: 900,
    downloadUrlTtlSeconds: 300,
    maintenanceCron: '15 * * * *',
    maintenanceBatchSize: 200,
    orphanGraceHours: 24,
    recheckHours: 24,
  };
}
