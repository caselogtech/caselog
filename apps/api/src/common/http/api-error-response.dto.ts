import { apiErrorSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ApiErrorResponseDto extends createZodDto(apiErrorSchema) {}
