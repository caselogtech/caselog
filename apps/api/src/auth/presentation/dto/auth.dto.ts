import {
  createWorkspaceRequestSchema,
  emailVerificationRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  organizationSlugParamSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  workspaceSlugAvailabilityQuerySchema,
  workspaceListQuerySchema,
  workspaceIdParamsSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class RegisterRequestDto extends createZodDto(registerRequestSchema) {}

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class OrganizationSlugParamDto extends createZodDto(organizationSlugParamSchema) {}

export class EmailVerificationRequestDto extends createZodDto(emailVerificationRequestSchema) {}

export class ForgotPasswordRequestDto extends createZodDto(forgotPasswordRequestSchema) {}

export class ResetPasswordRequestDto extends createZodDto(resetPasswordRequestSchema) {}

export class CreateWorkspaceRequestDto extends createZodDto(createWorkspaceRequestSchema) {}

export class WorkspaceSlugAvailabilityQueryDto extends createZodDto(
  workspaceSlugAvailabilityQuerySchema,
) {}

export class WorkspaceListQueryDto extends createZodDto(workspaceListQuerySchema) {}

export class WorkspaceIdParamsDto extends createZodDto(workspaceIdParamsSchema) {}
