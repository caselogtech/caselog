import { apiTokenParamsSchema, createApiTokenRequestSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateApiTokenRequestDto extends createZodDto(createApiTokenRequestSchema) {}
export class ApiTokenParamsDto extends createZodDto(apiTokenParamsSchema) {}
