import { Inject, Injectable } from '@nestjs/common';
import {
  testCaseListResponseSchema,
  createTestCaseResponseSchema,
  projectStructureResponseSchema,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type OrganizationAccessPrincipal,
  type ProjectStructureResponse,
  type TestCaseListQuery,
  type TestCaseListResponse,
} from '@caselog/schemas';
import { AuthorizationDeniedError, ResourceNotFoundError } from '../common/errors/domain.error';
import { TestCaseRepository } from './test-case.repository';

@Injectable()
export class TestCaseService {
  constructor(@Inject(TestCaseRepository) private readonly testCases: TestCaseRepository) {}

  async list(
    organizationId: string,
    projectSlug: string,
    query: TestCaseListQuery,
  ): Promise<TestCaseListResponse> {
    const result = await this.testCases.list(
      organizationId,
      projectSlug,
      query.cursor,
      query.limit,
      query.search,
      query.sectionId,
    );
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    return testCaseListResponseSchema.parse({ project: result.project, ...result.page });
  }

  async structure(organizationId: string, projectSlug: string): Promise<ProjectStructureResponse> {
    const result = await this.testCases.structure(organizationId, projectSlug);
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    return projectStructureResponseSchema.parse(result.value);
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    request: CreateTestCaseRequest,
  ): Promise<CreateTestCaseResponse> {
    if (principal.role === 'read_only') {
      throw new AuthorizationDeniedError();
    }
    const result = await this.testCases.create(
      principal.organizationId,
      principal.sub,
      projectSlug,
      request,
    );
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    if (result.kind === 'section_not_found') {
      throw new ResourceNotFoundError('section');
    }
    return createTestCaseResponseSchema.parse(result.value);
  }
}
