import {
  assignCandidatePolicyRequestSchema,
  candidateReadinessParamsSchema,
  readinessDecisionListQuerySchema,
  readinessDecisionParamsSchema,
  readinessPolicyWriteHeadersSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class CandidateReadinessParamsDto extends createZodDto(candidateReadinessParamsSchema) {}
export class ReadinessDecisionParamsDto extends createZodDto(readinessDecisionParamsSchema) {}
export class ReadinessDecisionListQueryDto extends createZodDto(readinessDecisionListQuerySchema) {}
export class AssignCandidatePolicyRequestDto extends createZodDto(
  assignCandidatePolicyRequestSchema,
) {}
export class CandidatePolicyWriteHeadersDto extends createZodDto(
  readinessPolicyWriteHeadersSchema,
) {}
