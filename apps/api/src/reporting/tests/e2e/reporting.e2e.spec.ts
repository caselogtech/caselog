import { randomUUID } from 'node:crypto';
import {
  caseExecutionHistoryResponseSchema,
  runProgressResponseSchema,
  sessionResponseSchema,
} from '@caselog/schemas';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../app.module';
import { configureApplication } from '../../../configure-application';
import { createPrismaClient } from '../../../core/database/infrastructure/prisma/prisma-client';
import type { PrismaClient } from '../../../generated/prisma/client';

const PASSWORD = 'correct horse battery staple';

describe('reporting', () => {
  let app: NestFastifyApplication;
  let admin: PrismaClient;
  let email = '';
  let organizationId = '';
  let foreignOrganizationId = '';
  let organizationToken = '';
  let projectId = '';
  let runId = '';
  let foreignRunId = '';
  let caseId = '';
  let foreignCaseId = '';

  beforeAll(async () => {
    const adminUrl = process.env.MIGRATION_DATABASE_URL;
    if (!adminUrl) throw new Error('MIGRATION_DATABASE_URL is required for reporting tests');

    admin = createPrismaClient(adminUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApplication(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const suffix = randomUUID().slice(0, 8);
    email = `reporting-${suffix}@example.com`;
    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        displayName: 'Reporting Owner',
        email,
        password: PASSWORD,
        termsAccepted: true,
      },
    });
    const session = sessionResponseSchema.parse(registration.json());
    const user = await admin.user.findUniqueOrThrow({ where: { email } });

    const organization = await admin.organization.create({
      data: { name: 'Reporting Workspace', slug: `reporting-${suffix}` },
    });
    organizationId = organization.id;
    await admin.membership.create({
      data: { organizationId, userId: user.id, role: 'OWNER' },
    });
    const project = await admin.project.create({
      data: {
        organizationId,
        key: 'REPORT',
        slug: 'reporting',
        name: 'Reporting Project',
      },
    });
    projectId = project.id;
    const statuses = await Promise.all(
      [
        { key: 'untested', name: 'Untested', color: '#64748B', isFinal: false },
        { key: 'passed', name: 'Passed', color: '#16A34A', isFinal: true },
        { key: 'failed', name: 'Failed', color: '#DC2626', isFinal: true },
      ].map((status, position) =>
        admin.resultStatus.create({
          data: {
            organizationId,
            projectId,
            icon: 'circle',
            position,
            countsAsFailure: status.key === 'failed',
            ...status,
          },
        }),
      ),
    );
    const [authenticationSuite, checkoutSuite] = await Promise.all([
      admin.suite.create({ data: { organizationId, projectId, name: 'Authentication' } }),
      admin.suite.create({ data: { organizationId, projectId, name: 'Checkout' } }),
    ]);

    const createVersion = async (suiteId: string, caseNumber: bigint, title: string) => {
      const section = await admin.section.create({
        data: {
          organizationId,
          projectId,
          suiteId,
          name: `${title} section`,
          path: `/${randomUUID()}`,
          depth: 0,
        },
      });
      const testCase = await admin.testCase.create({
        data: { organizationId, projectId, suiteId, sectionId: section.id, caseNumber },
      });
      const version = await admin.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
          title,
          template: 'STEPS',
          content: { steps: [{ action: title }] },
          createdById: user.id,
        },
      });
      await admin.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: { currentVersionId: version.id },
      });
      return { testCase, version };
    };

    const cases = await Promise.all([
      createVersion(authenticationSuite.id, 1n, 'Sign in'),
      createVersion(authenticationSuite.id, 2n, 'Reset password'),
      createVersion(checkoutSuite.id, 3n, 'Place order'),
    ]);
    caseId = cases[0]?.testCase.id ?? '';
    const run = await admin.testRun.create({
      data: { organizationId, projectId, name: 'Release regression', status: 'ACTIVE' },
    });
    runId = run.id;
    const statusByKey = new Map(statuses.map((status) => [status.key, status.id]));
    const runItems = await Promise.all(
      cases.map(({ version }, index) =>
        admin.testRunItem.create({
          data: {
            organizationId,
            testRunId: run.id,
            caseVersionId: version.id,
            statusId: statusByKey.get(
              index === 0 ? 'passed' : index === 1 ? 'failed' : 'untested',
            ) as string,
            assigneeId: index === 0 ? user.id : null,
            position: index,
          },
        }),
      ),
    );
    const firstRunItem = runItems[0];
    const failedStatusId = statusByKey.get('failed');
    const passedStatusId = statusByKey.get('passed');
    if (!firstRunItem || !failedStatusId || !passedStatusId) {
      throw new Error('Expected reporting result fixtures');
    }
    const executedAt = new Date();
    await Promise.all([
      admin.testResult.create({
        data: {
          organizationId,
          testRunItemId: firstRunItem.id,
          statusId: failedStatusId,
          attempt: 1,
          comment: 'Authentication service was unavailable',
          executedById: user.id,
          executedAt: new Date(executedAt.getTime() - 60_000),
          build: 'rc-1',
        },
      }),
      admin.testResult.create({
        data: {
          organizationId,
          testRunItemId: firstRunItem.id,
          statusId: passedStatusId,
          attempt: 2,
          comment: 'Passed after service recovery',
          executedById: user.id,
          executedAt,
          build: 'rc-2',
        },
      }),
    ]);

    const foreignOrganization = await admin.organization.create({
      data: { name: 'Foreign Reporting Workspace', slug: `foreign-reporting-${suffix}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const foreignProject = await admin.project.create({
      data: {
        organizationId: foreignOrganizationId,
        key: 'FOREIGN',
        slug: 'reporting',
        name: 'Foreign Reporting Project',
      },
    });
    const foreignRun = await admin.testRun.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        name: 'Foreign run',
      },
    });
    foreignRunId = foreignRun.id;
    const foreignSuite = await admin.suite.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        name: 'Foreign',
      },
    });
    const foreignSection = await admin.section.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        suiteId: foreignSuite.id,
        name: 'Foreign section',
        path: `/${randomUUID()}`,
        depth: 0,
      },
    });
    const foreignCase = await admin.testCase.create({
      data: {
        organizationId: foreignOrganizationId,
        projectId: foreignProject.id,
        suiteId: foreignSuite.id,
        sectionId: foreignSection.id,
        caseNumber: 1n,
      },
    });
    foreignCaseId = foreignCase.id;

    const organizationSession = await app.inject({
      method: 'POST',
      url: `/api/v1/auth/organizations/${organization.slug}/token`,
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(organizationSession.statusCode, organizationSession.body).toBe(200);
    organizationToken = organizationSession.json().accessToken as string;
  });

  afterAll(async () => {
    if (admin) {
      const organizationIds = [organizationId, foreignOrganizationId].filter(Boolean);
      await admin.testResult.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testRunItem.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testRun.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.testCase.updateMany({
        where: { organizationId: { in: organizationIds } },
        data: { currentVersionId: null },
      });
      await admin.testCaseVersion.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await admin.testCase.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.section.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.suite.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.resultStatus.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.project.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.membership.deleteMany({ where: { organizationId: { in: organizationIds } } });
      await admin.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await admin.user.deleteMany({ where: { email } });
      await admin.$disconnect();
    }
    if (app) await app.close();
  });

  it('returns aggregated run progress', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/reporting/reports/runs/${runId}/progress`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });

    expect(response.statusCode, response.body).toBe(200);
    const progress = runProgressResponseSchema.parse(response.json());
    expect(progress).toMatchObject({
      progressPercent: 66.7,
      passRate: 50,
      successfulCount: 1,
      incompleteCount: 1,
      run: { itemCount: 3, completedCount: 2, failedCount: 1 },
    });
    expect(progress.statuses.map(({ status, count }) => [status.key, count])).toEqual([
      ['untested', 1],
      ['passed', 1],
      ['failed', 1],
    ]);
    expect(progress.suites).toHaveLength(2);
    expect(progress.assignees).toHaveLength(2);
  });

  it('returns 404 for a run owned by another tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/reporting/reports/runs/${foreignRunId}/progress`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });

    expect(response.statusCode, response.body).toBe(404);
    expect(response.json().error).toMatchObject({ code: 'not_found' });
  });

  it('returns paginated execution history across immutable attempts', async () => {
    const firstPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/reporting/reports/cases/${caseId}/history?limit=1`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });

    expect(firstPageResponse.statusCode, firstPageResponse.body).toBe(200);
    const firstPage = caseExecutionHistoryResponseSchema.parse(firstPageResponse.json());
    expect(firstPage.testCase).toMatchObject({ caseNumber: '1', title: 'Sign in' });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({
      result: { attempt: 2, build: 'rc-2', comment: 'Passed after service recovery' },
      run: { id: runId, name: 'Release regression' },
      caseVersion: { version: 1, title: 'Sign in' },
    });
    expect(firstPage.nextCursor).toBe(firstPage.items[0]?.result.id);

    const secondPageResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/reporting/reports/cases/${caseId}/history?limit=1&cursor=${firstPage.nextCursor}`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });
    expect(secondPageResponse.statusCode, secondPageResponse.body).toBe(200);
    const secondPage = caseExecutionHistoryResponseSchema.parse(secondPageResponse.json());
    expect(secondPage.items[0]?.result).toMatchObject({ attempt: 1, build: 'rc-1' });
    expect(secondPage.nextCursor).toBeNull();
  });

  it('returns 404 for a case owned by another tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/reporting/reports/cases/${foreignCaseId}/history`,
      headers: { authorization: `Bearer ${organizationToken}` },
    });

    expect(response.statusCode, response.body).toBe(404);
    expect(response.json().error).toMatchObject({ code: 'not_found' });
  });
});
