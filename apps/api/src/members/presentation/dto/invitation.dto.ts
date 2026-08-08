import {
  createWorkspaceInvitationsRequestSchema,
  invitationTokenParamsSchema,
  workspaceInvitationListQuerySchema,
  workspaceInvitationParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkspaceInvitationsRequestDto extends createZodDto(
  createWorkspaceInvitationsRequestSchema,
) {}
export class WorkspaceInvitationListQueryDto extends createZodDto(
  workspaceInvitationListQuerySchema,
) {}
export class WorkspaceInvitationParamsDto extends createZodDto(workspaceInvitationParamsSchema) {}
export class InvitationTokenParamsDto extends createZodDto(invitationTokenParamsSchema) {}
