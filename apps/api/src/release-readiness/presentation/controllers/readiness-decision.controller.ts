import { Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  CandidateReadinessResponse,
  OrganizationAccessPrincipal,
  ReadinessDecisionListResponse,
  ReadinessDecisionResponse,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
  RequireApiTokenScopes,
} from '../../../auth/public-api';
import { ReadinessDecisionService } from '../../application/services/readiness-decision.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CandidateReadinessParamsDto,
  ReadinessDecisionListQueryDto,
  ReadinessDecisionParamsDto,
} from '../dto/candidate-policy-assignment.dto';
import {
  CandidateReadinessResponseDto,
  ReadinessDecisionListResponseDto,
  ReadinessDecisionResponseDto,
} from '../dto/readiness-decision-response.dto';

@Controller('projects/:projectSlug/candidates/:candidateId/readiness')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReadinessDecisionController {
  constructor(
    @Inject(ReadinessDecisionService)
    private readonly decisions: ReadinessDecisionService,
  ) {}

  @Get()
  @RequireApiTokenScopes('readiness:read')
  @ApiOkResponse({ type: CandidateReadinessResponseDto })
  current(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReadinessParamsDto,
  ): Promise<CandidateReadinessResponse> {
    return this.decisions.current(principal, params.projectSlug, params.candidateId);
  }

  @Post('evaluations')
  @RequireApiTokenScopes('readiness:write')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CandidateReadinessResponseDto })
  evaluate(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReadinessParamsDto,
  ): Promise<CandidateReadinessResponse> {
    return this.decisions.evaluate(principal, params.projectSlug, params.candidateId);
  }

  @Get('decisions')
  @RequireApiTokenScopes('readiness:read')
  @ApiOkResponse({ type: ReadinessDecisionListResponseDto })
  history(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReadinessParamsDto,
    @Query() query: ReadinessDecisionListQueryDto,
  ): Promise<ReadinessDecisionListResponse> {
    return this.decisions.history(principal, params.projectSlug, params.candidateId, query);
  }
}

@Controller('projects/:projectSlug/readiness-decisions')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class ReadinessDecisionDetailController {
  constructor(
    @Inject(ReadinessDecisionService)
    private readonly decisions: ReadinessDecisionService,
  ) {}

  @Get(':decisionId')
  @RequireApiTokenScopes('readiness:read')
  @ApiOkResponse({ type: ReadinessDecisionResponseDto })
  detail(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: ReadinessDecisionParamsDto,
  ): Promise<ReadinessDecisionResponse> {
    return this.decisions.detail(principal, params.projectSlug, params.decisionId);
  }
}
