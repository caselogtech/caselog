export type ExpectedUploadMetadata = {
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type StoredUploadMetadata = {
  contentType: string | null;
  sizeBytes: number;
  checksumSha256: string | null;
};

export function uploadMetadataMatches(
  stored: StoredUploadMetadata,
  expected: ExpectedUploadMetadata,
): boolean {
  return (
    stored.contentType === expected.contentType &&
    stored.sizeBytes === expected.sizeBytes &&
    stored.checksumSha256 === expected.checksumSha256
  );
}
