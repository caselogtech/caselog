import { randomUUID } from 'node:crypto';
import {
  createApiTokenResponseSchema,
  sessionResponseSchema,
  workspaceMemberListResponseSchema,
  workspaceMemberResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('workspace members', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let organizationId = '';
  let foreignOrganizationId = '';
  let ownerToken = '';
  let adminToken = '';
  let memberToken = '';
  let ownerMembershipId = '';
  let adminMembershipId = '';
  let memberMembershipId = '';
  let foreignMembershipId = '';
  let adminApiToken = '';
  const emails: string[] = [];

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for member tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    const owner = await register(`member-owner-${suffix}@example.com`, 'Member Owner');
    const administrator = await register(`member-admin-${suffix}@example.com`, 'Member Admin');
    const member = await register(`member-user-${suffix}@example.com`, 'Member User');
    emails.push(owner.email, administrator.email, member.email);
    const users = await admin.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const userId = (email: string) => users.find((user) => user.email === email)?.id ?? '';

    const organization = await admin.organization.create({
      data: { name: 'Member Workspace', slug: `members-${suffix}` },
    });
    organizationId = organization.id;
    const memberships = await Promise.all([
      admin.membership.create({
        data: { organizationId, userId: userId(owner.email), role: 'OWNER' },
      }),
      admin.membership.create({
        data: { organizationId, userId: userId(administrator.email), role: 'ADMIN' },
      }),
      admin.membership.create({
        data: { organizationId, userId: userId(member.email), role: 'LEAD' },
      }),
    ]);
    const [ownerMembership, adminMembership, memberMembership] = memberships;
    if (!ownerMembership || !adminMembership || !memberMembership) {
      throw new Error('Expected owner, admin, and member fixtures');
    }
    ownerMembershipId = ownerMembership.id;
    adminMembershipId = adminMembership.id;
    memberMembershipId = memberMembership.id;
    ownerToken = await issueOrganizationToken(organization.slug, owner.sessionToken);
    adminToken = await issueOrganizationToken(organization.slug, administrator.sessionToken);
    memberToken = await issueOrganizationToken(organization.slug, member.sessionToken);

    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign Member Workspace', slug: `foreign-members-${suffix}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    foreignMembershipId = (
      await admin.membership.create({
        data: {
          organizationId: foreignOrganizationId,
          userId: userId(member.email),
          role: 'OWNER',
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      await admin.auditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.apiToken.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email: { in: emails } } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('lists active members for organization users with cursor pagination', async () => {
    const first = await app.inject({
      method: 'GET',
      url: '/api/v1/members?limit=2',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(first.statusCode, first.body).toBe(200);
    const firstPage = workspaceMemberListResponseSchema.parse(first.json());
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = await app.inject({
      method: 'GET',
      url: `/api/v1/members?limit=2&cursor=${firstPage.nextCursor}`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    const secondPage = workspaceMemberListResponseSchema.parse(second.json());
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect([...firstPage.items, ...secondPage.items].map(({ role }) => role).sort()).toEqual([
      'admin',
      'lead',
      'owner',
    ]);
  });

  it('enforces the admin management hierarchy and tenant boundary', async () => {
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/members/${memberMembershipId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { role: 'tester' },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(workspaceMemberResponseSchema.parse(changed.json()).member).toMatchObject({
      membershipId: memberMembershipId,
      role: 'tester',
      state: 'active',
    });

    for (const membershipId of [ownerMembershipId, adminMembershipId]) {
      const denied = await app.inject({
        method: 'PATCH',
        url: `/api/v1/members/${membershipId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'lead' },
      });
      expect(denied.statusCode, denied.body).toBe(403);
    }
    const foreign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/members/${foreignMembershipId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { role: 'tester' },
    });
    expect(foreign.statusCode, foreign.body).toBe(404);
  });

  it('deactivates access atomically, revokes API tokens, and reactivates idempotently', async () => {
    const createdToken = await app.inject({
      method: 'POST',
      url: '/api/v1/api-tokens',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Admin automation',
        scopes: ['runs:read'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      },
    });
    adminApiToken = createApiTokenResponseSchema.parse(createdToken.json()).token;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const deactivated = await app.inject({
        method: 'DELETE',
        url: `/api/v1/members/${adminMembershipId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(deactivated.statusCode, deactivated.body).toBe(204);
    }
    const inactive = await app.inject({
      method: 'GET',
      url: '/api/v1/members?state=inactive',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(workspaceMemberListResponseSchema.parse(inactive.json()).items).toEqual([
      expect.objectContaining({ membershipId: adminMembershipId, state: 'inactive' }),
    ]);

    const deniedUser = await app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(deniedUser.statusCode, deniedUser.body).toBe(401);
    const deniedApiToken = await app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { authorization: `Bearer ${adminApiToken}` },
    });
    expect(deniedApiToken.statusCode, deniedApiToken.body).toBe(401);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const activated = await app.inject({
        method: 'POST',
        url: `/api/v1/members/${adminMembershipId}/activate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(activated.statusCode, activated.body).toBe(200);
      expect(workspaceMemberResponseSchema.parse(activated.json()).member.state).toBe('active');
    }
    const restoredUser = await app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(restoredUser.statusCode, restoredUser.body).toBe(200);
    const stillRevokedApiToken = await app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { authorization: `Bearer ${adminApiToken}` },
    });
    expect(stillRevokedApiToken.statusCode, stillRevokedApiToken.body).toBe(401);
  });

  it('transfers the single owner role atomically', async () => {
    const transferred = await app.inject({
      method: 'POST',
      url: `/api/v1/members/${adminMembershipId}/transfer-ownership`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(transferred.statusCode, transferred.body).toBe(200);
    expect(workspaceMemberResponseSchema.parse(transferred.json()).member.role).toBe('owner');

    const deniedFormerOwner = await app.inject({
      method: 'POST',
      url: `/api/v1/members/${memberMembershipId}/transfer-ownership`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(deniedFormerOwner.statusCode, deniedFormerOwner.body).toBe(403);

    const transferredBack = await app.inject({
      method: 'POST',
      url: `/api/v1/members/${ownerMembershipId}/transfer-ownership`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(transferredBack.statusCode, transferredBack.body).toBe(200);
    await expect(
      admin.membership.findMany({
        where: { organizationId, role: 'OWNER', deletedAt: null },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: ownerMembershipId }]);
  });

  it('records one immutable event per effective member change', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit-logs?limit=100',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    const actions = response
      .json()
      .items.map(({ action }: { action: string }) => action)
      .filter((action: string) => action.startsWith('membership.'));
    expect(actions.sort()).toEqual([
      'membership.activated',
      'membership.deactivated',
      'membership.ownership_transferred',
      'membership.ownership_transferred',
      'membership.role_changed',
    ]);
  });

  async function register(email: string, displayName: string) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { displayName, email, password: PASSWORD, termsAccepted: true },
    });
    expect(response.statusCode, response.body).toBe(201);
    return { email, sessionToken: sessionResponseSchema.parse(response.json()).accessToken };
  }

  async function issueOrganizationToken(slug: string, sessionToken: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${slug}/token`,
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().accessToken as string;
  }
});
