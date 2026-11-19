import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sectionResponseSchema, suiteResponseSchema } from '@caselog/schemas';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import { ProjectStructureCreateRepository } from '../../../test-cases/infrastructure/repositories/project-structure-create.repository';
import {
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
  type AuthoringFixture,
} from '../support/authoring.e2e-fixture';

describe('scoped agent structure creation', () => {
  let fixture: AuthoringFixture;
  let token: string;
  let tokenId: string;
  beforeAll(async () => {
    fixture = await createAuthoringFixture();
    const issued = await issueAuthoringToken(fixture, ['structure:write']);
    token = issued.token;
    tokenId = issued.apiToken.id;
  });
  afterAll(async () => destroyAuthoringFixture(fixture));

  function headers(key?: string, credential = token) {
    return { authorization: `Bearer ${credential}`, ...(key ? { 'idempotency-key': key } : {}) };
  }
  function suite(name: string, key = randomUUID(), credential = token) {
    return fixture.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${fixture.projectSlug}/structure/suites`,
      headers: headers(key, credential),
      payload: { name },
    });
  }
  function section(
    name: string,
    key = randomUUID(),
    suiteId = fixture.suiteId,
    parentId?: string | null,
  ) {
    return fixture.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${fixture.projectSlug}/structure/suites/${suiteId}/sections`,
      headers: headers(key),
      payload: { name, parentId },
    });
  }

  it('creates one suite and audit record on concurrent retries and rejects changed intent', async () => {
    const name = `Suite ${randomUUID()}`;
    const key = randomUUID();
    const responses = await Promise.all([suite(name, key), suite(name, key), suite(name, key)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(201);
    const original = suiteResponseSchema.parse(responses[0]?.json());
    for (const response of responses) expect(response.json()).toEqual(original);
    expect(
      await fixture.admin.suite.count({ where: { organizationId: fixture.organizationId, name } }),
    ).toBe(1);
    const audit = await fixture.admin.auditLog.findMany({
      where: { organizationId: fixture.organizationId, targetId: original.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'api_token',
      actorId: tokenId,
      action: 'suite.created',
      metadata: { createdById: fixture.ownerId },
    });
    expect(JSON.stringify(audit)).not.toContain(token);
    const conflict = await suite('Changed intent', key);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('idempotency_key_reused');
    // Normalization occurs before hashing, so transport whitespace is not a new intent.
    expect((await suite(` ${name} `, key)).json()).toEqual(original);
  });

  it('creates root and nested sections, replays a normalized root, and records one audit', async () => {
    const key = randomUUID();
    const name = `Root ${randomUUID()}`;
    const responses = await Promise.all([section(name, key), section(name, key)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(201);
    const root = sectionResponseSchema.parse(responses[0]?.json());
    expect(responses[1]?.json()).toEqual(root);
    expect(root).toMatchObject({ parentId: null, depth: 0, suiteId: fixture.suiteId });
    expect((await section(name, key, fixture.suiteId, null)).json()).toEqual(root);
    const nestedKey = randomUUID();
    const nestedResponses = await Promise.all([
      section('Nested', nestedKey, fixture.suiteId, root.id),
      section('Nested', nestedKey, fixture.suiteId, root.id),
    ]);
    for (const response of nestedResponses) expect(response.statusCode, response.body).toBe(201);
    const nested = sectionResponseSchema.parse(nestedResponses[0]?.json());
    expect(nestedResponses[1]?.json()).toEqual(nested);
    expect(nested).toMatchObject({ parentId: root.id, depth: 1 });
    const persisted = await fixture.admin.section.findUniqueOrThrow({
      where: { organizationId_id: { organizationId: fixture.organizationId, id: nested.id } },
    });
    expect(persisted.path).toBe(`/${root.id}/${nested.id}`);
    const audit = await fixture.admin.auditLog.findMany({
      where: { organizationId: fixture.organizationId, targetId: nested.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorType: 'api_token',
      actorId: tokenId,
      action: 'section.created',
    });
    const conflict = await section('Different', key);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('idempotency_key_reused');
  });

  it('replays the original snapshot after rename and deletion without recreating records', async () => {
    const key = randomUUID();
    const name = `Snapshot ${randomUUID()}`;
    const original = sectionResponseSchema.parse((await section(name, key)).json());
    const url = `/api/v1/projects/${fixture.projectSlug}/structure/sections/${original.id}`;
    const renamed = await fixture.app.inject({
      method: 'PUT',
      url,
      headers: headers(undefined, fixture.ownerToken),
      payload: { name: `${name} renamed` },
    });
    expect(renamed.statusCode).toBe(200);
    expect((await section(name, key)).json()).toEqual(original);
    const removed = await fixture.app.inject({
      method: 'DELETE',
      url,
      headers: headers(undefined, fixture.ownerToken),
    });
    expect(removed.statusCode).toBe(204);
    expect((await section(name, key)).json()).toEqual(original);
    expect(
      await fixture.admin.section.count({
        where: { organizationId: fixture.organizationId, id: original.id },
      }),
    ).toBe(0);
  });

  it('does not consume failed keys and serializes duplicate-name intents', async () => {
    const key = randomUUID();
    expect((await suite('', key)).statusCode).toBe(400);
    expect((await suite('Main', key)).statusCode).toBe(409);
    expect((await suite(`Corrected ${randomUUID()}`, key)).statusCode).toBe(201);
    const name = `Concurrent ${randomUUID()}`;
    const outcomes = await Promise.all([section(name), section(name)]);
    expect(outcomes.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    expect(outcomes.find((response) => response.statusCode === 409)?.json().error.code).toBe(
      'section_name_taken',
    );
    const sectionKey = randomUUID();
    expect((await section('Retryable', sectionKey, randomUUID())).statusCode).toBe(404);
    expect((await section('Retryable', sectionKey, fixture.suiteId, randomUUID())).statusCode).toBe(
      404,
    );
    expect((await section('Retryable', sectionKey)).statusCode).toBe(201);
  });

  it('isolates suites and parents across tenants and projects at API, repository and RLS boundaries', async () => {
    expect((await section('Foreign suite', randomUUID(), fixture.foreignSuiteId)).statusCode).toBe(
      404,
    );
    expect(
      (await section('Foreign parent', randomUUID(), fixture.suiteId, fixture.foreignSectionId))
        .statusCode,
    ).toBe(404);
    const another = await fixture.admin.project.create({
      data: {
        organizationId: fixture.organizationId,
        slug: 'another-project',
        name: 'Another',
        key: 'ANOTHER',
      },
    });
    const anotherSuite = await fixture.admin.suite.create({
      data: {
        organizationId: fixture.organizationId,
        projectId: another.id,
        name: 'Another suite',
      },
    });
    const sameProjectSuite = suiteResponseSchema.parse(
      (await suite(`Other suite ${randomUUID()}`)).json(),
    );
    const anotherRoot = sectionResponseSchema.parse(
      (await section('Another root', randomUUID(), sameProjectSuite.id)).json(),
    );
    expect((await section('Wrong project', randomUUID(), anotherSuite.id)).statusCode).toBe(404);
    expect(
      (await section('Wrong suite parent', randomUUID(), fixture.suiteId, anotherRoot.id))
        .statusCode,
    ).toBe(404);
    const repository = fixture.app.get(ProjectStructureCreateRepository);
    expect(
      await repository.createSection(
        fixture.organizationId,
        fixture.ownerId,
        fixture.projectSlug,
        fixture.foreignSuiteId,
        { name: 'Foreign' },
        { idempotencyKey: randomUUID() },
      ),
    ).toEqual({ kind: 'suite_not_found' });
    const invisible = await runInTenant(
      fixture.application,
      fixture.organizationId,
      async (tx) => ({
        suites: await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM suites WHERE id = ${fixture.foreignSuiteId}::uuid`,
        sections: await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM sections WHERE id = ${fixture.foreignSectionId}::uuid`,
      }),
    );
    expect(invisible).toEqual({ suites: [], sections: [] });
    const missingProject = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/projects/missing-project/structure/suites',
      headers: headers(randomUUID()),
      payload: { name: 'Missing project' },
    });
    expect(missingProject.statusCode).toBe(404);
  });

  it('requires valid keys for API tokens and preserves unkeyed browser writes', async () => {
    for (const path of ['suites', `suites/${fixture.suiteId}/sections`]) {
      const url = `/api/v1/projects/${fixture.projectSlug}/structure/${path}`;
      for (const key of [undefined, 'short', 'invalid key']) {
        const denied = await fixture.app.inject({
          method: 'POST',
          url,
          headers: headers(key),
          payload: { name: `Key ${randomUUID()}` },
        });
        expect(denied.statusCode).toBe(400);
        if (!key) expect(denied.json().error.code).toBe('idempotency_key_required');
      }
      const browser = await fixture.app.inject({
        method: 'POST',
        url,
        headers: headers(undefined, fixture.ownerToken),
        payload: { name: `Browser ${randomUUID()}` },
      });
      expect(browser.statusCode, browser.body).toBe(201);
    }
  });

  it('keeps scope independent from existing authoring, reading and destructive operations', async () => {
    for (const scopes of [['projects:read'], ['cases:write'], ['policies:write']] as const) {
      const credential = await issueAuthoringToken(fixture, [...scopes]);
      expect((await suite('Denied', randomUUID(), credential.token)).statusCode).toBe(403);
    }
    const base = `/api/v1/projects/${fixture.projectSlug}/structure`;
    for (const [method, url, payload] of [
      ['GET', base, undefined],
      ['PUT', `${base}/suites/${fixture.suiteId}`, { name: 'Denied' }],
      ['PUT', `${base}/suites/${fixture.suiteId}/move`, { position: 0 }],
      ['DELETE', `${base}/suites/${fixture.suiteId}`, undefined],
      ['PUT', `${base}/sections/${fixture.sectionId}`, { name: 'Denied' }],
      ['DELETE', `${base}/sections/${fixture.sectionId}`, undefined],
    ] as const) {
      const denied = await fixture.app.inject({
        method,
        url,
        headers: headers(randomUUID()),
        ...(payload ? { payload } : {}),
      });
      expect(denied.statusCode).toBe(403);
    }
  });

  it('checks live roles and revocation before replaying a successful write', async () => {
    const key = randomUUID();
    const name = `Role ${randomUUID()}`;
    expect((await suite(name, key)).statusCode).toBe(201);
    const where = {
      organizationId_userId: { organizationId: fixture.organizationId, userId: fixture.ownerId },
    };
    await fixture.admin.membership.update({ where, data: { role: 'READ_ONLY' } });
    try {
      expect((await suite(name, key)).statusCode).toBe(403);
      expect((await section('Denied by role')).statusCode).toBe(403);
    } finally {
      await fixture.admin.membership.update({ where, data: { role: 'OWNER' } });
    }
    const revoked = await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/api-tokens/${tokenId}`,
      headers: headers(undefined, fixture.ownerToken),
    });
    expect(revoked.statusCode).toBe(204);
    expect((await suite(name, key)).statusCode).toBe(401);
  });
});
