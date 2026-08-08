import { describe, expect, it } from 'vitest';
import type { WorkspaceMember } from '@caselog/schemas';
import {
  canInviteRole,
  canManageMember,
  canTransferOwnership,
} from '../../domain/policies/member-management.policy';

describe('member management policy', () => {
  it('lets owners manage non-owners but requires the transfer flow for ownership', () => {
    const owner = member('owner');
    const admin = member('admin');

    expect(canManageMember(owner, admin, 'lead')).toBe(true);
    expect(canManageMember(owner, owner, 'admin')).toBe(false);
    expect(canTransferOwnership(owner, admin)).toBe(true);
  });

  it('prevents admins from managing owners, admins, themselves, or granting admin', () => {
    const admin = member('admin');

    expect(canManageMember(admin, member('lead'), 'tester')).toBe(true);
    expect(canManageMember(admin, member('lead'), 'admin')).toBe(false);
    expect(canManageMember(admin, member('owner'), 'lead')).toBe(false);
    expect(canManageMember(admin, member('admin'), 'lead')).toBe(false);
    expect(canManageMember(admin, admin, 'lead')).toBe(false);
  });

  it('requires both participants to be active for ownership transfer', () => {
    expect(canTransferOwnership(member('owner', false), member('lead'))).toBe(false);
    expect(canTransferOwnership(member('owner'), member('lead', false))).toBe(false);
  });

  it('lets only owners grant admin through invitations', () => {
    expect(canInviteRole('owner', 'admin')).toBe(true);
    expect(canInviteRole('admin', 'admin')).toBe(false);
    expect(canInviteRole('admin', 'tester')).toBe(true);
    expect(canInviteRole('lead', 'tester')).toBe(false);
  });
});

function member(
  role: WorkspaceMember['role'],
  active = true,
): { id: string; userId: string; role: WorkspaceMember['role']; active: boolean } {
  return {
    id: `${role}-${active ? 'active' : 'inactive'}`,
    userId: `${role}-user`,
    role,
    active,
  };
}
