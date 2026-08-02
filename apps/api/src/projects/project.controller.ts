import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { OrganizationAccessPrincipal, ProjectListResponse } from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import { ProjectListQueryDto } from './project.dto';
import { ProjectService } from './project.service';

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
}
