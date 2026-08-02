import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTestCaseRequest,
  CreateTestCaseResponse,
  RestoreTestCaseVersionRequest,
  TestCaseDetailResponse,
  TestCaseListResponse,
  TestCaseLifecycleResponse,
  TestCaseTemplate,
  TestCaseVersion,
  UpdateTestCaseRequest,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { testCaseContentSchema } from '@caselog/schemas';
import { TenantDatabaseService } from '../core/database/tenant-database.service';
import { CaseTemplate } from '../generated/prisma/enums';

const TEMPLATE_MAP: Record<CaseTemplate, TestCaseTemplate> = {
  STEPS: 'steps',
  TEXT: 'text',
  EXPLORATORY: 'exploratory',
  BDD: 'bdd',
};

const CREATE_TEMPLATE_MAP: Record<TestCaseTemplate, CaseTemplate> = {
  steps: CaseTemplate.STEPS,
  text: CaseTemplate.TEXT,
  exploratory: CaseTemplate.EXPLORATORY,
  bdd: CaseTemplate.BDD,
};

type TestCasePage = Omit<TestCaseListResponse, 'project'>;

export type TestCaseListResult =
  | { kind: 'found'; project: TestCaseListResponse['project']; page: TestCasePage }
  | { kind: 'project_not_found' };

export type CreateTestCaseResult =
  | { kind: 'created'; value: CreateTestCaseResponse }
  | { kind: 'project_not_found' }
  | { kind: 'section_not_found' };

export type DuplicateTestCaseResult = CreateTestCaseResult | { kind: 'case_not_found' };

export type TestCaseDetailResult =
  | { kind: 'found'; value: TestCaseDetailResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' };

export type UpdateTestCaseResult =
  | { kind: 'updated'; value: UpdateTestCaseResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' }
  | { kind: 'section_not_found' }
  | { kind: 'version_not_found' }
  | { kind: 'version_conflict'; currentVersion: number };

export type TestCaseVersionResult =
  | { kind: 'found'; value: TestCaseVersion }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' }
  | { kind: 'version_not_found' };

export type TestCaseLifecycleResult =
  | { kind: 'found'; value: TestCaseLifecycleResponse }
  | { kind: 'project_not_found' }
  | { kind: 'case_not_found' };

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
          currentVersion: { select: { title: true, template: true } },
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

  async create(
    organizationId: string,
    userId: string,
    projectSlug: string,
    request: CreateTestCaseRequest,
  ): Promise<CreateTestCaseResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const section = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, suiteId: true, name: true },
      });
      if (!section) {
        return { kind: 'section_not_found' };
      }

      const numberedProject = await transaction.project.update({
        where: { organizationId_id: { organizationId, id: project.id } },
        data: { nextCaseNumber: { increment: 1 } },
        select: { nextCaseNumber: true },
      });
      const testCase = await transaction.testCase.create({
        data: {
          organizationId,
          projectId: project.id,
          suiteId: section.suiteId,
          sectionId: section.id,
          caseNumber: numberedProject.nextCaseNumber - 1n,
          automationId: request.automationId,
        },
        select: { id: true, caseNumber: true },
      });
      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: 1,
          title: request.title,
          template: CREATE_TEMPLATE_MAP[request.template],
          preconditions: request.preconditions,
          expectedResult: request.expectedResult,
          content: request.content,
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
            title: request.title,
            template: request.template,
            automationId: request.automationId ?? null,
            section: { id: section.id, name: section.name },
            updatedAt: current.updatedAt.toISOString(),
          },
          version: { id: version.id, version: 1 },
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
              template: TEMPLATE_MAP[currentVersion.template],
              content: testCaseContentSchema.parse(currentVersion.content),
              createdAt: currentVersion.createdAt.toISOString(),
            },
            versions: versions.map((version) => ({
              ...version,
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

  async update(
    organizationId: string,
    userId: string,
    projectSlug: string,
    caseId: string,
    request: UpdateTestCaseRequest,
  ): Promise<UpdateTestCaseResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM test_cases
        WHERE organization_id = ${organizationId}::uuid
          AND project_id = ${project.id}::uuid
          AND id = ${caseId}::uuid
          AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { kind: 'case_not_found' };
      }

      const testCase = await transaction.testCase.findUnique({
        where: { organizationId_id: { organizationId, id: caseId } },
        select: { id: true, caseNumber: true, currentVersion: { select: { version: true } } },
      });
      if (!testCase?.currentVersion) {
        return { kind: 'case_not_found' };
      }
      if (testCase.currentVersion.version !== request.baseVersion) {
        return {
          kind: 'version_conflict',
          currentVersion: testCase.currentVersion.version,
        };
      }

      const section = await transaction.section.findUnique({
        where: {
          organizationId_id: { organizationId, id: request.sectionId },
          projectId: project.id,
          deletedAt: null,
        },
        select: { id: true, suiteId: true, name: true },
      });
      if (!section) {
        return { kind: 'section_not_found' };
      }

      const version = await transaction.testCaseVersion.create({
        data: {
          organizationId,
          testCaseId: testCase.id,
          version: request.baseVersion + 1,
          title: request.title,
          template: CREATE_TEMPLATE_MAP[request.template],
          preconditions: request.preconditions,
          expectedResult: request.expectedResult,
          content: request.content,
          createdById: userId,
        },
        select: { id: true, version: true },
      });
      const current = await transaction.testCase.update({
        where: { organizationId_id: { organizationId, id: testCase.id } },
        data: {
          suiteId: section.suiteId,
          sectionId: section.id,
          automationId: request.automationId ?? null,
          currentVersionId: version.id,
        },
        select: { id: true, automationId: true, updatedAt: true },
      });

      return {
        kind: 'updated',
        value: {
          testCase: {
            id: current.id,
            caseNumber: testCase.caseNumber.toString(),
            title: request.title,
            template: request.template,
            automationId: current.automationId,
            section: { id: section.id, name: section.name },
            updatedAt: current.updatedAt.toISOString(),
          },
          version,
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
