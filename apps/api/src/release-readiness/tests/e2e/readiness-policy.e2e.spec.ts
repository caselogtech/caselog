import { randomUUID } from 'node:crypto';
import {
  candidatePolicyAssignmentResponseSchema,
  candidateReadinessResponseSchema,
  readinessDecisionListResponseSchema,
  readinessDecisionResponseSchema,
  readinessPolicyResponseSchema,
} from '@caselog/schemas/readiness';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { runInTenant } from '../../../core/database/application/services/tenant-database.service';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('release readiness policy API', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let application: PrismaClient;
  let organizationId = '';
  let organizationToken = '';
  let readOnlyToken = '';
  let projectSlug = '';
  let projectId = '';
  let policyId = '';
  let firstVersionId = '';
  let candidateId = '';
  const emails: string[] = [];

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for release readiness E2E tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    const ownerEmail = `readiness-owner-${suffix}@example.com`;
    const readerEmail = `readiness-reader-${suffix}@example.com`;
    emails.push(ownerEmail, readerEmail);
    const ownerSession = await register(app, 'Readiness Owner', ownerEmail);
    const readerSession = await register(app, 'Readiness Reader', readerEmail);
    const [owner, reader] = await Promise.all([
      admin.user.findUniqueOrThrow({ where: { email: ownerEmail } }),
      admin.user.findUniqueOrThrow({ where: { email: readerEmail } }),
    ]);
    const organization = await admin.organization.create({
      data: { name: 'Readiness Workspace', slug: `readiness-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.createMany({
      data: [
        { organizationId, userId: owner.id, role: 'OWNER' },
        { organizationId, userId: reader.id, role: 'READ_ONLY' },
      ],
    });
    organizationToken = await issueOrganizationToken(app, organization.slug, ownerSession);
    readOnlyToken = await issueOrganizationToken(app, organization.slug, readerSession);
    projectSlug = `readiness-${suffix}`;
    const project = await admin.project.create({
      data: {
        organizationId,
        key: `Q${suffix.slice(0, 7).toUpperCase()}`,
        slug: projectSlug,
        name: 'Readiness project',
      },
    });
    projectId = project.id;
    const environment = await admin.environment.create({
      data: {
        organizationId,
        projectId: project.id,
        name: 'Production',
        slug: 'production',
      },
    });
    const release = await admin.release.create({
      data: {
        organizationId,
        projectId: project.id,
        environmentId: environment.id,
        key: '2026.08',
        name: 'August release',
      },
    });
    const candidate = await admin.releaseCandidate.create({
      data: {
        organizationId,
        projectId: project.id,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'readiness-e2e',
        identityHash: 'a'.repeat(64),
      },
    });
    candidateId = candidate.id;
  });

  afterAll(async () => {
    if (admin && organizationId) {
      await admin.currentReadinessDecision.deleteMany({ where: { organizationId } });
      await admin.gateEvaluation.deleteMany({ where: { organizationId } });
      await admin.readinessDecision.deleteMany({ where: { organizationId } });
      await admin.currentCandidatePolicyAssignment.deleteMany({ where: { organizationId } });
      await admin.candidatePolicyAssignment.deleteMany({ where: { organizationId } });
      await admin.readinessGate.deleteMany({ where: { organizationId } });
      await admin.releasePolicyVersion.deleteMany({ where: { organizationId } });
      await admin.releasePolicy.deleteMany({ where: { organizationId } });
      await admin.currentEvidenceObservation.deleteMany({ where: { organizationId } });
      await admin.evidenceObservation.deleteMany({ where: { organizationId } });
      await admin.candidateEvidenceRevision.deleteMany({ where: { organizationId } });
      await admin.evidenceProducer.deleteMany({ where: { organizationId } });
      await admin.auditLog.deleteMany({ where: { organizationId } });
      await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.environment.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.membership.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
      await admin.user.deleteMany({ where: { email: { in: emails } } });
    }
    await Promise.all([admin?.$disconnect(), application?.$disconnect(), app?.close()]);
  });

  it('creates an idempotent typed policy and enforces lead access', async () => {
    const request = { key: 'default-readiness', name: 'Default readiness', gates: firstGates() };
    const headers = authHeaders(organizationToken, 'readiness-policy-create');
    const response = await app.inject({
      method: 'POST',
      url: policyCollectionUrl(),
      headers,
      payload: request,
    });
    expect(response.statusCode, response.body).toBe(201);
    const created = readinessPolicyResponseSchema.parse(response.json()).policy;
    policyId = created.id;
    firstVersionId = created.versions[0]?.id ?? '';
    expect(created).toMatchObject({ key: request.key, name: request.name });
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]).toMatchObject({ version: 1, state: 'draft' });
    expect(created.versions[0]?.gates.map(({ key }) => key)).toEqual([
      'required-completion',
      'required-pass-rate',
      'required-failures',
    ]);

    const replay = await app.inject({
      method: 'POST',
      url: policyCollectionUrl(),
      headers,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json()).toEqual(response.json());

    const reusedKey = await app.inject({
      method: 'POST',
      url: policyCollectionUrl(),
      headers,
      payload: { ...request, name: 'Changed request' },
    });
    expect(reusedKey.statusCode, reusedKey.body).toBe(409);
    expect(reusedKey.json().error.code).toBe('idempotency_key_reused');

    const duplicatePolicy = await app.inject({
      method: 'POST',
      url: policyCollectionUrl(),
      headers: authHeaders(organizationToken, 'readiness-policy-duplicate'),
      payload: request,
    });
    expect(duplicatePolicy.statusCode, duplicatePolicy.body).toBe(409);
    expect(duplicatePolicy.json().error.code).toBe('release_policy_key_taken');

    const forbidden = await app.inject({
      method: 'POST',
      url: policyCollectionUrl(),
      headers: authHeaders(readOnlyToken, 'readiness-policy-reader'),
      payload: { ...request, key: 'reader-policy' },
    });
    expect(forbidden.statusCode, forbidden.body).toBe(403);

    const unpublishedAssignment = await app.inject({
      method: 'PUT',
      url: assignmentUrl(),
      headers: authHeaders(organizationToken, 'readiness-assignment-draft'),
      payload: { policyId },
    });
    expect(unpublishedAssignment.statusCode, unpublishedAssignment.body).toBe(409);
    expect(unpublishedAssignment.json().error.code).toBe('release_policy_not_published');
  });

  it('publishes immutable versions and replaces the active version explicitly', async () => {
    const published = await publish('readiness-publish-v1');
    expect(published.versions[0]).toMatchObject({
      id: firstVersionId,
      version: 1,
      state: 'published',
    });

    const replay = await publish('readiness-publish-v1');
    expect(replay).toEqual(published);

    const firstAssignment = await assignPolicy('readiness-assignment-v1');
    expect(firstAssignment).toMatchObject({
      candidateId,
      policy: { id: policyId },
      policyVersion: { id: firstVersionId, version: 1 },
    });
    await expect(assignPolicy('readiness-assignment-v1')).resolves.toEqual(firstAssignment);
    const forbiddenAssignment = await app.inject({
      method: 'PUT',
      url: assignmentUrl(),
      headers: authHeaders(readOnlyToken, 'readiness-assignment-reader'),
      payload: { policyId },
    });
    expect(forbiddenAssignment.statusCode, forbiddenAssignment.body).toBe(403);

    const gate = await admin.readinessGate.findFirstOrThrow({
      where: { organizationId, policyVersionId: firstVersionId },
    });
    await expect(
      admin.readinessGate.update({
        where: { organizationId_id: { organizationId, id: gate.id } },
        data: { expectedPercentage: '90' },
      }),
    ).rejects.toThrow(/immutable/);

    const versionResponse = await app.inject({
      method: 'POST',
      url: `${policyUrl()}/versions`,
      headers: authHeaders(organizationToken, 'readiness-version-v2'),
      payload: { gates: secondGates() },
    });
    expect(versionResponse.statusCode, versionResponse.body).toBe(201);
    const versioned = readinessPolicyResponseSchema.parse(versionResponse.json()).policy;
    expect(versioned.versions.map(({ version, state }) => [version, state])).toEqual([
      [2, 'draft'],
      [1, 'published'],
    ]);

    const duplicateDraft = await app.inject({
      method: 'POST',
      url: `${policyUrl()}/versions`,
      headers: authHeaders(organizationToken, 'readiness-version-v3'),
      payload: { gates: secondGates() },
    });
    expect(duplicateDraft.statusCode, duplicateDraft.body).toBe(409);
    expect(duplicateDraft.json().error.code).toBe('release_policy_draft_exists');

    const secondPublished = await publish('readiness-publish-v2');
    expect(secondPublished.versions.map(({ version, state }) => [version, state])).toEqual([
      [2, 'published'],
      [1, 'retired'],
    ]);
    expect(secondPublished.versions[0]?.publishedAt).not.toBeNull();
    expect(secondPublished.versions[1]?.retiredAt).not.toBeNull();

    const secondAssignment = await assignPolicy('readiness-assignment-v2');
    expect(secondAssignment.policyVersion).toMatchObject({
      id: secondPublished.versions[0]?.id,
      version: 2,
    });
    expect(secondAssignment.id).not.toBe(firstAssignment.id);
    await expect(
      admin.candidatePolicyAssignment.update({
        where: { organizationId_id: { organizationId, id: firstAssignment.id } },
        data: { assignedAt: new Date() },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('returns policy history to readers and isolates persistence by tenant context', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: policyUrl(),
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    const policy = readinessPolicyResponseSchema.parse(detail.json()).policy;
    expect(policy.id).toBe(policyId);
    expect(policy.versions).toHaveLength(2);

    const assignmentResponse = await app.inject({
      method: 'GET',
      url: assignmentUrl(),
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(assignmentResponse.statusCode, assignmentResponse.body).toBe(200);
    const assignment = candidatePolicyAssignmentResponseSchema.parse(
      assignmentResponse.json(),
    ).assignment;
    expect(assignment.policyVersion.version).toBe(2);

    await expect(application.releasePolicy.count()).resolves.toBe(0);
    await expect(
      runInTenant(application, organizationId, (transaction) =>
        transaction.releasePolicy.count({ where: { id: policyId } }),
      ),
    ).resolves.toBe(1);
  });

  it('appends deterministic decisions and exposes pending, stale and current state', async () => {
    const pendingResponse = await app.inject({
      method: 'GET',
      url: readinessUrl(),
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(pendingResponse.statusCode, pendingResponse.body).toBe(200);
    expect(candidateReadinessResponseSchema.parse(pendingResponse.json())).toMatchObject({
      candidateId,
      state: 'pending',
      currentEvidenceRevision: 0,
      decision: null,
    });

    const forbidden = await app.inject({
      method: 'POST',
      url: `${readinessUrl()}/evaluations`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(forbidden.statusCode, forbidden.body).toBe(403);

    const [blocked, concurrentReplay] = await Promise.all([
      evaluateCandidate(),
      evaluateCandidate(),
    ]);
    expect(blocked).toMatchObject({ state: 'current', currentEvidenceRevision: 0 });
    expect(blocked.decision).toMatchObject({
      evidenceRevision: 0,
      status: 'blocked',
      trigger: 'manual',
    });
    expect(blocked.decision?.gates).toHaveLength(3);
    expect(
      blocked.decision?.gates.every(
        ({ result, diagnostic }) => result === 'failed' && diagnostic === 'missing',
      ),
    ).toBe(true);

    expect(concurrentReplay.decision?.id).toBe(blocked.decision?.id);
    await addPassingEvidence();

    const staleResponse = await app.inject({
      method: 'GET',
      url: readinessUrl(),
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    const stale = candidateReadinessResponseSchema.parse(staleResponse.json());
    expect(stale).toMatchObject({
      state: 'stale',
      currentEvidenceRevision: 1,
      targetEvidenceRevision: 1,
    });
    expect(stale.decision?.id).toBe(blocked.decision?.id);

    const ready = await evaluateCandidate();
    expect(ready).toMatchObject({ state: 'current', currentEvidenceRevision: 1 });
    expect(ready.decision).toMatchObject({ evidenceRevision: 1, status: 'ready' });
    expect(ready.decision?.gates.every(({ result }) => result === 'passed')).toBe(true);

    const firstPageResponse = await app.inject({
      method: 'GET',
      url: `${readinessUrl()}/decisions?limit=1`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    const firstPage = readinessDecisionListResponseSchema.parse(firstPageResponse.json());
    expect(firstPage.items.map(({ id }) => id)).toEqual([ready.decision?.id]);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `${readinessUrl()}/decisions?limit=1&cursor=${firstPage.nextCursor}`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    const secondPage = readinessDecisionListResponseSchema.parse(secondPageResponse.json());
    expect(secondPage.items.map(({ id }) => id)).toEqual([blocked.decision?.id]);
    expect(secondPage.nextCursor).toBeNull();

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectSlug}/readiness-decisions/${ready.decision?.id}`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(detailResponse.statusCode, detailResponse.body).toBe(200);
    expect(readinessDecisionResponseSchema.parse(detailResponse.json()).decision).toEqual(
      ready.decision,
    );
    await expect(
      admin.readinessDecision.count({ where: { organizationId, candidateId } }),
    ).resolves.toBe(2);
    await expect(
      admin.gateEvaluation.count({ where: { organizationId, candidateId } }),
    ).resolves.toBe(6);
    await expect(application.readinessDecision.count()).resolves.toBe(0);
    await expect(application.gateEvaluation.count()).resolves.toBe(0);
    await expect(application.currentReadinessDecision.count()).resolves.toBe(0);
    await expect(
      runInTenant(application, organizationId, async (transaction) => ({
        decisions: await transaction.readinessDecision.count({ where: { candidateId } }),
        evaluations: await transaction.gateEvaluation.count({ where: { candidateId } }),
        current: await transaction.currentReadinessDecision.count({ where: { candidateId } }),
      })),
    ).resolves.toEqual({ decisions: 2, evaluations: 6, current: 1 });

    const decisionId = ready.decision?.id;
    const gateEvaluationId = ready.decision?.gates[0]?.id;
    if (!decisionId || !gateEvaluationId) throw new Error('Expected persisted readiness decision');
    await expect(
      admin.readinessDecision.update({
        where: { organizationId_id: { organizationId, id: decisionId } },
        data: { evidenceRevision: 2 },
      }),
    ).rejects.toThrow(/immutable/);
    await expect(
      admin.gateEvaluation.update({
        where: { organizationId_id: { organizationId, id: gateEvaluationId } },
        data: { explanationCode: 'mutated' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it('records policy lifecycle audit history', async () => {
    const actions = await admin.auditLog.findMany({
      where: {
        organizationId,
        targetType: { in: ['release_policy', 'release_policy_version', 'release_candidate'] },
      },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'release_policy.created',
        'release_policy.version_created',
        'release_policy.published',
        'release_policy.assigned',
        'readiness_decision.recorded',
      ]),
    );
    expect(actions.filter(({ action }) => action === 'release_policy.published')).toHaveLength(2);
  });

  function policyCollectionUrl(): string {
    return `/api/v1/projects/${projectSlug}/release-policies`;
  }

  function policyUrl(): string {
    return `${policyCollectionUrl()}/${policyId}`;
  }

  function assignmentUrl(): string {
    return `/api/v1/projects/${projectSlug}/candidates/${candidateId}/readiness-policy`;
  }

  function readinessUrl(): string {
    return `/api/v1/projects/${projectSlug}/candidates/${candidateId}/readiness`;
  }

  async function evaluateCandidate() {
    const response = await app.inject({
      method: 'POST',
      url: `${readinessUrl()}/evaluations`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(response.statusCode, response.body).toBe(201);
    return candidateReadinessResponseSchema.parse(response.json());
  }

  async function addPassingEvidence(): Promise<void> {
    const producer = await admin.evidenceProducer.create({
      data: {
        organizationId,
        producerType: 'readiness_e2e',
        producerKey: 'native-tests',
        schemaVersion: 1,
        trustLevel: 'VERIFIED',
      },
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    const dimensions = { testRunRole: 'required' };
    const dimensionsHash = 'b'.repeat(64);
    const completion = await admin.evidenceObservation.create({
      data: {
        organizationId,
        projectId,
        candidateId,
        metricKey: 'test.completion_rate',
        metricVersion: '1.0.0',
        producerId: producer.id,
        producerSchemaVersion: 1,
        valueType: 'PERCENTAGE',
        state: 'AVAILABLE',
        percentageValue: '100',
        dimensions,
        dimensionsHash,
        observedAt: now,
        expiresAt,
        trustLevel: 'VERIFIED',
        sourceType: 'readiness_e2e',
        sourceId: candidateId,
        sourceRevision: 'completion-1',
        idempotencyKey: 'completion-1',
      },
    });
    const passRate = await admin.evidenceObservation.create({
      data: {
        organizationId,
        projectId,
        candidateId,
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        producerId: producer.id,
        producerSchemaVersion: 1,
        valueType: 'PERCENTAGE',
        state: 'AVAILABLE',
        percentageValue: '99',
        dimensions,
        dimensionsHash,
        observedAt: now,
        expiresAt,
        trustLevel: 'VERIFIED',
        sourceType: 'readiness_e2e',
        sourceId: candidateId,
        sourceRevision: 'pass-rate-1',
        idempotencyKey: 'pass-rate-1',
      },
    });
    const failedCount = await admin.evidenceObservation.create({
      data: {
        organizationId,
        projectId,
        candidateId,
        metricKey: 'test.failed_count',
        metricVersion: '1.0.0',
        producerId: producer.id,
        producerSchemaVersion: 1,
        valueType: 'INTEGER',
        state: 'AVAILABLE',
        integerValue: 0,
        dimensions,
        dimensionsHash,
        observedAt: now,
        expiresAt,
        trustLevel: 'VERIFIED',
        sourceType: 'readiness_e2e',
        sourceId: candidateId,
        sourceRevision: 'failed-count-1',
        idempotencyKey: 'failed-count-1',
      },
    });
    const observations = [completion, passRate, failedCount];
    await admin.candidateEvidenceRevision.create({
      data: { organizationId, projectId, candidateId, revision: 1 },
    });
    await admin.currentEvidenceObservation.createMany({
      data: observations.map((observation) => ({
        organizationId,
        projectId,
        candidateId,
        producerId: producer.id,
        metricKey: observation.metricKey,
        dimensionsHash,
        observationId: observation.id,
        evidenceRevision: 1,
      })),
    });
  }

  async function assignPolicy(idempotencyKey: string) {
    const response = await app.inject({
      method: 'PUT',
      url: assignmentUrl(),
      headers: authHeaders(organizationToken, idempotencyKey),
      payload: { policyId },
    });
    expect(response.statusCode, response.body).toBe(200);
    return candidatePolicyAssignmentResponseSchema.parse(response.json()).assignment;
  }

  async function publish(idempotencyKey: string) {
    const response = await app.inject({
      method: 'POST',
      url: `${policyUrl()}/publish`,
      headers: authHeaders(organizationToken, idempotencyKey),
    });
    expect(response.statusCode, response.body).toBe(201);
    return readinessPolicyResponseSchema.parse(response.json()).policy;
  }
});

function firstGates() {
  return [
    percentageGate('required-completion', 'test.completion_rate', 'gte', '100'),
    percentageGate('required-pass-rate', 'test.pass_rate', 'gte', '95'),
    integerGate('required-failures', 'test.failed_count', 'eq', 0),
  ];
}

function secondGates() {
  return [
    percentageGate('required-completion', 'test.completion_rate', 'gte', '100'),
    percentageGate('required-pass-rate', 'test.pass_rate', 'gte', '98'),
    integerGate('required-failures', 'test.failed_count', 'eq', 0),
  ];
}

function percentageGate(key: string, metricKey: string, operator: string, value: string) {
  return {
    key,
    metricKey,
    metricVersion: '1.0.0',
    dimensions: { testRunRole: 'required' },
    operator,
    expected: { type: 'percentage', value },
    impact: 'blocking',
    missingEvidenceBehavior: 'block',
    staleEvidenceBehavior: 'warn',
    minimumTrust: 'verified',
  };
}

function integerGate(key: string, metricKey: string, operator: string, value: number) {
  return {
    key,
    metricKey,
    metricVersion: '1.0.0',
    dimensions: { testRunRole: 'required' },
    operator,
    expected: { type: 'integer', value },
    impact: 'blocking',
    missingEvidenceBehavior: 'block',
    staleEvidenceBehavior: 'warn',
    minimumTrust: 'verified',
  };
}

function authHeaders(token: string, idempotencyKey: string) {
  return { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey };
}

async function register(
  app: NestFastifyApplication,
  displayName: string,
  email: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { displayName, email, password: PASSWORD, termsAccepted: true },
  });
  return response.json().accessToken as string;
}

async function issueOrganizationToken(
  app: NestFastifyApplication,
  organizationSlug: string,
  sessionToken: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/organizations/${organizationSlug}/token`,
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  return response.json().accessToken as string;
}
