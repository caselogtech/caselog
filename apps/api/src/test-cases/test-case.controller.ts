import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  CreateTestCaseResponse,
  OrganizationAccessPrincipal,
  ProjectStructureResponse,
  TestCaseListResponse,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateTestCaseRequestDto,
  TestCaseListParamsDto,
  TestCaseListQueryDto,
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
