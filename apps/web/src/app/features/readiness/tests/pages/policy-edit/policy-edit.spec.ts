import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { PolicyEdit } from '../../../pages/policy-edit/policy-edit';
import { policy, policyId } from '../../fixtures/readiness-fixtures';

describe('PolicyEdit', () => {
  const api = { policy: vi.fn(), updatePolicy: vi.fn() };
  let queries: QueryClient;
  beforeEach(async () => {
    queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    api.policy.mockReset().mockResolvedValue(policy);
    api.updatePolicy.mockReset().mockResolvedValue(policy);
    await TestBed.configureTestingModule({
      imports: [PolicyEdit, i18nTestingModule()],
      providers: [
        provideRouter([]),
        provideTanStackQuery(queries),
        { provide: ReadinessApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ org: 'acme', project: 'authentication', policyId }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });
  afterEach(() => queries.clear());
  async function open() {
    const fixture = TestBed.createComponent(PolicyEdit);
    fixture.detectChanges();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.initial()).not.toBeNull();
    });
    return fixture;
  }
  it('clones a published policy and saves changes as a successor draft with its expected version', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = await open();
    fixture.componentInstance.form.controls.name.setValue('Production successor');
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(api.updatePolicy).toHaveBeenCalledWith(
      'acme',
      'authentication',
      policyId,
      expect.objectContaining({
        name: 'Production successor',
        expectedDraftId: null,
        expectedUpdatedAt: policy.policy.updatedAt,
      }),
    );
  });
  it('retains input across background refresh and recoverable save errors', async () => {
    const fixture = await open();
    fixture.componentInstance.form.controls.name.setValue('Unsaved policy');
    api.policy.mockResolvedValue({ policy: { ...policy.policy, name: 'Other editor' } });
    await fixture.componentInstance.policyQuery.refetch();
    api.updatePolicy.mockRejectedValue(new HttpErrorResponse({ status: 500 }));
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(fixture.componentInstance.save.isError()).toBe(true));
    expect(fixture.componentInstance.form.controls.name.value).toBe('Unsaved policy');
  });
  it('requires an explicit discard after a conflict and reloads the latest policy', async () => {
    const fixture = await open();
    fixture.componentInstance.form.controls.name.setValue('Unsaved policy');
    api.updatePolicy.mockRejectedValue(
      new HttpErrorResponse({
        status: 409,
        error: {
          error: {
            code: 'release_policy_draft_changed',
            message: 'Changed',
            details: {},
            requestId: 'test',
          },
        },
      }),
    );
    fixture.componentInstance.submit();
    await vi.waitFor(() => expect(fixture.componentInstance.conflict()).toBe(true));
    fixture.componentInstance.submit();
    expect(api.updatePolicy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.form.controls.name.value).toBe('Unsaved policy');
    api.policy.mockResolvedValue({ policy: { ...policy.policy, name: 'Latest policy' } });
    await fixture.componentInstance.reload();
    await vi.waitFor(() => expect(fixture.componentInstance.conflict()).toBe(false));
    expect(fixture.componentInstance.form.controls.name.value).toBe('Latest policy');
  });
  it('prevents lower roles and invalid forms from saving', async () => {
    const fixture = await open();
    fixture.componentInstance.form.controls.name.setValue(' ');
    fixture.componentInstance.submit();
    expect(api.updatePolicy).not.toHaveBeenCalled();
    TestBed.inject(WorkspaceSession).role.set('read_only');
    fixture.componentInstance.form.controls.name.setValue('Valid policy');
    fixture.componentInstance.submit();
    expect(api.updatePolicy).not.toHaveBeenCalled();
  });
});
