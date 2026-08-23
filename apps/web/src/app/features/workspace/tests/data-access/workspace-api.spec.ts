import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
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

  it('sends case pagination and search to the tenant project endpoint', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).listTestCases(
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

  it('lists result ingestion history with cursor and status filters', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).listResultIngestions(
      'acme-quality',
      'authentication',
      '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      'failed',
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const file = new File(['<testsuite/>'], 'junit.xml', { type: 'application/xml' });
    const response = TestBed.inject(WorkspaceApi).uploadJUnitResults(
      'acme-quality',
      'authentication',
      'b101eace-107c-4177-8d7c-f4f052785c16',
      file,
      { pipeline: 'checkout-regression', branch: 'main' },
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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

  it('previews and commits a CSV test case import', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const sectionId = 'cc4201aa-51f1-4a1b-898d-8d208d475ed3';
    const request = {
      csv: 'Title,Content\nLogin,Open the sign-in page',
      delimiter: ',' as const,
      mapping: { title: 'Title', content: 'Content' },
      defaults: { sectionId, template: 'text' as const },
    };
    const api = TestBed.inject(WorkspaceApi);
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

  it('lists attachments for one immutable case version', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).testCaseAttachments(
      'acme-quality',
      'authentication',
      '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      '7eb03420-da8e-4975-a1bc-0ca0bf97e9b2',
      '6fe23247-f3b8-44ec-99fb-f7567940c580',
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/v1/projects/authentication/cases/77bcbeb6-1c8d-49ac-8358-e2c80ab0e187/versions/7eb03420-da8e-4975-a1bc-0ca0bf97e9b2/attachments?limit=25&cursor=6fe23247-f3b8-44ec-99fb-f7567940c580',
    );
    request.flush({ items: [], nextCursor: null });

    await expect(response).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('hashes, uploads, and completes a case attachment', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const bytes = new TextEncoder().encode('browser evidence');
    const file = {
      name: 'browser-evidence.txt',
      type: 'text/plain',
      size: bytes.byteLength,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    } as File;
    const api = TestBed.inject(WorkspaceApi);
    const http = TestBed.inject(HttpTestingController);
    const collectionUrl =
      '/api/v1/projects/authentication/cases/77bcbeb6-1c8d-49ac-8358-e2c80ab0e187/versions/7eb03420-da8e-4975-a1bc-0ca0bf97e9b2/attachments';

    const response = api.uploadTestCaseAttachment(
      'acme-quality',
      'authentication',
      '77bcbeb6-1c8d-49ac-8358-e2c80ab0e187',
      '7eb03420-da8e-4975-a1bc-0ca0bf97e9b2',
      file,
    );
    let uploadSessionRequest: TestRequest | undefined;
    await vi.waitFor(() => {
      uploadSessionRequest ??= http.match(`${collectionUrl}/uploads`)[0];
      expect(uploadSessionRequest).toBeDefined();
    });
    expect(uploadSessionRequest?.request.body).toMatchObject({
      fileName: 'browser-evidence.txt',
      contentType: 'text/plain',
      sizeBytes: bytes.byteLength,
      checksumSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    uploadSessionRequest?.flush({
      upload: {
        id: '6fe23247-f3b8-44ec-99fb-f7567940c580',
        method: 'PUT',
        url: 'https://storage.example.com/upload',
        headers: { 'Content-Type': 'text/plain' },
        expiresAt: '2026-08-02T12:35:00.000Z',
      },
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith('https://storage.example.com/upload', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: file,
    });

    const completionRequest = http.expectOne(collectionUrl);
    expect(completionRequest.request.body).toEqual({
      uploadId: '6fe23247-f3b8-44ec-99fb-f7567940c580',
    });
    completionRequest.flush({
      attachment: {
        id: '6fe23247-f3b8-44ec-99fb-f7567940c580',
        fileName: 'browser-evidence.txt',
        contentType: 'text/plain',
        sizeBytes: bytes.byteLength,
        checksumSha256: uploadSessionRequest?.request.body.checksumSha256,
        createdAt: '2026-08-02T12:35:00.000Z',
      },
    });

    await expect(response).resolves.toMatchObject({
      attachment: { fileName: 'browser-evidence.txt' },
    });
  });

  it('creates a secure download for a recorded result attachment', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(WorkspaceApi).testResultAttachmentDownload(
      'acme-quality',
      'authentication',
      'b101eace-107c-4177-8d7c-f4f052785c16',
      'f230fe74-dd2d-40db-a0a4-21a8597526ef',
      '4c305be5-9ab8-4ef4-889c-08b666b5d402',
      '6fe23247-f3b8-44ec-99fb-f7567940c580',
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

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
