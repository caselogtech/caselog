import { createHash, randomUUID } from 'node:crypto';
import { sessionResponseSchema } from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';

const PASSWORD = 'correct horse battery staple';

describe('workspace lifecycle API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let organizationId: string;
  let foreignOrganizationId: string;
  let ownerId: string;
  let adminId: string;
  let ownerSessionToken: string;
  let adminSessionToken: string;
  let organizationToken: string;
  let ownerEmail: string;
  let adminEmail: string;
  let originalSlug: string;

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for workspace tests');

    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    ownerEmail = `workspace-owner-${suffix}@example.com`;
    adminEmail = `workspace-admin-${suffix}@example.com`;
    originalSlug = `lifecycle-${suffix}`;

    const [ownerRegistration, adminRegistration] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          displayName: 'Workspace Owner',
          email: ownerEmail,
          password: PASSWORD,
          termsAccepted: true,
        },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          displayName: 'Workspace Admin',
          email: adminEmail,
          password: PASSWORD,
          termsAccepted: true,
        },
      }),
    ]);
    ownerSessionToken = sessionResponseSchema.parse(ownerRegistration.json()).accessToken;
    adminSessionToken = sessionResponseSchema.parse(adminRegistration.json()).accessToken;

    const [owner, workspaceAdmin] = await Promise.all([
      admin.user.findUniqueOrThrow({ where: { email: ownerEmail } }),
      admin.user.findUniqueOrThrow({ where: { email: adminEmail } }),
    ]);
    ownerId = owner.id;
    adminId = workspaceAdmin.id;
    const organization = await admin.organization.create({
      data: { name: 'Lifecycle Workspace', slug: originalSlug },
    });
    organizationId = organization.id;
    await admin.membership.createMany({
      data: [
        { organizationId, userId: ownerId, role: 'OWNER' },
        { organizationId, userId: adminId, role: 'ADMIN' },
      ],
    });

    const tokenResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${originalSlug}/token`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    organizationToken = tokenResponse.json().accessToken as string;
  });

  afterAll(async () => {
    if (admin) {
      if (organizationId) {
        await admin.auditLog.deleteMany({ where: { organizationId } });
        await admin.workspaceInvitation.deleteMany({ where: { organizationId } });
        await admin.apiToken.deleteMany({ where: { organizationId } });
        await admin.organizationSlugRedirect.deleteMany({ where: { organizationId } });
        await admin.membership.deleteMany({ where: { organizationId } });
        await admin.organization.deleteMany({ where: { id: organizationId } });
      }
      if (foreignOrganizationId) {
        await admin.organizationSlugRedirect.deleteMany({
          where: { organizationId: foreignOrganizationId },
        });
        await admin.organization.deleteMany({ where: { id: foreignOrganizationId } });
      }
      const emails = [ownerEmail, adminEmail].filter((email): email is string => Boolean(email));
      if (emails.length > 0) {
        await admin.user.deleteMany({ where: { email: { in: emails } } });
      }
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('renames, redirects, deletes, and restores a workspace with owner invariants', async () => {
    const settings = await app.inject({
      method: 'GET',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(settings.statusCode, settings.body).toBe(200);
    expect(settings.json()).toMatchObject({
      workspace: {
        id: organizationId,
        name: 'Lifecycle Workspace',
        slug: originalSlug,
        deletedAt: null,
        recoverableUntil: null,
      },
    });

    const updatedSlug = `renamed-${randomUUID().slice(0, 8)}`;
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { name: 'Renamed Workspace', slug: updatedSlug },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({
      workspace: { id: organizationId, name: 'Renamed Workspace', slug: updatedSlug },
    });

    const redirectedToken = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${originalSlug}/token`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(redirectedToken.statusCode, redirectedToken.body).toBe(200);
    expect(redirectedToken.json()).toMatchObject({
      organization: { id: organizationId, slug: updatedSlug },
    });
    organizationToken = redirectedToken.json().accessToken as string;

    const oldSlugAvailability = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/workspaces/slug-availability?slug=${originalSlug}`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(oldSlugAvailability.json()).toEqual({ available: false });

    const foreignRedirectSlug = `foreign-old-${randomUUID().slice(0, 8)}`;
    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign Workspace', slug: `foreign-${randomUUID().slice(0, 8)}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    await admin.organizationSlugRedirect.create({
      data: { organizationId: foreignOrganization.id, slug: foreignRedirectSlug },
    });
    const crossTenantRedirectConflict = await app.inject({
      method: 'PATCH',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { slug: foreignRedirectSlug },
    });
    expect(crossTenantRedirectConflict.statusCode).toBe(409);
    expect(crossTenantRedirectConflict.json().error.code).toBe('workspace_slug_taken');

    const reclaimedOwnRedirect = await app.inject({
      method: 'PATCH',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { slug: originalSlug },
    });
    expect(reclaimedOwnRedirect.statusCode, reclaimedOwnRedirect.body).toBe(200);
    const returnedToUpdatedSlug = await app.inject({
      method: 'PATCH',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { slug: updatedSlug },
    });
    expect(returnedToUpdatedSlug.statusCode, returnedToUpdatedSlug.body).toBe(200);

    await admin.apiToken.create({
      data: {
        organizationId,
        createdById: ownerId,
        name: 'Lifecycle token',
        tokenPrefix: 'clg_12345678',
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
        scopes: ['RUNS_READ'],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await admin.workspaceInvitation.create({
      data: {
        organizationId,
        email: `invite-${randomUUID().slice(0, 8)}@example.com`,
        role: 'TESTER',
        tokenHash: createHash('sha256').update(randomUUID()).digest('hex'),
        invitedById: ownerId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const adminOrganizationTokenResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${updatedSlug}/token`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    const adminOrganizationToken = adminOrganizationTokenResponse.json().accessToken as string;
    const adminDelete = await app.inject({
      method: 'DELETE',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${adminOrganizationToken}` },
      payload: { confirmation: 'Renamed Workspace' },
    });
    expect(adminDelete.statusCode).toBe(403);

    const incorrectConfirmation = await app.inject({
      method: 'DELETE',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { confirmation: 'renamed workspace' },
    });
    expect(incorrectConfirmation.statusCode).toBe(400);
    expect(incorrectConfirmation.json().error.code).toBe('workspace_confirmation_mismatch');

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
      payload: { confirmation: 'Renamed Workspace' },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json().workspace).toMatchObject({
      id: organizationId,
      deletedAt: expect.any(String),
      recoverableUntil: expect.any(String),
    });
    await expect(
      admin.apiToken.count({ where: { organizationId, revokedAt: null } }),
    ).resolves.toBe(0);
    await expect(
      admin.workspaceInvitation.count({ where: { organizationId, revokedAt: null } }),
    ).resolves.toBe(0);

    const staleTokenRequest = await app.inject({
      method: 'GET',
      url: '/api/v1/workspace',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(staleTokenRequest.statusCode).toBe(401);

    const [activeWorkspaces, deletedWorkspaces] = await Promise.all([
      app.inject({
        method: 'GET',
        url: '/api/v1/auth/workspaces',
        headers: { authorization: `Bearer ${ownerSessionToken}` },
      }),
      app.inject({
        method: 'GET',
        url: '/api/v1/auth/workspaces?status=deleted',
        headers: { authorization: `Bearer ${ownerSessionToken}` },
      }),
    ]);
    expect(activeWorkspaces.json().workspaces).toEqual([]);
    expect(deletedWorkspaces.json().workspaces).toEqual([
      expect.objectContaining({
        id: organizationId,
        slug: updatedSlug,
        deletedAt: expect.any(String),
        recoverableUntil: expect.any(String),
      }),
    ]);

    const adminRestore = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/workspaces/${organizationId}/restore`,
      headers: { authorization: `Bearer ${adminSessionToken}` },
    });
    expect(adminRestore.statusCode).toBe(403);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/workspaces/${organizationId}/restore`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({
      workspace: { id: organizationId, deletedAt: null, recoverableUntil: null },
    });

    const canonicalToken = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${originalSlug}/token`,
      headers: { authorization: `Bearer ${ownerSessionToken}` },
    });
    expect(canonicalToken.statusCode, canonicalToken.body).toBe(200);
    expect(canonicalToken.json().organization.slug).toBe(updatedSlug);

    await expect(
      admin.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      }),
    ).resolves.toEqual([
      { action: 'workspace.updated' },
      { action: 'workspace.updated' },
      { action: 'workspace.updated' },
      { action: 'workspace.deletion_requested' },
      { action: 'workspace.restored' },
    ]);
  });
});
