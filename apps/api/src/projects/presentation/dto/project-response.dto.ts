import {
  createProjectResponseSchema,
  projectLifecycleResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class ProjectListResponseDto extends createZodDto(projectListResponseSchema) {}
export class CreateProjectResponseDto extends createZodDto(createProjectResponseSchema) {}
export class ProjectResponseDto extends createZodDto(projectResponseSchema) {}
export class ProjectLifecycleResponseDto extends createZodDto(projectLifecycleResponseSchema) {}
