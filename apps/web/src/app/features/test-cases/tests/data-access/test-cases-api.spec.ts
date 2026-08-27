import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { TestCasesApi } from '../../data-access/test-cases-api';

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

describe('TestCasesApi', () => {
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

  it('sends case pagination and search to the tenant project endpoint', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(TestCasesApi).listTestCases(
      'acme-quality',
      'authentication',
      '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      'invalid password',
      'cc4201aa-51f1-4a1b-898d-8d208d475ed3',
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne(
      (candidate) => candidate.url === '/api/v1/projects/authentication/cases',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer organization-access-token');
    expect(request.request.params.get('cursor')).toBe('77bcbeb6-1c8d-49ac-8358-e2c80ab0e187');
    expect(request.request.params.get('search')).toBe('invalid password');
    expect(request.request.params.get('sectionId')).toBe('cc4201aa-51f1-4a1b-898d-8d208d475ed3');
    request.flush({
      project: {
        id: 'c684c153-3802-49c7-94d1-a443262a9129',
        key: 'AUTH',
        slug: 'authentication',
        name: 'Authentication Project',
      },
      items: [],
      nextCursor: null,
    });

    await expect(response).resolves.toMatchObject({ items: [], nextCursor: null });
  });
});
