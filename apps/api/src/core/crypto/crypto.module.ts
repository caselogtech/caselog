import { Global, Module } from '@nestjs/common';
import { CredentialVault } from './application/ports/credential-vault';
import { AesGcmCredentialVault } from './infrastructure/adapters/aes-gcm-credential-vault';
import {
  CREDENTIAL_VAULT_CONFIG,
  createCredentialVaultConfig,
} from './infrastructure/config/credential-vault.config';

@Global()
@Module({
  providers: [
    { provide: CREDENTIAL_VAULT_CONFIG, useFactory: createCredentialVaultConfig },
    AesGcmCredentialVault,
    { provide: CredentialVault, useExisting: AesGcmCredentialVault },
  ],
  exports: [CredentialVault],
})
export class CryptoModule {}
