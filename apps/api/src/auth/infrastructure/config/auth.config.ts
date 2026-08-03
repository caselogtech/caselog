import { z } from 'zod';

const positiveInteger = z.coerce.number().int().positive();

const authEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_SESSION_TOKEN_SECRET: z.string().min(32),
  AUTH_ORGANIZATION_TOKEN_SECRET: z.string().min(32),
  AUTH_SESSION_TOKEN_TTL_SECONDS: positiveInteger.default(900),
  AUTH_ORGANIZATION_TOKEN_TTL_SECONDS: positiveInteger.default(300),
  AUTH_REFRESH_TOKEN_TTL_DAYS: positiveInteger.default(30),
  AUTH_EMAIL_VERIFICATION_TTL_HOURS: positiveInteger.default(24),
  AUTH_PASSWORD_RESET_TTL_MINUTES: positiveInteger.default(30),
  WEB_BASE_URL: z.url(),
});

export type AuthConfig = {
  production: boolean;
  sessionTokenSecret: string;
  organizationTokenSecret: string;
  sessionTokenTtlSeconds: number;
  organizationTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  emailVerificationTtlHours: number;
  passwordResetTtlMinutes: number;
  webBaseUrl: string;
};

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function createAuthConfig(): AuthConfig {
  const environment = authEnvironmentSchema.parse(process.env);

  return {
    production: environment.NODE_ENV === 'production',
    sessionTokenSecret: environment.AUTH_SESSION_TOKEN_SECRET,
    organizationTokenSecret: environment.AUTH_ORGANIZATION_TOKEN_SECRET,
    sessionTokenTtlSeconds: environment.AUTH_SESSION_TOKEN_TTL_SECONDS,
    organizationTokenTtlSeconds: environment.AUTH_ORGANIZATION_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: environment.AUTH_REFRESH_TOKEN_TTL_DAYS,
    emailVerificationTtlHours: environment.AUTH_EMAIL_VERIFICATION_TTL_HOURS,
    passwordResetTtlMinutes: environment.AUTH_PASSWORD_RESET_TTL_MINUTES,
    webBaseUrl: environment.WEB_BASE_URL,
  };
}
