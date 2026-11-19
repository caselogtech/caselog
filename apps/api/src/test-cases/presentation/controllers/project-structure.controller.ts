import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  OrganizationAccessPrincipal,
  ProjectStructureResponse,
  SectionResponse,
  SuiteResponse,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { validate } from 'nestjs-zod';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateSectionParamsDto,
  CreateSectionRequestDto,
  CreateSuiteRequestDto,
  ProjectStructureWriteHeadersDto,
  MoveSectionRequestDto,
  MoveSuiteRequestDto,
  SectionParamsDto,
  SuiteParamsDto,
  TestCaseListParamsDto,
  UpdateSectionRequestDto,
  UpdateSuiteRequestDto,
} from '../dto/test-case.dto';
import { ProjectStructureService } from '../../application/services/project-structure.service';
import {
  ProjectStructureResponseDto,
  SectionResponseDto,
  SuiteResponseDto,
} from '../dto/test-case-response.dto';

@Controller('projects/:projectSlug/structure')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ProjectStructureController {
  constructor(
    @Inject(ProjectStructureService) private readonly structure: ProjectStructureService,
  ) {}

  @Get()
  @RequireApiTokenScopes('projects:read')
  @ApiOkResponse({ type: ProjectStructureResponseDto })
  get(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
  ): Promise<ProjectStructureResponse> {
    return this.structure.get(principal.organizationId, params.projectSlug);
  }

  @Post('suites')
  @RequireApiTokenScopes('structure:write')
  @ApiCreatedResponse({ type: SuiteResponseDto })
  createSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: TestCaseListParamsDto,
    @Body() request: CreateSuiteRequestDto,
    @Headers() headers: ProjectStructureWriteHeadersDto,
  ): Promise<SuiteResponse> {
    // Nest does not run validation pipes on @Headers parameters.
    const parsedHeaders = validate(headers, ProjectStructureWriteHeadersDto);
    return this.structure.createSuite(
      principal,
      params.projectSlug,
      request,
      parsedHeaders['idempotency-key'],
    );
  }

  @Put('suites/:suiteId')
  @ApiOkResponse({ type: SuiteResponseDto })
  updateSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SuiteParamsDto,
    @Body() request: UpdateSuiteRequestDto,
  ): Promise<SuiteResponse> {
    return this.structure.updateSuite(principal, params.projectSlug, params.suiteId, request);
  }

  @Put('suites/:suiteId/move')
  @ApiOkResponse({ type: SuiteResponseDto })
  moveSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SuiteParamsDto,
    @Body() request: MoveSuiteRequestDto,
  ): Promise<SuiteResponse> {
    return this.structure.moveSuite(principal, params.projectSlug, params.suiteId, request);
  }

  @Delete('suites/:suiteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deleteSuite(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SuiteParamsDto,
  ): Promise<void> {
    return this.structure.deleteSuite(principal, params.projectSlug, params.suiteId);
  }

  @Post('suites/:suiteId/sections')
  @RequireApiTokenScopes('structure:write')
  @ApiCreatedResponse({ type: SectionResponseDto })
  createSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CreateSectionParamsDto,
    @Body() request: CreateSectionRequestDto,
    @Headers() headers: ProjectStructureWriteHeadersDto,
  ): Promise<SectionResponse> {
    const parsedHeaders = validate(headers, ProjectStructureWriteHeadersDto);
    return this.structure.createSection(
      principal,
      params.projectSlug,
      params.suiteId,
      request,
      parsedHeaders['idempotency-key'],
    );
  }

  @Put('sections/:sectionId')
  @ApiOkResponse({ type: SectionResponseDto })
  updateSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SectionParamsDto,
    @Body() request: UpdateSectionRequestDto,
  ): Promise<SectionResponse> {
    return this.structure.updateSection(principal, params.projectSlug, params.sectionId, request);
  }

  @Put('sections/:sectionId/move')
  @ApiOkResponse({ type: SectionResponseDto })
  moveSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SectionParamsDto,
    @Body() request: MoveSectionRequestDto,
  ): Promise<SectionResponse> {
    return this.structure.moveSection(principal, params.projectSlug, params.sectionId, request);
  }

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deleteSection(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: SectionParamsDto,
  ): Promise<void> {
    return this.structure.deleteSection(principal, params.projectSlug, params.sectionId);
  }
}
