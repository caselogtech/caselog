import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/infrastructure/prisma/prisma.service';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

export type ReadinessReconciliationCandidate = {
  projectId: string;
  candidateId: string;
  assignmentId: string;
  projection: {
    assignmentId: string;
    targetEvidenceRevision: number;
    targetEvaluatorVersion: string;
    state: 'PENDING' | 'CURRENT' | 'STALE' | 'FAILED';
    decision: {
      assignmentId: string;
      evidenceRevision: number;
      evaluatorVersion: string;
    } | null;
  } | null;
};

@Injectable()
export class ReadinessReconciliationRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async listActiveOrganizationIds(cursor: string | null, limit: number): Promise<string[]> {
    const organizations = await this.prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: limit,
      select: { id: true },
    });
    return organizations.map(({ id }) => id);
  }

  listCandidates(
    organizationId: string,
    cursor: string | null,
    limit: number,
  ): Promise<ReadinessReconciliationCandidate[]> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const records = await transaction.currentCandidatePolicyAssignment.findMany({
        orderBy: { candidateId: 'asc' },
        cursor: cursor
          ? { organizationId_candidateId: { organizationId, candidateId: cursor } }
          : undefined,
        skip: cursor ? 1 : 0,
        take: limit,
        select: {
          projectId: true,
          candidateId: true,
          assignmentId: true,
          candidate: {
            select: {
              currentReadinessDecision: {
                select: {
                  assignmentId: true,
                  targetEvidenceRevision: true,
                  targetEvaluatorVersion: true,
                  state: true,
                  decision: {
                    select: {
                      assignmentId: true,
                      evidenceRevision: true,
                      evaluatorVersion: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      return records.map((record) => ({
        projectId: record.projectId,
        candidateId: record.candidateId,
        assignmentId: record.assignmentId,
        projection: record.candidate.currentReadinessDecision,
      }));
    });
  }
}
