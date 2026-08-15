export type AttachmentBlobMetadata = {
  checksumSha256: string;
  sizeBytes: number;
};

export function attachmentBlobStorageKey(organizationId: string, checksumSha256: string): string {
  return `${organizationId}/blobs/sha256/${checksumSha256.slice(0, 2)}/${checksumSha256}`;
}

export function attachmentBlobMatches(
  object: { sizeBytes: number; checksumSha256: string | null },
  metadata: AttachmentBlobMetadata,
): boolean {
  return (
    object.sizeBytes === metadata.sizeBytes && object.checksumSha256 === metadata.checksumSha256
  );
}
