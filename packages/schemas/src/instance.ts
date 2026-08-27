import { z } from 'zod';

export const deploymentModeSchema = z.enum(['self_hosted', 'managed']);
export const registrationModeSchema = z.enum(['public', 'invitation_only']);

export const instanceCapabilitiesSchema = z
  .object({
    deployment: deploymentModeSchema,
    instanceName: z.string().trim().min(1).max(120),
    registrationMode: registrationModeSchema,
    workspaceCreationEnabled: z.boolean(),
    managedBillingEnabled: z.boolean(),
  })
  .refine(({ deployment, managedBillingEnabled }) => {
    return deployment === 'managed' || !managedBillingEnabled;
  }, 'Managed billing cannot be enabled for a self-hosted deployment');

export type DeploymentMode = z.infer<typeof deploymentModeSchema>;
export type RegistrationMode = z.infer<typeof registrationModeSchema>;
export type InstanceCapabilities = z.infer<typeof instanceCapabilitiesSchema>;
