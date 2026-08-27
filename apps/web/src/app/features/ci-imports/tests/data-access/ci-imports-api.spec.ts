import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { CiImportsApi } from '../../data-access/ci-imports-api';

const organizationSession: OrganizationTokenResponse = {
  accessToken: 'organization-access-token',
  expiresAt: '2099-08-02T12:00:00.000Z',
  organization: {
    id: 'c684c153-3802-49c7-94d1-a443262a9129',
    name: 'Acme Quality',
    slug: 'acme-quality',
  },
  role: 'owner',
};

describe('CiImportsApi', () => {
  const authApi = { organizationToken: vi.fn() };

  beforeEach(() => {
    authApi.organizationToken.mockReset().mockResolvedValue(organizationSession);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionAuthInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: authApi },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.unstubAllGlobals();
  });

  it('lists result ingestion history with cursor and status filters', async () => {
    const response = TestBed.inject(CiImportsApi).listResultIngestions(
      'acme-quality',
      'authentication',
      '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      'failed',
    );
    await flushWorkspaceAccess();

    const request = TestBed.inject(HttpTestingController).expectOne(
      (candidate) => candidate.url === '/api/v1/projects/authentication/automation/imports',
    );
    expect(request.request.params.get('cursor')).toBe('77bcbeb6-1c8d-49ac-8358-e2c80ab0e187');
    expect(request.request.params.get('status')).toBe('failed');
    request.flush({
      project: {
        id: 'c684c153-3802-49c7-94d1-a443262a9129',
        key: 'AUTH',
        slug: 'authentication',
        name: 'Authentication Project',
      },
      summary: { reportsThisWeek: 0, matchedPercentThisWeek: 0, unmatchedThisWeek: 0 },
      items: [],
      nextCursor: null,
    });

    await expect(response).resolves.toMatchObject({ items: [], nextCursor: null });
  });

  it('uploads a JUnit file with idempotency and pipeline metadata', async () => {
    const file = new File(['<testsuite/>'], 'junit.xml', { type: 'application/xml' });
    const response = TestBed.inject(CiImportsApi).uploadJUnitResults(
      'acme-quality',
      'authentication',
      'b101eace-107c-4177-8d7c-f4f052785c16',
      file,
      { pipeline: 'checkout-regression', branch: 'main' },
    );
    await flushWorkspaceAccess();

    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/authentication/runs/b101eace-107c-4177-8d7c-f4f052785c16/results/junit',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('application/xml');
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(request.request.headers.get('X-Caselog-Source')).toBe('Browser upload');
    expect(request.request.headers.get('X-Caselog-Pipeline')).toBe('checkout-regression');
    expect(request.request.headers.get('X-Caselog-Branch')).toBe('main');
    request.flush({
      total: 1,
      recorded: 1,
      truncated: 0,
      counts: { passed: 1, failed: 0, error: 0, skipped: 0 },
      unmatched: [],
    });

    await expect(response).resolves.toMatchObject({ total: 1, recorded: 1 });
  });
});

async function flushWorkspaceAccess(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
