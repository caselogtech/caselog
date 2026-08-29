import { describe, expect, it } from 'vitest';
import {
  apiTokenExpired,
  apiTokenExpiryIso,
  apiTokenScopeLabelKey,
  defaultApiTokenExpiry,
} from '../../domain/api-token-presentation';

describe('API token presentation', () => {
  const now = Date.parse('2026-08-29T08:00:00.000Z');

  it('accepts only future expiries within the server limit', () => {
    expect(apiTokenExpiryIso('2026-09-01T08:00:00.000Z', now)).toBe('2026-09-01T08:00:00.000Z');
    expect(apiTokenExpiryIso('2026-08-28T08:00:00.000Z', now)).toBeNull();
    expect(apiTokenExpiryIso('2028-08-29T08:00:00.000Z', now)).toBeNull();
  });

  it('provides a stable local datetime default and expiry state', () => {
    expect(defaultApiTokenExpiry(new Date(now))).toMatch(/^2026-11-27T\d{2}:00$/);
    expect(apiTokenExpired('2026-08-29T07:59:59.000Z', now)).toBe(true);
  });

  it('uses explicit scope labels', () => {
    expect(apiTokenScopeLabelKey('results:write')).toBe(
      'workspaceSettings.tokens.scopes.resultsWrite',
    );
  });
});
