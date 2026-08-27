import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { QUALITY_EVIDENCE_INTEGRATION_EVENT } from '../../../quality-evidence/public-api';
import { ReadinessEvaluationRequestService } from '../../application/services/readiness-evaluation-request.service';
import { ReadinessEventConsumerService } from '../../application/services/readiness-event-consumer.service';
import type { ReadinessEvaluationJob } from '../../domain/models/readiness-evaluation-job';
import { ReadinessDecisionRepository } from '../../infrastructure/repositories/readiness-decision.repository';
import { ReadinessEvaluationRequestRepository } from '../../infrastructure/repositories/readiness-evaluation-request.repository';
import { ReadinessEventRepository } from '../../infrastructure/repositories/readiness-event.repository';

describe('readiness evaluation requests', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let requests: ReadinessEvaluationRequestService;
  let consumer: ReadinessEventConsumerService;
  let queue: RecordingReadinessQueue;
  let organizationId = '';
  let projectId = '';
  let candidateId = '';
  let assignmentId = '';
  let policyVersionId = '';
  let decisions: ReadinessDecisionRepository;

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) throw new Error('Database URLs are required');
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const tenantDatabase = new TenantDatabaseService(application as never);
    const requestRepository = new ReadinessEvaluationRequestRepository(tenantDatabase);
    decisions = new ReadinessDecisionRepository(tenantDatabase);
    queue = new RecordingReadinessQueue();
    requests = new ReadinessEvaluationRequestService(requestRepository, queue as never);
    consumer = new ReadinessEventConsumerService(
      new ReadinessEventRepository(tenantDatabase),
      requests,
    );

    const suffix = randomUUID().slice(0, 8);
    const organization = await admin.organization.create({
      data: { name: 'Readiness requests', slug: `readiness-requests-${suffix}` },
    });
    organizationId = organization.id;
    const project = await admin.project.create({
      data: {
        organizationId,
        key: `RR${suffix.slice(0, 6).toUpperCase()}`,
        slug: `readiness-requests-${suffix}`,
        name: 'Readiness requests',
      },
    });
    projectId = project.id;
    const release = await admin.release.create({
      data: { organizationId, projectId, key: 'RR-1', name: 'Readiness request release' },
    });
    const candidate = await admin.releaseCandidate.create({
      data: {
        organizationId,
        projectId,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'readiness-request-integration',
        identityHash: 'd'.repeat(64),
      },
    });
    candidateId = candidate.id;
    const policy = await admin.releasePolicy.create({
      data: {
        organizationId,
        projectId,
        key: 'default',
        name: 'Default',
      },
    });
    const version = await admin.releasePolicyVersion.create({
      data: {
        organizationId,
        projectId,
        policyId: policy.id,
        version: 1,
        state: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    policyVersionId = version.id;
    const assignment = await admin.candidatePolicyAssignment.create({
      data: {
        organizationId,
        projectId,
        candidateId,
        policyId: policy.id,
        policyVersionId: version.id,
      },
    });
    assignmentId = assignment.id;
    await admin.currentCandidatePolicyAssignment.create({
      data: { organizationId, projectId, candidateId, assignmentId },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await admin.integrationEventReceipt.deleteMany({ where: { organizationId } });
      await admin.integrationEvent.deleteMany({ where: { organizationId } });
      await admin.auditLog.deleteMany({ where: { organizationId } });
      await admin.currentReadinessDecision.deleteMany({ where: { organizationId } });
      await admin.currentCandidatePolicyAssignment.deleteMany({ where: { organizationId } });
      await admin.candidatePolicyAssignment.deleteMany({ where: { organizationId } });
      await admin.releasePolicyVersion.deleteMany({ where: { organizationId } });
      await admin.releasePolicy.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
    }
    await Promise.all([admin?.$disconnect(), application?.$disconnect()]);
  });

  it('acknowledges the event only after persisting and enqueueing a revision-keyed request', async () => {
    const event = await createEvidenceEvent(3);

    await expect(consumer.processBatch(organizationId, 100)).resolves.toEqual({
      processed: 1,
      requested: 1,
    });
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]).toEqual({
      organizationId,
      candidateId,
      assignmentId,
      evidenceRevision: 3,
      evaluatorVersion: '1.0.0',
      trigger: 'EVIDENCE_CHANGED',
    });
    await expect(
      admin.currentReadinessDecision.findUniqueOrThrow({
        where: { organizationId_candidateId: { organizationId, candidateId } },
      }),
    ).resolves.toMatchObject({
      assignmentId,
      targetEvidenceRevision: 3,
      targetEvaluatorVersion: '1.0.0',
      state: 'PENDING',
      failureCode: null,
    });
    await expect(
      admin.integrationEventReceipt.findUnique({
        where: {
          organizationId_consumerName_eventId: {
            organizationId,
            consumerName: 'release-readiness.evidence-revisions',
            eventId: event.id,
          },
        },
      }),
    ).resolves.not.toBeNull();
    await expect(consumer.processBatch(organizationId, 100)).resolves.toEqual({
      processed: 0,
      requested: 0,
    });
  });

  it('records terminal failure once and recovers only when the input advances', async () => {
    const failedJob = queue.jobs[0];
    if (!failedJob) throw new Error('Expected a queued readiness evaluation');

    await expect(requests.markRetriesExhausted(failedJob)).resolves.toBe(true);
    await expect(requests.markRetriesExhausted(failedJob)).resolves.toBe(false);
    await expect(
      requests.request({
        organizationId,
        candidateId,
        evidenceRevision: 3,
        trigger: 'RECONCILIATION',
      }),
    ).resolves.toEqual({ kind: 'already_failed' });

    await admin.currentReadinessDecision.update({
      where: { organizationId_candidateId: { organizationId, candidateId } },
      data: { targetEvaluatorVersion: '0.9.0' },
    });
    const evaluatorUpgrade = await requests.request({
      organizationId,
      candidateId,
      evidenceRevision: 3,
      trigger: 'RECONCILIATION',
    });
    expect(evaluatorUpgrade).toMatchObject({
      kind: 'requested',
      job: { evidenceRevision: 3, evaluatorVersion: '1.0.0' },
    });

    const advanced = await requests.request({
      organizationId,
      candidateId,
      evidenceRevision: 4,
      trigger: 'EVIDENCE_CHANGED',
    });
    expect(advanced.kind).toBe('requested');
    await expect(requests.markRetriesExhausted(failedJob)).resolves.toBe(false);
    await expect(
      admin.currentReadinessDecision.findUniqueOrThrow({
        where: { organizationId_candidateId: { organizationId, candidateId } },
      }),
    ).resolves.toMatchObject({
      targetEvidenceRevision: 4,
      targetEvaluatorVersion: '1.0.0',
      state: 'PENDING',
      failureCode: null,
    });
    await expect(
      admin.auditLog.count({
        where: { organizationId, action: 'readiness_evaluation.failed' },
      }),
    ).resolves.toBe(1);
    await expect(application.currentReadinessDecision.count()).resolves.toBe(0);
    await expect(application.integrationEventReceipt.count()).resolves.toBe(0);
  });

  it('does not let an older evaluation regress a newer requested input', async () => {
    await expect(
      decisions.record({
        organizationId,
        projectId,
        candidateId,
        assignmentId,
        policyVersionId,
        evidenceRevision: 3,
        evaluatorVersion: '1.0.0',
        evaluatedAt: new Date(),
        evaluatedById: null,
        trigger: 'EVIDENCE_CHANGED',
        evaluation: { evaluatorVersion: '1.0.0', status: 'READY', gates: [] },
        gates: [],
      }),
    ).resolves.toEqual({ kind: 'input_superseded' });
    await expect(
      admin.currentReadinessDecision.findUniqueOrThrow({
        where: { organizationId_candidateId: { organizationId, candidateId } },
      }),
    ).resolves.toMatchObject({
      targetEvidenceRevision: 4,
      targetEvaluatorVersion: '1.0.0',
      state: 'PENDING',
    });
    await expect(
      admin.readinessDecision.count({ where: { organizationId, candidateId } }),
    ).resolves.toBe(0);
  });

  function createEvidenceEvent(evidenceRevision: number) {
    return admin.integrationEvent.create({
      data: {
        organizationId,
        eventName: QUALITY_EVIDENCE_INTEGRATION_EVENT.candidateRevisionAdvanced,
        schemaVersion: 1,
        sourceType: 'candidate_evidence_revision',
        sourceId: candidateId,
        sourceRevision: String(evidenceRevision),
        occurredAt: new Date(),
        payload: { projectId, candidateId, evidenceRevision },
      },
    });
  }
});

class RecordingReadinessQueue {
  readonly jobs: ReadinessEvaluationJob[] = [];

  enqueue(job: ReadinessEvaluationJob): Promise<void> {
    this.jobs.push(job);
    return Promise.resolve();
  }
}
