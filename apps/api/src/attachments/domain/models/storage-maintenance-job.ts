import { z } from 'zod';

export const storageMaintenanceJobSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('organization'), organizationId: z.uuid() }),
]);

export type StorageMaintenanceJob = z.infer<typeof storageMaintenanceJobSchema>;
