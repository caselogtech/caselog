import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  BulkTestResultsResponse,
  CreateTestRunResponse,
  AssignTestRunItemResponse,
  CreateTestResultResponse,
  OrganizationAccessPrincipal,
  TestRunListResponse,
  TestRunDetailResponse,
  TestRunLifecycleResponse,
  TestResultDetailResponse,
  TestResultHistoryResponse,
  JUnitUploadResponse,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  AssignTestRunItemRequestDto,
  BulkTestResultsRequestDto,
  CreateTestResultRequestDto,
  CreateTestRunRequestDto,
  CreateTestRunHeadersDto,
  IdempotencyHeadersDto,
  JUnitUploadHeadersDto,
  TestRunDetailParamsDto,
  TestRunDetailQueryDto,
  TestRunItemParamsDto,
  TestRunListParamsDto,
  TestRunListQueryDto,
  TestResultHistoryQueryDto,
  TestResultParamsDto,
} from '../dto/test-run.dto';
import { TestRunService } from '../../application/services/test-run.service';
import {
  AssignTestRunItemResponseDto,
  BulkTestResultsResponseDto,
  CreateTestResultResponseDto,
  CreateTestRunResponseDto,
  JUnitUploadResponseDto,
  TestResultDetailResponseDto,
  TestResultHistoryResponseDto,
  TestRunDetailResponseDto,
  TestRunLifecycleResponseDto,
  TestRunListResponseDto,
} from '../dto/test-run-response.dto';

@Controller('projects/:projectSlug/runs')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class TestRunController {
  constructor(@Inject(TestRunService) private readonly runs: TestRunService) {}

  @Get()
  @ApiOkResponse({ type: TestRunListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Query() query: TestRunListQueryDto,
  ): Promise<TestRunListResponse> {
    return this.runs.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  @ApiCreatedResponse({ type: CreateTestRunResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Headers() headers: CreateTestRunHeadersDto,
    @Body() request: CreateTestRunRequestDto,
  ): Promise<CreateTestRunResponse> {
    return this.runs.create(
      principal,
      params.projectSlug,
      headers['idempotency-key'] as string | undefined,
      request,
    );
  }

  @Post(':runId/results/bulk')
  @ApiCreatedResponse({ type: BulkTestResultsResponseDto })
  @RequireApiTokenScopes('results:write')
  bulkRecordResults(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
    @Headers() headers: IdempotencyHeadersDto,
    @Body() request: BulkTestResultsRequestDto,
  ): Promise<BulkTestResultsResponse> {
    return this.runs.bulkRecordResults(
      principal,
      params.projectSlug,
      params.runId,
      headers['idempotency-key'] as string | undefined,
      request,
    );
  }

  @Post(':runId/results/junit')
  @ApiConsumes('application/xml', 'text/xml')
  @ApiBody({ schema: { type: 'string', description: 'JUnit XML document' } })
  @ApiCreatedResponse({ type: JUnitUploadResponseDto })
  @RequireApiTokenScopes('results:write')
  ingestJUnitResults(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
    @Headers() headers: JUnitUploadHeadersDto,
    @Headers('content-type') contentType: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<JUnitUploadResponse> {
    return this.runs.ingestJUnitResults(
      principal,
      params.projectSlug,
      params.runId,
      headers['idempotency-key'] as string | undefined,
      contentType,
      request.body,
      {
        source: headers['x-caselog-source'],
        pipeline: headers['x-caselog-pipeline'],
        branch: headers['x-caselog-branch'],
      },
    );
  }

  @Get(':runId')
  @ApiOkResponse({ type: TestRunDetailResponseDto })
  @RequireApiTokenScopes('runs:read')
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
    @Query() query: TestRunDetailQueryDto,
  ): Promise<TestRunDetailResponse> {
    return this.runs.detail(principal.organizationId, params.projectSlug, params.runId, query);
  }

  @Post(':runId/start')
  @ApiCreatedResponse({ type: TestRunLifecycleResponseDto })
  start(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.start(principal, params.projectSlug, params.runId);
  }

  @Post(':runId/close')
  @ApiCreatedResponse({ type: TestRunLifecycleResponseDto })
  close(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.close(principal, params.projectSlug, params.runId);
  }

  @Delete(':runId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<void> {
    return this.runs.archive(principal, params.projectSlug, params.runId);
  }

  @Post(':runId/restore')
  @ApiCreatedResponse({ type: TestRunLifecycleResponseDto })
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.restore(principal, params.projectSlug, params.runId);
  }

  @Put(':runId/items/:itemId/assignee')
  @ApiOkResponse({ type: AssignTestRunItemResponseDto })
  assign(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunItemParamsDto,
    @Body() request: AssignTestRunItemRequestDto,
  ): Promise<AssignTestRunItemResponse> {
    return this.runs.assign(principal, params.projectSlug, params.runId, params.itemId, request);
  }

  @Post(':runId/items/:itemId/results')
  @ApiCreatedResponse({ type: CreateTestResultResponseDto })
  recordResult(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunItemParamsDto,
    @Body() request: CreateTestResultRequestDto,
  ): Promise<CreateTestResultResponse> {
    return this.runs.recordResult(
      principal,
      params.projectSlug,
      params.runId,
      params.itemId,
      request,
    );
  }

  @Get(':runId/items/:itemId/results')
  @ApiOkResponse({ type: TestResultHistoryResponseDto })
  @RequireApiTokenScopes('runs:read')
  resultHistory(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunItemParamsDto,
    @Query() query: TestResultHistoryQueryDto,
  ): Promise<TestResultHistoryResponse> {
    return this.runs.resultHistory(
      principal.organizationId,
      params.projectSlug,
      params.runId,
      params.itemId,
      query,
    );
  }

  @Get(':runId/items/:itemId/results/:resultId')
  @ApiOkResponse({ type: TestResultDetailResponseDto })
  @RequireApiTokenScopes('runs:read')
  resultDetail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestResultParamsDto,
  ): Promise<TestResultDetailResponse> {
    return this.runs.resultDetail(
      principal.organizationId,
      params.projectSlug,
      params.runId,
      params.itemId,
      params.resultId,
    );
  }
}
