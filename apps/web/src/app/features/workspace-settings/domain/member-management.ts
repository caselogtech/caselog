import type { ManageableWorkspaceRole, WorkspaceMember } from '@caselog/schemas';

export const MANAGEABLE_WORKSPACE_ROLES: readonly ManageableWorkspaceRole[] = [
  'admin',
  'lead',
  'tester',
  'contributor',
  'read_only',
];

export type MemberSettingsView = 'active' | 'invitations' | 'inactive';

export function parseMemberSettingsView(value: string | null): MemberSettingsView {
  return value === 'invitations' || value === 'inactive' ? value : 'active';
}

export function canManageWorkspaceMember(
  actorRole: WorkspaceMember['role'] | null,
  actorUserId: string | null,
  target: WorkspaceMember,
): boolean {
  if (!actorUserId || actorUserId === target.user.id) return false;
  if (actorRole === 'owner') return target.role !== 'owner';
  return actorRole === 'admin' && !['owner', 'admin'].includes(target.role);
}

export function assignableWorkspaceRoles(
  actorRole: WorkspaceMember['role'] | null,
): readonly ManageableWorkspaceRole[] {
  return actorRole === 'owner'
    ? MANAGEABLE_WORKSPACE_ROLES
    : MANAGEABLE_WORKSPACE_ROLES.filter((role) => role !== 'admin');
}

export function canTransferWorkspaceOwnership(
  actorRole: WorkspaceMember['role'] | null,
  actorUserId: string | null,
  target: WorkspaceMember,
): boolean {
  return (
    actorRole === 'owner' &&
    Boolean(actorUserId) &&
    actorUserId !== target.user.id &&
    target.state === 'active' &&
    target.role !== 'owner'
  );
}
