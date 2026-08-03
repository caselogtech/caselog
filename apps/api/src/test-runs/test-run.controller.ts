import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateTestRunResponse,
  AssignTestRunItemResponse,
  CreateTestResultResponse,
  OrganizationAccessPrincipal,
  TestRunListResponse,
  TestRunDetailResponse,
  TestRunLifecycleResponse,
  TestResultDetailResponse,
  TestResultHistoryResponse,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  AssignTestRunItemRequestDto,
  CreateTestResultRequestDto,
  CreateTestRunRequestDto,
  TestRunDetailParamsDto,
  TestRunDetailQueryDto,
  TestRunItemParamsDto,
  TestRunListParamsDto,
  TestRunListQueryDto,
  TestResultHistoryQueryDto,
  TestResultParamsDto,
} from './test-run.dto';
import { TestRunService } from './test-run.service';

@Controller('projects/:projectSlug/runs')
@UseGuards(OrganizationAuthGuard)
export class TestRunController {
  constructor(@Inject(TestRunService) private readonly runs: TestRunService) {}

  @Get()
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Query() query: TestRunListQueryDto,
  ): Promise<TestRunListResponse> {
    return this.runs.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunListParamsDto,
    @Body() request: CreateTestRunRequestDto,
  ): Promise<CreateTestRunResponse> {
    return this.runs.create(principal, params.projectSlug, request);
  }

  @Get(':runId')
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
    @Query() query: TestRunDetailQueryDto,
  ): Promise<TestRunDetailResponse> {
    return this.runs.detail(principal.organizationId, params.projectSlug, params.runId, query);
  }

  @Post(':runId/start')
  start(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.start(principal, params.projectSlug, params.runId);
  }

  @Post(':runId/close')
  close(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.close(principal, params.projectSlug, params.runId);
  }

  @Delete(':runId')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<void> {
    return this.runs.archive(principal, params.projectSlug, params.runId);
  }

  @Post(':runId/restore')
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunDetailParamsDto,
  ): Promise<TestRunLifecycleResponse> {
    return this.runs.restore(principal, params.projectSlug, params.runId);
  }

  @Put(':runId/items/:itemId/assignee')
  assign(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestRunItemParamsDto,
    @Body() request: AssignTestRunItemRequestDto,
  ): Promise<AssignTestRunItemResponse> {
    return this.runs.assign(principal, params.projectSlug, params.runId, params.itemId, request);
  }

  @Post(':runId/items/:itemId/results')
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
