import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { CandidateReadiness } from '../../../pages/candidate-readiness/candidate-readiness';
import {
  candidateId,
  evidence,
  history,
  policy,
  policyId,
  policyList,
  readiness,
  releaseDetail,
  releaseId,
} from '../../fixtures/readiness-fixtures';

describe('CandidateReadiness', () => {
  const readinessApi = {
    releaseDetail: vi.fn(),
    current: vi.fn(),
    policies: vi.fn(),
    policy: vi.fn(),
    evidence: vi.fn(),
    history: vi.fn(),
    evaluate: vi.fn(),
    assignPolicy: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.releaseDetail.mockReset().mockResolvedValue(releaseDetail);
    readinessApi.current.mockReset().mockResolvedValue(readiness);
    readinessApi.policy.mockReset().mockResolvedValue(policy);
    readinessApi.policies.mockReset().mockResolvedValue(policyList);
    readinessApi.evidence.mockReset().mockResolvedValue(evidence);
    readinessApi.history.mockReset().mockResolvedValue(history);
    readinessApi.evaluate.mockReset().mockResolvedValue(readiness);
    readinessApi.assignPolicy.mockReset().mockResolvedValue({
      assignment: readiness.assignment,
    });
    await TestBed.configureTestingModule({
      imports: [CandidateReadiness, i18nTestingModule()],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        provideTanStackQuery(queryClient),
        { provide: ReadinessApi, useValue: readinessApi },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                org: 'acme',
                project: 'checkout',
                releaseId,
                candidateId,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('renders candidate identity, separate decision states, gates, evidence, and history', async () => {
    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.evidence.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const breadcrumbs = fixture.nativeElement.querySelector('nav[aria-label="Breadcrumbs"]');
    expect(breadcrumbs?.textContent).toContain('Releases');
    expect(breadcrumbs?.textContent).toContain('2026.08');
    expect(breadcrumbs?.querySelector('[aria-current="page"]')?.textContent).toContain('RC-4');
    expect(text).toContain('Release candidate RC-4');
    expect(text).toContain('8a4c2f1d7b9e');
    expect(text).toContain('Computed readiness');
    expect(text).toContain('Blocked');
    expect(text).toContain('Test pass rate');
    expect(text).toContain('97.8%');
    expect(text).toContain('junit-ingest');
    expect(text).toContain('Regression');
    expect(fixture.componentInstance.gateRows()).toHaveLength(1);
    const explorerLink = Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    ).find((link) => link.textContent?.includes('Open evidence explorer'));
    expect(explorerLink?.getAttribute('href')).toContain('/acme/checkout/evidence');
    expect(explorerLink?.getAttribute('href')).toContain(candidateId);
  });

  it('requests a manual evaluation for eligible roles', async () => {
    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.current.isSuccess()).toBe(true));

    fixture.componentInstance.requestEvaluation();
    await vi.waitFor(() => expect(readinessApi.evaluate).toHaveBeenCalledOnce());
    expect(readinessApi.evaluate).toHaveBeenCalledWith('acme', 'checkout', candidateId);
  });

  it('refreshes a current decision while the page remains open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fixture = TestBed.createComponent(CandidateReadiness);
    try {
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.current.isSuccess()).toBe(true));
      readinessApi.current.mockResolvedValue({ ...readiness, state: 'stale' });
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.waitFor(() => expect(fixture.componentInstance.current.data()?.state).toBe('stale'));
      expect(readinessApi.current.mock.calls.length).toBeGreaterThan(1);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });

  it('refreshes evidence and history when a saved review is evaluated in the background', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const fixture = TestBed.createComponent(CandidateReadiness);
    try {
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.history.isSuccess()).toBe(true));
      const previousDecision = readiness.decision;
      if (!previousDecision) throw new Error('Missing initial test decision');
      const revision = readiness.currentEvidenceRevision + 1;
      readinessApi.current.mockResolvedValue({
        ...readiness,
        state: 'stale',
        targetEvidenceRevision: revision,
        currentEvidenceRevision: revision,
      });

      await fixture.componentInstance.accessibilitySaved();
      await vi.waitFor(() => expect(fixture.componentInstance.current.data()?.state).toBe('stale'));
      fixture.detectChanges();
      expect(fixture.componentInstance.current.data()?.state).toBe('stale');
      expect(fixture.componentInstance.current.data()?.decision?.id).toBe(previousDecision.id);
      expect(fixture.nativeElement.textContent).toContain('Readiness is updating');
      expect(fixture.nativeElement.textContent).toContain('New evidence has been saved.');

      const nextDecision = {
        ...previousDecision,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        evidenceRevision: revision,
      };
      const nextObservation = { ...evidence.items[0], id: nextDecision.id };
      readinessApi.current.mockResolvedValue({
        ...readiness,
        currentEvidenceRevision: revision,
        targetEvidenceRevision: revision,
        decision: nextDecision,
      });
      readinessApi.history.mockResolvedValue({ ...history, items: [nextDecision] });
      readinessApi.evidence.mockResolvedValue({ ...evidence, items: [nextObservation] });
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() =>
        expect(fixture.componentInstance.current.data()?.decision?.id).toBe(nextDecision.id),
      );
      fixture.detectChanges();
      await vi.waitFor(() =>
        expect(fixture.componentInstance.decisions()[0]?.id).toBe(nextDecision.id),
      );
      expect(fixture.componentInstance.observations()[0]?.id).toBe(nextObservation.id);
      expect(readinessApi.evaluate).not.toHaveBeenCalled();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).not.toContain('Readiness is updating');
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });

  it('offers published policy assignment when the candidate has no policy', async () => {
    readinessApi.current.mockRejectedValueOnce(noPolicyError());
    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.noPolicy()).toBe(true));
    await vi.waitFor(() => expect(fixture.componentInstance.policies.isSuccess()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Assign a release policy');

    const host: HTMLElement = fixture.nativeElement;
    const select = host.querySelector<HTMLSelectElement>('app-policy-assignment select');
    const button = host.querySelector<HTMLButtonElement>('app-policy-assignment button');
    expect(select).not.toBeNull();
    expect(button?.textContent).toContain('Assign policy');
    if (!select || !button) throw new Error('Policy assignment controls are missing');
    select.value = policyId;
    select.dispatchEvent(new Event('change'));
    button.click();
    await vi.waitFor(() => expect(readinessApi.assignPolicy).toHaveBeenCalledOnce());
    expect(readinessApi.assignPolicy).toHaveBeenCalledWith(
      'acme',
      'checkout',
      candidateId,
      policyId,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });

  it('renders assignment after visiting the paginated policy catalogue without changing its cache', async () => {
    const catalogueKey = ['readiness-policies', 'acme', 'checkout'];
    const catalogueData = { pages: [policyList], pageParams: [null] };
    queryClient.setQueryDefaults(catalogueKey, { staleTime: Number.POSITIVE_INFINITY });
    queryClient.setQueryData(catalogueKey, catalogueData);
    readinessApi.current.mockRejectedValueOnce(noPolicyError());

    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.policies.isSuccess()).toBe(true));
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement;
    const select = host.querySelector<HTMLSelectElement>('app-policy-assignment select');
    expect(select?.querySelector(`option[value="${policyId}"]`)?.textContent).toContain(
      'Production promotion',
    );
    expect(host.querySelector('app-policy-assignment button')?.textContent).toContain(
      'Assign policy',
    );
    expect(queryClient.getQueryData(catalogueKey)).toEqual(catalogueData);
  });
});

function noPolicyError(): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 409,
    error: {
      error: {
        code: 'release_policy_not_assigned',
        message: 'Assign a published release policy',
        details: {},
        requestId: 'request-readiness-policy',
      },
    },
  });
}
