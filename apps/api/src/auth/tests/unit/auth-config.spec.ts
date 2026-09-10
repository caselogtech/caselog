import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthConfig } from '../../infrastructure/config/auth.config';

afterEach(() => vi.unstubAllEnvs());

describe('production authentication configuration', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_BASE_URL', 'https://caselog.example.com');
    vi.stubEnv('AUTH_SESSION_TOKEN_SECRET', randomBytes(32).toString('hex'));
    vi.stubEnv('AUTH_ORGANIZATION_TOKEN_SECRET', randomBytes(32).toString('hex'));
  });

  it('rejects insecure public URLs without breaking local development', () => {
    expect(createAuthConfig().production).toBe(true);
    vi.stubEnv('WEB_BASE_URL', 'http://localhost:4200');
    expect(() => createAuthConfig()).toThrow('HTTPS');
    vi.stubEnv('NODE_ENV', 'development');
    expect(createAuthConfig().production).toBe(false);
  });

  it('rejects reused signing keys and sample configuration secrets', () => {
    vi.stubEnv('AUTH_ORGANIZATION_TOKEN_SECRET', process.env.AUTH_SESSION_TOKEN_SECRET);
    expect(() => createAuthConfig()).toThrow('distinct');
    vi.stubEnv(
      'AUTH_ORGANIZATION_TOKEN_SECRET',
      'replace-with-a-random-secret-at-least-32-characters',
    );
    expect(() => createAuthConfig()).toThrow('randomly generated');
  });
});
