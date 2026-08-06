export type IssueTrackerFailureKind =
  | 'authentication'
  | 'rate_limited'
  | 'rejected'
  | 'unavailable'
  | 'invalid_response';

export class IssueTrackerRequestError extends Error {
  constructor(
    readonly kind: IssueTrackerFailureKind,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'IssueTrackerRequestError';
  }
}
