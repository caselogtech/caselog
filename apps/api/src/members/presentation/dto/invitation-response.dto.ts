import {
  acceptWorkspaceInvitationResponseSchema,
  createWorkspaceInvitationsResponseSchema,
  workspaceInvitationListResponseSchema,
  workspaceInvitationPreviewSchema,
  workspaceInvitationResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class CreateWorkspaceInvitationsResponseDto extends createZodDto(
  createWorkspaceInvitationsResponseSchema,
) {}
export class WorkspaceInvitationListResponseDto extends createZodDto(
  workspaceInvitationListResponseSchema,
) {}
export class WorkspaceInvitationResponseDto extends createZodDto(
  workspaceInvitationResponseSchema,
) {}
export class WorkspaceInvitationPreviewDto extends createZodDto(workspaceInvitationPreviewSchema) {}
export class AcceptWorkspaceInvitationResponseDto extends createZodDto(
  acceptWorkspaceInvitationResponseSchema,
) {}
