import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  createJiraDataCenterConnectionResponseSchema,
  integrationConnectionListResponseSchema,
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
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
const JIRA_TOKEN = 'jira-data-center-test-token';
const ROTATED_JIRA_TOKEN = 'jira-data-center-rotated-token';

describe('Jira Data Center integration', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let jira: ReturnType<typeof createServer>;
  let jiraBaseUrl = '';
  let email = '';
  let organizationId = '';
  let organizationToken = '';
  let connectionId = '';

  beforeAll(async () => {
    jira = createServer(handleJiraRequest);
    await new Promise<void>((resolve) => jira.listen(0, '127.0.0.1', resolve));
    jiraBaseUrl = `http://127.0.0.1:${(jira.address() as AddressInfo).port}`;

    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for Jira integration tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `jira-integration-${suffix}@example.com`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { displayName: 'Jira Owner', email, password: PASSWORD, termsAccepted: true },
    });
    const session = sessionResponseSchema.parse(registration.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    const organization = await admin.organization.create({
      data: { name: 'Jira Workspace', slug: `jira-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.create({
      data: { organizationId, userId: user.id, role: 'OWNER' },
    });
    const token = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organization.slug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    organizationToken = token.json().accessToken as string;
  });

  it('rejects invalid Jira credentials without persisting them', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/jira/connections',
      headers: {
        authorization: `Bearer ${organizationToken}`,
        'idempotency-key': 'jira-invalid-connection',
      },
      payload: {
        name: 'Invalid Jira',
        baseUrl: jiraBaseUrl,
        personalAccessToken: 'invalid-token',
      },
    });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('integration_authentication_failed');
    await expect(admin.integrationConnection.count({ where: { organizationId } })).resolves.toBe(0);
  });

  afterAll(async () => {
    if (admin) {
      await admin.integrationConnection.deleteMany({ where: { organizationId } });
      await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
      await admin.membership.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
      await admin.user.deleteMany({ where: { email } });
      await admin.$disconnect();
    }
    if (app) await app.close();
    if (jira)
      await new Promise<void>((resolve, reject) =>
        jira.close((error) => (error ? reject(error) : resolve())),
      );
  });

  it('verifies and stores an encrypted, idempotent connection', async () => {
    const request = {
      name: 'Internal Jira',
      baseUrl: `${jiraBaseUrl}/`,
      personalAccessToken: JIRA_TOKEN,
    };
    const headers = {
      authorization: `Bearer ${organizationToken}`,
      'idempotency-key': 'jira-create-connection',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/jira/connections',
      headers,
      payload: request,
    });

    expect(first.statusCode, first.body).toBe(201);
    const created = createJiraDataCenterConnectionResponseSchema.parse(first.json());
    connectionId = created.connection.id;
    expect(created).toMatchObject({
      connection: {
        provider: 'jira',
        deployment: 'data_center',
        baseUrl: jiraBaseUrl,
        status: 'active',
      },
      identity: { id: 'qa-owner', displayName: 'QA Owner' },
    });
    expect(first.body).not.toContain(JIRA_TOKEN);

    const stored = await admin.integrationConnection.findFirstOrThrow({
      where: { organizationId, id: connectionId },
      select: { encryptedCredentials: true },
    });
    expect(JSON.stringify(stored.encryptedCredentials)).not.toContain(JIRA_TOKEN);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/jira/connections',
      headers,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(created);
    await expect(admin.integrationConnection.count({ where: { organizationId } })).resolves.toBe(1);

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations/jira/connections',
      headers,
      payload: { ...request, name: 'Different name' },
    });
    expect(conflict.statusCode, conflict.body).toBe(409);
  });

  it('lists remote projects and searches issues with JQL', async () => {
    const beforeRotation = await admin.integrationConnection.findFirstOrThrow({
      where: { organizationId, id: connectionId },
      select: { encryptedCredentials: true },
    });
    const rotated = await app.inject({
      method: 'PUT',
      url: `/api/v1/integrations/jira/connections/${connectionId}/credentials`,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { personalAccessToken: ROTATED_JIRA_TOKEN },
    });
    expect(rotated.statusCode, rotated.body).toBe(200);
    expect(rotated.body).not.toContain(ROTATED_JIRA_TOKEN);
    const afterRotation = await admin.integrationConnection.findFirstOrThrow({
      where: { organizationId, id: connectionId },
      select: { encryptedCredentials: true },
    });
    expect(afterRotation.encryptedCredentials).not.toEqual(beforeRotation.encryptedCredentials);

    const projectsResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/jira/connections/${connectionId}/projects`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(projectsResponse.statusCode, projectsResponse.body).toBe(200);
    expect(jiraProjectListResponseSchema.parse(projectsResponse.json()).projects).toEqual([
      { id: '10000', key: 'QA', name: 'Quality', projectType: 'software' },
    ]);

    const searchResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/jira/connections/${connectionId}/issues/search`,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { jql: 'project = QA AND status != Done', maxResults: 20 },
    });
    expect(searchResponse.statusCode, searchResponse.body).toBe(200);
    const search = jiraIssueSearchResponseSchema.parse(searchResponse.json());
    expect(search.total).toBe(1);
    expect(search.issues[0]).toMatchObject({
      key: 'QA-42',
      summary: 'Checkout fails',
      url: `${jiraBaseUrl}/browse/QA-42`,
    });
  });

  it('lists public metadata without exposing credentials and disconnects cleanly', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/jira/connections',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);
    const response = integrationConnectionListResponseSchema.parse(list.json());
    expect(response.connections).toHaveLength(1);
    expect(list.body).not.toContain(JIRA_TOKEN);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/integrations/jira/connections/${connectionId}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(removed.statusCode, removed.body).toBe(204);
    const erased = await admin.integrationConnection.findFirstOrThrow({
      where: { organizationId, id: connectionId },
      select: { encryptedCredentials: true },
    });
    expect(erased.encryptedCredentials).toEqual({ deleted: true });

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/jira/connections/${connectionId}/projects`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(afterDelete.statusCode, afterDelete.body).toBe(404);
  });
});

function handleJiraRequest(request: IncomingMessage, response: ServerResponse): void {
  const acceptedTokens = new Set([`Bearer ${JIRA_TOKEN}`, `Bearer ${ROTATED_JIRA_TOKEN}`]);
  if (!acceptedTokens.has(request.headers.authorization ?? '')) {
    sendJson(response, 401, { message: 'Unauthorized' });
    return;
  }
  const url = new URL(request.url ?? '/', 'http://jira.test');
  if (request.method === 'GET' && url.pathname === '/rest/api/2/myself') {
    sendJson(response, 200, { key: 'qa-owner', displayName: 'QA Owner' });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/rest/api/2/project') {
    sendJson(response, 200, [
      { id: '10000', key: 'QA', name: 'Quality', projectTypeKey: 'software' },
    ]);
    return;
  }
  if (request.method === 'POST' && url.pathname === '/rest/api/2/search') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const query = JSON.parse(body) as { startAt: number; maxResults: number };
      sendJson(response, 200, {
        startAt: query.startAt,
        maxResults: query.maxResults,
        total: 1,
        issues: [
          {
            id: '1042',
            key: 'QA-42',
            fields: {
              summary: 'Checkout fails',
              status: { id: '1', name: 'Open' },
              issuetype: { id: '10001', name: 'Bug' },
            },
          },
        ],
      });
    });
    return;
  }
  sendJson(response, 404, { message: 'Not found' });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}
