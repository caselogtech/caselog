import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';

export type AttachmentStorageState = 'HEALTHY' | 'MISSING' | 'MISMATCH';

export type MaintenanceBlob = {
  checksumSha256: string;
  storageKey: string;
  sizeBytes: number;
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

  listDiscardedBlobs(
    organizationId: string,
    now: Date,
    limit: number,
  ): Promise<Array<{ checksumSha256: string; storageKey: string }>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const candidates = await transaction.attachmentBlob.findMany({
        where: {
          organizationId,
          storageStatus: { not: 'MISSING' },
          attachments: { some: { deletedAt: { not: null } }, none: { deletedAt: null } },
        },
        orderBy: [{ createdAt: 'asc' }, { checksumSha256: 'asc' }],
        take: limit,
        select: { checksumSha256: true, storageKey: true },
      });
      const protectedUploads = await transaction.uploadSession.findMany({
        where: {
          organizationId,
          checksumSha256: { in: candidates.map(({ checksumSha256 }) => checksumSha256) },
          expiresAt: { gt: now },
        },
        select: { checksumSha256: true },
      });
      const protectedChecksums = new Set(
        protectedUploads.map(({ checksumSha256 }) => checksumSha256),
      );
      return candidates.filter(({ checksumSha256 }) => !protectedChecksums.has(checksumSha256));
    });
  }

  listBlobsForReconciliation(
    organizationId: string,
    checkedBefore: Date,
    limit: number,
  ): Promise<MaintenanceBlob[]> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const blobs = await transaction.attachmentBlob.findMany({
        where: {
          organizationId,
          attachments: { some: { deletedAt: null } },
          OR: [{ storageCheckedAt: null }, { storageCheckedAt: { lte: checkedBefore } }],
        },
        orderBy: [{ storageCheckedAt: { sort: 'asc', nulls: 'first' } }, { checksumSha256: 'asc' }],
        take: limit,
        select: {
          checksumSha256: true,
          storageKey: true,
          sizeBytes: true,
          storageStatus: true,
        },
      });
      return blobs.map((blob) => ({
        ...blob,
        sizeBytes: Number(blob.sizeBytes),
      }));
    });
  }

  recordBlobStatus(
    organizationId: string,
    checksumSha256: string,
    storageKey: string,
    status: AttachmentStorageState,
    observedSizeBytes: number | null,
    checkedAt: Date,
  ): Promise<boolean> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const updated = await transaction.attachmentBlob.updateMany({
        where: { organizationId, checksumSha256, storageKey },
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
      const blobPrefix = `${organizationId}/blobs/sha256/`;
      const blobChecksums = storageKeys.flatMap((storageKey) => {
        if (!storageKey.startsWith(blobPrefix)) return [];
        const checksumSha256 = storageKey.slice(storageKey.lastIndexOf('/') + 1);
        return /^[a-f0-9]{64}$/.test(checksumSha256) ? [checksumSha256] : [];
      });
      const [blobs, uploads] = await Promise.all([
        transaction.attachmentBlob.findMany({
          where: {
            organizationId,
            storageKey: { in: storageKeys },
            attachments: { some: { deletedAt: null } },
          },
          select: { storageKey: true },
        }),
        transaction.uploadSession.findMany({
          where: {
            organizationId,
            expiresAt: { gt: new Date() },
            OR: [{ storageKey: { in: storageKeys } }, { checksumSha256: { in: blobChecksums } }],
          },
          select: { storageKey: true, checksumSha256: true },
        }),
      ]);
      return new Set([
        ...blobs.map(({ storageKey }) => storageKey),
        ...uploads.flatMap(({ storageKey, checksumSha256 }) => [
          storageKey,
          `${organizationId}/blobs/sha256/${checksumSha256.slice(0, 2)}/${checksumSha256}`,
        ]),
      ]);
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
      await transaction.$executeRaw`
        UPDATE attachment_blobs AS blob
        SET active_reference_count = (
          SELECT COUNT(*)::INTEGER
          FROM attachments AS attachment
          WHERE attachment.organization_id = blob.organization_id
            AND attachment.checksum_sha256 = blob.checksum_sha256
            AND attachment.deleted_at IS NULL
        )
        WHERE blob.organization_id = ${organizationId}::UUID
      `;
      const [total] = await transaction.$queryRaw<Array<{ storageBytesUsed: bigint }>>`
        SELECT COALESCE(SUM(
          CASE
            WHEN blob.storage_status <> 'missing'
              THEN COALESCE(blob.storage_observed_size_bytes, blob.size_bytes)
            ELSE 0
          END
        ), 0)::BIGINT AS "storageBytesUsed"
        FROM attachment_blobs AS blob
        WHERE blob.organization_id = ${organizationId}::UUID
          AND blob.active_reference_count > 0
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
