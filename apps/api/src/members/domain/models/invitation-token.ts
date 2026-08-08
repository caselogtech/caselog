import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PATTERN = /^clgi_([0-9a-f-]{36})_[A-Za-z0-9_-]{43}$/i;

export function createInvitationToken(organizationId: string): string {
  return `clgi_${organizationId}_${randomBytes(32).toString('base64url')}`;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function invitationOrganizationId(token: string): string | undefined {
  return TOKEN_PATTERN.exec(token)?.[1]?.toLowerCase();
}
