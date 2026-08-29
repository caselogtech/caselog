import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ApiTokenScope } from '@caselog/schemas';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { WorkspaceApiTokensApi } from '../../data-access/workspace-api-tokens-api';

describe('WorkspaceApiTokensApi', () => {
  const workspaceAccess = { open: vi.fn() };

  beforeEach(() => {
    workspaceAccess.open.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkspaceAccess, useValue: workspaceAccess },
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists active API token summaries without a reusable secret', async () => {
    const response = TestBed.inject(WorkspaceApiTokensApi).list('acme');
    await Promise.resolve();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/api-tokens')
      .flush({ apiTokens: [apiToken()] });

    await expect(response).resolves.toMatchObject({
      apiTokens: [{ tokenPrefix: 'clg_abcdefgh' }],
    });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('returns the secret only from creation and revokes through the token identifier', async () => {
    const api = TestBed.inject(WorkspaceApiTokensApi);
    const http = TestBed.inject(HttpTestingController);
    const request = {
      name: 'GitHub Actions',
      scopes: ['runs:read'] as ApiTokenScope[],
      expiresAt: '2026-11-27T08:00:00.000Z',
    };

    const created = api.create('acme', request);
    await Promise.resolve();
    const createRequest = http.expectOne('/api/v1/api-tokens');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual(request);
    createRequest.flush({ token: secret(), apiToken: apiToken() });
    await expect(created).resolves.toMatchObject({ token: secret() });

    const revoked = api.revoke('acme', apiToken().id);
    await Promise.resolve();
    const revokeRequest = http.expectOne(`/api/v1/api-tokens/${apiToken().id}`);
    expect(revokeRequest.request.method).toBe('DELETE');
    revokeRequest.flush(null);
    await expect(revoked).resolves.toBeUndefined();
  });
});

function secret(): string {
  return `clg_abcdefgh_${'A'.repeat(43)}`;
}

function apiToken() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'GitHub Actions',
    tokenPrefix: 'clg_abcdefgh',
    scopes: ['runs:read'],
    expiresAt: '2026-11-27T08:00:00.000Z',
    lastUsedAt: null,
    createdAt: '2026-08-29T08:00:00.000Z',
    createdBy: {
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'Ada Lovelace',
    },
  };
}
