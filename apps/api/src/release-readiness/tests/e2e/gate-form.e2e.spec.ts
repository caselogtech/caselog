import { ReadinessEvaluationRequestService } from '../../application/services/readiness-evaluation-request.service';
import { ReadinessEventConsumerService } from '../../application/services/readiness-event-consumer.service';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { releaseEditFixture } from '../../../releases/tests/support/release-edit.fixture';
import { runQueuedJobs } from '../../../core/jobs/tests/support/manual-pg-boss';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import { formGateInput, qualityAnswers } from '../support/gate-form.fixture';

describe('candidate gate forms', () => {
  let fixture: Awaited<ReturnType<typeof releaseEditFixture>>;
  let candidateId = '';
  let gateId = '';
  let policyId = '';
  let observationId = '';
  let firstDecisionId = '';
  let reportId = '';
  const project = '/api/v1/projects/checkout';
  const base = () => `${project}/candidates/${candidateId}/gate-forms`;
  const url = () => `${base()}/${gateId}/responses`;
  beforeAll(async () => {
    fixture = await releaseEditFixture();
    const release = await fixture.createRelease();
    const candidate = await send(`${project}/releases/${release.id}/candidates`, {
      sourceRevision: randomUUID(),
    });
    expect(candidate.statusCode, candidate.body).toBe(201);
    candidateId = candidate.json().candidate.id;
    const created = await send(`${project}/release-policies`, {
      key: 'custom-review',
      name: 'Custom review',
      gates: [formGateInput],
    });
    expect(created.statusCode, created.body).toBe(201);
    policyId = created.json().policy.id;
    gateId = created.json().policy.versions[0].gates[0].id;
    expect((await send(`${project}/release-policies/${policyId}/publish`, {})).statusCode).toBe(
      201,
    );
    await assign();
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
  async function assign() {
    const result = await fixture.app.inject({
      method: 'PUT',
      url: `${project}/candidates/${candidateId}/readiness-policy`,
      headers: { ...fixture.headers, 'idempotency-key': randomUUID() },
      payload: { policyId },
    });
    expect(result.statusCode, result.body).toBe(200);
  }
  async function evaluate() {
    const path = `${project}/candidates/${candidateId}/readiness`;
    expect((await send(`${path}/evaluations`, {})).statusCode).toBe(201);
    await runQueuedJobs();
    const result = await fixture.app.inject({ method: 'GET', url: path, headers: fixture.headers });
    expect(result.statusCode, result.body).toBe(200);
    return result.json().decision;
  }
  function values(keyboard = true, score = 92) {
    return { ...qualityAnswers, keyboard, score, ...(reportId ? { reports: [reportId] } : {}) };
  }
  it('blocks missing responses and rejects incomplete or wrongly typed forms', async () => {
    const decision = await evaluate();
    expect(decision.status).toBe('blocked');
    firstDecisionId = decision.id;
    for (const answers of [
      { keyboard: true },
      { ...values(), score: '92' },
      { ...values(), extra: true },
    ]) {
      expect((await send(url(), { values: answers, expectedObservationId: null })).statusCode).toBe(
        400,
      );
    }
    const rejected = await send(`${project}/evidence`, {
      candidateId,
      metricKey: 'gate.form_response',
      metricVersion: '1.0.0',
      state: 'available',
      dimensions: { testRunRole: 'required', gateId },
      value: { type: 'integer', value: 1 },
      observedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      source: { type: 'gate_form', id: 'forged', revision: '1', url: null },
    });
    expect(rejected.statusCode).toBe(400);
    const recorded = await send(url(), { values: values(false), expectedObservationId: null });
    expect(recorded.statusCode, recorded.body).toBe(201);
    observationId = recorded.json().observation.id;
    const failed = await evaluate();
    expect(failed.status).toBe('blocked');
    expect(failed.gates[0].criteria[1]).toMatchObject({
      result: 'failed',
      actual: 'false',
      observationId,
    });
  });
  it('attaches candidate-bound reports and records a passing response without rewriting history', async () => {
    const body = Buffer.from(JSON.stringify({ tool: 'axe', violations: [] }));
    const uploadResponse = await send(`${base()}/reports/uploads`, {
      fileName: 'quality-report.json',
      contentType: 'application/json',
      sizeBytes: body.length,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    });
    expect(uploadResponse.statusCode, uploadResponse.body).toBe(201);
    const upload = uploadResponse.json().upload;
    expect((await fetch(upload.url, { method: 'PUT', headers: upload.headers, body })).ok).toBe(
      true,
    );
    const completed = await send(`${base()}/reports`, { uploadId: upload.id });
    expect(completed.statusCode, completed.body).toBe(201);
    reportId = completed.json().attachment.id;
    const key = randomUUID();
    const request = { values: values(), expectedObservationId: observationId };
    const recorded = await send(url(), request, key);
    expect(recorded.statusCode, recorded.body).toBe(201);
    observationId = recorded.json().observation.id;
    expect((await send(url(), request, key)).json().observation.id).toBe(observationId);
    expect((await send(url(), { ...request, values: values(true, 95) }, key)).statusCode).toBe(409);
    expect(recorded.json().observation.details).toMatchObject({
      kind: 'gate_form_response',
      reports: [{ id: reportId, fileName: 'quality-report.json' }],
      values: { standard: 'WCAG 2.2 AA' },
    });
    await runQueuedJobs();
    const ready = (
      await fixture.app.inject({
        method: 'GET',
        url: `${project}/candidates/${candidateId}/readiness`,
        headers: fixture.headers,
      })
    ).json().decision;
    expect(ready.status).toBe('ready');
    expect(ready.gates[0].form.name).toBe(formGateInput.form?.name);
    const historical = await fixture.app.inject({
      method: 'GET',
      url: `${project}/readiness-decisions/${firstDecisionId}`,
      headers: fixture.headers,
    });
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json().decision.status).toBe('blocked');
    const download = await send(`${base()}/reports/${reportId}/download`, {});
    expect(download.statusCode, download.body).toBe(201);
    const result = await fetch(download.json().download.url);
    expect(result.headers.get('content-disposition')).toContain('attachment');
    expect(await result.text()).toBe(body.toString());
  });
  it('allows one concurrent correction across reviewers and preserves the replaced response', async () => {
    const lead = await fixture.issueToken('LEAD');
    const results = await Promise.all([
      send(url(), { values: values(true, 93), expectedObservationId: observationId }),
      send(
        url(),
        { values: values(true, 94), expectedObservationId: observationId },
        randomUUID(),
        lead,
      ),
    ]);
    expect(results.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    const success = results.find(({ statusCode }) => statusCode === 201);
    observationId = success?.json().observation.id;
    const current = await fixture.app.inject({
      method: 'GET',
      url: `${project}/evidence?candidateId=${candidateId}&metricKey=gate.form_response&gateId=${gateId}&currentOnly=true`,
      headers: fixture.headers,
    });
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json().items.map((item: { id: string }) => item.id)).toEqual([observationId]);
    const history = await fixture.app.inject({
      method: 'GET',
      url: `${project}/evidence?candidateId=${candidateId}&gateId=${gateId}&currentOnly=false&limit=1`,
      headers: fixture.headers,
    });
    expect(history.json().nextCursor).toBeTruthy();
    const next = await fixture.app.inject({
      method: 'GET',
      url: `${project}/evidence?candidateId=${candidateId}&gateId=${gateId}&currentOnly=false&limit=1&cursor=${history.json().nextCursor}`,
      headers: fixture.headers,
    });
    expect(next.json().items[0].id).not.toBe(observationId);
  });
  it('preserves accepted responses when enqueue fails and recovers through the durable revision event', async () => {
    const enqueue = vi
      .spyOn(fixture.app.get(ReadinessEvaluationRequestService), 'request')
      .mockRejectedValueOnce(new Error('Queue unavailable'));
    const response = await send(url(), {
      values: values(true, 94),
      expectedObservationId: observationId,
    });
    enqueue.mockRestore();
    expect(response.statusCode, response.body).toBe(201);
    observationId = response.json().observation.id;
    await fixture.app.get(ReadinessEventConsumerService).processBatch(fixture.organizationId, 100);
    await runQueuedJobs();
    const current = await fixture.app.inject({
      method: 'GET',
      url: `${project}/candidates/${candidateId}/readiness`,
      headers: fixture.headers,
    });
    expect(current.json()).toMatchObject({ state: 'current', decision: { status: 'ready' } });
  });
  it('enforces role, project, tenant, gate and report boundaries', async () => {
    const body = { values: values(), expectedObservationId: observationId };
    const automation = await send('/api/v1/api-tokens', {
      name: 'Gate form automation boundary',
      scopes: ['evidence:write'],
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(automation.statusCode).toBe(201);
    expect((await send(url(), body, randomUUID(), automation.json().token)).statusCode).toBe(403);
    const release = await fixture.createRelease();
    const other = await send(`${project}/releases/${release.id}/candidates`, {
      sourceRevision: randomUUID(),
    });
    const anotherId: string = other.json().candidate.id;
    const assigned = await fixture.app.inject({
      method: 'PUT',
      url: `${project}/candidates/${anotherId}/readiness-policy`,
      headers: { ...fixture.headers, 'idempotency-key': randomUUID() },
      payload: { policyId },
    });
    expect(assigned.statusCode).toBe(200);
    expect(
      (await send(url().replace(candidateId, anotherId), { ...body, expectedObservationId: null }))
        .statusCode,
    ).toBe(404);

    expect((await send(url(), body, randomUUID(), fixture.readerToken)).statusCode).toBe(403);
    expect((await send(url().replace('/checkout/', '/other/'), body)).statusCode).toBe(404);
    expect((await send(url().replace(gateId, randomUUID()), body)).statusCode).toBe(404);
    expect(
      (await send(url(), { ...body, values: { ...values(), reports: [randomUUID()] } })).statusCode,
    ).toBe(404);
    const foreignRelease = await fixture.admin.release.findFirstOrThrow({
      where: { id: fixture.foreignRelease.id },
    });
    const foreign = await fixture.admin.releaseCandidate.create({
      data: {
        organizationId: foreignRelease.organizationId,
        projectId: foreignRelease.projectId,
        releaseId: fixture.foreignRelease.id,
        sourceRevision: randomUUID(),
        identityHash: randomUUID(),
        sequence: 1,
      },
    });
    expect((await send(url().replace(candidateId, foreign.id), body)).statusCode).toBe(404);
    const rows = await fixture.app
      .get(TenantDatabaseService)
      .run(foreign.organizationId, (transaction) =>
        transaction.readinessGate.findMany({ where: { organizationId: fixture.organizationId } }),
      );
    expect(rows).toEqual([]);
  });
  it('keeps published form definitions immutable and requires a new response for a successor', async () => {
    const path = `${project}/release-policies/${policyId}`;
    const old = (
      await fixture.app.inject({ method: 'GET', url: path, headers: fixture.headers })
    ).json().policy;
    const published = old.versions.find(
      (version: { state: string }) => version.state === 'published',
    );
    const form = formGateInput.form;
    if (!form) throw new Error('Missing form');
    const changed = await fixture.app.inject({
      method: 'PUT',
      url: `${path}/draft`,
      headers: { ...fixture.headers, 'idempotency-key': randomUUID() },
      payload: {
        name: old.name,
        description: old.description,
        expectedDraftId: null,
        expectedUpdatedAt: old.updatedAt,
        gates: [
          {
            ...formGateInput,
            form: {
              ...form,
              name: 'Stricter review',
              criteria: [{ type: 'number', fieldKey: 'score', operator: 'gte', expected: 95 }],
            },
          },
        ],
      },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(
      changed
        .json()
        .policy.versions.find((version: { state: string }) => version.state === 'published'),
    ).toEqual(published);
    const publication = await send(`${path}/publish`, {});
    expect(publication.statusCode, publication.body).toBe(201);
    const nextGateId = publication
      .json()
      .policy.versions.find((version: { state: string }) => version.state === 'published')
      .gates[0].id;
    await assign();
    expect((await evaluate()).status).toBe('blocked');
    expect(
      (await send(url(), { values: values(true, 96), expectedObservationId: observationId }))
        .statusCode,
    ).toBe(404);
    gateId = nextGateId;
    const response = await send(url(), { values: values(true, 96), expectedObservationId: null });
    expect(response.statusCode, response.body).toBe(201);
    expect((await evaluate()).status).toBe('ready');
    const audit = await fixture.admin.auditLog.count({
      where: { organizationId: fixture.organizationId, action: 'gate_form.recorded' },
    });
    expect(audit).toBe(5);
  });
});
