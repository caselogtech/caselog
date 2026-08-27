import { z } from 'zod';
import { projectSlugSchema } from './project.js';
import { releaseListQuerySchema, releaseSummarySchema } from './release.js';

export const readinessMetricKeySchema = z.enum([
  'test.pass_rate',
  'test.completion_rate',
  'test.failed_count',
]);
export const readinessOperatorSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
export const readinessGateImpactSchema = z.enum(['warning', 'blocking']);
export const readinessEvidenceBehaviorSchema = z.enum(['unknown', 'warn', 'block']);
export const readinessMinimumTrustSchema = z.enum(['verified', 'authenticated', 'unverified']);
export const readinessPolicyVersionStateSchema = z.enum(['draft', 'published', 'retired']);
export const readinessTestRunRoleSchema = z.enum(['required', 'informational']);
export const gateEvaluationResultSchema = z.enum(['passed', 'warning', 'failed', 'unknown']);
export const gateEvaluationDiagnosticSchema = z.enum([
  'none',
  'missing',
  'incomplete',
  'stale',
  'untrusted',
]);
export const gateEvaluationExplanationCodeSchema = z.enum([
  'comparison_passed',
  'comparison_failed',
  'missing_evidence',
  'incomplete_evidence',
  'stale_evidence',
  'untrusted_evidence',
]);
export const readinessDecisionStatusSchema = z.enum(['ready', 'at_risk', 'blocked', 'unknown']);
export const readinessEffectiveDispositionSchema = z.enum([
  'ready',
  'at_risk',
  'blocked',
  'unknown',
  'approved_with_waiver',
]);
export const readinessWaiverStatusSchema = z.enum(['active', 'expired', 'revoked']);
export const readinessEvaluationTriggerSchema = z.enum([
  'manual',
  'evidence_changed',
  'policy_assigned',
  'reconciliation',
]);
export const readinessProjectionStateSchema = z.enum(['pending', 'current', 'stale', 'failed']);

const percentageExpectedSchema = z.object({
  type: z.literal('percentage'),
  value: z
    .string()
    .regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,9})?$/)
    .refine((value) => Number(value) <= 100, { message: 'Percentage cannot exceed 100' }),
});
const integerExpectedSchema = z.object({
  type: z.literal('integer'),
  value: z.number().int().safe().nonnegative(),
});
export const readinessExpectedValueSchema = z.discriminatedUnion('type', [
  percentageExpectedSchema,
  integerExpectedSchema,
]);

export const readinessGateInputSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9_.-]{1,49}$/),
    metricKey: readinessMetricKeySchema,
    metricVersion: z.literal('1.0.0'),
    dimensions: z.object({ testRunRole: readinessTestRunRoleSchema }).strict(),
    operator: readinessOperatorSchema,
    expected: readinessExpectedValueSchema,
    impact: readinessGateImpactSchema,
    missingEvidenceBehavior: readinessEvidenceBehaviorSchema.default('unknown'),
    staleEvidenceBehavior: readinessEvidenceBehaviorSchema.default('unknown'),
    minimumTrust: readinessMinimumTrustSchema.default('authenticated'),
  })
  .strict()
  .superRefine((gate, context) => {
    const expectedType =
      gate.metricKey === 'test.failed_count' ? ('integer' as const) : ('percentage' as const);
    if (gate.expected.type !== expectedType) {
      context.addIssue({
        code: 'custom',
        path: ['expected', 'type'],
        message: `${gate.metricKey} requires a ${expectedType} value`,
      });
    }
  });

export const readinessPolicyGatesSchema = z
  .array(readinessGateInputSchema)
  .min(1)
  .max(50)
  .refine((gates) => new Set(gates.map(({ key }) => key)).size === gates.length, {
    message: 'Gate keys must be unique',
  });

export const createReadinessPolicyRequestSchema = z
  .object({
    key: z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z][a-z0-9-]{1,49}$/),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2_000).nullable().default(null),
    gates: readinessPolicyGatesSchema,
  })
  .strict();

export const createReadinessPolicyVersionRequestSchema = z
  .object({ gates: readinessPolicyGatesSchema })
  .strict();

