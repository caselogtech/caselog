import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMailConfig } from '../../../mail/infrastructure/config/mail.config';
import { createStorageConfig } from '../../../storage/infrastructure/config/storage.config';
import { createHttpServerConfig } from '../../http-server.config';

afterEach(() => vi.unstubAllEnvs());

describe('production infrastructure configuration', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('S3_ENDPOINT', 'http://minio:9000');
    vi.stubEnv('S3_PUBLIC_ENDPOINT', 'https://objects.example.com');
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_BUCKET', 'caselog');
    vi.stubEnv('S3_ACCESS_KEY', 'test-storage');
    vi.stubEnv('S3_SECRET_KEY', randomBytes(32).toString('hex'));
  });

  it('allows private storage traffic while requiring HTTPS for browser transfers', () => {
    expect(createStorageConfig().publicEndpoint).toBe('https://objects.example.com');
    vi.stubEnv('S3_PUBLIC_ENDPOINT', undefined);
    expect(() => createStorageConfig()).toThrow('HTTPS');
    vi.stubEnv('S3_ENDPOINT', 'https://objects.example.com');
    expect(createStorageConfig().endpoint).toBe('https://objects.example.com');
  });

  it('does not trust forwarded headers unless explicitly configured', () => {
    vi.stubEnv('API_TRUST_PROXY_HOPS', undefined);
    expect(createHttpServerConfig()).toEqual({ trustProxy: 0 });
    vi.stubEnv('API_TRUST_PROXY_HOPS', '2');
    expect(createHttpServerConfig()).toEqual({ trustProxy: 2 });
    for (const value of ['true', '-1', '1.5', '6']) {
      vi.stubEnv('API_TRUST_PROXY_HOPS', value);
      expect(() => createHttpServerConfig()).toThrow();
    }
  });

  it('accepts empty optional SMTP credentials supplied by Compose', () => {
    vi.stubEnv('MAIL_HOST', 'smtp.example.com');
    vi.stubEnv('MAIL_PORT', '465');
    vi.stubEnv('MAIL_FROM', 'Caselog <caselog@example.com>');
    vi.stubEnv('MAIL_USER', '');
    vi.stubEnv('MAIL_PASSWORD', '');
    expect(createMailConfig()).toMatchObject({ user: undefined, password: undefined });
  });
});
