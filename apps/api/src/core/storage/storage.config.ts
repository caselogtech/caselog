import { z } from 'zod';

const storageEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3).max(63),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
  S3_AUTO_CREATE_BUCKET: z.enum(['true', 'false']).optional(),
  S3_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
});

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  autoCreateBucket: boolean;
  uploadUrlTtlSeconds: number;
};

export const STORAGE_CONFIG = Symbol('STORAGE_CONFIG');

export function createStorageConfig(): StorageConfig {
  const environment = storageEnvironmentSchema.parse(process.env);
  return {
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    bucket: environment.S3_BUCKET,
    accessKey: environment.S3_ACCESS_KEY,
    secretKey: environment.S3_SECRET_KEY,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
    autoCreateBucket:
      environment.S3_AUTO_CREATE_BUCKET === 'true' ||
      (environment.S3_AUTO_CREATE_BUCKET === undefined && environment.NODE_ENV !== 'production'),
    uploadUrlTtlSeconds: environment.S3_UPLOAD_URL_TTL_SECONDS,
  };
}
