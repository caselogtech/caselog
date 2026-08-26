import { Inject, Injectable } from '@nestjs/common';
import {
  testRunItemResponseSchema,
  type AssignTestRunItemRequest,
  type AssignTestRunItemResponse,
  type CreateTestRunRequest,
  type TestRunDetailQuery,
  type TestRunDetailResponse,
  type TestRunListQuery,
  type TestRunListResponse,
  type TestRunStatus,
  type TestRunSummary,
} from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { bumpProjectionRevision } from '../../../core/database/infrastructure/persistence/projection-revision';
import { RUN_PROGRESS_PROJECTION } from '../../../reporting/public-api';
import { RunStatus } from '../../../generated/prisma/enums';
import { appendAuditLog } from '../../../audit/public-api';
import { testRunEvidenceSourceChangedEvent } from '../../application/events/test-run-integration-event';
import { appendTestRunIntegrationEvent } from '../persistence/test-run-event.persistence';
import {
  claimIdempotency,
  countRunItems,
  findIdempotency,
  lockRun,
  storeIdempotencyResponse,
  toRunSummary,
} from '../persistence/test-run.persistence';
import type { RunResult } from './test-run.repository.types';

const RUN_STATUS: Record<TestRunStatus, RunStatus> = {
  draft: RunStatus.DRAFT,
  active: RunStatus.ACTIVE,
  completed: RunStatus.COMPLETED,
  archived: RunStatus.ARCHIVED,
};

