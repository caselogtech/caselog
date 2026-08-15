import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import { storageMaintenanceJobSchema } from '../../domain/models/storage-maintenance-job';
import { StorageMaintenanceRepository } from '../../infrastructure/repositories/storage-maintenance.repository';
import { StorageMaintenanceService } from '../../application/services/storage-maintenance.service';
import {
  STORAGE_MAINTENANCE_QUEUE,
  StorageMaintenanceQueue,
} from '../../application/services/storage-maintenance.queue';

const ORGANIZATION_PAGE_SIZE = 200;

@Injectable()
export class StorageMaintenanceWorker implements OnModuleInit {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(StorageMaintenanceQueue) private readonly queue: StorageMaintenanceQueue,
    @Inject(StorageMaintenanceRepository)
    private readonly repository: StorageMaintenanceRepository,
    @Inject(StorageMaintenanceService)
    private readonly maintenance: StorageMaintenanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.registerWorker(STORAGE_MAINTENANCE_QUEUE, async (payload) => {
      const job = storageMaintenanceJobSchema.parse(payload);
      if (job.kind === 'organization') {
        await this.maintenance.maintainOrganization(job.organizationId);
        return;
      }
      await this.enqueueOrganizations();
    });
    await this.queue.ensureScheduled();
  }

  private async enqueueOrganizations(): Promise<void> {
    let cursor: string | null = null;
    do {
      const page = await this.repository.listOrganizationIds(cursor, ORGANIZATION_PAGE_SIZE);
      for (const organizationId of page.ids) {
        await this.queue.enqueueOrganization(organizationId);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
}
