import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import type { IssueStatusSyncJob } from '../../domain/models/issue-status-sync-job';
import {
  ISSUE_TRACKER_CONFIG,
  type IssueTrackerConfig,
} from '../../infrastructure/config/issue-tracker.config';

export const ISSUE_STATUS_SYNC_QUEUE = {
  name: 'integrations-issue-status-sync',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 86_400,
  deadLetter: 'integrations-issue-status-sync-failed',
} as const;

@Injectable()
export class IssueStatusSyncQueue {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(ISSUE_TRACKER_CONFIG) private readonly config: IssueTrackerConfig,
  ) {}

  ensureScheduled(payload: IssueStatusSyncJob): Promise<void> {
    return this.jobs.scheduleRecurring(
      ISSUE_STATUS_SYNC_QUEUE.name,
      this.key(payload),
      this.config.syncCron,
      payload,
    );
  }

  unschedule(payload: IssueStatusSyncJob): Promise<void> {
    return this.jobs.unscheduleRecurring(ISSUE_STATUS_SYNC_QUEUE.name, this.key(payload));
  }

  enqueue(payload: IssueStatusSyncJob): Promise<void> {
    return this.jobs.enqueueLatest(ISSUE_STATUS_SYNC_QUEUE.name, this.key(payload), payload);
  }

  private key(payload: IssueStatusSyncJob): string {
    return `${payload.organizationId}:${payload.connectionId}`;
  }
}
