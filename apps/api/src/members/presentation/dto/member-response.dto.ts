import { workspaceMemberListResponseSchema, workspaceMemberResponseSchema } from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class WorkspaceMemberListResponseDto extends createZodDto(
  workspaceMemberListResponseSchema,
) {}
export class WorkspaceMemberResponseDto extends createZodDto(workspaceMemberResponseSchema) {}
