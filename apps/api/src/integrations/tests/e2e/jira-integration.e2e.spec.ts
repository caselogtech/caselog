import {
  auditLogListResponseSchema,
  createJiraDefectResponseSchema,
  createJiraDataCenterConnectionResponseSchema,
  integrationConnectionListResponseSchema,
  issueLinkListResponseSchema,
  issueLinkResponseSchema,
  jiraIssueSearchResponseSchema,
  jiraProjectListResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { IssueStatusSyncService } from '../../application/services/issue-status-sync.service';
import {
  JIRA_TOKEN,
  type JiraServerFixture,
  ROTATED_JIRA_TOKEN,
  startJiraServer,
} from '../fixtures/jira-server.fixture';
import {
  createForeignCaseFixture,
  createJiraWorkspaceFixture,
  type JiraWorkspaceFixture,
} from '../fixtures/jira-workspace.fixture';

describe('Jira Data Center integration', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let jira: JiraServerFixture;
  let workspace: JiraWorkspaceFixture;
  let jiraBaseUrl = '';
  let organizationId = '';
  let organizationToken = '';
  let readOnlyToken = '';
  let connectionId = '';
  let caseId = '';
  let runId = '';
  let itemId = '';
  let resultId = '';
  let attachmentId = '';
  let projectSlug = '';

  beforeAll(async () => {
    jira = await startJiraServer();
    jiraBaseUrl = jira.baseUrl;

    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for Jira integration tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    workspace = await createJiraWorkspaceFixture(admin, app);
    ({
      organizationId,
      organizationToken,
      readOnlyToken,
      projectSlug,
      caseId,
      runId,
      itemId,
      resultId,
      attachmentId,
    } = workspace);
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
    if (workspace) await workspace.cleanup();
    if (admin) await admin.$disconnect();
    if (app) await app.close();
    if (jira) await jira.close();
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

    const auditResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs?action=integration.connection_created',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(auditResponse.statusCode, auditResponse.body).toBe(200);
    expect(auditLogListResponseSchema.parse(auditResponse.json()).items).toEqual([
      expect.objectContaining({
        action: 'integration.connection_created',
        target: { type: 'integration_connection', id: connectionId },
        metadata: { provider: 'jira', deployment: 'data_center', authType: 'pat' },
      }),
    ]);
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

  it('links an existing Jira issue to a test case without duplicates', async () => {
    const url = `/api/v1/projects/${projectSlug}/cases/${caseId}/integrations/jira/issues`;
    const request = { connectionId, issueKey: 'QA-42' };
    const first = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: request,
    });
    expect(first.statusCode, first.body).toBe(201);
    const linked = issueLinkResponseSchema.parse(first.json()).link;
    expect(linked).toMatchObject({
      linkType: 'requirement',
      externalIssueKey: 'QA-42',
      title: 'Checkout fails',
      status: { id: '1', name: 'Open' },
    });

    const replay = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(issueLinkResponseSchema.parse(replay.json()).link.id).toBe(linked.id);

    const list = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(issueLinkListResponseSchema.parse(list.json()).links).toHaveLength(1);
  });

  it('hides issue links across tenant boundaries', async () => {
    const foreignCase = await createForeignCaseFixture(admin, projectSlug);

    try {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${projectSlug}/cases/${foreignCase.caseId}/integrations/jira/issues`,
        headers: { authorization: `Bearer ${organizationToken}` },
      });
      expect(response.statusCode, response.body).toBe(404);
    } finally {
      await foreignCase.cleanup();
    }
  });

  it('allows read-only members to list but not mutate issue links', async () => {
    const caseUrl = `/api/v1/projects/${projectSlug}/cases/${caseId}/integrations/jira/issues`;
    const resultUrl = `/api/v1/projects/${projectSlug}/runs/${runId}/items/${itemId}/results/${resultId}/integrations/jira/issues`;
    const headers = { authorization: `Bearer ${readOnlyToken}` };

    const list = await app.inject({ method: 'GET', url: caseUrl, headers });
    expect(list.statusCode, list.body).toBe(200);

    const link = await app.inject({
      method: 'POST',
      url: resultUrl,
      headers,
      payload: { connectionId, issueKey: 'QA-42' },
    });
    expect(link.statusCode, link.body).toBe(403);
    expect(link.json().error.code).toBe('insufficient_permissions');

    const defect = await app.inject({
      method: 'POST',
      url: `${resultUrl}/defects`,
      headers: { ...headers, 'idempotency-key': 'read-only-defect' },
      payload: { connectionId, jiraProjectKey: 'QA' },
    });
    expect(defect.statusCode, defect.body).toBe(403);
    expect(defect.json().error.code).toBe('insufficient_permissions');

    const auditResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs',
      headers,
    });
    expect(auditResponse.statusCode, auditResponse.body).toBe(403);
  });

  it('synchronizes Jira status snapshots and records missing remote issues', async () => {
    const url = `/api/v1/projects/${projectSlug}/cases/${caseId}/integrations/jira/issues`;
    const sync = app.get(IssueStatusSyncService);
    jira.state.linkedIssueStatus = { id: '3', name: 'Done' };

    await sync.syncConnection(organizationId, connectionId);
    const refreshed = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(issueLinkListResponseSchema.parse(refreshed.json()).links[0]).toMatchObject({
      status: { id: '3', name: 'Done' },
      lastSyncedAt: expect.any(String),
      lastSyncAttemptAt: expect.any(String),
      syncError: null,
    });

    jira.state.linkedIssueMissing = true;
    await sync.syncConnection(organizationId, connectionId);
    const missing = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(issueLinkListResponseSchema.parse(missing.json()).links[0]).toMatchObject({
      status: { id: '3', name: 'Done' },
      syncError: 'Jira rejected the request with HTTP 404',
    });

    jira.state.linkedIssueMissing = false;
    await sync.syncConnection(organizationId, connectionId);
    const recovered = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(issueLinkListResponseSchema.parse(recovered.json()).links[0]?.syncError).toBeNull();
    await expect(
      admin.integrationConnection.findFirst({
        where: { organizationId, id: connectionId },
        select: { status: true, lastSyncedAt: true, lastError: true },
      }),
    ).resolves.toMatchObject({ status: 'active', lastSyncedAt: expect.any(Date), lastError: null });
  });

  it('creates an idempotent Jira defect with failure context and evidence', async () => {
    const url = `/api/v1/projects/${projectSlug}/runs/${runId}/items/${itemId}/results/${resultId}/integrations/jira/issues/defects`;
    const headers = {
      authorization: `Bearer ${organizationToken}`,
      'idempotency-key': 'create-checkout-defect',
    };
    const request = {
      connectionId,
      jiraProjectKey: 'QA',
      issueType: 'Bug',
      environment: 'Chrome 140 / staging',
      attachmentIds: [attachmentId],
    };
    const first = await app.inject({ method: 'POST', url, headers, payload: request });
    expect(first.statusCode, first.body).toBe(201);
    const created = createJiraDefectResponseSchema.parse(first.json());
    expect(created).toMatchObject({
      link: { linkType: 'defect', externalIssueKey: 'QA-99', status: null },
      attachmentWarnings: [],
    });
    expect(jira.state.createIssueCount).toBe(1);
    expect(jira.state.createdIssuePayload?.fields?.summary).toContain('Card checkout completes');
    expect(jira.state.createdIssuePayload?.fields?.description).toContain('build-42');
    expect(jira.state.createdIssuePayload?.fields?.description).toContain('Chrome 140 / staging');
    expect(jira.state.createdIssuePayload?.fields?.description).toContain(
      'The payment gateway returned HTTP 500.',
    );
    expect(jira.state.createdIssuePayload?.fields?.description).toContain(`results/${resultId}`);
    expect(jira.state.uploadedEvidence).toContain('checkout-failure.png');

    const replay = await app.inject({ method: 'POST', url, headers, payload: request });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(created);
    expect(jira.state.createIssueCount).toBe(1);

    const conflict = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { ...request, summary: 'Different summary' },
    });
    expect(conflict.statusCode, conflict.body).toBe(409);

    const links = await app.inject({
      method: 'GET',
      url: url.replace('/defects', ''),
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(issueLinkListResponseSchema.parse(links.json()).links).toHaveLength(1);
  });

  it('does not retry automatically when Jira creation has an ambiguous outcome', async () => {
    const url = `/api/v1/projects/${projectSlug}/runs/${runId}/items/${itemId}/results/${resultId}/integrations/jira/issues/defects`;
    const headers = {
      authorization: `Bearer ${organizationToken}`,
      'idempotency-key': 'ambiguous-jira-create',
    };
    const request = {
      connectionId,
      jiraProjectKey: 'AMBIG',
      attachmentIds: [],
    };
    const first = await app.inject({ method: 'POST', url, headers, payload: request });
    expect(first.statusCode, first.body).toBe(502);
    expect(jira.state.createIssueCount).toBe(2);

    const retry = await app.inject({ method: 'POST', url, headers, payload: request });
    expect(retry.statusCode, retry.body).toBe(409);
    expect(retry.json().error.code).toBe('issue_creation_requires_reconciliation');
    expect(jira.state.createIssueCount).toBe(2);
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

    await expect(
      admin.auditLog.findMany({
        where: { organizationId, targetId: connectionId },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      }),
    ).resolves.toEqual([
      { action: 'integration.connection_created' },
      { action: 'integration.credentials_rotated' },
      { action: 'integration.connection_disconnected' },
    ]);
  });
});
