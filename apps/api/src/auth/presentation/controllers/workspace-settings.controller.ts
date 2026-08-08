import { Body, Controller, Delete, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import type { OrganizationAccessPrincipal, WorkspaceSettingsResponse } from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { WorkspaceSettingsService } from '../../application/services/workspace-settings.service';
import { CurrentOrganization } from '../decorators/organization-principal.decorator';
import { RequireOrganizationAccess } from '../decorators/organization-access.decorator';
import { OrganizationAuthGuard } from '../guards/organization-auth.guard';
import { OrganizationRoleGuard } from '../guards/organization-role.guard';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  DeleteWorkspaceRequestDto,
  UpdateWorkspaceRequestDto,
} from '../dto/workspace-settings.dto';
import { WorkspaceSettingsResponseDto } from '../dto/auth-response.dto';

@Controller('workspace')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@RequireOrganizationAccess('read')
@ApiBearerAuth('access-token')
export class WorkspaceSettingsController {
  constructor(
    @Inject(WorkspaceSettingsService)
    private readonly workspaceSettings: WorkspaceSettingsService,
  ) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  get(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
  ): Promise<WorkspaceSettingsResponse> {
    return this.workspaceSettings.get(principal);
  }

  @Patch()
  @RequireOrganizationAccess('admin')
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  update(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: UpdateWorkspaceRequestDto,
  ): Promise<WorkspaceSettingsResponse> {
    return this.workspaceSettings.update(principal, request);
  }

  @Delete()
  @RequireOrganizationAccess('admin')
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  delete(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: DeleteWorkspaceRequestDto,
  ): Promise<WorkspaceSettingsResponse> {
    return this.workspaceSettings.delete(principal, request);
  }
}
