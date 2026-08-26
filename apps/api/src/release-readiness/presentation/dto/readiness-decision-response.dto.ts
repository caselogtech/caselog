import {
  candidateReadinessResponseSchema,
  readinessDecisionListResponseSchema,
  readinessDecisionResponseSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class CandidateReadinessResponseDto extends createZodDto(candidateReadinessResponseSchema) {}
export class ReadinessDecisionResponseDto extends createZodDto(readinessDecisionResponseSchema) {}
export class ReadinessDecisionListResponseDto extends createZodDto(
  readinessDecisionListResponseSchema,
) {}
