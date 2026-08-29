import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ReleaseDetailResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReleasesApi } from '../../../data-access/releases-api';
import { CandidateCreate } from '../../../pages/candidate-create/candidate-create';

const releaseId = '11111111-1111-4111-8111-111111111111';
const releaseDetail: ReleaseDetailResponse = {
  release: {
    id: releaseId,
    key: '2026.08',
    name: 'August release',
    state: 'draft',
    environment: null,
    targetDate: null,
    externalReference: null,
    candidateCount: 0,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
    activatedAt: null,
    releasedAt: null,
    cancelledAt: null,
  },
  candidates: [],
  history: [],
};

describe('CandidateCreate', () => {
  const releasesApi = {
    releaseDetail: vi.fn(),
    createCandidate: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    releasesApi.releaseDetail.mockReset().mockResolvedValue(releaseDetail);
    releasesApi.createCandidate.mockReset().mockResolvedValue({
      candidate: {
        id: '22222222-2222-4222-8222-222222222222',
        sequence: 1,
        label: 'RC-1',
        sourceRevision: 'abc123',
        buildIdentifier: null,
        artifactDigest: null,
        branch: 'main',
        version: '1.0.0',
        sourceUrl: 'https://example.com/commit/abc123',
        createdAt: '2026-08-27T12:00:00.000Z',
        testRuns: [],
      },
    });
    await TestBed.configureTestingModule({
      imports: [CandidateCreate, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReleasesApi, useValue: releasesApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme',
                project: 'authentication',
                releaseId,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('registers a normalized immutable identity and returns to release detail', async () => {
    const fixture = TestBed.createComponent(CandidateCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.release.isSuccess()).toBe(true));
    fixture.detectChanges();

    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Releases');
    expect(breadcrumbs?.textContent).toContain('2026.08');
    expect(breadcrumbs?.textContent).toContain('Register candidate');

    fixture.componentInstance.form.setValue({
      sourceRevision: ' abc123 ',
      buildIdentifier: '',
      artifactDigest: '',
      branch: ' main ',
      version: ' 1.0.0 ',
      sourceUrl: ' https://example.com/commit/abc123 ',
    });
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(releasesApi.createCandidate).toHaveBeenCalledOnce());

    expect(releasesApi.createCandidate).toHaveBeenCalledWith(
      'acme',
      'authentication',
      releaseId,
      {
        sourceRevision: 'abc123',
        buildIdentifier: undefined,
        artifactDigest: undefined,
        branch: 'main',
        version: '1.0.0',
        sourceUrl: 'https://example.com/commit/abc123',
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(navigate).toHaveBeenCalledWith(['/', 'acme', 'authentication', 'releases', releaseId]);
  });

  it('requires one identity field and an eligible role', async () => {
    const fixture = TestBed.createComponent(CandidateCreate);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.release.isSuccess()).toBe(true));

    fixture.componentInstance.submit();
    expect(fixture.componentInstance.form.hasError('identityRequired')).toBe(true);
    expect(releasesApi.createCandidate).not.toHaveBeenCalled();

    TestBed.inject(WorkspaceSession).role.set('tester');
    fixture.componentInstance.form.patchValue({ sourceRevision: 'abc123' });
    fixture.componentInstance.submit();
    expect(releasesApi.createCandidate).not.toHaveBeenCalled();
  });
});
