import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sessionResponseSchema, staffUserDetailResponseSchema } from '@caselog/schemas';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import {
  type AuthoringFixture,
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
} from '../../../auth/tests/support/authoring.e2e-fixture';

describe('managed staff user cards', () => {
  let fixture: AuthoringFixture;
  let selfHosted: NestFastifyApplication;
  let session: string;
  let userId: string;
  let emptyId: string;
  const suffix = randomUUID();
  const original = {
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
    const user = await fixture.admin.user.create({
      data: { displayName: 'Customer identity', email: `customer-${suffix}@example.com` },
    });
    userId = user.id;
    const empty = await fixture.admin.user.create({
      data: { displayName: 'No memberships', email: `empty-${suffix}@example.com` },
    });
    emptyId = empty.id;
    await fixture.admin.membership.createMany({
      data: [
        { userId, organizationId: fixture.organizationId, role: 'TESTER' },
        { userId, organizationId: fixture.foreignOrganizationId, role: 'READ_ONLY' },
      ],
    });
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
        const userIds = [userId, emptyId].filter(Boolean);
        await fixture.admin.membership.deleteMany({ where: { userId: { in: userIds } } });
        await fixture.admin.user.deleteMany({ where: { id: { in: userIds } } });
        await fixture.admin.staffOperator.deleteMany({ where: { userId: fixture.ownerId } });
      }
      await selfHosted?.close();
      await destroyAuthoringFixture(fixture);
    } finally {
      restore('CASELOG_DEPLOYMENT_MODE', original.deployment);
      restore('CASELOG_MANAGED_BILLING_ENABLED', original.billing);
      restore('CASELOG_STAFF_BOOTSTRAP_EMAIL', original.bootstrap);
    }
  });

  function detail(id = userId, query = '') {
    return fixture.app.inject({
      method: 'GET',
      url: `/api/v1/staff/users/${id}${query}`,
      headers: { authorization: `Bearer ${session}` },
    });
  }

  it('returns only identity metadata and the selected user workspace relationships', async () => {
    const response = await detail();
    expect(response.statusCode, response.body).toBe(200);
    const data = staffUserDetailResponseSchema.strict().parse(response.json());
    expect(data.user).toMatchObject({
      id: userId,
      emailVerified: false,
      activeWorkspaceCount: 2,
      billingAccountCount: 0,
      deletedAt: null,
    });
    expect(data.workspaces).toHaveLength(2);
    expect(data.workspaces.find((item) => item.id === fixture.foreignOrganizationId)?.role).toBe(
      'read_only',
    );
    expect(data.workspaces.find((item) => item.id === fixture.organizationId)?.role).toBe('tester');
    expect(Object.keys(response.json().user).sort()).toEqual([
      'activeWorkspaceCount',
      'billingAccountCount',
      'createdAt',
      'deletedAt',
      'displayName',
      'email',
      'emailVerified',
      'id',
    ]);
    expect(Object.keys(response.json().workspaces[0]).sort()).toEqual([
      'deletedAt',
      'id',
      'name',
      'role',
      'slug',
    ]);
    expect(response.body).not.toMatch(/password|tokenHash|session|content|caseNumber/);
    const actor = staffUserDetailResponseSchema.parse((await detail(fixture.ownerId)).json());
    expect(actor.workspaces.map((item) => item.id)).toEqual([fixture.organizationId]);
  });

  it('paginates by workspace identity, keeping the user visible after the final page', async () => {
    const expected = [fixture.organizationId, fixture.foreignOrganizationId].sort();
    const first = staffUserDetailResponseSchema.parse((await detail(userId, '?limit=1')).json());
    expect(first.workspaces.map((item) => item.id)).toEqual([expected[0]]);
    expect(first.nextCursor).toBe(expected[0]);
    const second = staffUserDetailResponseSchema.parse(
      (await detail(userId, `?limit=1&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.workspaces.map((item) => item.id)).toEqual([expected[1]]);
    expect(second.nextCursor).toBeNull();
    const exhausted = staffUserDetailResponseSchema.parse(
      (await detail(userId, `?cursor=${expected[1]}`)).json(),
    );
    expect(exhausted.user.id).toBe(userId);
    expect(exhausted.workspaces).toEqual([]);
  });

  it('represents deleted users/workspaces and excludes removed memberships', async () => {
    const membership = {
      organizationId_userId: { organizationId: fixture.organizationId, userId },
    };
    await fixture.admin.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    await fixture.admin.organization.update({
      where: { id: fixture.foreignOrganizationId },
      data: { deletedAt: new Date() },
    });
    await fixture.admin.membership.update({ where: membership, data: { deletedAt: new Date() } });
    try {
      const data = staffUserDetailResponseSchema.parse((await detail()).json());
      expect(data.user.deletedAt).not.toBeNull();
      expect(data.user.activeWorkspaceCount).toBe(1);
      expect(data.workspaces).toHaveLength(1);
      expect(data.workspaces[0]).toMatchObject({
        id: fixture.foreignOrganizationId,
        deletedAt: expect.any(String),
      });
    } finally {
      await fixture.admin.membership.update({ where: membership, data: { deletedAt: null } });
      await fixture.admin.organization.update({
        where: { id: fixture.foreignOrganizationId },
        data: { deletedAt: null },
      });
      await fixture.admin.user.update({ where: { id: userId }, data: { deletedAt: null } });
    }
  });

  it('distinguishes an empty user from an unknown identity and validates bounds', async () => {
    const data = staffUserDetailResponseSchema.parse((await detail(emptyId)).json());
    expect(data.workspaces).toEqual([]);
    expect(data.user.activeWorkspaceCount).toBe(0);
    expect(data.nextCursor).toBeNull();
    expect((await detail(randomUUID())).statusCode).toBe(404);
    expect((await detail('invalid')).statusCode).toBe(400);
    for (const query of ['?limit=0', '?limit=101', '?cursor=invalid']) {
      expect((await detail(userId, query)).statusCode).toBe(400);
    }
  });

  it('rejects anonymous and organization/API credentials', async () => {
    const url = `/api/v1/staff/users/${userId}`;
    expect((await fixture.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const token = await issueAuthoringToken(fixture, ['projects:read']);
    for (const credential of [fixture.ownerToken, token.token]) {
      expect(
        (
          await fixture.app.inject({
            method: 'GET',
            url,
            headers: { authorization: `Bearer ${credential}` },
          })
        ).statusCode,
      ).toBe(401);
    }
  });

  it('checks live staff authority at HTTP and both SQL projections', async () => {
    for (const data of [
      { role: 'SUPPORT' as const },
      { accessExpiresAt: new Date(Date.now() - 1000) },
      { disabledAt: new Date() },
    ]) {
      await fixture.admin.staffOperator.update({ where: { userId: fixture.ownerId }, data });
      try {
        expect((await detail()).statusCode).toBe(403);
        for (const projection of ['identity', 'relationships']) {
          await expect(
            fixture.application.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('caselog.user_id', ${fixture.ownerId}, true)`;
              return projection === 'identity'
                ? tx.$queryRaw`SELECT * FROM public.staff_user_details(${userId}::UUID)`
                : tx.$queryRaw`SELECT * FROM public.staff_user_workspaces(${userId}::UUID, NULL, 25)`;
            }),
          ).rejects.toThrow();
        }
      } finally {
        await fixture.admin.staffOperator.update({
          where: { userId: fixture.ownerId },
          data: { role: 'ADMIN', accessExpiresAt: future(), disabledAt: null },
        });
      }
    }
  });

  it('keeps tenant membership RLS and self-hosted denial intact', async () => {
    const invisible = await runInTenant(fixture.application, fixture.organizationId, async (tx) => {
      await tx.$executeRaw`SELECT set_config('caselog.user_id', ${fixture.ownerId}, true)`;
      return tx.$queryRaw`SELECT id FROM memberships WHERE organization_id = ${fixture.foreignOrganizationId}::UUID AND user_id = ${userId}::UUID`;
    });
    expect(invisible).toEqual([]);
    const response = await selfHosted.inject({
      method: 'GET',
      url: `/api/v1/staff/users/${userId}`,
      headers: { authorization: `Bearer ${session}` },
    });
    expect(response.statusCode).toBe(404);
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
