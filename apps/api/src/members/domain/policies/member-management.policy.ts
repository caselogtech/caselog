import type { ManageableWorkspaceRole, WorkspaceMember } from '@caselog/schemas';

type MemberIdentity = {
  id: string;
  userId: string;
  role: WorkspaceMember['role'];
  active: boolean;
};

export function canManageMember(
  actor: MemberIdentity,
  target: MemberIdentity,
  nextRole?: ManageableWorkspaceRole,
): boolean {
  if (!actor.active || actor.id === target.id) return false;
  if (actor.role === 'owner') return target.role !== 'owner';
  if (actor.role !== 'admin') return false;
  if (target.role === 'owner' || target.role === 'admin') return false;
  return nextRole !== 'admin';
}

export function canTransferOwnership(actor: MemberIdentity, target: MemberIdentity): boolean {
  return (
    actor.active &&
    target.active &&
    actor.id !== target.id &&
    actor.role === 'owner' &&
    target.role !== 'owner'
  );
}

export function canInviteRole(
  actorRole: WorkspaceMember['role'],
  invitationRole: ManageableWorkspaceRole,
): boolean {
  if (actorRole === 'owner') return true;
  return actorRole === 'admin' && invitationRole !== 'admin';
}
