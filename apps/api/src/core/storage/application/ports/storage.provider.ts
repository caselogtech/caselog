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

export type DownloadUrl = {
  url: string;
  expiresAt: Date;
};

export type StoredObject = {
  contentType: string | null;
  sizeBytes: number;
  checksumSha256: string | null;
};

export type StoredObjectSummary = {
  storageKey: string;
  sizeBytes: number;
  lastModifiedAt: Date;
};

export type StoredObjectPage = {
  objects: StoredObjectSummary[];
  nextAfter: string | null;
};

export interface StorageProvider {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadUrl>;
  createDownloadUrl(storageKey: string, fileName: string): Promise<DownloadUrl>;
  stat(storageKey: string): Promise<StoredObject | null>;
  read(storageKey: string, maxBytes: number): Promise<Uint8Array>;
  copy(sourceStorageKey: string, destinationStorageKey: string): Promise<void>;
  delete(storageKey: string): Promise<void>;
  list(prefix: string, after: string | null, limit: number): Promise<StoredObjectPage>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
