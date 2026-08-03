import {
  createProjectRequestSchema,
  projectListQuerySchema,
  projectParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ProjectListQueryDto extends createZodDto(projectListQuerySchema) {}
export class CreateProjectRequestDto extends createZodDto(createProjectRequestSchema) {}
export class ProjectParamsDto extends createZodDto(projectParamsSchema) {}
