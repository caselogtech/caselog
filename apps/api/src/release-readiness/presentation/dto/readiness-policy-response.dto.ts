import {
  readinessPolicyListResponseSchema,
  readinessPolicyResponseSchema,
} from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessPolicyResponseDto extends createZodDto(readinessPolicyResponseSchema) {}
export class ReadinessPolicyListResponseDto extends createZodDto(
  readinessPolicyListResponseSchema,
) {}
