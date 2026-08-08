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
  OrganizationAccessPrincipal,
  WorkspaceMemberListResponse,
  WorkspaceMemberResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { MemberService } from '../../application/services/member.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  UpdateWorkspaceMemberRoleRequestDto,
  WorkspaceMemberListQueryDto,
  WorkspaceMemberParamsDto,
} from '../dto/member.dto';
import {
  WorkspaceMemberListResponseDto,
  WorkspaceMemberResponseDto,
} from '../dto/member-response.dto';

@Controller('members')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class MemberController {
  constructor(@Inject(MemberService) private readonly members: MemberService) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceMemberListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Query() query: WorkspaceMemberListQueryDto,
  ): Promise<WorkspaceMemberListResponse> {
    return this.members.list(principal, query);
  }

  @Patch(':membershipId')
  @RequireOrganizationAccess('admin')
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  updateRole(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceMemberParamsDto,
    @Body() request: UpdateWorkspaceMemberRoleRequestDto,
  ): Promise<WorkspaceMemberResponse> {
    return this.members.updateRole(principal, params.membershipId, request.role);
  }

  @Delete(':membershipId')
  @RequireOrganizationAccess('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deactivate(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceMemberParamsDto,
  ): Promise<void> {
    return this.members.deactivate(principal, params.membershipId);
  }

  @Post(':membershipId/activate')
  @RequireOrganizationAccess('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  activate(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceMemberParamsDto,
  ): Promise<WorkspaceMemberResponse> {
    return this.members.activate(principal, params.membershipId);
  }

  @Post(':membershipId/transfer-ownership')
  @RequireOrganizationAccess('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: WorkspaceMemberResponseDto })
  transferOwnership(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: WorkspaceMemberParamsDto,
  ): Promise<WorkspaceMemberResponse> {
    return this.members.transferOwnership(principal, params.membershipId);
  }
}
