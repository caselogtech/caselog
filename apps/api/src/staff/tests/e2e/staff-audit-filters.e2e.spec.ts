import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { sessionResponseSchema, staffAuditLogListResponseSchema } from '@caselog/schemas';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import {
  type AuthoringFixture,
  createAuthoringFixture,
  destroyAuthoringFixture,
  issueAuthoringToken,
} from '../../../auth/tests/support/authoring.e2e-fixture';

describe('staff audit filters', () => {
  let fixture: AuthoringFixture;
  let selfHosted: NestFastifyApplication;
  let token: string;
  let otherId: string;
  const ids = Array.from({ length: 7 }, () => randomUUID()).sort();
  const target = randomUUID();
  const original = {
    deployment: process.env.CASELOG_DEPLOYMENT_MODE,
    billing: process.env.CASELOG_MANAGED_BILLING_ENABLED,
    bootstrap: process.env.CASELOG_STAFF_BOOTSTRAP_EMAIL,
  };
  const from = '2026-11-01T00:00:00.000Z';
  const to = '2026-11-02T00:00:00.000Z';
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
        role: 'OWNER',
        createdAt: new Date(Date.now() - 86_400_000),
        accessExpiresAt: future(),
      },
    });
    const login = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: fixture.email, password: 'correct horse battery staple' },
    });
    token = sessionResponseSchema.parse(login.json()).accessToken;
    const other = await fixture.admin.user.create({
      data: { displayName: 'Another operator', email: `audit-${randomUUID()}@example.com` },
    });
    otherId = other.id;
    await fixture.admin.staffAuditLog.createMany({
      data: ids.map((id, index) => ({
        id,
        actorUserId: index === 4 ? otherId : fixture.ownerId,
        action: index === 2 ? 'staff.operator.revoked' : 'staff.operator.granted',
        targetType: index === 3 ? 'workspace' : 'staff_operator',
        targetId: target,
        reason: 'Audit filter test fixture',
        metadata: { role: 'support' },
        createdAt: new Date(
          index === 5
            ? to
            : index === 6
              ? '2026-10-31T23:59:59.999Z'
              : `2026-11-01T${String(index * 3).padStart(2, '0')}:00:00.000Z`,
        ),
      })),
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
        await fixture.admin.staffAuditLog.deleteMany({
          where: { actorUserId: { in: [fixture.ownerId, otherId].filter(Boolean) } },
        });
        await fixture.admin.staffOperator.deleteMany({ where: { userId: fixture.ownerId } });
        if (otherId) await fixture.admin.user.delete({ where: { id: otherId } });
      }
      await selfHosted?.close();
      await destroyAuthoringFixture(fixture);
    } finally {
      restore('CASELOG_DEPLOYMENT_MODE', original.deployment);
      restore('CASELOG_MANAGED_BILLING_ENABLED', original.billing);
      restore('CASELOG_STAFF_BOOTSTRAP_EMAIL', original.bootstrap);
    }
  });

  function list(query: Record<string, string> = {}) {
    return fixture.app.inject({
      method: 'GET',
      url: `/api/v1/staff/audit-logs?${new URLSearchParams(query)}`,
      headers: { authorization: `Bearer ${token}` },
    });
  }
  function filters() {
    return {
      q: fixture.email.toUpperCase(),
      action: 'staff.operator.granted',
      targetType: 'staff_operator',
      targetId: target,
      from,
      to,
    };
  }

  it('combines actor, action, target and half-open UTC time filters', async () => {
    const response = await list(filters());
    expect(response.statusCode, response.body).toBe(200);
    const data = staffAuditLogListResponseSchema.strict().parse(response.json());
    expect(data.auditLogs.map((event) => event.id)).toEqual(ids.slice(0, 2));
    expect(data.auditLogs[0]?.createdAt).toBe(from);
    expect(data.nextCursor).toBeNull();
    expect(Object.keys(response.json()).sort()).toEqual(['auditLogs', 'nextCursor']);
    const named = staffAuditLogListResponseSchema.parse(
      (await list({ ...filters(), q: 'authoring owner' })).json(),
    );
    expect(named.auditLogs.map((event) => event.id)).toEqual(ids.slice(0, 2));
  });

  it('keeps deterministic pagination and applies filters on every page', async () => {
    const first = staffAuditLogListResponseSchema.parse(
      (await list({ ...filters(), limit: '1' })).json(),
    );
    expect(first.auditLogs.map((event) => event.id)).toEqual([ids[0]]);
    expect(first.nextCursor).toBe(ids[0]);
    const second = staffAuditLogListResponseSchema.parse(
      (await list({ ...filters(), limit: '1', cursor: first.nextCursor ?? '' })).json(),
    );
    expect(second.auditLogs.map((event) => event.id)).toEqual([ids[1]]);
    expect(second.nextCursor).toBeNull();
  });

  it('treats actor wildcards literally and action/target filters as exact values', async () => {
    for (const query of [
      { ...filters(), q: '%_' },
      { ...filters(), action: 'staff.operator.grant' },
      { ...filters(), targetId: target.slice(0, 10) },
    ]) {
      const data = staffAuditLogListResponseSchema.parse((await list(query)).json());
      expect(data).toEqual({ auditLogs: [], nextCursor: null });
    }
    const unfiltered = staffAuditLogListResponseSchema.parse(
      (await list({ targetId: target })).json(),
    );
    expect(unfiltered.auditLogs.map((event) => event.id)).toEqual(ids);
  });

  it('rejects malformed, oversized and unrepresentable filters before SQL', async () => {
    const queries: Record<string, string>[] = [
      { from: to, to: from },
      { from, to: from },
      { from: 'invalid' },
      { from: '0000-01-01T00:00:00Z' },
      { from: '2026-11-01T00:00:00.1234Z' },
      { from: '2026-11-01T00:00:00+02:00' },
      { action: 'x'.repeat(101) },
      { targetType: 'x'.repeat(81) },
      { targetId: 'x'.repeat(201) },
      { q: 'x' },
      { q: 'a\0b' },
      { action: 'a\0b' },
      { limit: '101' },
      { cursor: 'bad' },
    ];
    for (const query of queries) {
      const response = await list(query);
      expect(response.statusCode, response.body).toBe(400);
      expect(response.body).not.toContain('Prisma');
    }
  });

  it('requires owner authority in HTTP and SQL, including live expiry and revocation', async () => {
    for (const data of [
      { role: 'ADMIN' as const },
      { role: 'SUPPORT' as const },
      { accessExpiresAt: new Date(Date.now() - 1000) },
      { disabledAt: new Date() },
    ]) {
      await fixture.admin.staffOperator.update({ where: { userId: fixture.ownerId }, data });
      try {
        expect((await list(filters())).statusCode).toBe(403);
        await expect(
          fixture.application.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('caselog.user_id', ${fixture.ownerId}, true)`;
            return tx.$queryRaw`SELECT * FROM public.search_staff_audit_logs(NULL, 25, NULL, NULL, NULL, NULL, NULL, NULL)`;
          }),
        ).rejects.toThrow();
      } finally {
        await fixture.admin.staffOperator.update({
          where: { userId: fixture.ownerId },
          data: { role: 'OWNER', accessExpiresAt: future(), disabledAt: null },
        });
      }
    }
  });

  it('rejects anonymous/organization/API credentials and self-hosted requests', async () => {
    const url = '/api/v1/staff/audit-logs';
    expect((await fixture.app.inject({ method: 'GET', url })).statusCode).toBe(401);
    const credential = await issueAuthoringToken(fixture, ['projects:read']);
    for (const accessToken of [fixture.ownerToken, credential.token]) {
      expect(
        (
          await fixture.app.inject({
            method: 'GET',
            url,
            headers: { authorization: `Bearer ${accessToken}` },
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (
        await selfHosted.inject({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('preserves append-only protections while exposing filtered reads', async () => {
    const id = ids[0];
    if (!id) throw new Error('Missing audit fixture');
    await expect(
      fixture.application.staffAuditLog.update({
        where: { id },
        data: { reason: 'Attempted rewrite of audit history' },
      }),
    ).rejects.toThrow();
    await expect(fixture.application.staffAuditLog.delete({ where: { id } })).rejects.toThrow();
    expect((await fixture.admin.staffAuditLog.findUniqueOrThrow({ where: { id } })).reason).toBe(
      'Audit filter test fixture',
    );
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