export const readinessPolicyProjectParamsSchema = z.object({ projectSlug: projectSlugSchema });
export const readinessPolicyParamsSchema = readinessPolicyProjectParamsSchema.extend({
  policyId: z.uuid(),
});
export const readinessPolicyListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const readinessPolicyWriteHeadersSchema = z.object({
  'idempotency-key': z
    .string()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/),
});
export const readinessWaiverWriteHeadersSchema = readinessPolicyWriteHeadersSchema;
export const candidateReadinessParamsSchema = z.object({
  projectSlug: projectSlugSchema,
  candidateId: z.uuid(),
});
export const readinessDecisionParamsSchema = z.object({
  projectSlug: projectSlugSchema,
  decisionId: z.uuid(),
});
export const readinessWaiverParamsSchema = readinessDecisionParamsSchema.extend({
  waiverId: z.uuid(),
});
export const readinessDecisionListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const assignCandidatePolicyRequestSchema = z.object({ policyId: z.uuid() }).strict();
export const readinessWaiverScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('decision') }).strict(),
  z.object({ type: z.literal('gate_evaluation'), gateEvaluationId: z.uuid() }).strict(),
]);
export const createReadinessWaiverRequestSchema = z
  .object({
    scope: readinessWaiverScopeSchema,
    reason: z.string().trim().min(1).max(2_000),
    expiresAt: z.iso.datetime().nullable().default(null),
    externalApprovalReference: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .strict();
export const revokeReadinessWaiverRequestSchema = z
  .object({ reason: z.string().trim().min(1).max(1_000) })
  .strict();
export const readinessWaiverListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const readinessGateSchema = readinessGateInputSchema.safeExtend({
  id: z.uuid(),
  position: z.number().int().nonnegative(),
});
export const readinessPolicyVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  state: readinessPolicyVersionStateSchema,
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
  retiredAt: z.iso.datetime().nullable(),
  gates: z.array(readinessGateSchema),
});
export const readinessPolicySchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  versions: z.array(readinessPolicyVersionSchema),
});
export const readinessPolicyResponseSchema = z.object({ policy: readinessPolicySchema });
export const readinessPolicyVersionSummarySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  state: readinessPolicyVersionStateSchema,
  gateCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  publishedAt: z.iso.datetime().nullable(),
});
export const readinessPolicySummarySchema = readinessPolicySchema
  .pick({
    id: true,
    projectId: true,
    key: true,
    name: true,
    description: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    draftVersion: readinessPolicyVersionSummarySchema.nullable(),
    publishedVersion: readinessPolicyVersionSummarySchema.nullable(),
  });
export const readinessPolicyListResponseSchema = z.object({
  items: z.array(readinessPolicySummarySchema),
  nextCursor: z.uuid().nullable(),
});

export const releaseReadinessListQuerySchema = releaseListQuerySchema;
export const releaseReadinessCandidateSummarySchema = z.object({
  id: z.uuid(),
  releaseId: z.uuid(),
  sequence: z.number().int().positive(),
  label: z.string().regex(/^RC-[1-9]\d*$/),
  createdAt: z.iso.datetime(),
});
export const releaseReadinessSummarySchema = z.object({
  state: readinessProjectionStateSchema,
  decisionId: z.uuid().nullable(),
  computedStatus: readinessDecisionStatusSchema.nullable(),
  effectiveDisposition: readinessEffectiveDispositionSchema.nullable(),
  policy: z.object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
  }),
  evidenceRevision: z.number().int().nonnegative().nullable(),
  targetEvidenceRevision: z.number().int().nonnegative(),
  currentEvidenceRevision: z.number().int().nonnegative(),
  evaluatorVersion: z.string(),
  evaluatedAt: z.iso.datetime().nullable(),
  failureCode: z.string().nullable(),
});
export const releaseReadinessListResponseSchema = z.object({
  items: z.array(
    z.object({
      release: releaseSummarySchema,
      latestCandidate: releaseReadinessCandidateSummarySchema.nullable(),
      readiness: releaseReadinessSummarySchema.nullable(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
});

export const candidatePolicyAssignmentSchema = z.object({
  id: z.uuid(),
  candidateId: z.uuid(),
  policy: z.object({
    id: z.uuid(),
    key: z.string(),
    name: z.string(),
  }),
  policyVersion: z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
  }),
  assignedAt: z.iso.datetime(),
});
export const candidatePolicyAssignmentResponseSchema = z.object({
  assignment: candidatePolicyAssignmentSchema,
});

export const gateEvaluationSchema = z.object({
  id: z.uuid(),
  gateId: z.uuid(),
  gateKey: z.string(),
  position: z.number().int().nonnegative(),
  result: gateEvaluationResultSchema,
  diagnostic: gateEvaluationDiagnosticSchema,
  metricKey: readinessMetricKeySchema,
  metricVersion: z.string(),
  dimensions: z.object({ testRunRole: readinessTestRunRoleSchema }),
  operator: readinessOperatorSchema,
  expected: readinessExpectedValueSchema,
  actual: readinessExpectedValueSchema.nullable(),
  selectedObservationId: z.uuid().nullable(),
  explanationCode: gateEvaluationExplanationCodeSchema,
});
export const readinessWaiverRevocationSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
  revokedById: z.uuid(),
  revokedAt: z.iso.datetime(),
});
export const readinessWaiverSchema = z.object({
  id: z.uuid(),
  decisionId: z.uuid(),
  scope: readinessWaiverScopeSchema,
  reason: z.string(),
  externalApprovalReference: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  status: readinessWaiverStatusSchema,
  createdById: z.uuid(),
  createdAt: z.iso.datetime(),
  revocation: readinessWaiverRevocationSchema.nullable(),
});
export const readinessDecisionSchema = z.object({
  id: z.uuid(),
  candidateId: z.uuid(),
  assignmentId: z.uuid(),
  policyVersion: z.object({ id: z.uuid(), version: z.number().int().positive() }),
  evidenceRevision: z.number().int().nonnegative(),
  evaluatorVersion: z.string(),
  trigger: readinessEvaluationTriggerSchema,
  status: readinessDecisionStatusSchema,
  effectiveDisposition: readinessEffectiveDispositionSchema,
  evaluatedAt: z.iso.datetime(),
  gates: z.array(gateEvaluationSchema),
  waivers: z.array(readinessWaiverSchema),
});
export const candidateReadinessResponseSchema = z.object({
  candidateId: z.uuid(),
  assignment: candidatePolicyAssignmentSchema,
  state: readinessProjectionStateSchema,
  targetEvidenceRevision: z.number().int().nonnegative(),
  targetEvaluatorVersion: z.string(),
  currentEvidenceRevision: z.number().int().nonnegative(),
  failureCode: z.string().nullable(),
  decision: readinessDecisionSchema.nullable(),
});
export const readinessDecisionResponseSchema = z.object({ decision: readinessDecisionSchema });
export const readinessDecisionListResponseSchema = z.object({
  items: z.array(readinessDecisionSchema),
  nextCursor: z.uuid().nullable(),
});
export const readinessWaiverResponseSchema = z.object({
  waiver: readinessWaiverSchema,
  effectiveDisposition: readinessEffectiveDispositionSchema,
});
export const readinessWaiverListResponseSchema = z.object({
  items: z.array(readinessWaiverSchema),
  nextCursor: z.uuid().nullable(),
});

