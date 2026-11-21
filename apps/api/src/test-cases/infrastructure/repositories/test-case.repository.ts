import { Inject, Injectable } from '@nestjs/common';
import type { RestoreTestCaseVersionRequest } from '@caselog/schemas';
import { testCaseContentSchema, testCasePrioritySchema } from '@caselog/schemas';
import { TenantDatabaseService } from '../../../core/database/application/services/tenant-database.service';

import {
  TEMPLATE_MAP,
  type DuplicateTestCaseResult,
  type TestCaseDetailResult,
  type TestCaseListResult,
  type TestCaseVersionResult,
  type TestCaseLifecycleResult,
  type UpdateTestCaseResult,
} from '../persistence/test-case.persistence';

@Injectable()
export class TestCaseRepository {
  constructor(
    @Inject(TenantDatabaseService) private readonly tenantDatabase: TenantDatabaseService,
  ) {}

  async list(
    organizationId: string,
    projectSlug: string,
    cursor: string | undefined,
    limit: number,
    search: string | undefined,
    sectionId: string | undefined,
    state: 'active' | 'archived',
  ): Promise<TestCaseListResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const testCases = await transaction.testCase.findMany({
        where: {
          projectId: project.id,
          sectionId,
          deletedAt: state === 'active' ? null : { not: null },
          currentVersionId: { not: null },
          currentVersion: search ? { title: { contains: search, mode: 'insensitive' } } : undefined,
        },
        cursor: cursor ? { organizationId_id: { organizationId, id: cursor } } : undefined,
        skip: cursor ? 1 : undefined,
        take: limit + 1,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          caseNumber: true,
          automationId: true,
          updatedAt: true,
          section: { select: { id: true, name: true } },
          currentVersion: { select: { title: true, template: true, priority: true } },
        },
      });

      const hasNextPage = testCases.length > limit;
      const page = hasNextPage ? testCases.slice(0, limit) : testCases;
      return {
        kind: 'found',
        project,
        page: {
          items: page.flatMap(({ currentVersion, caseNumber, updatedAt, ...testCase }) =>
            currentVersion
              ? [
                  {
                    ...testCase,
                    caseNumber: caseNumber.toString(),
                    title: currentVersion.title,
                    priority: testCasePrioritySchema.parse(currentVersion.priority),
                    template: TEMPLATE_MAP[currentVersion.template],
                    updatedAt: updatedAt.toISOString(),
                  },
                ]
              : [],
          ),
          nextCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null,
        },
      };
    });
  }

  async detail(
    organizationId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseDetailResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const testCase = await transaction.testCase.findUnique({
        where: {
          organizationId_id: { organizationId, id: caseId },
          projectId: project.id,
          deletedAt: null,
        },
        select: {
          id: true,
          caseNumber: true,
          automationId: true,
          createdAt: true,
          updatedAt: true,
          section: {
            select: { id: true, name: true, suiteId: true, suite: { select: { name: true } } },
          },
          currentVersion: {
            select: {
              id: true,
              version: true,
              title: true,
              template: true,
              priority: true,
              preconditions: true,
              expectedResult: true,
              content: true,
              createdAt: true,
              createdBy: { select: { id: true, displayName: true } },
            },
          },
          versions: {
            orderBy: { version: 'desc' },
            select: {
              id: true,
              version: true,
              title: true,
              template: true,
              priority: true,
              preconditions: true,
              expectedResult: true,
              createdAt: true,
              createdBy: { select: { id: true, displayName: true } },
            },
          },
        },
      });
      if (!testCase?.currentVersion) {
        return { kind: 'case_not_found' };
      }

      const { currentVersion, section, versions, caseNumber, createdAt, updatedAt, ...identity } =
        testCase;
      return {
        kind: 'found',
        value: {
          project,
          testCase: {
            ...identity,
            caseNumber: caseNumber.toString(),
            section: {
              id: section.id,
              name: section.name,
              suiteId: section.suiteId,
              suiteName: section.suite.name,
            },
            currentVersion: {
              ...currentVersion,
              priority: testCasePrioritySchema.parse(currentVersion.priority),
              template: TEMPLATE_MAP[currentVersion.template],
              content: testCaseContentSchema.parse(currentVersion.content),
              createdAt: currentVersion.createdAt.toISOString(),
            },
            versions: versions.map((version) => ({
              ...version,
              priority: testCasePrioritySchema.parse(version.priority),
              template: TEMPLATE_MAP[version.template],
              createdAt: version.createdAt.toISOString(),
            })),
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          },
        },
      };
    });
  }

  async version(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
  ): Promise<TestCaseVersionResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const testCase = await transaction.testCase.findUnique({
        where: {
          organizationId_id: { organizationId, id: caseId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!testCase) return { kind: 'case_not_found' };

      const version = await transaction.testCaseVersion.findUnique({
        where: {
          organizationId_id: { organizationId, id: versionId },
          testCaseId: testCase.id,
        },
        select: {
          id: true,
          version: true,
          title: true,
          template: true,
          priority: true,
          preconditions: true,
          expectedResult: true,
          content: true,
          createdAt: true,
          createdBy: { select: { id: true, displayName: true } },
        },
      });
      if (!version) return { kind: 'version_not_found' };

      return {
        kind: 'found',
        value: {
          ...version,
          priority: testCasePrioritySchema.parse(version.priority),
          template: TEMPLATE_MAP[version.template],
          content: testCaseContentSchema.parse(version.content),
          createdAt: version.createdAt.toISOString(),
        },
      };
    });
  }

  async restore(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: RestoreTestCaseVersionRequest,
  ): Promise<UpdateTestCaseResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM test_cases
        WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${project.id}::uuid
          AND id = ${caseId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) return { kind: 'case_not_found' };

      const testCase = await transaction.testCase.findUnique({
        where: { organizationId_id: { organizationId, id: caseId } },
        select: {
          id: true,
          caseNumber: true,
          automationId: true,
          updatedAt: true,
          section: { select: { id: true, name: true } },
          currentVersion: { select: { version: true } },
        },
      });
      if (!testCase?.currentVersion) return { kind: 'case_not_found' };
      if (testCase.currentVersion.version !== request.baseVersion) {
        return { kind: 'version_conflict', currentVersion: testCase.currentVersion.version };
      }

      const target = await transaction.testCaseVersion.findUnique({
        where: {
          organizationId_id: { organizationId, id: versionId },
          testCaseId: testCase.id,
        },
        select: {
          title: true,
          template: true,
          priority: true,
          preconditions: true,
          expectedResult: true,
          content: true,
        },
      });
      if (!target) return { kind: 'version_not_found' };

      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: request.baseVersion + 1,
          title: target.title,
          template: target.template,
          priority: target.priority,
          preconditions: target.preconditions,
          expectedResult: target.expectedResult,
          content: testCaseContentSchema.parse(target.content),
          createdById: userId,
        },
        select: { id: true, version: true },
      });
      const current = await transaction.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: { currentVersionId: version.id },
        select: { updatedAt: true },
      });

      return {
        kind: 'updated',
        value: {
          testCase: {
            id: testCase.id,
            caseNumber: testCase.caseNumber.toString(),
            title: target.title,
            template: TEMPLATE_MAP[target.template],
            priority: testCasePrioritySchema.parse(target.priority),
            automationId: testCase.automationId,
            section: testCase.section,
            updatedAt: current.updatedAt.toISOString(),
          },
          version,
        },
      };
    });
  }

  async archive(
    organizationId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseLifecycleResult> {
    return this.setArchivedState(organizationId, projectSlug, caseId, true);
  }

  async restoreArchived(
    organizationId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseLifecycleResult> {
    return this.setArchivedState(organizationId, projectSlug, caseId, false);
  }

  async duplicate(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<DuplicateTestCaseResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const source = await transaction.testCase.findUnique({
        where: {
          organizationId_id: { organizationId, id: caseId },
          projectId: project.id,
          deletedAt: null,
        },
        select: {
          suiteId: true,
          sectionId: true,
          section: { select: { name: true } },
          currentVersion: {
            select: {
              title: true,
              template: true,
              priority: true,
              preconditions: true,
              expectedResult: true,
              content: true,
            },
          },
        },
      });
      if (!source?.currentVersion) return { kind: 'case_not_found' };

      const numberedProject = await transaction.project.update({
        where: { organizationId_id: { organizationId, id: project.id } },
        data: { nextCaseNumber: { increment: 1 } },
        select: { nextCaseNumber: true },
      });
      const title = `${source.currentVersion.title.slice(0, 493)} (copy)`;
      const testCase = await transaction.testCase.create({
        data: {
          organizationId,
          projectId: project.id,
          suiteId: source.suiteId,
          sectionId: source.sectionId,
          caseNumber: numberedProject.nextCaseNumber - 1n,
        },
        select: { id: true, caseNumber: true },
      });
      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
          title,
          template: source.currentVersion.template,
          priority: source.currentVersion.priority,
          preconditions: source.currentVersion.preconditions,
          expectedResult: source.currentVersion.expectedResult,
          content: testCaseContentSchema.parse(source.currentVersion.content),
          createdById: userId,
        },
        select: { id: true, version: true },
      });
      const current = await transaction.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: { currentVersionId: version.id },
        select: { updatedAt: true },
      });

      return {
        kind: 'created',
        value: {
          testCase: {
            id: testCase.id,
            caseNumber: testCase.caseNumber.toString(),
            title,
            template: TEMPLATE_MAP[source.currentVersion.template],
            priority: testCasePrioritySchema.parse(source.currentVersion.priority),
            automationId: null,
            section: { id: source.sectionId, name: source.section.name },
            updatedAt: current.updatedAt.toISOString(),
          },
          version: { id: version.id, version: 1 },
        },
      };
    });
  }

  private setArchivedState(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    archived: boolean,
  ): Promise<TestCaseLifecycleResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) return { kind: 'project_not_found' };

      const testCase = await transaction.testCase.findUnique({
        where: {
          organizationId_id: { organizationId, id: caseId },
          projectId: project.id,
        },
        select: { id: true, deletedAt: true },
      });
      if (!testCase) return { kind: 'case_not_found' };

      if (archived !== Boolean(testCase.deletedAt)) {
        await transaction.testCase.update({
          where: { organizationId_id: { organizationId, id: testCase.id } },
          data: { deletedAt: archived ? new Date() : null },
        });
      }
      return {
        kind: 'found',
        value: { testCaseId: testCase.id, state: archived ? 'archived' : 'active' },
      };
    });
  }
}
