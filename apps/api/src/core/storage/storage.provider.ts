export type CreateUploadUrlInput = {
  storageKey: string;
  contentType: string;
  checksumSha256: string;
  sizeBytes: number;
};

export type UploadUrl = {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
};

export type StoredObject = {
  contentType: string | null;
  sizeBytes: number;
  checksumSha256: string | null;
};

export interface StorageProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrl>;
  stat(storageKey: string): Promise<StoredObject>;
  delete(storageKey: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
