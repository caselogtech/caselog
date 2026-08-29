import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { ProjectEnvironmentsApi } from '../../data-access/project-environments-api';

describe('ProjectEnvironmentsApi', () => {
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

  it('lists project environments after opening workspace access', async () => {
    const response = TestBed.inject(ProjectEnvironmentsApi).list('acme', 'checkout');
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/checkout/environments',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ items: [environment()] });

    await expect(response).resolves.toMatchObject({ items: [{ slug: 'production' }] });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('creates an environment with a stable retry key', async () => {
    const requestBody = {
      name: 'Production',
      slug: 'production',
      description: 'Customer-facing production',
    };
    const response = TestBed.inject(ProjectEnvironmentsApi).create(
      'acme',
      'checkout',
      requestBody,
      'environment-browser-retry',
    );
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/checkout/environments',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(requestBody);
    expect(request.request.headers.get('Idempotency-Key')).toBe('environment-browser-retry');
    request.flush({ environment: environment() });

    await expect(response).resolves.toMatchObject({ environment: { name: 'Production' } });
  });

  it('posts explicit archive and restore lifecycle actions', async () => {
    const api = TestBed.inject(ProjectEnvironmentsApi);
    const http = TestBed.inject(HttpTestingController);
    const environmentId = environment().id;
    const archived = api.changeState('acme', 'checkout', environmentId, 'archive');
    await Promise.resolve();
    const archiveRequest = http.expectOne(
      `/api/v1/projects/checkout/environments/${environmentId}/archive`,
    );
    expect(archiveRequest.request.method).toBe('POST');
    archiveRequest.flush({ environmentId, state: 'archived' });
    await expect(archived).resolves.toMatchObject({ state: 'archived' });

    const restored = api.changeState('acme', 'checkout', environmentId, 'restore');
    await Promise.resolve();
    http
      .expectOne(`/api/v1/projects/checkout/environments/${environmentId}/restore`)
      .flush({ environmentId, state: 'active' });
    await expect(restored).resolves.toMatchObject({ state: 'active' });
  });
});

function environment() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Production',
    slug: 'production',
    description: 'Customer-facing production',
    state: 'active',
    activeReleaseCount: 0,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
  };
}
