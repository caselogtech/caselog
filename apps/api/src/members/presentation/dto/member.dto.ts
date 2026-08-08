import {
  updateWorkspaceMemberRoleRequestSchema,
  workspaceMemberListQuerySchema,
  workspaceMemberParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class WorkspaceMemberListQueryDto extends createZodDto(workspaceMemberListQuerySchema) {}
export class WorkspaceMemberParamsDto extends createZodDto(workspaceMemberParamsSchema) {}
export class UpdateWorkspaceMemberRoleRequestDto extends createZodDto(
  updateWorkspaceMemberRoleRequestSchema,
) {}
