import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accessibilityReviewRequestSchema,
  type AccessibilityReviewRequest,
} from '@caselog/schemas';
import { releaseEditFixture } from '../../../releases/tests/support/release-edit.fixture';
import { runQueuedJobs } from '../../../core/jobs/tests/support/manual-pg-boss';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';

const dimensions = {
  testRunRole: 'required' as const,
  accessibilityStandard: 'WCAG 2.2 AA',
  pageUrls: ['https://example.com/checkout'],
  manualChecks: ['keyboard_navigation' as const, 'screen_reader' as const],
};
describe('manual accessibility reviews', () => {
  let fixture: Awaited<ReturnType<typeof releaseEditFixture>>;
  let candidateId = '';
  let reportId = '';
  let observationId = '';
  let firstDecisionId = '';
  const project = '/api/v1/projects/checkout';
  const url = () => `${project}/candidates/${candidateId}/accessibility-reviews`;
  beforeAll(async () => {
    fixture = await releaseEditFixture();
    const release = await fixture.createRelease();
    const candidate = await send(`${project}/releases/${release.id}/candidates`, {
      sourceRevision: randomUUID(),
    });
    expect(candidate.statusCode, candidate.body).toBe(201);
    candidateId = candidate.json().candidate.id;
    const created = await send(`${project}/release-policies`, {
      key: 'manual-accessibility',
      name: 'Manual accessibility',
      gates: [
        {
          key: 'accessibility',
          metricKey: 'accessibility.manual_review',
          metricVersion: '1.0.0',
          dimensions,
          operator: 'eq',
          expected: { type: 'integer', value: 1 },
          impact: 'blocking',
          missingEvidenceBehavior: 'block',
          staleEvidenceBehavior: 'block',
          minimumTrust: 'authenticated',
        },
      ],
    });
    expect(created.statusCode, created.body).toBe(201);
    const policyId = created.json().policy.id;
    expect((await send(`${project}/release-policies/${policyId}/publish`, {})).statusCode).toBe(
      201,
    );
    const assigned = await fixture.app.inject({
      method: 'PUT',
      url: `${project}/candidates/${candidateId}/readiness-policy`,
      headers: { ...fixture.headers, 'idempotency-key': randomUUID() },
      payload: { policyId },
    });
    expect(assigned.statusCode, assigned.body).toBe(200);
  });
  afterAll(async () => {
    if (!fixture) return;
    const where = { organizationId: fixture.organizationId };
    const admin = fixture.admin;
    const blobs = await admin.attachmentBlob.findMany({ where });
    const uploads = await admin.uploadSession.findMany({ where });
    await Promise.allSettled(
      [...blobs, ...uploads].map((item) =>
        fixture.app.get<StorageProvider>(STORAGE_PROVIDER).delete(item.storageKey),
      ),
    );
    await admin.attachment.deleteMany({ where });
    await admin.uploadSession.deleteMany({ where });
    await admin.attachmentBlob.deleteMany({ where });
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
    await fixture.cleanup();
  });
  function send(path: string, payload: object, key = randomUUID(), token?: string) {
    return fixture.app.inject({
      method: 'POST',
      url: path,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : fixture.headers),
        'idempotency-key': key,
      },
      payload,
    });
  }
  function review(expectedObservationId: string | null = null): AccessibilityReviewRequest {
    return {
      dimensions,
      outcome: 'ok',
      tools: ['Lighthouse 13', 'Deque axe 4.10', 'NVDA'],
      keyboardNavigation: 'passed',
      screenReader: 'passed',
      reportIds: [reportId],
      notes: 'Keyboard and screen reader review completed.',
      expectedObservationId,
    };
  }
  async function evaluate() {
    const path = `${project}/candidates/${candidateId}/readiness`;
    expect((await send(`${path}/evaluations`, {})).statusCode).toBe(201);
    await runQueuedJobs();
    const response = await fixture.app.inject({
      method: 'GET',
      url: path,
      headers: fixture.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().decision;
  }
  it('blocks missing reviews and accepts uploaded JSON reports with replay-safe completion', async () => {
    expect((await evaluate()).status).toBe('blocked');
    const body = Buffer.from(JSON.stringify({ tool: 'axe', violations: [] }));
    const created = await send(`${url()}/reports/uploads`, {
      fileName: 'axe-report.json',
      contentType: 'application/json',
      sizeBytes: body.length,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    });
    expect(created.statusCode, created.body).toBe(201);
    const upload = created.json().upload;
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
    expect(put.ok).toBe(true);
    const completed = await send(`${url()}/reports`, { uploadId: upload.id });
    expect(completed.statusCode, completed.body).toBe(201);
    reportId = completed.json().attachment.id;
    expect((await send(`${url()}/reports`, { uploadId: upload.id })).json().attachment.id).toBe(
      reportId,
    );
    const downloaded = await send(`${url()}/reports/${reportId}/download`, {});
    expect(downloaded.statusCode).toBe(201);
    const response = await fetch(downloaded.json().download.url);
    expect(await response.text()).toBe(body.toString());
    expect(response.headers.get('content-disposition')).toContain('attachment');
  });
  it('rejects incomplete uploads and storage rejects a mismatched checksum', async () => {
    const payload = Buffer.from('actual report');
    const created = await send(`${url()}/reports/uploads`, {
      fileName: 'bad-report.txt',
      contentType: 'text/plain',
      sizeBytes: payload.length,
      checksumSha256: 'a'.repeat(64),
    });
    expect(created.statusCode, created.body).toBe(201);
    const upload = created.json().upload;
    const missing = await send(`${url()}/reports`, { uploadId: upload.id });
    expect(missing.statusCode, missing.body).toBe(409);
    const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: payload });
    expect(put.ok).toBe(false);
    const mismatch = await send(`${url()}/reports`, { uploadId: upload.id });
    expect(mismatch.statusCode, mismatch.body).toBe(409);
    expect(
      await fixture.admin.attachment.count({
        where: { organizationId: fixture.organizationId, id: upload.id },
      }),
    ).toBe(0);
  });
  it('records a human OK result, preserves audit and replays without another revision', async () => {
    const key = randomUUID();
    const request = { ...review(), notes: 'A'.repeat(2000) };
    const created = await send(url(), request, key);
    expect(created.statusCode, created.body).toBe(201);
    const observation = created.json().observation;
    observationId = observation.id;
    expect(observation.details).toMatchObject({
      outcome: 'ok',
      reviewerName: 'Release editor',
      notes: request.notes,
      tools: request.tools,
      reportIds: [reportId],
    });
    expect(observation.expiresAt).toBeNull();
    const replay = await send(url(), request, key);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toMatchObject({
      replayed: true,
      candidateRevision: created.json().candidateRevision,
      observation: { id: observationId },
    });
    expect(
      await fixture.admin.auditLog.count({
        where: { organizationId: fixture.organizationId, action: 'accessibility_review.recorded' },
      }),
    ).toBe(1);
    const decision = await evaluate();
    expect(decision.status).toBe('ready');
    firstDecisionId = decision.id;
    expect(decision.gates[0].selectedObservationId).toBe(observationId);
  });
  it('requires reports, passed mandatory checks and the manual endpoint', async () => {
    expect(accessibilityReviewRequestSchema.safeParse({ ...review(), reportIds: [] }).success).toBe(
      false,
    );
    expect(
      (await send(url(), { ...review(observationId), keyboardNavigation: 'not_checked' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await send(url(), { ...review(observationId), reportIds: [randomUUID()] })).statusCode,
    ).toBe(404);
    const direct = await send(`${project}/evidence`, {
      candidateId,
      metricKey: 'accessibility.manual_review',
      metricVersion: '1.0.0',
      dimensions,
      state: 'available',
      value: { type: 'integer', value: 1 },
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      source: { type: 'pretend', id: 'review', revision: '1' },
      details: {},
    });
    expect(direct.statusCode, direct.body).toBe(400);
  });
  it('rejects stale/concurrent edits and preserves historical decisions after a Not OK correction', async () => {
    const request = { ...review(observationId), outcome: 'not_ok', keyboardNavigation: 'failed' };
    const corrected = await send(url(), request);
    expect(corrected.statusCode, corrected.body).toBe(201);
    expect(corrected.json().observation.supersedesObservationId).toBe(observationId);
    const stale = await send(url(), review(observationId));
    expect(stale.statusCode, stale.body).toBe(409);
    expect((await evaluate()).status).toBe('blocked');
    const historical = await fixture.admin.readinessDecision.findFirstOrThrow({
      where: { organizationId: fixture.organizationId, id: firstDecisionId },
    });
    expect(historical.status).toBe('READY');
    const expectedId = corrected.json().observation.id;
    const concurrent = await Promise.all([
      send(url(), review(expectedId)),
      send(url(), review(expectedId)),
    ]);
    expect(concurrent.map((item) => item.statusCode).sort()).toEqual([201, 409]);
  });
  it('lets another lead supersede the current review while keeping one current result', async () => {
    const current = await fixture.admin.currentEvidenceObservation.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        candidateId,
        metricKey: 'accessibility.manual_review',
      },
    });
    const token = await fixture.issueToken('LEAD');
    const response = await send(
      url(),
      { ...review(current.observationId), outcome: 'not_ok' },
      randomUUID(),
      token,
    );
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().observation.supersedesObservationId).toBe(current.observationId);
    expect(
      await fixture.admin.currentEvidenceObservation.count({
        where: {
          organizationId: fixture.organizationId,
          candidateId,
          metricKey: 'accessibility.manual_review',
        },
      }),
    ).toBe(1);
  });
  it('enforces role, tenant, project, candidate and report boundaries through API and RLS', async () => {
    const automation = await send('/api/v1/api-tokens', {
      name: 'Accessibility automation boundary',
      scopes: ['evidence:write'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(automation.statusCode).toBe(201);
    const automationDenied = await send(url(), review(), randomUUID(), automation.json().token);
    expect(automationDenied.statusCode).toBe(403);
    expect((await send(url(), review(), randomUUID(), fixture.readerToken)).statusCode).toBe(403);
    expect((await send(url().replace('/checkout/', '/other/'), review())).statusCode).toBe(404);
    const missing = randomUUID();
    expect((await send(url().replace(candidateId, missing), review())).statusCode).toBe(404);
    const release = await fixture.createRelease();
    const another = await send(`${project}/releases/${release.id}/candidates`, {
      sourceRevision: randomUUID(),
    });
    expect(
      (await send(url().replace(candidateId, another.json().candidate.id), review())).statusCode,
    ).toBe(404);
    const tenant = fixture.app.get(TenantDatabaseService);
    const foreignRelease = await fixture.admin.release.findFirstOrThrow({
      where: { id: fixture.foreignRelease.id },
    });
    const foreignCandidate = await fixture.admin.releaseCandidate.create({
      data: {
        organizationId: foreignRelease.organizationId,
        projectId: foreignRelease.projectId,
        releaseId: foreignRelease.id,
        sequence: 1,
        identityHash: 'f'.repeat(64),
        sourceRevision: randomUUID(),
      },
    });
    expect((await send(url().replace(candidateId, foreignCandidate.id), review())).statusCode).toBe(
      404,
    );
    expect(
      (
        await send(
          `${url().replace(candidateId, foreignCandidate.id)}/reports/${reportId}/download`,
          {},
        )
      ).statusCode,
    ).toBe(404);
    const foreignOrg = foreignRelease.organizationId;
    const invisible = await tenant.run(foreignOrg, (transaction) =>
      transaction.attachment.count({
        where: { organizationId: fixture.organizationId, id: reportId },
      }),
    );
    expect(invisible).toBe(0);
  });
});
