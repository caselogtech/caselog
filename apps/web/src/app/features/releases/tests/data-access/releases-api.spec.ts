import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { ReleasesApi } from '../../data-access/releases-api';

describe('ReleasesApi', () => {
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

  it('opens workspace access and requests a filtered readiness page', async () => {
    const response = TestBed.inject(ReleasesApi).listReadiness(
      'acme',
      'authentication',
      '55555555-5555-4555-8555-555555555555',
      'active',
    );
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne(
      (candidate) =>
        candidate.url === '/api/v1/projects/authentication/release-readiness' &&
        candidate.params.get('cursor') === '55555555-5555-4555-8555-555555555555' &&
        candidate.params.get('state') === 'active',
    );
    expect(request.request.params.get('limit')).toBe('25');
    request.flush({ items: [], nextCursor: null });

    await expect(response).resolves.toEqual({ items: [], nextCursor: null });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('loads environments and creates a release with an explicit retry key', async () => {
    const api = TestBed.inject(ReleasesApi);
    const http = TestBed.inject(HttpTestingController);
    const environments = api.listEnvironments('acme', 'authentication');
    await Promise.resolve();
    const environmentRequest = http.expectOne('/api/v1/projects/authentication/environments');
    environmentRequest.flush({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Production',
          slug: 'production',
          description: null,
          state: 'active',
          createdAt: '2026-08-20T12:00:00.000Z',
          updatedAt: '2026-08-20T12:00:00.000Z',
        },
      ],
    });
    await expect(environments).resolves.toMatchObject({ items: [{ name: 'Production' }] });

    const request = {
      key: '2026.08',
      name: 'August release',
      externalReference: undefined,
    };
    const created = api.createRelease('acme', 'authentication', request, 'release-browser-retry');
    await Promise.resolve();
    const createRequest = http.expectOne('/api/v1/projects/authentication/releases');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.headers.get('Idempotency-Key')).toBe('release-browser-retry');
    expect(createRequest.request.body).toEqual(request);
    createRequest.flush({ release: releaseSummary() });
    await expect(created).resolves.toMatchObject({ release: { key: '2026.08' } });
  });

  it('loads release detail and posts lifecycle transitions', async () => {
    const api = TestBed.inject(ReleasesApi);
    const http = TestBed.inject(HttpTestingController);
    const detail = api.releaseDetail(
      'acme',
      'authentication',
      '22222222-2222-4222-8222-222222222222',
    );
    await Promise.resolve();
    http
      .expectOne('/api/v1/projects/authentication/releases/22222222-2222-4222-8222-222222222222')
      .flush({ release: releaseSummary(), candidates: [], history: [] });
    await expect(detail).resolves.toMatchObject({ release: { state: 'draft' } });

    const transitioned = api.transitionRelease(
      'acme',
      'authentication',
      '22222222-2222-4222-8222-222222222222',
      'activate',
    );
    await Promise.resolve();
    const transitionRequest = http.expectOne(
      '/api/v1/projects/authentication/releases/22222222-2222-4222-8222-222222222222/activate',
    );
    expect(transitionRequest.request.method).toBe('POST');
    transitionRequest.flush({
      releaseId: '22222222-2222-4222-8222-222222222222',
      state: 'active',
      updatedAt: '2026-08-27T12:00:00.000Z',
    });
    await expect(transitioned).resolves.toMatchObject({ state: 'active' });
  });
});

function releaseSummary() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    key: '2026.08',
    name: 'August release',
    state: 'draft',
    environment: null,
    targetDate: null,
    externalReference: null,
    candidateCount: 0,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    activatedAt: null,
    releasedAt: null,
    cancelledAt: null,
  };
}
