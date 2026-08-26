import { readinessPolicyResponseSchema } from '@caselog/schemas/readiness';
import { createZodDto } from 'nestjs-zod';

export class ReadinessPolicyResponseDto extends createZodDto(readinessPolicyResponseSchema) {}
