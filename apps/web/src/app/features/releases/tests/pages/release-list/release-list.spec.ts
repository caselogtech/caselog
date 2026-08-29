import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import type { ReleaseReadinessListResponse } from '@caselog/schemas';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReleasesApi } from '../../../data-access/releases-api';
import { ReleaseList } from '../../../pages/release-list/release-list';

const response: ReleaseReadinessListResponse = {
  items: [
    {
      release: {
        id: '11111111-1111-4111-8111-111111111111',
        key: 'AUTH-2026.08',
        name: 'Authentication August release',
        state: 'active',
        environment: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Production',
          slug: 'production',
          state: 'active',
        },
        targetDate: '2026-08-31T12:00:00.000Z',
        externalReference: null,
        candidateCount: 2,
        createdAt: '2026-08-20T12:00:00.000Z',
        updatedAt: '2026-08-27T12:00:00.000Z',
        activatedAt: '2026-08-21T12:00:00.000Z',
        releasedAt: null,
        cancelledAt: null,
      },
      latestCandidate: {
        id: '33333333-3333-4333-8333-333333333333',
        releaseId: '11111111-1111-4111-8111-111111111111',
        sequence: 2,
        label: 'RC-2',
        createdAt: '2026-08-27T10:00:00.000Z',
      },
      readiness: {
        state: 'current',
        decisionId: '44444444-4444-4444-8444-444444444444',
        computedStatus: 'ready',
        effectiveDisposition: 'ready',
        policy: {
          id: '55555555-5555-4555-8555-555555555555',
          key: 'production',
          name: 'Production readiness',
          version: 2,
        },
        evidenceRevision: 4,
        targetEvidenceRevision: 4,
        currentEvidenceRevision: 4,
        evaluatorVersion: '1.0.0',
        evaluatedAt: '2026-08-27T11:00:00.000Z',
        failureCode: null,
      },
    },
  ],
  nextCursor: null,
};

describe('ReleaseList', () => {
  const releasesApi = { listReadiness: vi.fn() };
  let queryClient: QueryClient;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryParams = new BehaviorSubject(convertToParamMap({}));
    releasesApi.listReadiness.mockReset().mockResolvedValue(response);
    await TestBed.configureTestingModule({
      imports: [ReleaseList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReleasesApi, useValue: releasesApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme', project: 'authentication' }),
              queryParamMap: queryParams.value,
            },
            queryParamMap: queryParams.asObservable(),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders server-owned release and readiness summaries', async () => {
    const fixture = TestBed.createComponent(ReleaseList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.releases.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Authentication');
    expect(breadcrumbs?.textContent).toContain('Releases');
    expect(text).toContain('Authentication August release');
    expect(text).toContain('RC-2');
    expect(text).toContain('Ready');
    expect(text).toContain('Production readiness v2');
    expect(fixture.nativeElement.querySelector('.success')).not.toBeNull();
  });

  it('persists lifecycle filtering in the URL and query key', async () => {
    const fixture = TestBed.createComponent(ReleaseList);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.releases.isSuccess()).toBe(true));

    await fixture.componentInstance.selectState('released');
    queryParams.next(convertToParamMap({ state: 'released' }));
    await vi.waitFor(() =>
      expect(releasesApi.listReadiness).toHaveBeenLastCalledWith(
        'acme',
        'authentication',
        undefined,
        'released',
      ),
    );
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { state: 'released' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    queryParams.next(convertToParamMap({}));
    await vi.waitFor(() =>
      expect(releasesApi.listReadiness).toHaveBeenLastCalledWith(
        'acme',
        'authentication',
        undefined,
        undefined,
      ),
    );
  });
});
