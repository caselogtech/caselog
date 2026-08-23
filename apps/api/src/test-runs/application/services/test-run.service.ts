import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  bulkTestResultsResponseSchema,
  createTestRunResponseSchema,
  idempotencyKeySchema,
  junitUploadResponseSchema,
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
  type JUnitUploadResponse,
  type JUnitUploadMetadata,
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
import { AttachmentService } from '../../../attachments/public-api';
import { RunProgressRefreshQueue } from '../../../reporting/public-api';
import { ZodValidationException } from 'nestjs-zod';
import {
  AuthorizationDeniedError,
  InvalidPayloadError,
  PayloadTooLargeError,
  ResourceConflictError,
  ResourceNotFoundError,
  UnsupportedMediaTypeError,
} from '../../../common/errors/domain.error';
import {
  JUnitParseError,
  parseJUnitResults,
  type ParsedJUnitResult,
} from '../../domain/parsers/junit-parser';
import { JUnitIngestRepository } from '../../infrastructure/repositories/junit-ingest.repository';
import { ResultIngestionRepository } from '../../infrastructure/repositories/result-ingestion.repository';
import { TestResultQueryRepository } from '../../infrastructure/repositories/test-result-query.repository';
import { TestResultRepository } from '../../infrastructure/repositories/test-result.repository';
import {
  TestRunRepository,
  type RunResult,
} from '../../infrastructure/repositories/test-run.repository';

@Injectable()
export class TestRunService {
  private readonly logger = new Logger(TestRunService.name);

