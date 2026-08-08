import { auditLogListQuerySchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class AuditLogListQueryDto extends createZodDto(auditLogListQuerySchema) {}
