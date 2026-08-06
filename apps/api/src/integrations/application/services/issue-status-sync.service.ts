import { Inject, Injectable } from '@nestjs/common';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';
import { IntegrationConnectionRepository } from '../../infrastructure/repositories/integration-connection.repository';
import { IssueStatusSyncRepository } from '../../infrastructure/repositories/issue-status-sync.repository';
import { IssueTrackerClientService } from './issue-tracker-client.service';

const PAGE_SIZE = 100;

@Injectable()
export class IssueStatusSyncService {
  constructor(
    @Inject(IssueStatusSyncRepository)
    private readonly links: IssueStatusSyncRepository,
    @Inject(IntegrationConnectionRepository)
    private readonly connections: IntegrationConnectionRepository,
    @Inject(IssueTrackerClientService)
    private readonly issueTracker: IssueTrackerClientService,
  ) {}

  async syncConnection(organizationId: string, connectionId: string): Promise<void> {
    let cursor: string | null = null;
    let foundTargets = false;
    const synchronizedIssues = new Set<string>();

    do {
      const targets = await this.links.listTargets(organizationId, connectionId, cursor, PAGE_SIZE);
      if (targets.length === 0) break;
      foundTargets = true;

      for (const target of targets) {
        cursor = target.id;
        if (synchronizedIssues.has(target.externalIssueId)) continue;
        synchronizedIssues.add(target.externalIssueId);
        await this.syncIssue(organizationId, connectionId, target);
      }
      if (targets.length < PAGE_SIZE) break;
    } while (cursor);

    if (foundTargets) await this.connections.markSynced(organizationId, connectionId);
  }

  private async syncIssue(
    organizationId: string,
    connectionId: string,
    target: { externalIssueId: string; externalIssueKey: string },
  ): Promise<void> {
    try {
      const issue = await this.issueTracker.getIssue(
        organizationId,
        connectionId,
        target.externalIssueKey,
      );
      await this.links.recordSuccess(organizationId, connectionId, target.externalIssueId, issue);
    } catch (error) {
      const message =
        error instanceof IssueTrackerRequestError
          ? error.message
          : 'The issue tracker returned an invalid response';
      await this.links.recordFailure(organizationId, connectionId, target.externalIssueId, message);
      if (!(error instanceof IssueTrackerRequestError) || error.kind !== 'rejected') throw error;
    }
  }
}
