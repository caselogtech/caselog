import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { TestCaseImportsApi } from '../../data-access/test-case-imports-api';

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

describe('TestCaseImportsApi', () => {
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

  it('previews and commits a CSV test case import', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const sectionId = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';
    const request = {
      csv: 'Title,Content\nLogin,Open the sign-in page',
      delimiter: ',' as const,
      mapping: { title: 'Title', content: 'Content' },
      defaults: { sectionId, template: 'text' as const },
    };
    const api = TestBed.inject(TestCaseImportsApi);
    const http = TestBed.inject(HttpTestingController);

    const preview = api.previewCsvImport('acme-quality', 'authentication', request);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const previewRequest = http.expectOne('/api/v1/projects/authentication/imports/csv/preview');
    expect(previewRequest.request.method).toBe('POST');
    expect(previewRequest.request.body).toEqual(request);
    previewRequest.flush({
      columns: ['Title', 'Content'],
      summary: { total: 1, valid: 1, invalid: 0 },
      rows: [
        {
          rowNumber: 2,
          valid: true,
          value: {
            title: 'Login',
            sectionId,
            template: 'text',
            content: { text: 'Open the sign-in page' },
          },
          issues: [],
        },
      ],
    });
    await expect(preview).resolves.toMatchObject({ summary: { valid: 1, invalid: 0 } });

    const commit = api.commitCsvImport(
      'acme-quality',
      'authentication',
      request,
      'csv-import-browser-request',
    );
    await Promise.resolve();
    const commitRequest = http.expectOne('/api/v1/projects/authentication/imports/csv/commit');
    expect(commitRequest.request.method).toBe('POST');
    expect(commitRequest.request.headers.get('Idempotency-Key')).toBe('csv-import-browser-request');
    commitRequest.flush({
      imported: 1,
      testCases: [
        {
          id: '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
          caseNumber: '43',
          title: 'Login',
        },
      ],
    });
    await expect(commit).resolves.toMatchObject({ imported: 1 });
  });
});
