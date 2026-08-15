import {
  CreateBucketCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { STORAGE_CONFIG, type StorageConfig } from '../config/storage.config';
import type {
  CreateUploadUrlInput,
  DownloadUrl,
  StorageProvider,
  StoredObjectPage,
  StoredObject,
  UploadUrl,
} from '../../application/ports/storage.provider';

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
      ChecksumSHA256: Buffer.from(input.checksumSha256, 'hex').toString('base64'),
      Metadata: { checksumSha256: input.checksumSha256 },
    });
    return {
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.uploadUrlTtlSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set(['x-amz-checksum-sha256', 'x-amz-meta-checksumsha256']),
      }),
      headers: {
        'content-type': input.contentType,
        'x-amz-checksum-sha256': Buffer.from(input.checksumSha256, 'hex').toString('base64'),
        'x-amz-meta-checksumsha256': input.checksumSha256,
      },
      expiresAt,
    };
  }

  async createDownloadUrl(storageKey: string, fileName: string): Promise<DownloadUrl> {
    const expiresAt = new Date(Date.now() + this.config.downloadUrlTtlSeconds * 1_000);
    const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: storageKey,
      ResponseContentDisposition: disposition,
    });
    return {
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.downloadUrlTtlSeconds,
      }),
      expiresAt,
    };
  }

  async stat(storageKey: string): Promise<StoredObject | null> {
    try {
      const object = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: storageKey,
          ChecksumMode: 'ENABLED',
        }),
      );
      return {
        contentType: object.ContentType ?? null,
        sizeBytes: object.ContentLength ?? 0,
        checksumSha256: object.ChecksumSHA256
          ? Buffer.from(object.ChecksumSHA256, 'base64').toString('hex')
          : (object.Metadata?.checksumsha256 ?? null),
      };
    } catch (error) {
      if (this.isMissingObject(error)) return null;
      throw error;
    }
  }

  async read(storageKey: string, maxBytes: number): Promise<Uint8Array> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
    );
    if ((object.ContentLength ?? 0) > maxBytes || !object.Body) {
      throw new Error('Stored object exceeds the allowed read size');
    }
    const content = await object.Body.transformToByteArray();
    if (content.byteLength > maxBytes) {
      throw new Error('Stored object exceeds the allowed read size');
    }
    return content;
  }

  async copy(sourceStorageKey: string, destinationStorageKey: string): Promise<void> {
    const copySource = encodeURIComponent(`${this.config.bucket}/${sourceStorageKey}`).replace(
      /%2F/g,
      '/',
    );
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: destinationStorageKey,
        CopySource: copySource,
        ChecksumAlgorithm: 'SHA256',
      }),
    );
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storageKey }),
    );
  }

  async list(prefix: string, after: string | null, limit: number): Promise<StoredObjectPage> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
        StartAfter: after ?? undefined,
        MaxKeys: Math.min(Math.max(limit, 1), 1_000),
      }),
    );
    const objects = (response.Contents ?? []).flatMap((object) =>
      object.Key && object.LastModified
        ? [
            {
              storageKey: object.Key,
              sizeBytes: object.Size ?? 0,
              lastModifiedAt: object.LastModified,
            },
          ]
        : [],
    );
    return {
      objects,
      nextAfter: response.IsTruncated ? (objects.at(-1)?.storageKey ?? null) : null,
    };
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

  private isMissingObject(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return (
      value.name === 'NotFound' ||
      value.name === 'NoSuchKey' ||
      value.$metadata?.httpStatusCode === 404
    );
  }
}
