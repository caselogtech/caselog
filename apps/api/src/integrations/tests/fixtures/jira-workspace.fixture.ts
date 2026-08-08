import { randomUUID } from 'node:crypto';
import { sessionResponseSchema } from '@caselog/schemas';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { PrismaClient } from '../../../generated/prisma/client';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import { createJiraResultFixture, type JiraResultFixture } from './jira-result.fixture';

const PASSWORD = 'correct horse battery staple';

export type JiraWorkspaceFixture = JiraResultFixture & {
  organizationId: string;
  organizationToken: string;
  readOnlyToken: string;
  cleanup(): Promise<void>;
};

export async function createJiraWorkspaceFixture(
  admin: PrismaClient,
  app: NestFastifyApplication,
): Promise<JiraWorkspaceFixture> {
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `jira-integration-${suffix}@example.com`;
  const ownerSession = await register(app, 'Jira Owner', ownerEmail);
  const owner = await admin.user.findUniqueOrThrow({ where: { email: ownerEmail } });
  const organization = await admin.organization.create({
    data: { name: 'Jira Workspace', slug: `jira-${suffix}` },
  });
  await admin.membership.create({
    data: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
  });
  const organizationToken = await issueOrganizationToken(app, organization.slug, ownerSession);
  const result = await createJiraResultFixture(
    admin,
    app,
    organization.id,
    organizationToken,
    owner.id,
  );

  const readOnlyEmail = `jira-reader-${suffix}@example.com`;
  const readOnlySession = await register(app, 'Jira Reader', readOnlyEmail);
  const readOnlyUser = await admin.user.findUniqueOrThrow({ where: { email: readOnlyEmail } });
  await admin.membership.create({
    data: { organizationId: organization.id, userId: readOnlyUser.id, role: 'READ_ONLY' },
  });
  const readOnlyToken = await issueOrganizationToken(app, organization.slug, readOnlySession);

  return {
    ...result,
    organizationId: organization.id,
    organizationToken,
    readOnlyToken,
    cleanup: () => cleanupWorkspace(admin, app, organization.id, [ownerEmail, readOnlyEmail]),
  };
}

export async function createForeignCaseFixture(
  admin: PrismaClient,
  projectSlug: string,
): Promise<{ caseId: string; cleanup(): Promise<void> }> {
  const organization = await admin.organization.create({
    data: { name: 'Foreign Jira Workspace', slug: `foreign-jira-${randomUUID().slice(0, 8)}` },
  });
  const project = await admin.project.create({
    data: {
      organizationId: organization.id,
      key: 'FJIRA',
      slug: projectSlug,
      name: 'Foreign Jira project',
    },
  });
  const suite = await admin.suite.create({
    data: { organizationId: organization.id, projectId: project.id, name: 'Suite' },
  });
  const section = await admin.section.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      suiteId: suite.id,
      name: 'Section',
      path: `/${randomUUID()}`,
      depth: 0,
    },
  });
  const testCase = await admin.testCase.create({
    data: {
      organizationId: organization.id,
      projectId: project.id,
      suiteId: suite.id,
      sectionId: section.id,
      caseNumber: 1,
    },
  });

  return {
    caseId: testCase.id,
    cleanup: async () => {
      await admin.testCase.deleteMany({ where: { organizationId: organization.id } });
      await admin.section.deleteMany({ where: { organizationId: organization.id } });
      await admin.suite.deleteMany({ where: { organizationId: organization.id } });
      await admin.project.deleteMany({ where: { organizationId: organization.id } });
      await admin.organization.delete({ where: { id: organization.id } });
    },
  };
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

async function cleanupWorkspace(
  admin: PrismaClient,
  app: NestFastifyApplication,
  organizationId: string,
  emails: string[],
): Promise<void> {
  const attachments = await admin.attachment.findMany({
    where: { organizationId },
    select: { storageKey: true },
  });
  const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
  await Promise.allSettled(attachments.map(({ storageKey }) => storage.delete(storageKey)));
  await admin.auditLog.deleteMany({ where: { organizationId } });
  await admin.issueCreationRequest.deleteMany({ where: { organizationId } });
  await admin.issueLink.deleteMany({ where: { organizationId } });
  await admin.integrationConnection.deleteMany({ where: { organizationId } });
  await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
  await admin.attachment.deleteMany({ where: { organizationId } });
  await admin.uploadSession.deleteMany({ where: { organizationId } });
  await admin.testStepResult.deleteMany({ where: { organizationId } });
  await admin.testResult.deleteMany({ where: { organizationId } });
  await admin.testRunItem.deleteMany({ where: { organizationId } });
  await admin.testRun.deleteMany({ where: { organizationId } });
  await admin.testCase.updateMany({ where: { organizationId }, data: { currentVersionId: null } });
  await admin.testCaseVersion.deleteMany({ where: { organizationId } });
  await admin.testCase.deleteMany({ where: { organizationId } });
  await admin.resultStatus.deleteMany({ where: { organizationId } });
  await admin.section.deleteMany({ where: { organizationId } });
  await admin.suite.deleteMany({ where: { organizationId } });
  await admin.project.deleteMany({ where: { organizationId } });
  await admin.usageCounter.deleteMany({ where: { organizationId } });
  await admin.membership.deleteMany({ where: { organizationId } });
  await admin.organization.deleteMany({ where: { id: organizationId } });
  await admin.user.deleteMany({ where: { email: { in: emails } } });
}
