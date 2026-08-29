import type { WorkspaceSummary } from '@caselog/schemas';

export type WorkspaceRole = WorkspaceSummary['role'];
export type WorkspacePermission = 'read' | 'write' | 'lead' | 'admin' | 'owner';

const ROLE_LEVEL: Record<WorkspaceRole, number> = {
  read_only: 0,
  contributor: 1,
  tester: 1,
  lead: 2,
  admin: 3,
  owner: 4,
};

const PERMISSION_LEVEL: Record<WorkspacePermission, number> = {
  read: 0,
  write: 1,
  lead: 2,
  admin: 3,
  owner: 4,
};

const ROLE_TRANSLATION_KEYS: Record<WorkspaceSummary['role'], string> = {
  owner: 'workspace.roles.owner',
  admin: 'workspace.roles.admin',
  lead: 'workspace.roles.lead',
  tester: 'workspace.roles.tester',
  contributor: 'workspace.roles.contributor',
  read_only: 'workspace.roles.read_only',
};

export function workspaceRoleTranslationKey(role: WorkspaceSummary['role']): string {
  return ROLE_TRANSLATION_KEYS[role];
}

export function hasWorkspacePermission(
  role: WorkspaceRole | null | undefined,
  permission: WorkspacePermission,
): boolean {
  return role !== null && role !== undefined && ROLE_LEVEL[role] >= PERMISSION_LEVEL[permission];
}
