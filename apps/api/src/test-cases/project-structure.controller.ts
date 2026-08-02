import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import type {
  OrganizationAccessPrincipal,
  ProjectStructureResponse,
  SectionResponse,
  SuiteResponse,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateSectionParamsDto,
  CreateSectionRequestDto,
  CreateSuiteRequestDto,
  SectionParamsDto,
  SuiteParamsDto,
  TestCaseListParamsDto,
  UpdateSectionRequestDto,
  UpdateSuiteRequestDto,
} from './test-case.dto';
import { ProjectStructureService } from './project-structure.service';

@Controller('projects/:projectSlug/structure')
@UseGuards(OrganizationAuthGuard)
export class ProjectStructureController {
  constructor(
    @Inject(ProjectStructureService) private readonly structure: ProjectStructureService,
  ) {}

  @Get()
  get(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
  ): Promise<ProjectStructureResponse> {
    return this.structure.get(principal.organizationId, params.projectSlug);
  }

  @Post('suites')
  createSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Body() request: CreateSuiteRequestDto,
  ): Promise<SuiteResponse> {
    return this.structure.createSuite(principal, params.projectSlug, request);
  }

  @Put('suites/:suiteId')
  updateSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SuiteParamsDto,
    @Body() request: UpdateSuiteRequestDto,
  ): Promise<SuiteResponse> {
    return this.structure.updateSuite(principal, params.projectSlug, params.suiteId, request);
  }

  @Post('suites/:suiteId/sections')
  createSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CreateSectionParamsDto,
    @Body() request: CreateSectionRequestDto,
  ): Promise<SectionResponse> {
    return this.structure.createSection(principal, params.projectSlug, params.suiteId, request);
  }

  @Put('sections/:sectionId')
  updateSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SectionParamsDto,
    @Body() request: UpdateSectionRequestDto,
  ): Promise<SectionResponse> {
    return this.structure.updateSection(principal, params.projectSlug, params.sectionId, request);
  }
}
