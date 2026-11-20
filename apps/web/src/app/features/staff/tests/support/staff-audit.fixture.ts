import type { StaffAuditLogListResponse } from '@caselog/schemas';

export const auditResponse: StaffAuditLogListResponse = {
  auditLogs: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      actor: {
        userId: '22222222-2222-4222-8222-222222222222',
        email: 'owner@example.com',
        displayName: 'Staff owner',
      },
      action: 'staff.operator.granted',
      targetType: 'staff_operator',
      targetId: '11111111-1111-4111-8111-111111111111',
      reason: 'Grant support access for the pilot',
      metadata: { role: 'support' },
      createdAt: '2026-11-20T12:00:00.000Z',
    },
  ],
  nextCursor: '55555555-5555-4555-8555-555555555555',
};
