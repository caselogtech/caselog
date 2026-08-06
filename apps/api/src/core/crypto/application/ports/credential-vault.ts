export type CredentialContext = {
  organizationId: string;
  connectionId: string;
};

export type EncryptedCredentials = {
  version: 1;
  keyVersion: string;
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedKey: string;
  wrapIv: string;
  wrapTag: string;
};

export abstract class CredentialVault {
  abstract encrypt(
    credentials: Record<string, string>,
    context: CredentialContext,
  ): EncryptedCredentials;

  abstract decrypt(envelope: unknown, context: CredentialContext): Record<string, string>;
}
