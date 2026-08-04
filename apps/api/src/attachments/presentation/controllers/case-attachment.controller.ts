import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type {
  AttachmentDownloadResponse,
  CaseAttachmentListResponse,
  CaseAttachmentResponse,
  CreateUploadSessionResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { CurrentOrganization, OrganizationAuthGuard } from '../../../auth/public-api';
import { CaseAttachmentService } from '../../application/services/case-attachment.service';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  CaseAttachmentItemParamsDto,
  CaseAttachmentListQueryDto,
  CaseAttachmentParamsDto,
  CompleteCaseAttachmentRequestDto,
  CreateCaseAttachmentUploadSessionRequestDto,
} from '../dto/attachment.dto';

@Controller('projects/:projectSlug/cases/:caseId/versions/:versionId')
@UseGuards(OrganizationAuthGuard)
export class CaseAttachmentController {
  constructor(@Inject(CaseAttachmentService) private readonly attachments: CaseAttachmentService) {}

  @Post('uploads')
  createUploadSession(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseAttachmentParamsDto,
    @Body() request: CreateCaseAttachmentUploadSessionRequestDto,
  ): Promise<CreateUploadSessionResponse> {
    return this.attachments.createUploadSession(
      principal,
      params.projectSlug,
      params.caseId,
      params.versionId,
      request,
    );
  }

  @Post('attachments')
  complete(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseAttachmentParamsDto,
    @Body() request: CompleteCaseAttachmentRequestDto,
  ): Promise<CaseAttachmentResponse> {
    return this.attachments.complete(
      principal,
      params.projectSlug,
      params.caseId,
      params.versionId,
      request,
    );
  }

  @Get('attachments')
  list(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseAttachmentParamsDto,
    @Query() query: CaseAttachmentListQueryDto,
  ): Promise<CaseAttachmentListResponse> {
    return this.attachments.list(
      principal.organizationId,
      params.projectSlug,
      params.caseId,
      params.versionId,
      query,
    );
  }

  @Post('attachments/:attachmentId/download')
  createDownload(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CaseAttachmentItemParamsDto,
  ): Promise<AttachmentDownloadResponse> {
    return this.attachments.createDownload(
      principal.organizationId,
      params.projectSlug,
      params.caseId,
      params.versionId,
      params.attachmentId,
    );
  }
}
