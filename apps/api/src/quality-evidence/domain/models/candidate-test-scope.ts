import { z } from 'zod';
import { testCasePrioritySchema } from '@caselog/schemas';

export const candidateTestScopeSchema = z.object({
  capturedAt: z.iso.datetime(),
  cases: z
    .array(z.object({ caseId: z.uuid(), versionId: z.uuid(), priority: testCasePrioritySchema }))
    .max(20_000),
});
export type CandidateTestScope = z.infer<typeof candidateTestScopeSchema>;
