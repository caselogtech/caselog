import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WorkspaceAccess } from '../../../workspace/public-api';
import { ReadinessApi } from '../../data-access/readiness-api';
import {
  candidateId,
  decisionDetail,
  decisionId,
  evidence,
  history,
  policy,
  policyId,
  policyList,
  readiness,
  releaseDetail,
  releaseId,
  waiverId,
  waiverList,
  waiverResponse,
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

  it('creates, versions, and publishes policies idempotently', async () => {
    const api = TestBed.inject(ReadinessApi);
    const http = TestBed.inject(HttpTestingController);
    const baseUrl = '/api/v1/projects/checkout/release-policies';
    const gate = {
      key: 'required-pass-rate',
      metricKey: 'test.pass_rate' as const,
      metricVersion: '1.0.0' as const,
      dimensions: { testRunRole: 'required' as const },
      operator: 'gte' as const,
      expected: { type: 'percentage' as const, value: '98' },
      impact: 'blocking' as const,
      missingEvidenceBehavior: 'block' as const,
      staleEvidenceBehavior: 'unknown' as const,
      minimumTrust: 'authenticated' as const,
    };

    const created = api.createPolicy(
      'acme',
      'checkout',
      {
        key: 'production',
        name: 'Production promotion',
        description: null,
        gates: [gate],
      },
      'policy-create-retry',
    );
    await Promise.resolve();
    const createRequest = http.expectOne(baseUrl);
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.headers.get('Idempotency-Key')).toBe('policy-create-retry');
    expect(createRequest.request.body.gates).toEqual([gate]);
    createRequest.flush(policy);
    await expect(created).resolves.toMatchObject({ policy: { id: policyId } });

    const versioned = api.createPolicyVersion(
      'acme',
      'checkout',
      policyId,
      { gates: [gate] },
      'policy-version-retry',
    );
    await Promise.resolve();
    const versionRequest = http.expectOne(`${baseUrl}/${policyId}/versions`);
    expect(versionRequest.request.method).toBe('POST');
    expect(versionRequest.request.headers.get('Idempotency-Key')).toBe('policy-version-retry');
    versionRequest.flush(policy);
    await expect(versioned).resolves.toMatchObject({ policy: { id: policyId } });

    const published = api.publishPolicy('acme', 'checkout', policyId, 'policy-publish-retry');
    await Promise.resolve();
    const publishRequest = http.expectOne(`${baseUrl}/${policyId}/publish`);
    expect(publishRequest.request.method).toBe('POST');
    expect(publishRequest.request.body).toEqual({});
    expect(publishRequest.request.headers.get('Idempotency-Key')).toBe('policy-publish-retry');
    publishRequest.flush(policy);
    await expect(published).resolves.toMatchObject({ policy: { id: policyId } });
  });

  it('loads an exact decision and creates, lists, and revokes waivers idempotently', async () => {
    const api = TestBed.inject(ReadinessApi);
    const http = TestBed.inject(HttpTestingController);
    const baseUrl = `/api/v1/projects/checkout/readiness-decisions/${decisionId}`;

    const detail = api.decision('acme', 'checkout', decisionId);
    await Promise.resolve();
    http.expectOne(baseUrl).flush(decisionDetail);
    await expect(detail).resolves.toMatchObject({ decision: { policy: { id: policyId } } });

    const waivers = api.waivers('acme', 'checkout', decisionId);
    await Promise.resolve();
    const listRequest = http.expectOne(
      (request) => request.url === `${baseUrl}/waivers` && request.params.get('limit') === '25',
    );
    listRequest.flush(waiverList);
    await expect(waivers).resolves.toMatchObject({ items: [{ id: waiverId }] });

    const createRequest = {
      scope: { type: 'decision' as const },
      reason: 'Accepted risk',
      expiresAt: null,
      externalApprovalReference: null,
    };
    const created = api.createWaiver(
      'acme',
      'checkout',
      decisionId,
      createRequest,
      'waiver-create-retry',
    );
    await Promise.resolve();
    const createHttpRequest = http.expectOne(`${baseUrl}/waivers`);
    expect(createHttpRequest.request.method).toBe('POST');
    expect(createHttpRequest.request.headers.get('Idempotency-Key')).toBe('waiver-create-retry');
    expect(createHttpRequest.request.body).toEqual(createRequest);
    createHttpRequest.flush(waiverResponse);
    await expect(created).resolves.toMatchObject({ effectiveDisposition: 'approved_with_waiver' });

    const revoked = api.revokeWaiver(
      'acme',
      'checkout',
      decisionId,
      waiverId,
      { reason: 'Risk no longer accepted' },
      'waiver-revoke-retry',
    );
    await Promise.resolve();
    const revokeHttpRequest = http.expectOne(`${baseUrl}/waivers/${waiverId}/revocation`);
    expect(revokeHttpRequest.request.method).toBe('POST');
    expect(revokeHttpRequest.request.headers.get('Idempotency-Key')).toBe('waiver-revoke-retry');
    revokeHttpRequest.flush(waiverResponse);
    await expect(revoked).resolves.toMatchObject({ waiver: { id: waiverId } });
  });
});
