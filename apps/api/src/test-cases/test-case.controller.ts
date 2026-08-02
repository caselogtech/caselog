import { Body, Controller, Get, Inject, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type {
  CreateTestCaseResponse,
  OrganizationAccessPrincipal,
  ProjectStructureResponse,
  TestCaseDetailResponse,
  TestCaseListResponse,
  TestCaseVersion,
  UpdateTestCaseResponse,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateTestCaseRequestDto,
  RestoreTestCaseVersionRequestDto,
  TestCaseDetailParamsDto,
  TestCaseListParamsDto,
  TestCaseListQueryDto,
  UpdateTestCaseRequestDto,
  TestCaseVersionParamsDto,
} from './test-case.dto';
import { TestCaseService } from './test-case.service';

@Controller('projects/:projectSlug/cases')
@UseGuards(OrganizationAuthGuard)
export class TestCaseController {
  constructor(@Inject(TestCaseService) private readonly testCases: TestCaseService) {}

  @Get()
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Query() query: TestCaseListQueryDto,
  ): Promise<TestCaseListResponse> {
    return this.testCases.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Body() request: CreateTestCaseRequestDto,
  ): Promise<CreateTestCaseResponse> {
    return this.testCases.create(principal, params.projectSlug, request);
  }

  @Get(':caseId')
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
  ): Promise<TestCaseDetailResponse> {
    return this.testCases.detail(principal.organizationId, params.projectSlug, params.caseId);
  }

  @Put(':caseId')
  update(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseDetailParamsDto,
    @Body() request: UpdateTestCaseRequestDto,
  ): Promise<UpdateTestCaseResponse> {
    return this.testCases.update(principal, params.projectSlug, params.caseId, request);
  }

  @Get(':caseId/versions/:versionId')
  version(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseVersionParamsDto,
  ): Promise<TestCaseVersion> {
    return this.testCases.version(
      principal.organizationId,
      params.projectSlug,
      params.caseId,
      params.versionId,
    );
  }

  @Post(':caseId/versions/:versionId/restore')
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseVersionParamsDto,
    @Body() request: RestoreTestCaseVersionRequestDto,
  ): Promise<UpdateTestCaseResponse> {
    return this.testCases.restore(
      principal,
      params.projectSlug,
      params.caseId,
      params.versionId,
      request,
    );
  }
}

@Controller('projects/:projectSlug/structure')
@UseGuards(OrganizationAuthGuard)
export class ProjectStructureController {
  constructor(@Inject(TestCaseService) private readonly testCases: TestCaseService) {}

  @Get()
  get(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
  ): Promise<ProjectStructureResponse> {
    return this.testCases.structure(principal.organizationId, params.projectSlug);
  }
}
