import { z } from 'zod';

const maximumWorkspacesPerUserSchema = z.coerce.number().int().min(1).max(100_000);

export type WorkspaceProvisioningConfig = {
  maximumWorkspacesPerUser: number | null;
};

export const WORKSPACE_PROVISIONING_CONFIG = Symbol('WORKSPACE_PROVISIONING_CONFIG');

export function createWorkspaceProvisioningConfig(): WorkspaceProvisioningConfig {
  const rawLimit = process.env.CASELOG_MAX_WORKSPACES_PER_USER?.trim();
  return {
    maximumWorkspacesPerUser: rawLimit ? maximumWorkspacesPerUserSchema.parse(rawLimit) : null,
  };
}
