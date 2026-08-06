import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  CredentialVault,
  type CredentialContext,
  type EncryptedCredentials,
} from '../../application/ports/credential-vault';
import {
  CREDENTIAL_VAULT_CONFIG,
  type CredentialVaultConfig,
} from '../config/credential-vault.config';

const envelopeSchema = z.object({
  version: z.literal(1),
  keyVersion: z.string().min(1),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  wrappedKey: z.string().min(1),
  wrapIv: z.string().min(1),
  wrapTag: z.string().min(1),
});

@Injectable()
export class AesGcmCredentialVault extends CredentialVault {
  constructor(@Inject(CREDENTIAL_VAULT_CONFIG) private readonly config: CredentialVaultConfig) {
    super();
  }

  encrypt(credentials: Record<string, string>, context: CredentialContext): EncryptedCredentials {
    const dataKey = randomBytes(32);
    const aad = this.aad(context);
    const encrypted = this.encryptBytes(Buffer.from(JSON.stringify(credentials)), dataKey, aad);
    const wrapped = this.encryptBytes(dataKey, this.config.masterKey, aad);

    return {
      version: 1,
      keyVersion: this.config.keyVersion,
      ciphertext: encrypted.value.toString('base64'),
      iv: encrypted.iv.toString('base64'),
      tag: encrypted.tag.toString('base64'),
      wrappedKey: wrapped.value.toString('base64'),
      wrapIv: wrapped.iv.toString('base64'),
      wrapTag: wrapped.tag.toString('base64'),
    };
  }

  decrypt(envelope: unknown, context: CredentialContext): Record<string, string> {
    const parsed = envelopeSchema.parse(envelope);
    if (parsed.keyVersion !== this.config.keyVersion) {
      throw new Error(`Credential key version ${parsed.keyVersion} is unavailable`);
    }

    const aad = this.aad(context);
    const dataKey = this.decryptBytes(
      Buffer.from(parsed.wrappedKey, 'base64'),
      this.config.masterKey,
      Buffer.from(parsed.wrapIv, 'base64'),
      Buffer.from(parsed.wrapTag, 'base64'),
      aad,
    );
    const plaintext = this.decryptBytes(
      Buffer.from(parsed.ciphertext, 'base64'),
      dataKey,
      Buffer.from(parsed.iv, 'base64'),
      Buffer.from(parsed.tag, 'base64'),
      aad,
    );
    return z.record(z.string(), z.string()).parse(JSON.parse(plaintext.toString('utf8')));
  }

  private encryptBytes(value: Buffer, key: Buffer, aad: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    return {
      value: Buffer.concat([cipher.update(value), cipher.final()]),
      iv,
      tag: cipher.getAuthTag(),
    };
  }

  private decryptBytes(value: Buffer, key: Buffer, iv: Buffer, tag: Buffer, aad: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(value), decipher.final()]);
  }

  private aad(context: CredentialContext): Buffer {
    return Buffer.from(`caselog:integration:${context.organizationId}:${context.connectionId}`);
  }
}
