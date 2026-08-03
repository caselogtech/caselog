import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  bulkTestResultsResponseSchema,
  createTestRunResponseSchema,
  idempotencyKeySchema,
  assignTestRunItemResponseSchema,
  createTestResultResponseSchema,
  testRunDetailResponseSchema,
  testRunLifecycleResponseSchema,
  testResultDetailResponseSchema,
  testResultHistoryResponseSchema,
  testRunListResponseSchema,
  type CreateTestRunRequest,
  type CreateTestRunResponse,
  type AssignTestRunItemRequest,
  type AssignTestRunItemResponse,
  type BulkTestResultsRequest,
  type BulkTestResultsResponse,
  type CreateTestResultRequest,
  type CreateTestResultResponse,
  type OrganizationAccessPrincipal,
  type TestRunListQuery,
  type TestRunListResponse,
  type TestRunDetailQuery,
  type TestRunDetailResponse,
  type TestRunLifecycleResponse,
  type TestResultDetailResponse,
  type TestResultHistoryQuery,
  type TestResultHistoryResponse,
} from '@caselog/schemas';
import { AttachmentService } from '../attachments/attachment.service';
import { ZodValidationException } from 'nestjs-zod';
import {
  AuthorizationDeniedError,
  ResourceConflictError,
  ResourceNotFoundError,
} from '../common/errors/domain.error';
import { TestRunRepository, type RunResult } from './test-run.repository';

@Injectable()
export class TestRunService {
  constructor(
    @Inject(TestRunRepository) private readonly runs: TestRunRepository,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
  ) {}

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
    idempotencyKey: string | undefined,
    request: CreateTestRunRequest,
  ): Promise<CreateTestRunResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const parsedKey = this.parseIdempotencyKey(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.runs.create(
      principal.organizationId,
      projectSlug,
      parsedKey,
      requestHash,
      request,
    );
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

  async archive(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<void> {
    this.assertManage(principal);
    const result = await this.runs.archive(principal.organizationId, projectSlug, runId);
    this.assertFound(result);
  }

  async restore(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.runs.restore(principal.organizationId, projectSlug, runId);
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

  async bulkRecordResults(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    idempotencyKey: string | undefined,
    request: BulkTestResultsRequest,
  ): Promise<BulkTestResultsResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const key = this.parseIdempotencyKey(idempotencyKey);
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const result = await this.runs.bulkRecordResults(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      key,
      requestHash,
      request,
    );
    this.assertFound(result);
    return bulkTestResultsResponseSchema.parse(result.value);
  }

  async recordResult(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    itemId: string,
    request: CreateTestResultRequest,
  ): Promise<CreateTestResultResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    const preparedAttachments = await this.attachments.prepareResultAttachments(
      principal,
      projectSlug,
      runId,
      itemId,
      request.uploadIds ?? [],
    );
    let result: Awaited<ReturnType<TestRunRepository['recordResult']>>;
    try {
      result = await this.runs.recordResult(
        principal.organizationId,
        principal.sub,
        projectSlug,
        runId,
        itemId,
        request,
        preparedAttachments,
      );
    } catch (error) {
      await this.attachments.discardPreparedAttachments(preparedAttachments);
      throw error;
    }
    if (result.kind !== 'found') {
      await this.attachments.discardPreparedAttachments(preparedAttachments);
    } else {
      await this.attachments.discardCompletedUploadObjects(preparedAttachments);
    }
    this.assertFound(result);
    return createTestResultResponseSchema.parse(result.value);
  }

  async resultHistory(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    query: TestResultHistoryQuery,
  ): Promise<TestResultHistoryResponse> {
    const result = await this.runs.resultHistory(organizationId, projectSlug, runId, itemId, query);
    this.assertFound(result);
    return testResultHistoryResponseSchema.parse(result.value);
  }

  async resultDetail(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    resultId: string,
  ): Promise<TestResultDetailResponse> {
    const result = await this.runs.resultDetail(
      organizationId,
      projectSlug,
      runId,
      itemId,
      resultId,
    );
    this.assertFound(result);
    return testResultDetailResponseSchema.parse(result.value);
  }

  private assertManage(principal: OrganizationAccessPrincipal): void {
    if (!['owner', 'admin', 'lead'].includes(principal.role)) {
      throw new AuthorizationDeniedError();
    }
  }

  private parseIdempotencyKey(value: string | undefined): string {
    const parsed = idempotencyKeySchema.safeParse(value);
    if (!parsed.success) throw new ZodValidationException(parsed.error);
    return parsed.data;
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
    if (result.kind === 'result_not_found') throw new ResourceNotFoundError('test_result');
    if (result.kind === 'invalid_step_results') {
      throw new ResourceConflictError(
        'invalid_step_results',
        'Step results do not match the immutable test case snapshot',
      );
    }
    if (result.kind === 'invalid_upload') {
      throw new ResourceConflictError(
        'invalid_upload',
        'One or more uploads are no longer available for this result',
      );
    }
    if (result.kind === 'run_closed') {
      throw new ResourceConflictError('run_closed', 'The test run is closed for changes');
    }
    if (result.kind === 'invalid_run_state') {
      throw new ResourceConflictError(
        'invalid_run_state',
        'The test run cannot transition from its current state',
      );
    }
    if (result.kind === 'duplicate_matched_item') {
      throw new ResourceConflictError(
        'bulk_result_duplicate_item',
        'Multiple bulk results matched the same test run item',
      );
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'This idempotency key was already used for a different request',
      );
    }
  }
}
