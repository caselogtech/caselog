import type { ResultAttachmentResponse, ResultStatusResponse } from '@caselog/schemas';
import type { RunStatus } from '../generated/prisma/enums';

export type RunResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'case_unavailable' }
  | { kind: 'untested_status_not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'member_not_found' }
  | { kind: 'status_not_found' }
  | { kind: 'result_not_found' }
  | { kind: 'invalid_step_results' }
  | { kind: 'invalid_upload' }
  | { kind: 'run_closed' }
  | { kind: 'invalid_run_state' }
  | { kind: 'duplicate_matched_item' }
  | { kind: 'ingest_status_unavailable' }
  | { kind: 'idempotency_conflict' };

export type RunRecord = {
  id: string;
  name: string;
  status: RunStatus;
  build: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

export type RunCounts = { itemCount: number; completedCount: number; failedCount: number };

export type RunMemberRecord = { id: string; displayName: string };

export type ResultRecord = {
  id: string;
  attempt: number;
  comment: string | null;
  elapsedMs: number | null;
  executedAt: Date;
  executedBy: RunMemberRecord | null;
  status: ResultStatusResponse;
  stepResults: Array<{
    id: string;
    position: number;
    comment: string | null;
    elapsedMs: number | null;
    status: ResultStatusResponse;
  }>;
};

export type AttachmentRecord = ResultAttachmentResponse;

export type IdempotencyClaim<T> =
  | { kind: 'claimed' }
  | { kind: 'replay'; value: T }
  | { kind: 'conflict' };

export type MatchableRunItem = {
  id: string;
  caseVersion: {
    testCase: { automationId: string | null; caseNumber: bigint };
  };
};

export type RunItemIndex = {
  byId: Map<string, MatchableRunItem>;
  byAutomationId: Map<string, MatchableRunItem[]>;
  byCaseNumber: Map<string, MatchableRunItem[]>;
};

export type LockedRunContext = { projectId: string; run: RunRecord };
