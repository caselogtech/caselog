import type { StaffAuditLogListQuery } from '@caselog/schemas';

export type StaffAuditDraft = Record<
  'q' | 'action' | 'targetType' | 'targetId' | 'from' | 'to',
  string
>;

export function staffAuditUrl(query: StaffAuditLogListQuery): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'action', 'targetType', 'targetId', 'from', 'to'] as const) {
    const value = query[key];
    if (value)
      params.set(key, key === 'from' || key === 'to' ? new Date(value).toISOString() : value);
  }
  if (query.limit !== 25) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  return `/staff/audit${params.size ? `?${params}` : ''}`;
}

export function staffAuditDraft(query: StaffAuditLogListQuery | undefined): StaffAuditDraft {
  return {
    q: query?.q ?? '',
    action: query?.action ?? '',
    targetType: query?.targetType ?? '',
    targetId: query?.targetId ?? '',
    from: query?.from?.slice(0, -1) ?? '',
    to: query?.to?.slice(0, -1) ?? '',
  };
}

export function staffAuditDraftRequest(draft: StaffAuditDraft, limit: number): unknown {
  return {
    limit,
    q: draft.q.trim() || undefined,
    action: draft.action.trim() || undefined,
    targetType: draft.targetType.trim() || undefined,
    targetId: draft.targetId.trim() || undefined,
    from: draft.from ? `${draft.from}Z` : undefined,
    to: draft.to ? `${draft.to}Z` : undefined,
  };
}
