import { Inject, Injectable } from '@nestjs/common';
import type { EvidenceProcessingIssueCode } from '@caselog/schemas/evidence';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

export type RecordEvidenceProcessingIssueInput = {
  organizationId: string;
  projectId: string;
  candidateId: string;
  sourceEventId: string;
  code: EvidenceProcessingIssueCode;
  failedAt?: Date;
};

@Injectable()
export class EvidenceProcessingIssueRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  recordFailure(input: RecordEvidenceProcessingIssueInput): Promise<void> {
    const failedAt = input.failedAt ?? new Date();
    return this.tenantDatabase.run(input.organizationId, async (transaction) => {
      await transaction.evidenceProcessingIssue.upsert({
        where: {
          organizationId_sourceEventId: {
            organizationId: input.organizationId,
            sourceEventId: input.sourceEventId,
          },
        },
        create: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          candidateId: input.candidateId,
          sourceEventId: input.sourceEventId,
          code: input.code,
          firstFailedAt: failedAt,
          lastFailedAt: failedAt,
        },
        update: {
          code: input.code,
          attemptCount: { increment: 1 },
          lastFailedAt: failedAt,
          resolvedAt: null,
        },
      });
    });
  }
}
