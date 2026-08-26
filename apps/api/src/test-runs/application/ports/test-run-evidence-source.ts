import type { TestRunStatus } from '@caselog/schemas';

export type TestRunEvidenceSnapshot = {
  projectId: string;
  testRunId: string;
  status: TestRunStatus;
  revision: number;
  observedAt: string;
  totalItems: number;
  finalItems: number;
  passedItems: number;
  failedItems: number;
  skippedItems: number;
  statusCounts: Array<{
    key: string;
    isFinal: boolean;
    countsAsFailure: boolean;
    count: number;
  }>;
};
