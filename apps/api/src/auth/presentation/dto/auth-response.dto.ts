import {
  apiTokenListResponseSchema,
  authUserSchema,
  createApiTokenResponseSchema,
  createWorkspaceResponseSchema,
  emailVerificationResponseSchema,
  messageResponseSchema,
  organizationTokenResponseSchema,
  sessionResponseSchema,
  workspaceListResponseSchema,
  workspaceSlugAvailabilityResponseSchema,
  workspaceSettingsResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class SessionResponseDto extends createZodDto(sessionResponseSchema) {}
export class AuthUserResponseDto extends createZodDto(authUserSchema) {}
export class MessageResponseDto extends createZodDto(messageResponseSchema) {}
export class EmailVerificationResponseDto extends createZodDto(emailVerificationResponseSchema) {}
export class OrganizationTokenResponseDto extends createZodDto(organizationTokenResponseSchema) {}
export class WorkspaceListResponseDto extends createZodDto(workspaceListResponseSchema) {}
export class WorkspaceSlugAvailabilityResponseDto extends createZodDto(
  workspaceSlugAvailabilityResponseSchema,
) {}
export class WorkspaceSettingsResponseDto extends createZodDto(workspaceSettingsResponseSchema) {}
export class CreateWorkspaceResponseDto extends createZodDto(createWorkspaceResponseSchema) {}
export class ApiTokenListResponseDto extends createZodDto(apiTokenListResponseSchema) {}
export class CreateApiTokenResponseDto extends createZodDto(createApiTokenResponseSchema) {}
