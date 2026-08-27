import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { TestRunsApi } from '../../data-access/test-runs-api';

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

describe('TestRunsApi', () => {
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

  it('lists filtered test runs through workspace access', async () => {
    const response = TestBed.inject(TestRunsApi).listTestRuns(
      'acme-quality',
      'authentication',
      undefined,
      'active',
      100,
    );
    await flushWorkspaceAccess();

    const request = TestBed.inject(HttpTestingController).expectOne(
      (candidate) => candidate.url === '/api/v1/projects/authentication/runs',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer organization-access-token');
    expect(request.request.params.get('status')).toBe('active');
    expect(request.request.params.get('limit')).toBe('100');
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

  it('creates a secure download for a recorded result attachment', async () => {
    const response = TestBed.inject(TestRunsApi).testResultAttachmentDownload(
      'acme-quality',
      'authentication',
      'b101eace-107c-4177-8d7c-f4f052785c16',
      'f230fe74-dd2d-40db-a0a4-21a8597526ef',
      '4c305be5-9ab8-4ef4-889c-08b666b5d402',
      '6fe23247-f3b8-44ec-99fb-f7567940c580',
    );
    await flushWorkspaceAccess();

    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/authentication/runs/b101eace-107c-4177-8d7c-f4f052785c16/items/f230fe74-dd2d-40db-a0a4-21a8597526ef/results/4c305be5-9ab8-4ef4-889c-08b666b5d402/attachments/6fe23247-f3b8-44ec-99fb-f7567940c580/download',
    );
    expect(request.request.method).toBe('POST');
    request.flush({
      download: {
        url: 'https://storage.example.com/evidence.png',
        expiresAt: '2026-08-02T12:35:00.000Z',
      },
    });

    await expect(response).resolves.toMatchObject({
      download: { url: 'https://storage.example.com/evidence.png' },
    });
  });
});

async function flushWorkspaceAccess(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
