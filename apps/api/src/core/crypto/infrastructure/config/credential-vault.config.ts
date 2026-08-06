import { createHash } from 'node:crypto';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  INTEGRATION_CREDENTIAL_MASTER_KEY: z.string().optional(),
  INTEGRATION_CREDENTIAL_KEY_VERSION: z.string().min(1).max(50).default('v1'),
  AUTH_ORGANIZATION_TOKEN_SECRET: z.string().min(32),
});

export type CredentialVaultConfig = {
  masterKey: Buffer;
  keyVersion: string;
};

export const CREDENTIAL_VAULT_CONFIG = Symbol('CREDENTIAL_VAULT_CONFIG');

export function createCredentialVaultConfig(): CredentialVaultConfig {
  const environment = environmentSchema.parse(process.env);
  if (environment.NODE_ENV === 'production' && !environment.INTEGRATION_CREDENTIAL_MASTER_KEY) {
    throw new Error('INTEGRATION_CREDENTIAL_MASTER_KEY is required in production');
  }

  const masterKey = environment.INTEGRATION_CREDENTIAL_MASTER_KEY
    ? Buffer.from(environment.INTEGRATION_CREDENTIAL_MASTER_KEY, 'base64')
    : createHash('sha256')
        .update(`caselog-integration:${environment.AUTH_ORGANIZATION_TOKEN_SECRET}`)
        .digest();
  if (masterKey.length !== 32) {
    throw new Error('INTEGRATION_CREDENTIAL_MASTER_KEY must be a base64-encoded 32-byte key');
  }

  return { masterKey, keyVersion: environment.INTEGRATION_CREDENTIAL_KEY_VERSION };
}
