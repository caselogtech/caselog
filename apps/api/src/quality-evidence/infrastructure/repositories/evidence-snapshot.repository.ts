import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { refreshEvidenceRevisions } from '../persistence/evidence-freshness.persistence';
import type {
  CandidateEvidenceRevision,
  CandidateEvidenceSnapshot,
} from '../../application/ports/candidate-evidence-snapshot';

@Injectable()
export class EvidenceSnapshotRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async revisions(
    organizationId: string,
    projectId: string,
    candidateIds: string[],
  ): Promise<CandidateEvidenceRevision[]> {
    if (candidateIds.length === 0) return [];
    const records = await this.tenantDatabase.run(organizationId, (transaction) =>
      refreshEvidenceRevisions(transaction, organizationId, projectId, candidateIds),
    );
    const revisionByCandidate = new Map(
      records.map(({ candidateId, revision }) => [candidateId, revision]),
    );
    return candidateIds.map((candidateId) => ({
      candidateId,
      revision: revisionByCandidate.get(candidateId) ?? 0,
    }));
  }

  load(
    organizationId: string,
    projectId: string,
    candidateId: string,
  ): Promise<CandidateEvidenceSnapshot> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const [revision] = await refreshEvidenceRevisions(transaction, organizationId, projectId, [
        candidateId,
      ]);
      if (!revision) return { candidateId, revision: 0, observations: [] };
      const current = await transaction.evidenceObservation.findMany({
        where: { organizationId, projectId, candidateId, currentFor: { isNot: null } },
        orderBy: [{ metricKey: 'asc' }, { dimensionsHash: 'asc' }, { producerId: 'asc' }],
        select: {
          id: true,
          producerId: true,
          metricKey: true,
          metricVersion: true,
          valueType: true,
          percentageValue: true,
          integerValue: true,
          state: true,
          dimensions: true,
          observedAt: true,
          expiresAt: true,
          trustLevel: true,
        },
      });
      return {
        candidateId,
        revision: revision.revision,
        observations: current.map((observation) => ({
          id: observation.id,
          producerId: observation.producerId,
          metricKey:
            observation.metricKey as CandidateEvidenceSnapshot['observations'][number]['metricKey'],
          metricVersion: observation.metricVersion,
          value:
            observation.valueType === 'PERCENTAGE'
              ? {
                  type: 'percentage' as const,
                  value: observation.percentageValue?.toString() ?? null,
                }
              : { type: 'integer' as const, value: observation.integerValue },
          state:
            observation.state.toLowerCase() as CandidateEvidenceSnapshot['observations'][number]['state'],
          dimensions:
            observation.dimensions as CandidateEvidenceSnapshot['observations'][number]['dimensions'],
          observedAt: observation.observedAt.toISOString(),
          expiresAt: observation.expiresAt?.toISOString() ?? null,
          trust:
            observation.trustLevel.toLowerCase() as CandidateEvidenceSnapshot['observations'][number]['trust'],
        })),
      };
    });
  }
}
