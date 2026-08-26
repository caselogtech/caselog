import { candidatePolicyAssignmentResponseSchema } from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class CandidatePolicyAssignmentResponseDto extends createZodDto(
  candidatePolicyAssignmentResponseSchema,
) {}
