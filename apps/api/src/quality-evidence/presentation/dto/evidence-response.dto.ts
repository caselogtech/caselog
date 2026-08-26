import {
  evidenceIngestResponseSchema,
  evidenceListResponseSchema,
} from '@caselog/schemas/evidence';
import { createZodDto } from 'nestjs-zod';

export class EvidenceListResponseDto extends createZodDto(evidenceListResponseSchema) {}
export class EvidenceIngestResponseDto extends createZodDto(evidenceIngestResponseSchema) {}
