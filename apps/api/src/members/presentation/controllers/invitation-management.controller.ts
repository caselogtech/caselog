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
  CreateWorkspaceInvitationsResponse,
  OrganizationAccessPrincipal,
  WorkspaceInvitationListResponse,
  WorkspaceInvitationResponse,
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
import { InvitationService } from '../../application/services/invitation.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateWorkspaceInvitationsRequestDto,
  WorkspaceInvitationListQueryDto,
  WorkspaceInvitationParamsDto,
} from '../dto/invitation.dto';
import {
  CreateWorkspaceInvitationsResponseDto,
  WorkspaceInvitationListResponseDto,
  WorkspaceInvitationResponseDto,
} from '../dto/invitation-response.dto';

@Controller('members/invitations')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@RequireOrganizationAccess('admin')
@ApiBearerAuth('access-token')
export class InvitationManagementController {
  constructor(@Inject(InvitationService) private readonly invitations: InvitationService) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceInvitationListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Query() query: WorkspaceInvitationListQueryDto,
  ): Promise<WorkspaceInvitationListResponse> {
    return this.invitations.list(principal, query);
  }

  @Post()
  @ApiCreatedResponse({ type: CreateWorkspaceInvitationsResponseDto })
  createMany(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Body() request: CreateWorkspaceInvitationsRequestDto,
  ): Promise<CreateWorkspaceInvitationsResponse> {
    return this.invitations.createMany(principal, request);
  }

  @Post(':invitationId/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: WorkspaceInvitationResponseDto })
  resend(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceInvitationParamsDto,
  ): Promise<WorkspaceInvitationResponse> {
    return this.invitations.resend(principal, params.invitationId);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  revoke(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceInvitationParamsDto,
  ): Promise<void> {
    return this.invitations.revoke(principal, params.invitationId);
  }
}
