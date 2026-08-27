import {
  readinessWaiverListResponseSchema,
  readinessWaiverResponseSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessWaiverResponseDto extends createZodDto(readinessWaiverResponseSchema) {}
export class ReadinessWaiverListResponseDto extends createZodDto(
  readinessWaiverListResponseSchema,
) {}
