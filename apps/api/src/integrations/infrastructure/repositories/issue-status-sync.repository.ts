import { Inject, Injectable } from '@nestjs/common';
import type { JiraIssue } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

export type IssueSyncTarget = {
  id: string;
  externalIssueId: string;
  externalIssueKey: string;
};

@Injectable()
export class IssueStatusSyncRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  listTargets(
    organizationId: string,
    connectionId: string,
    cursor: string | null,
    limit: number,
  ): Promise<IssueSyncTarget[]> {
    return this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.issueLink.findMany({
        where: {
          organizationId,
          connectionId,
          deletedAt: null,
          ...(cursor ? { id: { gt: cursor } } : {}),
          connection: { deletedAt: null, status: { not: 'disabled' } },
        },
        orderBy: { id: 'asc' },
        take: limit,
        select: { id: true, externalIssueId: true, externalIssueKey: true },
      }),
    );
  }

  async recordSuccess(
    organizationId: string,
    connectionId: string,
    externalIssueId: string,
    issue: JiraIssue,
  ): Promise<void> {
    const now = new Date();
    await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.issueLink.updateMany({
        where: { organizationId, connectionId, externalIssueId, deletedAt: null },
        data: {
          externalIssueKey: issue.key,
          title: issue.summary,
          url: issue.url,
          issueType: issue.issueType.name,
          statusId: issue.status.id,
          statusName: issue.status.name,
          lastSyncedAt: now,
          lastSyncAttemptAt: now,
          syncError: null,
        },
      }),
    );
  }

  async recordFailure(
    organizationId: string,
    connectionId: string,
    externalIssueId: string,
    message: string,
  ): Promise<void> {
    await this.tenantDatabase.run(organizationId, (transaction) =>
      transaction.issueLink.updateMany({
        where: { organizationId, connectionId, externalIssueId, deletedAt: null },
        data: { lastSyncAttemptAt: new Date(), syncError: message.slice(0, 2_000) },
      }),
    );
  }
}
