export const DEFAULT_PROJECT_STATUSES = [
  ['untested', 'Untested', '#64748B', 'circle', false, false],
  ['passed', 'Passed', '#16A34A', 'check', true, false],
  ['failed', 'Failed', '#DC2626', 'x', true, true],
  ['blocked', 'Blocked', '#D97706', 'ban', true, false],
  ['retest', 'Retest', '#2563EB', 'rotate-ccw', false, false],
  ['skipped', 'Skipped', '#475569', 'skip-forward', true, false],
] as const;
