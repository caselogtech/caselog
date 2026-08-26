import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateReleaseResponse,
  OrganizationAccessPrincipal,
  ReleaseDetailResponse,
  ReleaseLifecycleResponse,
  ReleaseListResponse,
  ReleaseState,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { ReleaseService } from '../../application/services/release.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateReleaseHeadersDto,
  CreateReleaseRequestDto,
  ReleaseListQueryDto,
  ReleaseParamsDto,
  ReleaseProjectParamsDto,
} from '../dto/release.dto';
import {
  CreateReleaseResponseDto,
  ReleaseDetailResponseDto,
  ReleaseLifecycleResponseDto,
  ReleaseListResponseDto,
} from '../dto/release-response.dto';

@Controller('projects/:projectSlug/releases')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReleaseController {
  constructor(@Inject(ReleaseService) private readonly releases: ReleaseService) {}

  @Get()
  @ApiOkResponse({ type: ReleaseListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseProjectParamsDto,
    @Query() query: ReleaseListQueryDto,
  ): Promise<ReleaseListResponse> {
    return this.releases.list(principal.organizationId, params.projectSlug, query);
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CreateReleaseResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseProjectParamsDto,
    @Headers() headers: CreateReleaseHeadersDto,
    @Body() request: CreateReleaseRequestDto,
  ): Promise<CreateReleaseResponse> {
    return this.releases.create(principal, params.projectSlug, headers['idempotency-key'], request);
  }

  @Get(':releaseId')
  @ApiOkResponse({ type: ReleaseDetailResponseDto })
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
  ): Promise<ReleaseDetailResponse> {
    return this.releases.detail(principal.organizationId, params.projectSlug, params.releaseId);
  }

  @Post(':releaseId/activate')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReleaseLifecycleResponseDto })
  activate(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
  ): Promise<ReleaseLifecycleResponse> {
    return this.transition(principal, params, 'active');
  }

  @Post(':releaseId/release')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReleaseLifecycleResponseDto })
  release(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
  ): Promise<ReleaseLifecycleResponse> {
    return this.transition(principal, params, 'released');
  }

  @Post(':releaseId/cancel')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReleaseLifecycleResponseDto })
  cancel(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
  ): Promise<ReleaseLifecycleResponse> {
    return this.transition(principal, params, 'cancelled');
  }

  private transition(
    principal: OrganizationAccessPrincipal,
    params: ReleaseParamsDto,
    state: Exclude<ReleaseState, 'draft'>,
  ): Promise<ReleaseLifecycleResponse> {
    return this.releases.transition(principal, params.projectSlug, params.releaseId, state);
  }
}
