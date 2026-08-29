import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessPolicyVersionCreate } from '../../../pages/policy-version-create/policy-version-create';
import { policy, policyId } from '../../fixtures/readiness-fixtures';

describe('ReadinessPolicyVersionCreate', () => {
  const readinessApi = { policy: vi.fn(), createPolicyVersion: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.policy.mockReset().mockResolvedValue(policy);
    readinessApi.createPolicyVersion.mockReset().mockResolvedValue(policy);

    await TestBed.configureTestingModule({
      imports: [ReadinessPolicyVersionCreate, i18nTestingModule()],
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
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('clones the published gates into a new complete draft version', async () => {
    const fixture = TestBed.createComponent(ReadinessPolicyVersionCreate);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policyQuery.isSuccess()).toBe(true));
    fixture.detectChanges();

    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Release policies');
    expect(breadcrumbs?.textContent).toContain('Production promotion');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Create draft version 4',
    );
    const gate = fixture.componentInstance.form.controls.gates.at(0);
    expect(gate.controls.key.value).toBe('required-pass-rate');
    gate.controls.expectedValue.setValue('99');
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(readinessApi.createPolicyVersion).toHaveBeenCalledOnce());

    expect(readinessApi.createPolicyVersion).toHaveBeenCalledWith(
      'acme',
      'authentication',
      policyId,
      {
        gates: [
          {
            key: 'required-pass-rate',
            metricKey: 'test.pass_rate',
            metricVersion: '1.0.0',
            dimensions: { testRunRole: 'required' },
            operator: 'gte',
            expected: { type: 'percentage', value: '99' },
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

  it('does not create a second draft when one already exists', async () => {
    const response = structuredClone(policy);
    const version = response.policy.versions[0];
    if (!version) throw new Error('Expected a policy version fixture');
    response.policy.versions[0] = { ...version, state: 'draft', publishedAt: null };
    readinessApi.policy.mockResolvedValue(response);

    const fixture = TestBed.createComponent(ReadinessPolicyVersionCreate);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policyQuery.isSuccess()).toBe(true));
    fixture.detectChanges();
    fixture.componentInstance.submit();

    expect(fixture.componentInstance.existingDraft()).toBeDefined();
    expect(readinessApi.createPolicyVersion).not.toHaveBeenCalled();
  });
});