  constructor(
    @Inject(TestRunRepository) private readonly runs: TestRunRepository,
    @Inject(TestResultRepository) private readonly results: TestResultRepository,
    @Inject(TestResultQueryRepository) private readonly resultQueries: TestResultQueryRepository,
    @Inject(JUnitIngestRepository) private readonly junitResults: JUnitIngestRepository,
    @Inject(ResultIngestionRepository)
    private readonly resultIngestions: ResultIngestionRepository,
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
    @Inject(RunProgressRefreshQueue)
    private readonly runProgressRefresh: RunProgressRefreshQueue,
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
    const response = createTestRunResponseSchema.parse({ run: result.value });
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, response.run.id);
    this.logger.log({ event: 'run.created', runId: response.run.id });
    return response;
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
    const result = await this.runs.start(
      principal.organizationId,
      projectSlug,
      runId,
      principal.sub,
    );
    this.assertFound(result);
    const response = testRunLifecycleResponseSchema.parse({ run: result.value });
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({ event: 'run.started', runId });
    return response;
  }

  async close(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.runs.close(
      principal.organizationId,
      projectSlug,
      runId,
      principal.sub,
    );
    this.assertFound(result);
    const response = testRunLifecycleResponseSchema.parse({ run: result.value });
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({ event: 'run.closed', runId });
    return response;
  }

  async archive(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<void> {
    this.assertManage(principal);
    const result = await this.runs.archive(
      principal.organizationId,
      projectSlug,
      runId,
      principal.sub,
    );
    this.assertFound(result);
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({ event: 'run.archived', runId });
  }

  async restore(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
  ): Promise<TestRunLifecycleResponse> {
    this.assertManage(principal);
    const result = await this.runs.restore(
      principal.organizationId,
      projectSlug,
      runId,
      principal.sub,
    );
    this.assertFound(result);
    const response = testRunLifecycleResponseSchema.parse({ run: result.value });
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({ event: 'run.restored', runId });
    return response;
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
    const response = assignTestRunItemResponseSchema.parse(result.value);
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    return response;
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
    const result = await this.results.bulkRecord(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      key,
      requestHash,
      request,
    );
    this.assertFound(result);
    const response = bulkTestResultsResponseSchema.parse(result.value);
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({
      event: 'results.ingested',
      runId,
      source: 'bulk',
      resultCount: request.results.length,
    });
    return response;
  }

  async ingestJUnitResults(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    idempotencyKey: string | undefined,
    contentType: string | undefined,
    body: unknown,
    uploadMetadata?: JUnitUploadMetadata,
  ): Promise<JUnitUploadResponse> {
    if (principal.role === 'read_only') throw new AuthorizationDeniedError();
    if (!['application/xml', 'text/xml'].includes(contentType?.split(';')[0]?.trim() ?? '')) {
      throw new UnsupportedMediaTypeError('application/xml');
    }
    const key = this.parseIdempotencyKey(idempotencyKey);
    const metadata = {
      source:
        uploadMetadata?.source ??
        (principal.tokenType === 'api_token' ? 'API token' : 'Browser upload'),
      pipeline: uploadMetadata?.pipeline ?? null,
      branch: uploadMetadata?.branch ?? null,
    };
    const input = this.junitInput(body);
    const requestDigest = createHash('sha256');
    const parsedResults: ParsedJUnitResult[] = [];
    try {
      for await (const result of parseJUnitResults(this.hashInput(input, requestDigest))) {
        parsedResults.push(result);
      }
    } catch (error) {
      if (error instanceof JUnitParseError) {
        const code =
          error.code === 'limit_exceeded' ? 'junit_upload_limit_exceeded' : `junit_${error.code}`;
        await this.recordFailedIngestion(
          principal,
          projectSlug,
          runId,
          metadata,
          code,
          error.message,
        );
        if (error.code === 'limit_exceeded') {
          throw new PayloadTooLargeError(code, error.message);
        }
        throw new InvalidPayloadError(code, error.message);
      }
      throw error;
    }

    const result = await this.junitResults.ingest(
      principal.organizationId,
      principal.sub,
      projectSlug,
      runId,
      key,
      requestDigest.digest('hex'),
      parsedResults,
      metadata,
    );
    this.assertFound(result);
    const response = junitUploadResponseSchema.parse(result.value);
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({
      event: 'results.ingested',
      runId,
      source: 'junit',
      resultCount: parsedResults.length,
    });
    return response;
  }

  private async recordFailedIngestion(
    principal: OrganizationAccessPrincipal,
    projectSlug: string,
    runId: string,
    metadata: { source: string; pipeline: string | null; branch: string | null },
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.resultIngestions.recordFailed(
        principal.organizationId,
        principal.sub,
        projectSlug,
        runId,
        metadata,
        errorCode,
        errorMessage,
      );
    } catch (error) {
      this.logger.error({
        event: 'result_ingestion.failure_record_failed',
        runId,
        error: error instanceof Error ? error.message : 'Unknown persistence error',
      });
    }
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
    let result: Awaited<ReturnType<TestResultRepository['record']>>;
    try {
      result = await this.results.record(
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
    const response = createTestResultResponseSchema.parse(result.value);
    await this.enqueueRunProgressRefresh(principal.organizationId, projectSlug, runId);
    this.logger.log({ event: 'results.ingested', runId, source: 'manual', resultCount: 1 });
    return response;
  }

  async resultHistory(
    organizationId: string,
    projectSlug: string,
    runId: string,
    itemId: string,
    query: TestResultHistoryQuery,
  ): Promise<TestResultHistoryResponse> {
    const result = await this.resultQueries.history(
      organizationId,
      projectSlug,
      runId,
      itemId,
      query,
    );
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
    const result = await this.resultQueries.detail(
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

  private async enqueueRunProgressRefresh(
    organizationId: string,
    projectSlug: string,
    runId: string,
  ): Promise<void> {
    try {
      await this.runProgressRefresh.enqueue({ organizationId, projectSlug, runId });
    } catch (error) {
      this.logger.error({
        event: 'run.progress_refresh.enqueue_failed',
        runId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
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
    if (result.kind === 'ingest_status_unavailable') {
      throw new ResourceConflictError(
        'junit_status_unavailable',
        'The project must have active passed and failed statuses for JUnit ingestion',
      );
    }
    if (result.kind === 'idempotency_conflict') {
      throw new ResourceConflictError(
        'idempotency_key_reused',
        'This idempotency key was already used for a different request',
      );
    }
  }

  private junitInput(body: unknown): AsyncIterable<Uint8Array | string> {
    if (typeof body === 'string' || body instanceof Uint8Array) {
      return (async function* () {
        yield body;
      })();
    }
    if (
      typeof body === 'object' &&
      body !== null &&
      Symbol.asyncIterator in body &&
      typeof body[Symbol.asyncIterator] === 'function'
    ) {
      return body as AsyncIterable<Uint8Array | string>;
    }
    throw new InvalidPayloadError('junit_body_required', 'A JUnit XML request body is required');
  }

  private async *hashInput(
    input: AsyncIterable<Uint8Array | string>,
    digest: ReturnType<typeof createHash>,
  ): AsyncGenerator<Uint8Array | string> {
    for await (const chunk of input) {
      digest.update(chunk);
      yield chunk;
    }
  }
}
