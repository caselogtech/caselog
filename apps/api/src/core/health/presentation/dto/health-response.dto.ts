import { healthResponseSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
