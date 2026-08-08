import { auditLogListResponseSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class AuditLogListResponseDto extends createZodDto(auditLogListResponseSchema) {}
