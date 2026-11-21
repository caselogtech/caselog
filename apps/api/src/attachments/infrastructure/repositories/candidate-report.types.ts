import type { CandidateReport } from '@caselog/schemas';

export type CandidateReportResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid_upload' }
  | { kind: 'upload_limit_reached' };

export type PendingCandidateReportUpload = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type CandidateReportUploadLookup =
  | { state: 'pending'; upload: PendingCandidateReportUpload }
  | { state: 'completed'; attachment: CandidateReport };

export type CandidateReportDownload = {
  storageKey: string;
  fileName: string;
  contentType: string;
};
