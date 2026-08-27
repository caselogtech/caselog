import { randomUUID } from 'node:crypto';
import {
  acceptWorkspaceInvitationResponseSchema,
  createWorkspaceInvitationsResponseSchema,
  sessionResponseSchema,
  workspaceInvitationListResponseSchema,
  workspaceInvitationPreviewSchema,
  workspaceInvitationResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import { MailService } from '../../../core/mail/application/services/mail.service';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('workspace invitations', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let organizationId = '';
  let foreignOrganizationId = '';
  let ownerToken = '';
  let adminToken = '';
  let inviteeSessionToken = '';
  let outsiderSessionToken = '';
  let inviteeEmail = '';
  let newInviteeEmail = '';
  let contributorEmail = '';
  let ownerEmail = '';
  let testerInvitationId = '';
  let contributorInvitationId = '';
  let foreignInvitationId = '';
  const emails: string[] = [];
  const invitationMessages: Array<{ to: string; link: string }> = [];
  const mail = {
    sendEmailVerification: async () => undefined,
    sendPasswordReset: async () => undefined,
    sendWorkspaceInvitation: async (
      to: string,
      _inviter: string,
      _workspace: string,
      _role: string,
      link: string,
    ) => {
      invitationMessages.push({ to, link });
    },
  };

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for invitation tests');
    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    ownerEmail = `invite-owner-${suffix}@example.com`;
    const adminEmail = `invite-admin-${suffix}@example.com`;
    inviteeEmail = `invite-user-${suffix}@example.com`;
    newInviteeEmail = `invite-new-user-${suffix}@example.com`;
    contributorEmail = `invite-contributor-${suffix}@example.com`;
    const outsiderEmail = `invite-outsider-${suffix}@example.com`;
    emails.push(ownerEmail, adminEmail, inviteeEmail, newInviteeEmail, outsiderEmail);
    const [owner, administrator, invitee, outsider] = await Promise.all([
      register(ownerEmail, 'Invitation Owner'),
      register(adminEmail, 'Invitation Admin'),
      register(inviteeEmail, 'Invited Tester'),
      register(outsiderEmail, 'Invitation Outsider'),
    ]);
    inviteeSessionToken = invitee;
    outsiderSessionToken = outsider;
    const users = await admin.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const userId = (email: string) => users.find((user) => user.email === email)?.id ?? '';
    const organization = await admin.organization.create({
      data: { name: 'Invitation Workspace', slug: `invitations-${suffix}` },
    });
    organizationId = organization.id;
    await Promise.all([
      admin.membership.create({
        data: { organizationId, userId: userId(ownerEmail), role: 'OWNER' },
      }),
      admin.membership.create({
        data: { organizationId, userId: userId(adminEmail), role: 'ADMIN' },
      }),
    ]);
    ownerToken = await issueOrganizationToken(organization.slug, owner);
    adminToken = await issueOrganizationToken(organization.slug, administrator);

    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign Invitation Workspace', slug: `foreign-invitations-${suffix}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    foreignInvitationId = (
      await admin.workspaceInvitation.create({
        data: {
          organizationId: foreignOrganizationId,
          email: outsiderEmail,
          role: 'TESTER',
          tokenHash: randomUUID().replaceAll('-', '').repeat(2),
          invitedById: userId(ownerEmail),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      await admin.workspaceInvitation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.auditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email: { in: emails } } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('creates bulk invitations, delivers opaque links, and exposes a public preview', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/members/invitations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {
        invitations: [
          { email: inviteeEmail, role: 'tester' },
          { email: contributorEmail, role: 'contributor' },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(response.body).not.toContain('clgi_');
    const created = createWorkspaceInvitationsResponseSchema.parse(response.json());
    expect(created.invitations).toHaveLength(2);
    testerInvitationId = created.invitations.find(({ email }) => email === inviteeEmail)?.id ?? '';
    contributorInvitationId =
      created.invitations.find(({ email }) => email === contributorEmail)?.id ?? '';
    expect(invitationMessages).toHaveLength(2);

    const token = invitationTokenFor(inviteeEmail);
    const preview = await app.inject({
      method: 'GET',
      url: `/api/v1/invitations/${token}`,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(workspaceInvitationPreviewSchema.parse(preview.json())).toMatchObject({
      email: inviteeEmail,
      role: 'tester',
      workspace: { id: organizationId, name: 'Invitation Workspace' },
      invitedBy: { displayName: 'Invitation Owner' },
    });
    const stored = await admin.workspaceInvitation.findUniqueOrThrow({
      where: { organizationId_id: { organizationId, id: testerInvitationId } },
      select: { tokenHash: true },
    });
    expect(stored.tokenHash).not.toContain(token);
  });

  it('enforces invitation role hierarchy, active-member conflicts, and tenant boundaries', async () => {
    const adminGrant = await app.inject({
      method: 'POST',
      url: '/api/v1/members/invitations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { invitations: [{ email: 'next-admin@example.com', role: 'admin' }] },
    });
    expect(adminGrant.statusCode, adminGrant.body).toBe(403);

    const existingMember = await app.inject({
      method: 'POST',
      url: '/api/v1/members/invitations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { invitations: [{ email: ownerEmail, role: 'tester' }] },
    });
    expect(existingMember.statusCode, existingMember.body).toBe(409);
    expect(existingMember.json().error.code).toBe('member_already_active');

    const foreign = await app.inject({
      method: 'DELETE',
      url: `/api/v1/members/invitations/${foreignInvitationId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(foreign.statusCode, foreign.body).toBe(404);
  });

  it('registers a new account only through its valid pending invitation', async () => {
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/members/invitations',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { invitations: [{ email: newInviteeEmail, role: 'tester' }] },
    });
    expect(createdResponse.statusCode, createdResponse.body).toBe(201);
    const token = invitationTokenFor(newInviteeEmail);

    const registration = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/register`,
      payload: {
        displayName: 'New Invitation User',
        password: PASSWORD,
        termsAccepted: false,
      },
    });
    expect(registration.statusCode, registration.body).toBe(201);
    expect(registration.headers['set-cookie']).toContain('caselog_refresh=');
    const session = sessionResponseSchema.parse(registration.json());
    expect(session.user.email).toBe(newInviteeEmail);

    const acceptedResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(acceptedResponse.statusCode, acceptedResponse.body).toBe(200);
    expect(acceptWorkspaceInvitationResponseSchema.parse(acceptedResponse.json())).toMatchObject({
      workspace: { id: organizationId },
      role: 'tester',
    });
  });

  it('accepts only with the matching account and remains idempotent', async () => {
    const token = invitationTokenFor(inviteeEmail);
    const mismatch = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${outsiderSessionToken}` },
    });
    expect(mismatch.statusCode, mismatch.body).toBe(403);

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${inviteeSessionToken}` },
    });
    expect(first.statusCode, first.body).toBe(200);
    const accepted = acceptWorkspaceInvitationResponseSchema.parse(first.json());
    expect(accepted).toMatchObject({ workspace: { id: organizationId }, role: 'tester' });
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${inviteeSessionToken}` },
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual(accepted);

    const user = await admin.user.findUniqueOrThrow({
      where: { email: inviteeEmail },
      select: { emailVerifiedAt: true },
    });
    expect(user.emailVerifiedAt).toEqual(expect.any(Date));
    const organizationToken = await issueOrganizationToken(
      accepted.workspace.slug,
      inviteeSessionToken,
    );
    const members = await app.inject({
      method: 'GET',
      url: '/api/v1/members',
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(members.statusCode, members.body).toBe(200);
  });

  it('rotates tokens on resend and revokes pending invitations idempotently', async () => {
    const previousToken = invitationTokenFor(contributorEmail);
    const resent = await app.inject({
      method: 'POST',
      url: `/api/v1/members/invitations/${contributorInvitationId}/resend`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(resent.statusCode, resent.body).toBe(200);
    expect(workspaceInvitationResponseSchema.parse(resent.json()).invitation.status).toBe(
      'pending',
    );
    const nextToken = invitationTokenFor(contributorEmail);
    expect(nextToken).not.toBe(previousToken);
    const stale = await app.inject({ method: 'GET', url: `/api/v1/invitations/${previousToken}` });
    expect(stale.statusCode, stale.body).toBe(400);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const revoked = await app.inject({
        method: 'DELETE',
        url: `/api/v1/members/invitations/${contributorInvitationId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(revoked.statusCode, revoked.body).toBe(204);
    }
    const revokedPreview = await app.inject({
      method: 'GET',
      url: `/api/v1/invitations/${nextToken}`,
    });
    expect(revokedPreview.statusCode, revokedPreview.body).toBe(400);
    const revokedList = await app.inject({
      method: 'GET',
      url: '/api/v1/members/invitations?status=revoked',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(workspaceInvitationListResponseSchema.parse(revokedList.json()).items).toEqual([
      expect.objectContaining({ id: contributorInvitationId, status: 'revoked' }),
    ]);
  });

  it('records invitation security events without storing raw tokens', async () => {
    const actions = (
      await admin.auditLog.findMany({
        where: { organizationId, action: { startsWith: 'membership.invitation_' } },
        orderBy: { createdAt: 'asc' },
        select: { action: true, metadata: true },
      })
    ).map(({ action }) => action);
    expect(actions).toEqual([
      'membership.invitation_sent',
      'membership.invitation_sent',
      'membership.invitation_sent',
      'membership.invitation_accepted',
      'membership.invitation_accepted',
      'membership.invitation_resent',
      'membership.invitation_revoked',
    ]);
    expect(
      JSON.stringify(await admin.auditLog.findMany({ where: { organizationId } })),
    ).not.toContain('clgi_');
  });

  async function register(email: string, displayName: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { displayName, email, password: PASSWORD, termsAccepted: true },
    });
    expect(response.statusCode, response.body).toBe(201);
    return sessionResponseSchema.parse(response.json()).accessToken;
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

  function invitationTokenFor(email: string): string {
    const link = invitationMessages.filter((message) => message.to === email).at(-1)?.link;
    const token = link ? new URL(link).pathname.split('/').at(-1) : undefined;
    if (!token) throw new Error(`Expected an invitation email for ${email}`);
    return token;
  }
});
