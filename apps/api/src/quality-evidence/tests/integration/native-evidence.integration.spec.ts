import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { RUN_PROGRESS_PROJECTION } from '../../../reporting/public-api';
import { ReleaseCandidateReferenceService } from '../../../releases/application/services/release-candidate-reference.service';
import { ReleaseCandidateReferenceRepository } from '../../../releases/infrastructure/repositories/release-candidate-reference.repository';
import { RELEASE_INTEGRATION_EVENT } from '../../../releases/public-api';
import { TestRunEvidenceSourceService } from '../../../test-runs/application/services/test-run-evidence-source.service';
import { TestRunEvidenceSourceRepository } from '../../../test-runs/infrastructure/repositories/test-run-evidence-source.repository';
import { TEST_RUN_INTEGRATION_EVENT } from '../../../test-runs/public-api';
import { NativeEvidenceEventConsumerService } from '../../application/services/native-evidence-event-consumer.service';
import { NativeEvidenceMaterializerService } from '../../application/services/native-evidence-materializer.service';
import { EvidenceEventRepository } from '../../infrastructure/repositories/evidence-event.repository';
import { EvidenceObservationRepository } from '../../infrastructure/repositories/evidence-observation.repository';
import { EvidenceQueryRepository } from '../../infrastructure/repositories/evidence-query.repository';

