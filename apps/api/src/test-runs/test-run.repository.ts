import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTestRunRequest,
  TestRunListQuery,
  TestRunListResponse,
  TestRunStatus,
  TestRunSummary,
} from '@caselog/schemas';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../core/database/tenant-database.service';
import { RunStatus } from '../generated/prisma/enums';

const RUN_STATUS: Record<TestRunStatus, RunStatus> = {
  draft: RunStatus.DRAFT,
  active: RunStatus.ACTIVE,
  completed: RunStatus.COMPLETED,
  archived: RunStatus.ARCHIVED,
};

type RunResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'case_unavailable' }
  | { kind: 'untested_status_not_found' };

type RunRecord = {
  id: string;
  name: string;
  status: RunStatus;
  build: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

type RunCounts = { itemCount: number; completedCount: number; failedCount: number };

@Injectable()
export class TestRunRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async list(
    organizationId: string,
    projectSlug: string,
    query: TestRunListQuery,
  ): Promise<RunResult<TestRunListResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const runs = await transaction.testRun.findMany({
        where: {
          projectId: project.id,
          deletedAt: null,
          status: query.status ? RUN_STATUS[query.status] : undefined,
        },
        cursor: query.cursor
          ? { organizationId_id: { organizationId, id: query.cursor } }
          : undefined,
        skip: query.cursor ? 1 : undefined,
        take: query.limit + 1,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          build: true,
          createdAt: true,
          closedAt: true,
        },
      });
      const hasNextPage = runs.length > query.limit;
      const page = hasNextPage ? runs.slice(0, query.limit) : runs;
      const counts = await this.countItems(
        transaction,
        page.map(({ id }) => id),
      );
      return {
        kind: 'found',
        value: {
          project,
          items: page.map((run) => this.toSummary(run, counts.get(run.id))),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async create(
    organizationId: string,
    projectSlug: string,
    request: CreateTestRunRequest,
  ): Promise<RunResult<TestRunSummary>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };
      const cases = await transaction.testCase.findMany({
        where: {
          projectId: project.id,
          id: { in: request.caseIds },
          currentVersionId: { not: null },
          deletedAt: null,
        },
        select: { id: true, currentVersionId: true },
      });
      if (cases.length !== request.caseIds.length) return { kind: 'case_unavailable' };
      const untested = await transaction.resultStatus.findUnique({
        where: {
          organizationId_projectId_key: {
            organizationId,
            projectId: project.id,
            key: 'untested',
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!untested) return { kind: 'untested_status_not_found' };
      const versionByCase = new Map(
        cases.map((testCase) => [testCase.id, testCase.currentVersionId]),
      );
      const run = await transaction.testRun.create({
        data: {
          organizationId,
          projectId: project.id,
          name: request.name,
          build: request.build,
          status: RunStatus.ACTIVE,
          items: {
            create: request.caseIds.map((caseId, position) => ({
              caseVersionId: versionByCase.get(caseId) as string,
              statusId: untested.id,
              position,
            })),
          },
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
      return {
        kind: 'found',
        value: this.toSummary(run, {
          itemCount: request.caseIds.length,
          completedCount: 0,
          failedCount: 0,
        }),
      };
    });
  }

  private async countItems(
    transaction: TenantTransaction,
    runIds: string[],
  ): Promise<Map<string, RunCounts>> {
    const counts = new Map<string, RunCounts>();
    if (runIds.length === 0) return counts;
    const groups = await transaction.testRunItem.groupBy({
      by: ['testRunId', 'statusId'],
      where: { testRunId: { in: runIds } },
      _count: { _all: true },
    });
    const statuses = await transaction.resultStatus.findMany({
      where: { id: { in: [...new Set(groups.map(({ statusId }) => statusId))] } },
      select: { id: true, isFinal: true, countsAsFailure: true },
    });
    const statusById = new Map(statuses.map((status) => [status.id, status]));
    for (const group of groups) {
      const current = counts.get(group.testRunId) ?? {
        itemCount: 0,
        completedCount: 0,
        failedCount: 0,
      };
      const status = statusById.get(group.statusId);
      current.itemCount += group._count._all;
      if (status?.isFinal) current.completedCount += group._count._all;
      if (status?.countsAsFailure) current.failedCount += group._count._all;
      counts.set(group.testRunId, current);
    }
    return counts;
  }

  private toSummary(run: RunRecord, counts?: RunCounts): TestRunSummary {
    return {
      id: run.id,
      name: run.name,
      status: run.status.toLowerCase() as TestRunStatus,
      build: run.build,
      itemCount: counts?.itemCount ?? 0,
      completedCount: counts?.completedCount ?? 0,
      failedCount: counts?.failedCount ?? 0,
      createdAt: run.createdAt.toISOString(),
      closedAt: run.closedAt?.toISOString() ?? null,
    };
  }
}

export type { RunResult };
