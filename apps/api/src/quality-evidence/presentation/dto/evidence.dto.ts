import {
  evidenceIngestHeadersSchema,
  evidenceIngestRequestSchema,
  evidenceListQuerySchema,
  evidenceProjectParamsSchema,
} from '@caselog/schemas/evidence';
import { createZodDto } from 'nestjs-zod';

export class EvidenceProjectParamsDto extends createZodDto(evidenceProjectParamsSchema) {}
export class EvidenceListQueryDto extends createZodDto(evidenceListQuerySchema) {}
export class EvidenceIngestHeadersDto extends createZodDto(evidenceIngestHeadersSchema) {}
export class EvidenceIngestRequestDto extends createZodDto(evidenceIngestRequestSchema) {}
