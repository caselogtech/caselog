import { Inject, Injectable } from '@nestjs/common';
import {
  testCaseListResponseSchema,
  testCaseLifecycleResponseSchema,
  createTestCaseResponseSchema,
  testCaseDetailResponseSchema,
  type CreateTestCaseRequest,
  type CreateTestCaseResponse,
  type OrganizationAccessPrincipal,
  type RestoreTestCaseVersionRequest,
  type TestCaseDetailResponse,
  type TestCaseListQuery,
  type TestCaseListResponse,
  type TestCaseLifecycleResponse,
  type TestCaseVersion,
  type UpdateTestCaseRequest,
  type UpdateTestCaseResponse,
  updateTestCaseResponseSchema,
  testCaseVersionSchema,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error';
import { TestCaseRepository } from '../../infrastructure/repositories/test-case.repository';

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
      query.state,
    );
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    return testCaseListResponseSchema.parse({ project: result.project, ...result.page });
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

  async detail(
    organizationId: string,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseDetailResponse> {
    const result = await this.testCases.detail(organizationId, projectSlug, caseId);
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    if (result.kind === 'case_not_found') {
      throw new ResourceNotFoundError('test_case');
    }
    return testCaseDetailResponseSchema.parse(result.value);
  }

  async update(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    request: UpdateTestCaseRequest,
  ): Promise<UpdateTestCaseResponse> {
    if (principal.role === 'read_only') {
      throw new AuthorizationDeniedError();
    }
    const result = await this.testCases.update(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
      request,
    );
    if (result.kind === 'project_not_found') {
      throw new ResourceNotFoundError('project');
    }
    if (result.kind === 'case_not_found') {
      throw new ResourceNotFoundError('test_case');
    }
    if (result.kind === 'section_not_found') {
      throw new ResourceNotFoundError('section');
    }
    if (result.kind === 'version_not_found') {
      throw new ResourceNotFoundError('test_case_version');
    }
    if (result.kind === 'version_conflict') {
      throw new ResourceConflictError(
        'case_version_conflict',
        'The test case has changed since it was loaded',
        { currentVersion: result.currentVersion },
      );
    }
    return updateTestCaseResponseSchema.parse(result.value);
  }

  async version(
    organizationId: string,
    projectSlug: string,
    caseId: string,
    versionId: string,
  ): Promise<TestCaseVersion> {
    const result = await this.testCases.version(organizationId, projectSlug, caseId, versionId);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
    if (result.kind === 'version_not_found') {
      throw new ResourceNotFoundError('test_case_version');
    }
    return testCaseVersionSchema.parse(result.value);
  }

  async restore(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
    versionId: string,
    request: RestoreTestCaseVersionRequest,
  ): Promise<UpdateTestCaseResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.testCases.restore(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
      versionId,
      request,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
    if (result.kind === 'section_not_found') throw new ResourceNotFoundError('section');
    if (result.kind === 'version_not_found') {
      throw new ResourceNotFoundError('test_case_version');
    }
    if (result.kind === 'version_conflict') {
      throw new ResourceConflictError(
        'case_version_conflict',
        'The test case has changed since it was loaded',
        { currentVersion: result.currentVersion },
      );
    }
    return updateTestCaseResponseSchema.parse(result.value);
  }

  async archive(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
  ): Promise<void> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.testCases.archive(principal.organizationId, projectSlug, caseId);
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
  }

  async restoreArchived(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
  ): Promise<TestCaseLifecycleResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.testCases.restoreArchived(
      principal.organizationId,
      projectSlug,
      caseId,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
    return testCaseLifecycleResponseSchema.parse(result.value);
  }

  async duplicate(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    caseId: string,
  ): Promise<CreateTestCaseResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.testCases.duplicate(
      principal.organizationId,
      principal.sub,
      projectSlug,
      caseId,
    );
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_not_found') throw new ResourceNotFoundError('test_case');
    if (result.kind === 'section_not_found') throw new ResourceNotFoundError('section');
    return createTestCaseResponseSchema.parse(result.value);
  }
}
