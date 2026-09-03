import {
  billingAccountListResponseSchema,
  createBillingAccountResponseSchema,
  createBillingAccountWorkspaceResponseSchema,
} from '@caselog/schemas';
import { createZodDto } from 'nestjs-zod';

export class BillingAccountListResponseDto extends createZodDto(billingAccountListResponseSchema) {}
export class CreateBillingAccountResponseDto extends createZodDto(
  createBillingAccountResponseSchema,
) {}
export class CreateBillingAccountWorkspaceResponseDto extends createZodDto(
  createBillingAccountWorkspaceResponseSchema,
) {}
