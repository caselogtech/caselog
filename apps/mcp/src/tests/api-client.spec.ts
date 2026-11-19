import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CaselogApiClient } from '../infrastructure/caselog-api-client.js';

const token = `clg_testtest_${'t'.repeat(43)}`;
const client = new CaselogApiClient({ apiUrl: 'https://caselog.example/api/v1', token });
const request = {
  method: 'GET' as const,
  path: '/projects',
  responseSchema: z.object({ ok: z.boolean() }),
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('bounded Caselog API client', () => {
  it('sends credentials only as a bearer header and preserves bounded query arguments', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await client.request({ ...request, query: { limit: 5, cursor: undefined, search: 'a & b' } }),
    ).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      'https://caselog.example/api/v1/projects?limit=5&search=a+%26+b',
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'manual',
      headers: { authorization: `Bearer ${token}` },
    });
  });

  it('rejects oversized writes before HTTP', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      client.request({ ...request, method: 'POST', body: { text: 'x'.repeat(1024 * 1024) } }),
    ).rejects.toMatchObject({ code: 'request_too_large' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses redirects without sending a second request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: 'https://other.example/token' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(client.request(request)).rejects.toMatchObject({ code: 'api_redirect_refused' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    new Response('<html>error</html>'),
    Response.json({ wrong: true }),
    new Response('x'.repeat(2 * 1024 * 1024 + 1)),
  ])('rejects malformed, oversized and contract-invalid responses', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(client.request(request)).rejects.toMatchObject({ code: 'invalid_api_response' });
  });

  it('preserves safe error identifiers and current version while suppressing upstream messages and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'case_version_conflict',
              message: `secret ${token}`,
              details: { currentVersion: 3, token },
              requestId: 'request-123',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const result = client.request(request);
    await expect(result).rejects.toMatchObject({
      code: 'case_version_conflict',
      context: { status: 409, requestId: 'request-123', currentVersion: 3 },
    });
    await result.catch((error) => expect(String(error)).not.toContain(token));
  });

  it('does not echo arbitrary error codes or retry a failed write', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: `raw ${token}`, message: token, details: {}, requestId: `${token}\n` } },
          { status: 500 },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(
      client.request({ ...request, method: 'POST', body: {}, idempotencyKey: 'intent-123' }),
    ).rejects.toMatchObject({ code: 'api_error', context: { status: 500, requestId: undefined } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('redacts a credential even if an upstream embeds it in an otherwise valid identifier', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: token, message: token, details: {}, requestId: token } },
            { status: 500 },
          ),
        ),
    );
    await expect(client.request(request)).rejects.toMatchObject({
      code: 'api_error',
      context: { requestId: undefined },
    });
  });

  it('returns a deadline error and does not retry after the deadline aborts', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetcher = vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('deadline')), {
            once: true,
          });
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = client.request(request);
    deadline.abort();
    await expect(result).rejects.toMatchObject({ code: 'request_timeout' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('returns safe network failures without retrying', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error(`network failure ${token}`));
    vi.stubGlobal('fetch', fetcher);
    await expect(client.request(request)).rejects.toMatchObject({ code: 'api_unavailable' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('propagates caller cancellation to fetch and reports an uncertain outcome', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          }),
      ),
    );
    const result = client.request({ ...request, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: 'request_cancelled' });
  });
});
