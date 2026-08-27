import type { ReadinessWaiver } from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';
import { readinessWaiverStatus } from '../../domain/policies/readiness-waiver.policy';

export const READINESS_WAIVER_SELECTION = {
  id: true,
  decisionId: true,
  scope: true,
  gateEvaluationId: true,
  reason: true,
  externalApprovalReference: true,
  expiresAt: true,
  createdById: true,
  createdAt: true,
  revocation: {
    select: {
      id: true,
      reason: true,
      revokedById: true,
      revokedAt: true,
    },
  },
} satisfies Prisma.ReadinessWaiverSelect;

export type ReadinessWaiverRecord = Prisma.ReadinessWaiverGetPayload<{
  select: typeof READINESS_WAIVER_SELECTION;
}>;

export function toReadinessWaiver(record: ReadinessWaiverRecord, at: Date): ReadinessWaiver {
  return {
    id: record.id,
    decisionId: record.decisionId,
    scope:
      record.scope === 'DECISION'
        ? { type: 'decision' }
        : {
            type: 'gate_evaluation',
            gateEvaluationId: requiredGateEvaluationId(record.gateEvaluationId),
          },
    reason: record.reason,
    externalApprovalReference: record.externalApprovalReference,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    status: readinessWaiverStatus(
      { expiresAt: record.expiresAt, revokedAt: record.revocation?.revokedAt ?? null },
      at,
    ),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    revocation: record.revocation
      ? {
          id: record.revocation.id,
          reason: record.revocation.reason,
          revokedById: record.revocation.revokedById,
          revokedAt: record.revocation.revokedAt.toISOString(),
        }
      : null,
  };
}

function requiredGateEvaluationId(value: string | null): string {
  if (!value) throw new Error('A gate-scoped readiness waiver has no gate evaluation');
  return value;
}
