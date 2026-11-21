import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  updateReleaseResponseSchema,
  type ReleaseSummary,
  type UpdateReleaseRequest,
} from '@caselog/schemas';
import { releaseEditFixture } from '../support/release-edit.fixture';

describe('release metadata update API', () => {
  let fixture: Awaited<ReturnType<typeof releaseEditFixture>>;
  beforeAll(async () => {
    fixture = await releaseEditFixture();
  });
  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  });
  function request(release: ReleaseSummary): UpdateReleaseRequest {
    return {
      name: release.name,
      environmentId: release.environment?.id ?? null,
      targetDate: release.targetDate,
      externalReference: release.externalReference,
      expectedUpdatedAt: release.updatedAt,
    };
  }
  function update(releaseId: string, payload: UpdateReleaseRequest, token?: string) {
    return fixture.app.inject({
      method: 'PUT',
      url: `/api/v1/projects/checkout/releases/${releaseId}`,
      headers: token ? { authorization: `Bearer ${token}` } : fixture.headers,
      payload,
    });
  }

  it('adds an environment, updates metadata, audits once and preserves immutable records', async () => {
    const release = await fixture.createRelease();
    const environment = fixture.environments[0];
    if (!environment) throw new Error('Missing environment');
    const candidate = await fixture.admin.releaseCandidate.create({
      data: {
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'immutable-commit',
        identityHash: randomBytes(32).toString('hex'),
      },
    });
    const history = await fixture.admin.releaseLifecycleEvent.findMany({
      where: { organizationId: fixture.organizationId, releaseId: release.id },
    });
    const payload = {
      ...request(release),
      name: 'Updated release',
      environmentId: environment.id,
      targetDate: '2026-12-01T12:00:00.000Z',
      externalReference: 'QA-42',
    };
    const response = await update(release.id, payload);
    expect(response.statusCode, response.body).toBe(200);
    const updated = updateReleaseResponseSchema.parse(response.json()).release;
    expect(updated).toMatchObject({
      name: 'Updated release',
      key: release.key,
      environment: { id: environment.id },
      state: 'draft',
      candidateCount: 1,
      externalReference: 'QA-42',
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(release.updatedAt).getTime(),
    );
    const replay = await update(release.id, payload);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(response.json());
    const where = {
      organizationId: fixture.organizationId,
      targetId: release.id,
      action: 'release.updated',
    };
    expect(await fixture.admin.auditLog.count({ where })).toBe(1);
    const events = await fixture.admin.integrationEvent.findMany({
      where: {
        organizationId: fixture.organizationId,
        sourceId: release.id,
        eventName: 'releases.release_updated',
      },
    });
    expect(events).toHaveLength(1);
    expect(
      await fixture.admin.releaseCandidate.findUniqueOrThrow({
        where: { organizationId_id: { organizationId: fixture.organizationId, id: candidate.id } },
      }),
    ).toEqual(candidate);
    expect(
      await fixture.admin.releaseLifecycleEvent.findMany({
        where: { organizationId: fixture.organizationId, releaseId: release.id },
      }),
    ).toEqual(history);
    const cleared = await update(release.id, {
      ...request(updated),
      environmentId: null,
      targetDate: null,
      externalReference: null,
    });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().release).toMatchObject({
      environment: null,
      targetDate: null,
      externalReference: null,
    });
  });

  it('serializes concurrent edits, rejects stale overwrites and permits a deliberate reload', async () => {
    const release = await fixture.createRelease();
    const responses = await Promise.all(
      ['First edit', 'Second edit'].map((name) =>
        update(release.id, { ...request(release), name }),
      ),
    );
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const success = responses.find(({ statusCode }) => statusCode === 200);
    const conflict = responses.find(({ statusCode }) => statusCode === 409);
    expect(conflict?.json().error.code).toBe('release_changed');
    const current = updateReleaseResponseSchema.parse(success?.json()).release;
    const resolved = await update(release.id, { ...request(current), name: 'Reviewed edit' });
    expect(resolved.statusCode, resolved.body).toBe(200);
  });

  it('rejects missing, archived, other-project and cross-tenant resources without writes', async () => {
    const release = await fixture.createRelease();
    for (const environment of fixture.environments.slice(1)) {
      const response = await update(release.id, {
        ...request(release),
        environmentId: environment.id,
      });
      expect(response.statusCode, response.body).toBe(environment.state === 'ARCHIVED' ? 409 : 404);
    }
    for (const id of [randomUUID(), fixture.foreignRelease.id]) {
      const response = await update(id, { ...request(release), name: 'Denied' });
      expect(response.statusCode, response.body).toBe(404);
    }
    const mismatch = await fixture.app.inject({
      method: 'PUT',
      url: `/api/v1/projects/other/releases/${release.id}`,
      headers: fixture.headers,
      payload: request(release),
    });
    expect(mismatch.statusCode).toBe(404);
    const denied = await update(
      release.id,
      { ...request(release), name: 'Denied' },
      fixture.readerToken,
    );
    expect(denied.statusCode).toBe(403);
    const tokenResponse = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/api-tokens',
      headers: fixture.headers,
      payload: {
        name: 'Candidate token',
        scopes: ['candidates:write'],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });
    expect(tokenResponse.statusCode, tokenResponse.body).toBe(201);
    expect(
      (await update(release.id, request(release), tokenResponse.json().token)).statusCode,
    ).toBe(403);
    expect(
      await fixture.admin.auditLog.count({
        where: {
          organizationId: fixture.organizationId,
          targetId: release.id,
          action: 'release.updated',
        },
      }),
    ).toBe(0);
  });

  it('allows active releases and rejects finalized releases and immutable field input', async () => {
    for (const state of ['ACTIVE', 'RELEASED', 'CANCELLED'] as const) {
      const release = await fixture.createRelease();
      if (state !== 'CANCELLED') {
        const activated = await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/projects/checkout/releases/${release.id}/activate`,
          headers: fixture.headers,
        });
        expect(activated.statusCode, activated.body).toBe(201);
      }
      if (state !== 'ACTIVE') {
        const finalized = await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/projects/checkout/releases/${release.id}/${state === 'RELEASED' ? 'release' : 'cancel'}`,
          headers: fixture.headers,
        });
        expect(finalized.statusCode, finalized.body).toBe(201);
      }
      const stored = await fixture.admin.release.findUniqueOrThrow({
        where: { organizationId_id: { organizationId: fixture.organizationId, id: release.id } },
      });
      const result = await update(release.id, {
        ...request(release),
        expectedUpdatedAt: stored.updatedAt.toISOString(),
        name: 'Changed',
      });
      expect(result.statusCode, result.body).toBe(state === 'ACTIVE' ? 200 : 409);
      if (state !== 'ACTIVE') expect(result.json().error.code).toBe('release_finalized');
    }
    const release = await fixture.createRelease();
    for (const extra of [
      { key: 'changed' },
      { state: 'released' },
      { name: ' ' },
      { expectedUpdatedAt: undefined },
      { targetDate: 'invalid' },
    ]) {
      const response = await fixture.app.inject({
        method: 'PUT',
        url: `/api/v1/projects/checkout/releases/${release.id}`,
        headers: fixture.headers,
        payload: { ...request(release), ...extra },
      });
      expect(response.statusCode, response.body).toBe(400);
    }
  });

  it('serializes environment assignment with concurrent archival', async () => {
    const release = await fixture.createRelease();
    const environment = await fixture.admin.environment.create({
      data: {
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        name: 'Race',
        slug: `race-${randomUUID().slice(0, 8)}`,
      },
    });
    const [assigned, archived] = await Promise.all([
      update(release.id, { ...request(release), environmentId: environment.id }),
      fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/checkout/environments/${environment.id}/archive`,
        headers: fixture.headers,
      }),
    ]);
    expect([assigned.statusCode, archived.statusCode].filter((code) => code === 409)).toHaveLength(
      1,
    );
    expect(assigned.statusCode === 200 || archived.statusCode === 201).toBe(true);
    const current = await fixture.admin.release.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: fixture.organizationId, id: release.id } },
    });
    const state = await fixture.admin.environment.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: fixture.organizationId, id: environment.id } },
    });
    expect(current.environmentId === environment.id && state.state === 'ARCHIVED').toBe(false);
  });

  it.each(['LEAD', 'ADMIN'] as const)(
    'allows a live %s membership to edit a release',
    async (role) => {
      const release = await fixture.createRelease();
      const token = await fixture.issueToken(role);
      const response = await update(
        release.id,
        { ...request(release), name: `${role} edit` },
        token,
      );
      expect(response.statusCode, response.body).toBe(200);
    },
  );
});
