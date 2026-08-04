import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import { RUN_PROGRESS_REFRESH_QUEUE } from '../../application/services/run-progress-refresh.queue';
import { RunProgressProjectionService } from '../../application/services/run-progress-projection.service';
import { runProgressRefreshJobSchema } from '../../domain/models/run-progress-refresh-job';

@Injectable()
export class RunProgressRefreshWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(RunProgressProjectionService)
    private readonly projections: RunProgressProjectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(RUN_PROGRESS_REFRESH_QUEUE, async (payload) => {
      const job = runProgressRefreshJobSchema.parse(payload);
      await this.projections.refresh(job.organizationId, job.projectSlug, job.runId);
    });
  }
}
