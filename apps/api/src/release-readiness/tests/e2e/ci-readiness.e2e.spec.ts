import { randomUUID } from 'node:crypto';
import { createApiTokenResponseSchema, type ApiTokenScope } from '@caselog/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../../../../cli/src/cli';
import {
  createReadinessWaiverE2eFixture,
  destroyReadinessWaiverE2eFixture,
  type ReadinessWaiverE2eFixture,
} from '../support/readiness-waiver.e2e-fixture';

describe('CI readiness API and CLI', () => {
  let fixture: ReadinessWaiverE2eFixture;
  let foreign: ReadinessWaiverE2eFixture;
  let apiUrl: string;
  let token: string;
  let tokenId: string;
  let runId: string;
  let candidateId: string;
  beforeAll(async () => {
    fixture = await createReadinessWaiverE2eFixture();
    foreign = await createReadinessWaiverE2eFixture();
    await fixture.app.listen(0, '127.0.0.1');
    apiUrl = `${await fixture.app.getUrl()}/api/v1`;
    const issued = await issue([
      'candidates:write',
      'results:write',
      'readiness:read',
      'readiness:write',
    ]);
    token = issued.token;
    tokenId = issued.apiToken.id;
    const run = await fixture.admin.testRun.create({
      data: {
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        name: 'CI run',
      },
    });
    runId = run.id;
  });
  afterAll(async () => {
    if (fixture) {
      await fixture.admin.candidateTestRun.deleteMany({
        where: { organizationId: fixture.organizationId },
      });
      await fixture.admin.testRun.deleteMany({ where: { organizationId: fixture.organizationId } });
    }
    await destroyReadinessWaiverE2eFixture(fixture);
    await destroyReadinessWaiverE2eFixture(foreign);
  });

  async function issue(scopes: ApiTokenScope[]) {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${fixture.ownerToken}` },
      payload: {
        name: 'CI test',
        scopes,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return createApiTokenResponseSchema.parse(response.json());
  }
  async function command(args: string[], credential = token) {
    const output: string[] = [];
    const code = await runCli(
      [...args, '--project', fixture.projectSlug, '--json'],
      { CASELOG_TOKEN: credential, CASELOG_API_URL: apiUrl },
      { stdout: (line) => output.push(line), stderr: (line) => output.push(line) },
    );
    return { code, body: JSON.parse(output.join('')) };
  }
  it('creates an immutable candidate, replays creation, links a run and evaluates a policy', async () => {
    const original = await fixture.admin.releaseCandidate.findFirstOrThrow({
      where: { id: fixture.candidateId },
    });
    const args = ['candidate', 'create', '--release', original.releaseId, '--build', randomUUID()];
    const created = await command(args);
    expect(created.code, JSON.stringify(created.body)).toBe(0);
    candidateId = created.body.data.id;
    const replay = await command(args);
    expect(replay.body.data.id).toBe(candidateId);
    const link = await command(['candidate', 'link', '--candidate', candidateId, '--run', runId]);
    expect(link.code, JSON.stringify(link.body)).toBe(0);
    expect(link.body.data.testRunId).toBe(runId);
    const policy = await fixture.admin.releasePolicy.findFirstOrThrow({
      where: { organizationId: fixture.organizationId },
    });
    const assigned = await command([
      'readiness',
      'assign',
      '--candidate',
      candidateId,
      '--policy',
      policy.id,
    ]);
    expect(assigned.code, JSON.stringify(assigned.body)).toBe(0);
    const evaluation = await command(['readiness', 'evaluate', '--candidate', candidateId]);
    expect(evaluation.body.data?.state, JSON.stringify(evaluation.body)).toBe('current');
    expect(evaluation.code).toBe(1); // Missing required evidence blocks promotion.
    const current = await command(['readiness', 'check', '--candidate', candidateId]);
    expect(current.body.data.decision.id).toBe(evaluation.body.data.decision.id);
    const retried = await command(['readiness', 'evaluate', '--candidate', candidateId]);
    expect(retried.body.data.decision.id).toBe(evaluation.body.data.decision.id);
  });
  it('checks scopes independently and denies policy editing, waivers and token administration', async () => {
    const reader = await issue(['readiness:read']);
    expect(
      (await command(['readiness', 'check', '--candidate', candidateId], reader.token)).code,
    ).toBe(1);
    const denied = await command(
      ['readiness', 'evaluate', '--candidate', candidateId],
      reader.token,
    );
    expect(denied.code).toBe(2);
    for (const url of [
      '/api/v1/api-tokens',
      `/api/v1/projects/${fixture.projectSlug}/release-policies`,
      `/api/v1/projects/${fixture.projectSlug}/readiness-decisions/${fixture.decisionId}/waivers`,
    ]) {
      const response = await fixture.app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    const uploader = await issue(['results:write']);
    expect(
      (await command(['readiness', 'check', '--candidate', candidateId], uploader.token)).code,
    ).toBe(2);
  });
  it('hides foreign candidates and decisions even with every CI scope', async () => {
    for (const path of [
      `candidates/${foreign.candidateId}/readiness`,
      `readiness-decisions/${foreign.decisionId}`,
    ]) {
      const response = await fixture.app.inject({
        method: 'GET',
        url: `/api/v1/projects/${foreign.projectSlug}/${path}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode, response.body).toBe(404);
    }
  });
  it('closes a run idempotently only when both CI write scopes are present', async () => {
    for (const scope of ['candidates:write', 'results:write'] as const) {
      const limited = await issue([scope]);
      const denied = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${fixture.projectSlug}/runs/${runId}/close`,
        headers: { authorization: `Bearer ${limited.token}` },
      });
      expect(denied.statusCode).toBe(403);
    }
    const closed = await command(['run', 'close', '--run', runId]);
    expect(closed.code, JSON.stringify(closed.body)).toBe(0);
    expect(closed.body.data.status).toBe('completed');
    expect((await command(['run', 'close', '--run', runId])).code).toBe(0);
  });

  it('honors creator role changes and token revocation immediately', async () => {
    await fixture.admin.membership.updateMany({
      where: { organizationId: fixture.organizationId, userId: fixture.ownerId },
      data: { role: 'READ_ONLY' },
    });
    try {
      const response = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/projects/${fixture.projectSlug}/candidates/${candidateId}/readiness/evaluations`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode, response.body).toBe(403);
    } finally {
      await fixture.admin.membership.updateMany({
        where: { organizationId: fixture.organizationId, userId: fixture.ownerId },
        data: { role: 'OWNER' },
      });
    }
    const revoked = await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/api-tokens/${tokenId}`,
      headers: { authorization: `Bearer ${fixture.ownerToken}` },
    });
    expect(revoked.statusCode, revoked.body).toBe(204);
    expect((await command(['readiness', 'check', '--candidate', candidateId])).code).toBe(2);
  });
});
