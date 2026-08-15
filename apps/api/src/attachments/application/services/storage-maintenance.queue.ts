import { Inject, Injectable } from '@nestjs/common';
import { JobQueue } from '../../../core/jobs/application/ports/job-queue';
import type { StorageMaintenanceJob } from '../../domain/models/storage-maintenance-job';
import {
  STORAGE_CONFIG,
  type StorageConfig,
} from '../../../core/storage/infrastructure/config/storage.config';

export const STORAGE_MAINTENANCE_QUEUE = {
  name: 'attachments-storage-maintenance',
  policy: 'singleton',
  retryLimit: 5,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 900,
  deleteAfterSeconds: 86_400,
  deadLetter: 'attachments-storage-maintenance-failed',
} as const;

@Injectable()
export class StorageMaintenanceQueue {
  constructor(
    @Inject(JobQueue) private readonly jobs: JobQueue,
    @Inject(STORAGE_CONFIG) private readonly config: StorageConfig,
  ) {}

  ensureScheduled(): Promise<void> {
    return this.jobs.scheduleRecurring(
      STORAGE_MAINTENANCE_QUEUE.name,
      'all-organizations',
      this.config.maintenanceCron,
      { kind: 'all' } satisfies StorageMaintenanceJob,
    );
  }

  enqueueOrganization(organizationId: string): Promise<void> {
    return this.jobs.enqueueLatest(STORAGE_MAINTENANCE_QUEUE.name, organizationId, {
      kind: 'organization',
      organizationId,
    } satisfies StorageMaintenanceJob);
  }
}
