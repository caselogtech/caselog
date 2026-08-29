import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessPolicyCreate } from '../../../pages/policy-create/policy-create';
import { policy, policyId } from '../../fixtures/readiness-fixtures';

describe('ReadinessPolicyCreate', () => {
  const readinessApi = { createPolicy: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.createPolicy.mockReset().mockResolvedValue(policy);

    await TestBed.configureTestingModule({
      imports: [ReadinessPolicyCreate, i18nTestingModule()],
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
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('creates a typed draft and navigates to policy detail', async () => {
    const fixture = TestBed.createComponent(ReadinessPolicyCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Release policies');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Create release policy',
    );
    fixture.componentInstance.form.patchValue({
      key: ' production ',
      name: ' Production promotion ',
      description: ' Production readiness policy ',
    });
    fixture.componentInstance.form.controls.gates.at(0).controls.key.setValue('required-pass-rate');

    expect(fixture.componentInstance.form.valid).toBe(true);
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(readinessApi.createPolicy).toHaveBeenCalledOnce());

    expect(readinessApi.createPolicy).toHaveBeenCalledWith(
      'acme',
      'authentication',
      {
        key: 'production',
        name: 'Production promotion',
        description: 'Production readiness policy',
        gates: [
          {
            key: 'required-pass-rate',
            metricKey: 'test.pass_rate',
            metricVersion: '1.0.0',
            dimensions: { testRunRole: 'required' },
            operator: 'gte',
            expected: { type: 'percentage', value: '98' },
            impact: 'blocking',
            missingEvidenceBehavior: 'block',
            staleEvidenceBehavior: 'unknown',
            minimumTrust: 'authenticated',
          },
        ],
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(navigate).toHaveBeenCalledWith([
      '/',
      'acme',
      'authentication',
      'release-policies',
      policyId,
    ]);
  });

  it('blocks incompatible values and users without policy permissions', () => {
    const fixture = TestBed.createComponent(ReadinessPolicyCreate);
    fixture.componentInstance.form.patchValue({ key: 'production', name: 'Production' });
    fixture.componentInstance.form.controls.gates.at(0).patchValue({
      key: 'failed-tests',
      metricKey: 'test.failed_count',
      expectedValue: '1.5',
    });
    fixture.componentInstance.submit();
    expect(readinessApi.createPolicy).not.toHaveBeenCalled();

    fixture.componentInstance.form.controls.gates.at(0).controls.expectedValue.setValue('0');
    TestBed.inject(WorkspaceSession).role.set('tester');
    fixture.componentInstance.submit();
    expect(readinessApi.createPolicy).not.toHaveBeenCalled();
  });
});
