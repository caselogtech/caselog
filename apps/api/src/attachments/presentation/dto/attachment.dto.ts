import {
  attachmentDownloadParamsSchema,
  createUploadSessionParamsSchema,
  createUploadSessionRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateUploadSessionParamsDto extends createZodDto(createUploadSessionParamsSchema) {}
export class CreateUploadSessionRequestDto extends createZodDto(createUploadSessionRequestSchema) {}
export class AttachmentDownloadParamsDto extends createZodDto(attachmentDownloadParamsSchema) {}
