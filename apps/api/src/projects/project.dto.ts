import { projectListQuerySchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ProjectListQueryDto extends createZodDto(projectListQuerySchema) {}
