import {
  emailVerificationRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  organizationSlugParamSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class RegisterRequestDto extends createZodDto(registerRequestSchema) {}

export class LoginRequestDto extends createZodDto(loginRequestSchema) {}

export class OrganizationSlugParamDto extends createZodDto(organizationSlugParamSchema) {}

export class EmailVerificationRequestDto extends createZodDto(emailVerificationRequestSchema) {}

export class ForgotPasswordRequestDto extends createZodDto(forgotPasswordRequestSchema) {}

export class ResetPasswordRequestDto extends createZodDto(resetPasswordRequestSchema) {}
