import {
  DomainError,
  ExternalServiceError,
  InvalidPayloadError,
} from '../../../common/errors/domain.error';
import { IssueTrackerRequestError } from '../../domain/errors/issue-tracker.error';

export function throwIssueTrackerDomainError(error: unknown): never {
  if (error instanceof DomainError) throw error;
  if (error instanceof IssueTrackerRequestError && error.kind === 'rejected') {
    throw new InvalidPayloadError('issue_tracker_rejected_request', error.message);
  }
  if (error instanceof IssueTrackerRequestError) {
    throw new ExternalServiceError('issue_tracker_unavailable', error.message, {
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    });
  }
  throw new ExternalServiceError(
    'issue_tracker_invalid_response',
    'The issue tracker returned an invalid response',
  );
}

export function issueCreationCanRetry(error: unknown): boolean {
  return (
    error instanceof IssueTrackerRequestError &&
    ['authentication', 'rate_limited', 'rejected'].includes(error.kind)
  );
}
