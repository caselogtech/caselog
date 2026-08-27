import { z } from 'zod';
import { READINESS_EVALUATOR_VERSION } from '../policies/readiness-evaluator';

export const readinessEvaluationJobSchema = z.object({
  organizationId: z.uuid(),
  candidateId: z.uuid(),
  assignmentId: z.uuid(),
  evidenceRevision: z.number().int().nonnegative(),
  evaluatorVersion: z.literal(READINESS_EVALUATOR_VERSION),
  trigger: z.enum(['EVIDENCE_CHANGED', 'POLICY_ASSIGNED', 'RECONCILIATION']),
});

export const readinessReconciliationJobSchema = z.object({}).strict();

export type ReadinessEvaluationJob = z.infer<typeof readinessEvaluationJobSchema>;
export type ReadinessReconciliationJob = z.infer<typeof readinessReconciliationJobSchema>;
