import { describe, expect, it } from 'vitest';
import { hasWorkspacePermission } from './workspace-role';

describe('hasWorkspacePermission', () => {
  it.each([
    ['read_only', 'read', true],
    ['read_only', 'write', false],
    ['tester', 'write', true],
    ['contributor', 'lead', false],
    ['lead', 'lead', true],
    ['admin', 'admin', true],
    ['admin', 'owner', false],
    ['owner', 'owner', true],
  ] as const)('checks %s against %s access', (role, permission, allowed) => {
    expect(hasWorkspacePermission(role, permission)).toBe(allowed);
  });

  it('denies access before a workspace session is available', () => {
    expect(hasWorkspacePermission(null, 'read')).toBe(false);
  });
});
