import { randomUUID } from 'node:crypto';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

export type ReadinessWaiverE2eFixture = {
  app: NestFastifyApplication;
  admin: PrismaClient;
  application: PrismaClient;
  organizationId: string;
  ownerId: string;
  ownerToken: string;
  readerToken: string;
  projectSlug: string;
  projectId: string;
  candidateId: string;
  decisionId: string;
  failedEvaluationId: string;
  warningEvaluationId: string;
  emails: string[];
};

export async function createReadinessWaiverE2eFixture(): Promise<ReadinessWaiverE2eFixture> {
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  const applicationUrl = process.env.DATABASE_URL;
  if (!adminUrl || !applicationUrl) throw new Error('Database URLs are required for waiver E2E');
  const admin = createPrismaClient(adminUrl);
  const application = createPrismaClient(applicationUrl);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `waiver-owner-${suffix}@example.com`;
  const readerEmail = `waiver-reader-${suffix}@example.com`;
  const ownerSession = await register(app, 'Waiver Owner', ownerEmail);
  const readerSession = await register(app, 'Waiver Reader', readerEmail);
  const [owner, reader] = await Promise.all([
    admin.user.findUniqueOrThrow({ where: { email: ownerEmail } }),
    admin.user.findUniqueOrThrow({ where: { email: readerEmail } }),
  ]);
  const organization = await admin.organization.create({
    data: { name: 'Waiver Workspace', slug: `waiver-${suffix}` },
  });
  await admin.membership.createMany({
    data: [
      { organizationId: organization.id, userId: owner.id, role: 'OWNER' },
      { organizationId: organization.id, userId: reader.id, role: 'READ_ONLY' },
    ],
  });
  const ownerToken = await issueOrganizationToken(app, organization.slug, ownerSession);
  const readerToken = await issueOrganizationToken(app, organization.slug, readerSession);
  const readiness = await createReadinessRecords(admin, {
    suffix,
    organizationId: organization.id,
    ownerId: owner.id,
  });
  return {
    app,
    admin,
    application,
    organizationId: organization.id,
    ownerId: owner.id,
    ownerToken,
    readerToken,
    emails: [ownerEmail, readerEmail],
    ...readiness,
  };
}

export async function destroyReadinessWaiverE2eFixture(
  fixture: ReadinessWaiverE2eFixture | undefined,
): Promise<void> {
  if (!fixture) return;
  const { admin, application, app, organizationId, emails } = fixture;
  await admin.readinessWaiverRevocation.deleteMany({ where: { organizationId } });
  await admin.readinessWaiver.deleteMany({ where: { organizationId } });
  await admin.gateEvaluation.deleteMany({ where: { organizationId } });
  await admin.readinessDecision.deleteMany({ where: { organizationId } });
  await admin.candidatePolicyAssignment.deleteMany({ where: { organizationId } });
  await admin.readinessGate.deleteMany({ where: { organizationId } });
  await admin.releasePolicyVersion.deleteMany({ where: { organizationId } });
  await admin.releasePolicy.deleteMany({ where: { organizationId } });
  await admin.auditLog.deleteMany({ where: { organizationId } });
  await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
  await admin.releaseCandidate.deleteMany({ where: { organizationId } });
  await admin.release.deleteMany({ where: { organizationId } });
  await admin.environment.deleteMany({ where: { organizationId } });
  await admin.project.deleteMany({ where: { organizationId } });
  await admin.membership.deleteMany({ where: { organizationId } });
  await admin.organization.deleteMany({ where: { id: organizationId } });
  await admin.user.deleteMany({ where: { email: { in: emails } } });
  await Promise.all([admin.$disconnect(), application.$disconnect(), app.close()]);
}

