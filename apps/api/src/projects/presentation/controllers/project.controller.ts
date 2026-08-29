import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateProjectResponse,
  OrganizationAccessPrincipal,
  ProjectLifecycleResponse,
  ProjectListResponse,
  ProjectResponse,
} from '@caselog/schemas';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateProjectRequestDto,
  ProjectListQueryDto,
  ProjectParamsDto,
  UpdateProjectRequestDto,
} from '../dto/project.dto';
import { ProjectService } from '../../application/services/project.service';
import {
  CreateProjectResponseDto,
  ProjectLifecycleResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
} from '../dto/project-response.dto';

@Controller('projects')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ProjectController {
  constructor(@Inject(ProjectService) private readonly projects: ProjectService) {}

  @Get()
  @ApiOkResponse({ type: ProjectListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectListResponse> {
    return this.projects.list(principal.organizationId, query);
  }

  @Get(':projectSlug')
  @RequireOrganizationAccess('read')
  @ApiOkResponse({ type: ProjectResponseDto })
  get(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
  ): Promise<ProjectResponse> {
    return this.projects.get(principal, params.projectSlug);
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CreateProjectResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: CreateProjectRequestDto,
  ): Promise<CreateProjectResponse> {
    return this.projects.create(principal, request);
  }

  @Patch(':projectSlug')
  @RequireOrganizationAccess('lead')
  @ApiOkResponse({ type: ProjectResponseDto })
  update(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
    @Body() request: UpdateProjectRequestDto,
  ): Promise<ProjectResponse> {
    return this.projects.update(principal, params.projectSlug, request);
  }

  @Delete(':projectSlug')
  @RequireOrganizationAccess('lead')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
  ): Promise<void> {
    return this.projects.archive(principal, params.projectSlug);
  }

  @Post(':projectSlug/restore')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ProjectLifecycleResponseDto })
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
  ): Promise<ProjectLifecycleResponse> {
    return this.projects.restore(principal, params.projectSlug);
  }
}
