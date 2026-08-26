import { randomUUID } from 'node:crypto';
import {
  candidateTestRunListResponseSchema,
  createEnvironmentResponseSchema,
  createReleaseCandidateResponseSchema,
  createReleaseResponseSchema,
  releaseDetailResponseSchema,
  releaseCandidateListResponseSchema,
  releaseLifecycleResponseSchema,
  sessionResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('release foundations API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let organizationId = '';
  let organizationToken = '';
  let readOnlyToken = '';
  let projectId = '';
  let projectSlug = '';
  let environmentId = '';
  let releaseId = '';
  let firstCandidateId = '';
  let secondCandidateId = '';
  let firstRunId = '';
  let secondRunId = '';
  const emails: string[] = [];

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for release E2E tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `release-owner-${suffix}@example.com`;
    const readerEmail = `release-reader-${suffix}@example.com`;
    emails.push(ownerEmail, readerEmail);
    const ownerSession = await register(app, 'Release Owner', ownerEmail);
    const readerSession = await register(app, 'Release Reader', readerEmail);
    const [owner, reader] = await Promise.all([
      admin.user.findUniqueOrThrow({ where: { email: ownerEmail } }),
      admin.user.findUniqueOrThrow({ where: { email: readerEmail } }),
    ]);
    const organization = await admin.organization.create({
      data: { name: 'Release Workspace', slug: `release-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.createMany({
      data: [
        { organizationId, userId: owner.id, role: 'OWNER' },
        { organizationId, userId: reader.id, role: 'READ_ONLY' },
      ],
    });
    organizationToken = await issueOrganizationToken(app, organization.slug, ownerSession);
    readOnlyToken = await issueOrganizationToken(app, organization.slug, readerSession);

    projectSlug = `checkout-${suffix}`;
    const project = await admin.project.create({
      data: {
        organizationId,
        key: `R${suffix.slice(0, 7).toUpperCase()}`,
        slug: projectSlug,
        name: 'Checkout',
      },
    });
    projectId = project.id;
    const runs = await Promise.all([
      admin.testRun.create({
        data: { organizationId, projectId, name: 'Regression', status: 'COMPLETED' },
      }),
      admin.testRun.create({
        data: { organizationId, projectId, name: 'Performance', status: 'ACTIVE' },
      }),
    ]);
    firstRunId = runs[0].id;
    secondRunId = runs[1].id;
  });

  afterAll(async () => {
    if (admin && organizationId) {
      await admin.releaseLifecycleEvent.deleteMany({ where: { organizationId } });
      await admin.candidateTestRun.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.environment.deleteMany({ where: { organizationId } });
      await admin.auditLog.deleteMany({ where: { organizationId } });
      await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
      await admin.testRun.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.membership.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
      await admin.user.deleteMany({ where: { email: { in: emails } } });
    }
    if (admin) await admin.$disconnect();
    if (app) await app.close();
  });

  it('creates an idempotent environment and enforces lead access', async () => {
    const request = { name: 'Production', slug: 'production', description: 'Customer traffic' };
    const headers = authHeaders(organizationToken, 'environment-production');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments`,
      headers,
      payload: request,
    });
    expect(response.statusCode, response.body).toBe(201);
    environmentId = createEnvironmentResponseSchema.parse(response.json()).environment.id;

    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments`,
      headers,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(response.json());

    const conflict = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments`,
      headers,
      payload: { ...request, name: 'Different' },
    });
    expect(conflict.statusCode, conflict.body).toBe(409);

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments`,
      headers: authHeaders(readOnlyToken, 'reader-environment'),
      payload: { name: 'Staging', slug: 'staging' },
    });
    expect(forbidden.statusCode, forbidden.body).toBe(403);
  });

  it('creates an idempotent release for an active environment', async () => {
    const request = {
      key: '2026.08',
      name: 'August release',
      environmentId,
      targetDate: '2026-08-31T12:00:00.000Z',
    };
    const headers = authHeaders(organizationToken, 'release-2026-08');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases`,
      headers,
      payload: request,
    });
    expect(response.statusCode, response.body).toBe(201);
    const created = createReleaseResponseSchema.parse(response.json()).release;
    releaseId = created.id;
    expect(created).toMatchObject({
      key: request.key,
      state: 'draft',
      candidateCount: 0,
      environment: { id: environmentId, state: 'active' },
    });

    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases`,
      headers,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(response.json());

    const archiveBlocked = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments/${environmentId}/archive`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(archiveBlocked.statusCode, archiveBlocked.body).toBe(409);
  });

  it('registers immutable, project-unique release candidates', async () => {
    const first = await createCandidate('candidate-one', {
      sourceRevision: 'ABC123',
      buildIdentifier: 'build-101',
      artifactDigest: 'SHA256:AAA',
      branch: 'main',
    });
    firstCandidateId = first.id;
    expect(first).toMatchObject({
      sequence: 1,
      label: 'RC-1',
      sourceRevision: 'abc123',
      artifactDigest: 'sha256:aaa',
    });
    const firstReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates`,
      headers: authHeaders(organizationToken, 'candidate-one'),
      payload: {
        sourceRevision: 'ABC123',
        buildIdentifier: 'build-101',
        artifactDigest: 'SHA256:AAA',
        branch: 'main',
      },
    });
    expect(firstReplay.statusCode, firstReplay.body).toBe(201);
    expect(createReleaseCandidateResponseSchema.parse(firstReplay.json()).candidate.id).toBe(
      firstCandidateId,
    );

    const second = await createCandidate('candidate-two', {
      sourceRevision: 'DEF456',
      buildIdentifier: 'build-102',
    });
    secondCandidateId = second.id;
    expect(second).toMatchObject({ sequence: 2, label: 'RC-2' });

    const firstPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates?limit=1`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(firstPageResponse.statusCode, firstPageResponse.body).toBe(200);
    const firstPage = releaseCandidateListResponseSchema.parse(firstPageResponse.json());
    expect(firstPage.items.map(({ id }) => id)).toEqual([firstCandidateId]);
    expect(firstPage.nextCursor).toBe(firstCandidateId);
    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates?limit=1&cursor=${firstPage.nextCursor}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    const secondPage = releaseCandidateListResponseSchema.parse(secondPageResponse.json());
    expect(secondPage.items.map(({ id }) => id)).toEqual([secondCandidateId]);
    expect(secondPage.nextCursor).toBeNull();

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates`,
      headers: authHeaders(organizationToken, 'candidate-duplicate'),
      payload: {
        sourceRevision: 'abc123',
        buildIdentifier: 'build-101',
        artifactDigest: 'sha256:aaa',
      },
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json().error.code).toBe('release_candidate_identity_taken');

    await expect(
      admin.releaseCandidate.update({
        where: { organizationId_id: { organizationId, id: firstCandidateId } },
        data: { sourceRevision: 'mutated' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('links required and informational runs with one-candidate ownership', async () => {
    const firstLink = await linkRun(firstCandidateId, firstRunId, 'required');
    expect(firstLink).toMatchObject({
      testRunId: firstRunId,
      name: 'Regression',
      status: 'completed',
      role: 'required',
    });
    const secondLink = await linkRun(secondCandidateId, secondRunId, 'informational');
    expect(secondLink).toMatchObject({ testRunId: secondRunId, role: 'informational' });

    const duplicate = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectSlug}/candidates/${secondCandidateId}/test-runs/${firstRunId}`,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { role: 'required' },
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json().error.code).toBe('test_run_already_linked');

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/candidates/${firstCandidateId}/test-runs`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(candidateTestRunListResponseSchema.parse(list.json()).items).toHaveLength(1);
  });

  it('records forward-only lifecycle history and freezes finalized releases', async () => {
    const activated = await transition('activate');
    expect(activated.state).toBe('active');
    const released = await transition('release');
    expect(released.state).toBe('released');

    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/cancel`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(invalid.statusCode, invalid.body).toBe(409);
    expect(invalid.json().error.code).toBe('invalid_release_transition');

    const frozenCandidate = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates`,
      headers: authHeaders(organizationToken, 'candidate-after-release'),
      payload: { sourceRevision: 'late-change' },
    });
    expect(frozenCandidate.statusCode, frozenCandidate.body).toBe(409);
    expect(frozenCandidate.json().error.code).toBe('release_finalized');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const parsed = releaseDetailResponseSchema.parse(detail.json());
    expect(parsed.release).toMatchObject({ state: 'released', candidateCount: 2 });
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.history.map(({ fromState, toState }) => [fromState, toState])).toEqual([
      [null, 'draft'],
      ['draft', 'active'],
      ['active', 'released'],
    ]);

    const archived = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/environments/${environmentId}/archive`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(archived.statusCode, archived.body).toBe(201);
    expect(archived.json()).toMatchObject({ environmentId, state: 'archived' });
  });

  it('writes auditable release-domain events', async () => {
    const actions = await admin.auditLog.findMany({
      where: { organizationId },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'environment.created',
        'environment.archived',
        'release.created',
        'release.activated',
        'release.released',
        'release_candidate.created',
        'release_candidate.test_run_linked',
      ]),
    );
  });

  async function createCandidate(idempotencyKey: string, payload: Record<string, string>) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/candidates`,
      headers: authHeaders(organizationToken, idempotencyKey),
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return createReleaseCandidateResponseSchema.parse(response.json()).candidate;
  }

  async function linkRun(candidateId: string, runId: string, role: 'required' | 'informational') {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectSlug}/candidates/${candidateId}/test-runs/${runId}`,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { role },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().link;
  }

  async function transition(action: 'activate' | 'release') {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectSlug}/releases/${releaseId}/${action}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(response.statusCode, response.body).toBe(201);
    return releaseLifecycleResponseSchema.parse(response.json());
  }
});

function authHeaders(token: string, idempotencyKey: string) {
  return { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey };
}

async function register(
  app: NestFastifyApplication,
  displayName: string,
  email: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { displayName, email, password: PASSWORD, termsAccepted: true },
  });
  return sessionResponseSchema.parse(response.json()).accessToken;
}

async function issueOrganizationToken(
  app: NestFastifyApplication,
  organizationSlug: string,
  sessionToken: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/organizations/${organizationSlug}/token`,
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  return response.json().accessToken as string;
}
