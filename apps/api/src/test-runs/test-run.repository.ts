import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  testRunItemResponseSchema,
  testResultResponseSchema,
  type AssignTestRunItemRequest,
  type AssignTestRunItemResponse,
  type BulkTestResultsRequest,
  type BulkTestResultsResponse,
  type CreateTestResultRequest,
  type CreateTestResultResponse,
  type CreateTestRunRequest,
  type ResultAttachmentResponse,
  type ResultStatusResponse,
  type JUnitUploadResponse,
  type TestRunDetailQuery,
  type TestRunDetailResponse,
  type TestRunListQuery,
  type TestRunListResponse,
  type TestRunStatus,
  type TestRunSummary,
  type TestResultDetailResponse,
  type TestResultHistoryQuery,
  type TestResultHistoryResponse,
} from '@caselog/schemas';
import type { PreparedResultAttachment } from '../attachments/attachment.service';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../core/database/tenant-database.service';
import { Prisma } from '../generated/prisma/client';
import { AttachmentTargetType, RunStatus } from '../generated/prisma/enums';
import type { ParsedJUnitResult } from './junit-parser';

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
  | { kind: 'untested_status_not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'member_not_found' }
  | { kind: 'status_not_found' }
  | { kind: 'result_not_found' }
  | { kind: 'invalid_step_results' }
  | { kind: 'invalid_upload' }
  | { kind: 'run_closed' }
  | { kind: 'invalid_run_state' }
  | { kind: 'duplicate_matched_item' }
  | { kind: 'ingest_status_unavailable' }
  | { kind: 'idempotency_conflict' };

type RunRecord = {
  id: string;
  name: string;
  status: RunStatus;
  build: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

type RunCounts = { itemCount: number; completedCount: number; failedCount: number };

type ResultRecord = {
  id: string;
  attempt: number;
  comment: string | null;
  elapsedMs: number | null;
  executedAt: Date;
  executedBy: RunMemberRecord | null;
  status: ResultStatusResponse;
  stepResults: Array<{
    id: string;
    position: number;
    comment: string | null;
    elapsedMs: number | null;
    status: ResultStatusResponse;
  }>;
};

type AttachmentRecord = ResultAttachmentResponse;

type RunMemberRecord = { id: string; displayName: string };

type IdempotencyClaim<T> =
  | { kind: 'claimed' }
  | { kind: 'replay'; value: T }
  | { kind: 'conflict' };

type MatchableRunItem = {
  id: string;
  caseVersion: {
    testCase: { automationId: string | null; caseNumber: bigint };
  };
};

type RunItemIndex = {
  byId: Map<string, MatchableRunItem>;
  byAutomationId: Map<string, MatchableRunItem[]>;
  byCaseNumber: Map<string, MatchableRunItem[]>;
};

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
      const existing = await this.findIdempotency<TestRunSummary>(
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
      const claim = await this.claimIdempotency<TestRunSummary>(
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
      const summary = this.toSummary(run, {
        itemCount: request.caseIds.length,
        completedCount: 0,
        failedCount: 0,
      });
      await this.storeIdempotencyResponse(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        summary,
      );
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
      const counts = await this.countItems(transaction, [run.id]);
      return {
        kind: 'found',
        value: {
          project,
          run: this.toSummary(run, counts.get(run.id)),
          items: page.map(({ _count, caseVersion, status, ...item }) =>
            testRunItemResponseSchema.parse({
              ...item,
              caseVersion: {
                ...caseVersion,
                template: caseVersion.template.toLowerCase(),
              },
              status: this.toStatus(status),
              attemptCount: _count.results,
            }),
          ),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
          members: memberships.map(({ user }) => user),
          statuses: statuses.map((status) => this.toStatus(status)),
        },
      };
    });
  }

  async start(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, 'start');
  }

  async close(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, 'close');
  }

  async archive(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, 'archive');
  }

  async restore(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<RunResult<TestRunSummary>> {
    return this.changeLifecycle(organizationId, projectSlug, runId, 'restore');
  }

  async assign(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: AssignTestRunItemRequest,
  ): Promise<RunResult<AssignTestRunItemResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockRun(transaction, organizationId, projectSlug, runId, 'shared');
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
      return {
        kind: 'found',
        value: { itemId: item.id, assignee: assignee?.user ?? null },
      };
    });
  }

  async recordResult(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateTestResultRequest,
    preparedAttachments: PreparedResultAttachment[],
  ): Promise<RunResult<CreateTestResultResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockRun(transaction, organizationId, projectSlug, runId, 'shared');
      if (context.kind !== 'found') return context;
      if (context.value.run.status !== RunStatus.ACTIVE) return { kind: 'run_closed' };
      const lockedItem = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM test_run_items
        WHERE organization_id = ${organizationId}::uuid AND test_run_id = ${runId}::uuid
          AND id = ${itemId}::uuid FOR UPDATE
      `;
      if (lockedItem.length === 0) return { kind: 'item_not_found' };
      const item = await transaction.testRunItem.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: itemId } },
        select: { caseVersion: { select: { template: true, content: true } } },
      });
      const requestedStatusIds = [
        ...new Set([
          request.statusId,
          ...(request.stepResults?.map(({ statusId }) => statusId) ?? []),
        ]),
      ];
      const statuses = await transaction.resultStatus.findMany({
        where: {
          id: { in: requestedStatusIds },
          projectId: context.value.projectId,
          deletedAt: null,
        },
        select: {
          id: true,
          key: true,
          name: true,
          color: true,
          isFinal: true,
          countsAsFailure: true,
        },
      });
      if (statuses.length !== requestedStatusIds.length) return { kind: 'status_not_found' };
      const statusById = new Map(statuses.map((status) => [status.id, status]));
      const status = statusById.get(request.statusId);
      if (!status) return { kind: 'status_not_found' };
      const content = item.caseVersion.content as { steps?: unknown[] };
      const stepCount = item.caseVersion.template === 'STEPS' ? (content.steps?.length ?? 0) : 0;
      if (
        request.stepResults?.some(({ position }) => position >= stepCount) ||
        (request.stepResults &&
          request.stepResults.length > 0 &&
          item.caseVersion.template !== 'STEPS')
      ) {
        return { kind: 'invalid_step_results' };
      }
      for (const uploadId of preparedAttachments.map(({ uploadId }) => uploadId).sort()) {
        const lockedUpload = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM upload_sessions
          WHERE organization_id = ${organizationId}::uuid
            AND id = ${uploadId}::uuid
            AND test_run_id = ${runId}::uuid
            AND test_run_item_id = ${itemId}::uuid
            AND created_by_id = ${userId}::uuid
            AND completed_at IS NULL
            AND expires_at > CURRENT_TIMESTAMP
          FOR UPDATE
        `;
        if (lockedUpload.length === 0) return { kind: 'invalid_upload' };
      }
      const aggregate = await transaction.testResult.aggregate({
        where: { testRunItemId: itemId },
        _max: { attempt: true },
      });
      const result = await transaction.testResult.create({
        data: {
          organizationId,
          testRunItemId: itemId,
          statusId: status.id,
          attempt: (aggregate._max.attempt ?? 0) + 1,
          comment: request.comment,
          elapsedMs: request.elapsedMs,
          executedById: userId,
          build: context.value.run.build,
        },
        select: {
          id: true,
          attempt: true,
          comment: true,
          elapsedMs: true,
          executedAt: true,
          executedBy: { select: { id: true, displayName: true } },
        },
      });
      await transaction.testRunItem.update({
        where: { organizationId_id: { organizationId, id: itemId } },
        data: { statusId: status.id },
      });
      if (request.stepResults && request.stepResults.length > 0) {
        await transaction.testStepResult.createMany({
          data: request.stepResults.map((step) => ({
            organizationId,
            testResultId: result.id,
            resultExecutedAt: result.executedAt,
            statusId: step.statusId,
            position: step.position,
            comment: step.comment,
            elapsedMs: step.elapsedMs,
          })),
        });
      }
      if (preparedAttachments.length > 0) {
        await transaction.attachment.createMany({
          data: preparedAttachments.map((attachment) => ({
            organizationId,
            id: attachment.id,
            targetType: AttachmentTargetType.RESULT,
            targetId: result.id,
            storageKey: attachment.storageKey,
            fileName: attachment.fileName,
            contentType: attachment.contentType,
            sizeBytes: BigInt(attachment.sizeBytes),
            checksumSha256: attachment.checksumSha256,
            stepPosition: attachment.stepPosition,
          })),
        });
        const completed = await transaction.uploadSession.updateMany({
          where: {
            id: { in: preparedAttachments.map(({ uploadId }) => uploadId) },
            completedAt: null,
          },
          data: { completedAt: new Date() },
        });
        if (completed.count !== preparedAttachments.length) {
          throw new Error('Upload sessions changed while recording a result');
        }
      }
      const stepResults = await transaction.testStepResult.findMany({
        where: { testResultId: result.id, resultExecutedAt: result.executedAt },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          position: true,
          comment: true,
          elapsedMs: true,
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
        },
      });
      const attachments = await this.resultAttachments(transaction, [result.id]);
      return {
        kind: 'found',
        value: {
          result: {
            ...result,
            status: this.toStatus(status),
            executedAt: result.executedAt.toISOString(),
            stepResults: stepResults.map(({ status: stepStatus, ...step }) => ({
              ...step,
              status: this.toStatus(stepStatus),
            })),
            attachments: attachments.get(result.id) ?? [],
          },
        },
      };
    });
  }

  async bulkRecordResults(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    idempotencyKey: string,
    requestHash: string,
    request: BulkTestResultsRequest,
  ): Promise<RunResult<BulkTestResultsResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockRun(transaction, organizationId, projectSlug, runId, 'shared');
      if (context.kind !== 'found') return context;

      const scope = `test-run:${runId}:results:bulk`;
      const existing = await this.findIdempotency<BulkTestResultsResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (existing?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (existing?.kind === 'replay') return { kind: 'found', value: existing.value };
      if (context.value.run.status !== RunStatus.ACTIVE) return { kind: 'run_closed' };

      const runItems = await this.matchableRunItems(transaction, organizationId, runId);
      const itemIndex = this.indexRunItems(runItems);

      const matchedResults: Array<(typeof request.results)[number] & { itemId: string }> = [];
      const unmatched: BulkTestResultsResponse['unmatched'] = [];
      for (const [index, requestResult] of request.results.entries()) {
        if (requestResult.itemId) {
          if (!itemIndex.byId.has(requestResult.itemId)) return { kind: 'item_not_found' };
          matchedResults.push({ ...requestResult, itemId: requestResult.itemId });
          continue;
        }

        const matches = this.matchExternalItem(
          itemIndex,
          requestResult.automationId,
          requestResult.caseNumber,
        );

        if (matches.length === 1 && matches[0]) {
          matchedResults.push({ ...requestResult, itemId: matches[0].id });
          continue;
        }
        unmatched.push({
          index,
          automationId: requestResult.automationId ?? null,
          caseNumber: requestResult.caseNumber ?? null,
          reason: matches.length === 0 ? 'not_found' : 'ambiguous',
        });
      }

      const resolvedItemIds = matchedResults.map(({ itemId }) => itemId);
      if (new Set(resolvedItemIds).size !== resolvedItemIds.length) {
        return { kind: 'duplicate_matched_item' };
      }
      const itemIds = [...resolvedItemIds].sort();
      if (itemIds.length > 0) {
        const lockedItems = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM test_run_items
        WHERE organization_id = ${organizationId}::uuid
          AND test_run_id = ${runId}::uuid
          AND id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY id
        FOR UPDATE
      `;
        if (lockedItems.length !== itemIds.length) return { kind: 'item_not_found' };
      }

      const requestedStatusIds = [...new Set(request.results.map(({ statusId }) => statusId))];
      const statuses = await transaction.resultStatus.findMany({
        where: {
          id: { in: requestedStatusIds },
          projectId: context.value.projectId,
          deletedAt: null,
        },
        select: {
          id: true,
          key: true,
          name: true,
          color: true,
          isFinal: true,
          countsAsFailure: true,
        },
      });
      if (statuses.length !== requestedStatusIds.length) return { kind: 'status_not_found' };
      const statusById = new Map(statuses.map((status) => [status.id, status]));

      const claim = await this.claimIdempotency<BulkTestResultsResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

      if (matchedResults.length === 0) {
        const response: BulkTestResultsResponse = { results: [], unmatched };
        await this.storeIdempotencyResponse(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          response,
        );
        return { kind: 'found', value: response };
      }

      const attemptGroups = await transaction.testResult.groupBy({
        by: ['testRunItemId'],
        where: { testRunItemId: { in: itemIds } },
        _max: { attempt: true },
      });
      const previousAttemptByItem = new Map(
        attemptGroups.map(({ testRunItemId, _max }) => [testRunItemId, _max.attempt ?? 0]),
      );
      const executedAt = new Date();
      const results = matchedResults.map((requestResult) => ({
        ...requestResult,
        resultId: randomUUID(),
        attempt: (previousAttemptByItem.get(requestResult.itemId) ?? 0) + 1,
      }));

      await transaction.testResult.createMany({
        data: results.map((result) => ({
          organizationId,
          id: result.resultId,
          testRunItemId: result.itemId,
          statusId: result.statusId,
          attempt: result.attempt,
          comment: result.comment,
          elapsedMs: result.elapsedMs,
          executedById: userId,
          executedAt,
          build: context.value.run.build,
        })),
      });

      const statusUpdates = Prisma.join(
        results.map(({ itemId, statusId }) => Prisma.sql`(${itemId}::uuid, ${statusId}::uuid)`),
      );
      await transaction.$executeRaw`
        UPDATE test_run_items AS item
        SET status_id = changes.status_id,
            updated_at = CURRENT_TIMESTAMP
        FROM (VALUES ${statusUpdates}) AS changes(id, status_id)
        WHERE item.organization_id = ${organizationId}::uuid
          AND item.test_run_id = ${runId}::uuid
          AND item.id = changes.id
      `;

      const responseResults = results.map(({ itemId, resultId, attempt, statusId }) => {
        const status = statusById.get(statusId);
        if (!status) throw new Error('Validated result status is unavailable');
        return {
          itemId,
          resultId,
          attempt,
          status: this.toStatus(status),
          executedAt: executedAt.toISOString(),
        };
      });
      const response: BulkTestResultsResponse = { results: responseResults, unmatched };
      await this.storeIdempotencyResponse(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        response,
      );
      return { kind: 'found', value: response };
    });
  }

  async ingestJUnitResults(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    idempotencyKey: string,
    requestHash: string,
    parsedResults: ParsedJUnitResult[],
  ): Promise<RunResult<JUnitUploadResponse>> {
    return this.tenantDatabase.run(
      organizationId,
      async (transaction) => {
        const context = await this.lockRun(
          transaction,
          organizationId,
          projectSlug,
          runId,
          'shared',
        );
        if (context.kind !== 'found') return context;

        const scope = `test-run:${runId}:results:junit`;
        const existing = await this.findIdempotency<JUnitUploadResponse>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (existing?.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (existing?.kind === 'replay') return { kind: 'found', value: existing.value };
        if (context.value.run.status !== RunStatus.ACTIVE) return { kind: 'run_closed' };

        const statuses = await transaction.resultStatus.findMany({
          where: {
            projectId: context.value.projectId,
            key: { in: ['untested', 'passed', 'failed', 'skipped'] },
            deletedAt: null,
          },
          select: { id: true, key: true },
        });
        const statusIdByKey = new Map(statuses.map((status) => [status.key, status.id]));
        const passedStatusId = statusIdByKey.get('passed');
        const failedStatusId = statusIdByKey.get('failed');
        const skippedStatusId = statusIdByKey.get('skipped') ?? statusIdByKey.get('untested');
        if (
          !passedStatusId ||
          !failedStatusId ||
          (parsedResults.some(({ status }) => status === 'skipped') && !skippedStatusId)
        ) {
          return { kind: 'ingest_status_unavailable' };
        }

        const runItems = await this.matchableRunItems(transaction, organizationId, runId);
        const itemIndex = this.indexRunItems(runItems);
        const matched: Array<{
          itemId: string;
          statusId: string;
          parsed: ParsedJUnitResult;
        }> = [];
        const unmatched: JUnitUploadResponse['unmatched'] = [];
        for (const parsed of parsedResults) {
          const matches = this.matchExternalItem(
            itemIndex,
            parsed.automationId,
            parsed.caseNumber ?? undefined,
          );
          if (matches.length !== 1 || !matches[0]) {
            unmatched.push({
              sequence: parsed.sequence,
              name: parsed.name,
              automationId: parsed.automationId,
              caseNumber: parsed.caseNumber,
              reason: matches.length === 0 ? 'not_found' : 'ambiguous',
            });
            continue;
          }
          matched.push({
            itemId: matches[0].id,
            statusId:
              parsed.status === 'passed'
                ? passedStatusId
                : parsed.status === 'skipped'
                  ? (skippedStatusId as string)
                  : failedStatusId,
            parsed,
          });
        }

        const itemIds = [...new Set(matched.map(({ itemId }) => itemId))].sort();
        if (itemIds.length > 0) {
          const lockedItems = await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM test_run_items
          WHERE organization_id = ${organizationId}::uuid
            AND test_run_id = ${runId}::uuid
            AND id IN (${Prisma.join(itemIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id
          FOR UPDATE
        `;
          if (lockedItems.length !== itemIds.length) return { kind: 'item_not_found' };
        }

        const claim = await this.claimIdempotency<JUnitUploadResponse>(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          requestHash,
        );
        if (claim.kind === 'conflict') return { kind: 'idempotency_conflict' };
        if (claim.kind === 'replay') return { kind: 'found', value: claim.value };

        if (matched.length > 0) {
          const attemptGroups = await transaction.testResult.groupBy({
            by: ['testRunItemId'],
            where: { testRunItemId: { in: itemIds } },
            _max: { attempt: true },
          });
          const nextAttemptByItem = new Map(
            attemptGroups.map(({ testRunItemId, _max }) => [testRunItemId, _max.attempt ?? 0]),
          );
          const executedAt = new Date();
          const records = matched.map(({ itemId, statusId, parsed }) => {
            const attempt = (nextAttemptByItem.get(itemId) ?? 0) + 1;
            nextAttemptByItem.set(itemId, attempt);
            return {
              organizationId,
              id: randomUUID(),
              testRunItemId: itemId,
              statusId,
              attempt,
              comment: this.junitComment(parsed).value,
              elapsedMs: parsed.durationMs,
              executedById: userId,
              executedAt,
              build: context.value.run.build,
            };
          });
          for (let offset = 0; offset < records.length; offset += 1_000) {
            await transaction.testResult.createMany({
              data: records.slice(offset, offset + 1_000),
            });
          }

          const finalStatusByItem = new Map<string, string>();
          for (const { itemId, statusId } of matched) finalStatusByItem.set(itemId, statusId);
          const statusUpdates = Prisma.join(
            [...finalStatusByItem].map(
              ([itemId, statusId]) => Prisma.sql`(${itemId}::uuid, ${statusId}::uuid)`,
            ),
          );
          await transaction.$executeRaw`
          UPDATE test_run_items AS item
          SET status_id = changes.status_id,
              updated_at = CURRENT_TIMESTAMP
          FROM (VALUES ${statusUpdates}) AS changes(id, status_id)
          WHERE item.organization_id = ${organizationId}::uuid
            AND item.test_run_id = ${runId}::uuid
            AND item.id = changes.id
        `;
        }

        const counts: JUnitUploadResponse['counts'] = {
          passed: 0,
          failed: 0,
          error: 0,
          skipped: 0,
        };
        for (const result of parsedResults) counts[result.status] += 1;
        const response: JUnitUploadResponse = {
          total: parsedResults.length,
          recorded: matched.length,
          truncated: parsedResults.filter(
            (result) => result.truncated || this.junitComment(result).truncated,
          ).length,
          counts,
          unmatched,
        };
        await this.storeIdempotencyResponse(
          transaction,
          organizationId,
          scope,
          idempotencyKey,
          response,
        );
        return { kind: 'found', value: response };
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  async resultHistory(
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
        select: this.resultSelection(),
      });
      const hasNextPage = results.length > query.limit;
      const page = hasNextPage ? results.slice(0, query.limit) : results;
      const attachments = await this.resultAttachments(
        transaction,
        page.map(({ id }) => id),
      );
      return {
        kind: 'found',
        value: {
          item: { id: item.id, title: item.caseVersion.title },
          results: page.map((result) => this.toResult(result, attachments.get(result.id))),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async resultDetail(
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
        select: this.resultSelection(),
      });
      if (!result) return { kind: 'result_not_found' };
      const attachments = await this.resultAttachments(transaction, [result.id]);
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
            status: this.toStatus(item.status),
            assignee: item.assignee,
            attemptCount: item._count.results,
          }),
          result: this.toResult(result, attachments.get(result.id)),
        },
      };
    });
  }

  private async changeLifecycle(
    organizationId: string,
    projectSlug: string,
    runId: string,
    action: 'start' | 'close' | 'archive' | 'restore',
  ): Promise<RunResult<TestRunSummary>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await this.lockRun(transaction, organizationId, projectSlug, runId);
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

      const run = nextStatus
        ? await transaction.testRun.update({
            where: { organizationId_id: { organizationId, id: runId } },
            data: {
              status: nextStatus,
              ...(action === 'close' ? { closedAt: new Date() } : {}),
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
      const counts = await this.countItems(transaction, [run.id]);
      return { kind: 'found', value: this.toSummary(run, counts.get(run.id)) };
    });
  }

  private matchableRunItems(
    transaction: TenantTransaction,
    organizationId: string,
    runId: string,
  ): Promise<MatchableRunItem[]> {
    return transaction.testRunItem.findMany({
      where: { organizationId, testRunId: runId },
      select: {
        id: true,
        caseVersion: {
          select: {
            testCase: { select: { automationId: true, caseNumber: true } },
          },
        },
      },
    });
  }

  private indexRunItems(items: MatchableRunItem[]): RunItemIndex {
    const index: RunItemIndex = {
      byId: new Map(),
      byAutomationId: new Map(),
      byCaseNumber: new Map(),
    };
    for (const item of items) {
      index.byId.set(item.id, item);
      const { automationId, caseNumber } = item.caseVersion.testCase;
      if (automationId) {
        const matches = index.byAutomationId.get(automationId) ?? [];
        matches.push(item);
        index.byAutomationId.set(automationId, matches);
      }
      const normalizedCaseNumber = caseNumber.toString();
      const matches = index.byCaseNumber.get(normalizedCaseNumber) ?? [];
      matches.push(item);
      index.byCaseNumber.set(normalizedCaseNumber, matches);
    }
    return index;
  }

  private matchExternalItem(
    index: RunItemIndex,
    automationId: string | undefined,
    caseNumber: string | undefined,
  ): MatchableRunItem[] {
    let matches = automationId ? (index.byAutomationId.get(automationId) ?? []) : [];
    if (matches.length > 1 && caseNumber) {
      matches = matches.filter(
        (item) => item.caseVersion.testCase.caseNumber.toString() === caseNumber,
      );
    } else if (matches.length === 0 && caseNumber) {
      matches = index.byCaseNumber.get(caseNumber) ?? [];
    }
    return matches;
  }

  private junitComment(result: ParsedJUnitResult): {
    value: string | undefined;
    truncated: boolean;
  } {
    const sections = [
      result.message,
      result.details,
      result.stdout ? `Standard output:\n${result.stdout}` : null,
      result.stderr ? `Standard error:\n${result.stderr}` : null,
    ].filter((section): section is string => Boolean(section));
    if (sections.length === 0) return { value: undefined, truncated: false };
    const comment = sections.join('\n\n');
    return { value: comment.slice(0, 50_000), truncated: comment.length > 50_000 };
  }

  private async lockRun(
    transaction: TenantTransaction,
    organizationId: string,
    projectSlug: string,
    runId: string,
    mode: 'exclusive' | 'shared' = 'exclusive',
  ): Promise<
    RunResult<{
      projectId: string;
      run: RunRecord;
    }>
  > {
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

  private async claimIdempotency<T>(
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

  private async findIdempotency<T>(
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

  private async storeIdempotencyResponse<T>(
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

  private resultSelection() {
    return {
      id: true,
      attempt: true,
      comment: true,
      elapsedMs: true,
      executedAt: true,
      executedBy: { select: { id: true, displayName: true } },
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
      stepResults: {
        orderBy: { position: 'asc' as const },
        select: {
          id: true,
          position: true,
          comment: true,
          elapsedMs: true,
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
        },
      },
    } as const;
  }

  private async resultAttachments(
    transaction: TenantTransaction,
    resultIds: string[],
  ): Promise<Map<string, AttachmentRecord[]>> {
    const byResult = new Map<string, AttachmentRecord[]>();
    if (resultIds.length === 0) return byResult;
    const attachments = await transaction.attachment.findMany({
      where: {
        targetType: AttachmentTargetType.RESULT,
        targetId: { in: resultIds },
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        targetId: true,
        fileName: true,
        contentType: true,
        sizeBytes: true,
        checksumSha256: true,
        stepPosition: true,
      },
    });
    for (const { targetId, sizeBytes, ...attachment } of attachments) {
      const current = byResult.get(targetId) ?? [];
      current.push({ ...attachment, sizeBytes: Number(sizeBytes) });
      byResult.set(targetId, current);
    }
    return byResult;
  }

  private toResult(result: ResultRecord, attachments: AttachmentRecord[] = []) {
    return testResultResponseSchema.parse({
      ...result,
      status: this.toStatus(result.status),
      executedAt: result.executedAt.toISOString(),
      stepResults: result.stepResults.map(({ status, ...step }) => ({
        ...step,
        status: this.toStatus(status),
      })),
      attachments,
    });
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

  private toStatus(status: ResultStatusResponse): ResultStatusResponse {
    return status;
  }
}

export type { RunResult };
