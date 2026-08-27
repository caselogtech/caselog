import { z } from 'zod';

export const RESERVED_ORGANIZATION_SLUGS = [
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'docs',
  'health',
  'help',
  'login',
  'new',
  'settings',
  'share',
  'staff',
  'static',
  'status',
  'support',
  'www',
] as const;

const RESERVED_SLUG_SET = new Set<string>(RESERVED_ORGANIZATION_SLUGS);
const BLOCKED_ORGANIZATION_SLUGS = new Set(['caselog']);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const passwordSchema = z
  .string()
  .min(12, 'Password must contain at least 12 characters')
  .max(128, 'Password must contain at most 128 characters');

export const organizationSlugSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'Slug must contain lowercase letters, numbers, or internal hyphens',
  })
  .refine((slug) => !RESERVED_SLUG_SET.has(slug), { message: 'Slug is reserved' })
  .refine((slug) => !BLOCKED_ORGANIZATION_SLUGS.has(slug), { message: 'Slug is unavailable' });

export const registerRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  termsAccepted: z.boolean().default(false),
});

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().max(128),
});

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  emailVerified: z.boolean(),
});

export const sessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  user: authUserSchema,
});

export const sessionPrincipalSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  tokenType: z.literal('session'),
});

export const organizationSessionPrincipalSchema = sessionPrincipalSchema.extend({
  tokenType: z.literal('organization'),
  organizationId: z.uuid(),
  membershipId: z.uuid(),
  role: z.enum(['owner', 'admin', 'lead', 'tester', 'contributor', 'read_only']),
});

export const apiTokenScopeSchema = z.enum(['results:write', 'runs:read', 'evidence:write']);

export const apiTokenPrincipalSchema = z.object({
  sub: z.uuid(),
  tokenType: z.literal('api_token'),
  apiTokenId: z.uuid(),
  organizationId: z.uuid(),
  membershipId: z.uuid(),
  role: organizationSessionPrincipalSchema.shape.role,
  scopes: z.array(apiTokenScopeSchema),
});

export const organizationAccessPrincipalSchema = z.union([
  organizationSessionPrincipalSchema,
  apiTokenPrincipalSchema,
]);

export const organizationTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: organizationSlugSchema,
  }),
  role: organizationSessionPrincipalSchema.shape.role,
});

export const apiTokenSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  tokenPrefix: z.string().regex(/^clg_[A-Za-z0-9_-]{8}$/),
  scopes: z.array(apiTokenScopeSchema),
  expiresAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.object({ id: z.uuid(), displayName: z.string().min(1).max(120) }),
});

export const createApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z
    .array(apiTokenScopeSchema)
    .min(1)
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: 'API token scopes must be unique',
    }),
  expiresAt: z.iso.datetime(),
});

export const createApiTokenResponseSchema = z.object({
  token: z.string().regex(/^clg_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/),
  apiToken: apiTokenSummarySchema,
});

export const apiTokenListResponseSchema = z.object({ apiTokens: z.array(apiTokenSummarySchema) });
export const apiTokenParamsSchema = z.object({ tokenId: z.uuid() });

export const organizationSlugParamSchema = z.object({
  slug: organizationSlugSchema,
});

export const workspaceSlugCandidateSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);

export const workspaceRoleSchema = z.enum([
  'owner',
  'admin',
  'lead',
  'tester',
  'contributor',
  'read_only',
]);

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: organizationSlugSchema,
  membershipId: z.uuid(),
  role: workspaceRoleSchema,
  deletedAt: z.iso.datetime().nullable(),
  recoverableUntil: z.iso.datetime().nullable(),
});

export const workspaceListQuerySchema = z.object({
  status: z.enum(['active', 'deleted']).default('active'),
});

export const workspaceListResponseSchema = z.object({
  workspaces: z.array(workspaceSummarySchema),
});

export const createWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: organizationSlugSchema,
});

export const createWorkspaceResponseSchema = z.object({
  workspace: workspaceSummarySchema,
  demoProject: z.object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
});

export const workspaceSlugAvailabilityQuerySchema = z.object({
  slug: workspaceSlugCandidateSchema,
});

export const workspaceSlugAvailabilityResponseSchema = z.object({
  available: z.boolean(),
});

export const workspaceSettingsSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  slug: organizationSlugSchema,
  deletedAt: z.iso.datetime().nullable(),
  recoverableUntil: z.iso.datetime().nullable(),
});

export const workspaceSettingsResponseSchema = z.object({ workspace: workspaceSettingsSchema });

export const updateWorkspaceRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: organizationSlugSchema.optional(),
  })
  .refine(({ name, slug }) => name !== undefined || slug !== undefined, {
    message: 'At least one workspace setting must be provided',
  });

export const deleteWorkspaceRequestSchema = z.object({
  confirmation: z.string().min(1).max(120),
});

export const workspaceIdParamsSchema = z.object({ workspaceId: z.uuid() });

const opaqueAccountTokenSchema = z.string().min(32).max(256);

export const emailVerificationRequestSchema = z.object({
  token: opaqueAccountTokenSchema,
});

export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordRequestSchema = z.object({
  token: opaqueAccountTokenSchema,
  password: passwordSchema,
});

export const messageResponseSchema = z.object({
  message: z.string().min(1),
});

export const emailVerificationResponseSchema = z.object({
  verified: z.literal(true),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SessionPrincipal = z.infer<typeof sessionPrincipalSchema>;
export type OrganizationAccessPrincipal = z.infer<typeof organizationAccessPrincipalSchema>;
export type OrganizationSessionPrincipal = z.infer<typeof organizationSessionPrincipalSchema>;
export type ApiTokenPrincipal = z.infer<typeof apiTokenPrincipalSchema>;
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;
export type ApiTokenSummary = z.infer<typeof apiTokenSummarySchema>;
export type CreateApiTokenRequest = z.infer<typeof createApiTokenRequestSchema>;
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
export type ApiTokenListResponse = z.infer<typeof apiTokenListResponseSchema>;
export type ApiTokenParams = z.infer<typeof apiTokenParamsSchema>;
export type OrganizationTokenResponse = z.infer<typeof organizationTokenResponseSchema>;
export type OrganizationSlugParam = z.infer<typeof organizationSlugParamSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type EmailVerificationResponse = z.infer<typeof emailVerificationResponseSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspaceListQuery = z.infer<typeof workspaceListQuerySchema>;
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
export type CreateWorkspaceResponse = z.infer<typeof createWorkspaceResponseSchema>;
export type WorkspaceSlugAvailabilityQuery = z.infer<typeof workspaceSlugAvailabilityQuerySchema>;
export type WorkspaceSlugAvailabilityResponse = z.infer<
  typeof workspaceSlugAvailabilityResponseSchema
>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type WorkspaceSettingsResponse = z.infer<typeof workspaceSettingsResponseSchema>;
export type UpdateWorkspaceRequest = z.infer<typeof updateWorkspaceRequestSchema>;
export type DeleteWorkspaceRequest = z.infer<typeof deleteWorkspaceRequestSchema>;
export type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
