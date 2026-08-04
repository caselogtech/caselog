import { organizationIdSchema, projectSlugSchema } from '@caselog/schemas';
import { z } from 'zod';

export const RUN_PROGRESS_PROJECTION = 'run_progress';

export const runProgressRefreshJobSchema = z.object({
  organizationId: organizationIdSchema,
  projectSlug: projectSlugSchema,
  runId: z.uuid(),
});

export type RunProgressRefreshJob = z.infer<typeof runProgressRefreshJobSchema>;
