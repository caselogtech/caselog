import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  BulkTestResultsRequest,
  BulkTestResultsResponse,
  CreateTestResultRequest,
  CreateTestResultResponse,
} from '@caselog/schemas';
import type { PreparedResultAttachment } from '../../../attachments/public-api';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { bumpProjectionRevision } from '../../../core/database/infrastructure/persistence/projection-revision';
import { RUN_PROGRESS_PROJECTION } from '../../../reporting/public-api';
import { Prisma } from '../../../generated/prisma/client';
import { AttachmentTargetType, RunStatus } from '../../../generated/prisma/enums';
import {
  indexRunItems,
  matchableRunItems,
  matchExternalRunItem,
  resultAttachments,
} from '../persistence/test-result.persistence';
import {
  claimIdempotency,
  findIdempotency,
  lockRun,
  storeIdempotencyResponse,
} from '../persistence/test-run.persistence';
import type { RunResult } from './test-run.repository.types';

@Injectable()
export class TestResultRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async record(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateTestResultRequest,
    preparedAttachments: PreparedResultAttachment[],
  ): Promise<RunResult<CreateTestResultResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await lockRun(transaction, organizationId, projectSlug, runId, 'shared');
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
      await bumpProjectionRevision(transaction, organizationId, RUN_PROGRESS_PROJECTION, runId);
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
        const checkedAt = new Date();
        const blobsByChecksum = new Map(
          preparedAttachments.map((attachment) => [attachment.checksumSha256, attachment]),
        );
        for (const attachment of blobsByChecksum.values()) {
          await transaction.attachmentBlob.upsert({
            where: {
              organizationId_checksumSha256: {
                organizationId,
                checksumSha256: attachment.checksumSha256,
              },
            },
            create: {
              organizationId,
              checksumSha256: attachment.checksumSha256,
              storageKey: attachment.storageKey,
              sizeBytes: BigInt(attachment.sizeBytes),
              storageStatus: 'HEALTHY',
              storageCheckedAt: checkedAt,
              storageObservedSizeBytes: BigInt(attachment.sizeBytes),
            },
            update: {
              storageKey: attachment.storageKey,
              sizeBytes: BigInt(attachment.sizeBytes),
              storageStatus: 'HEALTHY',
              storageCheckedAt: checkedAt,
              storageObservedSizeBytes: BigInt(attachment.sizeBytes),
            },
          });
        }
        await transaction.attachment.createMany({
          data: preparedAttachments.map((attachment) => ({
            organizationId,
            id: attachment.id,
            targetType: AttachmentTargetType.RESULT,
            targetId: result.id,
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
      const attachments = await resultAttachments(transaction, [result.id]);
      return {
        kind: 'found',
        value: {
          result: {
            ...result,
            status,
            executedAt: result.executedAt.toISOString(),
            stepResults: stepResults.map(({ status: stepStatus, ...step }) => ({
              ...step,
              status: stepStatus,
            })),
            attachments: attachments.get(result.id) ?? [],
          },
        },
      };
    });
  }

  async bulkRecord(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    idempotencyKey: string,
    requestHash: string,
    request: BulkTestResultsRequest,
  ): Promise<RunResult<BulkTestResultsResponse>> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await lockRun(transaction, organizationId, projectSlug, runId, 'shared');
      if (context.kind !== 'found') return context;

      const scope = `test-run:${runId}:results:bulk`;
      const existing = await findIdempotency<BulkTestResultsResponse>(
        transaction,
        organizationId,
        scope,
        idempotencyKey,
        requestHash,
      );
      if (existing?.kind === 'conflict') return { kind: 'idempotency_conflict' };
      if (existing?.kind === 'replay') return { kind: 'found', value: existing.value };
      if (context.value.run.status !== RunStatus.ACTIVE) return { kind: 'run_closed' };

      const runItems = await matchableRunItems(transaction, organizationId, runId);
      const itemIndex = indexRunItems(runItems);
      const matchedResults: Array<(typeof request.results)[number] & { itemId: string }> = [];
      const unmatched: BulkTestResultsResponse['unmatched'] = [];
      for (const [index, requestResult] of request.results.entries()) {
        if (requestResult.itemId) {
          if (!itemIndex.byId.has(requestResult.itemId)) return { kind: 'item_not_found' };
          matchedResults.push({ ...requestResult, itemId: requestResult.itemId });
          continue;
        }
        const matches = matchExternalRunItem(
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

      const claim = await claimIdempotency<BulkTestResultsResponse>(
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
        await storeIdempotencyResponse(
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
      await bumpProjectionRevision(transaction, organizationId, RUN_PROGRESS_PROJECTION, runId);

      const responseResults = results.map(({ itemId, resultId, attempt, statusId }) => {
        const status = statusById.get(statusId);
        if (!status) throw new Error('Validated result status is unavailable');
        return {
          itemId,
          resultId,
          attempt,
          status,
          executedAt: executedAt.toISOString(),
        };
      });
      const response: BulkTestResultsResponse = { results: responseResults, unmatched };
      await storeIdempotencyResponse(transaction, organizationId, scope, idempotencyKey, response);
      return { kind: 'found', value: response };
    });
  }
}
