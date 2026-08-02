import { Inject, Injectable } from '@nestjs/common';
import {
  createTestRunResponseSchema,
  testRunListResponseSchema,
  type CreateTestRunRequest,
  type CreateTestRunResponse,
  type OrganizationAccessPrincipal,
  type TestRunListQuery,
  type TestRunListResponse,
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
  }
}
