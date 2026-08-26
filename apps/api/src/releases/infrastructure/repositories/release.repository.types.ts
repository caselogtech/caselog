export type ProjectResult<T> = { kind: 'found'; value: T } | { kind: 'project_not_found' };

export type IdempotentCreateResult<T> =
  | { kind: 'created' | 'replayed'; value: T }
  | { kind: 'project_not_found' }
  | { kind: 'idempotency_conflict' };
