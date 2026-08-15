import { describe, expect, it, vi } from 'vitest';
import type { WorkspacePurgeConfig } from '../../infrastructure/config/workspace-purge.config';
import { WorkspacePurgeQueue } from '../../application/services/workspace-purge.queue';
import { WorkspacePurgeWorker } from '../../presentation/workers/workspace-purge.worker';

const ORGANIZATION_ID = '6a440875-948d-4935-bec0-762649f6f39d';

describe('workspace purge jobs', () => {
  it('schedules the coordinator and enqueues singleton workspace work', async () => {
    const jobs = {
      scheduleRecurring: vi.fn().mockResolvedValue(undefined),
      enqueueLatest: vi.fn().mockResolvedValue(undefined),
    };
    const queue = new WorkspacePurgeQueue(jobs as never, config());

    await queue.ensureScheduled();
    await queue.enqueueOrganization(ORGANIZATION_ID);

    expect(jobs.scheduleRecurring).toHaveBeenCalledWith(
      'expired-workspace-purge',
      'all-workspaces',
      '30 2 * * *',
      { kind: 'all' },
    );
    expect(jobs.enqueueLatest).toHaveBeenCalledWith('expired-workspace-purge', ORGANIZATION_ID, {
      kind: 'organization',
      organizationId: ORGANIZATION_ID,
    });
  });

  it('fans out coordinator work and re-enqueues bounded cleanup', async () => {
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
      listCandidates: vi
        .fn()
        .mockResolvedValueOnce({ ids: [ORGANIZATION_ID], nextCursor: 'next' })
        .mockResolvedValueOnce({ ids: [], nextCursor: null }),
    };
    const purge = {
      purgeOrganization: vi.fn().mockResolvedValue({ kind: 'in_progress', objectsDeleted: 5 }),
    };
    const worker = new WorkspacePurgeWorker(
      jobs as never,
      queue as never,
      repository as never,
      purge as never,
    );

    await worker.onModuleInit();
    if (!handler) throw new Error('Worker handler was not registered');
    await handler({ kind: 'all' });
    expect(repository.listCandidates).toHaveBeenCalledTimes(2);
    expect(queue.enqueueOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);

    queue.enqueueOrganization.mockClear();
    await handler({ kind: 'organization', organizationId: ORGANIZATION_ID });
    expect(purge.purgeOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(queue.enqueueOrganization).toHaveBeenCalledWith(ORGANIZATION_ID);
    await expect(handler({ kind: 'organization', organizationId: 'invalid' })).rejects.toThrow();
  });
});

function config(): WorkspacePurgeConfig {
  return { cron: '30 2 * * *', objectBatchSize: 200, maxBatchesPerJob: 5 };
}
