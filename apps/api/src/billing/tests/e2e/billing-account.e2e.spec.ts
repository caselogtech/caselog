import { randomUUID } from 'node:crypto';
import {
  billingAccountListResponseSchema,
  createBillingAccountResponseSchema,
  createWorkspaceResponseSchema,
  sessionResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';

const PASSWORD = 'correct horse battery staple';
let nextRequestAddress = 10;

describe('billing account API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let application: PrismaClient;
  let ownerId: string;
  let accountAdminId: string;
  let outsiderId: string;
  let ownerToken: string;
  let accountAdminToken: string;
  let outsiderToken: string;
  let billingAccountId: string | undefined;
  const organizationIds: string[] = [];
  const originalEnvironment = {
    deployment: process.env.CASELOG_DEPLOYMENT_MODE,
    billing: process.env.CASELOG_MANAGED_BILLING_ENABLED,
  };

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for billing account tests');
    }

    process.env.CASELOG_DEPLOYMENT_MODE = 'managed';
    process.env.CASELOG_MANAGED_BILLING_ENABLED = 'true';

    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    const registrations = await Promise.all(
      [
        ['Billing Owner', `billing-owner-${suffix}@example.com`],
        ['Billing Admin', `billing-admin-${suffix}@example.com`],
        ['Billing Outsider', `billing-outsider-${suffix}@example.com`],
      ].map(([displayName, email]) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: { displayName, email, password: PASSWORD, termsAccepted: true },
        }),
      ),
    );

    const sessionTokens = registrations.map(
      (response) => sessionResponseSchema.parse(response.json()).accessToken,
    );
    ownerToken = required(sessionTokens[0]);
    accountAdminToken = required(sessionTokens[1]);
    outsiderToken = required(sessionTokens[2]);
    const users = await admin.user.findMany({
      where: {
        email: {
          in: registrations.map(
            (response) => sessionResponseSchema.parse(response.json()).user.email,
          ),
        },
      },
      orderBy: { displayName: 'asc' },
    });
    const byName = new Map(users.map((user) => [user.displayName, user.id]));
    ownerId = required(byName.get('Billing Owner'));
    accountAdminId = required(byName.get('Billing Admin'));
    outsiderId = required(byName.get('Billing Outsider'));
    await admin.user.updateMany({
      where: { id: { in: [ownerId, accountAdminId] } },
      data: { emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    if (admin) {
      for (const organizationId of organizationIds) {
        await admin.resultStatus.deleteMany({ where: { organizationId } });
        await admin.section.deleteMany({ where: { organizationId } });
        await admin.suite.deleteMany({ where: { organizationId } });
        await admin.usageCounter.deleteMany({ where: { organizationId } });
        await admin.project.deleteMany({ where: { organizationId } });
        await admin.membership.deleteMany({ where: { organizationId } });
        await admin.organization.deleteMany({ where: { id: organizationId } });
      }
      if (billingAccountId) {
        await admin.billingAccountMembership.deleteMany({ where: { billingAccountId } });
        await admin.billingAccount.deleteMany({ where: { id: billingAccountId } });
      }
      const userIds = [ownerId, accountAdminId, outsiderId].filter((userId): userId is string =>
        Boolean(userId),
      );
      if (userIds.length > 0) {
        await admin.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await admin.$disconnect();
    }
    if (application) await application.$disconnect();
    if (app) await app.close();
    restoreEnvironment('CASELOG_DEPLOYMENT_MODE', originalEnvironment.deployment);
    restoreEnvironment('CASELOG_MANAGED_BILLING_ENABLED', originalEnvironment.billing);
  });

  it('groups isolated workspaces under one authorized commercial account', async () => {
    const unverifiedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/accounts',
      headers: {
        authorization: `Bearer ${outsiderToken}`,
        'idempotency-key': `unverified-${randomUUID()}`,
      },
      payload: { name: 'Unverified Company' },
    });
    expect(unverifiedCreate.statusCode).toBe(403);
    expect(unverifiedCreate.json().error.code).toBe('email_verification_required');

    const accountIdempotencyKey = `account-${randomUUID()}`;
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': accountIdempotencyKey,
      },
      payload: { name: 'Northstar Quality' },
    });
    expect(created.statusCode, created.body).toBe(201);
    const account = createBillingAccountResponseSchema.parse(created.json()).billingAccount;
    billingAccountId = account.id;
    expect(account).toMatchObject({
      name: 'Northstar Quality',
      role: 'owner',
      workspaceCount: 0,
    });

    const accountReplay = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': accountIdempotencyKey,
      },
      payload: { name: 'Northstar Quality' },
    });
    expect(accountReplay.statusCode, accountReplay.body).toBe(201);
    expect(createBillingAccountResponseSchema.parse(accountReplay.json()).billingAccount).toEqual(
      account,
    );

    const accountConflict = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/accounts',
      headers: {
        authorization: `Bearer ${ownerToken}`,
        'idempotency-key': accountIdempotencyKey,
      },
      payload: { name: 'Different Company' },
    });
    expect(accountConflict.statusCode, accountConflict.body).toBe(409);
    expect(accountConflict.json().error.code).toBe('idempotency_conflict');

    await admin.billingAccountMembership.create({
      data: { billingAccountId, userId: accountAdminId, role: 'ADMIN' },
    });

    const [ownerList, adminList, outsiderList] = await Promise.all([
      listAccounts(app, ownerToken),
      listAccounts(app, accountAdminToken),
      listAccounts(app, outsiderToken),
    ]);
    expect(ownerList.billingAccounts).toEqual([account]);
    expect(adminList.billingAccounts).toEqual([{ ...account, role: 'admin' }]);
    expect(outsiderList.billingAccounts).toEqual([]);

    const ownerWorkspaceIdempotencyKey = `workspace-${randomUUID()}`;
    const ownerWorkspaceRequest = {
      name: 'Product Workspace',
      slug: `billing-owner-${randomUUID().slice(0, 8)}`,
    };
    const ownerWorkspace = await createWorkspace(
      app,
      ownerToken,
      billingAccountId,
      ownerWorkspaceRequest,
      ownerWorkspaceIdempotencyKey,
    );
    const ownerWorkspaceReplay = await createWorkspace(
      app,
      ownerToken,
      billingAccountId,
      ownerWorkspaceRequest,
      ownerWorkspaceIdempotencyKey,
    );
    expect(ownerWorkspaceReplay).toEqual(ownerWorkspace);
    organizationIds.push(ownerWorkspace.workspace.id);

    const implicitAccess = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${ownerWorkspace.workspace.slug}/token`,
      headers: { authorization: `Bearer ${accountAdminToken}` },
    });
    expect(implicitAccess.statusCode).toBe(404);

    const unauthorizedWorkspace = await app.inject({
      method: 'POST',
      url: `/api/v1/billing/accounts/${billingAccountId}/workspaces`,
      headers: {
        authorization: `Bearer ${outsiderToken}`,
        'idempotency-key': `foreign-${randomUUID()}`,
      },
      payload: { name: 'Foreign Workspace', slug: `foreign-${randomUUID().slice(0, 8)}` },
    });
    expect(unauthorizedWorkspace.statusCode).toBe(404);
    expect(unauthorizedWorkspace.json().error.code).toBe('not_found');

    const adminWorkspace = await createWorkspace(app, accountAdminToken, billingAccountId, {
      name: 'Platform Workspace',
      slug: `billing-admin-${randomUUID().slice(0, 8)}`,
    });
    organizationIds.push(adminWorkspace.workspace.id);

    for (let index = 0; index < 4; index += 1) {
      const additionalWorkspace = await createWorkspace(app, ownerToken, billingAccountId, {
        name: `Additional Workspace ${index + 1}`,
        slug: `billing-extra-${index}-${randomUUID().slice(0, 8)}`,
      });
      organizationIds.push(additionalWorkspace.workspace.id);
    }

    const directManagedWorkspace = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/workspaces',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Bypass Workspace', slug: `bypass-${randomUUID().slice(0, 8)}` },
    });
    expect(directManagedWorkspace.statusCode).toBe(400);
    expect(directManagedWorkspace.json().error.code).toBe('billing_account_required');

    const groupedOrganizations = await admin.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { billingAccountId: true },
    });
    expect(groupedOrganizations).toHaveLength(6);
    expect(
      groupedOrganizations.every(
        (organization) => organization.billingAccountId === billingAccountId,
      ),
    ).toBe(true);
    await expect(
      admin.membership.count({
        where: {
          organizationId: ownerWorkspace.workspace.id,
          userId: accountAdminId,
        },
      }),
    ).resolves.toBe(0);

    const refreshed = await listAccounts(app, ownerToken);
    expect(refreshed.billingAccounts[0]?.workspaceCount).toBe(6);

    await expect(application.billingAccount.findMany()).resolves.toEqual([]);
    await expect(application.sessionIdempotencyRecord.findMany()).resolves.toEqual([]);
    const ownerVisibleAccounts = await application.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${ownerId}, true)`;
      return transaction.billingAccount.findMany({ select: { id: true } });
    });
    expect(ownerVisibleAccounts).toEqual([{ id: billingAccountId }]);
    const outsiderVisibleAccounts = await application.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${outsiderId}, true)`;
      return transaction.billingAccount.findMany({ select: { id: true } });
    });
    expect(outsiderVisibleAccounts).toEqual([]);
    const outsiderVisibleRequests = await application.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${outsiderId}, true)`;
      return transaction.sessionIdempotencyRecord.findMany({ select: { key: true } });
    });
    expect(outsiderVisibleRequests).toEqual([]);
    await expect(
      application.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT set_config('caselog.user_id', ${ownerId}, true)`;
        return transaction.billingAccount.create({
          data: { name: 'Bypass Account', createdById: ownerId },
        });
      }),
    ).rejects.toThrow();
  });
});

async function listAccounts(app: NestFastifyApplication, token: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/billing/accounts',
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.statusCode, response.body).toBe(200);
  return billingAccountListResponseSchema.parse(response.json());
}

async function createWorkspace(
  app: NestFastifyApplication,
  token: string,
  billingAccountId: string,
  payload: { name: string; slug: string },
  idempotencyKey = `workspace-${randomUUID()}`,
) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/billing/accounts/${billingAccountId}/workspaces`,
    remoteAddress: `127.0.0.${nextRequestAddress++}`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
    payload,
  });
  expect(response.statusCode, response.body).toBe(201);
  return createWorkspaceResponseSchema.parse(response.json());
}

function required(value: string | undefined): string {
  if (!value) throw new Error('Expected test fixture value');
  return value;
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
