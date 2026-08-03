import type { TestRunSummary } from '@caselog/schemas';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  IdempotencyClaim,
  LockedRunContext,
  RunCounts,
  RunRecord,
  RunResult,
} from '../repositories/test-run.repository.types';

export async function lockRun(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  runId: string,
  mode: 'exclusive' | 'shared' = 'exclusive',
): Promise<RunResult<LockedRunContext>> {
  const project = await transaction.project.findUnique({
    where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { kind: 'project_not_found' };
  const locked =
    mode === 'shared'
      ? await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM test_runs
          WHERE organization_id = ${organizationId}::uuid AND project_id = ${project.id}::uuid
            AND id = ${runId}::uuid AND deleted_at IS NULL FOR SHARE
        `
      : await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM test_runs
          WHERE organization_id = ${organizationId}::uuid AND project_id = ${project.id}::uuid
            AND id = ${runId}::uuid AND deleted_at IS NULL FOR UPDATE
        `;
  if (locked.length === 0) return { kind: 'run_not_found' };
  const run = await transaction.testRun.findUniqueOrThrow({
    where: { organizationId_id: { organizationId, id: runId } },
    select: {
      id: true,
      name: true,
      status: true,
      build: true,
      createdAt: true,
      closedAt: true,
    },
  });
  return { kind: 'found', value: { projectId: project.id, run } };
}

export async function claimIdempotency<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyClaim<T>> {
  const claimed = await transaction.$queryRaw<Array<{ key: string }>>`
    INSERT INTO idempotency_records (organization_id, scope, key, request_hash)
    VALUES (${organizationId}::uuid, ${scope}, ${key}, ${requestHash})
    ON CONFLICT (organization_id, scope, key) DO UPDATE
    SET request_hash = EXCLUDED.request_hash,
        response = NULL,
        created_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
    WHERE idempotency_records.expires_at <= CURRENT_TIMESTAMP
    RETURNING key
  `;
  if (claimed.length > 0) return { kind: 'claimed' };

  const previous = await transaction.idempotencyRecord.findUniqueOrThrow({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    select: { requestHash: true, response: true },
  });
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function findIdempotency<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  requestHash: string,
): Promise<Exclude<IdempotencyClaim<T>, { kind: 'claimed' }> | null> {
  const previous = await transaction.idempotencyRecord.findUnique({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    select: { requestHash: true, response: true, expiresAt: true },
  });
  if (!previous || previous.expiresAt <= new Date()) return null;
  if (previous.requestHash !== requestHash) return { kind: 'conflict' };
  if (previous.response === null) {
    throw new Error('Completed idempotency record does not contain a response');
  }
  return { kind: 'replay', value: previous.response as T };
}

export async function storeIdempotencyResponse<T>(
  transaction: TenantTransaction,
  organizationId: string,
  scope: string,
  key: string,
  response: T,
): Promise<void> {
  const jsonResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
  await transaction.idempotencyRecord.update({
    where: { organizationId_scope_key: { organizationId, scope, key } },
    data: { response: jsonResponse },
  });
}

export async function countRunItems(
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

export function toRunSummary(run: RunRecord, counts?: RunCounts): TestRunSummary {
  return {
    id: run.id,
    name: run.name,
    status: run.status.toLowerCase() as TestRunSummary['status'],
    build: run.build,
    itemCount: counts?.itemCount ?? 0,
    completedCount: counts?.completedCount ?? 0,
    failedCount: counts?.failedCount ?? 0,
    createdAt: run.createdAt.toISOString(),
    closedAt: run.closedAt?.toISOString() ?? null,
  };
}
