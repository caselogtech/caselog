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
});
