import type { WorkspaceMember } from '@caselog/schemas';
import {
  assignableWorkspaceRoles,
  canManageWorkspaceMember,
  canTransferWorkspaceOwnership,
  parseMemberSettingsView,
} from '../../domain/member-management';

describe('workspace member presentation policy', () => {
  it('parses only committed URL-backed views', () => {
    expect(parseMemberSettingsView(null)).toBe('active');
    expect(parseMemberSettingsView('invitations')).toBe('invitations');
    expect(parseMemberSettingsView('inactive')).toBe('inactive');
    expect(parseMemberSettingsView('unknown')).toBe('active');
  });

  it('mirrors owner and admin management boundaries without replacing server checks', () => {
    expect(canManageWorkspaceMember('owner', 'owner-user', member('lead'))).toBe(true);
    expect(canManageWorkspaceMember('owner', 'owner-user', member('owner'))).toBe(false);
    expect(canManageWorkspaceMember('admin', 'admin-user', member('lead'))).toBe(true);
    expect(canManageWorkspaceMember('admin', 'admin-user', member('admin'))).toBe(false);
    expect(canManageWorkspaceMember('admin', 'target-user', member('lead'))).toBe(false);
    expect(canManageWorkspaceMember('lead', 'lead-user', member('tester'))).toBe(false);
  });

  it('allows only the owner to transfer ownership to another active member', () => {
    expect(canTransferWorkspaceOwnership('owner', 'owner-user', member('lead'))).toBe(true);
    expect(
      canTransferWorkspaceOwnership('owner', 'owner-user', {
        ...member('lead'),
        state: 'inactive',
      }),
    ).toBe(false);
    expect(canTransferWorkspaceOwnership('admin', 'admin-user', member('lead'))).toBe(false);
    expect(canTransferWorkspaceOwnership('owner', 'target-user', member('lead'))).toBe(false);
  });

  it('removes the admin role from an admin actor assignment set', () => {
    expect(assignableWorkspaceRoles('owner')).toContain('admin');
    expect(assignableWorkspaceRoles('admin')).not.toContain('admin');
  });
});

function member(role: WorkspaceMember['role']): WorkspaceMember {
  return {
    membershipId: '11111111-1111-4111-8111-111111111111',
    user: {
      id: 'target-user',
      email: 'member@example.com',
      displayName: 'Workspace Member',
    },
    role,
    state: 'active',
    createdAt: '2026-08-20T12:00:00.000Z',
    updatedAt: '2026-08-20T12:00:00.000Z',
  };
}
