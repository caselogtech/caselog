import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  candidateTestScopeSchema,
  type CandidateTestScope,
} from '../../domain/models/candidate-test-scope';

@Injectable()
export class CandidateTestScopeRepository {
  constructor(@Inject(TenantDatabaseService) private readonly database: TenantDatabaseService) {}
  load(
    organizationId: string,
    projectId: string,
    candidateId: string,
  ): Promise<CandidateTestScope | null> {
    return this.database.run(organizationId, async (transaction) => {
      const current = await transaction.candidateEvidenceRevision.findFirst({
        where: { organizationId, projectId, candidateId },
        select: { testScopeSnapshot: true },
      });
      return current?.testScopeSnapshot
        ? candidateTestScopeSchema.parse(current.testScopeSnapshot)
        : null;
    });
  }
  freeze(
    organizationId: string,
    projectId: string,
    candidateId: string,
    proposed: CandidateTestScope,
  ): Promise<CandidateTestScope> {
    return this.database.run(organizationId, async (transaction) => {
      await transaction.candidateEvidenceRevision.upsert({
        where: { organizationId_candidateId: { organizationId, candidateId } },
        create: { organizationId, projectId, candidateId },
        update: {},
      });
      await transaction.$queryRaw`SELECT candidate_id FROM candidate_evidence_revisions WHERE organization_id = ${organizationId}::uuid AND project_id = ${projectId}::uuid AND candidate_id = ${candidateId}::uuid FOR UPDATE`;
      const current = await transaction.candidateEvidenceRevision.findFirstOrThrow({
        where: { organizationId, projectId, candidateId },
        select: { testScopeSnapshot: true },
      });
      if (current.testScopeSnapshot)
        return candidateTestScopeSchema.parse(current.testScopeSnapshot);
      await transaction.candidateEvidenceRevision.update({
        where: { organizationId_candidateId: { organizationId, candidateId }, projectId },
        data: { testScopeSnapshot: proposed },
      });
      return proposed;
    });
  }
}
