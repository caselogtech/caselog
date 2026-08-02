import { Inject, Injectable } from '@nestjs/common';
import {
  createTestRunResponseSchema,
  assignTestRunItemResponseSchema,
  createTestResultResponseSchema,
  testRunDetailResponseSchema,
  testRunLifecycleResponseSchema,
  testRunListResponseSchema,
  type CreateTestRunRequest,
  type CreateTestRunResponse,
  type AssignTestRunItemRequest,
  type AssignTestRunItemResponse,
  type CreateTestResultRequest,
  type CreateTestResultResponse,
  type OrganizationAccessPrincipal,
  type TestRunListQuery,
  type TestRunListResponse,
  type TestRunDetailQuery,
  type TestRunDetailResponse,
  type TestRunLifecycleResponse,
} from '@caselog/schemas';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../common/errors/domain.error';
import { TestRunRepository, type RunResult } from './test-run.repository';

@Injectable()
export class TestRunService {
  constructor(@Inject(TestRunRepository) private readonly runs: TestRunRepository) {}

  async list(
    organizationId: string,
    projectSlug: string,
    query: TestRunListQuery,
  ): Promise<TestRunListResponse> {
    const result = await this.runs.list(organizationId, projectSlug, query);
    this.assertFound(result);
    return testRunListResponseSchema.parse(result.value);
  }

  async create(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    request: CreateTestRunRequest,
  ): Promise<CreateTestRunResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.runs.create(principal.organizationId, projectSlug, request);
    this.assertFound(result);
    return createTestRunResponseSchema.parse({ run: result.value });
  }

  async detail(
    organizationId: string,
    projectSlug: string,
    runId: string,
    query: TestRunDetailQuery,
  ): Promise<TestRunDetailResponse> {
    const result = await this.runs.detail(organizationId, projectSlug, runId, query);
    this.assertFound(result);
    return testRunDetailResponseSchema.parse(result.value);
  }

  async start(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.runs.start(principal.organizationId, projectSlug, runId);
    this.assertFound(result);
    return testRunLifecycleResponseSchema.parse({ run: result.value });
  }

  async close(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.runs.close(principal.organizationId, projectSlug, runId);
    this.assertFound(result);
    return testRunLifecycleResponseSchema.parse({ run: result.value });
  }

  async assign(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: AssignTestRunItemRequest,
  ): Promise<AssignTestRunItemResponse> {
    this.assertManage(principal);
    const result = await this.runs.assign(
      principal.organizationId,
      projectSlug,
      runId,
      itemId,
      request,
    );
    this.assertFound(result);
    return assignTestRunItemResponseSchema.parse(result.value);
  }

  async recordResult(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateTestResultRequest,
  ): Promise<CreateTestResultResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const result = await this.runs.recordResult(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      itemId,
      request,
    );
    this.assertFound(result);
    return createTestResultResponseSchema.parse(result.value);
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (!['owner', 'admin', 'lead'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private assertFound<T>(result: RunResult<T>): asserts result is { kind: 'found'; value: T } {
    if (result.kind === 'project_not_found') throw new ResourceNotFoundError('project');
    if (result.kind === 'case_unavailable') {
      throw new ResourceConflictError(
        'run_case_unavailable',
        'One or more selected test cases are unavailable',
      );
    }
    if (result.kind === 'untested_status_not_found') {
      throw new ResourceConflictError(
        'run_status_unavailable',
        'The project does not have an active untested result status',
      );
    }
    if (result.kind === 'run_not_found') throw new ResourceNotFoundError('test_run');
    if (result.kind === 'item_not_found') throw new ResourceNotFoundError('test_run_item');
    if (result.kind === 'member_not_found') throw new ResourceNotFoundError('member');
    if (result.kind === 'status_not_found') throw new ResourceNotFoundError('result_status');
    if (result.kind === 'run_closed') {
      throw new ResourceConflictError('run_closed', 'The test run is closed for changes');
    }
    if (result.kind === 'invalid_run_state') {
      throw new ResourceConflictError(
        'invalid_run_state',
        'The test run cannot transition from its current state',
      );
    }
  }
}
