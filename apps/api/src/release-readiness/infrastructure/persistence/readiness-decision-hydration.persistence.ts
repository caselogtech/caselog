import type { CandidatePolicyAssignment } from '@caselog/schemas';
import type { TenantTransaction } from '../../../core/database/application/services/tenant-database.service';
import {
  GATE_EVALUATION_SCALAR_SELECTION,
  type CurrentReadinessRecord,
  type HydratedReadinessDecisionRecord,
  READINESS_DECISION_SCALAR_SELECTION,
  type ReadinessDecisionScalarRecord,
} from './readiness-decision.persistence';
import { READINESS_WAIVER_SELECTION } from './readiness-waiver.persistence';

export async function loadReadinessAssignment(
  transaction: TenantTransaction,
  organizationId: string,
  assignmentId: string,
): Promise<CandidatePolicyAssignment | null> {
  const assignment = await transaction.candidatePolicyAssignment.findUnique({
    where: { organizationId_id: { organizationId, id: assignmentId } },
    select: {
      id: true,
      candidateId: true,
      policyId: true,
      policyVersionId: true,
      assignedAt: true,
    },
  });
  if (!assignment) return null;
  const policy = await transaction.releasePolicy.findUnique({
    where: { organizationId_id: { organizationId, id: assignment.policyId } },
    select: { id: true, key: true, name: true },
  });
  const version = await transaction.releasePolicyVersion.findUnique({
    where: { organizationId_id: { organizationId, id: assignment.policyVersionId } },
    select: { id: true, version: true },
  });
  if (!policy || !version) return null;
  return {
    id: assignment.id,
    candidateId: assignment.candidateId,
    policy,
    policyVersion: version,
    assignedAt: assignment.assignedAt.toISOString(),
  };
}

export async function hydrateReadinessDecisions(
  transaction: TenantTransaction,
  decisions: ReadinessDecisionScalarRecord[],
): Promise<HydratedReadinessDecisionRecord[]> {
  if (decisions.length === 0) return [];
  const policyVersionIds = [...new Set(decisions.map(({ policyVersionId }) => policyVersionId))];
  const versions = await transaction.releasePolicyVersion.findMany({
    where: { id: { in: policyVersionIds } },
    select: {
      id: true,
      version: true,
      policy: { select: { id: true, key: true, name: true } },
    },
  });
  const evaluations = await transaction.gateEvaluation.findMany({
    where: { decisionId: { in: decisions.map(({ id }) => id) } },
    orderBy: [{ decisionId: 'asc' }, { position: 'asc' }],
    select: GATE_EVALUATION_SCALAR_SELECTION,
  });
  const gates = await transaction.readinessGate.findMany({
    where: { id: { in: [...new Set(evaluations.map(({ gateId }) => gateId))] } },
    select: { id: true, key: true, impact: true },
  });
  const waivers = await transaction.readinessWaiver.findMany({
    where: { decisionId: { in: decisions.map(({ id }) => id) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: READINESS_WAIVER_SELECTION,
  });
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const gateById = new Map(gates.map((gate) => [gate.id, gate]));
  return decisions.map((decision) => {
    const policyVersion = versionById.get(decision.policyVersionId);
    if (!policyVersion) throw new Error(`Policy version ${decision.policyVersionId} disappeared`);
    return {
      ...decision,
      policyVersion,
      gateEvaluations: evaluations
        .filter(({ decisionId }) => decisionId === decision.id)
        .map((evaluation) => {
          const gate = gateById.get(evaluation.gateId);
          if (!gate) throw new Error(`Readiness gate ${evaluation.gateId} disappeared`);
          return { ...evaluation, gateKey: gate.key, impact: gate.impact };
        }),
      waivers: waivers.filter(({ decisionId }) => decisionId === decision.id),
    };
  });
}

export async function loadCurrentReadiness(
  transaction: TenantTransaction,
  organizationId: string,
  candidateId: string,
): Promise<CurrentReadinessRecord | null> {
  const projection = await transaction.currentReadinessDecision.findUnique({
    where: { organizationId_candidateId: { organizationId, candidateId } },
    select: {
      assignmentId: true,
      decisionId: true,
      targetEvidenceRevision: true,
      targetEvaluatorVersion: true,
      state: true,
      failureCode: true,
    },
  });
  if (!projection) return null;
  const assignment = await loadReadinessAssignment(
    transaction,
    organizationId,
    projection.assignmentId,
  );
  if (!assignment) return null;
  const decisionRecord = projection.decisionId
    ? await transaction.readinessDecision.findUnique({
        where: { organizationId_id: { organizationId, id: projection.decisionId } },
        select: READINESS_DECISION_SCALAR_SELECTION,
      })
    : null;
  const [decision] = decisionRecord
    ? await hydrateReadinessDecisions(transaction, [decisionRecord])
    : [];
  return {
    targetEvidenceRevision: projection.targetEvidenceRevision,
    targetEvaluatorVersion: projection.targetEvaluatorVersion,
    state: projection.state,
    failureCode: projection.failureCode,
    assignment,
    decision: decision ?? null,
  };
}
