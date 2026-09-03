import { z } from 'zod';
import { createWorkspaceRequestSchema, createWorkspaceResponseSchema } from './auth.js';
import { idempotencyHeadersSchema } from './test-run.js';

export const billingAccountRoleSchema = z.enum(['owner', 'admin']);

export const billingAccountSchema = z.object({
  id: z.uuid(),
  name: z.string().min(2).max(120),
  role: billingAccountRoleSchema,
  workspaceCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const billingAccountListResponseSchema = z.object({
  billingAccounts: z.array(billingAccountSchema),
});

export const createBillingAccountRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const createBillingAccountHeadersSchema = idempotencyHeadersSchema;

export const createBillingAccountResponseSchema = z.object({
  billingAccount: billingAccountSchema,
});

export const billingAccountParamsSchema = z.object({
  billingAccountId: z.uuid(),
});

export const createBillingAccountWorkspaceRequestSchema = createWorkspaceRequestSchema;
export const createBillingAccountWorkspaceHeadersSchema = idempotencyHeadersSchema;
export const createBillingAccountWorkspaceResponseSchema = createWorkspaceResponseSchema;

export type BillingAccountRole = z.infer<typeof billingAccountRoleSchema>;
export type BillingAccount = z.infer<typeof billingAccountSchema>;
export type BillingAccountListResponse = z.infer<typeof billingAccountListResponseSchema>;
export type CreateBillingAccountHeaders = z.infer<typeof createBillingAccountHeadersSchema>;
export type CreateBillingAccountRequest = z.infer<typeof createBillingAccountRequestSchema>;
export type CreateBillingAccountResponse = z.infer<typeof createBillingAccountResponseSchema>;
export type BillingAccountParams = z.infer<typeof billingAccountParamsSchema>;
export type CreateBillingAccountWorkspaceHeaders = z.infer<
  typeof createBillingAccountWorkspaceHeadersSchema
>;
export type CreateBillingAccountWorkspaceRequest = z.infer<
  typeof createBillingAccountWorkspaceRequestSchema
>;
export type CreateBillingAccountWorkspaceResponse = z.infer<
  typeof createBillingAccountWorkspaceResponseSchema
>;
