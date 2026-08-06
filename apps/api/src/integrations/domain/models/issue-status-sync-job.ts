import { z } from 'zod';

export const issueStatusSyncJobSchema = z.object({
  organizationId: z.uuid(),
  connectionId: z.uuid(),
});

export type IssueStatusSyncJob = z.infer<typeof issueStatusSyncJobSchema>;
