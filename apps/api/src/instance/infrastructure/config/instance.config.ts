import { instanceCapabilitiesSchema, type InstanceCapabilities } from '@caselog/schemas';
import { z } from 'zod';

const instanceEnvironmentSchema = z.object({
  CASELOG_DEPLOYMENT_MODE: z.enum(['self_hosted', 'managed']).default('self_hosted'),
  CASELOG_INSTANCE_NAME: z.string().trim().min(1).max(120).default('Caselog'),
  CASELOG_REGISTRATION_MODE: z.enum(['public', 'invitation_only']).default('public'),
  CASELOG_WORKSPACE_CREATION_ENABLED: z.stringbool().default(true),
  CASELOG_MANAGED_BILLING_ENABLED: z.stringbool().default(false),
});

export const INSTANCE_CONFIG = Symbol('INSTANCE_CONFIG');

export function createInstanceConfig(): InstanceCapabilities {
  const environment = instanceEnvironmentSchema.parse(process.env);
  return instanceCapabilitiesSchema.parse({
    deployment: environment.CASELOG_DEPLOYMENT_MODE,
    instanceName: environment.CASELOG_INSTANCE_NAME,
    registrationMode: environment.CASELOG_REGISTRATION_MODE,
    workspaceCreationEnabled: environment.CASELOG_WORKSPACE_CREATION_ENABLED,
    managedBillingEnabled: environment.CASELOG_MANAGED_BILLING_ENABLED,
  });
}
