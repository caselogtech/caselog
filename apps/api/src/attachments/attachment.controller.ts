import { Body, Controller, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AttachmentDownloadResponse,
  CreateUploadSessionResponse,
  OrganizationAccessPrincipal,
} from '@caselog/schemas';
import { OrganizationAuthGuard } from '../auth/organization-auth.guard';
import { CurrentOrganization } from '../auth/organization-principal.decorator';
// biome-ignore lint/style/useImportType: Nest uses DTO classes as runtime validation metadata.
import {
  AttachmentDownloadParamsDto,
  CreateUploadSessionParamsDto,
  CreateUploadSessionRequestDto,
} from './attachment.dto';
import { AttachmentService } from './attachment.service';

@Controller('projects/:projectSlug/runs/:runId/items/:itemId/uploads')
@UseGuards(OrganizationAuthGuard)
export class AttachmentController {
  constructor(@Inject(AttachmentService) private readonly attachments: AttachmentService) {}

  @Post()
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
@UseGuards(OrganizationAuthGuard)
export class AttachmentDownloadController {
  constructor(@Inject(AttachmentService) private readonly attachments: AttachmentService) {}

  @Post()
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
