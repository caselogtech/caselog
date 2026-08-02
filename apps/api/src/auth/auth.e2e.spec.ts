import { randomUUID } from 'node:crypto';
import { sessionResponseSchema } from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { configureApplication } from '../configure-application';
import type { PrismaClient } from '../generated/prisma/client';
import { createPrismaClient } from '../core/database/prisma-client';
import { hashAccountToken } from './account-token';

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
  let organizationSlug: string;
  let accessToken: string;
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
    await admin.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });
  });

  afterAll(async () => {
    if (admin) {
      if (organizationId) {
        await admin.membership.deleteMany({ where: { organizationId } });
        await admin.organization.delete({ where: { id: organizationId } });
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
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
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
      },
    });
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
