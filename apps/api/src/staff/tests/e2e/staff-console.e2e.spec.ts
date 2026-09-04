import { randomUUID } from 'node:crypto';
import {
  sessionResponseSchema,
  staffAuditLogListResponseSchema,
  staffOperatorResponseSchema,
  staffOverviewResponseSchema,
  staffSessionResponseSchema,
  staffUserListResponseSchema,
  staffWorkspaceListResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';

const PASSWORD = 'correct horse battery staple';
const suffix = randomUUID().slice(0, 8);
const ownerEmail = `staff-owner-${suffix}@example.com`;
const adminEmail = `staff-admin-${suffix}@example.com`;
const supportEmail = `staff-support-${suffix}@example.com`;

describe('managed staff console API', () => {
  let app: NestFastifyApplication;
  let database: PrismaClient;
  let ownerToken: string;
  let adminToken: string;
  let supportToken: string;
  let ownerId: string;
  let adminId: string;
  let supportId: string;
  const originalEnvironment = {
    deployment: process.env.CASELOG_DEPLOYMENT_MODE,
    billing: process.env.CASELOG_MANAGED_BILLING_ENABLED,
    bootstrapEmail: process.env.CASELOG_STAFF_BOOTSTRAP_EMAIL,
    bootstrapHours: process.env.CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS,
  };

  beforeAll(async () => {
    const databaseUrl = process.env.MIGRATION_DATABASE_URL;
    if (!databaseUrl) throw new Error('MIGRATION_DATABASE_URL is required for staff tests');

    process.env.CASELOG_DEPLOYMENT_MODE = 'managed';
    process.env.CASELOG_MANAGED_BILLING_ENABLED = 'true';
    process.env.CASELOG_STAFF_BOOTSTRAP_EMAIL = ownerEmail;
    process.env.CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS = '24';

    database = createPrismaClient(databaseUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const identities = await Promise.all([
      register(app, 'Staff Owner', ownerEmail),
      register(app, 'Staff Admin', adminEmail),
      register(app, 'Staff Support', supportEmail),
    ]);
    const owner = required(identities[0]);
    const admin = required(identities[1]);
    const support = required(identities[2]);
    ownerToken = owner.accessToken;
    adminToken = admin.accessToken;
    supportToken = support.accessToken;
    ownerId = owner.user.id;
    adminId = admin.user.id;
    supportId = support.user.id;
    await database.user.updateMany({
      where: { id: { in: [ownerId, adminId, supportId] } },
      data: { emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    if (database) {
      const userIds = [ownerId, adminId, supportId].filter(Boolean);
      await database.staffAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
      await database.staffOperator.deleteMany({ where: { userId: { in: userIds } } });
      await database.accountToken.deleteMany({ where: { userId: { in: userIds } } });
      await database.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await database.passwordCredential.deleteMany({ where: { userId: { in: userIds } } });
      await database.user.deleteMany({ where: { id: { in: userIds } } });
      await database.$disconnect();
    }
    if (app) await app.close();
    restoreEnvironment('CASELOG_DEPLOYMENT_MODE', originalEnvironment.deployment);
    restoreEnvironment('CASELOG_MANAGED_BILLING_ENABLED', originalEnvironment.billing);
    restoreEnvironment('CASELOG_STAFF_BOOTSTRAP_EMAIL', originalEnvironment.bootstrapEmail);
    restoreEnvironment('CASELOG_STAFF_BOOTSTRAP_ACCESS_HOURS', originalEnvironment.bootstrapHours);
  });

  it('bootstraps exactly one expiring owner and rejects ordinary users', async () => {
    const ownerSession = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/session',
      headers: bearer(ownerToken),
    });
    expect(ownerSession.statusCode, ownerSession.body).toBe(200);
    expect(staffSessionResponseSchema.parse(ownerSession.json()).operator).toMatchObject({
      userId: ownerId,
      email: ownerEmail,
      role: 'owner',
    });

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/session',
      headers: bearer(adminToken),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('insufficient_permissions');
  });

  it('exposes redacted global metadata according to staff role', async () => {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const grantedAdmin = await grantOperator(ownerToken, adminEmail, 'admin', expiresAt);
    expect(grantedAdmin.operator).toMatchObject({ email: adminEmail, role: 'admin' });
    await grantOperator(ownerToken, supportEmail, 'support', expiresAt);

    const overview = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/overview',
      headers: bearer(supportToken),
    });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(staffOverviewResponseSchema.parse(overview.json())).toMatchObject({
      configuration: { deployment: 'managed', managedBillingEnabled: true },
    });

    const supportUsers = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/users',
      headers: bearer(supportToken),
    });
    expect(supportUsers.statusCode).toBe(403);

    const users = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/users?q=${suffix}`,
      headers: bearer(adminToken),
    });
    expect(users.statusCode, users.body).toBe(200);
    expect(staffUserListResponseSchema.parse(users.json()).users).toHaveLength(3);

    const workspaces = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/workspaces?limit=5',
      headers: bearer(adminToken),
    });
    expect(workspaces.statusCode, workspaces.body).toBe(200);
    staffWorkspaceListResponseSchema.parse(workspaces.json());
  });

  it('audits operator changes and applies revocation immediately', async () => {
    const audit = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/audit-logs',
      headers: bearer(ownerToken),
    });
    expect(audit.statusCode, audit.body).toBe(200);
    expect(
      staffAuditLogListResponseSchema
        .parse(audit.json())
        .auditLogs.some((entry) => entry.action === 'staff.operator.granted'),
    ).toBe(true);

    const immutableEntry = await database.staffAuditLog.findFirstOrThrow({
      where: { actorUserId: ownerId },
    });
    await expect(
      database.staffAuditLog.update({
        where: { id: immutableEntry.id },
        data: { reason: 'This mutation must be rejected' },
      }),
    ).rejects.toThrow();

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/staff/operators/${adminId}`,
      headers: bearer(ownerToken),
      payload: { reason: 'Admin access is no longer required' },
    });
    expect(revoked.statusCode, revoked.body).toBe(204);

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/session',
      headers: bearer(adminToken),
    });
    expect(denied.statusCode).toBe(403);

    const selfRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/v1/staff/operators/${ownerId}`,
      headers: bearer(ownerToken),
      payload: { reason: 'Attempt to revoke the current owner' },
    });
    expect(selfRevoke.statusCode).toBe(409);
    expect(selfRevoke.json().error.code).toBe('staff_operator_self_revoke');
  });

  async function grantOperator(
    token: string,
    email: string,
    role: 'owner' | 'admin' | 'support',
    accessExpiresAt: string,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/operators',
      headers: bearer(token),
      payload: {
        email,
        role,
        accessExpiresAt,
        reason: `Grant ${role} access for staff console operations`,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    return staffOperatorResponseSchema.parse(response.json());
  }
});

async function register(app: NestFastifyApplication, displayName: string, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { displayName, email, password: PASSWORD, termsAccepted: true },
  });
  expect(response.statusCode, response.body).toBe(201);
  return sessionResponseSchema.parse(response.json());
}

function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a test fixture value');
  return value;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
