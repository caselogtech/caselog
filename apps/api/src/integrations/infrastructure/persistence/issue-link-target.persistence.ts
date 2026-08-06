import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import type { IssueLinkResult } from '../../domain/models/issue-link';

export type CaseTarget = {
  projectId: string;
  caseId: string;
};

export type ResultTarget = {
  projectId: string;
  resultId: string;
  resultExecutedAt: Date;
};

export async function findCaseTarget(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  caseId: string,
): Promise<IssueLinkResult<CaseTarget>> {
  const project = await findProject(transaction, organizationId, projectSlug);
  if (!project) return { kind: 'project_not_found' };

  const testCase = await transaction.testCase.findFirst({
    where: { organizationId, id: caseId, projectId: project.id, deletedAt: null },
    select: { id: true },
  });
  if (!testCase) return { kind: 'case_not_found' };

  return { kind: 'found', value: { projectId: project.id, caseId: testCase.id } };
}

export async function findResultTarget(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  runId: string,
  itemId: string,
  resultId: string,
): Promise<IssueLinkResult<ResultTarget>> {
  const project = await findProject(transaction, organizationId, projectSlug);
  if (!project) return { kind: 'project_not_found' };

  const run = await transaction.testRun.findFirst({
    where: { organizationId, id: runId, projectId: project.id, deletedAt: null },
    select: { id: true },
  });
  if (!run) return { kind: 'run_not_found' };

  const item = await transaction.testRunItem.findFirst({
    where: { organizationId, id: itemId, testRunId: run.id },
    select: { id: true },
  });
  if (!item) return { kind: 'item_not_found' };

  const result = await transaction.testResult.findFirst({
    where: { organizationId, id: resultId, testRunItemId: item.id },
    select: { id: true, executedAt: true },
  });
  if (!result) return { kind: 'result_not_found' };

  return {
    kind: 'found',
    value: { projectId: project.id, resultId: result.id, resultExecutedAt: result.executedAt },
  };
}

export function jiraConnectionExists(
  transaction: TenantTransaction,
  organizationId: string,
  connectionId: string,
): Promise<boolean> {
  return transaction.integrationConnection
    .count({
      where: {
        organizationId,
        id: connectionId,
        provider: 'jira',
        status: { not: 'disabled' },
        deletedAt: null,
      },
    })
    .then((count) => count === 1);
}

function findProject(transaction: TenantTransaction, organizationId: string, projectSlug: string) {
  return transaction.project.findUnique({
    where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
    select: { id: true },
  });
}
