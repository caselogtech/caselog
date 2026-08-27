import type { ReleaseReadinessSummary } from '@caselog/schemas';
import type { Prisma } from '../../../generated/prisma/client';
import { effectiveReadinessDisposition } from '../../domain/policies/readiness-waiver.policy';

export const RELEASE_READINESS_SUMMARY_SELECTION = {
  candidateId: true,
  targetEvidenceRevision: true,
  targetEvaluatorVersion: true,
  state: true,
  failureCode: true,
  assignment: {
    select: {
      policy: { select: { id: true, key: true, name: true } },
      policyVersion: { select: { version: true } },
    },
  },
  decision: {
    select: {
      id: true,
      status: true,
      evidenceRevision: true,
      evaluatorVersion: true,
      evaluatedAt: true,
      gateEvaluations: { select: { id: true, result: true } },
      waivers: {
        select: {
          scope: true,
          gateEvaluationId: true,
          expiresAt: true,
          revocation: { select: { revokedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.CurrentReadinessDecisionSelect;

export type ReleaseReadinessSummaryRecord = Prisma.CurrentReadinessDecisionGetPayload<{
  select: typeof RELEASE_READINESS_SUMMARY_SELECTION;
}>;

export function toReleaseReadinessSummary(
  record: ReleaseReadinessSummaryRecord,
  currentEvidenceRevision: number,
  at = new Date(),
): ReleaseReadinessSummary {
  const decision = record.decision;
  const state =
    record.state !== 'FAILED' && decision && decision.evidenceRevision < currentEvidenceRevision
      ? ('stale' as const)
      : (record.state.toLowerCase() as ReleaseReadinessSummary['state']);
  return {
    state,
    decisionId: decision?.id ?? null,
    computedStatus:
      (decision?.status.toLowerCase() as ReleaseReadinessSummary['computedStatus']) ?? null,
    effectiveDisposition: decision
      ? effectiveReadinessDisposition({
          computedStatus: decision.status,
          gates: decision.gateEvaluations,
          waivers: decision.waivers.map((waiver) => ({
            scope: waiver.scope,
            gateEvaluationId: waiver.gateEvaluationId,
            expiresAt: waiver.expiresAt,
            revokedAt: waiver.revocation?.revokedAt ?? null,
          })),
          at,
        })
      : null,
    policy: {
      ...record.assignment.policy,
      version: record.assignment.policyVersion.version,
    },
    evidenceRevision: decision?.evidenceRevision ?? null,
    targetEvidenceRevision: Math.max(record.targetEvidenceRevision, currentEvidenceRevision),
    currentEvidenceRevision,
    evaluatorVersion: decision?.evaluatorVersion ?? record.targetEvaluatorVersion,
    evaluatedAt: decision?.evaluatedAt.toISOString() ?? null,
    failureCode: record.failureCode,
  };
}
