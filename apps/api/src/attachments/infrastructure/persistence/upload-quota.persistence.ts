import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';

const MAX_PENDING_UPLOADS_PER_USER = 20;
const MAX_PENDING_STORAGE_BYTES = 500n * 1_024n * 1_024n;

export async function hasPendingUploadCapacity(
  transaction: TenantTransaction,
  organizationId: string,
  userId: string,
  sizeBytes: number,
): Promise<boolean> {
  await transaction.$queryRaw`
    SELECT id FROM organizations
    WHERE id = ${organizationId}::uuid
    FOR UPDATE
  `;
  const now = new Date();
  const userPendingCount = await transaction.uploadSession.count({
    where: {
      organizationId,
      createdById: userId,
      completedAt: null,
      expiresAt: { gt: now },
    },
  });
  const pendingStorage = await transaction.uploadSession.aggregate({
    where: { organizationId, completedAt: null, expiresAt: { gt: now } },
    _sum: { sizeBytes: true },
  });
  return (
    userPendingCount < MAX_PENDING_UPLOADS_PER_USER &&
    (pendingStorage._sum.sizeBytes ?? 0n) + BigInt(sizeBytes) <= MAX_PENDING_STORAGE_BYTES
  );
}
