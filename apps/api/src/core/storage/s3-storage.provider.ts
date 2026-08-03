import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { STORAGE_CONFIG, type StorageConfig } from './storage.config';
import type {
  CreateUploadUrlInput,
  StorageProvider,
  StoredObject,
  UploadUrl,
} from './storage.provider';

@Injectable()
export class S3StorageProvider implements StorageProvider, OnModuleInit {
  private readonly client: S3Client;

  constructor(@Inject(STORAGE_CONFIG) private readonly config: StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      if (!this.config.autoCreateBucket || !this.isMissingBucket(error)) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrl> {
    const expiresAt = new Date(Date.now() + this.config.uploadUrlTtlSeconds * 1_000);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      Metadata: { checksumSha256: input.checksumSha256 },
    });
    return {
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.uploadUrlTtlSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-meta-checksumsha256']),
      }),
      headers: {
        'content-type': input.contentType,
        'x-amz-meta-checksumsha256': input.checksumSha256,
      },
      expiresAt,
    };
  }

  async stat(storageKey: string): Promise<StoredObject> {
    const object = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
    );
    return {
      contentType: object.ContentType ?? null,
      sizeBytes: object.ContentLength ?? 0,
      checksumSha256: object.Metadata?.checksumsha256 ?? null,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
    );
  }

  private isMissingBucket(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      value.name === 'NotFound' ||
      value.name === 'NoSuchBucket' ||
      value.$metadata?.httpStatusCode === 404
    );
  }
}
