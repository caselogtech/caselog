import type { TenantTransaction } from '../../application/services/tenant-database.service';

export async function bumpProjectionRevision(
  transaction: TenantTransaction,
  organizationId: string,
  projection: string,
  sourceId: string,
): Promise<number> {
  const record = await transaction.projectionRevision.upsert({
    where: {
      organizationId_projection_sourceId: { organizationId, projection, sourceId },
    },
    create: { organizationId, projection, sourceId, revision: 1 },
    update: { revision: { increment: 1 } },
    select: { revision: true },
  });
  return record.revision;
}
