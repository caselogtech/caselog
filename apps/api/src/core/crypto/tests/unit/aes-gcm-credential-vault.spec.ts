import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmCredentialVault } from '../../infrastructure/adapters/aes-gcm-credential-vault';

describe('AesGcmCredentialVault', () => {
  const vault = new AesGcmCredentialVault({ masterKey: Buffer.alloc(32, 7), keyVersion: 'v1' });
  const context = {
    organizationId: '6ff194e0-2a61-48f3-9723-9600e2b9a718',
    connectionId: 'c01d388f-c71b-4af8-a2f6-873d135c4c73',
  };

  it('round-trips credentials without storing plaintext', () => {
    const envelope = vault.encrypt({ personalAccessToken: 'jira-secret-token' }, context);

    expect(JSON.stringify(envelope)).not.toContain('jira-secret-token');
    expect(vault.decrypt(envelope, context)).toEqual({
      personalAccessToken: 'jira-secret-token',
    });
  });

  it('binds ciphertext to its organization and connection', () => {
    const envelope = vault.encrypt({ personalAccessToken: 'jira-secret-token' }, context);

    expect(() => vault.decrypt(envelope, { ...context, connectionId: randomUUID() })).toThrow();
  });
});
