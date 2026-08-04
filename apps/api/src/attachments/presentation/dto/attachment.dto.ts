import {
  attachmentDownloadParamsSchema,
  caseAttachmentItemParamsSchema,
  caseAttachmentListQuerySchema,
  caseAttachmentParamsSchema,
  completeCaseAttachmentRequestSchema,
  createCaseAttachmentUploadSessionRequestSchema,
  createUploadSessionParamsSchema,
  createUploadSessionRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateUploadSessionParamsDto extends createZodDto(createUploadSessionParamsSchema) {}
export class CreateUploadSessionRequestDto extends createZodDto(createUploadSessionRequestSchema) {}
export class AttachmentDownloadParamsDto extends createZodDto(attachmentDownloadParamsSchema) {}
export class CaseAttachmentParamsDto extends createZodDto(caseAttachmentParamsSchema) {}
export class CaseAttachmentItemParamsDto extends createZodDto(caseAttachmentItemParamsSchema) {}
export class CaseAttachmentListQueryDto extends createZodDto(caseAttachmentListQuerySchema) {}
export class CreateCaseAttachmentUploadSessionRequestDto extends createZodDto(
  createCaseAttachmentUploadSessionRequestSchema,
) {}
export class CompleteCaseAttachmentRequestDto extends createZodDto(
  completeCaseAttachmentRequestSchema,
) {}
