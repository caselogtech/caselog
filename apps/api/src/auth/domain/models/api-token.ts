import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'clg_';

export function createApiToken(): { token: string; tokenPrefix: string; tokenHash: string } {
  const identifier = randomBytes(6).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const tokenPrefix = `${TOKEN_PREFIX}${identifier}`;
  const token = `${tokenPrefix}_${secret}`;

  return { token, tokenPrefix, tokenHash: hashApiToken(token) };
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isApiToken(value: string): boolean {
  return /^clg_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{43}$/.test(value);
}
