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
import { uploadMetadataMatches } from '../../domain/policies/upload-metadata';
import {
  type AttachmentStorageState,
  StorageMaintenanceRepository,
} from '../../infrastructure/repositories/storage-maintenance.repository';

const STATUS_METRIC_ACTION: Record<AttachmentStorageState, StorageMaintenanceAction> = {
  HEALTHY: 'attachment_healthy',
  MISSING: 'attachment_missing',
  MISMATCH: 'attachment_mismatch',
};

export type StorageMaintenanceSummary = {
  expiredUploadsDeleted: number;
  discardedAttachmentsDeleted: number;
  orphanedObjectsDeleted: number;
  attachmentsHealthy: number;
  attachmentsMissing: number;
  attachmentsMismatched: number;
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
      discardedAttachmentsDeleted: 0,
      orphanedObjectsDeleted: 0,
      attachmentsHealthy: 0,
      attachmentsMissing: 0,
      attachmentsMismatched: 0,
      storageBytesUsed: 0n,
    };

    await this.repository.repairUsageCounter(organizationId);
    await this.cleanupExpiredUploads(organizationId, now, summary);
    await this.cleanupDiscardedAttachments(organizationId, now, summary);
    await this.reconcileAttachments(organizationId, now, summary);
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

  private async cleanupDiscardedAttachments(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const attachments = await this.repository.listDiscardedAttachments(
      organizationId,
      this.config.maintenanceBatchSize,
    );
    for (const attachment of attachments) {
      await this.storage.delete(attachment.storageKey);
      if (
        await this.repository.recordAttachmentStatus(
          organizationId,
          attachment.id,
          attachment.storageKey,
          'MISSING',
          null,
          now,
        )
      ) {
        summary.discardedAttachmentsDeleted += 1;
        this.metrics.observeStorageMaintenance('discarded_attachment_deleted');
      }
    }
  }

  private async reconcileAttachments(
    organizationId: string,
    now: Date,
    summary: StorageMaintenanceSummary,
  ): Promise<void> {
    const checkedBefore = new Date(now.getTime() - this.config.recheckHours * 3_600_000);
    const attachments = await this.repository.listAttachmentsForReconciliation(
      organizationId,
      checkedBefore,
      this.config.maintenanceBatchSize,
    );
    for (const attachment of attachments) {
      const object = await this.storage.stat(attachment.storageKey);
      const status: AttachmentStorageState = !object
        ? 'MISSING'
        : uploadMetadataMatches(object, attachment)
          ? 'HEALTHY'
          : 'MISMATCH';
      await this.repository.recordAttachmentStatus(
        organizationId,
        attachment.id,
        attachment.storageKey,
        status,
        object?.sizeBytes ?? null,
        now,
      );
      if (status === 'HEALTHY') summary.attachmentsHealthy += 1;
      if (status === 'MISSING') summary.attachmentsMissing += 1;
      if (status === 'MISMATCH') summary.attachmentsMismatched += 1;
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
