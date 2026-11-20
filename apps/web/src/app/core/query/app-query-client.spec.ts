import { describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from './app-query-client';

describe('createAppQueryClient', () => {
  it('lets pages handle query failures without a global redirect when requested', async () => {
    const onRouteFailure = vi.fn();
    const client = createAppQueryClient(onRouteFailure);
    await expect(
      client.fetchQuery({
        queryKey: ['staff', 'workspace', 'missing'],
        queryFn: () => Promise.reject(new Error('Workspace missing')),
        retry: false,
        meta: { handleErrorsLocally: true },
      }),
    ).rejects.toThrow('Workspace missing');
    expect(onRouteFailure).not.toHaveBeenCalled();
    client.clear();
  });

  it('reports an initial route query failure', async () => {
    const onRouteFailure = vi.fn();
    const client = createAppQueryClient(onRouteFailure);
    const error = new Error('Request failed');

    await expect(
      client.fetchQuery({
        queryKey: ['release', 'release-1'],
        queryFn: () => Promise.reject(error),
        retry: false,
      }),
    ).rejects.toBe(error);

    expect(onRouteFailure).toHaveBeenCalledWith(error);
    client.clear();
  });

  it('keeps stale data visible when a background refresh fails', async () => {
    const onRouteFailure = vi.fn();
    const client = createAppQueryClient(onRouteFailure);
    client.setQueryData(['release', 'release-1'], { id: 'release-1' });

    await expect(
      client.fetchQuery({
        queryKey: ['release', 'release-1'],
        queryFn: () => Promise.reject(new Error('Refresh failed')),
        retry: false,
        staleTime: 0,
      }),
    ).rejects.toThrow('Refresh failed');

    expect(onRouteFailure).not.toHaveBeenCalled();
    client.clear();
  });
});
