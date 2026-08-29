import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { WorkspaceSession } from '../../../../core/auth/workspace-session';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { WorkspaceApi } from '../../data-access/workspace-api';

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

describe('WorkspaceApi', () => {
  const authApi = { organizationToken: vi.fn() };

  beforeEach(() => {
    authApi.organizationToken.mockReset();
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

  it('exchanges the session before sending a tenant request with the organization token', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).listProjects('acme-quality');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne(
      (candidate) => candidate.url === '/api/v1/projects',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer organization-access-token');
    expect(request.request.params.get('limit')).toBe('25');
    request.flush({ items: [], nextCursor: null });

    await expect(response).resolves.toEqual({ items: [], nextCursor: null });
    expect(TestBed.inject(WorkspaceSession).organization()?.slug).toBe('acme-quality');
  });

  it('creates a project after opening workspace access', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).createProject('acme-quality', {
      name: 'Mobile App',
      key: 'MOBILE',
      slug: 'mobile-app',
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne('/api/v1/projects');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer organization-access-token');
    expect(request.request.body).toEqual({
      name: 'Mobile App',
      key: 'MOBILE',
      slug: 'mobile-app',
    });
    request.flush({ project: project() });

    await expect(response).resolves.toMatchObject({
      project: { name: 'Mobile App', key: 'MOBILE', slug: 'mobile-app' },
    });
  });
});

function project() {
  return {
    id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e188',
    key: 'MOBILE',
    slug: 'mobile-app',
    name: 'Mobile App',
    state: 'active',
    caseCount: 0,
    activeRunCount: 0,
    createdAt: '2026-08-29T12:00:00.000Z',
    updatedAt: '2026-08-29T12:00:00.000Z',
  };
}
