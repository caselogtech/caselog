import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';
import { TestRunService } from '../../application/services/test-run.service';

const RESULT_COUNT = 50_000;
const CASE_COUNT = 500;
const TARGET_DURATION_MS = 30_000;

describe('JUnit ingestion load', () => {
  let admin: PrismaClient;
  let runs: TestRunService;
  let application: TestingModule;
  let organizationId = '';
  let userId = '';
  let membershipId = '';
  let runId = '';

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for load tests');
    admin = createPrismaClient(adminUrl);
    application = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await application.init();
    runs = application.get(TestRunService);

    const suffix = randomUUID().slice(0, 8);
    const user = await admin.user.create({
      data: {
        email: `junit-load-${suffix}@example.com`,
        displayName: 'JUnit Load Tester',
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;
    const organization = await admin.organization.create({
      data: { name: 'JUnit Load Workspace', slug: `junit-load-${suffix}` },
    });
    organizationId = organization.id;
    const membership = await admin.membership.create({
      data: { organizationId, userId, role: 'OWNER' },
    });
    membershipId = membership.id;
    const project = await admin.project.create({
      data: {
        organizationId,
        key: 'LOAD',
        slug: 'load-project',
        name: 'JUnit Load Project',
      },
    });
    const statuses = await Promise.all(
      [
        { key: 'untested', name: 'Untested', color: '#64748B', isFinal: false },
        { key: 'passed', name: 'Passed', color: '#16A34A', isFinal: true },
        { key: 'failed', name: 'Failed', color: '#DC2626', isFinal: true },
      ].map((status, position) =>
        admin.resultStatus.create({
          data: {
            organizationId,
            projectId: project.id,
            icon: 'circle',
            position,
            countsAsFailure: status.key === 'failed',
            ...status,
          },
        }),
      ),
    );
    const untested = statuses.find(({ key }) => key === 'untested');
    if (!untested) throw new Error('Expected an untested result status');
    const suite = await admin.suite.create({
      data: { organizationId, projectId: project.id, name: 'Load suite' },
    });
    const section = await admin.section.create({
      data: {
        organizationId,
        projectId: project.id,
        suiteId: suite.id,
        name: 'Load section',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    const cases = Array.from({ length: CASE_COUNT }, (_, index) => ({
      caseId: randomUUID(),
      versionId: randomUUID(),
      index,
    }));
    await admin.testCase.createMany({
      data: cases.map(({ caseId, index }) => ({
        organizationId,
        id: caseId,
        projectId: project.id,
        suiteId: suite.id,
        sectionId: section.id,
        caseNumber: BigInt(index + 1),
        automationId: `load.case-${index}`,
      })),
    });
    await admin.testCaseVersion.createMany({
      data: cases.map(({ caseId, versionId, index }) => ({
        organizationId,
        id: versionId,
        testCaseId: caseId,
        version: 1,
        title: `Automated load case ${index}`,
        template: 'STEPS',
        content: { steps: [{ action: 'Execute load fixture' }] },
        createdById: userId,
      })),
    });
    const run = await admin.testRun.create({
      data: {
        organizationId,
        projectId: project.id,
        name: '50k JUnit results',
        status: 'ACTIVE',
      },
    });
    runId = run.id;
    await admin.testRunItem.createMany({
      data: cases.map(({ versionId, index }) => ({
        organizationId,
        testRunId: runId,
        caseVersionId: versionId,
        statusId: untested.id,
        position: index,
      })),
    });
  }, 30_000);

  afterAll(async () => {
    if (admin && organizationId) {
      await admin.idempotencyRecord.deleteMany({ where: { organizationId } });
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
      await admin.membership.deleteMany({ where: { organizationId } });
      await admin.organization.deleteMany({ where: { id: organizationId } });
      await admin.user.deleteMany({ where: { id: userId } });
      await admin.$disconnect();
    }
    if (application) await application.close();
  }, 30_000);

  it('ingests 50k streamed results in under 30 seconds', async () => {
    const startedAt = performance.now();
    const response = await runs.ingestJUnitResults(
      {
        sub: userId,
        sid: randomUUID(),
        tokenType: 'organization',
        organizationId,
        membershipId,
        role: 'owner',
      },
      'load-project',
      runId,
      `load-${randomUUID()}`,
      'application/xml',
      junitDocument(RESULT_COUNT),
    );
    const durationMs = performance.now() - startedAt;

    expect(response).toMatchObject({
      total: RESULT_COUNT,
      recorded: RESULT_COUNT,
      unmatched: [],
      counts: { passed: RESULT_COUNT, failed: 0, error: 0, skipped: 0 },
    });
    await expect(admin.testResult.count({ where: { organizationId } })).resolves.toBe(RESULT_COUNT);
    expect(durationMs).toBeLessThan(TARGET_DURATION_MS);
  }, 45_000);
});

async function* junitDocument(resultCount: number): AsyncGenerator<string> {
  yield '<testsuite name="load">';
  const batchSize = 1_000;
  for (let offset = 0; offset < resultCount; offset += batchSize) {
    const tests: string[] = [];
    for (let index = offset; index < Math.min(offset + batchSize, resultCount); index += 1) {
      tests.push(
        `<testcase name="result-${index}" automation_id="load.case-${index % CASE_COUNT}" time="0.001"/>`,
      );
    }
    yield tests.join('');
  }
  yield '</testsuite>';
}
