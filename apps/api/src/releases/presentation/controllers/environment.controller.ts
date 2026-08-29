import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateEnvironmentResponse,
  EnvironmentLifecycleResponse,
  EnvironmentListResponse,
  OrganizationAccessPrincipal,
  UpdateEnvironmentResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { EnvironmentService } from '../../application/services/environment.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateEnvironmentHeadersDto,
  CreateEnvironmentRequestDto,
  EnvironmentParamsDto,
  ReleaseProjectParamsDto,
  UpdateEnvironmentRequestDto,
} from '../dto/release.dto';
import {
  CreateEnvironmentResponseDto,
  EnvironmentLifecycleResponseDto,
  EnvironmentListResponseDto,
  UpdateEnvironmentResponseDto,
} from '../dto/release-response.dto';

@Controller('projects/:projectSlug/environments')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class EnvironmentController {
  constructor(@Inject(EnvironmentService) private readonly environments: EnvironmentService) {}

  @Get()
  @ApiOkResponse({ type: EnvironmentListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseProjectParamsDto,
  ): Promise<EnvironmentListResponse> {
    return this.environments.list(principal.organizationId, params.projectSlug);
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CreateEnvironmentResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseProjectParamsDto,
    @Headers() headers: CreateEnvironmentHeadersDto,
    @Body() request: CreateEnvironmentRequestDto,
  ): Promise<CreateEnvironmentResponse> {
    return this.environments.create(
      principal,
      params.projectSlug,
      headers['idempotency-key'],
      request,
    );
  }

  @Patch(':environmentId')
  @RequireOrganizationAccess('lead')
  @ApiOkResponse({ type: UpdateEnvironmentResponseDto })
  update(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: EnvironmentParamsDto,
    @Body() request: UpdateEnvironmentRequestDto,
  ): Promise<UpdateEnvironmentResponse> {
    return this.environments.update(principal, params.projectSlug, params.environmentId, request);
  }

  @Post(':environmentId/archive')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: EnvironmentLifecycleResponseDto })
  archive(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: EnvironmentParamsDto,
  ): Promise<EnvironmentLifecycleResponse> {
    return this.environments.archive(principal, params.projectSlug, params.environmentId);
  }

  @Post(':environmentId/restore')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: EnvironmentLifecycleResponseDto })
  restore(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: EnvironmentParamsDto,
  ): Promise<EnvironmentLifecycleResponse> {
    return this.environments.restore(principal, params.projectSlug, params.environmentId);
  }
}
