import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  CandidateTestRunListResponse,
  CandidateTestRunResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { ReleaseCandidateService } from '../../application/services/release-candidate.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CandidateTestRunParamsDto,
  LinkCandidateTestRunRequestDto,
  ReleaseCandidateParamsDto,
} from '../dto/release.dto';
import {
  CandidateTestRunListResponseDto,
  CandidateTestRunResponseDto,
} from '../dto/release-response.dto';

@Controller('projects/:projectSlug/candidates/:candidateId/test-runs')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class CandidateTestRunController {
  constructor(
    @Inject(ReleaseCandidateService) private readonly candidates: ReleaseCandidateService,
  ) {}

  @Get()
  @ApiOkResponse({ type: CandidateTestRunListResponseDto })
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReleaseCandidateParamsDto,
  ): Promise<CandidateTestRunListResponse> {
    return this.candidates.listLinks(
      principal.organizationId,
      params.projectSlug,
      params.candidateId,
    );
  }

  @Put(':runId')
  @RequireOrganizationAccess('lead')
  @ApiOkResponse({ type: CandidateTestRunResponseDto })
  link(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateTestRunParamsDto,
    @Body() request: LinkCandidateTestRunRequestDto,
  ): Promise<CandidateTestRunResponse> {
    return this.candidates.link(
      principal,
      params.projectSlug,
      params.candidateId,
      params.runId,
      request,
    );
  }

  @Delete(':runId')
  @RequireOrganizationAccess('lead')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unlink(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateTestRunParamsDto,
  ): Promise<void> {
    return this.candidates.unlink(principal, params.projectSlug, params.candidateId, params.runId);
  }
}
