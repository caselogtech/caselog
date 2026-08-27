import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { CandidateReadiness } from '../../../pages/candidate-readiness/candidate-readiness';
import {
  candidateId,
  evidence,
  history,
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
    expect(text).toContain('Release candidate RC-4');
    expect(text).toContain('8a4c2f1d7b9e');
    expect(text).toContain('Computed readiness');
    expect(text).toContain('Blocked');
    expect(text).toContain('Test pass rate');
    expect(text).toContain('97.8%');
    expect(text).toContain('junit-ingest');
    expect(text).toContain('Regression');
    expect(fixture.componentInstance.gateRows()).toHaveLength(1);
  });

  it('requests a manual evaluation for eligible roles', async () => {
    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.current.isSuccess()).toBe(true));

    fixture.componentInstance.requestEvaluation();
    await vi.waitFor(() => expect(readinessApi.evaluate).toHaveBeenCalledOnce());
    expect(readinessApi.evaluate).toHaveBeenCalledWith('acme', 'checkout', candidateId);
  });

  it('offers published policy assignment when the candidate has no policy', async () => {
    readinessApi.current.mockRejectedValueOnce(noPolicyError());
    const fixture = TestBed.createComponent(CandidateReadiness);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.noPolicy()).toBe(true));
    await vi.waitFor(() => expect(fixture.componentInstance.policies.isSuccess()).toBe(true));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Assign a release policy');

    fixture.componentInstance.assignPolicy.mutate(policyId);
    await vi.waitFor(() => expect(readinessApi.assignPolicy).toHaveBeenCalledOnce());
    expect(readinessApi.assignPolicy).toHaveBeenCalledWith(
      'acme',
      'checkout',
      candidateId,
      policyId,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
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
