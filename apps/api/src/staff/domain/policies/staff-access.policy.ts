import type { StaffOperatorRole } from '@caselog/schemas';

const ROLE_LEVEL: Record<StaffOperatorRole, number> = {
  support: 1,
  admin: 2,
  owner: 3,
};

export const MAX_STAFF_ACCESS_DAYS = 90;

export function hasStaffRole(current: StaffOperatorRole, required: StaffOperatorRole): boolean {
  return ROLE_LEVEL[current] >= ROLE_LEVEL[required];
}

export function isValidStaffAccessExpiry(expiresAt: Date, now = new Date()): boolean {
  const maximum = new Date(now.getTime() + MAX_STAFF_ACCESS_DAYS * 24 * 60 * 60 * 1_000);
  return expiresAt > now && expiresAt <= maximum;
}
