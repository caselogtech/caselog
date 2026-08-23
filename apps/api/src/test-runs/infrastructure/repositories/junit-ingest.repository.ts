import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { JUnitUploadResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { bumpProjectionRevision } from '../../../core/database/infrastructure/persistence/projection-revision';
import { RUN_PROGRESS_PROJECTION } from '../../../reporting/public-api';
import { Prisma } from '../../../generated/prisma/client';
import {
  ResultIngestionFormat,
  ResultIngestionStatus,
  RunStatus,
} from '../../../generated/prisma/enums';
import type { ParsedJUnitResult } from '../../domain/parsers/junit-parser';
import type { ResultIngestionMetadata } from '../../domain/models/result-ingestion';
import {
  indexRunItems,
  matchableRunItems,
  matchExternalRunItem,
} from '../persistence/test-result.persistence';
import {
  claimIdempotency,
  findIdempotency,
  lockRun,
  storeIdempotencyResponse,
} from '../persistence/test-run.persistence';
import type { RunResult } from './test-run.repository.types';

@Injectable()
export class JUnitIngestRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async ingest(
    organizationId: string,
    userId: string,
    projectSlug: string,
    runId: string,
    idempotencyKey: string,
    requestHash: string,
    parsedResults: ParsedJUnitResult[],
    metadata: ResultIngestionMetadata,
  ): Promise<RunResult<JUnitUploadResponse>> {
    return this.tenantDatabase.run(
      organizationId,
      async (transaction) => {
        const context = await lockRun(transaction, organizationId, projectSlug, runId, 'shared');
        if (context.kind !== 'found') return context;

        const scope = `test-run:${runId}:results:junit`;
        const existing = await findIdempotency<JUnitUploadResponse>(
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

        const runItems = await matchableRunItems(transaction, organizationId, runId);
        const itemIndex = indexRunItems(runItems);
        const matched: Array<{
          itemId: string;
          statusId: string;
          parsed: ParsedJUnitResult;
        }> = [];
        const unmatched: JUnitUploadResponse['unmatched'] = [];
        for (const parsed of parsedResults) {
          const matches = matchExternalRunItem(
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

        const claim = await claimIdempotency<JUnitUploadResponse>(
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
              comment: junitComment(parsed).value,
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
          await bumpProjectionRevision(transaction, organizationId, RUN_PROGRESS_PROJECTION, runId);
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
            (result) => result.truncated || junitComment(result).truncated,
          ).length,
          counts,
          unmatched,
        };
        await transaction.testResultIngestion.create({
          data: {
            organizationId,
            projectId: context.value.projectId,
            testRunId: runId,
            initiatedById: userId,
            format: ResultIngestionFormat.JUNIT,
            status: ResultIngestionStatus.COMPLETED,
            ...metadata,
            total: response.total,
            recorded: response.recorded,
            unmatched: response.unmatched.length,
            truncated: response.truncated,
            passed: response.counts.passed,
            failed: response.counts.failed,
            errors: response.counts.error,
            skipped: response.counts.skipped,
          },
        });
        await storeIdempotencyResponse(
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
}

function junitComment(result: ParsedJUnitResult): {
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
