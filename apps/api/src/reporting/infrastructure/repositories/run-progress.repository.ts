import { Inject, Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { RunProgressSource } from '../../domain/calculations/run-progress';
import { RUN_PROGRESS_PROJECTION } from '../../domain/models/run-progress-refresh-job';
import type { ReportingResult } from './reporting-result';

@Injectable()
export class RunProgressRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<
    ReportingResult<
      { revision: number; source: RunProgressSource },
      'project_not_found' | 'run_not_found'
    >
  > {
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
      const projectionRevision = await transaction.projectionRevision.findUnique({
        where: {
          organizationId_projection_sourceId: {
            organizationId,
            projection: RUN_PROGRESS_PROJECTION,
            sourceId: runId,
          },
        },
        select: { revision: true },
      });

      const statuses = await transaction.resultStatus.findMany({
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
      });
      const items = await transaction.testRunItem.findMany({
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
      });
      return {
        kind: 'found',
        value: {
          revision: projectionRevision?.revision ?? 0,
          source: {
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
        },
      };
    });
  }
}
