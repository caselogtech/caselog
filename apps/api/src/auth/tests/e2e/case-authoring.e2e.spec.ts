import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createTestCaseResponseSchema, testCaseDetailResponseSchema } from '@caselog/schemas';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import {
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
  type AuthoringFixture,
} from '../support/authoring.e2e-fixture';

describe('scoped agent case authoring', () => {
  let fixture: AuthoringFixture;
  let token: string;
  let tokenId: string;
  beforeAll(async () => {
    fixture = await createAuthoringFixture();
    const issued = await issueAuthoringToken(fixture, [
      'projects:read',
      'cases:read',
      'cases:write',
    ]);
    token = issued.token;
    tokenId = issued.apiToken.id;
  });
  afterAll(async () => destroyAuthoringFixture(fixture));

  function headers(key?: string, credential = token) {
    return { authorization: `Bearer ${credential}`, ...(key ? { 'idempotency-key': key } : {}) };
  }
  function payload(sectionId = fixture.sectionId) {
    return {
      sectionId,
      title: 'Declined payment',
      template: 'steps',
      content: {
        steps: [{ action: 'Pay using a declined card', expected: 'Order remains unpaid' }],
      },
    };
  }
  function create(key: string, body = payload()) {
    return fixture.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${fixture.projectSlug}/cases`,
      headers: headers(key),
      payload: body,
    });
  }

  it('discovers only workspace projects and reads their structure', async () => {
    const projects = await fixture.app.inject({
      method: 'GET',
      url: '/api/v1/projects?limit=1',
      headers: headers(),
    });
    expect(projects.statusCode).toBe(200);
    expect(projects.json().items.map((project: { id: string }) => project.id)).toEqual([
      fixture.projectId,
    ]);
    const structure = await fixture.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${fixture.projectSlug}/structure`,
      headers: headers(),
    });
    expect(structure.statusCode, structure.body).toBe(200);
    expect(structure.body).toContain(fixture.sectionId);
    expect(structure.body).not.toContain(fixture.foreignSectionId);
  });

  it('creates all four templates and preserves the original response on concurrent retries', async () => {
    const key = randomUUID();
    const responses = await Promise.all([create(key), create(key), create(key)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(201);
    const original = createTestCaseResponseSchema.parse(responses[0]?.json());
    for (const response of responses) expect(response.json()).toEqual(original);
    expect(
      await fixture.admin.testCaseVersion.count({
        where: { organizationId: fixture.organizationId, testCaseId: original.testCase.id },
      }),
    ).toBe(1);
    const audit = await fixture.admin.auditLog.findMany({
      where: { organizationId: fixture.organizationId, targetId: original.testCase.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'api_token',
      actorId: tokenId,
      action: 'test_case.created',
    });
    expect(JSON.stringify(audit)).not.toContain(token);
    for (const [template, content] of [
      ['text', { text: 'Check payment behavior' }],
      ['exploratory', { charter: 'Explore payment recovery' }],
      ['bdd', { gherkin: 'Feature: Payments\nScenario: Declined card\nGiven a declined card' }],
    ]) {
      const response = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${fixture.projectSlug}/cases`,
        headers: headers(randomUUID()),
        payload: { ...payload(), template, content },
      });
      expect(response.statusCode, response.body).toBe(201);
    }
  });

  it('conflicts on changed payloads and replays updates before checking their now-stale base', async () => {
    const key = randomUUID();
    const created = createTestCaseResponseSchema.parse((await create(key)).json());
    const conflict = await create(key, { ...payload(), title: 'Different intent' });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('idempotency_key_reused');
    const updateKey = randomUUID();
    const update = { ...payload(), title: 'Revised payment', baseVersion: 1 };
    const url = `/api/v1/projects/${fixture.projectSlug}/cases/${created.testCase.id}`;
    const updates = await Promise.all(
      [1, 2].map(() =>
        fixture.app.inject({ method: 'PUT', url, headers: headers(updateKey), payload: update }),
      ),
    );
    expect(updates[0]?.statusCode, updates[0]?.body).toBe(200);
    expect(updates[1]?.json()).toEqual(updates[0]?.json());
    expect(updates[0]?.json().version.version).toBe(2);
    const stale = await fixture.app.inject({
      method: 'PUT',
      url,
      headers: headers(randomUUID()),
      payload: update,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('case_version_conflict');
    const detail = await fixture.app.inject({ method: 'GET', url, headers: headers() });
    const caseDetail = testCaseDetailResponseSchema.parse(detail.json());
    expect(caseDetail.testCase.versions.map(({ version }) => version)).toEqual([2, 1]);
    expect(caseDetail.testCase.currentVersion.title).toBe('Revised payment');
    expect(
      await fixture.admin.auditLog.count({
        where: {
          organizationId: fixture.organizationId,
          targetId: created.testCase.id,
          action: 'test_case.updated',
        },
      }),
    ).toBe(1);
  });

  it('does not consume keys for invalid requests or foreign sections', async () => {
    const key = randomUUID();
    const invalid = await create(key, { ...payload(), title: '' });
    expect(invalid.statusCode).toBe(400);
    const foreign = await create(key, payload(fixture.foreignSectionId));
    expect(foreign.statusCode).toBe(404);
    expect((await create(key)).statusCode).toBe(201);
  });

  it('isolates foreign resources at API, repository and RLS boundaries', async () => {
    const url = `/api/v1/projects/${fixture.projectSlug}/cases/${fixture.foreignCaseId}`;
    const response = await fixture.app.inject({ method: 'GET', url, headers: headers() });
    expect(response.statusCode).toBe(404);
    const update = await fixture.app.inject({
      method: 'PUT',
      url,
      headers: headers(randomUUID()),
      payload: { ...payload(), baseVersion: 1 },
    });
    expect(update.statusCode).toBe(404);
    const rows = await runInTenant(
      fixture.application,
      fixture.organizationId,
      (tx) =>
        tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM test_cases WHERE id = ${fixture.foreignCaseId}::uuid`,
    );
    expect(rows).toEqual([]);
  });

  it('requires write keys for tokens while keeping browser creation compatible', async () => {
    const url = `/api/v1/projects/${fixture.projectSlug}/cases`;
    const missing = await fixture.app.inject({
      method: 'POST',
      url,
      headers: headers(),
      payload: payload(),
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('idempotency_key_required');
    const browser = await fixture.app.inject({
      method: 'POST',
      url,
      headers: headers(undefined, fixture.ownerToken),
      payload: payload(),
    });
    expect(browser.statusCode, browser.body).toBe(201);
  });

  it('does not grant authoring to CI/read tokens or token administration to authors', async () => {
    const reader = await issueAuthoringToken(fixture, ['cases:read']);
    const ci = await issueAuthoringToken(fixture, ['results:write', 'readiness:write']);
    for (const credential of [reader.token, ci.token]) {
      const denied = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${fixture.projectSlug}/cases`,
        headers: headers(randomUUID(), credential),
        payload: payload(),
      });
      expect(denied.statusCode).toBe(403);
    }
    for (const url of ['/api/v1/api-tokens', '/api/v1/audit-logs']) {
      expect(
        (await fixture.app.inject({ method: 'GET', url, headers: headers() })).statusCode,
      ).toBe(403);
    }
  });

  it('enforces current membership role, expiry and revocation on subsequent requests', async () => {
    const membership = {
      organizationId_userId: { organizationId: fixture.organizationId, userId: fixture.ownerId },
    };
    await fixture.admin.membership.update({ where: membership, data: { role: 'READ_ONLY' } });
    try {
      expect((await create(randomUUID())).statusCode).toBe(403);
    } finally {
      await fixture.admin.membership.update({ where: membership, data: { role: 'OWNER' } });
    }
    const expired = await issueAuthoringToken(fixture, ['projects:read']);
    await fixture.admin.apiToken.update({
      where: {
        organizationId_id: { organizationId: fixture.organizationId, id: expired.apiToken.id },
      },
      data: {
        createdAt: new Date(Date.now() - 86_400_000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(
      (
        await fixture.app.inject({
          method: 'GET',
          url: '/api/v1/projects',
          headers: headers(undefined, expired.token),
        })
      ).statusCode,
    ).toBe(401);
    await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/api-tokens/${tokenId}`,
      headers: headers(undefined, fixture.ownerToken),
    });
    expect((await create(randomUUID())).statusCode).toBe(401);
  });
});
