import type { CandidateTestRunRole, ReleaseState } from '@caselog/schemas';

export type ReleaseCandidateReference = {
  id: string;
  projectId: string;
  releaseId: string;
  releaseState: ReleaseState;
  sourceRevision: string | null;
  buildIdentifier: string | null;
  artifactDigest: string | null;
  identityHash: string;
  testRuns: Array<{ testRunId: string; role: CandidateTestRunRole }>;
};
