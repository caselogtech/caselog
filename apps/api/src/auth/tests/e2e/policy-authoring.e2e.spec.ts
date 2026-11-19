import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readinessPolicyResponseSchema } from '@caselog/schemas/readiness';
import {
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
  type AuthoringFixture,
} from '../support/authoring.e2e-fixture';

describe('scoped agent policy authoring', () => {
  let fixture: AuthoringFixture;
  let writer: string;
  let publisher: string;
  let publisherId: string;
  beforeAll(async () => {
    fixture = await createAuthoringFixture();
    writer = (await issueAuthoringToken(fixture, ['policies:read', 'policies:write'])).token;
    const issued = await issueAuthoringToken(fixture, ['policies:publish']);
    publisher = issued.token;
    publisherId = issued.apiToken.id;
  });
  afterAll(async () => destroyAuthoringFixture(fixture));
  function headers(token = writer, key = randomUUID()) {
    return { authorization: `Bearer ${token}`, 'idempotency-key': key };
  }
  function gates(value = 0) {
    return [
      {
        key: 'no-failures',
        metricKey: 'test.failed_count',
        metricVersion: '1.0.0',
        dimensions: { testRunRole: 'required' },
        operator: 'eq',
        expected: { type: 'integer', value },
        impact: 'blocking',
      },
    ];
  }
  function create(
    key = randomUUID(),
    body = { key: `policy-${randomUUID()}`, name: 'Agent quality policy', gates: gates() },
  ) {
    return fixture.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${fixture.projectSlug}/release-policies`,
      headers: headers(writer, key),
      payload: body,
    });
  }

  it('authors a draft, separately publishes it and appends a new version without rewriting history', async () => {
    const key = randomUUID();
    const body = { key: `policy-${randomUUID()}`, name: 'Agent quality policy', gates: gates() };
    const responses = await Promise.all([create(key, body), create(key, body)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(201);
    const created = readinessPolicyResponseSchema.parse(responses[0]?.json());
    expect(responses[1]?.json()).toEqual(created);
    expect(created.policy.versions[0]?.state).toBe('draft');
    const base = `/api/v1/projects/${fixture.projectSlug}/release-policies/${created.policy.id}`;
    const forbidden = await fixture.app.inject({
      method: 'POST',
      url: `${base}/publish`,
      headers: headers(),
    });
    expect(forbidden.statusCode).toBe(403);
    const publishKey = randomUUID();
    const publication = await fixture.app.inject({
      method: 'POST',
      url: `${base}/publish`,
      headers: headers(publisher, publishKey),
    });
    expect(publication.statusCode, publication.body).toBe(201);
    expect(publication.json().policy.versions[0].state).toBe('published');
    const replay = await fixture.app.inject({
      method: 'POST',
      url: `${base}/publish`,
      headers: headers(publisher, publishKey),
    });
    expect(replay.json()).toEqual(publication.json());
    const newVersion = await fixture.app.inject({
      method: 'POST',
      url: `${base}/versions`,
      headers: headers(),
      payload: { gates: gates(1) },
    });
    expect(newVersion.statusCode, newVersion.body).toBe(201);
    const versions = readinessPolicyResponseSchema.parse(newVersion.json()).policy.versions;
    expect(versions).toHaveLength(2);
    expect(versions.find((version) => version.version === 1)).toEqual(
      readinessPolicyResponseSchema.parse(publication.json()).policy.versions[0],
    );
    const draftConflict = await fixture.app.inject({
      method: 'POST',
      url: `${base}/versions`,
      headers: headers(),
      payload: { gates: gates(2) },
    });
    expect(draftConflict.statusCode).toBe(409);
    const audit = await fixture.admin.auditLog.findMany({
      where: {
        organizationId: fixture.organizationId,
        action: 'release_policy.published',
        targetId: created.policy.versions[0]?.id,
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: 'api_token', actorId: publisherId });
  });

  it('keeps read/write/publish scopes independent and does not broaden existing readiness scopes', async () => {
    for (const scopes of [['readiness:write'], ['policies:read'], ['policies:publish']] as const) {
      const issued = await issueAuthoringToken(fixture, [...scopes]);
      const denied = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${fixture.projectSlug}/release-policies`,
        headers: headers(issued.token),
        payload: { key: 'forbidden', name: 'Forbidden', gates: gates() },
      });
      expect(denied.statusCode).toBe(403);
    }
    const readDenied = await fixture.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${fixture.projectSlug}/release-policies`,
      headers: headers(publisher),
    });
    expect(readDenied.statusCode).toBe(403);
  });

  it('requires lead access even for a correctly scoped token', async () => {
    await fixture.admin.membership.update({
      where: {
        organizationId_userId: { organizationId: fixture.organizationId, userId: fixture.ownerId },
      },
      data: { role: 'TESTER' },
    });
    try {
      expect((await create()).statusCode).toBe(403);
    } finally {
      await fixture.admin.membership.update({
        where: {
          organizationId_userId: {
            organizationId: fixture.organizationId,
            userId: fixture.ownerId,
          },
        },
        data: { role: 'OWNER' },
      });
    }
  });

  it('validates gates and rejects inaccessible policy IDs without leaking foreign data', async () => {
    const invalid = await create(randomUUID(), {
      key: 'invalid-gates',
      name: 'Invalid',
      gates: [],
    });
    expect(invalid.statusCode).toBe(400);
    const foreignProject = await fixture.admin.project.findFirstOrThrow({
      where: { organizationId: fixture.foreignOrganizationId },
    });
    const foreign = await fixture.admin.releasePolicy.create({
      data: {
        organizationId: fixture.foreignOrganizationId,
        projectId: foreignProject.id,
        key: 'foreign',
        name: 'Foreign policy',
        createdById: fixture.ownerId,
      },
    });
    const base = `/api/v1/projects/${fixture.projectSlug}/release-policies/${foreign.id}`;
    const get = await fixture.app.inject({ method: 'GET', url: base, headers: headers() });
    expect(get.statusCode).toBe(404);
    const append = await fixture.app.inject({
      method: 'POST',
      url: `${base}/versions`,
      headers: headers(),
      payload: { gates: gates() },
    });
    expect(append.statusCode).toBe(404);
    const publish = await fixture.app.inject({
      method: 'POST',
      url: `${base}/publish`,
      headers: headers(publisher),
    });
    expect(publish.statusCode).toBe(404);
  });
});
