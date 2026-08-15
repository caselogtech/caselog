import { Inject, Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/application/services/metrics.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import {
  WORKSPACE_PURGE_CONFIG,
  type WorkspacePurgeConfig,
} from '../../infrastructure/config/workspace-purge.config';
import { WorkspacePurgeRepository } from '../../infrastructure/repositories/workspace-purge.repository';

export type WorkspacePurgeResult =
  | { kind: 'skipped'; objectsDeleted: number }
  | { kind: 'in_progress'; objectsDeleted: number }
  | { kind: 'purged'; objectsDeleted: number };

@Injectable()
export class WorkspacePurgeService {
  private readonly logger = new Logger(WorkspacePurgeService.name);

  constructor(
    @Inject(WorkspacePurgeRepository)
    private readonly repository: WorkspacePurgeRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(WORKSPACE_PURGE_CONFIG) private readonly config: WorkspacePurgeConfig,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  async purgeOrganization(organizationId: string): Promise<WorkspacePurgeResult> {
    if (!(await this.repository.claim(organizationId))) {
      return { kind: 'skipped', objectsDeleted: 0 };
    }

    let objectsDeleted = 0;
    for (let batch = 0; batch < this.config.maxBatchesPerJob; batch += 1) {
      const page = await this.storage.list(`${organizationId}/`, null, this.config.objectBatchSize);
      if (page.objects.length === 0) {
        const purged = await this.repository.purge(organizationId);
        if (!purged) return { kind: 'skipped', objectsDeleted };
        this.metrics.observeWorkspacePurge('workspace_purged');
        this.logger.log({ event: 'workspace.purge.completed', organizationId, objectsDeleted });
        return { kind: 'purged', objectsDeleted };
      }

      await Promise.all(page.objects.map(({ storageKey }) => this.storage.delete(storageKey)));
      objectsDeleted += page.objects.length;
      this.metrics.observeWorkspacePurge('object_deleted', page.objects.length);
    }

    this.logger.log({ event: 'workspace.purge.in_progress', organizationId, objectsDeleted });
    return { kind: 'in_progress', objectsDeleted };
  }
}
