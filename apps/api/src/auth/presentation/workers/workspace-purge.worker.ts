import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import { workspacePurgeJobSchema } from '../../domain/models/workspace-purge-job';
import { workspacePurgeCutoff } from '../../domain/policies/workspace-retention';
import { WorkspacePurgeRepository } from '../../infrastructure/repositories/workspace-purge.repository';
import { WorkspacePurgeService } from '../../application/services/workspace-purge.service';
import {
  WORKSPACE_PURGE_QUEUE,
  WorkspacePurgeQueue,
} from '../../application/services/workspace-purge.queue';

const WORKSPACE_PAGE_SIZE = 200;

@Injectable()
export class WorkspacePurgeWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(WorkspacePurgeQueue) private readonly queue: WorkspacePurgeQueue,
    @Inject(WorkspacePurgeRepository) private readonly repository: WorkspacePurgeRepository,
    @Inject(WorkspacePurgeService) private readonly purge: WorkspacePurgeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(WORKSPACE_PURGE_QUEUE, async (payload) => {
      const job = workspacePurgeJobSchema.parse(payload);
      if (job.kind === 'all') {
        await this.enqueueExpiredWorkspaces();
        return;
      }
      const result = await this.purge.purgeOrganization(job.organizationId);
      if (result.kind === 'in_progress') {
        await this.queue.enqueueOrganization(job.organizationId);
      }
    });
    await this.queue.ensureScheduled();
  }

  private async enqueueExpiredWorkspaces(): Promise<void> {
    const deletedBefore = workspacePurgeCutoff(new Date());
    let cursor: string | null = null;
    do {
      const page = await this.repository.listCandidates(deletedBefore, cursor, WORKSPACE_PAGE_SIZE);
      for (const organizationId of page.ids) {
        await this.queue.enqueueOrganization(organizationId);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
}
