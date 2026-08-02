import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateTestCaseRequest,
  CreateTestCaseResponse,
  ProjectStructureResponse,
  TestCaseListResponse,
  TestCaseTemplate,
} from '@caselog/schemas';
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

export type ProjectStructureResult =
  | { kind: 'found'; value: ProjectStructureResponse }
  | { kind: 'project_not_found' };

export type CreateTestCaseResult =
  | { kind: 'created'; value: CreateTestCaseResponse }
  | { kind: 'project_not_found' }
  | { kind: 'section_not_found' };

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
          deletedAt: null,
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

  async structure(organizationId: string, projectSlug: string): Promise<ProjectStructureResult> {
    return this.tenantDatabase.run(organizationId, async (transaction) => {
      const project = await transaction.project.findUnique({
        where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
        select: { id: true, key: true, slug: true, name: true },
      });
      if (!project) {
        return { kind: 'project_not_found' };
      }

      const suites = await transaction.suite.findMany({
        where: { projectId: project.id, deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          position: true,
          sections: {
            where: { deletedAt: null },
            orderBy: [{ path: 'asc' }, { position: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              parentId: true,
              name: true,
              depth: true,
              position: true,
            },
          },
        },
      });
      return { kind: 'found', value: { project, suites } };
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
}
