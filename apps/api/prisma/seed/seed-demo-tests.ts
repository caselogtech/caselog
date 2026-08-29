import type { PrismaClient } from '../../src/generated/prisma/client';
import { CaseTemplate } from '../../src/generated/prisma/enums';
import { DEMO_CASES, DEMO_IDS, DEMO_RUNS, demoId } from './demo-fixtures';

const SECTION_NAMES: Record<keyof typeof DEMO_IDS.sections, string> = {
  authentication: 'Authentication',
  checkout: 'Checkout',
  orders: 'Orders',
};

const RESULT_COMMENTS: Record<string, string> = {
  passed: 'Verified against the expected result.',
  failed: 'The expired promotion request returned an unexpected server error.',
  blocked: 'Blocked while the payment sandbox credentials are being rotated.',
  skipped: 'Not required for this build.',
  retest: 'Fix is available and waiting for another verification pass.',
};

export async function seedDemoTests(
  prisma: PrismaClient,
  organizationId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  const suite = await prisma.suite.upsert({
    where: {
      organizationId_projectId_name: {
        organizationId,
        projectId,
        name: 'Main suite',
      },
    },
    update: { deletedAt: null },
    create: {
      organizationId,
      id: DEMO_IDS.suite,
      projectId,
      name: 'Main suite',
    },
  });

  const sections = new Map<string, string>();
  const versionByCaseNumber = new Map<bigint, string>();
  for (const [key, id] of Object.entries(DEMO_IDS.sections)) {
    const section = await prisma.section.upsert({
      where: {
        organizationId_suiteId_path: {
          organizationId,
          suiteId: suite.id,
          path: `/${id}`,
        },
      },
      update: { name: SECTION_NAMES[key as keyof typeof DEMO_IDS.sections], deletedAt: null },
      create: {
        organizationId,
        id,
        projectId,
        suiteId: suite.id,
        name: SECTION_NAMES[key as keyof typeof DEMO_IDS.sections],
        path: `/${id}`,
        depth: 0,
      },
    });
    sections.set(key, section.id);
  }

  for (const demoCase of DEMO_CASES) {
    const sectionId = sections.get(demoCase.section);
    if (!sectionId) throw new Error(`Missing demo section: ${demoCase.section}`);

    const testCase = await prisma.testCase.upsert({
      where: {
        organizationId_projectId_caseNumber: {
          organizationId,
          projectId,
          caseNumber: demoCase.caseNumber,
        },
      },
      update: { suiteId: suite.id, sectionId, deletedAt: null },
      create: {
        organizationId,
        id: demoCase.id,
        projectId,
        suiteId: suite.id,
        sectionId,
        caseNumber: demoCase.caseNumber,
      },
    });

    const version = await prisma.testCaseVersion.upsert({
      where: {
        organizationId_testCaseId_version: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
        },
      },
      update: {
        title: demoCase.title,
        content: {
          steps: [{ action: demoCase.action, expected: demoCase.expected }],
        },
      },
      create: {
        organizationId,
        id: demoCase.versionId,
        testCaseId: testCase.id,
        version: 1,
        title: demoCase.title,
        template: CaseTemplate.STEPS,
        content: {
          steps: [{ action: demoCase.action, expected: demoCase.expected }],
        },
        createdById: userId,
      },
    });

    await prisma.testCase.update({
      where: { organizationId_id: { organizationId, id: testCase.id } },
      data: { currentVersionId: version.id },
    });
    versionByCaseNumber.set(demoCase.caseNumber, version.id);
  }

  const statuses = await prisma.resultStatus.findMany({
    where: { organizationId, projectId, deletedAt: null },
    select: { id: true, key: true },
  });
  const statusByKey = new Map(statuses.map(({ id, key }) => [key, id]));

  for (const [runIndex, demoRun] of DEMO_RUNS.entries()) {
    if (demoRun.caseNumbers.length !== demoRun.caseStatuses.length) {
      throw new Error(`Demo run ${demoRun.name} has mismatched cases and statuses`);
    }

    const run = await prisma.testRun.upsert({
      where: { organizationId_id: { organizationId, id: demoRun.id } },
      update: {
        name: demoRun.name,
        status: demoRun.status,
        build: demoRun.build,
        closedAt: demoRun.closedAt,
        deletedAt: null,
      },
      create: {
        organizationId,
        id: demoRun.id,
        projectId,
        name: demoRun.name,
        status: demoRun.status,
        build: demoRun.build,
        createdAt: demoRun.createdAt,
        closedAt: demoRun.closedAt,
      },
    });

    for (const [position, caseNumber] of demoRun.caseNumbers.entries()) {
      const demoCase = DEMO_CASES.find((candidate) => candidate.caseNumber === BigInt(caseNumber));
      const caseVersionId = versionByCaseNumber.get(BigInt(caseNumber));
      const statusKey = demoRun.caseStatuses[position];
      const statusId = statusKey ? statusByKey.get(statusKey) : undefined;
      if (!demoCase || !caseVersionId || !statusKey || !statusId) {
        throw new Error(`Invalid demo run item at ${demoRun.name} position ${position}`);
      }

      const item = await prisma.testRunItem.upsert({
        where: {
          organizationId_testRunId_caseVersionId: {
            organizationId,
            testRunId: run.id,
            caseVersionId,
          },
        },
        update: { statusId, assigneeId: userId, position },
        create: {
          organizationId,
          id: demoId(1_000 + runIndex * 100 + caseNumber),
          testRunId: run.id,
          caseVersionId,
          statusId,
          assigneeId: userId,
          position,
        },
      });

      if (statusKey === 'untested') continue;

      const executedAt = new Date(demoRun.createdAt.getTime() + (position + 1) * 60_000);
      const resultId = demoId(2_000 + runIndex * 100 + caseNumber);
      const result = await prisma.testResult.upsert({
        where: {
          organizationId_id_executedAt: { organizationId, id: resultId, executedAt },
        },
        update: {
          statusId,
          comment: RESULT_COMMENTS[statusKey] ?? null,
          elapsedMs: 3_000 + position * 650,
          executedById: userId,
          build: demoRun.build,
        },
        create: {
          organizationId,
          id: resultId,
          testRunItemId: item.id,
          statusId,
          attempt: 1,
          comment: RESULT_COMMENTS[statusKey] ?? null,
          elapsedMs: 3_000 + position * 650,
          executedById: userId,
          executedAt,
          build: demoRun.build,
        },
      });

      await prisma.testStepResult.upsert({
        where: {
          organizationId_testResultId_resultExecutedAt_position: {
            organizationId,
            testResultId: result.id,
            resultExecutedAt: result.executedAt,
            position: 0,
          },
        },
        update: { statusId, comment: RESULT_COMMENTS[statusKey] ?? null },
        create: {
          organizationId,
          id: demoId(3_000 + runIndex * 100 + caseNumber),
          testResultId: result.id,
          resultExecutedAt: result.executedAt,
          statusId,
          position: 0,
          comment: RESULT_COMMENTS[statusKey] ?? null,
          elapsedMs: 3_000 + position * 650,
        },
      });
    }
  }
}
