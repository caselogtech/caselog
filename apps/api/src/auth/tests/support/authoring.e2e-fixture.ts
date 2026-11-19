import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  createApiTokenResponseSchema,
  sessionResponseSchema,
  type ApiTokenScope,
} from '@caselog/schemas';
import { expect } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

export type AuthoringFixture = {
  app: NestFastifyApplication;
  admin: PrismaClient;
  application: PrismaClient;
  organizationId: string;
  foreignOrganizationId: string;
  ownerId: string;
  ownerToken: string;
  projectSlug: string;
  projectId: string;
  suiteId: string;
  foreignSuiteId: string;
  sectionId: string;
  foreignSectionId: string;
  foreignCaseId: string;
  email: string;
};

export async function createAuthoringFixture(): Promise<AuthoringFixture> {
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  const applicationUrl = process.env.DATABASE_URL;
  if (!migrationUrl || !applicationUrl)
    throw new Error('Database URLs are required for authoring tests');
  const admin = createPrismaClient(migrationUrl);
  const application = createPrismaClient(applicationUrl);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const suffix = randomUUID().slice(0, 8);
  const email = `authoring-${suffix}@example.com`;
  const registration = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      displayName: 'Authoring Owner',
      email,
      password: 'correct horse battery staple',
      termsAccepted: true,
    },
  });
  expect(registration.statusCode).toBe(201);
  const session = sessionResponseSchema.parse(registration.json());
  const owner = await admin.user.findUniqueOrThrow({ where: { email } });
  const organization = await admin.organization.create({
    data: { name: 'Agent workspace', slug: `agent-${suffix}` },
  });
  const foreign = await admin.organization.create({
    data: { name: 'Foreign agent workspace', slug: `foreign-${suffix}` },
  });
  await admin.membership.create({
    data: { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
  });
  const exchange = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/organizations/${organization.slug}/token`,
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  expect(exchange.statusCode).toBe(200);
  const ownerToken: string = exchange.json().accessToken;
  const projectSlug = 'agent-project';
  const structures = [];
  for (const organizationId of [organization.id, foreign.id]) {
    const project = await admin.project.create({
      data: { organizationId, slug: projectSlug, name: 'Agent project', key: 'AGENT' },
    });
    const suite = await admin.suite.create({
      data: { organizationId, projectId: project.id, name: 'Main' },
    });
    const section = await admin.section.create({
      data: {
        organizationId,
        projectId: project.id,
        suiteId: suite.id,
        name: 'Payments',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    structures.push({ project, suite, section });
  }
  const [local, other] = structures;
  if (!local || !other) throw new Error('Missing authoring test structures');
  const foreignCase = await admin.testCase.create({
    data: {
      organizationId: foreign.id,
      projectId: other.project.id,
      suiteId: other.suite.id,
      sectionId: other.section.id,
      caseNumber: 1n,
    },
  });
  return {
    app,
    admin,
    application,
    organizationId: organization.id,
    foreignOrganizationId: foreign.id,
    ownerId: owner.id,
    ownerToken,
    projectSlug,
    projectId: local.project.id,
    suiteId: local.suite.id,
    foreignSuiteId: other.suite.id,
    sectionId: local.section.id,
    foreignSectionId: other.section.id,
    foreignCaseId: foreignCase.id,
    email,
  };
}

export async function issueAuthoringToken(fixture: AuthoringFixture, scopes: ApiTokenScope[]) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/api-tokens',
    headers: { authorization: `Bearer ${fixture.ownerToken}` },
    payload: {
      name: 'Agent access',
      scopes,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
  });
  expect(response.statusCode).toBe(201);
  return createApiTokenResponseSchema.parse(response.json());
}

export async function destroyAuthoringFixture(
  fixture: AuthoringFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  const { admin, application, app } = fixture;
  const organizationId = { in: [fixture.organizationId, fixture.foreignOrganizationId] };
  try {
    await admin.auditLog.deleteMany({ where: { organizationId } });
    await admin.apiToken.deleteMany({ where: { organizationId } });
    await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
    await admin.readinessGate.deleteMany({ where: { organizationId } });
    await admin.releasePolicyVersion.deleteMany({ where: { organizationId } });
    await admin.releasePolicy.deleteMany({ where: { organizationId } });
    await admin.testCase.updateMany({
      where: { organizationId },
      data: { currentVersionId: null },
    });
    await admin.testCaseVersion.deleteMany({ where: { organizationId } });
    await admin.testCase.deleteMany({ where: { organizationId } });
    await admin.section.deleteMany({ where: { organizationId } });
    await admin.suite.deleteMany({ where: { organizationId } });
    await admin.project.deleteMany({ where: { organizationId } });
    await admin.membership.deleteMany({ where: { organizationId } });
    await admin.organization.deleteMany({ where: { id: organizationId } });
    await admin.user.deleteMany({ where: { email: fixture.email } });
  } finally {
    await Promise.all([admin.$disconnect(), application.$disconnect(), app.close()]);
  }
}
