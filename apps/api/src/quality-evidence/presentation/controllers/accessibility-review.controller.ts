import type { OrganizationAccessPrincipal } from '@caselog/schemas';
import { Body, Controller, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
import { AccessibilityReviewService } from '../../application/services/accessibility-review.service';
// biome-ignore lint/style/useImportType: Nest requires runtime DTO metadata.
import {
  AccessibilityReviewParamsDto,
  AccessibilityReviewRequestDto,
  CandidateReportItemParamsDto,
  CandidateReportResponseDto,
  CandidateReportUploadRequestDto,
  CompleteReportRequestDto,
  ReportDownloadResponseDto,
  ReportUploadResponseDto,
} from '../dto/accessibility-review.dto';
// biome-ignore lint/style/useImportType: Nest requires runtime DTO metadata.
import { EvidenceIngestHeadersDto } from '../dto/evidence.dto';
import { EvidenceIngestResponseDto } from '../dto/evidence-response.dto';

@Controller('projects/:projectSlug/candidates/:candidateId/accessibility-reviews')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class AccessibilityReviewController {
  constructor(
    @Inject(AccessibilityReviewService) private readonly reviews: AccessibilityReviewService,
  ) {}
  @Post()
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: EvidenceIngestResponseDto })
  record(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: AccessibilityReviewParamsDto,
    @Headers() headers: EvidenceIngestHeadersDto,
    @Body() request: AccessibilityReviewRequestDto,
  ) {
    return this.reviews.record(
      principal,
      params.projectSlug,
      params.candidateId,
      headers['idempotency-key'],
      request,
    );
  }
  @Post('reports/uploads')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: ReportUploadResponseDto })
  upload(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: AccessibilityReviewParamsDto,
    @Body() request: CandidateReportUploadRequestDto,
  ) {
    return this.reviews.createUpload(principal, params.projectSlug, params.candidateId, request);
  }
  @Post('reports')
  @RequireOrganizationAccess('lead')
  @ApiCreatedResponse({ type: CandidateReportResponseDto })
  complete(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: AccessibilityReviewParamsDto,
    @Body() request: CompleteReportRequestDto,
  ) {
    return this.reviews.completeUpload(
      principal,
      params.projectSlug,
      params.candidateId,
      request.uploadId,
    );
  }
  @Post('reports/:reportId/download')
  @ApiCreatedResponse({ type: ReportDownloadResponseDto })
  download(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CandidateReportItemParamsDto,
  ) {
    return this.reviews.download(
      principal,
      params.projectSlug,
      params.candidateId,
      params.reportId,
    );
  }
}
