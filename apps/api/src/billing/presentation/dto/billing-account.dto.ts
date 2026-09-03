import {
  billingAccountParamsSchema,
  createBillingAccountHeadersSchema,
  createBillingAccountRequestSchema,
  createBillingAccountWorkspaceHeadersSchema,
  createBillingAccountWorkspaceRequestSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class BillingAccountParamsDto extends createZodDto(billingAccountParamsSchema) {}
export class CreateBillingAccountHeadersDto extends createZodDto(
  createBillingAccountHeadersSchema,
) {}
export class CreateBillingAccountRequestDto extends createZodDto(
  createBillingAccountRequestSchema,
) {}
export class CreateBillingAccountWorkspaceHeadersDto extends createZodDto(
  createBillingAccountWorkspaceHeadersSchema,
) {}
export class CreateBillingAccountWorkspaceRequestDto extends createZodDto(
  createBillingAccountWorkspaceRequestSchema,
) {}
