import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import type { WorkspacePurgeJob } from '../../domain/models/workspace-purge-job';
import {
  WORKSPACE_PURGE_CONFIG,
  type WorkspacePurgeConfig,
} from '../../infrastructure/config/workspace-purge.config';

export const WORKSPACE_PURGE_QUEUE = {
  name: 'expired-workspace-purge',
  policy: 'singleton',
  retryLimit: 8,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 900,
  deleteAfterSeconds: 86_400,
  deadLetter: 'expired-workspace-purge-failed',
} as const;

@Injectable()
export class WorkspacePurgeQueue {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(WORKSPACE_PURGE_CONFIG) private readonly config: WorkspacePurgeConfig,
  ) {}

  ensureScheduled(): Promise<void> {
    return this.jobs.scheduleRecurring(
      WORKSPACE_PURGE_QUEUE.name,
      'all-workspaces',
      this.config.cron,
      { kind: 'all' } satisfies WorkspacePurgeJob,
    );
  }

  enqueueOrganization(organizationId: string): Promise<void> {
    return this.jobs.enqueueLatest(WORKSPACE_PURGE_QUEUE.name, organizationId, {
      kind: 'organization',
      organizationId,
    } satisfies WorkspacePurgeJob);
  }
}
