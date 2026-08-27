import { z } from 'zod';
import { emailSchema, organizationSlugSchema, passwordSchema } from './auth.js';
import { manageableWorkspaceRoleSchema } from './member.js';

export const workspaceInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

export const workspaceInvitationSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  role: manageableWorkspaceRoleSchema,
  status: workspaceInvitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  invitedBy: z.object({ id: z.uuid(), displayName: z.string().min(1).max(120) }),
});

const invitationRecipientSchema = z.object({
  email: emailSchema,
  role: manageableWorkspaceRoleSchema,
});

export const createWorkspaceInvitationsRequestSchema = z
  .object({ invitations: z.array(invitationRecipientSchema).min(1).max(50) })
  .refine(
    ({ invitations }) => new Set(invitations.map(({ email }) => email)).size === invitations.length,
    { message: 'Invitation emails must be unique', path: ['invitations'] },
  );

export const workspaceInvitationListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired', 'all']).default('pending'),
});

export const workspaceInvitationListResponseSchema = z.object({
  items: z.array(workspaceInvitationSchema),
  nextCursor: z.uuid().nullable(),
});

export const workspaceInvitationResponseSchema = z.object({
  invitation: workspaceInvitationSchema,
});

export const createWorkspaceInvitationsResponseSchema = z.object({
  invitations: z.array(workspaceInvitationSchema),
});

export const workspaceInvitationParamsSchema = z.object({ invitationId: z.uuid() });

export const invitationTokenSchema = z
  .string()
  .regex(
    /^clgi_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/i,
  );

export const invitationTokenParamsSchema = z.object({ token: invitationTokenSchema });

export const registerInvitationAccountRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
  termsAccepted: z.boolean().default(false),
});

export const workspaceInvitationPreviewSchema = z.object({
  email: emailSchema,
  role: manageableWorkspaceRoleSchema,
  expiresAt: z.iso.datetime(),
  workspace: z.object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
    slug: organizationSlugSchema,
  }),
  invitedBy: z.object({ id: z.uuid(), displayName: z.string().min(1).max(120) }),
});

export const acceptWorkspaceInvitationResponseSchema = z.object({
  workspace: z.object({
    id: z.uuid(),
    name: z.string().min(1).max(120),
    slug: organizationSlugSchema,
  }),
  membershipId: z.uuid(),
  role: manageableWorkspaceRoleSchema,
});

export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type CreateWorkspaceInvitationsRequest = z.infer<
  typeof createWorkspaceInvitationsRequestSchema
>;
export type WorkspaceInvitationListQuery = z.infer<typeof workspaceInvitationListQuerySchema>;
export type WorkspaceInvitationListResponse = z.infer<typeof workspaceInvitationListResponseSchema>;
export type WorkspaceInvitationResponse = z.infer<typeof workspaceInvitationResponseSchema>;
export type CreateWorkspaceInvitationsResponse = z.infer<
  typeof createWorkspaceInvitationsResponseSchema
>;
export type WorkspaceInvitationPreview = z.infer<typeof workspaceInvitationPreviewSchema>;
export type RegisterInvitationAccountRequest = z.infer<
  typeof registerInvitationAccountRequestSchema
>;
export type AcceptWorkspaceInvitationResponse = z.infer<
  typeof acceptWorkspaceInvitationResponseSchema
>;
