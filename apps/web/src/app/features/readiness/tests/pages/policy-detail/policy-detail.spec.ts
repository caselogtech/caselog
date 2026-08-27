import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessPolicyDetail } from '../../../pages/policy-detail/policy-detail';
import { policy, policyId } from '../../fixtures/readiness-fixtures';

describe('ReadinessPolicyDetail', () => {
  const readinessApi = { policy: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.policy.mockReset().mockResolvedValue(policy);

    await TestBed.configureTestingModule({
      imports: [ReadinessPolicyDetail, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReadinessApi, useValue: readinessApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme',
                project: 'authentication',
                policyId,
              }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders immutable policy versions and their gates', async () => {
    const fixture = TestBed.createComponent(ReadinessPolicyDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policyQuery.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(readinessApi.policy).toHaveBeenCalledWith('acme', 'authentication', policyId);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Production promotion');
    expect(text).toContain('Published');
    expect(text).toContain('Test pass rate');
    expect(text).toContain('≥ 98%');
    expect(text).toContain('Authenticated');
  });
});
