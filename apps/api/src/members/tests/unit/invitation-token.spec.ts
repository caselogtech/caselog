import { describe, expect, it } from 'vitest';
import {
  createInvitationToken,
  hashInvitationToken,
  invitationOrganizationId,
} from '../../domain/models/invitation-token';

const ORGANIZATION_ID = 'ef4df302-5173-447b-bd8c-395692141dbe';

describe('invitation tokens', () => {
  it('embeds only the tenant routing id and stores a one-way hash', () => {
    const token = createInvitationToken(ORGANIZATION_ID);

    expect(invitationOrganizationId(token)).toBe(ORGANIZATION_ID);
    expect(token).toMatch(/^clgi_/);
    expect(hashInvitationToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(token)).not.toContain(token);
  });

  it('rejects malformed routing tokens', () => {
    expect(invitationOrganizationId('clgi_invalid_secret')).toBeUndefined();
  });
});
