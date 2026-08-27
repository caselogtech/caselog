import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { ReleaseDetailResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReleasesApi } from '../../../data-access/releases-api';
import { ReleaseDetail } from '../../../pages/release-detail/release-detail';

const response: ReleaseDetailResponse = {
  release: {
    id: '11111111-1111-4111-8111-111111111111',
    key: '2026.08',
    name: 'August release',
    state: 'active',
    environment: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Production',
      slug: 'production',
      state: 'active',
    },
    targetDate: '2026-08-31T12:00:00.000Z',
    externalReference: 'QA-100',
    candidateCount: 1,
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-27T12:00:00.000Z',
    activatedAt: '2026-08-21T12:00:00.000Z',
    releasedAt: null,
    cancelledAt: null,
  },
  candidates: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      sequence: 1,
      label: 'RC-1',
      sourceRevision: 'abc123',
      buildIdentifier: 'build-42',
      artifactDigest: 'sha256:abc',
      branch: 'main',
      version: '1.4.0',
      sourceUrl: null,
      createdAt: '2026-08-27T10:00:00.000Z',
      testRuns: [
        {
          testRunId: '44444444-4444-4444-8444-444444444444',
          name: 'Regression',
          status: 'completed',
          role: 'required',
          linkedAt: '2026-08-27T10:30:00.000Z',
        },
      ],
    },
  ],
  history: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      fromState: null,
      toState: 'draft',
      occurredAt: '2026-08-20T12:00:00.000Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      fromState: 'draft',
      toState: 'active',
      occurredAt: '2026-08-21T12:00:00.000Z',
    },
  ],
};

describe('ReleaseDetail', () => {
  const releasesApi = {
    releaseDetail: vi.fn(),
    transitionRelease: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    releasesApi.releaseDetail.mockReset().mockResolvedValue(response);
    releasesApi.transitionRelease.mockReset().mockResolvedValue({
      releaseId: response.release.id,
      state: 'released',
      updatedAt: '2026-08-27T12:30:00.000Z',
    });
    await TestBed.configureTestingModule({
      imports: [ReleaseDetail, i18nTestingModule()],
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
                releaseId: response.release.id,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('renders immutable candidates, linked runs, and lifecycle history', async () => {
    const fixture = TestBed.createComponent(ReleaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('August release');
    expect(text).toContain('RC-1');
    expect(text).toContain('abc123');
    expect(text).toContain('Regression');
    expect(text).toContain('Required');
    expect(text).toContain('Mark released');
  });

  it('requires confirmation before posting an allowed lifecycle transition', async () => {
    const fixture = TestBed.createComponent(ReleaseDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.detail.isSuccess()).toBe(true));

    fixture.componentInstance.requestTransition('release');
    expect(fixture.componentInstance.confirmation()).toBe('release');
    expect(releasesApi.transitionRelease).not.toHaveBeenCalled();
    fixture.componentInstance.confirmTransition();
    await vi.waitFor(() => expect(fixture.componentInstance.transition.isSuccess()).toBe(true));
    expect(releasesApi.transitionRelease).toHaveBeenCalledWith(
      'acme',
      'authentication',
      response.release.id,
      'release',
    );
  });
});
