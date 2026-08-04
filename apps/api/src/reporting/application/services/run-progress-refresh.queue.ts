import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import type { RunProgressRefreshJob } from '../../domain/models/run-progress-refresh-job';

export const RUN_PROGRESS_REFRESH_QUEUE = {
  name: 'reporting-run-progress-refresh',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 2,
  retryBackoff: true,
  expireInSeconds: 300,
  deleteAfterSeconds: 86_400,
  deadLetter: 'reporting-run-progress-refresh-failed',
} as const;

@Injectable()
export class RunProgressRefreshQueue {
  constructor(@Inject(JobQueue) private readonly jobs: JobQueue) {}

  enqueue(payload: RunProgressRefreshJob): Promise<void> {
    return this.jobs.enqueueLatest(
      RUN_PROGRESS_REFRESH_QUEUE.name,
      `${payload.organizationId}:${payload.runId}`,
      payload,
    );
  }
}
