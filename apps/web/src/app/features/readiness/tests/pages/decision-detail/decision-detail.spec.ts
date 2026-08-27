import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { WorkspaceSession } from '../../../../../core/auth/workspace-session';
import { i18nTestingModule } from '../../../../../../testing/i18n-testing';
import { ReadinessApi } from '../../../data-access/readiness-api';
import { ReadinessDecisionDetail } from '../../../pages/decision-detail/decision-detail';
import {
  candidateId,
  decisionDetail,
  decisionId,
  evidence,
  releaseDetail,
  releaseId,
  waiverId,
  waiverList,
  waiverResponse,
} from '../../fixtures/readiness-fixtures';

describe('ReadinessDecisionDetail', () => {
  const readinessApi = {
    releaseDetail: vi.fn(),
    decision: vi.fn(),
    evidence: vi.fn(),
    waivers: vi.fn(),
    createWaiver: vi.fn(),
    revokeWaiver: vi.fn(),
  };
  let queryClient: QueryClient;

  beforeEach(async () => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    readinessApi.releaseDetail.mockReset().mockResolvedValue(releaseDetail);
    readinessApi.decision.mockReset().mockResolvedValue(decisionDetail);
    readinessApi.evidence.mockReset().mockResolvedValue(evidence);
    readinessApi.waivers.mockReset().mockResolvedValue(waiverList);
    readinessApi.createWaiver.mockReset().mockResolvedValue(waiverResponse);
    readinessApi.revokeWaiver.mockReset().mockResolvedValue(waiverResponse);
    await TestBed.configureTestingModule({
      imports: [ReadinessDecisionDetail, i18nTestingModule()],
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
                decisionId,
              }),
            },
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(WorkspaceSession).role.set('lead');
  });

  afterEach(() => queryClient.clear());

  it('renders an immutable decision snapshot and attributable waiver history', async () => {
    const fixture = TestBed.createComponent(ReadinessDecisionDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.waiverHistory.isSuccess()).toBe(true));
    await vi.waitFor(() => expect(fixture.componentInstance.evidence.isSuccess()).toBe(true));
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Readiness decision detail');
    expect(text).toContain('Production promotion');
    expect(text).toContain('required-pass-rate');
    expect(text).toContain('Accepted deployment risk');
    expect(text).toContain('CHG-1042');
    expect(fixture.componentInstance.gateRows()).toHaveLength(1);
  });

  it('creates and revokes waivers with stable idempotency keys', async () => {
    const fixture = TestBed.createComponent(ReadinessDecisionDetail);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.waiverHistory.isSuccess()).toBe(true));

    const gate = decisionDetail.decision.gates[0];
    if (!gate) throw new Error('Expected a gate evaluation fixture');
    const createRequest = {
      scope: {
        type: 'gate_evaluation' as const,
        gateEvaluationId: gate.id,
      },
      reason: 'Accepted gate risk',
      expiresAt: null,
      externalApprovalReference: null,
    };
    fixture.componentInstance.createWaiver.mutate(createRequest);
    await vi.waitFor(() => expect(readinessApi.createWaiver).toHaveBeenCalledOnce());
    expect(readinessApi.createWaiver).toHaveBeenCalledWith(
      'acme',
      'checkout',
      decisionId,
      createRequest,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );

    fixture.componentInstance.revokeWaiver.mutate({
      waiverId,
      request: { reason: 'Approval withdrawn' },
    });
    await vi.waitFor(() => expect(readinessApi.revokeWaiver).toHaveBeenCalledOnce());
    expect(readinessApi.revokeWaiver).toHaveBeenCalledWith(
      'acme',
      'checkout',
      decisionId,
      waiverId,
      { reason: 'Approval withdrawn' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
});
