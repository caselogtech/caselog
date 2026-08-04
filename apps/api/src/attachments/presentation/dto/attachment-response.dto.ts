import {
  attachmentDownloadResponseSchema,
  caseAttachmentListResponseSchema,
  caseAttachmentResponseSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateUploadSessionResponseDto extends createZodDto(
  createUploadSessionResponseSchema,
) {}
export class AttachmentDownloadResponseDto extends createZodDto(attachmentDownloadResponseSchema) {}
export class CaseAttachmentResponseDto extends createZodDto(caseAttachmentResponseSchema) {}
export class CaseAttachmentListResponseDto extends createZodDto(caseAttachmentListResponseSchema) {}
