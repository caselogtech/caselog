import { describe, expect, it } from 'vitest';
import { normalizeCandidateIdentity } from '../../domain/models/release-candidate-identity';

describe('release candidate identity', () => {
  it('normalizes revision and digest before generating a stable identity', () => {
    const first = normalizeCandidateIdentity({
      sourceRevision: ' ABC123 ',
      artifactDigest: ' SHA256:DEADBEEF ',
      buildIdentifier: 'build-42',
      branch: undefined,
      version: undefined,
    });
    const second = normalizeCandidateIdentity({
      sourceRevision: 'abc123',
      artifactDigest: 'sha256:deadbeef',
      buildIdentifier: 'build-42',
      branch: undefined,
      version: undefined,
    });

    expect(first).toMatchObject({
      sourceRevision: 'abc123',
      artifactDigest: 'sha256:deadbeef',
      buildIdentifier: 'build-42',
    });
    expect(first.identityHash).toBe(second.identityHash);
  });
});
