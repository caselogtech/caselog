import {
  accessibilityReviewParamsSchema,
  accessibilityReviewRequestSchema,
  attachmentDownloadResponseSchema,
  candidateReportResponseSchema,
  completeCaseAttachmentRequestSchema,
  createCandidateReportUploadRequestSchema,
  createUploadSessionResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
export class AccessibilityReviewParamsDto extends createZodDto(accessibilityReviewParamsSchema) {}
export class AccessibilityReviewRequestDto extends createZodDto(accessibilityReviewRequestSchema) {}
export class CandidateReportUploadRequestDto extends createZodDto(
  createCandidateReportUploadRequestSchema,
) {}
export class CandidateReportResponseDto extends createZodDto(candidateReportResponseSchema) {}
export class CandidateReportItemParamsDto extends createZodDto(
  accessibilityReviewParamsSchema.extend({ reportId: z.uuid() }),
) {}
export class CompleteReportRequestDto extends createZodDto(completeCaseAttachmentRequestSchema) {}
export class ReportDownloadResponseDto extends createZodDto(attachmentDownloadResponseSchema) {}
export class ReportUploadResponseDto extends createZodDto(createUploadSessionResponseSchema) {}
