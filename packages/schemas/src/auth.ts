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
  termsAccepted: z.literal(true),
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

export const organizationAccessPrincipalSchema = sessionPrincipalSchema.extend({
  tokenType: z.literal('organization'),
  organizationId: z.uuid(),
  membershipId: z.uuid(),
  role: z.enum(['owner', 'admin', 'lead', 'tester', 'contributor', 'read_only']),
});

export const organizationTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: organizationSlugSchema,
  }),
  role: organizationAccessPrincipalSchema.shape.role,
});

export const organizationSlugParamSchema = z.object({
  slug: organizationSlugSchema,
});

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
export type OrganizationTokenResponse = z.infer<typeof organizationTokenResponseSchema>;
export type OrganizationSlugParam = z.infer<typeof organizationSlugParamSchema>;
export type EmailVerificationRequest = z.infer<typeof emailVerificationRequestSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type MessageResponse = z.infer<typeof messageResponseSchema>;
export type EmailVerificationResponse = z.infer<typeof emailVerificationResponseSchema>;
