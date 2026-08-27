import type { ReadinessWaiverResponse } from '@caselog/schemas';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import { hydrateReadinessDecisions } from './readiness-decision-hydration.persistence';
import {
  READINESS_DECISION_SCALAR_SELECTION,
  toReadinessDecision,
} from './readiness-decision.persistence';

export type ReadinessWaiverDecisionContextResult =
  | { kind: 'found'; projectId: string; candidateId: string }
  | { kind: 'project_not_found' | 'decision_not_found' };

export async function loadReadinessWaiverDecisionContext(
  transaction: TenantTransaction,
  organizationId: string,
  projectSlug: string,
  decisionId: string,
): Promise<ReadinessWaiverDecisionContextResult> {
  const project = await transaction.project.findUnique({
    where: { organizationId_slug: { organizationId, slug: projectSlug }, deletedAt: null },
    select: { id: true },
  });
  if (!project) return { kind: 'project_not_found' };
  const decision = await transaction.readinessDecision.findFirst({
    where: { id: decisionId, projectId: project.id },
    select: { candidateId: true },
  });
  return decision
    ? { kind: 'found', projectId: project.id, candidateId: decision.candidateId }
    : { kind: 'decision_not_found' };
}

export async function lockReadinessWaiverTarget(
  transaction: TenantTransaction,
  organizationId: string,
  decisionId: string,
  gateEvaluationId: string | null,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`readiness-waiver:${organizationId}:${decisionId}:${gateEvaluationId ?? 'decision'}`}, 0)
    )
  `;
}

export async function lockReadinessWaiver(
  transaction: TenantTransaction,
  organizationId: string,
  waiverId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`readiness-waiver:${organizationId}:${waiverId}`}, 0)
    )
  `;
}

export async function loadReadinessWaiverResponse(
  transaction: TenantTransaction,
  organizationId: string,
  decisionId: string,
  waiverId: string,
  at: Date,
): Promise<ReadinessWaiverResponse> {
  const decision = await transaction.readinessDecision.findUniqueOrThrow({
    where: { organizationId_id: { organizationId, id: decisionId } },
    select: READINESS_DECISION_SCALAR_SELECTION,
  });
  const [hydrated] = await hydrateReadinessDecisions(transaction, [decision]);
  if (!hydrated) throw new Error(`Readiness decision ${decisionId} disappeared`);
  const response = toReadinessDecision(hydrated, at);
  const waiver = response.waivers.find(({ id }) => id === waiverId);
  if (!waiver) throw new Error(`Readiness waiver ${waiverId} disappeared`);
  return { waiver, effectiveDisposition: response.effectiveDisposition };
}
