import { Inject, Injectable } from '@nestjs/common';
import type { CreateJiraDefectResponse } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { Prisma } from '../../../generated/prisma/client';
import {
  loadDefectContext,
  type DefectContext,
  type DefectContextResult,
} from '../persistence/defect-context.persistence';
import { issueLinkSelection, toIssueLink } from '../persistence/issue-link.persistence';
import type { LinkIssueSnapshot } from '../../domain/models/issue-link';

export type BeginDefectCreationResult =
  | { kind: 'started'; requestId: string; context: DefectContext }
  | { kind: 'replayed'; value: CreateJiraDefectResponse }
  | { kind: 'idempotency_conflict' }
  | { kind: 'in_progress' }
  | { kind: 'reconciliation_required' }
  | { kind: 'connection_not_found' }
  | Exclude<DefectContextResult, { kind: 'found' }>;

@Injectable()
export class DefectCreationRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async begin(
    organizationId: string,
    createdById: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    connectionId: string,
    idempotencyKey: string,
    requestHash: string,
    attachmentIds: string[],
  ): Promise<BeginDefectCreationResult> {
    try {
      return await this.beginTransaction(
        organizationId,
        createdById,
        projectSlug,
        runId,
        itemId,
        resultId,
        connectionId,
        idempotencyKey,
        requestHash,
        attachmentIds,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.beginTransaction(
          organizationId,
          createdById,
          projectSlug,
          runId,
          itemId,
          resultId,
          connectionId,
          idempotencyKey,
          requestHash,
          attachmentIds,
        );
      }
      throw error;
    }
  }

  async complete(
    organizationId: string,
    requestId: string,
    issue: LinkIssueSnapshot,
    attachmentWarnings: string[],
  ): Promise<CreateJiraDefectResponse> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const request = await transaction.issueCreationRequest.findUniqueOrThrow({
        where: { organizationId_id: { organizationId, id: requestId } },
        select: {
          projectId: true,
          connectionId: true,
          testResultId: true,
          testResultExecutedAt: true,
          createdById: true,
        },
      });
      const existing = await transaction.issueLink.findFirst({
        where: {
          organizationId,
          connectionId: request.connectionId,
          testResultId: request.testResultId,
          testResultExecutedAt: request.testResultExecutedAt,
          externalIssueId: issue.id,
          deletedAt: null,
        },
        select: issueLinkSelection,
      });
      const link = existing
        ? toIssueLink(existing)
        : toIssueLink(
            await transaction.issueLink.create({
              data: {
                organizationId,
                projectId: request.projectId,
                connectionId: request.connectionId,
                linkType: 'defect',
                testResultId: request.testResultId,
                testResultExecutedAt: request.testResultExecutedAt,
                createdById: request.createdById,
                externalIssueId: issue.id,
                externalIssueKey: issue.key,
                title: issue.title,
                url: issue.url,
                issueType: issue.issueType,
                statusId: issue.status?.id,
                statusName: issue.status?.name,
                lastSyncedAt: issue.status ? new Date() : null,
              },
              select: issueLinkSelection,
            }),
          );
      const response: CreateJiraDefectResponse = { link, attachmentWarnings };
      await transaction.issueCreationRequest.update({
        where: { organizationId_id: { organizationId, id: requestId } },
        data: {
          state: 'completed',
          response: JSON.parse(JSON.stringify(response)),
          lastError: null,
        },
      });
      return response;
    });
  }

  async markFailed(
    organizationId: string,
    requestId: string,
    state: 'failed' | 'reconciliation_required',
    message: string,
  ): Promise<void> {
    await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.issueCreationRequest.updateMany({
        where: { organizationId, id: requestId, state: 'pending' },
        data: { state, lastError: message.slice(0, 2_000) },
      }),
    );
  }

  private beginTransaction(
    organizationId: string,
    createdById: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
    connectionId: string,
    idempotencyKey: string,
    requestHash: string,
    attachmentIds: string[],
  ): Promise<BeginDefectCreationResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const context = await loadDefectContext(
        transaction,
        organizationId,
        projectSlug,
        runId,
        itemId,
        resultId,
        attachmentIds,
      );
      if (context.kind !== 'found') return context;
      const connection = await transaction.integrationConnection.count({
        where: {
          organizationId,
          id: connectionId,
          provider: 'jira',
          status: { not: 'disabled' },
          deletedAt: null,
        },
      });
      if (connection !== 1) return { kind: 'connection_not_found' };

      const existing = await transaction.issueCreationRequest.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
        select: { id: true, requestHash: true, state: true, response: true },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) return { kind: 'idempotency_conflict' };
        if (existing.state === 'completed') {
          return { kind: 'replayed', value: existing.response as CreateJiraDefectResponse };
        }
        if (existing.state === 'pending') return { kind: 'in_progress' };
        if (existing.state === 'reconciliation_required') {
          return { kind: 'reconciliation_required' };
        }
        await transaction.issueCreationRequest.update({
          where: { organizationId_id: { organizationId, id: existing.id } },
          data: { state: 'pending', lastError: null },
        });
        return { kind: 'started', requestId: existing.id, context: context.value };
      }

      const request = await transaction.issueCreationRequest.create({
        data: {
          organizationId,
          projectId: context.value.projectId,
          connectionId,
          testResultId: context.value.result.id,
          testResultExecutedAt: context.value.result.executedAt,
          idempotencyKey,
          requestHash,
          createdById,
        },
        select: { id: true },
      });
      return { kind: 'started', requestId: request.id, context: context.value };
    });
  }
}
