import { Inject, Injectable } from '@nestjs/common';
import type {
  ResultIngestion,
  ResultIngestionListQuery,
  ResultIngestionListResponse,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { ResultIngestionFormat, ResultIngestionStatus } from '../../../generated/prisma/enums';
import type { ResultIngestionMetadata } from '../../domain/models/result-ingestion';

type ResultIngestionListResult =
  | { kind: 'found'; value: ResultIngestionListResponse }
  | { kind: 'project_not_found' }
  | { kind: 'cursor_not_found' };

const STATUS: Record<NonNullable<ResultIngestionListQuery['status']>, ResultIngestionStatus> = {
  completed: ResultIngestionStatus.COMPLETED,
  failed: ResultIngestionStatus.FAILED,
};
const FORMAT_RESPONSE: Record<ResultIngestionFormat, ResultIngestion['format']> = {
  [ResultIngestionFormat.JUNIT]: 'junit',
};
const STATUS_RESPONSE: Record<ResultIngestionStatus, ResultIngestion['status']> = {
  [ResultIngestionStatus.COMPLETED]: 'completed',
  [ResultIngestionStatus.FAILED]: 'failed',
};

@Injectable()
export class ResultIngestionRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  list(
    organizationId: string,
    projectSlug: string,
    query: ResultIngestionListQuery,
  ): Promise<ResultIngestionListResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const cursor = query.cursor
        ? await transaction.testResultIngestion.findFirst({
            where: {
              organizationId,
              projectId: project.id,
              id: query.cursor,
              status: query.status ? STATUS[query.status] : undefined,
            },
            select: { id: true, createdAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'cursor_not_found' };

      const records = await transaction.testResultIngestion.findMany({
        where: {
          organizationId,
          projectId: project.id,
          status: query.status ? STATUS[query.status] : undefined,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: {
          id: true,
          format: true,
          status: true,
          source: true,
          pipeline: true,
          branch: true,
          total: true,
          recorded: true,
          unmatched: true,
          truncated: true,
          passed: true,
          failed: true,
          errors: true,
          skipped: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
          testRun: { select: { id: true, name: true, build: true } },
          initiatedBy: { select: { id: true, displayName: true } },
        },
      });

      const week = await transaction.testResultIngestion.aggregate({
        where: {
          organizationId,
          projectId: project.id,
          createdAt: { gte: startOfUtcWeek(new Date()) },
        },
        _count: { _all: true },
        _sum: { total: true, recorded: true, unmatched: true },
      });
      const total = week._sum.total ?? 0;
      const hasMore = records.length > query.limit;
      const page = records.slice(0, query.limit);

      return {
        kind: 'found',
        value: {
          project,
          summary: {
            reportsThisWeek: week._count._all,
            matchedPercentThisWeek:
              total === 0 ? 0 : Math.round(((week._sum.recorded ?? 0) / total) * 100),
            unmatchedThisWeek: week._sum.unmatched ?? 0,
          },
          items: page.map((record) => ({
            id: record.id,
            run: record.testRun,
            format: FORMAT_RESPONSE[record.format],
            status: STATUS_RESPONSE[record.status],
            source: record.source,
            pipeline: record.pipeline,
            branch: record.branch,
            total: record.total,
            recorded: record.recorded,
            unmatched: record.unmatched,
            truncated: record.truncated,
            counts: {
              passed: record.passed,
              failed: record.failed,
              error: record.errors,
              skipped: record.skipped,
            },
            error:
              record.errorCode && record.errorMessage
                ? { code: record.errorCode, message: record.errorMessage }
                : null,
            initiatedBy: record.initiatedBy,
            createdAt: record.createdAt.toISOString(),
            completedAt: record.completedAt.toISOString(),
          })),
          nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  recordFailed(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    metadata: ResultIngestionMetadata,
    errorCode: string,
    errorMessage: string,
  ): Promise<boolean> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const run = await transaction.testRun.findFirst({
        where: {
          organizationId,
          id: runId,
          deletedAt: null,
          project: { organizationId, slug: projectSlug, deletedAt: null },
        },
        select: { projectId: true },
      });
      if (!run) return false;

      await transaction.testResultIngestion.create({
        data: {
          organizationId,
          projectId: run.projectId,
          testRunId: runId,
          initiatedById: userId,
          format: ResultIngestionFormat.JUNIT,
          status: ResultIngestionStatus.FAILED,
          ...metadata,
          errorCode,
          errorMessage: errorMessage.slice(0, 1_000),
        },
      });
      return true;
    });
  }
}

function startOfUtcWeek(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}
