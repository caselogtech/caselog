import { staffAuditLogListQuerySchema } from '@caselog/schemas';
import {
  staffAuditDraft,
  staffAuditDraftRequest,
  staffAuditUrl,
} from '../../domain/staff-audit-navigation';

describe('audit UTC filter navigation', () => {
  it('normalizes native datetime input precision without shifting the instant', () => {
    const draft = {
      q: 'owner',
      action: '',
      targetType: '',
      targetId: '',
      from: '2026-11-20T00:00:00.02',
      to: '2026-11-21T00:00',
    };
    const query = staffAuditLogListQuerySchema.parse(staffAuditDraftRequest(draft, 25));
    const url = new URL(staffAuditUrl(query), 'https://caselog.invalid');
    expect(url.searchParams.get('from')).toBe('2026-11-20T00:00:00.020Z');
    expect(url.searchParams.get('to')).toBe('2026-11-21T00:00:00.000Z');
    expect(staffAuditDraft(query).from).toBe('2026-11-20T00:00:00.02');
    expect(
      staffAuditLogListQuerySchema.safeParse(
        staffAuditDraftRequest({ ...draft, from: 'invalid' }, 25),
      ).success,
    ).toBe(false);
  });
});
