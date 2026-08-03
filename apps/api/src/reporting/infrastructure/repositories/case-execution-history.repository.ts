import { Inject, Injectable } from '@nestjs/common';
import type { CaseExecutionHistoryQuery, CaseExecutionHistoryResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import type { ReportingResult } from './reporting-result';

@Injectable()
export class CaseExecutionHistoryRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async find(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    query: CaseExecutionHistoryQuery,
  ): Promise<
    ReportingResult<
      CaseExecutionHistoryResponse,
      'project_not_found' | 'case_not_found' | 'history_cursor_not_found'
    >
  > {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const testCase = await transaction.testCase.findUnique({
        where: {
          organizationId_id: { organizationId, id: caseId },
          projectId: project.id,
        },
        select: {
          id: true,
          caseNumber: true,
          currentVersion: { select: { title: true } },
        },
      });
      if (!testCase?.currentVersion) return { kind: 'case_not_found' };

      const historyWhere = {
        organizationId,
        testRunItem: {
          caseVersion: { testCaseId: testCase.id },
          testRun: { projectId: project.id },
        },
      } as const;
      const cursor = query.cursor
        ? await transaction.testResult.findFirst({
            where: { ...historyWhere, id: query.cursor },
            select: { id: true, executedAt: true },
          })
        : null;
      if (query.cursor && !cursor) return { kind: 'history_cursor_not_found' };

      const results = await transaction.testResult.findMany({
        where: {
          ...historyWhere,
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
        select: {
          id: true,
          attempt: true,
          comment: true,
          elapsedMs: true,
          executedAt: true,
          build: true,
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
          executedBy: { select: { id: true, displayName: true } },
          testRunItem: {
            select: {
              id: true,
              caseVersion: { select: { id: true, version: true, title: true } },
              testRun: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  build: true,
                  createdAt: true,
                  closedAt: true,
                },
              },
            },
          },
        },
      });
      const hasNextPage = results.length > query.limit;
      const page = hasNextPage ? results.slice(0, query.limit) : results;

      return {
        kind: 'found',
        value: {
          project,
          testCase: {
            id: testCase.id,
            caseNumber: testCase.caseNumber.toString(),
            title: testCase.currentVersion.title,
          },
          items: page.map(({ testRunItem, ...result }) => ({
            runItemId: testRunItem.id,
            result: {
              ...result,
              build: result.build ?? testRunItem.testRun.build,
              executedAt: result.executedAt.toISOString(),
            },
            run: {
              ...testRunItem.testRun,
              status:
                testRunItem.testRun.status.toLowerCase() as CaseExecutionHistoryResponse['items'][number]['run']['status'],
              createdAt: testRunItem.testRun.createdAt.toISOString(),
              closedAt: testRunItem.testRun.closedAt?.toISOString() ?? null,
            },
            caseVersion: testRunItem.caseVersion,
          })),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }
}
