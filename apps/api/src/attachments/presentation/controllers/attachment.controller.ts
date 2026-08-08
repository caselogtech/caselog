import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AttachmentDownloadResponse,
  CreateUploadSessionResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { ApiBearerAuth, ApiCreatedResponse } from '@nestjs/swagger';
import {
  CurrentOrganization,
  OrganizationAuthGuard,
  OrganizationRoleGuard,
  RequireOrganizationAccess,
} from '../../../auth/public-api';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  AttachmentDownloadParamsDto,
  CreateUploadSessionParamsDto,
  CreateUploadSessionRequestDto,
} from '../dto/attachment.dto';
import { AttachmentService } from '../../application/services/attachment.service';
import {
  AttachmentDownloadResponseDto,
  CreateUploadSessionResponseDto,
} from '../dto/attachment-response.dto';

@Controller('projects/:projectSlug/runs/:runId/items/:itemId/uploads')
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class AttachmentController {
  constructor(@Inject(AttachmentService) private readonly attachments: AttachmentService) {}

  @Post()
  @ApiCreatedResponse({ type: CreateUploadSessionResponseDto })
  createUploadSession(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: CreateUploadSessionParamsDto,
    @Body() request: CreateUploadSessionRequestDto,
  ): Promise<CreateUploadSessionResponse> {
    return this.attachments.createUploadSession(
      principal,
      params.projectSlug,
      params.runId,
      params.itemId,
      request,
    );
  }
}

@Controller(
  'projects/:projectSlug/runs/:runId/items/:itemId/results/:resultId/attachments/:attachmentId/download',
)
@UseGuards(OrganizationAuthGuard, OrganizationRoleGuard)
@ApiBearerAuth('access-token')
export class AttachmentDownloadController {
  constructor(@Inject(AttachmentService) private readonly attachments: AttachmentService) {}

  @Post()
  @RequireOrganizationAccess('read')
  @ApiCreatedResponse({ type: AttachmentDownloadResponseDto })
  createDownload(
    @CurrentOrganization() principal: OrganizationAccessPrincipal,
    @Param() params: AttachmentDownloadParamsDto,
  ): Promise<AttachmentDownloadResponse> {
    return this.attachments.createResultAttachmentDownload(
      principal.organizationId,
      params.projectSlug,
      params.runId,
      params.itemId,
      params.resultId,
      params.attachmentId,
    );
  }
}
