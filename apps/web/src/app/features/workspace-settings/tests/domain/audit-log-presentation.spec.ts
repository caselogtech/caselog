import { describe, expect, it } from 'vitest';
import {
  auditActionFilter,
  auditActionLabel,
  auditMetadataEntries,
} from '../../domain/audit-log-presentation';

describe('auditActionFilter', () => {
  it('accepts only server-compatible exact action names', () => {
    expect(auditActionFilter(' member.role_updated ')).toBe('member.role_updated');
    expect(auditActionFilter('Member updated')).toBe('');
    expect(auditActionFilter(null)).toBe('');
  });
});

describe('auditActionLabel', () => {
  it('turns machine actions into readable sentence case', () => {
    expect(auditActionLabel('member.role_updated')).toBe('Member role updated');
  });
});

describe('auditMetadataEntries', () => {
  it('sorts keys and preserves nested values without interpretation', () => {
    expect(auditMetadataEntries({ role: 'lead', changes: { previous: 'tester' } })).toEqual([
      { key: 'changes', value: '{"previous":"tester"}' },
      { key: 'role', value: 'lead' },
    ]);
  });
});
