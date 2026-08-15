import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/application/services/metrics.service';
import type { WorkspacePurgeConfig } from '../../infrastructure/config/workspace-purge.config';
import { WorkspacePurgeService } from '../../application/services/workspace-purge.service';

const ORGANIZATION_ID = 'ef877c99-f801-422f-a9ff-cfb1405d16d1';
const NOW = new Date('2026-08-15T08:00:00.000Z');

describe('WorkspacePurgeService', () => {
  it('claims an expired workspace, deletes all object pages, then purges metadata', async () => {
    const repository = repositoryMock();
    const storage = storageMock();
    storage.list
      .mockResolvedValueOnce({
        objects: [object(`${ORGANIZATION_ID}/uploads/one`), object(`${ORGANIZATION_ID}/blobs/two`)],
        nextAfter: `${ORGANIZATION_ID}/blobs/two`,
      })
      .mockResolvedValueOnce({ objects: [], nextAfter: null });
    const metrics = new MetricsService();
    const service = new WorkspacePurgeService(
      repository as never,
      storage as never,
      config(),
      metrics,
    );

    await expect(service.purgeOrganization(ORGANIZATION_ID)).resolves.toEqual({
      kind: 'purged',
      objectsDeleted: 2,
    });

    expect(repository.claim).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(storage.list).toHaveBeenNthCalledWith(1, `${ORGANIZATION_ID}/`, null, 2);
    expect(storage.list).toHaveBeenNthCalledWith(2, `${ORGANIZATION_ID}/`, null, 2);
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual([
      `${ORGANIZATION_ID}/uploads/one`,
      `${ORGANIZATION_ID}/blobs/two`,
    ]);
    expect(repository.purge).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(metrics.render()).toContain(
      'caselog_workspace_purge_actions_total{action="object_deleted"} 2',
    );
    expect(metrics.render()).toContain(
      'caselog_workspace_purge_actions_total{action="workspace_purged"} 1',
    );
  });

  it('bounds each attempt and lets the worker enqueue continuation work', async () => {
    const repository = repositoryMock();
    const storage = storageMock();
    storage.list.mockResolvedValue({
      objects: [object(`${ORGANIZATION_ID}/uploads/remaining`)],
      nextAfter: `${ORGANIZATION_ID}/uploads/remaining`,
    });
    const service = new WorkspacePurgeService(
      repository as never,
      storage as never,
      config(),
      new MetricsService(),
    );

    await expect(service.purgeOrganization(ORGANIZATION_ID)).resolves.toEqual({
      kind: 'in_progress',
      objectsDeleted: 2,
    });
    expect(storage.list).toHaveBeenCalledTimes(2);
    expect(repository.purge).not.toHaveBeenCalled();
  });

  it('does not touch storage when the workspace is active or still recoverable', async () => {
    const repository = repositoryMock();
    repository.claim.mockResolvedValue(false);
    const storage = storageMock();
    const service = new WorkspacePurgeService(
      repository as never,
      storage as never,
      config(),
      new MetricsService(),
    );

    await expect(service.purgeOrganization(ORGANIZATION_ID)).resolves.toEqual({
      kind: 'skipped',
      objectsDeleted: 0,
    });
    expect(storage.list).not.toHaveBeenCalled();
    expect(repository.purge).not.toHaveBeenCalled();
  });

  it('keeps claimed metadata when object deletion fails so the job can retry', async () => {
    const repository = repositoryMock();
    const storage = storageMock();
    storage.list.mockResolvedValue({
      objects: [object(`${ORGANIZATION_ID}/uploads/retry`)],
      nextAfter: null,
    });
    storage.delete.mockRejectedValue(new Error('storage unavailable'));
    const service = new WorkspacePurgeService(
      repository as never,
      storage as never,
      config(),
      new MetricsService(),
    );

    await expect(service.purgeOrganization(ORGANIZATION_ID)).rejects.toThrow('storage unavailable');
    expect(repository.purge).not.toHaveBeenCalled();
  });
});

function object(storageKey: string) {
  return { storageKey, sizeBytes: 10, lastModifiedAt: NOW };
}

function repositoryMock() {
  return {
    claim: vi.fn().mockResolvedValue(true),
    purge: vi.fn().mockResolvedValue(true),
  };
}

function storageMock() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    stat: vi.fn(),
    read: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ objects: [], nextAfter: null }),
  };
}

function config(): WorkspacePurgeConfig {
  return { cron: '30 2 * * *', objectBatchSize: 2, maxBatchesPerJob: 2 };
}
