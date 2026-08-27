import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessPolicyList } from '../../../pages/policy-list/policy-list';
import { policyList } from '../../fixtures/readiness-fixtures';

describe('ReadinessPolicyList', () => {
  const readinessApi = { policies: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.policies.mockReset().mockResolvedValue(policyList);

    await TestBed.configureTestingModule({
      imports: [ReadinessPolicyList, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReadinessApi, useValue: readinessApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme', project: 'authentication' }),
            },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => queryClient.clear());

  it('renders the server-owned policy catalogue', async () => {
    const fixture = TestBed.createComponent(ReadinessPolicyList);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policies.isSuccess()).toBe(true));
    fixture.detectChanges();

    expect(readinessApi.policies).toHaveBeenCalledWith('acme', 'authentication', undefined);
    expect(fixture.nativeElement.textContent).toContain('Production promotion');
    expect(fixture.nativeElement.textContent).toContain('Version 3');
    expect(fixture.nativeElement.textContent).toContain('1 policies loaded');
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe(
      '/acme/authentication/release-policies/33333333-3333-4333-8333-333333333333',
    );
  });
});
