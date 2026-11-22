import { evidenceIngestResponseSchema } from '@caselog/schemas/evidence';
import { candidateReadinessParamsSchema } from '@caselog/schemas/readiness';
import {
  attachmentDownloadResponseSchema,
  candidateReportResponseSchema,
  completeCaseAttachmentRequestSchema,
  createCandidateReportUploadRequestSchema,
  createUploadSessionResponseSchema,
  gateFormResponseRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
export class GateFormParamsDto extends createZodDto(
  candidateReadinessParamsSchema.extend({ gateId: z.uuid() }),
) {}
export class GateFormCandidateParamsDto extends createZodDto(candidateReadinessParamsSchema) {}
export class GateFormReportParamsDto extends createZodDto(
  candidateReadinessParamsSchema.extend({ reportId: z.uuid() }),
) {}
export class GateFormRequestDto extends createZodDto(gateFormResponseRequestSchema) {}
export class GateFormResponseDto extends createZodDto(evidenceIngestResponseSchema) {}
export class GateFormUploadRequestDto extends createZodDto(
  createCandidateReportUploadRequestSchema,
) {}
export class GateFormUploadResponseDto extends createZodDto(createUploadSessionResponseSchema) {}
export class GateFormCompleteRequestDto extends createZodDto(completeCaseAttachmentRequestSchema) {}
export class GateFormReportResponseDto extends createZodDto(candidateReportResponseSchema) {}
export class GateFormDownloadResponseDto extends createZodDto(attachmentDownloadResponseSchema) {}
