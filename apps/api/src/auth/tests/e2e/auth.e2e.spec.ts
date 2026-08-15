import { createHash, randomUUID } from 'node:crypto';
import { sessionResponseSchema } from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../../core/storage/application/ports/storage.provider';
import { hashAccountToken } from '../../domain/models/account-token';

const PASSWORD = 'correct horse battery staple';

function cookieFrom(response: {
  headers: Record<string, number | string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string') {
    throw new Error('Expected a Set-Cookie header');
  }
  return value.split(';')[0] ?? value;
}

describe('authentication API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let email: string;
  let outsiderEmail: string;
  let organizationId: string | undefined;
  let provisionedOrganizationId: string | undefined;
  const additionalProvisionedOrganizationIds: string[] = [];
  let organizationSlug: string;
  let accessToken: string;
  let outsiderAccessToken: string;
  let organizationAccessToken: string;
  let authSectionId: string;
  let authUserId: string;
  let editableCaseId: string;
  let originalVersionId: string;
  let createdRunId: string;
  let createdRunItemId: string;
  let createdResultId: string;
  let createdAttachmentResultId: string;
  let createdAttachmentId: string;
  let createdProjectSlug: string;
  let registrationCookie: string;
  let registrationResponse: Awaited<ReturnType<NestFastifyApplication['inject']>>;

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) {
      throw new Error('MIGRATION_DATABASE_URL is required for authentication tests');
    }

    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `auth-${suffix}@example.com`;
    outsiderEmail = `auth-outsider-${suffix}@example.com`;
    organizationSlug = `auth-test-${suffix}`;

    registrationResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Authentication Tester',
        email,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const registration = sessionResponseSchema.parse(registrationResponse.json());
    accessToken = registration.accessToken;
    registrationCookie = cookieFrom(registrationResponse);

    const organization = await admin.organization.create({
      data: { name: 'Authentication Test', slug: organizationSlug },
    });
    organizationId = organization.id;
    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    authUserId = user.id;
    await admin.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });
    await admin.project.createMany({
      data: [
        {
          organizationId: organization.id,
          key: 'AUTH',
          slug: 'authentication',
          name: 'Authentication Project',
        },
        {
          organizationId: organization.id,
          key: 'SECOND',
          slug: 'second',
          name: 'Second Project',
        },
      ],
    });
    const authProject = await admin.project.findUniqueOrThrow({
      where: {
        organizationId_slug: { organizationId: organization.id, slug: 'authentication' },
      },
    });
    await admin.resultStatus.createMany({
      data: [
        {
          organizationId: organization.id,
          projectId: authProject.id,
          key: 'untested',
          name: 'Untested',
          color: '#64748B',
          icon: 'circle',
          position: 0,
        },
        {
          organizationId: organization.id,
          projectId: authProject.id,
          key: 'passed',
          name: 'Passed',
          color: '#16A34A',
          icon: 'check',
          isFinal: true,
          position: 1,
        },
        {
          organizationId: organization.id,
          projectId: authProject.id,
          key: 'failed',
          name: 'Failed',
          color: '#DC2626',
          icon: 'x',
          isFinal: true,
          countsAsFailure: true,
          position: 2,
        },
      ],
    });
    const suite = await admin.suite.create({
      data: {
        organizationId: organization.id,
        projectId: authProject.id,
        name: 'Authentication suite',
      },
    });
    const section = await admin.section.create({
      data: {
        organizationId: organization.id,
        projectId: authProject.id,
        suiteId: suite.id,
        name: 'Sign in',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    authSectionId = section.id;
    for (const [index, title] of [
      'Sign in with valid credentials',
      'Reject an invalid password',
    ].entries()) {
      const testCase = await admin.testCase.create({
        data: {
          organizationId: organization.id,
          projectId: authProject.id,
          suiteId: suite.id,
          sectionId: section.id,
          caseNumber: BigInt(index + 1),
          automationId: index === 0 ? 'auth.valid-login' : null,
        },
      });
      const version = await admin.testCaseVersion.create({
        data: {
          organizationId: organization.id,
          testCaseId: testCase.id,
          version: 1,
          title,
          template: 'STEPS',
          content: { steps: [{ action: 'Execute the authentication scenario' }] },
          createdById: user.id,
        },
      });
      await admin.testCase.update({
        where: { organizationId_id: { organizationId: organization.id, id: testCase.id } },
        data: { currentVersionId: version.id },
      });
    }
    await admin.project.update({
      where: { organizationId_id: { organizationId: organization.id, id: authProject.id } },
      data: { nextCaseNumber: 3n },
    });
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [
        organizationId,
        provisionedOrganizationId,
        ...additionalProvisionedOrganizationIds,
      ].filter((id): id is string => Boolean(id));
      if (organizationIds.length > 0) {
        const [attachments, uploads] = await Promise.all([
          admin.attachmentBlob.findMany({
            where: { organizationId: { in: organizationIds } },
            select: { storageKey: true },
          }),
          admin.uploadSession.findMany({
            where: { organizationId: { in: organizationIds } },
            select: { storageKey: true },
          }),
        ]);
        const storage = app.get<StorageProvider>(STORAGE_PROVIDER);
        await Promise.allSettled(
          [...attachments, ...uploads].map(({ storageKey }) => storage.delete(storageKey)),
        );
        await admin.auditLog.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.attachment.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.attachmentBlob.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.uploadSession.deleteMany({
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
        await admin.testCase.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.section.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await admin.suite.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await admin.resultStatus.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
        await admin.usageCounter.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.membership.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      }
      await admin.user.deleteMany({ where: { email: { in: [email, outsiderEmail] } } });
      await admin.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  it('registers a user and sets an opaque HttpOnly refresh cookie', () => {
    expect(registrationResponse.statusCode, registrationResponse.body).toBe(201);
    expect(registrationResponse.headers['cache-control']).toBe('no-store');
    expect(registrationResponse.headers['set-cookie']).toContain('HttpOnly');
    expect(registrationResponse.headers['set-cookie']).toContain('SameSite=Lax');
    expect(registrationCookie).toMatch(/^caselog_refresh=[A-Za-z0-9_-]+$/);
  });

  it('uses the same failure response for unknown emails and incorrect passwords', async () => {
    const [unknownEmail, wrongPassword] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: `unknown-${email}`, password: PASSWORD },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: `${PASSWORD}!` },
      }),
    ]);

    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    const { requestId: unknownRequestId, ...unknownError } = unknownEmail.json().error;
    const { requestId: wrongPasswordRequestId, ...wrongPasswordError } = wrongPassword.json().error;
    expect(unknownError).toEqual(wrongPasswordError);
    expect(unknownRequestId).toEqual(expect.any(String));
    expect(wrongPasswordRequestId).toEqual(expect.any(String));
  });

  it('returns the authenticated user for an active bearer session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      email,
      displayName: 'Authentication Tester',
      emailVerified: false,
    });
  });

  it('verifies an email token exactly once', async () => {
    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    const firstResend = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verification',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const secondResend = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verification',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(firstResend.statusCode).toBe(202);
    expect(secondResend.statusCode).toBe(202);
    await expect(
      admin.accountToken.count({
        where: {
          userId: user.id,
          purpose: 'EMAIL_VERIFICATION',
          consumedAt: null,
          revokedAt: null,
        },
      }),
    ).resolves.toBe(1);

    const token = `${randomUUID()}${randomUUID()}`;
    await admin.accountToken.updateMany({
      where: { userId: user.id, purpose: 'EMAIL_VERIFICATION', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await admin.accountToken.create({
      data: {
        userId: user.id,
        purpose: 'EMAIL_VERIFICATION',
        tokenHash: hashAccountToken(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verify',
      payload: { token },
    });
    expect(verified.statusCode, verified.body).toBe(200);
    expect(verified.json()).toEqual({ verified: true });

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/email/verify',
      payload: { token },
    });
    expect(reused.statusCode).toBe(400);
    await expect(admin.user.findUniqueOrThrow({ where: { email } })).resolves.toMatchObject({
      emailVerifiedAt: expect.any(Date),
    });
  });

  it('issues an organization-scoped token only to a tenant member', async () => {
    const memberResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organizationSlug}/token`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(memberResponse.statusCode, memberResponse.body).toBe(200);
    expect(memberResponse.json()).toMatchObject({
      organization: { id: organizationId, slug: organizationSlug },
      role: 'owner',
    });
    organizationAccessToken = memberResponse.json().accessToken as string;

    const outsiderRegistration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Outsider',
        email: outsiderEmail,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const outsider = sessionResponseSchema.parse(outsiderRegistration.json());
    outsiderAccessToken = outsider.accessToken;
    const deniedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organizationSlug}/token`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });

    expect(deniedResponse.statusCode).toBe(404);
    expect(deniedResponse.json()).toEqual({
      error: {
        code: 'not_found',
        message: 'The requested resource was not found',
        details: { resource: 'organization' },
        requestId: expect.any(String),
      },
    });
  });

  it('requires an organization token and lists only its tenant projects', async () => {
    const sessionTokenResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(sessionTokenResponse.statusCode).toBe(401);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?limit=1',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      items: [expect.objectContaining({ activeRunCount: 0 })],
      nextCursor: expect.any(String),
    });
    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/v1/projects?limit=1&cursor=${response.json().nextCursor as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(secondPage.statusCode, secondPage.body).toBe(200);
    expect(secondPage.json().nextCursor).toBeNull();
    const projectItems = [...response.json().items, ...secondPage.json().items] as Array<{
      key: string;
      caseCount: number;
    }>;
    expect(projectItems.map(({ key }) => key).sort()).toEqual(['AUTH', 'SECOND']);
    expect(projectItems.find(({ key }) => key === 'AUTH')?.caseCount).toBe(2);
    expect(projectItems.find(({ key }) => key === 'SECOND')?.caseCount).toBe(0);

    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?limit=101',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidLimit.json().error.code).toBe('validation_failed');

    const invalidState = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?state=deleted',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(invalidState.statusCode).toBe(400);
    expect(invalidState.json().error.code).toBe('validation_failed');
  });

  it('creates a ready-to-use project and archives only projects without open runs', async () => {
    const suffix = randomUUID().slice(0, 8);
    createdProjectSlug = `tooling-${suffix}`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Tooling Project', key: 'tools', slug: createdProjectSlug },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      project: {
        key: 'TOOLS',
        slug: createdProjectSlug,
        name: 'Tooling Project',
        state: 'active',
        caseCount: 0,
        activeRunCount: 0,
      },
    });
    const projectId = created.json().project.id as string;
    const [statuses, suite] = await Promise.all([
      admin.resultStatus.findMany({
        where: { organizationId, projectId },
        orderBy: { position: 'asc' },
        select: { key: true },
      }),
      admin.suite.findFirst({
        where: { organizationId, projectId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);
    expect(statuses.map(({ key }) => key)).toEqual([
      'untested',
      'passed',
      'failed',
      'blocked',
      'retest',
      'skipped',
    ]);
    expect(suite).toMatchObject({ name: 'Main suite' });
    await expect(
      admin.section.findFirst({
        where: { organizationId, projectId, suiteId: suite?.id },
        select: { name: true, depth: true },
      }),
    ).resolves.toEqual({ name: 'Getting started', depth: 0 });

    const duplicateKey = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Duplicate key', key: 'TOOLS', slug: `other-${suffix}` },
    });
    expect(duplicateKey.statusCode, duplicateKey.body).toBe(409);
    expect(duplicateKey.json().error.code).toBe('project_key_taken');
    const duplicateSlug = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        name: 'Duplicate slug',
        key: `T${suffix.toUpperCase()}`,
        slug: createdProjectSlug,
      },
    });
    expect(duplicateSlug.statusCode, duplicateSlug.body).toBe(409);
    expect(duplicateSlug.json().error.code).toBe('project_slug_taken');

    const archivedSlug = `archive-${suffix}`;
    const archiveCandidate = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Archive Candidate', key: `A${suffix.toUpperCase()}`, slug: archivedSlug },
    });
    expect(archiveCandidate.statusCode, archiveCandidate.body).toBe(201);
    const archived = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${archivedSlug}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archived.statusCode, archived.body).toBe(204);
    await expect(
      admin.project.findUnique({
        where: {
          organizationId_slug: { organizationId: organizationId as string, slug: archivedSlug },
        },
        select: { deletedAt: true },
      }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date) });

    const activeProjects = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?limit=100',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(activeProjects.statusCode, activeProjects.body).toBe(200);
    expect(activeProjects.json().items.map(({ slug }: { slug: string }) => slug)).not.toContain(
      archivedSlug,
    );

    const archivedProjects = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?state=archived',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedProjects.statusCode, archivedProjects.body).toBe(200);
    expect(archivedProjects.json().items).toEqual([
      expect.objectContaining({
        id: archiveCandidate.json().project.id,
        slug: archivedSlug,
        state: 'archived',
      }),
    ]);

    const reuseArchivedKey = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        name: 'Reuse archived key',
        key: `A${suffix.toUpperCase()}`,
        slug: `reuse-key-${suffix}`,
      },
    });
    expect(reuseArchivedKey.statusCode, reuseArchivedKey.body).toBe(409);
    expect(reuseArchivedKey.json().error.code).toBe('project_key_taken');

    const reuseArchivedSlug = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        name: 'Reuse archived slug',
        key: `R${suffix.toUpperCase()}`,
        slug: archivedSlug,
      },
    });
    expect(reuseArchivedSlug.statusCode, reuseArchivedSlug.body).toBe(409);
    expect(reuseArchivedSlug.json().error.code).toBe('project_slug_taken');

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${archivedSlug}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json()).toEqual({
      projectId: archiveCandidate.json().project.id,
      state: 'active',
    });
    const restoredAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${archivedSlug}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restoredAgain.statusCode, restoredAgain.body).toBe(201);
    expect(restoredAgain.json()).toEqual(restored.json());
    await expect(
      admin.project.findUnique({
        where: {
          organizationId_slug: { organizationId: organizationId as string, slug: archivedSlug },
        },
        select: { deletedAt: true },
      }),
    ).resolves.toEqual({ deletedAt: null });
    await expect(
      admin.auditLog.findMany({
        where: {
          organizationId,
          targetId: archiveCandidate.json().project.id as string,
        },
        orderBy: { createdAt: 'asc' },
        select: { action: true, metadata: true },
      }),
    ).resolves.toEqual([
      { action: 'project.archived', metadata: { slug: archivedSlug } },
      { action: 'project.restored', metadata: { slug: archivedSlug } },
    ]);
  });

  it('lists current test case versions with pagination and tenant-safe project resolution', async () => {
    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/cases?limit=1',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(firstPage.statusCode, firstPage.body).toBe(200);
    expect(firstPage.json().project).toMatchObject({
      key: 'AUTH',
      slug: 'authentication',
      name: 'Authentication Project',
    });
    expect(firstPage.json().items).toHaveLength(1);
    expect(firstPage.json().items[0]).toMatchObject({
      template: 'steps',
      section: { name: 'Sign in' },
    });
    expect(firstPage.json().items[0].caseNumber).toMatch(/^[12]$/);
    expect(firstPage.json().nextCursor).toEqual(expect.any(String));

    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases?limit=1&cursor=${firstPage.json().nextCursor as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(secondPage.statusCode, secondPage.body).toBe(200);
    expect(secondPage.json().nextCursor).toBeNull();
    expect(
      [...firstPage.json().items, ...secondPage.json().items]
        .map(({ title }: { title: string }) => title)
        .sort(),
    ).toEqual(['Reject an invalid password', 'Sign in with valid credentials']);

    const search = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/cases?search=invalid',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(search.statusCode, search.body).toBe(200);
    expect(search.json().items).toEqual([
      expect.objectContaining({ title: 'Reject an invalid password' }),
    ]);

    const missingProject = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/foreign-project/cases',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(missingProject.statusCode).toBe(404);
    expect(missingProject.json().error).toMatchObject({
      code: 'not_found',
      details: { resource: 'project' },
    });
  });

  it('returns the project suite and section structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/structure',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      project: { key: 'AUTH', slug: 'authentication', name: 'Authentication Project' },
      suites: [
        {
          name: 'Authentication suite',
          sections: [{ id: authSectionId, name: 'Sign in', depth: 0 }],
        },
      ],
    });
  });

  it('creates and renames suites and nested sections atomically', async () => {
    const suiteRequests = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/structure/suites',
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { name: 'Account security' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/structure/suites',
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { name: 'Account security' },
      }),
    ]);
    expect(suiteRequests.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    const createdSuite = suiteRequests.find(({ statusCode }) => statusCode === 201);
    const suiteId = createdSuite?.json().id as string;

    const renamedSuite = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/suites/${suiteId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Account protection' },
    });
    expect(renamedSuite.statusCode, renamedSuite.body).toBe(200);
    expect(renamedSuite.json()).toMatchObject({ id: suiteId, name: 'Account protection' });

    const parent = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/structure/suites/${suiteId}/sections`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Password recovery' },
    });
    expect(parent.statusCode, parent.body).toBe(201);
    expect(parent.json()).toMatchObject({ parentId: null, depth: 0, position: 0 });

    const child = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/structure/suites/${suiteId}/sections`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Email reset', parentId: parent.json().id as string },
    });
    expect(child.statusCode, child.body).toBe(201);
    expect(child.json()).toMatchObject({ parentId: parent.json().id, depth: 1, position: 0 });

    const renamedSection = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Reset by email' },
    });
    expect(renamedSection.statusCode, renamedSection.body).toBe(200);
    expect(renamedSection.json()).toMatchObject({ name: 'Reset by email', depth: 1 });

    const structure = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/structure',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(structure.json().suites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: suiteId,
          name: 'Account protection',
          sections: expect.arrayContaining([
            expect.objectContaining({ name: 'Reset by email', depth: 1 }),
          ]),
        }),
      ]),
    );

    const targetSuite = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/structure/suites',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Recovery archive' },
    });
    expect(targetSuite.statusCode, targetSuite.body).toBe(201);
    const targetSuiteId = targetSuite.json().id as string;

    const reorderedSuite = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/suites/${targetSuiteId}/move`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { position: 0 },
    });
    expect(reorderedSuite.statusCode, reorderedSuite.body).toBe(200);
    expect(reorderedSuite.json()).toMatchObject({ id: targetSuiteId, position: 0 });
    const reorderedStructure = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/structure',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(reorderedStructure.json().suites[0].id).toBe(targetSuiteId);

    const grandchild = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/structure/suites/${suiteId}/sections`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Mail provider', parentId: child.json().id as string },
    });
    expect(grandchild.statusCode, grandchild.body).toBe(201);
    const managedSection = await admin.section.findUniqueOrThrow({
      where: {
        organizationId_id: {
          organizationId: organizationId ?? '',
          id: child.json().id as string,
        },
      },
      select: { projectId: true, suiteId: true },
    });
    const archivedCase = await admin.testCase.create({
      data: {
        organizationId: organizationId ?? '',
        projectId: managedSection.projectId,
        suiteId: managedSection.suiteId,
        sectionId: child.json().id as string,
        caseNumber: 999_999n,
        deletedAt: new Date(),
      },
    });

    const moved = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}/move`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { suiteId: targetSuiteId, parentId: null, position: 0 },
    });
    expect(moved.statusCode, moved.body).toBe(200);
    expect(moved.json()).toMatchObject({
      id: child.json().id,
      suiteId: targetSuiteId,
      parentId: null,
      depth: 0,
      position: 0,
    });

    const movedSections = await admin.section.findMany({
      where: { id: { in: [child.json().id as string, grandchild.json().id as string] } },
      orderBy: { depth: 'asc' },
      select: { id: true, suiteId: true, path: true, depth: true },
    });
    expect(movedSections).toEqual([
      {
        id: child.json().id,
        suiteId: targetSuiteId,
        path: `/${child.json().id as string}`,
        depth: 0,
      },
      {
        id: grandchild.json().id,
        suiteId: targetSuiteId,
        path: `/${child.json().id as string}/${grandchild.json().id as string}`,
        depth: 1,
      },
    ]);
    await expect(
      admin.testCase.findUniqueOrThrow({
        where: {
          organizationId_id: { organizationId: organizationId ?? '', id: archivedCase.id },
        },
        select: { suiteId: true },
      }),
    ).resolves.toEqual({ suiteId: targetSuiteId });

    const sibling = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/structure/suites/${targetSuiteId}/sections`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'SMS reset' },
    });
    expect(sibling.statusCode, sibling.body).toBe(201);
    const reorderedSection = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/sections/${sibling.json().id as string}/move`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { suiteId: targetSuiteId, parentId: null, position: 0 },
    });
    expect(reorderedSection.statusCode, reorderedSection.body).toBe(200);
    const sectionOrder = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/structure',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    const reorderedTargetSuite = sectionOrder
      .json()
      .suites.find(({ id }: { id: string }) => id === targetSuiteId);
    expect(reorderedTargetSuite.sections.map(({ name }: { name: string }) => name)).toEqual([
      'SMS reset',
      'Reset by email',
      'Mail provider',
    ]);

    const cycle = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}/move`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        suiteId: targetSuiteId,
        parentId: grandchild.json().id as string,
        position: 0,
      },
    });
    expect(cycle.statusCode, cycle.body).toBe(409);
    expect(cycle.json().error.code).toBe('section_cycle');

    const nonEmptySection = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(nonEmptySection.statusCode, nonEmptySection.body).toBe(409);
    expect(nonEmptySection.json().error.code).toBe('section_not_empty');
    const nonEmptySuite = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/suites/${targetSuiteId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(nonEmptySuite.statusCode, nonEmptySuite.body).toBe(409);
    expect(nonEmptySuite.json().error.code).toBe('suite_not_empty');

    const deletedSibling = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${sibling.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(deletedSibling.statusCode, deletedSibling.body).toBe(204);

    const deletedGrandchild = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${grandchild.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(deletedGrandchild.statusCode, deletedGrandchild.body).toBe(204);
    const archivedCaseStillBlocksDeletion = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedCaseStillBlocksDeletion.statusCode, archivedCaseStillBlocksDeletion.body).toBe(
      409,
    );
    expect(archivedCaseStillBlocksDeletion.json().error.code).toBe('section_not_empty');
    await admin.testCase.delete({
      where: {
        organizationId_id: { organizationId: organizationId ?? '', id: archivedCase.id },
      },
    });
    const deletedMovedSection = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${child.json().id as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(deletedMovedSection.statusCode, deletedMovedSection.body).toBe(204);
    const deletedTargetSuite = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/suites/${targetSuiteId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(deletedTargetSuite.statusCode, deletedTargetSuite.body).toBe(204);

    const protectedSection = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${authSectionId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(protectedSection.statusCode, protectedSection.body).toBe(409);
    expect(protectedSection.json().error.code).toBe('section_not_empty');
  });

  it('creates a test case and its immutable first version atomically', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/cases',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        title: 'Reset a forgotten password',
        sectionId: authSectionId,
        template: 'steps',
        automationId: 'auth.password-reset',
        preconditions: 'The account has a verified email address',
        expectedResult: 'The password can be changed',
        content: {
          steps: [{ action: 'Request a password reset', expected: 'A reset email is sent' }],
        },
      },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      testCase: {
        caseNumber: '3',
        title: 'Reset a forgotten password',
        template: 'steps',
        automationId: 'auth.password-reset',
        section: { id: authSectionId, name: 'Sign in' },
      },
      version: { version: 1 },
    });
    editableCaseId = response.json().testCase.id as string;
    originalVersionId = response.json().version.id as string;

    const created = await admin.testCase.findUniqueOrThrow({
      where: {
        organizationId_id: {
          organizationId: organizationId as string,
          id: response.json().testCase.id as string,
        },
      },
      include: { currentVersion: true, versions: true },
    });
    expect(created.currentVersionId).toBe(response.json().version.id);
    expect(created.versions).toHaveLength(1);
    expect(created.currentVersion).toMatchObject({
      version: 1,
      title: 'Reset a forgotten password',
      template: 'STEPS',
      createdById: authUserId,
    });
  });

  it('returns a test case with its current content and version history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      project: { key: 'AUTH', slug: 'authentication' },
      testCase: {
        id: editableCaseId,
        caseNumber: '3',
        automationId: 'auth.password-reset',
        section: {
          id: authSectionId,
          name: 'Sign in',
          suiteName: 'Authentication suite',
        },
        currentVersion: {
          version: 1,
          title: 'Reset a forgotten password',
          template: 'steps',
          content: {
            steps: [{ action: 'Request a password reset', expected: 'A reset email is sent' }],
          },
          createdBy: { id: authUserId, displayName: 'Authentication Tester' },
        },
        versions: [{ version: 1, title: 'Reset a forgotten password' }],
      },
    });
  });

  it('updates a test case by creating a new immutable version', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        baseVersion: 1,
        title: 'Reset a forgotten password by email',
        sectionId: authSectionId,
        template: 'text',
        automationId: 'auth.password-reset',
        preconditions: 'The account has a verified email address',
        expectedResult: 'The password is changed',
        content: { text: 'Request a reset email and follow its one-time link.' },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      testCase: {
        id: editableCaseId,
        caseNumber: '3',
        title: 'Reset a forgotten password by email',
        template: 'text',
      },
      version: { version: 2 },
    });

    const versions = await admin.testCaseVersion.findMany({
      where: { organizationId, testCaseId: editableCaseId },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      version: 1,
      title: 'Reset a forgotten password',
      template: 'STEPS',
    });
    expect(versions[1]).toMatchObject({
      version: 2,
      title: 'Reset a forgotten password by email',
      template: 'TEXT',
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().testCase.currentVersion).toMatchObject({
      version: 2,
      title: 'Reset a forgotten password by email',
      template: 'text',
      content: { text: 'Request a reset email and follow its one-time link.' },
    });
    expect(
      detail.json().testCase.versions.map(({ version }: { version: number }) => version),
    ).toEqual([2, 1]);
  });

  it('rejects one of two concurrent edits based on the same version', async () => {
    const responses = await Promise.all(
      ['First concurrent edit', 'Second concurrent edit'].map((title) =>
        app.inject({
          method: 'PUT',
          url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
          headers: { authorization: `Bearer ${organizationAccessToken}` },
          payload: {
            baseVersion: 2,
            title,
            sectionId: authSectionId,
            template: 'text',
            content: { text: `${title} content` },
          },
        }),
      ),
    );

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const conflict = responses.find(({ statusCode }) => statusCode === 409);
    expect(conflict?.json().error).toMatchObject({
      code: 'case_version_conflict',
      details: { currentVersion: 3 },
    });
    await expect(
      admin.testCaseVersion.count({ where: { organizationId, testCaseId: editableCaseId } }),
    ).resolves.toBe(3);
  });

  it('reads a historical version and restores it as a new immutable version', async () => {
    const historical = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}/versions/${originalVersionId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json()).toMatchObject({
      id: originalVersionId,
      version: 1,
      title: 'Reset a forgotten password',
      template: 'steps',
      content: {
        steps: [{ action: 'Request a password reset', expected: 'A reset email is sent' }],
      },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}/versions/${originalVersionId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { baseVersion: 3 },
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json()).toMatchObject({
      testCase: {
        id: editableCaseId,
        title: 'Reset a forgotten password',
        template: 'steps',
      },
      version: { version: 4 },
    });

    const versions = await admin.testCaseVersion.findMany({
      where: { organizationId, testCaseId: editableCaseId },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(4);
    expect(versions[0]).toMatchObject({
      id: originalVersionId,
      version: 1,
      title: 'Reset a forgotten password',
    });
    expect(versions[3]).toMatchObject({
      version: 4,
      title: 'Reset a forgotten password',
      template: 'STEPS',
    });

    const staleRestore = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}/versions/${originalVersionId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { baseVersion: 3 },
    });
    expect(staleRestore.statusCode, staleRestore.body).toBe(409);
    expect(staleRestore.json().error).toMatchObject({
      code: 'case_version_conflict',
      details: { currentVersion: 4 },
    });
  });

  it('creates and lists an active run with immutable case-version snapshots', async () => {
    const selectedCases = await admin.testCase.findMany({
      where: { organizationId, project: { slug: 'authentication' }, deletedAt: null },
      orderBy: { caseNumber: 'asc' },
      take: 2,
      select: { id: true, currentVersionId: true },
    });

    const missingIdempotencyKey = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { name: 'Missing request key', caseIds: [selectedCases[0]?.id] },
    });
    expect(missingIdempotencyKey.statusCode, missingIdempotencyKey.body).toBe(400);
    expect(missingIdempotencyKey.json().error.code).toBe('validation_failed');

    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        name: 'Authentication draft',
        status: 'draft',
        caseIds: [selectedCases[0]?.id],
      },
    });
    expect(draft.statusCode, draft.body).toBe(201);
    expect(draft.json().run).toMatchObject({
      name: 'Authentication draft',
      status: 'draft',
      itemCount: 1,
    });
    const draftRunId = draft.json().run.id as string;

    const draftRuns = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/runs?status=draft',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(draftRuns.statusCode, draftRuns.body).toBe(200);
    expect(draftRuns.json().items).toEqual([
      expect.objectContaining({ id: draftRunId, status: 'draft' }),
    ]);

    const archiveWithDraftRun = await app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/authentication',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archiveWithDraftRun.statusCode, archiveWithDraftRun.body).toBe(409);
    expect(archiveWithDraftRun.json().error.code).toBe('project_has_open_runs');

    const startedDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${draftRunId}/start`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(startedDraft.statusCode, startedDraft.body).toBe(201);
    expect(startedDraft.json().run).toMatchObject({ id: draftRunId, status: 'active' });
    const closedDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${draftRunId}/close`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(closedDraft.statusCode, closedDraft.body).toBe(201);
    expect(closedDraft.json().run).toMatchObject({ id: draftRunId, status: 'completed' });

    const invalidInitialStatus = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        name: 'Invalid completed run',
        status: 'completed',
        caseIds: [selectedCases[0]?.id],
      },
    });
    expect(invalidInitialStatus.statusCode, invalidInitialStatus.body).toBe(400);
    expect(invalidInitialStatus.json().error.code).toBe('validation_failed');

    const createRunIdempotencyKey = randomUUID();
    const createRunRequest = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/runs',
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': createRunIdempotencyKey,
        },
        payload: {
          name: 'Authentication regression',
          build: '2026.08.02-rc1',
          caseIds: selectedCases.map(({ id }) => id),
        },
      });
    const [response, replayed] = await Promise.all([createRunRequest(), createRunRequest()]);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      run: {
        name: 'Authentication regression',
        status: 'active',
        build: '2026.08.02-rc1',
        itemCount: 2,
        completedCount: 0,
        failedCount: 0,
      },
    });
    expect(replayed.statusCode, replayed.body).toBe(201);
    expect(replayed.json()).toEqual(response.json());
    const reusedKey = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': createRunIdempotencyKey,
      },
      payload: {
        name: 'Different regression',
        caseIds: selectedCases.map(({ id }) => id),
      },
    });
    expect(reusedKey.statusCode, reusedKey.body).toBe(409);
    expect(reusedKey.json().error.code).toBe('idempotency_key_reused');
    const runId = response.json().run.id as string;
    createdRunId = runId;
    const archiveWithOpenRun = await app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/authentication',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archiveWithOpenRun.statusCode, archiveWithOpenRun.body).toBe(409);
    expect(archiveWithOpenRun.json().error.code).toBe('project_has_open_runs');
    const snapshotItems = await admin.testRunItem.findMany({
      where: { organizationId, testRunId: runId },
      orderBy: { position: 'asc' },
      select: { caseVersionId: true, status: { select: { key: true } } },
    });
    expect(snapshotItems).toEqual(
      selectedCases.map(({ currentVersionId }) => ({
        caseVersionId: currentVersionId,
        status: { key: 'untested' },
      })),
    );

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}?limit=1`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json()).toMatchObject({
      run: { id: runId, status: 'active', itemCount: 2 },
      items: [
        expect.objectContaining({
          attemptCount: 0,
          caseVersion: expect.objectContaining({ template: 'steps' }),
          status: expect.objectContaining({ key: 'untested' }),
        }),
      ],
      members: [expect.objectContaining({ id: authUserId })],
      statuses: expect.arrayContaining([
        expect.objectContaining({ key: 'passed' }),
        expect.objectContaining({ key: 'failed' }),
      ]),
    });
    expect(detail.json().nextCursor).toEqual(expect.any(String));
    createdRunItemId = detail.json().items[0].id as string;

    const assignment = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/assignee`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { assigneeId: authUserId },
    });
    expect(assignment.statusCode, assignment.body).toBe(200);
    expect(assignment.json()).toEqual({
      itemId: createdRunItemId,
      assignee: expect.objectContaining({ id: authUserId }),
    });
    const missingAssignee = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/assignee`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { assigneeId: randomUUID() },
    });
    expect(missingAssignee.statusCode, missingAssignee.body).toBe(404);

    const startedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/start`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(startedAgain.statusCode, startedAgain.body).toBe(201);
    expect(startedAgain.json().run.status).toBe('active');

    const archiveActive = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/runs/${runId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archiveActive.statusCode, archiveActive.body).toBe(409);
    expect(archiveActive.json().error.code).toBe('invalid_run_state');
    const restoreActive = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restoreActive.statusCode, restoreActive.body).toBe(409);
    expect(restoreActive.json().error.code).toBe('invalid_run_state');

    const attachmentBody = Buffer.from('caselog result evidence');
    const attachmentChecksum = createHash('sha256').update(attachmentBody).digest('hex');
    const uploadSession = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/uploads`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        fileName: 'authentication-result.txt',
        contentType: 'text/plain',
        sizeBytes: attachmentBody.byteLength,
        checksumSha256: attachmentChecksum,
        stepPosition: 0,
      },
    });
    expect(uploadSession.statusCode, uploadSession.body).toBe(201);
    expect(uploadSession.json()).toMatchObject({
      upload: {
        id: expect.any(String),
        method: 'PUT',
        url: expect.stringContaining('http'),
        headers: {
          'content-type': 'text/plain',
          'x-amz-meta-checksumsha256': attachmentChecksum,
        },
        expiresAt: expect.any(String),
      },
    });
    await expect(
      admin.uploadSession.findUnique({
        where: {
          organizationId_id: {
            organizationId: organizationId as string,
            id: uploadSession.json().upload.id as string,
          },
        },
      }),
    ).resolves.toMatchObject({
      testRunItemId: createdRunItemId,
      createdById: authUserId,
      stepPosition: 0,
      completedAt: null,
    });
    const uploaded = await fetch(uploadSession.json().upload.url as string, {
      method: 'PUT',
      headers: uploadSession.json().upload.headers as Record<string, string>,
      body: attachmentBody,
    });
    expect(uploaded.status, await uploaded.text()).toBe(200);
    const invalidUploadStep = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/uploads`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        fileName: 'invalid.png',
        contentType: 'image/png',
        sizeBytes: 10,
        checksumSha256: 'b'.repeat(64),
        stepPosition: 1,
      },
    });
    expect(invalidUploadStep.statusCode, invalidUploadStep.body).toBe(409);
    expect(invalidUploadStep.json().error.code).toBe('invalid_upload_target');

    const missingStatus = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { statusId: randomUUID() },
    });
    expect(missingStatus.statusCode, missingStatus.body).toBe(404);

    const statuses = await admin.resultStatus.findMany({
      where: {
        organizationId,
        project: { slug: 'authentication' },
        key: { in: ['passed', 'failed'] },
      },
      orderBy: { key: 'asc' },
      select: { id: true },
    });
    const incompleteUpload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/uploads`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        fileName: 'missing.txt',
        contentType: 'text/plain',
        sizeBytes: 10,
        checksumSha256: 'e'.repeat(64),
      },
    });
    expect(incompleteUpload.statusCode, incompleteUpload.body).toBe(201);
    const incompleteResult = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        statusId: statuses[0]?.id,
        uploadIds: [incompleteUpload.json().upload.id],
      },
    });
    expect(incompleteResult.statusCode, incompleteResult.body).toBe(409);
    expect(incompleteResult.json().error.code).toBe('upload_incomplete');
    const results = await Promise.all(
      statuses.map(({ id }, index) =>
        app.inject({
          method: 'POST',
          url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
          headers: { authorization: `Bearer ${organizationAccessToken}` },
          payload: {
            statusId: id,
            comment: `Attempt ${index + 1}`,
            elapsedMs: 1_000 + index,
            stepResults: [
              {
                position: 0,
                statusId: id,
                comment: `Step attempt ${index + 1}`,
                elapsedMs: 500 + index,
              },
            ],
            uploadIds: index === 0 ? [uploadSession.json().upload.id] : undefined,
          },
        }),
      ),
    );
    expect(results.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(results.map((result) => result.json().result.attempt).sort()).toEqual([1, 2]);
    expect(results.every((result) => result.json().result.stepResults.length === 1)).toBe(true);
    const resultWithAttachment = results.find(
      (result) => result.json().result.attachments.length === 1,
    );
    expect(resultWithAttachment?.json().result.attachments).toEqual([
      expect.objectContaining({
        fileName: 'authentication-result.txt',
        contentType: 'text/plain',
        sizeBytes: attachmentBody.byteLength,
        checksumSha256: attachmentChecksum,
        stepPosition: 0,
      }),
    ]);
    const attachmentResultId = resultWithAttachment?.json().result.id as string;
    createdAttachmentResultId = attachmentResultId;
    createdAttachmentId = resultWithAttachment?.json().result.attachments[0].id as string;
    const attachmentDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results/${attachmentResultId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(attachmentDetail.statusCode, attachmentDetail.body).toBe(200);
    expect(attachmentDetail.json().result.attachments).toHaveLength(1);
    const attachmentDownload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results/${attachmentResultId}/attachments/${createdAttachmentId}/download`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(attachmentDownload.statusCode, attachmentDownload.body).toBe(201);
    expect(attachmentDownload.json()).toMatchObject({
      download: { url: expect.stringContaining('http'), expiresAt: expect.any(String) },
    });
    const downloadedAttachment = await fetch(attachmentDownload.json().download.url as string);
    const downloadedAttachmentBody = await downloadedAttachment.text();
    expect(downloadedAttachment.status, downloadedAttachmentBody).toBe(200);
    expect(downloadedAttachmentBody).toBe(attachmentBody.toString());
    await expect(
      admin.uploadSession.findUnique({
        where: {
          organizationId_id: {
            organizationId: organizationId as string,
            id: uploadSession.json().upload.id as string,
          },
        },
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      admin.attachment.findFirst({
        where: { organizationId, targetId: attachmentResultId },
        select: { checksumSha256: true, blob: { select: { storageKey: true } } },
      }),
    ).resolves.toMatchObject({
      blob: { storageKey: expect.stringContaining('/blobs/sha256/') },
      checksumSha256: attachmentChecksum,
    });
    const reusedUpload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { statusId: statuses[0]?.id, uploadIds: [uploadSession.json().upload.id] },
    });
    expect(reusedUpload.statusCode, reusedUpload.body).toBe(409);
    expect(reusedUpload.json().error.code).toBe('invalid_upload');
    await expect(
      admin.testResult.count({ where: { organizationId, testRunItemId: createdRunItemId } }),
    ).resolves.toBe(2);
    await expect(admin.testStepResult.count({ where: { organizationId } })).resolves.toBe(2);

    const invalidStepResult = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: {
        statusId: statuses[0]?.id,
        stepResults: [{ position: 1, statusId: statuses[0]?.id }],
      },
    });
    expect(invalidStepResult.statusCode, invalidStepResult.body).toBe(409);
    expect(invalidStepResult.json().error.code).toBe('invalid_step_results');

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results?limit=1`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json()).toMatchObject({
      item: { id: createdRunItemId },
      results: [
        expect.objectContaining({ stepResults: [expect.objectContaining({ position: 0 })] }),
      ],
      nextCursor: expect.any(String),
    });
    const resultId = history.json().results[0].id as string;
    createdResultId = resultId;
    const resultDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results/${resultId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(resultDetail.statusCode, resultDetail.body).toBe(200);
    expect(resultDetail.json()).toMatchObject({
      item: { id: createdRunItemId, caseVersion: { title: 'Sign in with valid credentials' } },
      result: { id: resultId, stepResults: [expect.objectContaining({ position: 0 })] },
    });
    const olderHistory = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results?limit=1&cursor=${history.json().nextCursor as string}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(olderHistory.statusCode, olderHistory.body).toBe(200);
    expect(olderHistory.json().results).toHaveLength(1);
    expect(olderHistory.json().nextCursor).toBeNull();

    const detailAfterResults = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${runId}?limit=1`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(detailAfterResults.statusCode, detailAfterResults.body).toBe(200);
    expect(detailAfterResults.json().items[0].attemptCount).toBe(2);
    expect(detailAfterResults.json().run.completedCount).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/runs?status=active&limit=1',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json()).toMatchObject({
      project: { slug: 'authentication', key: 'AUTH' },
      items: [expect.objectContaining({ id: runId, itemCount: 2 })],
      nextCursor: null,
    });

    const bulkItem = await admin.testRunItem.findFirstOrThrow({
      where: { organizationId, testRunId: runId, id: { not: createdRunItemId } },
      select: {
        id: true,
        caseVersion: {
          select: {
            testCase: { select: { id: true, caseNumber: true } },
          },
        },
      },
    });
    const bulkUrl = `/api/v1/projects/authentication/runs/${runId}/results/bulk`;
    const missingBulkKey = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { results: [{ itemId: bulkItem.id, statusId: statuses[0]?.id }] },
    });
    expect(missingBulkKey.statusCode, missingBulkKey.body).toBe(400);
    expect(missingBulkKey.json().error.code).toBe('validation_failed');

    const duplicateBulkItem = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        results: [
          { itemId: bulkItem.id, statusId: statuses[0]?.id },
          { itemId: bulkItem.id, statusId: statuses[1]?.id },
        ],
      },
    });
    expect(duplicateBulkItem.statusCode, duplicateBulkItem.body).toBe(400);

    const atomicFailureKey = randomUUID();
    const atomicFailure = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': atomicFailureKey,
      },
      payload: {
        results: [
          { itemId: bulkItem.id, statusId: statuses[0]?.id },
          { itemId: randomUUID(), statusId: statuses[1]?.id },
        ],
      },
    });
    expect(atomicFailure.statusCode, atomicFailure.body).toBe(404);
    expect(atomicFailure.json().error.details.resource).toBe('test_run_item');
    await expect(
      admin.testResult.count({ where: { organizationId, testRunItemId: bulkItem.id } }),
    ).resolves.toBe(0);

    const missingBulkStatus = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: { results: [{ itemId: bulkItem.id, statusId: randomUUID() }] },
    });
    expect(missingBulkStatus.statusCode, missingBulkStatus.body).toBe(404);
    expect(missingBulkStatus.json().error.details.resource).toBe('result_status');

    const bulkIdempotencyKey = atomicFailureKey;
    const bulkRequest = () =>
      app.inject({
        method: 'POST',
        url: bulkUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': bulkIdempotencyKey,
        },
        payload: {
          results: [
            {
              itemId: bulkItem.id,
              statusId: statuses[0]?.id,
              comment: 'CI attempt 1',
              elapsedMs: 2_500,
            },
          ],
        },
      });
    const [bulk, bulkReplay] = await Promise.all([bulkRequest(), bulkRequest()]);
    expect(bulk.statusCode, bulk.body).toBe(201);
    expect(bulk.json().results).toEqual([
      expect.objectContaining({
        itemId: bulkItem.id,
        resultId: expect.any(String),
        attempt: 1,
        executedAt: expect.any(String),
      }),
    ]);
    expect(bulk.json().unmatched).toEqual([]);
    expect(bulkReplay.statusCode, bulkReplay.body).toBe(201);
    expect(bulkReplay.json()).toEqual(bulk.json());
    await expect(
      admin.testResult.count({ where: { organizationId, testRunItemId: bulkItem.id } }),
    ).resolves.toBe(1);
    await expect(
      admin.testResult.findFirst({
        where: { organizationId, id: bulk.json().results[0].resultId as string },
        select: {
          comment: true,
          elapsedMs: true,
          executedById: true,
          build: true,
        },
      }),
    ).resolves.toEqual({
      comment: 'CI attempt 1',
      elapsedMs: 2_500,
      executedById: authUserId,
      build: '2026.08.02-rc1',
    });
    await expect(
      admin.testRunItem.findUniqueOrThrow({
        where: { organizationId_id: { organizationId: organizationId ?? '', id: bulkItem.id } },
        select: { statusId: true },
      }),
    ).resolves.toEqual({ statusId: statuses[0]?.id });

    const reusedBulkKey = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': bulkIdempotencyKey,
      },
      payload: { results: [{ itemId: bulkItem.id, statusId: statuses[1]?.id }] },
    });
    expect(reusedBulkKey.statusCode, reusedBulkKey.body).toBe(409);
    expect(reusedBulkKey.json().error.code).toBe('idempotency_key_reused');

    const secondBulkAttempt = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        results: [
          { itemId: bulkItem.id, statusId: statuses[1]?.id },
          { itemId: createdRunItemId, statusId: statuses[0]?.id },
        ],
      },
    });
    expect(secondBulkAttempt.statusCode, secondBulkAttempt.body).toBe(201);
    expect(secondBulkAttempt.json().results).toEqual([
      expect.objectContaining({ itemId: bulkItem.id, attempt: 2 }),
      expect.objectContaining({ itemId: createdRunItemId, attempt: 3 }),
    ]);

    const matchedWithOrphanKey = randomUUID();
    const matchedWithOrphanRequest = () =>
      app.inject({
        method: 'POST',
        url: bulkUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': matchedWithOrphanKey,
        },
        payload: {
          results: [
            {
              caseNumber: bulkItem.caseVersion.testCase.caseNumber.toString(),
              statusId: statuses[0]?.id,
            },
            { automationId: 'auth.missing-test', statusId: statuses[1]?.id },
            { automationId: 'auth.valid-login', statusId: statuses[1]?.id },
          ],
        },
      });
    const matchedWithOrphan = await matchedWithOrphanRequest();
    expect(matchedWithOrphan.statusCode, matchedWithOrphan.body).toBe(201);
    expect(matchedWithOrphan.json()).toEqual({
      results: [
        expect.objectContaining({ itemId: bulkItem.id, attempt: 3 }),
        expect.objectContaining({ itemId: createdRunItemId, attempt: 4 }),
      ],
      unmatched: [
        {
          index: 1,
          automationId: 'auth.missing-test',
          caseNumber: null,
          reason: 'not_found',
        },
      ],
    });
    const matchedWithOrphanReplay = await matchedWithOrphanRequest();
    expect(matchedWithOrphanReplay.statusCode, matchedWithOrphanReplay.body).toBe(201);
    expect(matchedWithOrphanReplay.json()).toEqual(matchedWithOrphan.json());

    await admin.testCase.update({
      where: {
        organizationId_id: {
          organizationId: organizationId ?? '',
          id: bulkItem.caseVersion.testCase.id,
        },
      },
      data: { automationId: 'auth.valid-login' },
    });
    try {
      const ambiguousMatch = await app.inject({
        method: 'POST',
        url: bulkUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          results: [{ automationId: 'auth.valid-login', statusId: statuses[0]?.id }],
        },
      });
      expect(ambiguousMatch.statusCode, ambiguousMatch.body).toBe(201);
      expect(ambiguousMatch.json()).toEqual({
        results: [],
        unmatched: [
          {
            index: 0,
            automationId: 'auth.valid-login',
            caseNumber: null,
            reason: 'ambiguous',
          },
        ],
      });

      const duplicateMatchedItem = await app.inject({
        method: 'POST',
        url: bulkUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          results: [
            { itemId: bulkItem.id, statusId: statuses[0]?.id },
            {
              automationId: 'auth.valid-login',
              caseNumber: bulkItem.caseVersion.testCase.caseNumber.toString(),
              statusId: statuses[1]?.id,
            },
          ],
        },
      });
      expect(duplicateMatchedItem.statusCode, duplicateMatchedItem.body).toBe(409);
      expect(duplicateMatchedItem.json().error.code).toBe('bulk_result_duplicate_item');

      const disambiguatedMatch = await app.inject({
        method: 'POST',
        url: bulkUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          results: [
            {
              automationId: 'auth.valid-login',
              caseNumber: bulkItem.caseVersion.testCase.caseNumber.toString(),
              statusId: statuses[1]?.id,
            },
          ],
        },
      });
      expect(disambiguatedMatch.statusCode, disambiguatedMatch.body).toBe(201);
      expect(disambiguatedMatch.json()).toEqual({
        results: [expect.objectContaining({ itemId: bulkItem.id, attempt: 4 })],
        unmatched: [],
      });
    } finally {
      await admin.testCase.update({
        where: {
          organizationId_id: {
            organizationId: organizationId ?? '',
            id: bulkItem.caseVersion.testCase.id,
          },
        },
        data: { automationId: null },
      });
    }

    const junitUrl = `/api/v1/projects/authentication/runs/${runId}/results/junit`;
    const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
      <testsuite name="authentication">
        <testcase automation_id="auth.valid-login" name="valid login" time="0.25" />
        <testcase automation_id="renamed.invalid-password" case_number="2" name="invalid password" time="0.5">
          <failure message="Expected login rejection" type="AssertionError">received a session</failure>
          <system-out>POST /login returned 200</system-out>
        </testcase>
        <testcase automation_id="auth.valid-login" name="valid login retry" time="0.3">
          <error message="Browser disconnected" type="NetworkError">socket closed</error>
        </testcase>
        <testcase case_number="2" name="invalid password skipped"><skipped /></testcase>
        <testcase automation_id="auth.orphaned" name="unknown test"><skipped /></testcase>
      </testsuite>`;
    const missingJUnitKey = await app.inject({
      method: 'POST',
      url: junitUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'content-type': 'application/xml',
      },
      payload: junitXml,
    });
    expect(missingJUnitKey.statusCode, missingJUnitKey.body).toBe(400);
    expect(missingJUnitKey.json().error.code).toBe('validation_failed');

    const unsupportedJUnitContent = await app.inject({
      method: 'POST',
      url: junitUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {},
    });
    expect(unsupportedJUnitContent.statusCode, unsupportedJUnitContent.body).toBe(415);
    expect(unsupportedJUnitContent.json().error.code).toBe('unsupported_media_type');

    const recoverableJUnitKey = randomUUID();
    const invalidJUnit = await app.inject({
      method: 'POST',
      url: junitUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'content-type': 'application/xml',
        'idempotency-key': recoverableJUnitKey,
      },
      payload:
        '<testsuite><testcase automation_id="auth.valid-login" name="valid"/><testcase name="broken"></testsuite>',
    });
    expect(invalidJUnit.statusCode, invalidJUnit.body).toBe(400);
    expect(invalidJUnit.json().error.code).toBe('junit_malformed_xml');

    const junitIdempotencyKey = recoverableJUnitKey;
    const junitRequest = (payload = junitXml) =>
      app.inject({
        method: 'POST',
        url: junitUrl,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'content-type': 'application/xml; charset=utf-8',
          'idempotency-key': junitIdempotencyKey,
        },
        payload,
      });
    const [junitUpload, junitReplay] = await Promise.all([junitRequest(), junitRequest()]);
    expect(junitUpload.statusCode, junitUpload.body).toBe(201);
    expect(junitUpload.json()).toEqual({
      total: 5,
      recorded: 4,
      truncated: 0,
      counts: { passed: 1, failed: 1, error: 1, skipped: 2 },
      unmatched: [
        {
          sequence: 5,
          name: 'unknown test',
          automationId: 'auth.orphaned',
          caseNumber: null,
          reason: 'not_found',
        },
      ],
    });
    expect(junitReplay.statusCode, junitReplay.body).toBe(201);
    expect(junitReplay.json()).toEqual(junitUpload.json());
    await expect(
      admin.testResult.count({ where: { organizationId, testRunItemId: createdRunItemId } }),
    ).resolves.toBe(6);
    await expect(
      admin.testResult.count({ where: { organizationId, testRunItemId: bulkItem.id } }),
    ).resolves.toBe(6);
    await expect(
      admin.testResult.findFirstOrThrow({
        where: { organizationId, testRunItemId: createdRunItemId, attempt: 6 },
        select: { elapsedMs: true, comment: true, status: { select: { key: true } } },
      }),
    ).resolves.toEqual({
      elapsedMs: 300,
      comment: 'Browser disconnected\n\nsocket closed',
      status: { key: 'failed' },
    });
    await expect(
      admin.testResult.findFirstOrThrow({
        where: { organizationId, testRunItemId: bulkItem.id, attempt: 6 },
        select: { status: { select: { key: true } } },
      }),
    ).resolves.toEqual({ status: { key: 'untested' } });
    await expect(
      admin.testResult.findFirstOrThrow({
        where: { organizationId, testRunItemId: bulkItem.id, attempt: 5 },
        select: { elapsedMs: true, comment: true, status: { select: { key: true } } },
      }),
    ).resolves.toEqual({
      elapsedMs: 500,
      comment:
        'Expected login rejection\n\nreceived a session\n\nStandard output:\nPOST /login returned 200',
      status: { key: 'failed' },
    });

    const reusedJUnitKey = await junitRequest('<testsuite/>');
    expect(reusedJUnitKey.statusCode, reusedJUnitKey.body).toBe(409);
    expect(reusedJUnitKey.json().error.code).toBe('idempotency_key_reused');

    const duplicateSelection = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        name: 'Invalid duplicate selection',
        caseIds: [selectedCases[0]?.id, selectedCases[0]?.id],
      },
    });
    expect(duplicateSelection.statusCode, duplicateSelection.body).toBe(400);

    const unavailableCase = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: { name: 'Invalid selection', caseIds: [randomUUID()] },
    });
    expect(unavailableCase.statusCode, unavailableCase.body).toBe(409);
    expect(unavailableCase.json().error.code).toBe('run_case_unavailable');

    const closed = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/close`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(closed.statusCode, closed.body).toBe(201);
    expect(closed.json().run).toMatchObject({ id: runId, status: 'completed' });
    expect(closed.json().run.closedAt).toEqual(expect.any(String));
    const closedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/close`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(closedAgain.statusCode, closedAgain.body).toBe(201);
    expect(closedAgain.json().run.closedAt).toBe(closed.json().run.closedAt);

    const resultAfterClose = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { statusId: statuses[0]?.id },
    });
    expect(resultAfterClose.statusCode, resultAfterClose.body).toBe(409);
    expect(resultAfterClose.json().error.code).toBe('run_closed');
    const replayAfterClose = await bulkRequest();
    expect(replayAfterClose.statusCode, replayAfterClose.body).toBe(201);
    expect(replayAfterClose.json()).toEqual(bulk.json());
    const junitReplayAfterClose = await junitRequest();
    expect(junitReplayAfterClose.statusCode, junitReplayAfterClose.body).toBe(201);
    expect(junitReplayAfterClose.json()).toEqual(junitUpload.json());
    const bulkAfterClose = await app.inject({
      method: 'POST',
      url: bulkUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: { results: [{ itemId: bulkItem.id, statusId: statuses[0]?.id }] },
    });
    expect(bulkAfterClose.statusCode, bulkAfterClose.body).toBe(409);
    expect(bulkAfterClose.json().error.code).toBe('run_closed');
    const junitAfterClose = await app.inject({
      method: 'POST',
      url: junitUrl,
      headers: {
        authorization: `Bearer ${organizationAccessToken}`,
        'content-type': 'application/xml',
        'idempotency-key': randomUUID(),
      },
      payload: '<testsuite/>',
    });
    expect(junitAfterClose.statusCode, junitAfterClose.body).toBe(409);
    expect(junitAfterClose.json().error.code).toBe('run_closed');
    const assignmentAfterClose = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/authentication/runs/${runId}/items/${createdRunItemId}/assignee`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
      payload: { assigneeId: null },
    });
    expect(assignmentAfterClose.statusCode, assignmentAfterClose.body).toBe(409);
    expect(assignmentAfterClose.json().error.code).toBe('run_closed');
    const restartClosed = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/start`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restartClosed.statusCode, restartClosed.body).toBe(409);
    expect(restartClosed.json().error.code).toBe('invalid_run_state');

    const archived = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/runs/${runId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archived.statusCode, archived.body).toBe(204);
    const archivedAgain = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/runs/${runId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedAgain.statusCode, archivedAgain.body).toBe(204);

    const archivedRuns = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/runs?status=archived',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedRuns.statusCode, archivedRuns.body).toBe(200);
    expect(archivedRuns.json().items).toEqual([
      expect.objectContaining({ id: runId, status: 'archived' }),
    ]);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json().run).toMatchObject({ id: runId, status: 'completed' });
    expect(restored.json().run.closedAt).toBe(closed.json().run.closedAt);
    const restoredAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${runId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restoredAgain.statusCode, restoredAgain.body).toBe(201);
    expect(restoredAgain.json()).toEqual(restored.json());
    await expect(
      admin.auditLog.findMany({
        where: { organizationId, targetId: runId },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      }),
    ).resolves.toEqual([
      { action: 'test_run.closed' },
      { action: 'test_run.archived' },
      { action: 'test_run.restored' },
    ]);
  });

  it('assigns unique case numbers to concurrent creates', async () => {
    const responses = await Promise.all(
      ['Document session timeout', 'Document account lockout'].map((title) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/projects/authentication/cases',
          headers: { authorization: `Bearer ${organizationAccessToken}` },
          payload: {
            title,
            sectionId: authSectionId,
            template: 'text',
            content: { text: `${title} behavior` },
          },
        }),
      ),
    );

    expect(responses.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    expect(
      responses.map((response) => response.json().testCase.caseNumber as string).sort(),
    ).toEqual(['4', '5']);
  });

  it('duplicates, archives, lists, and restores a test case without losing its versions', async () => {
    const duplicated = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}/duplicate`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(duplicated.statusCode, duplicated.body).toBe(201);
    expect(duplicated.json()).toMatchObject({
      testCase: {
        title: 'Reset a forgotten password (copy)',
        template: 'steps',
        automationId: null,
        section: { id: authSectionId },
      },
      version: { version: 1 },
    });
    const duplicatedCaseId = duplicated.json().testCase.id as string;

    const archived = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/cases/${duplicatedCaseId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archived.statusCode, archived.body).toBe(204);
    const archivedAgain = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/cases/${duplicatedCaseId}`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedAgain.statusCode, archivedAgain.body).toBe(204);

    const activeList = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/cases?search=forgotten%20password%20(copy)',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(activeList.statusCode, activeList.body).toBe(200);
    expect(activeList.json().items).toEqual([]);

    const archivedList = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/cases?state=archived&search=forgotten%20password%20(copy)',
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(archivedList.statusCode, archivedList.body).toBe(200);
    expect(archivedList.json().items).toEqual([
      expect.objectContaining({ id: duplicatedCaseId, title: 'Reset a forgotten password (copy)' }),
    ]);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/cases/${duplicatedCaseId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restored.statusCode, restored.body).toBe(201);
    expect(restored.json()).toEqual({ testCaseId: duplicatedCaseId, state: 'active' });
    const restoredAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/cases/${duplicatedCaseId}/restore`,
      headers: { authorization: `Bearer ${organizationAccessToken}` },
    });
    expect(restoredAgain.statusCode, restoredAgain.body).toBe(201);

    await expect(
      admin.testCaseVersion.count({ where: { organizationId, testCaseId: duplicatedCaseId } }),
    ).resolves.toBe(1);
  });

  it('denies case creation to read-only members', async () => {
    await admin.membership.updateMany({
      where: { organizationId, userId: authUserId },
      data: { role: 'READ_ONLY' },
    });

    try {
      const createProject = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { name: 'Forbidden project', key: 'NOPE', slug: 'forbidden-project' },
      });
      expect(createProject.statusCode, createProject.body).toBe(403);
      const archiveProject = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${createdProjectSlug}`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(archiveProject.statusCode, archiveProject.body).toBe(403);
      const restoreProject = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${createdProjectSlug}/restore`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(restoreProject.statusCode, restoreProject.body).toBe(403);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/cases',
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: {
          title: 'Forbidden case',
          sectionId: authSectionId,
          template: 'text',
          content: { text: 'This case must not be created' },
        },
      });

      expect(response.statusCode, response.body).toBe(403);
      expect(response.json().error).toMatchObject({ code: 'insufficient_permissions' });

      const update = await app.inject({
        method: 'PUT',
        url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: {
          baseVersion: 3,
          title: 'Forbidden edit',
          sectionId: authSectionId,
          template: 'text',
          content: { text: 'This edit must not be stored' },
        },
      });
      expect(update.statusCode, update.body).toBe(403);
      expect(update.json().error).toMatchObject({ code: 'insufficient_permissions' });

      const restore = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/cases/${editableCaseId}/versions/${originalVersionId}/restore`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { baseVersion: 4 },
      });
      expect(restore.statusCode, restore.body).toBe(403);
      expect(restore.json().error).toMatchObject({ code: 'insufficient_permissions' });

      const duplicate = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/cases/${editableCaseId}/duplicate`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(duplicate.statusCode, duplicate.body).toBe(403);

      const archive = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(archive.statusCode, archive.body).toBe(403);

      const createSuite = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/structure/suites',
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { name: 'Forbidden suite' },
      });
      expect(createSuite.statusCode, createSuite.body).toBe(403);

      const moveSection = await app.inject({
        method: 'PUT',
        url: `/api/v1/projects/authentication/structure/sections/${authSectionId}/move`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { suiteId: randomUUID(), parentId: null, position: 0 },
      });
      expect(moveSection.statusCode, moveSection.body).toBe(403);

      const deleteSection = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/authentication/structure/sections/${authSectionId}`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(deleteSection.statusCode, deleteSection.body).toBe(403);

      const createRun = await app.inject({
        method: 'POST',
        url: '/api/v1/projects/authentication/runs',
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: { name: 'Forbidden run', caseIds: [editableCaseId] },
      });
      expect(createRun.statusCode, createRun.body).toBe(403);
      const closeRun = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/close`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(closeRun.statusCode, closeRun.body).toBe(403);
      const archiveRun = await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/authentication/runs/${createdRunId}`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(archiveRun.statusCode, archiveRun.body).toBe(403);
      const restoreRun = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/restore`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
      });
      expect(restoreRun.statusCode, restoreRun.body).toBe(403);
      const recordResult = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/results`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: { statusId: randomUUID() },
      });
      expect(recordResult.statusCode, recordResult.body).toBe(403);
      const bulkResults = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/results/bulk`,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: {
          results: [{ itemId: createdRunItemId, statusId: randomUUID() }],
        },
      });
      expect(bulkResults.statusCode, bulkResults.body).toBe(403);
      const junitResults = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/results/junit`,
        headers: {
          authorization: `Bearer ${organizationAccessToken}`,
          'content-type': 'application/xml',
          'idempotency-key': randomUUID(),
        },
        payload: '<testsuite/>',
      });
      expect(junitResults.statusCode, junitResults.body).toBe(403);
      const createUpload = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/uploads`,
        headers: { authorization: `Bearer ${organizationAccessToken}` },
        payload: {
          fileName: 'forbidden.png',
          contentType: 'image/png',
          sizeBytes: 10,
          checksumSha256: 'c'.repeat(64),
        },
      });
      expect(createUpload.statusCode, createUpload.body).toBe(403);
    } finally {
      await admin.membership.updateMany({
        where: { organizationId, userId: authUserId },
        data: { role: 'OWNER' },
      });
    }
  });

  it('provisions a workspace atomically and lists it only for its member', async () => {
    const suffix = randomUUID().slice(0, 8);
    const slug = `workspace-${suffix}`;
    const reservedSlug = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/workspaces/slug-availability?slug=admin',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reservedSlug.statusCode, reservedSlug.body).toBe(200);
    expect(reservedSlug.json()).toEqual({ available: false });

    const availableSlug = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/workspaces/slug-availability?slug=${slug}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(availableSlug.statusCode).toBe(200);
    expect(availableSlug.json()).toEqual({ available: true });

    const unverifiedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${outsiderAccessToken}` },
      payload: { name: 'Unverified Workspace', slug: `unverified-${suffix}` },
    });
    expect(unverifiedCreate.statusCode).toBe(403);
    expect(unverifiedCreate.json().error.code).toBe('email_verification_required');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Provisioned QA', slug },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      workspace: { name: 'Provisioned QA', slug, role: 'owner' },
      demoProject: { key: 'DEMO', name: 'Demo Project', slug: 'demo' },
    });
    provisionedOrganizationId = created.json().workspace.id as string;

    await expect(
      admin.resultStatus.count({ where: { organizationId: provisionedOrganizationId } }),
    ).resolves.toBe(6);

    const provisionedToken = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${slug}/token`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const provisionedProjects = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(provisionedProjects.statusCode, provisionedProjects.body).toBe(200);
    expect(provisionedProjects.json().items).toEqual([
      expect.objectContaining({ key: 'DEMO', slug: 'demo', name: 'Demo Project' }),
    ]);
    const crossTenantCases = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/cases',
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantCases.statusCode).toBe(404);
    const crossTenantProjectArchive = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${createdProjectSlug}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantProjectArchive.statusCode).toBe(404);
    const crossTenantProjectRestore = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${createdProjectSlug}/restore`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantProjectRestore.statusCode).toBe(404);
    const crossTenantCaseDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantCaseDetail.statusCode).toBe(404);
    const crossTenantVersion = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/cases/${editableCaseId}/versions/${originalVersionId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantVersion.statusCode).toBe(404);
    const crossTenantSuite = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/structure/suites',
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
      payload: { name: 'Foreign suite' },
    });
    expect(crossTenantSuite.statusCode).toBe(404);
    const crossTenantSectionDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/structure/sections/${authSectionId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantSectionDelete.statusCode).toBe(404);
    const crossTenantRuns = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/authentication/runs',
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantRuns.statusCode).toBe(404);
    const crossTenantRunCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/authentication/runs',
      headers: {
        authorization: `Bearer ${provisionedToken.json().accessToken as string}`,
        'idempotency-key': randomUUID(),
      },
      payload: { name: 'Foreign run', caseIds: [editableCaseId] },
    });
    expect(crossTenantRunCreate.statusCode).toBe(404);
    const crossTenantRunDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${createdRunId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantRunDetail.statusCode).toBe(404);
    const crossTenantRunArchive = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/authentication/runs/${createdRunId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantRunArchive.statusCode).toBe(404);
    const crossTenantRunRestore = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/restore`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantRunRestore.statusCode).toBe(404);
    const crossTenantResult = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
      payload: { statusId: randomUUID() },
    });
    expect(crossTenantResult.statusCode).toBe(404);
    const crossTenantBulkResults = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/results/bulk`,
      headers: {
        authorization: `Bearer ${provisionedToken.json().accessToken as string}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        results: [{ itemId: createdRunItemId, statusId: randomUUID() }],
      },
    });
    expect(crossTenantBulkResults.statusCode).toBe(404);
    const crossTenantJUnitResults = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/results/junit`,
      headers: {
        authorization: `Bearer ${provisionedToken.json().accessToken as string}`,
        'content-type': 'application/xml',
        'idempotency-key': randomUUID(),
      },
      payload: '<testsuite/>',
    });
    expect(crossTenantJUnitResults.statusCode).toBe(404);
    const crossTenantResultHistory = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/results`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantResultHistory.statusCode).toBe(404);
    const crossTenantResultDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/results/${createdResultId}`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantResultDetail.statusCode).toBe(404);
    const crossTenantUpload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/uploads`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
      payload: {
        fileName: 'foreign.png',
        contentType: 'image/png',
        sizeBytes: 10,
        checksumSha256: 'd'.repeat(64),
      },
    });
    expect(crossTenantUpload.statusCode).toBe(404);
    const crossTenantDownload = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/authentication/runs/${createdRunId}/items/${createdRunItemId}/results/${createdAttachmentResultId}/attachments/${createdAttachmentId}/download`,
      headers: { authorization: `Bearer ${provisionedToken.json().accessToken as string}` },
    });
    expect(crossTenantDownload.statusCode).toBe(404);

    const memberList = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(memberList.statusCode, memberList.body).toBe(200);
    expect(memberList.json().workspaces).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: provisionedOrganizationId, slug })]),
    );

    const outsiderList = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${outsiderAccessToken}` },
    });
    expect(outsiderList.statusCode, outsiderList.body).toBe(200);
    expect(outsiderList.json().workspaces).toEqual([]);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { name: 'Duplicate', slug },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('workspace_slug_taken');

    const concurrentSlug = `concurrent-${suffix}`;
    const concurrentRequests = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/workspaces',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Concurrent Workspace', slug: concurrentSlug },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/workspaces',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Concurrent Workspace', slug: concurrentSlug },
      }),
    ]);
    expect(concurrentRequests.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    const concurrentCreated = concurrentRequests.find(({ statusCode }) => statusCode === 201);
    additionalProvisionedOrganizationIds.push(concurrentCreated?.json().workspace.id as string);
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const originalCookie = cookieFrom(login);
    const refreshed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: originalCookie },
    });
    const refreshedSession = sessionResponseSchema.parse(refreshed.json());
    const rotatedCookie = cookieFrom(refreshed);

    expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(rotatedCookie).not.toBe(originalCookie);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie: originalCookie },
    });
    expect(reused.statusCode).toBe(401);

    const revokedFamily = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${refreshedSession.accessToken}` },
    });
    expect(revokedFamily.statusCode).toBe(401);
  });

  it('revokes the refresh session on logout and clears its cookie', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const cookie = cookieFrom(login);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie },
    });

    expect(logout.statusCode, logout.body).toBe(204);
    expect(logout.headers['set-cookie']).toContain('Max-Age=0');

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { cookie },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('does not enumerate accounts and resets a password once while revoking sessions', async () => {
    const [known, unknown] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/forgot',
        payload: { email },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/password/forgot',
        payload: { email: `missing-${email}` },
      }),
    ]);
    expect(known.statusCode).toBe(202);
    expect(known.json()).toEqual(unknown.json());

    const activeLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const activeSession = sessionResponseSchema.parse(activeLogin.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });
    const expiredToken = `${randomUUID()}${randomUUID()}`;
    await admin.accountToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await admin.accountToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hashAccountToken(expiredToken),
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expiredReset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: expiredToken, password: 'an unused replacement password' },
    });
    expect(expiredReset.statusCode).toBe(400);

    const resetToken = `${randomUUID()}${randomUUID()}`;
    await admin.accountToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await admin.accountToken.create({
      data: {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        tokenHash: hashAccountToken(resetToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const newPassword = 'a newly reset password phrase';
    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: resetToken, password: newPassword },
    });
    expect(reset.statusCode, reset.body).toBe(200);

    const revokedSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${activeSession.accessToken}` },
    });
    expect(revokedSession.statusCode).toBe(401);

    const oldPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    const newPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: newPassword },
    });
    expect(oldPassword.statusCode).toBe(401);
    expect(newPasswordLogin.statusCode, newPasswordLogin.body).toBe(200);

    const reusedReset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/reset',
      payload: { token: resetToken, password: PASSWORD },
    });
    expect(reusedReset.statusCode).toBe(400);
  });
});
