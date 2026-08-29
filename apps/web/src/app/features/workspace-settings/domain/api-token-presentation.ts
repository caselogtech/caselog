import type { ApiTokenScope } from '@caselog/schemas';

const MAX_API_TOKEN_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;
const DEFAULT_API_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1_000;

export const API_TOKEN_SCOPES: readonly ApiTokenScope[] = [
  'runs:read',
  'results:write',
  'evidence:write',
];

const SCOPE_LABEL_KEYS: Record<ApiTokenScope, string> = {
  'runs:read': 'workspaceSettings.tokens.scopes.runsRead',
  'results:write': 'workspaceSettings.tokens.scopes.resultsWrite',
  'evidence:write': 'workspaceSettings.tokens.scopes.evidenceWrite',
};

export function apiTokenScopeLabelKey(scope: ApiTokenScope): string {
  return SCOPE_LABEL_KEYS[scope];
}

export function apiTokenExpiryIso(value: string, now = Date.now()): string | null {
  const expiresAt = new Date(value);
  const lifetime = expiresAt.getTime() - now;
  return Number.isFinite(lifetime) && lifetime > 0 && lifetime <= MAX_API_TOKEN_LIFETIME_MS
    ? expiresAt.toISOString()
    : null;
}

export function defaultApiTokenExpiry(now = new Date()): string {
  return localDateTimeValue(new Date(now.getTime() + DEFAULT_API_TOKEN_LIFETIME_MS));
}

export function maximumApiTokenExpiry(now = new Date()): string {
  return localDateTimeValue(new Date(now.getTime() + MAX_API_TOKEN_LIFETIME_MS));
}

export function minimumApiTokenExpiry(now = new Date()): string {
  return localDateTimeValue(new Date(now.getTime() + 60_000));
}

export function apiTokenExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}

function localDateTimeValue(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
