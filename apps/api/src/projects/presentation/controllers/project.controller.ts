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
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateProjectResponse,
  OrganizationAccessPrincipal,
  ProjectLifecycleResponse,
  ProjectListResponse,
} from '@caselog/schemas';
import { CurrentOrganization, OrganizationAuthGuard } from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { CreateProjectRequestDto, ProjectListQueryDto, ProjectParamsDto } from '../dto/project.dto';
import { ProjectService } from '../../application/services/project.service';

@Controller('projects')
@UseGuards(OrganizationAuthGuard)
export class ProjectController {
  constructor(@Inject(ProjectService) private readonly projects: ProjectService) {}

  @Get()
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Query() query: ProjectListQueryDto,
  ): Promise<ProjectListResponse> {
    return this.projects.list(principal.organizationId, query);
  }

  @Post()
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: CreateProjectRequestDto,
  ): Promise<CreateProjectResponse> {
    return this.projects.create(principal, request);
  }

  @Delete(':projectSlug')
  @HttpCode(HttpStatus.NO_CONTENT)
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
  ): Promise<void> {
    return this.projects.archive(principal, params.projectSlug);
  }

  @Post(':projectSlug/restore')
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ProjectParamsDto,
  ): Promise<ProjectLifecycleResponse> {
    return this.projects.restore(principal, params.projectSlug);
  }
}
