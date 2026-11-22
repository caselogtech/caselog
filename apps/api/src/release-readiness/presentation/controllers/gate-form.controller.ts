import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import { Body, Controller, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { GateFormService } from '../../application/services/gate-form.service';
// biome-ignore lint/style/useImportType: Nest requires runtime DTO metadata.
import {
  GateFormCandidateParamsDto,
  GateFormCompleteRequestDto,
  GateFormDownloadResponseDto,
  GateFormParamsDto,
  GateFormReportParamsDto,
  GateFormReportResponseDto,
  GateFormRequestDto,
  GateFormResponseDto,
  GateFormUploadRequestDto,
  GateFormUploadResponseDto,
} from '../dto/gate-form.dto';
// biome-ignore lint/style/useImportType: Nest requires runtime DTO metadata.
import { ReadinessPolicyWriteHeadersDto } from '../dto/readiness-policy.dto';

@Controller('projects/:projectSlug/candidates/:candidateId/gate-forms')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class GateFormController {
  constructor(@Inject(GateFormService) private readonly forms: GateFormService) {}
  @Post(':gateId/responses')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: GateFormResponseDto })
  record(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: GateFormParamsDto,
    @Headers() headers: ReadinessPolicyWriteHeadersDto,
    @Body() request: GateFormRequestDto,
  ) {
    return this.forms.record(
      principal,
      params.projectSlug,
      params.candidateId,
      params.gateId,
      headers['idempotency-key'],
      request,
    );
  }
  @Post('reports/uploads')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: GateFormUploadResponseDto })
  upload(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: GateFormCandidateParamsDto,
    @Body() request: GateFormUploadRequestDto,
  ) {
    return this.forms.createUpload(principal, params.projectSlug, params.candidateId, request);
  }
  @Post('reports')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: GateFormReportResponseDto })
  complete(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: GateFormCandidateParamsDto,
    @Body() request: GateFormCompleteRequestDto,
  ) {
    return this.forms.completeUpload(
      principal,
      params.projectSlug,
      params.candidateId,
      request.uploadId,
    );
  }
  @Post('reports/:reportId/download')
  @ApiCreatedResponse({ type: GateFormDownloadResponseDto })
  download(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: GateFormReportParamsDto,
  ) {
    return this.forms.download(principal, params.projectSlug, params.candidateId, params.reportId);
  }
}
