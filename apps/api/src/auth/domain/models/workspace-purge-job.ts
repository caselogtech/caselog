import { z } from 'zod';

export const workspacePurgeJobSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('organization'), organizationId: z.uuid() }),
]);

export type WorkspacePurgeJob = z.infer<typeof workspacePurgeJobSchema>;
