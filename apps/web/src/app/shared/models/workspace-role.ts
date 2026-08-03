import type { WorkspaceSummary } from '@caselog/schemas';

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
