import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import { ISSUE_STATUS_SYNC_QUEUE } from '../../application/services/issue-status-sync.queue';
import { IssueStatusSyncService } from '../../application/services/issue-status-sync.service';
import { issueStatusSyncJobSchema } from '../../domain/models/issue-status-sync-job';

@Injectable()
export class IssueStatusSyncWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(IssueStatusSyncService) private readonly sync: IssueStatusSyncService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(ISSUE_STATUS_SYNC_QUEUE, async (payload) => {
      const job = issueStatusSyncJobSchema.parse(payload);
      await this.sync.syncConnection(job.organizationId, job.connectionId);
    });
  }
}
