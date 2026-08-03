import { describe, expect, it } from 'vitest';
import { createApiToken, hashApiToken, isApiToken } from './api-token';

describe('API token generation', () => {
  it('creates a prefixed opaque token and stores only its SHA-256 hash', () => {
    const generated = createApiToken();

    expect(isApiToken(generated.token)).toBe(true);
    expect(generated.token).toMatch(new RegExp(`^${generated.tokenPrefix}_`));
    expect(generated.tokenHash).toBe(hashApiToken(generated.token));
    expect(generated.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.tokenHash).not.toContain(generated.token);
  });

  it('rejects malformed API token values', () => {
    expect(isApiToken('clg_short_secret')).toBe(false);
    expect(isApiToken('not-a-caselog-token')).toBe(false);
  });
});
