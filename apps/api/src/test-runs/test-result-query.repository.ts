import { Inject, Injectable } from '@nestjs/common';
import {
  testRunItemResponseSchema,
  type TestResultDetailResponse,
  type TestResultHistoryQuery,
  type TestResultHistoryResponse,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import { resultAttachments, resultSelection, toTestResult } from './test-result.persistence';
import type { RunResult } from './test-run.repository.types';

@Injectable()
export class TestResultQueryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async history(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    query: TestResultHistoryQuery,
  ): Promise<RunResult<TestResultHistoryResponse>> {
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
        select: { id: true },
      });
      if (!run) return { kind: 'run_not_found' };
      const item = await transaction.testRunItem.findUnique({
        where: { organizationId_id: { organizationId, id: itemId }, testRunId: run.id },
        select: { id: true, caseVersion: { select: { title: true } } },
      });
      if (!item) return { kind: 'item_not_found' };
      const cursor = query.cursor
        ? await transaction.testResult.findFirst({
            where: { id: query.cursor, testRunItemId: item.id },
            select: { id: true, executedAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'result_not_found' };
      const results = await transaction.testResult.findMany({
        where: {
          testRunItemId: item.id,
          ...(cursor
            ? {
                OR: [
                  { executedAt: { lt: cursor.executedAt } },
                  { executedAt: cursor.executedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        take: query.limit + 1,
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        select: resultSelection(),
      });
      const hasNextPage = results.length > query.limit;
      const page = hasNextPage ? results.slice(0, query.limit) : results;
      const attachments = await resultAttachments(
        transaction,
        page.map(({ id }) => id),
      );
      return {
        kind: 'found',
        value: {
          item: { id: item.id, title: item.caseVersion.title },
          results: page.map((result) => toTestResult(result, attachments.get(result.id))),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async detail(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
  ): Promise<RunResult<TestResultDetailResponse>> {
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
        select: { id: true },
      });
      if (!run) return { kind: 'run_not_found' };
      const item = await transaction.testRunItem.findUnique({
        where: { organizationId_id: { organizationId, id: itemId }, testRunId: run.id },
        select: {
          id: true,
          position: true,
          caseVersion: {
            select: {
              id: true,
              version: true,
              title: true,
              template: true,
              preconditions: true,
              expectedResult: true,
              content: true,
            },
          },
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
          _count: { select: { results: true } },
        },
      });
      if (!item) return { kind: 'item_not_found' };
      const result = await transaction.testResult.findFirst({
        where: { id: resultId, testRunItemId: item.id },
        select: resultSelection(),
      });
      if (!result) return { kind: 'result_not_found' };
      const attachments = await resultAttachments(transaction, [result.id]);
      return {
        kind: 'found',
        value: {
          item: testRunItemResponseSchema.parse({
            id: item.id,
            position: item.position,
            caseVersion: {
              ...item.caseVersion,
              template: item.caseVersion.template.toLowerCase(),
            },
            status: item.status,
            assignee: item.assignee,
            attemptCount: item._count.results,
          }),
          result: toTestResult(result, attachments.get(result.id)),
        },
      };
    });
  }
}
