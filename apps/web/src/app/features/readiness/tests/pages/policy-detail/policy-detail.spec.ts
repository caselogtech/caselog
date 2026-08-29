import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessPolicyDetail } from '../../../pages/policy-detail/policy-detail';
import { policy, policyId } from '../../fixtures/readiness-fixtures';

describe('ReadinessPolicyDetail', () => {
  const readinessApi = { policy: vi.fn(), publishPolicy: vi.fn() };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.policy.mockReset().mockResolvedValue(policy);
    readinessApi.publishPolicy.mockReset().mockResolvedValue(policy);

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
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Release policies');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Production promotion',
    );
    expect(text).toContain('Production promotion');
    expect(text).toContain('Published');
    expect(text).toContain('Test pass rate');
    expect(text).toContain('≥ 98%');
    expect(text).toContain('Authenticated');
  });

  it('publishes the exact current draft for policy managers', async () => {
    const draftPolicy = structuredClone(policy);
    const version = draftPolicy.policy.versions[0];
    if (!version) throw new Error('Expected a policy version fixture');
    draftPolicy.policy.versions[0] = {
      ...version,
      state: 'draft',
      publishedAt: null,
    };
    readinessApi.policy.mockResolvedValue(draftPolicy);
    TestBed.inject(WorkspaceSession).role.set('lead');
    const fixture = TestBed.createComponent(ReadinessPolicyDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policyQuery.isSuccess()).toBe(true));
    fixture.detectChanges();

    fixture.componentInstance.publishDraft();
    await vi.waitFor(() => expect(readinessApi.publishPolicy).toHaveBeenCalledOnce());

    expect(readinessApi.publishPolicy).toHaveBeenCalledWith(
      'acme',
      'authentication',
      policyId,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('offers successor authoring from a published version', async () => {
    TestBed.inject(WorkspaceSession).role.set('lead');
    const fixture = TestBed.createComponent(ReadinessPolicyDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policyQuery.isSuccess()).toBe(true));
    fixture.detectChanges();

    const successorLink = fixture.nativeElement.querySelector(
      `a[href="/acme/authentication/release-policies/${policyId}/versions/new"]`,
    ) as HTMLAnchorElement | null;
    expect(successorLink?.textContent).toContain('Create successor draft');
  });
});
