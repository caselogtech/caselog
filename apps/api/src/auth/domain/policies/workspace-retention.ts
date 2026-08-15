export const WORKSPACE_RECOVERY_DAYS = 30;

const RECOVERY_WINDOW_MS = WORKSPACE_RECOVERY_DAYS * 24 * 60 * 60 * 1_000;

export function workspaceRecoverableUntil(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RECOVERY_WINDOW_MS);
}

export function workspacePurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - RECOVERY_WINDOW_MS);
}
