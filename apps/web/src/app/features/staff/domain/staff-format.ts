export function formatStaffDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatStaffBytes(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** exponent;
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: exponent === 0 ? 0 : 1 }).format(amount)} ${units[exponent]}`;
}

export function staffRoleTranslationKey(role: 'owner' | 'admin' | 'support'): string {
  const keys = {
    owner: 'staff.roles.owner',
    admin: 'staff.roles.admin',
    support: 'staff.roles.support',
  } as const;
  return keys[role];
}

export function staffOperatorStateTranslationKey(state: 'active' | 'disabled' | 'expired'): string {
  const keys = {
    active: 'staff.values.active',
    disabled: 'staff.values.disabled',
    expired: 'staff.values.expired',
  } as const;
  return keys[state];
}
