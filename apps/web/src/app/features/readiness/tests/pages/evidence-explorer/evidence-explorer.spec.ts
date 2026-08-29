import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { EvidenceExplorer } from '../../../pages/evidence-explorer/evidence-explorer';
import { candidateId, evidence, observationId, readiness } from '../../fixtures/readiness-fixtures';

describe('EvidenceExplorer', () => {
  const readinessApi = { current: vi.fn(), exploreEvidence: vi.fn() };
  let queryClient: QueryClient;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryParams = new BehaviorSubject(
      convertToParamMap({
        candidateId,
        metricKey: 'test.pass_rate',
        view: 'history',
      }),
    );
    readinessApi.exploreEvidence.mockReset().mockResolvedValue({
      ...evidence,
      nextCursor: observationId,
    });
    readinessApi.current.mockReset().mockResolvedValue(readiness);

    await TestBed.configureTestingModule({
      imports: [EvidenceExplorer, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReadinessApi, useValue: readinessApi },
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

  it('loads server-filtered history and preserves the next cursor in the URL', async () => {
    const fixture = TestBed.createComponent(EvidenceExplorer);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.evidence.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(readinessApi.exploreEvidence).toHaveBeenCalledWith('acme', 'authentication', {
      candidateId,
      metricKey: 'test.pass_rate',
      currentOnly: false,
      limit: 25,
    });
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Authentication');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Evidence explorer',
    );
    expect(fixture.nativeElement.textContent).toContain('Evidence revision');
    expect(fixture.nativeElement.textContent).toContain('Test pass rate');

    fixture.componentInstance.nextPage();
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: {
        candidateId,
        metricKey: 'test.pass_rate',
        view: 'history',
        cursor: observationId,
      },
    });
  });

  it('does not call the candidate-scoped API without a candidate ID', () => {
    queryParams.next(convertToParamMap({}));
    const fixture = TestBed.createComponent(EvidenceExplorer);
    fixture.detectChanges();

    expect(readinessApi.exploreEvidence).not.toHaveBeenCalled();
    expect(readinessApi.current).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Choose a release candidate');
  });

  it('shows persisted ingestion issues and the current evaluation failure', async () => {
    readinessApi.exploreEvidence.mockResolvedValue({
      ...evidence,
      issues: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          stage: 'ingestion',
          code: 'test_run_unavailable',
          attempts: 3,
          source: {
            eventId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            eventName: 'test-runs.evidence_source_changed',
            type: 'test_run',
            id: 'regression',
            revision: '13',
          },
          firstFailedAt: '2026-08-27T10:00:00.000Z',
          lastFailedAt: '2026-08-27T10:05:00.000Z',
        },
      ],
    });
    readinessApi.current.mockResolvedValue({
      ...readiness,
      state: 'failed',
      failureCode: 'evaluation_retries_exhausted',
    });
    const fixture = TestBed.createComponent(EvidenceExplorer);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.evidence.isSuccess()).toBe(true));
    await vi.waitFor(() => expect(fixture.componentInstance.readiness.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Evidence pipeline needs attention');
    expect(fixture.nativeElement.textContent).toContain(
      'A linked test run referenced by this candidate is no longer available',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Automatic policy evaluation exhausted its bounded retries',
    );
  });
});
