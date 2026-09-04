import { z } from 'zod';
import { emailSchema } from './auth.js';
import { instanceCapabilitiesSchema } from './instance.js';

export const staffOperatorRoleSchema = z.enum(['owner', 'admin', 'support']);

export const staffOperatorSchema = z.object({
  userId: z.uuid(),
  email: emailSchema,
  displayName: z.string().min(1).max(120),
  role: staffOperatorRoleSchema,
  accessExpiresAt: z.iso.datetime(),
  disabledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const staffSessionResponseSchema = z.object({
  operator: staffOperatorSchema.omit({ disabledAt: true, createdAt: true }),
});

export const staffOverviewResponseSchema = z.object({
  metrics: z.object({
    users: z.number().int().nonnegative(),
    activeWorkspaces: z.number().int().nonnegative(),
    deletedWorkspaces: z.number().int().nonnegative(),
    billingAccounts: z.number().int().nonnegative(),
    activeProjects: z.number().int().nonnegative(),
    storageBytes: z.string().regex(/^\d+$/),
  }),
  configuration: instanceCapabilitiesSchema,
});

export const staffListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().min(2).max(100).optional(),
});

export const staffUserSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  displayName: z.string().min(1).max(120),
  emailVerified: z.boolean(),
  activeWorkspaceCount: z.number().int().nonnegative(),
  billingAccountCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export const staffUserListResponseSchema = z.object({
  users: z.array(staffUserSchema),
  nextCursor: z.uuid().nullable(),
});

export const staffWorkspaceSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(30),
  billingAccount: z.object({ id: z.uuid(), name: z.string().min(1).max(120) }).nullable(),
  memberCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
  storageBytes: z.string().regex(/^\d+$/),
  createdAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export const staffWorkspaceListResponseSchema = z.object({
  workspaces: z.array(staffWorkspaceSchema),
  nextCursor: z.uuid().nullable(),
});

export const staffBillingAccountSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  ownerEmail: emailSchema,
  memberCount: z.number().int().nonnegative(),
  workspaceCount: z.number().int().nonnegative(),
  storageBytes: z.string().regex(/^\d+$/),
  createdAt: z.iso.datetime(),
});

export const staffBillingAccountListResponseSchema = z.object({
  billingAccounts: z.array(staffBillingAccountSchema),
  nextCursor: z.uuid().nullable(),
});

export const staffOperatorListResponseSchema = z.object({
  operators: z.array(staffOperatorSchema),
  nextCursor: z.uuid().nullable(),
});

const staffAccessExpirySchema = z.iso.datetime();
const staffReasonSchema = z.string().trim().min(10).max(500);

export const grantStaffOperatorRequestSchema = z.object({
  email: emailSchema,
  role: staffOperatorRoleSchema,
  accessExpiresAt: staffAccessExpirySchema,
  reason: staffReasonSchema,
});

export const revokeStaffOperatorRequestSchema = z.object({ reason: staffReasonSchema });
export const staffOperatorParamsSchema = z.object({ userId: z.uuid() });

export const staffOperatorResponseSchema = z.object({ operator: staffOperatorSchema });

export const staffAuditLogSchema = z.object({
  id: z.uuid(),
  actor: z.object({
    userId: z.uuid(),
    email: emailSchema,
    displayName: z.string().min(1).max(120),
  }),
  action: z.string().min(1).max(100),
  targetType: z.string().min(1).max(80),
  targetId: z.string().max(200).nullable(),
  reason: z.string().max(500).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const staffAuditLogListResponseSchema = z.object({
  auditLogs: z.array(staffAuditLogSchema),
  nextCursor: z.uuid().nullable(),
});

export type StaffOperatorRole = z.infer<typeof staffOperatorRoleSchema>;
export type StaffOperator = z.infer<typeof staffOperatorSchema>;
export type StaffSessionResponse = z.infer<typeof staffSessionResponseSchema>;
export type StaffOverviewResponse = z.infer<typeof staffOverviewResponseSchema>;
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;
export type StaffUser = z.infer<typeof staffUserSchema>;
export type StaffUserListResponse = z.infer<typeof staffUserListResponseSchema>;
export type StaffWorkspace = z.infer<typeof staffWorkspaceSchema>;
export type StaffWorkspaceListResponse = z.infer<typeof staffWorkspaceListResponseSchema>;
export type StaffBillingAccount = z.infer<typeof staffBillingAccountSchema>;
export type StaffBillingAccountListResponse = z.infer<typeof staffBillingAccountListResponseSchema>;
export type StaffOperatorListResponse = z.infer<typeof staffOperatorListResponseSchema>;
export type GrantStaffOperatorRequest = z.infer<typeof grantStaffOperatorRequestSchema>;
export type RevokeStaffOperatorRequest = z.infer<typeof revokeStaffOperatorRequestSchema>;
export type StaffOperatorParams = z.infer<typeof staffOperatorParamsSchema>;
export type StaffOperatorResponse = z.infer<typeof staffOperatorResponseSchema>;
export type StaffAuditLog = z.infer<typeof staffAuditLogSchema>;
export type StaffAuditLogListResponse = z.infer<typeof staffAuditLogListResponseSchema>;
