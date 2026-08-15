import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import {
  STORAGE_CONFIG,
  type StorageConfig,
} from '../../../core/storage/infrastructure/config/storage.config';
import {
  MetricsService,
  type StorageMaintenanceAction,
} from '../../../core/observability/application/services/metrics.service';
import { attachmentBlobMatches } from '../../domain/policies/attachment-blob';
import {
  type AttachmentStorageState,
  StorageMaintenanceRepository,
} from '../../infrastructure/repositories/storage-maintenance.repository';

const STATUS_METRIC_ACTION: Record<AttachmentStorageState, StorageMaintenanceAction> = {
  HEALTHY: 'blob_healthy',
  MISSING: 'blob_missing',
  MISMATCH: 'blob_mismatch',
};

export type StorageMaintenanceSummary = {
  expiredUploadsDeleted: number;
  discardedBlobsDeleted: number;
  orphanedObjectsDeleted: number;
  blobsHealthy: number;
  blobsMissing: number;
  blobsMismatched: number;
  storageBytesUsed: bigint;
};

@Injectable()
export class StorageMaintenanceService {
  private readonly logger = new Logger(StorageMaintenanceService.name);

  constructor(
    @Inject(StorageMaintenanceRepository)
    private readonly repository: StorageMaintenanceRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfig,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async maintainOrganization(organizationId: string): Promise<StorageMaintenanceSummary> {
    const now = new Date();
    const summary: StorageMaintenanceSummary = {
      expiredUploadsDeleted: 0,
      discardedBlobsDeleted: 0,
      orphanedObjectsDeleted: 0,
      blobsHealthy: 0,
      blobsMissing: 0,
      blobsMismatched: 0,
      storageBytesUsed: 0n,
    };

    await this.repository.repairUsageCounter(organizationId);
    await this.cleanupExpiredUploads(organizationId, now, summary);
    await this.cleanupDiscardedBlobs(organizationId, now, summary);
    await this.reconcileBlobs(organizationId, now, summary);
    await this.cleanupOrphanedObjects(organizationId, now, summary);
    summary.storageBytesUsed = await this.repository.repairUsageCounter(organizationId);

    this.logger.log({
      event: 'storage.maintenance.completed',
      organizationId,
      ...summary,
      storageBytesUsed: summary.storageBytesUsed.toString(),
    });
    return summary;
  }

  private async cleanupExpiredUploads(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const uploads = await this.repository.listExpiredUploads(
      organizationId,
      now,
      this.config.maintenanceBatchSize,
    );
    for (const upload of uploads) {
      await this.storage.delete(upload.storageKey);
      if (await this.repository.deleteExpiredUpload(organizationId, upload.id, now)) {
        summary.expiredUploadsDeleted += 1;
        this.metrics.observeStorageMaintenance('expired_upload_deleted');
      }
    }
  }

  private async cleanupDiscardedBlobs(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const blobs = await this.repository.listDiscardedBlobs(
      organizationId,
      now,
      this.config.maintenanceBatchSize,
    );
    for (const blob of blobs) {
      await this.storage.delete(blob.storageKey);
      if (
        await this.repository.recordBlobStatus(
          organizationId,
          blob.checksumSha256,
          blob.storageKey,
          'MISSING',
          null,
          now,
        )
      ) {
        summary.discardedBlobsDeleted += 1;
        this.metrics.observeStorageMaintenance('discarded_blob_deleted');
      }
    }
  }

  private async reconcileBlobs(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const checkedBefore = new Date(now.getTime() - this.config.recheckHours * 3_600_000);
    const blobs = await this.repository.listBlobsForReconciliation(
      organizationId,
      checkedBefore,
      this.config.maintenanceBatchSize,
    );
    for (const blob of blobs) {
      const object = await this.storage.stat(blob.storageKey);
      const status: AttachmentStorageState = !object
        ? 'MISSING'
        : attachmentBlobMatches(object, blob)
          ? 'HEALTHY'
          : 'MISMATCH';
      await this.repository.recordBlobStatus(
        organizationId,
        blob.checksumSha256,
        blob.storageKey,
        status,
        object?.sizeBytes ?? null,
        now,
      );
      if (status === 'HEALTHY') summary.blobsHealthy += 1;
      if (status === 'MISSING') summary.blobsMissing += 1;
      if (status === 'MISMATCH') summary.blobsMismatched += 1;
      this.metrics.observeStorageMaintenance(STATUS_METRIC_ACTION[status]);
    }
  }

  private async cleanupOrphanedObjects(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const after = await this.repository.getOrphanScanCursor(organizationId);
    const page = await this.storage.list(
      `${organizationId}/`,
      after,
      this.config.maintenanceBatchSize,
    );
    const graceThreshold = new Date(now.getTime() - this.config.orphanGraceHours * 3_600_000);
    const eligible = page.objects.filter(({ lastModifiedAt }) => lastModifiedAt <= graceThreshold);
    const references = await this.repository.referencedStorageKeys(
      organizationId,
      eligible.map(({ storageKey }) => storageKey),
    );
    for (const object of eligible) {
      if (references.has(object.storageKey)) continue;
      await this.storage.delete(object.storageKey);
      summary.orphanedObjectsDeleted += 1;
      this.metrics.observeStorageMaintenance('orphaned_object_deleted');
    }
    await this.repository.setOrphanScanCursor(organizationId, page.nextAfter);
  }
}
