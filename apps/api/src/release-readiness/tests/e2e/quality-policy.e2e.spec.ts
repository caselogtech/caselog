import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  readinessPolicyResponseSchema,
  type ReadinessGateInput,
  type UpdateReadinessPolicyRequest,
} from '@caselog/schemas/readiness';
import { releaseEditFixture } from '../../../releases/tests/support/release-edit.fixture';
import { runQueuedJobs } from '../../../core/jobs/tests/support/manual-pg-boss';

describe('quality policy authoring and evidence', () => {
  let fixture: Awaited<ReturnType<typeof releaseEditFixture>>;
  let policyId = '';
  let candidateId = '';
  let producerKey = '';
  const base = '/api/v1/projects/checkout';
  beforeAll(async () => {
    fixture = await releaseEditFixture();
    producerKey = (
      await fixture.admin.membership.findFirstOrThrow({
        where: { organizationId: fixture.organizationId, role: 'OWNER' },
      })
    ).userId;
    const release = await fixture.createRelease();
    const response = await send('POST', `${base}/releases/${release.id}/candidates`, {
      sourceRevision: randomUUID(),
    });
    expect(response.statusCode, response.body).toBe(201);
    candidateId = response.json().candidate.id;
  });
  afterAll(async () => {
    if (!fixture) return;
    const where = { organizationId: fixture.organizationId };
    const admin = fixture.admin;
    await admin.currentReadinessDecision.deleteMany({ where });
    await admin.gateEvaluation.deleteMany({ where });
    await admin.readinessDecision.deleteMany({ where });
    await admin.currentCandidatePolicyAssignment.deleteMany({ where });
    await admin.candidatePolicyAssignment.deleteMany({ where });
    await admin.readinessGate.deleteMany({ where });
    await admin.releasePolicyVersion.deleteMany({ where });
    await admin.releasePolicy.deleteMany({ where });
    await admin.currentEvidenceObservation.deleteMany({ where });
    await admin.evidenceObservation.deleteMany({ where });
    await admin.evidenceProcessingIssue.deleteMany({ where });
    await admin.candidateEvidenceRevision.deleteMany({ where });
    await admin.evidenceProducer.deleteMany({ where });
    await admin.testCase.updateMany({ where, data: { currentVersionId: null } });
    await admin.testCaseVersion.deleteMany({ where });
    await admin.testCase.deleteMany({ where });
    await admin.section.deleteMany({ where });
    await admin.suite.deleteMany({ where });
    await fixture.cleanup();
  });
  function send(method: 'POST' | 'PUT' | 'GET', url: string, payload?: object, token?: string) {
    return fixture.app.inject({
      method,
      url,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : fixture.headers),
        'idempotency-key': randomUUID(),
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }
  function gates(): ReadinessGateInput[] {
    return [
      {
        key: 'wcag-automated',
        metricKey: 'accessibility.wcag22_aa_violations',
        expected: { type: 'integer', value: 0 },
        operator: 'eq' as const,
      },
      {
        key: 'wcag-manual',
        metricKey: 'accessibility.wcag22_aa_manual_review',
        expected: { type: 'integer', value: 1 },
        operator: 'eq' as const,
      },
      {
        key: 'lighthouse',
        metricKey: 'performance.lighthouse_score',
        expected: { type: 'percentage', value: '90' },
        operator: 'gte' as const,
      },
    ].map((gate) => ({
      ...gate,
      metricKey: gate.metricKey as ReadinessGateInput['metricKey'],
      expected: gate.expected as ReadinessGateInput['expected'],
      metricVersion: '1.0.0',
      producerKey,
      dimensions: {
        testRunRole: 'required',
        profile: 'production-v1',
        pageUrls: ['https://example.com/checkout'],
        toolVersion: 'pinned-v1',
        ...(gate.key === 'lighthouse' ? { device: 'mobile' as const, runsPerPage: 3 } : {}),
      },
      impact: 'blocking',
      missingEvidenceBehavior: 'block',
      staleEvidenceBehavior: 'block',
      minimumTrust: 'authenticated',
    }));
  }
  async function readPolicy() {
    const response = await send('GET', `${base}/release-policies/${policyId}`);
    expect(response.statusCode, response.body).toBe(200);
    return readinessPolicyResponseSchema.parse(response.json()).policy;
  }
  async function evaluate() {
    const url = `${base}/candidates/${candidateId}/readiness`;
    const response = await send('POST', `${url}/evaluations`);
    expect(response.statusCode, response.body).toBe(201);
    await runQueuedJobs();
    const current = await send('GET', url);
    expect(current.statusCode, current.body).toBe(200);
    return current.json();
  }
  function editRequest(
    policy: Awaited<ReturnType<typeof readPolicy>>,
  ): UpdateReadinessPolicyRequest {
    return {
      name: policy.name,
      description: policy.description,
      gates: gates(),
      expectedDraftId: policy.versions.find((version) => version.state === 'draft')?.id ?? null,
      expectedUpdatedAt: policy.updatedAt,
    };
  }
  it('versions priority and preserves it for omitted updates, restores and duplicates', async () => {
    const suite = await send('POST', `${base}/structure/suites`, { name: 'Scope tests' });
    expect(suite.statusCode, suite.body).toBe(201);
    const section = await send('POST', `${base}/structure/suites/${suite.json().id}/sections`, {
      name: 'Required',
    });
    expect(section.statusCode, section.body).toBe(201);
    const body = {
      sectionId: section.json().id,
      title: 'High priority case',
      priority: 'high',
      template: 'text',
      content: { text: 'Check release scope' },
    };
    const created = await send('POST', `${base}/cases`, body);
    expect(created.statusCode, created.body).toBe(201);
    const id = created.json().testCase.id;
    expect(created.json().testCase.priority).toBe('high');
    const { priority: _priority, ...withoutPriority } = body;
    const retained = await send('PUT', `${base}/cases/${id}`, {
      ...withoutPriority,
      baseVersion: 1,
    });
    expect(retained.statusCode, retained.body).toBe(200);
    expect(retained.json().testCase.priority).toBe('high');
    const changed = await send('PUT', `${base}/cases/${id}`, {
      ...body,
      priority: 'low',
      baseVersion: 2,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const restored = await send(
      'POST',
      `${base}/cases/${id}/versions/${created.json().version.id}/restore`,
      { baseVersion: 3 },
    );
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json().testCase.priority).toBe('high');
    const duplicate = await send('POST', `${base}/cases/${id}/duplicate`);
    expect(duplicate.statusCode, duplicate.body).toBe(201);
    const detail = await send('GET', `${base}/cases/${duplicate.json().testCase.id}`);
    expect(detail.json().testCase.currentVersion.priority).toBe('high');
    const invalid = await send('POST', `${base}/cases`, { ...body, priority: 'urgent' });
    expect(invalid.statusCode).toBe(400);
  });

  it('creates a quality policy, edits its draft, replays once and rejects stale or unauthorized writes', async () => {
    const created = await send('POST', `${base}/release-policies`, {
      key: 'production-readiness',
      name: 'Production readiness',
      gates: gates(),
    });
    expect(created.statusCode, created.body).toBe(201);
    policyId = readinessPolicyResponseSchema.parse(created.json()).policy.id;
    const policy = await readPolicy();
    const payload = { ...editRequest(policy), name: 'Reviewed production policy' };
    const response = await send('PUT', `${base}/release-policies/${policyId}/draft`, payload);
    expect(response.statusCode, response.body).toBe(200);
    const replay = await send('PUT', `${base}/release-policies/${policyId}/draft`, payload);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(response.json());
    const stale = await send('PUT', `${base}/release-policies/${policyId}/draft`, {
      ...payload,
      name: 'Stale overwrite',
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('release_policy_draft_changed');
    expect(
      (
        await send(
          'PUT',
          `${base}/release-policies/${policyId}/draft`,
          payload,
          fixture.readerToken,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await send('PUT', `/api/v1/projects/other/release-policies/${policyId}/draft`, payload))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await send('PUT', `${base}/release-policies/${policyId}/draft`, {
          ...payload,
          key: 'mutated',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await fixture.admin.auditLog.count({
        where: { organizationId: fixture.organizationId, action: 'release_policy.draft_saved' },
      }),
    ).toBe(1);
  });
  it('requires automated, manual and performance reports for the exact configured context', async () => {
    expect((await send('POST', `${base}/release-policies/${policyId}/publish`)).statusCode).toBe(
      201,
    );
    expect(
      (await send('PUT', `${base}/candidates/${candidateId}/readiness-policy`, { policyId }))
        .statusCode,
    ).toBe(200);
    expect((await evaluate()).decision.status).toBe('blocked');
    for (const gate of gates()) {
      const request = {
        candidateId,
        metricKey: gate.metricKey,
        metricVersion: '1.0.0',
        dimensions: gate.dimensions,
        value:
          gate.metricKey === 'performance.lighthouse_score'
            ? { type: 'percentage', value: '92' }
            : gate.expected,
        state: 'available',
        observedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        source: {
          type: 'ci-review',
          id: randomUUID(),
          revision: '1',
          url: 'https://example.com/reports/quality',
        },
        details:
          gate.metricKey === 'performance.lighthouse_score'
            ? { performanceSamples: [90, 92, 95] }
            : {},
      };
      if (gate.metricKey === 'performance.lighthouse_score') {
        const invalid = await send('POST', `${base}/evidence`, {
          ...request,
          value: { type: 'percentage', value: '100' },
        });
        expect(invalid.statusCode, invalid.body).toBe(400);
      }
      const response = await send('POST', `${base}/evidence`, request);
      expect(response.statusCode, response.body).toBe(201);
    }
    const current = await evaluate();
    expect(current.decision.status).toBe('ready');
    expect(current.decision.gates).toHaveLength(3);
    expect(
      current.decision.gates.every(
        (gate: { selectedObservationId: string | null }) => gate.selectedObservationId,
      ),
    ).toBe(true);
  });
  it('creates a successor when editing a published policy without changing assignments or decisions', async () => {
    const before = await readPolicy();
    const previousVersion = before.versions[0];
    const current = await send('GET', `${base}/candidates/${candidateId}/readiness`);
    const durable = await fixture.admin.readinessDecision.findMany({
      where: { organizationId: fixture.organizationId },
    });
    const payload = {
      ...editRequest(before),
      name: 'Successor policy',
      gates: gates().map((gate) =>
        gate.key === 'lighthouse'
          ? { ...gate, expected: { type: 'percentage' as const, value: '95' } }
          : gate,
      ),
    };
    const updated = await send('PUT', `${base}/release-policies/${policyId}/draft`, payload);
    expect(updated.statusCode, updated.body).toBe(200);
    const policy = readinessPolicyResponseSchema.parse(updated.json()).policy;
    expect(policy.versions).toHaveLength(2);
    expect(policy.versions.find((version) => version.state === 'published')).toEqual(
      previousVersion,
    );
    expect(
      (await send('PUT', `${base}/release-policies/${policyId}/draft`, payload)).statusCode,
    ).toBe(200);
    const draft = editRequest(policy);
    const responses = await Promise.all(
      ['First edit', 'Second edit'].map((name) =>
        send('PUT', `${base}/release-policies/${policyId}/draft`, { ...draft, name }),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const after = await send('GET', `${base}/candidates/${candidateId}/readiness`);
    expect(after.json().assignment.id).toBe(current.json().assignment.id);
    expect(after.json().decision).toMatchObject({
      id: current.json().decision.id,
      status: current.json().decision.status,
      policyVersion: current.json().decision.policyVersion,
      gates: current.json().decision.gates,
    });
    expect(
      await fixture.admin.readinessDecision.findMany({
        where: { organizationId: fixture.organizationId },
      }),
    ).toEqual(durable);
    const historical = await send(
      'GET',
      `${base}/readiness-decisions/${current.json().decision.id}`,
    );
    expect(historical.json().decision).toMatchObject({
      status: 'ready',
      policyVersion: { id: previousVersion?.id },
    });
  });

  it('rejects an editor left open across another client creating and publishing a successor', async () => {
    expect((await send('POST', `${base}/release-policies/${policyId}/publish`)).statusCode).toBe(
      201,
    );
    const before = await readPolicy();
    const stale = { ...editRequest(before), name: 'Old editor overwrite' };
    const created = await send('POST', `${base}/release-policies/${policyId}/versions`, {
      gates: gates(),
    });
    expect(created.statusCode, created.body).toBe(201);
    const draft = readinessPolicyResponseSchema.parse(created.json()).policy;
    expect(draft.updatedAt > before.updatedAt).toBe(true);
    const denied = await send('POST', `${base}/release-policies/${policyId}/publish`, {
      expectedDraftId: draft.versions.find((version) => version.state === 'draft')?.id,
      expectedUpdatedAt: before.updatedAt,
    });
    expect(denied.statusCode, denied.body).toBe(409);
    const published = await send('POST', `${base}/release-policies/${policyId}/publish`);
    expect(published.statusCode, published.body).toBe(201);
    expect(
      readinessPolicyResponseSchema.parse(published.json()).policy.updatedAt > draft.updatedAt,
    ).toBe(true);
    const result = await send('PUT', `${base}/release-policies/${policyId}/draft`, stale);
    expect(result.statusCode, result.body).toBe(409);
    expect(result.json().error.code).toBe('release_policy_draft_changed');
  });
});
