import { describe, expect, it, vi } from 'vitest';
import type { StorageConfig } from '../../../core/storage/infrastructure/config/storage.config';
import { StorageMaintenanceQueue } from '../../application/services/storage-maintenance.queue';
import { StorageMaintenanceWorker } from '../../presentation/workers/storage-maintenance.worker';

const ORGANIZATION_ID = '6a440875-948d-4935-bec0-762649f6f39d';

describe('storage maintenance jobs', () => {
  it('schedules the coordinator and enqueues singleton organization work', async () => {
    const jobs = {
      scheduleRecurring: vi.fn().mockResolvedValue(undefined),
      enqueueLatest: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new StorageMaintenanceQueue(jobs as never, config());

    await queue.ensureScheduled();
    await queue.enqueueOrganization(ORGANIZATION_ID);

    expect(jobs.scheduleRecurring).toHaveBeenCalledWith(
      'attachments-storage-maintenance',
      'all-organizations',
      '15 * * * *',
      { kind: 'all' },
    );
    expect(jobs.enqueueLatest).toHaveBeenCalledWith(
      'attachments-storage-maintenance',
      ORGANIZATION_ID,
      { kind: 'organization', organizationId: ORGANIZATION_ID },
    );
  });

  it('fans out coordinator work and validates organization payloads', async () => {
    let handler: ((payload: object) => Promise<void>) | undefined;
    const jobs = {
      registerWorker: vi.fn().mockImplementation(async (_definition, registered) => {
        handler = registered;
      }),
    };
    const queue = {
      ensureScheduled: vi.fn().mockResolvedValue(undefined),
      enqueueOrganization: vi.fn().mockResolvedValue(undefined),
    };
    const repository = {
      listOrganizationIds: vi.fn().mockResolvedValue({ ids: [ORGANIZATION_ID], nextCursor: null }),
    };
    const maintenance = { maintainOrganization: vi.fn().mockResolvedValue(undefined) };
    const worker = new StorageMaintenanceWorker(
      jobs as never,
      queue as never,
      repository as never,
      maintenance as never,
    );

    await worker.onModuleInit();
    expect(queue.ensureScheduled).toHaveBeenCalledOnce();
    if (!handler) throw new Error('Worker handler was not registered');

    await handler({ kind: 'all' });
    expect(queue.enqueueOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);
    await handler({ kind: 'organization', organizationId: ORGANIZATION_ID });
    expect(maintenance.maintainOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);
    await expect(handler({ kind: 'organization', organizationId: 'invalid' })).rejects.toThrow();
  });
});

function config(): StorageConfig {
  return {
    endpoint: 'http://storage.test',
    region: 'eu-central-1',
    bucket: 'caselog-test',
    accessKey: 'test',
    secretKey: 'test',
    forcePathStyle: true,
    autoCreateBucket: false,
    uploadUrlTtlSeconds: 900,
    downloadUrlTtlSeconds: 300,
    maintenanceCron: '15 * * * *',
    maintenanceBatchSize: 200,
    orphanGraceHours: 24,
    recheckHours: 24,
  };
}
