import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { ReadinessApi } from '../../data-access/readiness-api';
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
} from '../fixtures/readiness-fixtures';

describe('ReadinessApi', () => {
  const workspaceAccess = { open: vi.fn() };

  beforeEach(() => {
    workspaceAccess.open.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkspaceAccess, useValue: workspaceAccess },
      ],
    });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('loads release context and the current candidate readiness projection', async () => {
    const api = TestBed.inject(ReadinessApi);
    const http = TestBed.inject(HttpTestingController);
    const context = api.releaseDetail('acme', 'checkout', releaseId);
    await Promise.resolve();
    http.expectOne(`/api/v1/projects/checkout/releases/${releaseId}`).flush(releaseDetail);
    await expect(context).resolves.toMatchObject({ release: { name: 'August release' } });

    const current = api.current('acme', 'checkout', candidateId);
    await Promise.resolve();
    http
      .expectOne(`/api/v1/projects/checkout/candidates/${candidateId}/readiness`)
      .flush(readiness);
    await expect(current).resolves.toMatchObject({ decision: { status: 'blocked' } });
    expect(workspaceAccess.open).toHaveBeenCalledWith('acme');
  });

  it('requests evaluation and pages history and evidence', async () => {
    const api = TestBed.inject(ReadinessApi);
    const http = TestBed.inject(HttpTestingController);
    const evaluated = api.evaluate('acme', 'checkout', candidateId);
    await Promise.resolve();
    const evaluationRequest = http.expectOne(
      `/api/v1/projects/checkout/candidates/${candidateId}/readiness/evaluations`,
    );
    expect(evaluationRequest.request.method).toBe('POST');
    evaluationRequest.flush(readiness);
    await expect(evaluated).resolves.toMatchObject({ state: 'current' });

    const decisions = api.history('acme', 'checkout', candidateId, history.items[0]?.id);
    await Promise.resolve();
    const historyRequest = http.expectOne(
      (request) =>
        request.url === `/api/v1/projects/checkout/candidates/${candidateId}/readiness/decisions` &&
        request.params.get('cursor') === history.items[0]?.id,
    );
    historyRequest.flush(history);
    await expect(decisions).resolves.toMatchObject({ items: [{ status: 'blocked' }] });

    const observations = api.evidence('acme', 'checkout', candidateId);
    await Promise.resolve();
    const evidenceRequest = http.expectOne(
      (request) =>
        request.url === '/api/v1/projects/checkout/evidence' &&
        request.params.get('candidateId') === candidateId,
    );
    expect(evidenceRequest.request.params.get('currentOnly')).toBe('false');
    expect(evidenceRequest.request.params.get('limit')).toBe('100');
    evidenceRequest.flush(evidence);
    await expect(observations).resolves.toMatchObject({ candidateRevision: 12 });
  });

  it('loads published policies and assigns one idempotently', async () => {
    const api = TestBed.inject(ReadinessApi);
    const http = TestBed.inject(HttpTestingController);
    const policies = api.policies('acme', 'checkout');
    await Promise.resolve();
    http
      .expectOne((request) => {
        return (
          request.url === '/api/v1/projects/checkout/release-policies' &&
          request.params.get('limit') === '100'
        );
      })
      .flush(policyList);
    await expect(policies).resolves.toMatchObject({ items: [{ name: 'Production promotion' }] });

    const detail = api.policy('acme', 'checkout', policyId);
    await Promise.resolve();
    http.expectOne(`/api/v1/projects/checkout/release-policies/${policyId}`).flush(policy);
    await expect(detail).resolves.toMatchObject({ policy: { versions: [{ version: 3 }] } });

    const assignment = api.assignPolicy(
      'acme',
      'checkout',
      candidateId,
      policyId,
      'policy-browser-retry',
    );
    await Promise.resolve();
    const assignRequest = http.expectOne(
      `/api/v1/projects/checkout/candidates/${candidateId}/readiness-policy`,
    );
    expect(assignRequest.request.method).toBe('PUT');
    expect(assignRequest.request.body).toEqual({ policyId });
    expect(assignRequest.request.headers.get('Idempotency-Key')).toBe('policy-browser-retry');
    assignRequest.flush({ assignment: readiness.assignment });
    await expect(assignment).resolves.toMatchObject({ assignment: { policy: { id: policyId } } });
  });
});
