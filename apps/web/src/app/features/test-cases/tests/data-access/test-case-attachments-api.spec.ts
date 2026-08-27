import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OrganizationTokenResponse } from '@caselog/schemas';
import { sessionAuthInterceptor } from '../../../../core/auth/session-auth.interceptor';
import { AuthApi } from '../../../auth/public-api';
import { TestCaseAttachmentsApi } from '../../data-access/test-case-attachments-api';

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

describe('TestCaseAttachmentsApi', () => {
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

  it('lists attachments for one immutable case version', async () => {
    authApi.organizationToken.mockResolvedValue(organizationSession);
    const response = TestBed.inject(TestCaseAttachmentsApi).testCaseAttachments(
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
    const api = TestBed.inject(TestCaseAttachmentsApi);
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
});