const LIFECYCLE_AUDIT_ACTION = {
  start: 'test_run.started',
  close: 'test_run.closed',
  archive: 'test_run.archived',
  restore: 'test_run.restored',
} as const;

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
      const counts = await countRunItems(
        transaction,
        page.map(({ id }) => id),
      );
      return {
        kind: 'found',
        value: {
          project,
          items: page.map((run) => toRunSummary(run, counts.get(run.id))),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async create(
    organizationId: string,
    projectSlug: string,
    idempotencyKey: string,
    requestHash: string,
    request: CreateTestRunRequest,
  ): Promise<RunResult<TestRunSummary>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const lockedProject = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM projects
        WHERE organization_id = ${organizationId}::uuid
          AND slug = ${projectSlug}
          AND deleted_at IS NULL
        FOR SHARE
      `;
      const projectId = lockedProject[0]?.id;
      if (!projectId) return { kind: 'project_not_found' };
      const scope = `project:${projectId}:test-runs:create`;
      const existing = await findIdempotency<TestRunSummary>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (existing?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (existing?.kind === 'replay') return { kind: 'found', value: existing.value };
      const cases = await transaction.testCase.findMany({
        where: {
          projectId,
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
            projectId,
            key: 'untested',
          },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!untested) return { kind: 'untested_status_not_found' };
      const claim = await claimIdempotency<TestRunSummary>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };
      const versionByCase = new Map(
        cases.map((testCase) => [testCase.id, testCase.currentVersionId]),
      );
      const run = await transaction.testRun.create({
        data: {
          organizationId,
          projectId,
          name: request.name,
          build: request.build,
          status: RUN_STATUS[request.status ?? 'active'],
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
      const summary = toRunSummary(run, {
        itemCount: request.caseIds.length,
        completedCount: 0,
        failedCount: 0,
      });
      await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, summary);
      return { kind: 'found', value: summary };
    });
  }

  async detail(
    organizationId: string,
    projectSlug: string,
    runId: string,
    query: TestRunDetailQuery,
  ): Promise<RunResult<TestRunDetailResponse>> {
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
      const items = await transaction.testRunItem.findMany({
        where: { testRunId: run.id },
        cursor: query.cursor
          ? { organizationId_id: { organizationId, id: query.cursor } }
          : undefined,
        skip: query.cursor ? 1 : undefined,
        take: query.limit + 1,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
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
      const hasNextPage = items.length > query.limit;
      const page = hasNextPage ? items.slice(0, query.limit) : items;
      const memberships = await transaction.membership.findMany({
        where: { deletedAt: null, role: { not: 'READ_ONLY' }, user: { deletedAt: null } },
        orderBy: [{ user: { displayName: 'asc' } }, { userId: 'asc' }],
        select: { user: { select: { id: true, displayName: true } } },
      });
      const statuses = await transaction.resultStatus.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          key: true,
          name: true,
          color: true,
          isFinal: true,
          countsAsFailure: true,
        },
      });
      const counts = await countRunItems(transaction, [run.id]);
      return {
        kind: 'found',
        value: {
          project,
          run: toRunSummary(run, counts.get(run.id)),
          items: page.map(({ _count, caseVersion, status, ...item }) =>
            testRunItemResponseSchema.parse({
              ...item,
              caseVersion: {
                ...caseVersion,
                template: caseVersion.template.toLowerCase(),
              },
              status,
              attemptCount: _count.results,
            }),
          ),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
          members: memberships.map(({ user }) => user),
          statuses,
        },
      };
    });
  }

  start(
    organizationId: string,
    projectSlug: string,
    runId: string,
    actorId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, actorId, 'start');
  }

  close(
    organizationId: string,
    projectSlug: string,
    runId: string,
    actorId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, actorId, 'close');
  }

  archive(
    organizationId: string,
    projectSlug: string,
    runId: string,
    actorId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, actorId, 'archive');
  }

  restore(
    organizationId: string,
    projectSlug: string,
    runId: string,
    actorId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, actorId, 'restore');
  }

  async assign(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: AssignTestRunItemRequest,
  ): Promise<RunResult<AssignTestRunItemResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await lockRun(transaction, organizationId, projectSlug, runId, 'shared');
      if (context.kind !== 'found') return context;
      if (
        context.value.run.status === RunStatus.COMPLETED ||
        context.value.run.status === RunStatus.ARCHIVED
      ) {
        return { kind: 'run_closed' };
      }
      const item = await transaction.testRunItem.findUnique({
        where: { organizationId_id: { organizationId, id: itemId }, testRunId: runId },
        select: { id: true },
      });
      if (!item) return { kind: 'item_not_found' };
      const assignee = request.assigneeId
        ? await transaction.membership.findFirst({
            where: {
              userId: request.assigneeId,
              deletedAt: null,
              role: { not: 'READ_ONLY' },
              user: { deletedAt: null },
            },
            select: { user: { select: { id: true, displayName: true } } },
          })
        : null;
      if (request.assigneeId && !assignee) return { kind: 'member_not_found' };
      await transaction.testRunItem.update({
        where: { organizationId_id: { organizationId, id: item.id } },
        data: { assigneeId: assignee?.user.id ?? null },
      });
      await bumpProjectionRevision(transaction, organizationId, RUN_PROGRESS_PROJECTION, runId);
      return {
        kind: 'found',
        value: { itemId: item.id, assignee: assignee?.user ?? null },
      };
    });
  }

  private async changeLifecycle(
    organizationId: string,
    projectSlug: string,
    runId: string,
    actorId: string,
    action: 'start' | 'close' | 'archive' | 'restore',
  ): Promise<RunResult<TestRunSummary>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await lockRun(transaction, organizationId, projectSlug, runId);
      if (context.kind !== 'found') return context;
      const current = context.value.run;
      if ((action === 'start' || action === 'close') && current.status === RunStatus.ARCHIVED) {
        return { kind: 'invalid_run_state' };
      }
      if (action === 'start' && current.status === RunStatus.COMPLETED) {
        return { kind: 'invalid_run_state' };
      }
      if (
        action === 'archive' &&
        current.status !== RunStatus.COMPLETED &&
        current.status !== RunStatus.ARCHIVED
      ) {
        return { kind: 'invalid_run_state' };
      }
      if (
        action === 'restore' &&
        current.status !== RunStatus.ARCHIVED &&
        current.status !== RunStatus.COMPLETED
      ) {
        return { kind: 'invalid_run_state' };
      }
      let nextStatus: RunStatus | null = null;
      if (action === 'start' && current.status === RunStatus.DRAFT) {
        nextStatus = RunStatus.ACTIVE;
      } else if (action === 'close' && current.status !== RunStatus.COMPLETED) {
        nextStatus = RunStatus.COMPLETED;
      } else if (action === 'archive' && current.status === RunStatus.COMPLETED) {
        nextStatus = RunStatus.ARCHIVED;
      } else if (action === 'restore' && current.status === RunStatus.ARCHIVED) {
        nextStatus = RunStatus.COMPLETED;
      }

      const changedAt = new Date();
      const run = nextStatus
        ? await transaction.testRun.update({
            where: { organizationId_id: { organizationId, id: runId } },
            data: {
              status: nextStatus,
              ...(action === 'close' ? { closedAt: changedAt } : {}),
            },
            select: {
              id: true,
              name: true,
              status: true,
              build: true,
              createdAt: true,
              closedAt: true,
            },
          })
        : current;
      if (nextStatus) {
        await appendAuditLog(transaction, {
          organizationId,
          actorId,
          actorType: 'user',
          action: LIFECYCLE_AUDIT_ACTION[action],
          targetType: 'test_run',
          targetId: runId,
          metadata: {
            projectSlug,
            previousStatus: current.status.toLowerCase(),
            nextStatus: nextStatus.toLowerCase(),
          },
        });
        const sourceRevision = await bumpProjectionRevision(
          transaction,
          organizationId,
          RUN_PROGRESS_PROJECTION,
          runId,
        );
        await appendTestRunIntegrationEvent(
          transaction,
          testRunEvidenceSourceChangedEvent({
            organizationId,
            actorId,
            projectId: context.value.projectId,
            testRunId: runId,
            revision: sourceRevision,
            reason: 'lifecycle_changed',
            occurredAt: changedAt,
          }),
        );
      }
      const counts = await countRunItems(transaction, [run.id]);
      return { kind: 'found', value: toRunSummary(run, counts.get(run.id)) };
    });
  }
}

export type { RunResult } from './test-run.repository.types';
