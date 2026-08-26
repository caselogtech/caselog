import { createHash } from 'node:crypto';
import type { CreateReleaseCandidateRequest } from '@caselog/schemas';

export type NormalizedCandidateIdentity = CreateReleaseCandidateRequest & {
  identityHash: string;
};

export function normalizeCandidateIdentity(
  request: CreateReleaseCandidateRequest,
): NormalizedCandidateIdentity {
  const sourceRevision = normalizeLower(request.sourceRevision);
  const buildIdentifier = normalize(request.buildIdentifier);
  const artifactDigest = normalizeLower(request.artifactDigest);
  const branch = normalize(request.branch);
  const version = normalize(request.version);
  const sourceUrl = normalize(request.sourceUrl);
  const identityHash = createHash('sha256')
    .update(JSON.stringify({ sourceRevision, buildIdentifier, artifactDigest }))
    .digest('hex');

  return {
    sourceRevision,
    buildIdentifier,
    artifactDigest,
    branch,
    version,
    sourceUrl,
    identityHash,
  };
}

function normalize(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function normalizeLower(value: string | undefined): string | undefined {
  return normalize(value)?.toLowerCase();
}
