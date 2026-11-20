import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  sessionResponseSchema,
  staffWorkspaceDetailResponseSchema,
  staffWorkspaceListResponseSchema,
} from '@caselog/schemas';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import {
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
  type AuthoringFixture,
} from '../../../auth/tests/support/authoring.e2e-fixture';

describe('managed workspace customer directory', () => {
  let fixture: AuthoringFixture;
  let selfHosted: NestFastifyApplication;
  let session: string;
  const environment = {
    deployment: process.env.CASELOG_DEPLOYMENT_MODE,
    billing: process.env.CASELOG_MANAGED_BILLING_ENABLED,
    bootstrap: process.env.CASELOG_STAFF_BOOTSTRAP_EMAIL,
  };
  const future = () => new Date(Date.now() + 86_400_000);
  beforeAll(async () => {
    process.env.CASELOG_DEPLOYMENT_MODE = 'managed';
    process.env.CASELOG_MANAGED_BILLING_ENABLED = 'false';
    delete process.env.CASELOG_STAFF_BOOTSTRAP_EMAIL;
    fixture = await createAuthoringFixture();
    await fixture.admin.user.update({
      where: { id: fixture.ownerId },
      data: { emailVerifiedAt: new Date() },
    });
    await fixture.admin.staffOperator.create({
      data: {
        userId: fixture.ownerId,
        role: 'ADMIN',
        createdAt: new Date(Date.now() - 86_400_000),
        accessExpiresAt: future(),
      },
    });
    const login = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: fixture.email, password: 'correct horse battery staple' },
    });
    session = sessionResponseSchema.parse(login.json()).accessToken;
    await seedUsage();
    process.env.CASELOG_DEPLOYMENT_MODE = 'self_hosted';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    selfHosted = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(selfHosted);
    await selfHosted.init();
    await selfHosted.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    try {
      if (fixture) {
        const organizationId = { in: [fixture.organizationId, fixture.foreignOrganizationId] };
        await fixture.admin.uploadSession.deleteMany({ where: { organizationId } });
        await fixture.admin.testResultIngestion.deleteMany({ where: { organizationId } });
        await fixture.admin.testRun.deleteMany({ where: { organizationId } });
        await fixture.admin.usageCounter.deleteMany({ where: { organizationId } });
        await fixture.admin.staffOperator.deleteMany({ where: { userId: fixture.ownerId } });
      }
      await selfHosted?.close();
      await destroyAuthoringFixture(fixture);
    } finally {
      restore('CASELOG_DEPLOYMENT_MODE', environment.deployment);
      restore('CASELOG_MANAGED_BILLING_ENABLED', environment.billing);
      restore('CASELOG_STAFF_BOOTSTRAP_EMAIL', environment.bootstrap);
    }
  });
  const headers = () => ({ authorization: `Bearer ${session}` });
  const detailUrl = (id: string) => `/api/v1/staff/workspaces/${id}`;
  function list(query = '') {
    return fixture.app.inject({
      method: 'GET',
      url: `/api/v1/staff/workspaces${query}`,
      headers: headers(),
    });
  }
  function detail(id = fixture.organizationId) {
    return fixture.app.inject({ method: 'GET', url: detailUrl(id), headers: headers() });
  }

  it('finds the owner by email and returns only the documented contact fields', async () => {
    const result = await list(`?q=${encodeURIComponent(fixture.email)}`);
    expect(result.statusCode, result.body).toBe(200);
    const page = staffWorkspaceListResponseSchema.parse(result.json());
    expect(page.workspaces).toHaveLength(1);
    expect(page.workspaces[0]?.owner).toEqual({
      userId: fixture.ownerId,
      displayName: 'Authoring Owner',
      email: fixture.email,
    });
    expect(page.workspaces[0]?.billingAccount).toBeNull();
  });

  it('returns a consistent, resource-only snapshot with precise byte counts', async () => {
    const result = await detail();
    expect(result.statusCode, result.body).toBe(200);
    const data = staffWorkspaceDetailResponseSchema.strict().parse(result.json());
    expect(data.workspace).toMatchObject({
      id: fixture.organizationId,
      memberCount: 1,
      projectCount: 1,
      storageBytes: '9007199254740993',
    });
    expect(data.usage).toEqual({
      testCases: 1,
      testRuns: 3,
      openTestRuns: 1,
      ingestions: 2,
      pendingUploads: 2,
      pendingStorageBytes: '300',
    });
    expect(Date.parse(data.observedAt)).toBeLessThanOrEqual(Date.now());
    expect(Object.keys(result.json()).sort()).toEqual(['observedAt', 'usage', 'workspace']);
    expect(result.body).not.toContain('PRIVATE TEST CONTENT');
    expect(result.body).not.toContain('private-object-key');
    expect(result.body).not.toContain('password');
  });

  it('isolates aggregates by workspace and represents empty usage and missing owners explicitly', async () => {
    const result = await detail(fixture.foreignOrganizationId);
    expect(result.statusCode).toBe(200);
    const data = staffWorkspaceDetailResponseSchema.parse(result.json());
    expect(data.workspace.owner).toBeNull();
    expect(data.workspace.memberCount).toBe(0);
    expect(data.workspace.storageBytes).toBe('0');
    expect(data.usage).toEqual({
      testCases: 1,
      testRuns: 0,
      openTestRuns: 0,
      ingestions: 0,
      pendingUploads: 0,
      pendingStorageBytes: '0',
    });
    const invisible = await runInTenant(fixture.application, fixture.organizationId, async (tx) => {
      await tx.$executeRaw`SELECT set_config('caselog.user_id', ${fixture.ownerId}, true)`;
      return tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM test_cases WHERE id = ${fixture.foreignCaseId}::UUID`;
    });
    expect(invisible).toEqual([]);
  });

  it('filters lifecycle states, bounds pagination and handles missing or invalid IDs', async () => {
    const where = { id: fixture.organizationId };
    await fixture.admin.organization.update({ where, data: { deletedAt: new Date() } });
    try {
      const current = staffWorkspaceListResponseSchema.parse(
        (await list(`?state=current&q=${fixture.email}`)).json(),
      );
      expect(current.workspaces).toEqual([]);
      const deleted = staffWorkspaceListResponseSchema.parse(
        (await list(`?state=deleted&q=${fixture.email}`)).json(),
      );
      expect(deleted.workspaces.map((workspace) => workspace.id)).toEqual([fixture.organizationId]);
      expect((await detail()).statusCode).toBe(200);
    } finally {
      await fixture.admin.organization.update({ where, data: { deletedAt: null } });
    }
    const first = staffWorkspaceListResponseSchema.parse((await list('?limit=1')).json());
    expect(first.workspaces).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = staffWorkspaceListResponseSchema.parse(
      (await list(`?limit=1&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.workspaces[0]?.id).not.toBe(first.workspaces[0]?.id);
    expect((await list('?state=invalid')).statusCode).toBe(400);
    expect((await list('?limit=101')).statusCode).toBe(400);
    expect((await detail('invalid')).statusCode).toBe(400);
    expect((await detail(randomUUID())).statusCode).toBe(404);
  });

  it('does not expose deactivated owner contacts', async () => {
    const where = {
      organizationId_userId: { organizationId: fixture.organizationId, userId: fixture.ownerId },
    };
    await fixture.admin.membership.update({ where, data: { deletedAt: new Date() } });
    try {
      expect(
        staffWorkspaceDetailResponseSchema.parse((await detail()).json()).workspace.owner,
      ).toBeNull();
    } finally {
      await fixture.admin.membership.update({ where, data: { deletedAt: null } });
    }
  });

  it('denies anonymous, organization-token and API-token access', async () => {
    expect(
      (await fixture.app.inject({ method: 'GET', url: detailUrl(fixture.organizationId) }))
        .statusCode,
    ).toBe(401);
    const token = await issueAuthoringToken(fixture, ['projects:read']);
    for (const credential of [fixture.ownerToken, token.token]) {
      const denied = await fixture.app.inject({
        method: 'GET',
        url: detailUrl(fixture.organizationId),
        headers: { authorization: `Bearer ${credential}` },
      });
      expect(denied.statusCode).toBe(401);
    }
  });

  it('enforces current staff roles, expiry and revocation at HTTP and database boundaries', async () => {
    const where = { userId: fixture.ownerId };
    for (const data of [
      { role: 'SUPPORT' as const },
      { accessExpiresAt: new Date(Date.now() - 1000) },
      { disabledAt: new Date() },
    ]) {
      await fixture.admin.staffOperator.update({ where, data });
      try {
        expect((await detail()).statusCode).toBe(403);
        await expect(
          fixture.application.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('caselog.user_id', ${fixture.ownerId}, true)`;
            return tx.$queryRaw`SELECT * FROM public.staff_workspace_usage(${fixture.organizationId}::UUID)`;
          }),
        ).rejects.toThrow();
      } finally {
        await fixture.admin.staffOperator.update({
          where,
          data: { role: 'ADMIN', accessExpiresAt: future(), disabledAt: null },
        });
      }
    }
  });

  it('keeps the endpoints unavailable in self-hosted mode even for a staff operator', async () => {
    for (const url of ['/api/v1/staff/workspaces', detailUrl(fixture.organizationId)]) {
      const response = await selfHosted.inject({ method: 'GET', url, headers: headers() });
      expect(response.statusCode, response.body).toBe(404);
    }
  });

  async function seedUsage() {
    const { admin, organizationId, projectId, sectionId, suiteId, ownerId } = fixture;
    await admin.testCase.createMany({
      data: [
        { organizationId, projectId, sectionId, suiteId, caseNumber: 1n },
        { organizationId, projectId, sectionId, suiteId, caseNumber: 2n, deletedAt: new Date() },
      ],
    });
    const run = await admin.testRun.create({
      data: { organizationId, projectId, name: 'PRIVATE TEST CONTENT', status: 'ACTIVE' },
    });
    await admin.testRun.createMany({
      data: [
        { organizationId, projectId, name: 'Completed', status: 'COMPLETED' },
        { organizationId, projectId, name: 'Draft', status: 'DRAFT' },
        { organizationId, projectId, name: 'Deleted', status: 'ACTIVE', deletedAt: new Date() },
      ],
    });
    for (const status of ['COMPLETED', 'FAILED'] as const) {
      await admin.testResultIngestion.create({
        data: {
          organizationId,
          projectId,
          testRunId: run.id,
          format: 'JUNIT',
          status,
          errorCode: status === 'FAILED' ? 'junit_malformed_xml' : null,
          source: 'PRIVATE TEST CONTENT',
        },
      });
    }
    await admin.usageCounter.create({
      data: { organizationId, storageBytesUsed: 9007199254740993n },
    });
    const activeCase = await admin.testCase.findFirstOrThrow({
      where: { organizationId, projectId, deletedAt: null },
    });
    const version = await admin.testCaseVersion.create({
      data: {
        organizationId,
        testCaseId: activeCase.id,
        version: 1,
        title: 'PRIVATE TEST CONTENT',
        template: 'TEXT',
        content: { text: 'PRIVATE TEST CONTENT' },
        createdById: ownerId,
      },
    });
    const archived = await admin.project.create({
      data: {
        organizationId,
        name: 'Archived',
        slug: 'archived-project',
        key: 'ARCH',
        deletedAt: new Date(),
      },
    });
    const archivedSuite = await admin.suite.create({
      data: { organizationId, projectId: archived.id, name: 'Archived' },
    });
    const archivedSection = await admin.section.create({
      data: {
        organizationId,
        projectId: archived.id,
        suiteId: archivedSuite.id,
        name: 'Archived',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    await admin.testCase.create({
      data: {
        organizationId,
        projectId: archived.id,
        sectionId: archivedSection.id,
        suiteId: archivedSuite.id,
        caseNumber: 1n,
      },
    });
    await admin.testRun.create({
      data: {
        organizationId,
        projectId: archived.id,
        name: 'Archived project run',
        status: 'ACTIVE',
      },
    });
    const now = Date.now();
    for (const [size, expired, completed] of [
      [100, false, false],
      [200, false, false],
      [400, true, false],
      [800, false, true],
    ] as const) {
      await admin.uploadSession.create({
        data: {
          organizationId,
          projectId,
          caseVersionId: version.id,
          createdById: ownerId,
          storageKey: `private-object-key-${randomUUID()}`,
          fileName: 'PRIVATE TEST CONTENT',
          contentType: 'text/plain',
          sizeBytes: BigInt(size),
          checksumSha256: 'a'.repeat(64),
          createdAt: new Date(now - 7_200_000),
          expiresAt: new Date(now + (expired ? -3_600_000 : 3_600_000)),
          completedAt: completed ? new Date(now - 1000) : null,
        },
      });
    }
  }
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
