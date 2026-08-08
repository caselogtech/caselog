import { z } from 'zod';
import { workspaceRoleSchema } from './auth.js';

export const manageableWorkspaceRoleSchema = z.enum([
  'admin',
  'lead',
  'tester',
  'contributor',
  'read_only',
]);

export const workspaceMemberStateSchema = z.enum(['active', 'inactive']);

export const workspaceMemberSchema = z.object({
  membershipId: z.uuid(),
  user: z.object({
    id: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1).max(120),
  }),
  role: workspaceRoleSchema,
  state: workspaceMemberStateSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workspaceMemberListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  state: z.enum(['active', 'inactive', 'all']).default('active'),
});

export const workspaceMemberListResponseSchema = z.object({
  items: z.array(workspaceMemberSchema),
  nextCursor: z.uuid().nullable(),
});

export const workspaceMemberParamsSchema = z.object({ membershipId: z.uuid() });

export const updateWorkspaceMemberRoleRequestSchema = z.object({
  role: manageableWorkspaceRoleSchema,
});

export const workspaceMemberResponseSchema = z.object({ member: workspaceMemberSchema });

export type ManageableWorkspaceRole = z.infer<typeof manageableWorkspaceRoleSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceMemberListQuery = z.infer<typeof workspaceMemberListQuerySchema>;
export type WorkspaceMemberListResponse = z.infer<typeof workspaceMemberListResponseSchema>;
export type WorkspaceMemberParams = z.infer<typeof workspaceMemberParamsSchema>;
export type UpdateWorkspaceMemberRoleRequest = z.infer<
  typeof updateWorkspaceMemberRoleRequestSchema
>;
export type WorkspaceMemberResponse = z.infer<typeof workspaceMemberResponseSchema>;
