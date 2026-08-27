import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { TestCaseStructureApi } from '../../data-access/test-case-structure-api';

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

describe('TestCaseStructureApi', () => {
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

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads the project repository structure through the tenant session', async () => {
    const response = TestBed.inject(TestCaseStructureApi).projectStructure(
      'acme-quality',
      'authentication',
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/authentication/structure',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer organization-access-token');
    request.flush({
      project: {
        id: 'c684c153-3802-49c7-94d1-a443262a9129',
        key: 'AUTH',
        slug: 'authentication',
        name: 'Authentication Project',
      },
      suites: [],
    });

    await expect(response).resolves.toMatchObject({ suites: [] });
  });
});
