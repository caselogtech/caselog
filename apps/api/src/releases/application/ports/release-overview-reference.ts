import type { ReleaseListQuery, ReleaseSummary } from '@caselog/schemas';

export type LatestReleaseCandidateReference = {
  id: string;
  projectId: string;
  releaseId: string;
  sequence: number;
  label: string;
  createdAt: string;
};

export type ReleaseOverviewReference = {
  items: Array<{
    release: ReleaseSummary;
    latestCandidate: LatestReleaseCandidateReference | null;
  }>;
  nextCursor: string | null;
};

export type ReleaseOverviewReferenceQuery = ReleaseListQuery;
