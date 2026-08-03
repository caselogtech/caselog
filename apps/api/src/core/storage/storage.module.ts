import { Global, Module } from '@nestjs/common';
import { createStorageConfig, STORAGE_CONFIG } from './infrastructure/config/storage.config';
import { S3StorageProvider } from './infrastructure/adapters/s3-storage.provider';
import { STORAGE_PROVIDER } from './application/ports/storage.provider';

@Global()
@Module({
  providers: [
    { provide: STORAGE_CONFIG, useFactory: createStorageConfig },
    S3StorageProvider,
    { provide: STORAGE_PROVIDER, useExisting: S3StorageProvider },
  ],
  exports: [STORAGE_CONFIG, STORAGE_PROVIDER],
})
export class StorageModule {}
