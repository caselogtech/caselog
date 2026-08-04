import { Inject, Injectable } from '@nestjs/common';
import type { RunProgressResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { RUN_PROGRESS_PROJECTION } from '../../domain/models/run-progress-refresh-job';
import type { ReportingResult } from './reporting-result';

type RunProgressProjection = {
  currentRevision: number;
  snapshot: { revision: number; response: unknown } | null;
};

@Injectable()
export class RunProgressProjectionRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<ReportingResult<RunProgressProjection, 'project_not_found' | 'run_not_found'>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const run = await transaction.testRun.findUnique({
        where: {
          organizationId_id: { organizationId, id: runId },
          projectId: project.id,
          deletedAt: null,
        },
        select: {
          progressSnapshot: { select: { revision: true, response: true } },
        },
      });
      if (!run) return { kind: 'run_not_found' };
      const revision = await transaction.projectionRevision.findUnique({
        where: {
          organizationId_projection_sourceId: {
            organizationId,
            projection: RUN_PROGRESS_PROJECTION,
            sourceId: runId,
          },
        },
        select: { revision: true },
      });

      return {
        kind: 'found',
        value: {
          currentRevision: revision?.revision ?? 0,
          snapshot: run.progressSnapshot,
        },
      };
    });
  }

  async save(
    organizationId: string,
    runId: string,
    revision: number,
    response: RunProgressResponse,
  ): Promise<boolean> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const run = await transaction.testRun.findUnique({
        where: { organizationId_id: { organizationId, id: runId }, deletedAt: null },
        select: { id: true },
      });
      if (!run) return false;
      const currentRevision = await transaction.projectionRevision.findUnique({
        where: {
          organizationId_projection_sourceId: {
            organizationId,
            projection: RUN_PROGRESS_PROJECTION,
            sourceId: runId,
          },
        },
        select: { revision: true },
      });
      if ((currentRevision?.revision ?? 0) !== revision) return false;

      await transaction.runProgressSnapshot.upsert({
        where: { organizationId_runId: { organizationId, runId } },
        create: { organizationId, runId, revision, response },
        update: { revision, response, calculatedAt: new Date() },
      });
      return true;
    });
  }
}
