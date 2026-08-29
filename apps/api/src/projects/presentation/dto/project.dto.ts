import {
  createProjectRequestSchema,
  projectListQuerySchema,
  projectParamsSchema,
  updateProjectRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ProjectListQueryDto extends createZodDto(projectListQuerySchema) {}
export class CreateProjectRequestDto extends createZodDto(createProjectRequestSchema) {}
export class UpdateProjectRequestDto extends createZodDto(updateProjectRequestSchema) {}
export class ProjectParamsDto extends createZodDto(projectParamsSchema) {}
