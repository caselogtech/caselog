import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import { Prisma } from '../../../generated/prisma/client';
import { candidateEvidenceRevisionAdvancedEvent } from '../../application/events/evidence-integration-event';
import { appendEvidenceIntegrationEvent } from './evidence-integration-event.persistence';

/** Lock the same revision rows as ingestion before observing or advancing freshness. */
export async function refreshEvidenceRevisions(
  transaction: TenantTransaction,
  organizationId: string,
  projectId: string,
  candidateIds: string[],
): Promise<Array<{ candidateId: string; revision: number }>> {
  if (candidateIds.length === 0) return [];
  const revisions = await transaction.$queryRaw<
    Array<{ candidateId: string; revision: number; updatedAt: Date }>
  >`
    SELECT candidate_id AS "candidateId", revision, updated_at AS "updatedAt"
    FROM candidate_evidence_revisions
    WHERE organization_id = ${organizationId}::uuid
      AND project_id = ${projectId}::uuid
      AND candidate_id IN (${Prisma.join(candidateIds.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY candidate_id
    FOR UPDATE
  `;
  if (revisions.length === 0) return [];
  const now = new Date();
  // A source change already advances the revision. Only expiry after that checkpoint
  // needs a new revision; observations and historical decisions remain immutable.
  const expired = await transaction.evidenceObservation.findMany({
    where: {
      organizationId,
      projectId,
      currentFor: { isNot: null },
      OR: revisions.map(({ candidateId, updatedAt }) => ({
        candidateId,
        expiresAt: { gt: updatedAt, lte: now },
      })),
    },
    select: { candidateId: true },
    distinct: ['candidateId'],
  });
  const expiredCandidateIds = new Set(expired.map(({ candidateId }) => candidateId));
  const result = [];
  for (const record of revisions) {
    if (!expiredCandidateIds.has(record.candidateId)) {
      result.push({ candidateId: record.candidateId, revision: record.revision });
      continue;
    }
    const revision = record.revision + 1;
    await transaction.candidateEvidenceRevision.update({
      where: { organizationId_candidateId: { organizationId, candidateId: record.candidateId } },
      data: { revision, updatedAt: now },
    });
    await appendEvidenceIntegrationEvent(
      transaction,
      candidateEvidenceRevisionAdvancedEvent({
        organizationId,
        projectId,
        candidateId: record.candidateId,
        evidenceRevision: revision,
        occurredAt: now,
      }),
    );
    result.push({ candidateId: record.candidateId, revision });
  }
  return result;
}