export type ReadinessGateInput = z.infer<typeof readinessGateInputSchema>;
export type CreateReadinessPolicyRequest = z.infer<typeof createReadinessPolicyRequestSchema>;
export type CreateReadinessPolicyVersionRequest = z.infer<
  typeof createReadinessPolicyVersionRequestSchema
>;
export type ReadinessPolicy = z.infer<typeof readinessPolicySchema>;
export type ReadinessPolicyResponse = z.infer<typeof readinessPolicyResponseSchema>;
export type ReadinessPolicyListQuery = z.infer<typeof readinessPolicyListQuerySchema>;
export type ReadinessPolicySummary = z.infer<typeof readinessPolicySummarySchema>;
export type ReadinessPolicyListResponse = z.infer<typeof readinessPolicyListResponseSchema>;
export type ReleaseReadinessListQuery = z.infer<typeof releaseReadinessListQuerySchema>;
export type ReleaseReadinessCandidateSummary = z.infer<
  typeof releaseReadinessCandidateSummarySchema
>;
export type ReleaseReadinessSummary = z.infer<typeof releaseReadinessSummarySchema>;
export type ReleaseReadinessListResponse = z.infer<typeof releaseReadinessListResponseSchema>;
export type AssignCandidatePolicyRequest = z.infer<typeof assignCandidatePolicyRequestSchema>;
export type CandidatePolicyAssignment = z.infer<typeof candidatePolicyAssignmentSchema>;
export type CandidatePolicyAssignmentResponse = z.infer<
  typeof candidatePolicyAssignmentResponseSchema
>;
export type GateEvaluation = z.infer<typeof gateEvaluationSchema>;
export type GateEvaluationExplanationCode = z.infer<typeof gateEvaluationExplanationCodeSchema>;
export type ReadinessDecision = z.infer<typeof readinessDecisionSchema>;
export type CandidateReadinessResponse = z.infer<typeof candidateReadinessResponseSchema>;
export type ReadinessDecisionListQuery = z.infer<typeof readinessDecisionListQuerySchema>;
export type ReadinessDecisionResponse = z.infer<typeof readinessDecisionResponseSchema>;
export type ReadinessDecisionListResponse = z.infer<typeof readinessDecisionListResponseSchema>;
export type ReadinessEffectiveDisposition = z.infer<typeof readinessEffectiveDispositionSchema>;
export type ReadinessWaiverScope = z.infer<typeof readinessWaiverScopeSchema>;
export type CreateReadinessWaiverRequest = z.infer<typeof createReadinessWaiverRequestSchema>;
export type RevokeReadinessWaiverRequest = z.infer<typeof revokeReadinessWaiverRequestSchema>;
export type ReadinessWaiver = z.infer<typeof readinessWaiverSchema>;
export type ReadinessWaiverResponse = z.infer<typeof readinessWaiverResponseSchema>;
export type ReadinessWaiverListQuery = z.infer<typeof readinessWaiverListQuerySchema>;
export type ReadinessWaiverListResponse = z.infer<typeof readinessWaiverListResponseSchema>;
