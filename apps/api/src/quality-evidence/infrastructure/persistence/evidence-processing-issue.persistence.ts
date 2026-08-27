import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';

export function resolveEvidenceProcessingIssues(
  transaction: TenantTransaction,
  organizationId: string,
  sourceEventIds: string[],
  resolvedAt = new Date(),
): Promise<{ count: number }> {
  if (sourceEventIds.length === 0) return Promise.resolve({ count: 0 });
  return transaction.evidenceProcessingIssue.updateMany({
    where: {
      organizationId,
      sourceEventId: { in: sourceEventIds },
      resolvedAt: null,
    },
    data: { resolvedAt },
  });
}
