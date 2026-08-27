import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { BehaviorSubject } from 'rxjs';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { EvidenceExplorer } from '../../../pages/evidence-explorer/evidence-explorer';
import { candidateId, evidence, observationId } from '../../fixtures/readiness-fixtures';

describe('EvidenceExplorer', () => {
  const readinessApi = { exploreEvidence: vi.fn() };
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
    expect(fixture.nativeElement.textContent).toContain('Choose a release candidate');
  });
});
