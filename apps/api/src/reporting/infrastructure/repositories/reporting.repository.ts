import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { RunProgressSource } from '../../domain/calculations/run-progress';

export type ReportingResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'run_not_found' };

@Injectable()
export class ReportingRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async runProgress(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<ReportingResult<RunProgressSource>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const run = await transaction.testRun.findUnique({
        where: {
          organizationId_id: { organizationId, id: runId },
          projectId: project.id,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          build: true,
          createdAt: true,
          closedAt: true,
        },
      });
      if (!run) return { kind: 'run_not_found' };

      const [statuses, items] = await Promise.all([
        transaction.resultStatus.findMany({
          where: { organizationId, projectId: project.id, deletedAt: null },
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            key: true,
            name: true,
            color: true,
            isFinal: true,
            countsAsFailure: true,
            position: true,
          },
        }),
        transaction.testRunItem.findMany({
          where: { organizationId, testRunId: run.id },
          select: {
            status: {
              select: {
                id: true,
                key: true,
                name: true,
                color: true,
                isFinal: true,
                countsAsFailure: true,
              },
            },
            assignee: { select: { id: true, displayName: true } },
            caseVersion: {
              select: {
                testCase: { select: { suite: { select: { id: true, name: true } } } },
              },
            },
          },
        }),
      ]);

      return {
        kind: 'found',
        value: {
          project,
          run: {
            ...run,
            status: run.status.toLowerCase() as RunProgressSource['run']['status'],
            createdAt: run.createdAt.toISOString(),
            closedAt: run.closedAt?.toISOString() ?? null,
          },
          statuses,
          items: items.map(({ caseVersion, ...item }) => ({
            ...item,
            suite: caseVersion.testCase.suite,
          })),
        },
      };
    });
  }
}
