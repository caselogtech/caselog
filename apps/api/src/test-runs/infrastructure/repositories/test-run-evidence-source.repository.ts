import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { RUN_PROGRESS_PROJECTION } from '../../../reporting/public-api';
import type { TestRunEvidenceSnapshot } from '../../application/ports/test-run-evidence-source';

@Injectable()
export class TestRunEvidenceSourceRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  find(organizationId: string, testRunId: string): Promise<TestRunEvidenceSnapshot | null> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const run = await transaction.testRun.findUnique({
        where: { organizationId_id: { organizationId, id: testRunId }, deletedAt: null },
        select: { id: true, projectId: true, status: true, updatedAt: true },
      });
      if (!run) return null;

      const [groups, revision, itemUpdatedAt] = await Promise.all([
        transaction.testRunItem.groupBy({
          by: ['statusId'],
          where: { testRunId },
          _count: { _all: true },
        }),
        transaction.projectionRevision.findUnique({
          where: {
            organizationId_projection_sourceId: {
              organizationId,
              projection: RUN_PROGRESS_PROJECTION,
              sourceId: testRunId,
            },
          },
          select: { revision: true },
        }),
        transaction.testRunItem.aggregate({
          where: { testRunId },
          _max: { updatedAt: true },
        }),
      ]);
      const statuses = await transaction.resultStatus.findMany({
        where: { id: { in: groups.map(({ statusId }) => statusId) } },
        select: { id: true, key: true, isFinal: true, countsAsFailure: true },
      });
      const statusById = new Map(statuses.map((status) => [status.id, status]));
      const statusCounts = groups.map((group) => {
        const status = statusById.get(group.statusId);
        if (!status) throw new Error('Test run item references an unavailable result status');
        return { ...status, count: group._count._all };
      });
      const observedAt = itemUpdatedAt._max.updatedAt;

      return {
        projectId: run.projectId,
        testRunId: run.id,
        status: run.status.toLowerCase() as TestRunEvidenceSnapshot['status'],
        revision: revision?.revision ?? 0,
        observedAt:
          observedAt && observedAt > run.updatedAt
            ? observedAt.toISOString()
            : run.updatedAt.toISOString(),
        totalItems: statusCounts.reduce((total, status) => total + status.count, 0),
        finalItems: statusCounts.reduce(
          (total, status) => total + (status.isFinal ? status.count : 0),
          0,
        ),
        passedItems: statusCounts.reduce(
          (total, status) => total + (status.key === 'passed' ? status.count : 0),
          0,
        ),
        failedItems: statusCounts.reduce(
          (total, status) => total + (status.countsAsFailure ? status.count : 0),
          0,
        ),
        skippedItems: statusCounts.reduce(
          (total, status) => total + (status.key === 'skipped' ? status.count : 0),
          0,
        ),
        statusCounts: statusCounts.map(({ id: _id, ...status }) => status),
      };
    });
  }
}
