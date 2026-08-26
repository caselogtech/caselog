import { Inject, Injectable } from '@nestjs/common';
import type { ReleaseCandidateReference } from '../../application/ports/release-candidate-reference';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { LINK_ROLE, RELEASE_STATE } from '../persistence/release.mapper';

@Injectable()
export class ReleaseCandidateReferenceRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    candidateId: string,
  ): Promise<ReleaseCandidateReference | null> {
    const record = await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.releaseCandidate.findUnique({
        where: { organizationId_id: { organizationId, id: candidateId } },
        select: {
          id: true,
          projectId: true,
          releaseId: true,
          sourceRevision: true,
          buildIdentifier: true,
          artifactDigest: true,
          identityHash: true,
          release: { select: { state: true } },
          testRuns: {
            orderBy: [{ createdAt: 'asc' }, { testRunId: 'asc' }],
            select: { testRunId: true, role: true },
          },
        },
      }),
    );
    if (!record) return null;
    return {
      id: record.id,
      projectId: record.projectId,
      releaseId: record.releaseId,
      releaseState: RELEASE_STATE[record.release.state],
      sourceRevision: record.sourceRevision,
      buildIdentifier: record.buildIdentifier,
      artifactDigest: record.artifactDigest,
      identityHash: record.identityHash,
      testRuns: record.testRuns.map(({ testRunId, role }) => ({
        testRunId,
        role: LINK_ROLE[role],
      })),
    };
  }
}
