import { describe, expect, it } from 'vitest';
import { hasStaffRole, isValidStaffAccessExpiry } from '../../domain/policies/staff-access.policy';

describe('staff access policy', () => {
  it('orders support, admin, and owner privileges', () => {
    expect(hasStaffRole('support', 'support')).toBe(true);
    expect(hasStaffRole('support', 'admin')).toBe(false);
    expect(hasStaffRole('admin', 'support')).toBe(true);
    expect(hasStaffRole('admin', 'owner')).toBe(false);
    expect(hasStaffRole('owner', 'admin')).toBe(true);
  });

  it('bounds operator access to 90 days', () => {
    const now = new Date('2026-09-03T12:00:00.000Z');
    expect(isValidStaffAccessExpiry(new Date('2026-09-04T12:00:00.000Z'), now)).toBe(true);
    expect(isValidStaffAccessExpiry(new Date('2026-09-03T12:00:00.000Z'), now)).toBe(false);
    expect(isValidStaffAccessExpiry(new Date('2026-12-03T12:00:00.000Z'), now)).toBe(false);
  });
});