describe('native candidate evidence', () => {
  let admin: PrismaClient;
  let application: PrismaClient;
  let consumer: NativeEvidenceEventConsumerService;
  let queries: EvidenceQueryRepository;
  let organizationId = '';
  let projectId = '';
  let projectSlug = '';
  let candidateId = '';
  let testRunId = '';
  let failedItemId = '';
  let passedStatusId = '';
  let failedStatusId = '';

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    const applicationUrl = process.env.DATABASE_URL;
    if (!adminUrl || !applicationUrl) {
      throw new Error('Database URLs are required for native evidence tests');
    }
    admin = createPrismaClient(adminUrl);
    application = createPrismaClient(applicationUrl);
    const tenantDatabase = new TenantDatabaseService(application as never);
    queries = new EvidenceQueryRepository(tenantDatabase);
    const candidateReferences = new ReleaseCandidateReferenceService(
      new ReleaseCandidateReferenceRepository(tenantDatabase),
    );
    const testRunSources = new TestRunEvidenceSourceService(
      new TestRunEvidenceSourceRepository(tenantDatabase),
    );
    const observations = new EvidenceObservationRepository(tenantDatabase);
    consumer = new NativeEvidenceEventConsumerService(
      new EvidenceEventRepository(tenantDatabase),
      candidateReferences,
      new NativeEvidenceMaterializerService(candidateReferences, testRunSources, observations),
    );

    const suffix = randomUUID().slice(0, 8);
    const organization = await admin.organization.create({
      data: { name: 'Native evidence', slug: `native-evidence-${suffix}` },
    });
    organizationId = organization.id;
    const project = await admin.project.create({
      data: {
        organizationId,
        key: `NE${suffix.slice(0, 6).toUpperCase()}`,
        slug: `native-evidence-${suffix}`,
        name: 'Native evidence',
      },
    });
    projectId = project.id;
    projectSlug = project.slug;
    const suite = await admin.suite.create({
      data: { organizationId, projectId, name: 'Regression' },
    });
    const section = await admin.section.create({
      data: {
        organizationId,
        projectId,
        suiteId: suite.id,
        name: 'Core',
        path: 'core',
        depth: 0,
      },
    });
    const statuses = await Promise.all([
      createStatus('passed', true, false),
      createStatus('failed', true, true),
      createStatus('skipped', true, false),
    ]);
    passedStatusId = statuses[0].id;
    failedStatusId = statuses[1].id;
    const versions: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const testCase = await admin.testCase.create({
        data: {
          organizationId,
          projectId,
          suiteId: suite.id,
          sectionId: section.id,
          caseNumber: BigInt(index + 1),
        },
      });
      const version = await admin.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
          title: `Case ${index + 1}`,
          content: { steps: [] },
        },
      });
      await admin.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: { currentVersionId: version.id },
      });
      versions.push(version.id);
    }
    const run = await admin.testRun.create({
      data: { organizationId, projectId, name: 'Required regression', status: 'COMPLETED' },
    });
    testRunId = run.id;
    const items = await Promise.all(
      versions.map((caseVersionId, index) =>
        admin.testRunItem.create({
          data: {
            organizationId,
            testRunId,
            caseVersionId,
            statusId: itemAt(statuses, index, 'status').id,
            position: index,
          },
        }),
      ),
    );
    failedItemId = itemAt(items, 1, 'run item').id;
    await admin.testResult.createMany({
      data: [
        {
          organizationId,
          testRunItemId: failedItemId,
          statusId: passedStatusId,
          attempt: 1,
          executedAt: new Date('2026-08-26T10:00:00.000Z'),
        },
        {
          organizationId,
          testRunItemId: failedItemId,
          statusId: failedStatusId,
          attempt: 2,
          executedAt: new Date('2026-08-26T10:01:00.000Z'),
        },
      ],
    });
    const release = await admin.release.create({
      data: { organizationId, projectId, key: 'NE-1', name: 'Native evidence release' },
    });
    const candidate = await admin.releaseCandidate.create({
      data: {
        organizationId,
        projectId,
        releaseId: release.id,
        sequence: 1,
        sourceRevision: 'native-evidence-revision',
        identityHash: 'c'.repeat(64),
      },
    });
    candidateId = candidate.id;
    await admin.candidateTestRun.create({
      data: { organizationId, projectId, candidateId, testRunId, role: 'REQUIRED' },
    });
    await createEvent(
      RELEASE_INTEGRATION_EVENT.candidateTestRunLinked,
      'candidate_test_run',
      `${candidateId}:${testRunId}`,
      { projectId, candidateId, testRunId, role: 'required' },
    );
  });

  afterAll(async () => {
    if (organizationId) {
      await admin.currentEvidenceObservation.deleteMany({ where: { organizationId } });
      await admin.evidenceObservation.deleteMany({ where: { organizationId } });
      await admin.candidateEvidenceRevision.deleteMany({ where: { organizationId } });
      await admin.evidenceProducer.deleteMany({ where: { organizationId } });
      await admin.integrationEventReceipt.deleteMany({ where: { organizationId } });
      await admin.integrationEvent.deleteMany({ where: { organizationId } });
      await admin.candidateTestRun.deleteMany({ where: { organizationId } });
      await admin.releaseCandidate.deleteMany({ where: { organizationId } });
      await admin.release.deleteMany({ where: { organizationId } });
      await admin.projectionRevision.deleteMany({ where: { organizationId } });
      await admin.testResult.deleteMany({ where: { organizationId } });
      await admin.testRunItem.deleteMany({ where: { organizationId } });
      await admin.testRun.deleteMany({ where: { organizationId } });
      await admin.testCase.updateMany({
        where: { organizationId },
        data: { currentVersionId: null },
      });
      await admin.testCaseVersion.deleteMany({ where: { organizationId } });
      await admin.testCase.deleteMany({ where: { organizationId } });
      await admin.section.deleteMany({ where: { organizationId } });
      await admin.suite.deleteMany({ where: { organizationId } });
      await admin.resultStatus.deleteMany({ where: { organizationId } });
      await admin.project.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
    }
    await Promise.all([admin.$disconnect(), application.$disconnect()]);
  });

  it('materializes six verified role-scoped observations from a linked run', async () => {
    await expect(consumer.processBatch(organizationId)).resolves.toEqual({
      processed: 1,
      observationsCreated: 6,
    });
    const current = await admin.currentEvidenceObservation.findMany({
      where: { organizationId, candidateId },
      include: { observation: true },
    });
    expect(current).toHaveLength(6);
    const requiredPassRate = current.find(
      ({ observation }) =>
        observation.metricKey === 'test.pass_rate' &&
        (observation.dimensions as { testRunRole: string }).testRunRole === 'required',
    );
    expect(requiredPassRate?.observation).toMatchObject({
      state: 'AVAILABLE',
      trustLevel: 'VERIFIED',
    });
    expect(requiredPassRate?.observation.percentageValue?.toString()).toBe('50');
    const informational = current.filter(
      ({ observation }) =>
        (observation.dimensions as { testRunRole: string }).testRunRole === 'informational',
    );
    expect(informational.every(({ observation }) => observation.state === 'INCOMPLETE')).toBe(true);
    await expect(
      admin.candidateEvidenceRevision.findUniqueOrThrow({
        where: { organizationId_candidateId: { organizationId, candidateId } },
      }),
    ).resolves.toMatchObject({ revision: 1 });
    const response = await queries.list(organizationId, projectSlug, {
      candidateId,
      currentOnly: true,
      limit: 25,
    });
    expect(response.kind).toBe('found');
    if (response.kind === 'found') {
      expect(response.value).toMatchObject({ candidateId, candidateRevision: 1 });
      expect(response.value.items).toHaveLength(6);
      expect(response.value.items.every(({ isCurrent }) => isCurrent)).toBe(true);
    }
  });

  it('appends corrections and advances the candidate revision after a source change', async () => {
    await admin.testRunItem.update({
      where: { organizationId_id: { organizationId, id: failedItemId } },
      data: { statusId: passedStatusId },
    });
    await admin.testResult.create({
      data: {
        organizationId,
        testRunItemId: failedItemId,
        statusId: passedStatusId,
        attempt: 3,
        executedAt: new Date('2026-08-26T10:02:00.000Z'),
      },
    });
    await admin.projectionRevision.upsert({
      where: {
        organizationId_projection_sourceId: {
          organizationId,
          projection: RUN_PROGRESS_PROJECTION,
          sourceId: testRunId,
        },
      },
      create: {
        organizationId,
        projection: RUN_PROGRESS_PROJECTION,
        sourceId: testRunId,
        revision: 1,
      },
      update: { revision: { increment: 1 } },
    });
    await createEvent(TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged, 'test_run', testRunId, {
      projectId,
      testRunId,
      revision: 1,
      reason: 'results_changed',
    });

    await expect(consumer.processBatch(organizationId)).resolves.toEqual({
      processed: 1,
      observationsCreated: 3,
    });
    const passRates = await admin.evidenceObservation.findMany({
      where: { organizationId, candidateId, metricKey: 'test.pass_rate' },
      orderBy: { createdAt: 'asc' },
    });
    expect(passRates).toHaveLength(3);
    const currentPassRates = await admin.currentEvidenceObservation.findMany({
      where: { organizationId, candidateId, metricKey: 'test.pass_rate' },
      include: { observation: true },
    });
    const currentRequired = currentPassRates.find(
      ({ observation }) =>
        (observation.dimensions as { testRunRole: string }).testRunRole === 'required',
    );
    expect(currentRequired?.evidenceRevision).toBe(2);
    const corrected = passRates.find(
      (observation) => observation.percentageValue?.toString() === '100',
    );
    expect(corrected?.supersedesObservationId).not.toBeNull();
    const history = await queries.list(organizationId, projectSlug, {
      candidateId,
      currentOnly: false,
      limit: 100,
    });
    expect(history.kind === 'found' ? history.value.items : []).toHaveLength(9);
  });

  it('deduplicates unchanged snapshots and protects evidence with RLS and immutability', async () => {
    await createEvent(TEST_RUN_INTEGRATION_EVENT.evidenceSourceChanged, 'test_run', testRunId, {
      projectId,
      testRunId,
      revision: 999,
      reason: 'results_changed',
    });
    await expect(consumer.processBatch(organizationId)).resolves.toEqual({
      processed: 1,
      observationsCreated: 0,
    });
    await expect(application.evidenceObservation.findMany()).resolves.toEqual([]);
    const observation = await admin.evidenceObservation.findFirstOrThrow({
      where: { organizationId },
    });
    await expect(
      admin.evidenceObservation.update({
        where: { organizationId_id: { organizationId, id: observation.id } },
        data: { state: 'INCOMPLETE' },
      }),
    ).rejects.toThrow(/immutable/);
  });

  function createStatus(key: string, isFinal: boolean, countsAsFailure: boolean) {
    return admin.resultStatus.create({
      data: {
        organizationId,
        projectId,
        key,
        name: key,
        color: '#000000',
        icon: 'circle',
        isFinal,
        countsAsFailure,
      },
    });
  }

  function createEvent(
    eventName: string,
    sourceType: string,
    sourceId: string,
    payload: Record<string, string | number>,
  ) {
    return admin.integrationEvent.create({
      data: {
        organizationId,
        eventName,
        schemaVersion: 1,
        sourceType,
        sourceId,
        sourceRevision: randomUUID(),
        payload,
        occurredAt: new Date(),
      },
    });
  }
});

function itemAt<T>(items: T[], index: number, label: string): T {
  const item = items.at(index);
  if (!item) throw new Error(`Expected ${label} at index ${index}`);
  return item;
}
