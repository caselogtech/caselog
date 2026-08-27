import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../../generated/prisma/client';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import { WorkspacePurgeRepository } from '../../infrastructure/repositories/workspace-purge.repository';

describe('workspace purge repository', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let organizationId: string | undefined;

  beforeAll(() => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for workspace purge tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
  });

  afterAll(async () => {
    if (organizationId) {
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
      await admin.integrationEventReceipt.deleteMany({ where: { organizationId } });
      await admin.integrationEvent.deleteMany({ where: { organizationId } });
      await admin.releaseLifecycleEvent.deleteMany({ where: { organizationId } });
      await admin.candidateTestRun.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.environment.deleteMany({ where: { organizationId } });
      await admin.testRun.deleteMany({ where: { organizationId } });
      await admin.suite.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.attachmentBlob.deleteMany({ where: { organizationId } });
      await admin.auditLog.deleteMany({ where: { organizationId } });
      await admin.usageCounter.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
    }
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('allows only claimed and expired workspaces to be deleted with all tenant metadata', async () => {
    const suffix = randomUUID().slice(0, 8);
    const deletedAt = new Date('2026-07-01T00:00:00.000Z');
    const organization = await admin.organization.create({
      data: {
        name: 'Purge integration',
        slug: `purge-${suffix}`,
        deletedAt,
        projects: {
          create: {
            key: 'PURGE',
            slug: 'purge-project',
            name: 'Purge project',
            suites: { create: { name: 'Purge suite' } },
          },
        },
        auditLogs: {
          create: {
            actorId: randomUUID(),
            actorType: 'system',
            action: 'workspace.purge_test',
            targetType: 'workspace',
          },
        },
        attachmentBlobs: {
          create: {
            checksumSha256: 'a'.repeat(64),
            storageKey: `${suffix}/purge-object`,
            sizeBytes: 10,
          },
        },
      },
    });
    organizationId = organization.id;
    const project = await admin.project.findFirstOrThrow({
      where: { organizationId, slug: 'purge-project' },
    });
    const environment = await admin.environment.create({
      data: {
        organizationId,
        projectId: project.id,
        name: 'Purge environment',
        slug: 'purge-environment',
      },
    });
    const releasePolicy = await admin.releasePolicy.create({
      data: {
        organizationId,
        projectId: project.id,
        key: 'default-readiness',
        name: 'Default readiness policy',
      },
    });
    const releasePolicyVersion = await admin.releasePolicyVersion.create({
      data: {
        organizationId,
        projectId: project.id,
        policyId: releasePolicy.id,
        version: 1,
      },
    });
    const readinessGate = await admin.readinessGate.create({
      data: {
        organizationId,
        projectId: project.id,
        policyVersionId: releasePolicyVersion.id,
        key: 'required-pass-rate',
        position: 0,
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        testRunRole: 'REQUIRED',
        operator: 'GTE',
        expectedValueType: 'PERCENTAGE',
        expectedPercentage: '95',
        impact: 'BLOCKING',
        missingEvidenceBehavior: 'BLOCK',
        staleEvidenceBehavior: 'WARN',
        minimumTrust: 'VERIFIED',
      },
    });
    const release = await admin.release.create({
      data: {
        organizationId,
        projectId: project.id,
        environmentId: environment.id,
        key: 'PURGE-1',
        name: 'Purge release',
      },
    });
    await admin.releaseLifecycleEvent.create({
      data: {
        organizationId,
        projectId: project.id,
        releaseId: release.id,
        toState: 'DRAFT',
      },
    });
    const candidate = await admin.releaseCandidate.create({
      data: {
        organizationId,
        projectId: project.id,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'purge-revision',
        identityHash: 'b'.repeat(64),
      },
    });
    await admin.releasePolicyVersion.update({
      where: {
        organizationId_id: { organizationId, id: releasePolicyVersion.id },
      },
      data: { state: 'PUBLISHED', publishedAt: new Date() },
    });
    const policyAssignment = await admin.candidatePolicyAssignment.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        policyId: releasePolicy.id,
        policyVersionId: releasePolicyVersion.id,
      },
    });
    await admin.currentCandidatePolicyAssignment.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        assignmentId: policyAssignment.id,
      },
    });
    const run = await admin.testRun.create({
      data: { organizationId, projectId: project.id, name: 'Purge run' },
    });
    await admin.candidateTestRun.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        testRunId: run.id,
      },
    });
    const integrationEvent = await admin.integrationEvent.create({
      data: {
        organizationId,
        eventName: 'workspace.purge_tested',
        schemaVersion: 1,
        sourceType: 'workspace',
        sourceId: organizationId,
        sourceRevision: 'purge-test',
        payload: { organizationId },
        occurredAt: new Date(),
      },
    });
    await admin.integrationEventReceipt.create({
      data: {
        organizationId,
        consumerName: 'workspace-purge-test',
        eventId: integrationEvent.id,
      },
    });
    const evidenceProducer = await admin.evidenceProducer.create({
      data: {
        organizationId,
        producerType: 'native_test_runs',
        producerKey: 'workspace-purge-test',
        schemaVersion: 1,
        trustLevel: 'VERIFIED',
      },
    });
    const evidenceObservation = await admin.evidenceObservation.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        producerId: evidenceProducer.id,
        producerSchemaVersion: 1,
        valueType: 'PERCENTAGE',
        state: 'AVAILABLE',
        percentageValue: '100',
        dimensions: { testRunRole: 'required' },
        dimensionsHash: 'd'.repeat(64),
        observedAt: new Date(),
        trustLevel: 'VERIFIED',
        sourceType: 'release_candidate_test_runs',
        sourceId: candidate.id,
        sourceRevision: 'purge-test',
        idempotencyKey: 'purge-test',
        payload: {
          runCount: 1,
          totalItems: 1,
          finalItems: 1,
          executedFinalItems: 1,
          passedItems: 1,
          failedItems: 0,
          skippedItems: 0,
          incompleteRunIds: [],
          runRevisions: [],
          runRevisionsTruncated: false,
        },
      },
    });
    await admin.candidateEvidenceRevision.create({
      data: { organizationId, projectId: project.id, candidateId: candidate.id, revision: 1 },
    });
    await admin.currentEvidenceObservation.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        producerId: evidenceProducer.id,
        metricKey: 'test.pass_rate',
        dimensionsHash: 'd'.repeat(64),
        observationId: evidenceObservation.id,
        evidenceRevision: 1,
      },
    });
    const readinessDecision = await admin.readinessDecision.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        assignmentId: policyAssignment.id,
        policyVersionId: releasePolicyVersion.id,
        evidenceRevision: 1,
        evaluatorVersion: '1.0.0',
        trigger: 'MANUAL',
        status: 'READY',
        evaluatedAt: new Date(),
      },
    });
    await admin.gateEvaluation.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        decisionId: readinessDecision.id,
        policyVersionId: releasePolicyVersion.id,
        gateId: readinessGate.id,
        position: 0,
        result: 'PASSED',
        diagnostic: 'NONE',
        metricKey: 'test.pass_rate',
        metricVersion: '1.0.0',
        dimensions: { testRunRole: 'required' },
        operator: 'GTE',
        expectedValueType: 'PERCENTAGE',
        expectedPercentage: '95',
        actualPercentage: '100',
        selectedObservationId: evidenceObservation.id,
        explanationCode: 'comparison_passed',
        evaluatorVersion: '1.0.0',
        evaluatedAt: new Date(),
      },
    });
    await admin.currentReadinessDecision.create({
      data: {
        organizationId,
        projectId: project.id,
        candidateId: candidate.id,
        assignmentId: policyAssignment.id,
        decisionId: readinessDecision.id,
        targetEvidenceRevision: 1,
        targetEvaluatorVersion: '1.0.0',
        state: 'CURRENT',
      },
    });
    const repository = new WorkspacePurgeRepository(application as never);

    await expect(
      application.organization.delete({ where: { id: organizationId } }),
    ).rejects.toThrow();
    await expect(
      application.organization.update({
        where: { id: organizationId },
        data: { purgeStartedAt: new Date() },
      }),
    ).rejects.toThrow();

    const recent = await admin.organization.create({
      data: {
        name: 'Still recoverable',
        slug: `recoverable-${suffix}`,
        deletedAt: new Date(),
      },
    });
    await expect(repository.claim(recent.id)).resolves.toBe(false);
    await admin.organization.delete({ where: { id: recent.id } });

    await expect(repository.claim(organizationId)).resolves.toBe(true);
    await expect(repository.purge(organizationId)).resolves.toBe(true);

    await expect(admin.organization.count({ where: { id: organizationId } })).resolves.toBe(0);
    await expect(admin.project.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.suite.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.auditLog.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.attachmentBlob.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.usageCounter.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.environment.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releasePolicy.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releasePolicyVersion.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.readinessGate.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(
      admin.candidatePolicyAssignment.count({ where: { organizationId } }),
    ).resolves.toBe(0);
    await expect(
      admin.currentCandidatePolicyAssignment.count({ where: { organizationId } }),
    ).resolves.toBe(0);
    await expect(admin.readinessDecision.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.gateEvaluation.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.currentReadinessDecision.count({ where: { organizationId } })).resolves.toBe(
      0,
    );
    await expect(admin.release.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releaseCandidate.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.candidateTestRun.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.releaseLifecycleEvent.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.integrationEvent.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.integrationEventReceipt.count({ where: { organizationId } })).resolves.toBe(
      0,
    );
    await expect(admin.evidenceProducer.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(admin.evidenceObservation.count({ where: { organizationId } })).resolves.toBe(0);
    await expect(
      admin.candidateEvidenceRevision.count({ where: { organizationId } }),
    ).resolves.toBe(0);
    await expect(
      admin.currentEvidenceObservation.count({ where: { organizationId } }),
    ).resolves.toBe(0);
    organizationId = undefined;
  });
});
