import { randomUUID } from 'node:crypto';
import {
  createApiTokenResponseSchema,
  sessionResponseSchema,
  type CreateApiTokenResponse,
} from '@caselog/schemas';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { configureApplication } from '../configure-application';
import { createPrismaClient } from '../core/database/prisma-client';
import type { PrismaClient } from '../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';
const JUNIT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="CI"><testcase classname="api" name="uploads-results" time="0.2" /></testsuite>`;

describe('organization API tokens', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let email = '';
  let organizationId = '';
  let foreignOrganizationId = '';
  let organizationToken = '';
  let projectId = '';
  let runId = '';
  let foreignRunId = '';
  let apiToken: CreateApiTokenResponse;

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for API token tests');

    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `api-token-${suffix}@example.com`;
    const registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'API Token Owner',
        email,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const session = sessionResponseSchema.parse(registrationResponse.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });

    const organization = await admin.organization.create({
      data: { name: 'API Token Workspace', slug: `api-token-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.create({
      data: { organizationId, userId: user.id, role: 'OWNER' },
    });
    const project = await admin.project.create({
      data: {
        organizationId,
        key: 'TOKEN',
        slug: 'token-project',
        name: 'Token Project',
      },
    });
    projectId = project.id;
    const statuses = await Promise.all(
      [
        { key: 'untested', name: 'Untested', color: '#64748B', isFinal: false },
        { key: 'passed', name: 'Passed', color: '#16A34A', isFinal: true },
        { key: 'failed', name: 'Failed', color: '#DC2626', isFinal: true },
      ].map((status, position) =>
        admin.resultStatus.create({
          data: {
            organizationId,
            projectId,
            icon: 'circle',
            position,
            countsAsFailure: status.key === 'failed',
            ...status,
          },
        }),
      ),
    );
    const suite = await admin.suite.create({
      data: { organizationId, projectId, name: 'API suite' },
    });
    const section = await admin.section.create({
      data: {
        organizationId,
        projectId,
        suiteId: suite.id,
        name: 'CI',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    const testCase = await admin.testCase.create({
      data: {
        organizationId,
        projectId,
        suiteId: suite.id,
        sectionId: section.id,
        caseNumber: 1n,
        automationId: 'api.uploads-results',
      },
    });
    const version = await admin.testCaseVersion.create({
      data: {
        organizationId,
        testCaseId: testCase.id,
        version: 1,
        title: 'Upload automated results',
        template: 'STEPS',
        content: { steps: [{ action: 'Upload JUnit XML' }] },
        createdById: user.id,
      },
    });
    await admin.testCase.update({
      where: { organizationId_id: { organizationId, id: testCase.id } },
      data: { currentVersionId: version.id },
    });
    const run = await admin.testRun.create({
      data: { organizationId, projectId, name: 'CI run', status: 'ACTIVE' },
    });
    runId = run.id;
    const untestedStatus = statuses.find(({ key }) => key === 'untested');
    if (!untestedStatus) throw new Error('Expected an untested result status');
    await admin.testRunItem.create({
      data: {
        organizationId,
        testRunId: runId,
        caseVersionId: version.id,
        statusId: untestedStatus.id,
      },
    });

    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign API Token Workspace', slug: `foreign-token-${suffix}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const foreignProject = await admin.project.create({
      data: {
        organizationId: foreignOrganizationId,
        key: 'FOREIGN',
        slug: 'token-project',
        name: 'Foreign Token Project',
      },
    });
    const foreignRun = await admin.testRun.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        name: 'Foreign CI run',
        status: 'ACTIVE',
      },
    });
    foreignRunId = foreignRun.id;

    const organizationTokenResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organization.slug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(organizationTokenResponse.statusCode, organizationTokenResponse.body).toBe(200);
    organizationToken = organizationTokenResponse.json().accessToken as string;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      await admin.apiToken.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.idempotencyRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testResult.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testRunItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testRun.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testCase.updateMany({
        where: { organizationId: { in: organizationIds } },
        data: { currentVersionId: null },
      });
      await admin.testCaseVersion.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testCase.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.section.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.suite.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.resultStatus.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('creates and lists a scoped token without exposing its value again', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: {
        name: 'CI uploader',
        scopes: ['results:write', 'runs:read'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    });

    expect(response.statusCode, response.body).toBe(201);
    apiToken = createApiTokenResponseSchema.parse(response.json());
    expect(apiToken.token).toMatch(/^clg_/);
    expect(apiToken.apiToken).toMatchObject({
      name: 'CI uploader',
      scopes: ['results:write', 'runs:read'],
      lastUsedAt: null,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.body).not.toContain(apiToken.token);
    expect(list.json().apiTokens).toEqual([apiToken.apiToken]);

    const stored = await admin.apiToken.findFirstOrThrow({
      where: { organizationId, id: apiToken.apiToken.id },
      select: { tokenHash: true },
    });
    expect(stored.tokenHash).not.toBe(apiToken.token);
  });

  it('rejects expired and excessively long-lived tokens', async () => {
    for (const expiresAt of [
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 367 * 24 * 60 * 60 * 1_000).toISOString(),
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/api-tokens',
        headers: { authorization: `Bearer ${organizationToken}` },
        payload: { name: 'Invalid expiry', scopes: ['runs:read'], expiresAt },
      });
      expect(response.statusCode, response.body).toBe(400);
      expect(response.json().error.code).toBe('invalid_api_token_expiry');
    }
  });

  it('uses token scopes for run reads and JUnit result ingestion', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/token-project/runs/${runId}`,
      headers: { authorization: `Bearer ${apiToken.token}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);

    const upload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/token-project/runs/${runId}/results/junit`,
      headers: {
        authorization: `Bearer ${apiToken.token}`,
        'content-type': 'application/xml',
        'idempotency-key': 'api-token-junit-upload',
      },
      payload: JUNIT_XML,
    });
    expect(upload.statusCode, upload.body).toBe(201);
    expect(upload.json()).toMatchObject({ total: 1, recorded: 1, counts: { passed: 1 } });

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(list.json().apiTokens[0].lastUsedAt).toEqual(expect.any(String));
  });

  it('denies an API token that does not have the endpoint scope', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: {
        name: 'Read-only automation',
        scopes: ['runs:read'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    });
    const readToken = createApiTokenResponseSchema.parse(created.json()).token;

    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/token-project/runs/${runId}/results/junit`,
      headers: {
        authorization: `Bearer ${readToken}`,
        'content-type': 'application/xml',
        'idempotency-key': 'wrong-scope',
      },
      payload: JUNIT_XML,
    });
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json().error.code).toBe('insufficient_permissions');
  });

  it('returns 404 when an API token addresses another tenant resource', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/token-project/runs/${foreignRunId}`,
      headers: { authorization: `Bearer ${apiToken.token}` },
    });
    expect(response.statusCode, response.body).toBe(404);
    expect(response.json().error.details).toEqual({ resource: 'test_run' });
  });

  it('does not allow API tokens to manage other tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${apiToken.token}` },
    });
    expect(response.statusCode, response.body).toBe(403);
  });

  it('revokes a token immediately', async () => {
    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/api-tokens/${apiToken.apiToken.id}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(revoked.statusCode, revoked.body).toBe(204);

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/token-project/runs/${runId}`,
      headers: { authorization: `Bearer ${apiToken.token}` },
    });
    expect(denied.statusCode, denied.body).toBe(401);
  });
});