async function createReadinessRecords(
  admin: PrismaClient,
  input: { suffix: string; organizationId: string; ownerId: string },
) {
  const projectSlug = `waiver-${input.suffix}`;
  const project = await admin.project.create({
    data: {
      organizationId: input.organizationId,
      key: `W${input.suffix.slice(0, 7).toUpperCase()}`,
      slug: projectSlug,
      name: 'Waiver project',
    },
  });
  const environment = await admin.environment.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      name: 'Production',
      slug: 'production',
    },
  });
  const release = await admin.release.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      environmentId: environment.id,
      key: '2026.08',
      name: 'August release',
    },
  });
  const candidate = await admin.releaseCandidate.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      releaseId: release.id,
      sequence: 1,
      sourceRevision: 'waiver-e2e',
      identityHash: 'c'.repeat(64),
    },
  });
  const policy = await admin.releasePolicy.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      key: 'waiver-policy',
      name: 'Waiver policy',
      createdById: input.ownerId,
    },
  });
  const version = await admin.releasePolicyVersion.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      policyId: policy.id,
      version: 1,
      state: 'PUBLISHED',
      createdById: input.ownerId,
      publishedById: input.ownerId,
      publishedAt: new Date(),
    },
  });
  const gates = await Promise.all([
    createGate(admin, input.organizationId, project.id, version.id, 0, 'BLOCKING'),
    createGate(admin, input.organizationId, project.id, version.id, 1, 'WARNING'),
  ]);
  const assignment = await admin.candidatePolicyAssignment.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      candidateId: candidate.id,
      policyId: policy.id,
      policyVersionId: version.id,
      assignedById: input.ownerId,
    },
  });
  const decision = await admin.readinessDecision.create({
    data: {
      organizationId: input.organizationId,
      projectId: project.id,
      candidateId: candidate.id,
      assignmentId: assignment.id,
      policyVersionId: version.id,
      evidenceRevision: 0,
      evaluatorVersion: '1.0.0',
      trigger: 'MANUAL',
      status: 'BLOCKED',
      evaluatedById: input.ownerId,
      evaluatedAt: new Date(),
    },
  });
  const evaluations = await Promise.all([
    createEvaluation(
      admin,
      input.organizationId,
      project.id,
      candidate.id,
      decision.id,
      version.id,
      gates[0]?.id ?? '',
      0,
      'FAILED',
      '80',
    ),
    createEvaluation(
      admin,
      input.organizationId,
      project.id,
      candidate.id,
      decision.id,
      version.id,
      gates[1]?.id ?? '',
      1,
      'WARNING',
      '90',
    ),
  ]);
  return {
    projectSlug,
    projectId: project.id,
    candidateId: candidate.id,
    decisionId: decision.id,
    failedEvaluationId: evaluations[0]?.id ?? '',
    warningEvaluationId: evaluations[1]?.id ?? '',
  };
}

function createGate(
  admin: PrismaClient,
  organizationId: string,
  projectId: string,
  policyVersionId: string,
  position: number,
  impact: 'BLOCKING' | 'WARNING',
) {
  return admin.readinessGate.create({
    data: {
      organizationId,
      projectId,
      policyVersionId,
      key: position === 0 ? 'blocking-pass-rate' : 'warning-completion',
      position,
      metricKey: position === 0 ? 'test.pass_rate' : 'test.completion_rate',
      metricVersion: '1.0.0',
      testRunRole: 'REQUIRED',
      operator: 'GTE',
      expectedValueType: 'PERCENTAGE',
      expectedPercentage: '95',
      impact,
      missingEvidenceBehavior: 'BLOCK',
      staleEvidenceBehavior: 'WARN',
      minimumTrust: 'VERIFIED',
    },
  });
}

function createEvaluation(
  admin: PrismaClient,
  organizationId: string,
  projectId: string,
  candidateId: string,
  decisionId: string,
  policyVersionId: string,
  gateId: string,
  position: number,
  result: 'FAILED' | 'WARNING',
  actualPercentage: string,
) {
  return admin.gateEvaluation.create({
    data: {
      organizationId,
      projectId,
      candidateId,
      decisionId,
      policyVersionId,
      gateId,
      position,
      result,
      diagnostic: 'NONE',
      metricKey: position === 0 ? 'test.pass_rate' : 'test.completion_rate',
      metricVersion: '1.0.0',
      dimensions: { testRunRole: 'required' },
      operator: 'GTE',
      expectedValueType: 'PERCENTAGE',
      expectedPercentage: '95',
      actualPercentage,
      explanationCode: 'comparison_failed',
      evaluatorVersion: '1.0.0',
      evaluatedAt: new Date(),
    },
  });
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
