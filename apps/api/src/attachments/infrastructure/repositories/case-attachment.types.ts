import type { CaseAttachment } from '@caselog/schemas';

export type CaseAttachmentResult<T> =
  | { kind: 'found'; value: T }
  | { kind: 'not_found' }
  | { kind: 'invalid_upload' }
  | { kind: 'upload_limit_reached' };

export type PendingCaseAttachmentUpload = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type CaseAttachmentUploadLookup =
  | { state: 'pending'; upload: PendingCaseAttachmentUpload }
  | { state: 'completed'; attachment: CaseAttachment };

export type CaseAttachmentDownload = {
  storageKey: string;
  fileName: string;
  contentType: string;
};
