import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

export type AttachmentStorageState = 'HEALTHY' | 'MISSING' | 'MISMATCH';

export type MaintenanceAttachment = {
  id: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageStatus: AttachmentStorageState;
};

export type MaintenanceObjectReference = { id: string; storageKey: string };

@Injectable()
export class StorageMaintenanceRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async listOrganizationIds(
    cursor: string | null,
    limit: number,
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    const organizations = await this.prisma.organization.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true },
    });
    const hasMore = organizations.length > limit;
    const ids = organizations.slice(0, limit).map(({ id }) => id);
    return { ids, nextCursor: hasMore ? (ids.at(-1) ?? null) : null };
  }

  listExpiredUploads(
    organizationId: string,
    expiresBefore: Date,
    limit: number,
  ): Promise<MaintenanceObjectReference[]> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.uploadSession.findMany({
        where: { organizationId, expiresAt: { lte: expiresBefore } },
        orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { id: true, storageKey: true },
      }),
    );
  }

  deleteExpiredUpload(
    organizationId: string,
    uploadId: string,
    expiresBefore: Date,
  ): Promise<boolean> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const deleted = await transaction.uploadSession.deleteMany({
        where: { organizationId, id: uploadId, expiresAt: { lte: expiresBefore } },
      });
      return deleted.count === 1;
    });
  }

  listDiscardedAttachments(
    organizationId: string,
    limit: number,
  ): Promise<MaintenanceObjectReference[]> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.attachment.findMany({
        where: { organizationId, deletedAt: { not: null }, storageStatus: { not: 'MISSING' } },
        orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: { id: true, storageKey: true },
      }),
    );
  }

  listAttachmentsForReconciliation(
    organizationId: string,
    checkedBefore: Date,
    limit: number,
  ): Promise<MaintenanceAttachment[]> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const attachments = await transaction.attachment.findMany({
        where: {
          organizationId,
          deletedAt: null,
          OR: [{ storageCheckedAt: null }, { storageCheckedAt: { lte: checkedBefore } }],
        },
        orderBy: [{ storageCheckedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          storageKey: true,
          contentType: true,
          sizeBytes: true,
          checksumSha256: true,
          storageStatus: true,
        },
      });
      return attachments.map((attachment) => ({
        ...attachment,
        sizeBytes: Number(attachment.sizeBytes),
      }));
    });
  }

  recordAttachmentStatus(
    organizationId: string,
    attachmentId: string,
    storageKey: string,
    status: AttachmentStorageState,
    observedSizeBytes: number | null,
    checkedAt: Date,
  ): Promise<boolean> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const updated = await transaction.attachment.updateMany({
        where: { organizationId, id: attachmentId, storageKey },
        data: {
          storageStatus: status,
          storageObservedSizeBytes: observedSizeBytes === null ? null : BigInt(observedSizeBytes),
          storageCheckedAt: checkedAt,
        },
      });
      return updated.count === 1;
    });
  }

  async referencedStorageKeys(organizationId: string, storageKeys: string[]): Promise<Set<string>> {
    if (storageKeys.length === 0) return new Set();
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const [attachments, uploads] = await Promise.all([
        transaction.attachment.findMany({
          where: { organizationId, storageKey: { in: storageKeys }, deletedAt: null },
          select: { storageKey: true },
        }),
        transaction.uploadSession.findMany({
          where: { organizationId, storageKey: { in: storageKeys } },
          select: { storageKey: true },
        }),
      ]);
      return new Set([...attachments, ...uploads].map(({ storageKey }) => storageKey));
    });
  }

  getOrphanScanCursor(organizationId: string): Promise<string | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const cursor = await transaction.storageMaintenanceCursor.findUnique({
        where: { organizationId },
        select: { afterKey: true },
      });
      return cursor?.afterKey ?? null;
    });
  }

  setOrphanScanCursor(organizationId: string, afterKey: string | null): Promise<void> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      await transaction.storageMaintenanceCursor.upsert({
        where: { organizationId },
        create: { organizationId, afterKey },
        update: { afterKey },
      });
    });
  }

  repairUsageCounter(organizationId: string): Promise<bigint> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      await transaction.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`storage-usage:${organizationId}`}, 0)
        )
      `;
      const [total] = await transaction.$queryRaw<Array<{ storageBytesUsed: bigint }>>`
        SELECT COALESCE(SUM(
          CASE
            WHEN deleted_at IS NULL AND storage_status <> 'missing'
              THEN COALESCE(storage_observed_size_bytes, size_bytes)
            ELSE 0
          END
        ), 0)::BIGINT AS "storageBytesUsed"
        FROM attachments
        WHERE organization_id = ${organizationId}::UUID
      `;
      const storageBytesUsed = total?.storageBytesUsed ?? 0n;
      await transaction.usageCounter.upsert({
        where: { organizationId },
        create: { organizationId, storageBytesUsed },
        update: { storageBytesUsed },
      });
      return storageBytesUsed;
    });
  }
}
