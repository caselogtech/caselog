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
  CreateReleaseCandidateResponse,
  OrganizationAccessPrincipal,
  ReleaseCandidateListResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { ReleaseCandidateService } from '../../application/services/release-candidate.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CreateReleaseCandidateHeadersDto,
  CreateReleaseCandidateRequestDto,
  ReleaseCandidateListQueryDto,
  ReleaseParamsDto,
} from '../dto/release.dto';
import {
  CreateReleaseCandidateResponseDto,
  ReleaseCandidateListResponseDto,
} from '../dto/release-response.dto';

@Controller('projects/:projectSlug/releases/:releaseId/candidates')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReleaseCandidateController {
  constructor(
    @Inject(ReleaseCandidateService) private readonly candidates: ReleaseCandidateService,
  ) {}

  @Get()
  @ApiOkResponse({ type: ReleaseCandidateListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
    @Query() query: ReleaseCandidateListQueryDto,
  ): Promise<ReleaseCandidateListResponse> {
    return this.candidates.list(
      principal.organizationId,
      params.projectSlug,
      params.releaseId,
      query,
    );
  }

  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CreateReleaseCandidateResponseDto })
  create(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseParamsDto,
    @Headers() headers: CreateReleaseCandidateHeadersDto,
    @Body() request: CreateReleaseCandidateRequestDto,
  ): Promise<CreateReleaseCandidateResponse> {
    return this.candidates.create(
      principal,
      params.projectSlug,
      params.releaseId,
      headers['idempotency-key'],
      request,
    );
  }
}
