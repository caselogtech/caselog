import {
  readinessDecisionResponseSchema,
  readinessWaiverListResponseSchema,
  readinessWaiverResponseSchema,
} from '@caselog/schemas/readiness';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import type { PrismaClient } from '../../../generated/prisma/client';
import {
  createReadinessWaiverE2eFixture,
  destroyReadinessWaiverE2eFixture,
  type ReadinessWaiverE2eFixture,
} from '../support/readiness-waiver.e2e-fixture';

describe('readiness waiver API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let application: PrismaClient;
  let organizationId = '';
  let ownerId = '';
  let ownerToken = '';
  let readerToken = '';
  let projectSlug = '';
  let projectId = '';
  let candidateId = '';
  let decisionId = '';
  let failedEvaluationId = '';
  let warningEvaluationId = '';
  let decisionWaiverId = '';
  let fixture: ReadinessWaiverE2eFixture | undefined;

  beforeAll(async () => {
    fixture = await createReadinessWaiverE2eFixture();
    ({
      app,
      admin,
      application,
      organizationId,
      ownerId,
      ownerToken,
      readerToken,
      projectSlug,
      projectId,
      candidateId,
      decisionId,
      failedEvaluationId,
      warningEvaluationId,
    } = fixture);
  });

  afterAll(async () => {
    await destroyReadinessWaiverE2eFixture(fixture);
  });

  it('creates an attributable decision waiver idempotently and preserves computed status', async () => {
    const payload = {
      scope: { type: 'decision' },
      reason: 'CAB approved the known checkout risk for this candidate',
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      externalApprovalReference: 'CAB-2026-184',
    };
    const forbidden = await app.inject({
      method: 'POST',
      url: waiverCollectionUrl(),
      headers: writeHeaders(readerToken, 'waiver-reader-create'),
      payload,
    });
    expect(forbidden.statusCode).toBe(403);

    const response = await createWaiver(payload, 'waiver-decision-create');
    decisionWaiverId = response.waiver.id;
    expect(response).toMatchObject({
      effectiveDisposition: 'approved_with_waiver',
      waiver: {
        decisionId,
        scope: { type: 'decision' },
        status: 'active',
        createdById: ownerId,
        externalApprovalReference: 'CAB-2026-184',
      },
    });
    await expect(createWaiver(payload, 'waiver-decision-create')).resolves.toEqual(response);

    const duplicate = await app.inject({
      method: 'POST',
      url: waiverCollectionUrl(),
      headers: writeHeaders(ownerToken, 'waiver-decision-duplicate'),
      payload,
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json().error.code).toBe('active_readiness_waiver_exists');

    const detail = await decisionDetail();
    expect(detail).toMatchObject({
      status: 'blocked',
      effectiveDisposition: 'approved_with_waiver',
    });
    expect(detail.waivers).toHaveLength(1);
  });

  it('appends revocation and applies gate waivers only when all unresolved gates are covered', async () => {
    const forbidden = await app.inject({
      method: 'POST',
      url: `${waiverCollectionUrl()}/${decisionWaiverId}/revocation`,
      headers: writeHeaders(readerToken, 'waiver-reader-revoke'),
      payload: { reason: 'Reader cannot revoke' },
    });
    expect(forbidden.statusCode).toBe(403);

    const revoked = await revokeWaiver(
      decisionWaiverId,
      { reason: 'The temporary CAB approval was withdrawn' },
      'waiver-decision-revoke',
    );
    expect(revoked).toMatchObject({
      effectiveDisposition: 'blocked',
      waiver: { id: decisionWaiverId, status: 'revoked' },
    });
    expect(revoked.waiver.revocation).toMatchObject({ revokedById: ownerId });
    await expect(
      revokeWaiver(
        decisionWaiverId,
        { reason: 'The temporary CAB approval was withdrawn' },
        'waiver-decision-revoke',
      ),
    ).resolves.toEqual(revoked);

    const failedGate = await createWaiver(
      {
        scope: { type: 'gate_evaluation', gateEvaluationId: failedEvaluationId },
        reason: 'Known failure is isolated from this deployment',
      },
      'waiver-failed-gate',
    );
    expect(failedGate.effectiveDisposition).toBe('blocked');
    const warningGate = await createWaiver(
      {
        scope: { type: 'gate_evaluation', gateEvaluationId: warningEvaluationId },
        reason: 'The warning was reviewed by the release lead',
      },
      'waiver-warning-gate',
    );
    expect(warningGate.effectiveDisposition).toBe('approved_with_waiver');

    const afterRevoke = await revokeWaiver(
      failedGate.waiver.id,
      { reason: 'The isolated failure now affects the deployment' },
      'waiver-failed-gate-revoke',
    );
    expect(afterRevoke.effectiveDisposition).toBe('blocked');
    await revokeWaiver(
      warningGate.waiver.id,
      { reason: 'Reopen the warning scope for the concurrency check' },
      'waiver-warning-gate-revoke',
    );
    const concurrentPayloads = [
      {
        scope: { type: 'gate_evaluation', gateEvaluationId: warningEvaluationId },
        reason: 'First concurrent approval',
      },
      {
        scope: { type: 'gate_evaluation', gateEvaluationId: warningEvaluationId },
        reason: 'Second concurrent approval',
      },
    ];
    const concurrent = await Promise.all(
      concurrentPayloads.map((payload, index) =>
        app.inject({
          method: 'POST',
          url: waiverCollectionUrl(),
          headers: writeHeaders(ownerToken, `waiver-concurrent-${index}`),
          payload,
        }),
      ),
    );
    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([201, 409]);
    await expect(
      admin.readinessWaiver.update({
        where: { organizationId_id: { organizationId, id: warningGate.waiver.id } },
        data: { reason: 'Mutated history' },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      admin.readinessWaiverRevocation.update({
        where: { organizationId_id: { organizationId, id: revoked.waiver.revocation?.id ?? '' } },
        data: { reason: 'Mutated history' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('reports expiry from server time, audits lifecycle changes and enforces RLS', async () => {
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    await admin.readinessWaiver.create({
      data: {
        organizationId,
        projectId,
        candidateId,
        decisionId,
        scope: 'DECISION',
        reason: 'Historical approval window',
        expiresAt: new Date(createdAt.getTime() + 60 * 60 * 1_000),
        createdById: ownerId,
        createdAt,
      },
    });
    const response = await app.inject({
      method: 'GET',
      url: `${waiverCollectionUrl()}?limit=10`,
      headers: { authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    const list = readinessWaiverListResponseSchema.parse(response.json());
    expect(list.items.some(({ status }) => status === 'expired')).toBe(true);

    const pastExpiry = await app.inject({
      method: 'POST',
      url: waiverCollectionUrl(),
      headers: writeHeaders(ownerToken, 'waiver-past-expiry'),
      payload: {
        scope: { type: 'decision' },
        reason: 'Invalid expired waiver',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
    });
    expect(pastExpiry.statusCode, pastExpiry.body).toBe(400);
    expect(pastExpiry.json().error.code).toBe('readiness_waiver_expiry_not_future');

    const actions = await admin.auditLog.findMany({
      where: { organizationId, targetType: 'readiness_waiver' },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining(['readiness_waiver.created', 'readiness_waiver.revoked']),
    );
    await expect(application.readinessWaiver.count()).resolves.toBe(0);
    await expect(application.readinessWaiverRevocation.count()).resolves.toBe(0);
    await expect(
      runInTenant(application, organizationId, async (transaction) => ({
        waivers: await transaction.readinessWaiver.count({ where: { decisionId } }),
        revocations: await transaction.readinessWaiverRevocation.count({ where: { decisionId } }),
      })),
    ).resolves.toMatchObject({ waivers: 5, revocations: 3 });
  });

  function waiverCollectionUrl(): string {
    return `/api/v1/projects/${projectSlug}/readiness-decisions/${decisionId}/waivers`;
  }

  async function createWaiver(payload: Record<string, unknown>, idempotencyKey: string) {
    const response = await app.inject({
      method: 'POST',
      url: waiverCollectionUrl(),
      headers: writeHeaders(ownerToken, idempotencyKey),
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return readinessWaiverResponseSchema.parse(response.json());
  }

  async function revokeWaiver(
    waiverId: string,
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `${waiverCollectionUrl()}/${waiverId}/revocation`,
      headers: writeHeaders(ownerToken, idempotencyKey),
      payload,
    });
    expect(response.statusCode, response.body).toBe(201);
    return readinessWaiverResponseSchema.parse(response.json());
  }

  async function decisionDetail() {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/readiness-decisions/${decisionId}`,
      headers: { authorization: `Bearer ${readerToken}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    return readinessDecisionResponseSchema.parse(response.json()).decision;
  }
});

function writeHeaders(token: string, idempotencyKey: string) {
  return { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey };
}
