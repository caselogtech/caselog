import { Body, Controller, Get, Headers, Inject, Param, Put, UseGuards } from '@nestjs/common';
import type {
  CandidatePolicyAssignmentResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { CandidatePolicyAssignmentService } from '../../application/services/candidate-policy-assignment.service';
import { CandidatePolicyAssignmentResponseDto } from '../dto/candidate-policy-assignment-response.dto';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  AssignCandidatePolicyRequestDto,
  CandidatePolicyWriteHeadersDto,
  CandidateReadinessParamsDto,
} from '../dto/candidate-policy-assignment.dto';

@Controller('projects/:projectSlug/candidates/:candidateId/readiness-policy')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class CandidatePolicyAssignmentController {
  constructor(
    @Inject(CandidatePolicyAssignmentService)
    private readonly assignments: CandidatePolicyAssignmentService,
  ) {}

  @Put()
  @RequireOrganizationAccess('lead')
  @ApiOkResponse({ type: CandidatePolicyAssignmentResponseDto })
  assign(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReadinessParamsDto,
    @Headers() headers: CandidatePolicyWriteHeadersDto,
    @Body() request: AssignCandidatePolicyRequestDto,
  ): Promise<CandidatePolicyAssignmentResponse> {
    return this.assignments.assign(
      principal,
      params.projectSlug,
      params.candidateId,
      headers['idempotency-key'],
      request,
    );
  }

  @Get()
  @ApiOkResponse({ type: CandidatePolicyAssignmentResponseDto })
  current(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReadinessParamsDto,
  ): Promise<CandidatePolicyAssignmentResponse> {
    return this.assignments.current(principal, params.projectSlug, params.candidateId);
  }
}
